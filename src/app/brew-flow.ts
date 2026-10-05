/**
 * The brew flow (T1.18; spec v2 "Brew phases", "Manual start", "Live display", "Grading"): one
 * extraction on a link, from the cup to the saved shot. There is one per link, made on first use
 * and kept (`BrewFlows`), so an open shot card outlives the screen. The screen attaches it while
 * it is shown, and only then does it act:
 *
 * - **The scale's commands** (D-066): for each of the live shot's events, what
 *   `scaleCommandsFor` says, in order: the cup's tare (`05`, `06`, `01`), the timer's stop at
 *   "shot done" (`05`), its stop and reset after a tap that lapsed. The probe never attaches,
 *   so a cup put on there isn't tared behind the user's back.
 * - **The manual start** (Q4, D-048): the Tare + start tap made with the pump, logged as the UI
 *   action `manual-start`, then `07` with the same reason. The live shot reads the tap off the
 *   log, as the analysis does.
 * - **The target**: the dose × the recipe's coffee ratio (`BrewPreferences`), set on the live
 *   shot whenever either changes.
 * - **"Shot done"**: the live shot is stored at once, anchored at that moment, inside its shot
 *   (D-047), with what the brew used: the dose, the recipe and the default tags. Then the
 *   recording so far is stored and analysed, and analysed again as the tail settles (T1.16: cut
 *   1 s after the pump stops, the recording gives pump_off; from 3 s, the yield too). The shot
 *   card shows the latest result.
 * - **The grades** are stored as they are tapped, so nothing tapped is lost. Save stores them
 *   all, the channelling as `false` when it was left off, and closes the card. A shot that is
 *   never saved keeps what was tapped, the rest null (spec v2 "Grading").
 *
 * Everything the screen shows live comes from the live shot (display-only, hard rule 3); the
 * card's results come from the analysis.
 */

import {
  scaleCommandsFor,
  yieldTargetG,
  type ShotDisplay,
  type ShotMonitorEvent,
} from '../core/live';
import {
  createShot,
  MANUAL_START,
  updateShot,
  type Direction,
  type Id,
  type Shot,
  type ShotMetadata,
} from '../core/model';
import { tareAndStartTimer, type ScaleCommand } from '../core/protocol';
import type { ShotRepository, Timers } from '../storage';
import { Emitter, type Unsubscribe } from '../transport/emitter';
import type { AnalysisRunner, ShotResult } from './analysis-runner';
import { defaultTagNames, sameTag, type BrewPreferences, type BrewSettings } from './brew-settings';
import type { ScaleLink, WakeLockLike } from './links';

/** When to analyse again after "shot done", ms: as the tail settles, then once it has. */
export const REANALYSE_AFTER_MS: readonly number[] = [3000, 10_000];

/** The shot card (spec v2 "Brew phases": the hub), from "shot done" until it is saved. */
export interface ShotCard {
  /** The shot as the card holds it: stored, or being stored. Its grades are the card's. */
  readonly shot: Shot;
  /** The live display at "shot done": its series draws the card's chart. */
  readonly display: ShotDisplay;
  /** When the shot's recording started, epoch ms: with the anchor, the shot's time. */
  readonly recordingStartedAtEpochMs: number | null;
  /** The shot's segment and ratio from the latest analysis; null before the first. */
  readonly result: ShotResult | null;
  /** An analysis is running or due. */
  readonly analysing: boolean;
  /** Why the latest analysis failed, or null. */
  readonly analysisError: string | null;
  /** Weight frames were refused (D-005, D-014), so the results miss some weights. */
  readonly refusedFrames: boolean;
  /** Why storing the shot or a grade failed, or null. */
  readonly storeError: string | null;
}

export interface BrewFlowState {
  readonly card: ShotCard | null;
  /** The last connection or command that failed, for the screen to say; null when none. */
  readonly error: string | null;
}

export interface BrewFlowOptions {
  readonly link: Pick<ScaleLink, 'transport' | 'recorder' | 'shot'>;
  readonly shots: Pick<ShotRepository, 'create' | 'update'>;
  readonly analysis: Pick<AnalysisRunner, 'analyze'>;
  readonly preferences: BrewPreferences;
  /** Called once a shot is created or edited: automatic export uploads its file again (T1.20). */
  readonly onShotsChanged?: () => void;
  /** Held from the connect tap: Safari grants it only during one. */
  readonly wakeLock?: WakeLockLike | null;
  /** Default: the global timers. Tests pass a `ManualClock`. */
  readonly timers?: Timers;
  /** The wall clock, for the shots' stamps. Default `Date.now`. */
  readonly epochNow?: () => number;
  /** Default `REANALYSE_AFTER_MS`. */
  readonly reanalyseAfterMs?: readonly number[];
}

const GLOBAL_TIMERS: Timers = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id as ReturnType<typeof globalThis.setTimeout>),
};

export class BrewFlow {
  readonly #link: BrewFlowOptions['link'];
  readonly #shots: BrewFlowOptions['shots'];
  readonly #analysis: BrewFlowOptions['analysis'];
  readonly #preferences: BrewPreferences;
  readonly #onShotsChanged: () => void;
  readonly #wakeLock: WakeLockLike | null;
  readonly #timers: Timers;
  readonly #epochNow: () => number;
  readonly #reanalyseAfterMs: readonly number[];
  readonly #changes = new Emitter<BrewFlowState>();
  #card: ShotCard | null = null;
  #error: string | null = null;
  #attached = 0;
  #detach: Unsubscribe | null = null;
  /** The re-analyses due for the open card. */
  #timersDue: unknown[] = [];
  /** Analyses one at a time: a re-analysis waits for the one running. */
  #analysing: Promise<void> = Promise.resolve();
  /** Grades stored in order: a later tap never lands before an earlier one. */
  #writing: Promise<unknown> = Promise.resolve();

  constructor(options: BrewFlowOptions) {
    this.#link = options.link;
    this.#shots = options.shots;
    this.#analysis = options.analysis;
    this.#preferences = options.preferences;
    this.#onShotsChanged = options.onShotsChanged ?? (() => {});
    this.#wakeLock = options.wakeLock ?? null;
    this.#timers = options.timers ?? GLOBAL_TIMERS;
    this.#epochNow = options.epochNow ?? (() => Date.now());
    this.#reanalyseAfterMs = options.reanalyseAfterMs ?? REANALYSE_AFTER_MS;
  }

  get state(): BrewFlowState {
    return { card: this.#card, error: this.#error };
  }

  /** Whether a screen has the flow attached, so that it answers the live shot. */
  get attached(): boolean {
    return this.#attached > 0;
  }

  /** Calls `listener` after every change of `state`. */
  onChange(listener: (state: BrewFlowState) => void): Unsubscribe {
    return this.#changes.on(listener);
  }

  /**
   * Starts answering the live shot: its events, and the target from the settings. Returns the
   * function that stops it. Attaching twice needs both detached.
   */
  attach(): Unsubscribe {
    this.#attached++;
    if (this.#attached === 1) {
      const offs = [
        this.#link.shot.onEvent((event) => this.#onShotEvent(event)),
        this.#preferences.onChange((settings) => this.#setTarget(settings)),
      ];
      this.#detach = () => offs.forEach((off) => off());
      this.#setTarget(this.#preferences.value);
    }
    let attached = true;
    return () => {
      if (!attached) return;
      attached = false;
      this.#attached--;
      if (this.#attached === 0) {
        this.#detach?.();
        this.#detach = null;
      }
    };
  }

  /**
   * Connects to the scale: call it straight from the tap, since the device chooser and the
   * screen wake lock both need the tap's user activation.
   */
  connect(start: () => Promise<unknown> = () => this.#link.transport.connect()): void {
    // First, with nothing before it: the chooser needs this tap's activation.
    const connecting = start();
    this.#wakeLock?.acquire();
    this.#setError(null);
    connecting.catch((error: unknown) => this.#setError(errorText(error)));
  }

  /**
   * The Tare + start tap, made as the pump starts (Q4, D-048): logged as a UI action, then `07`
   * with the same reason. It tares the scale and starts its timer, and never touches the
   * machine. Ignored when not recording.
   */
  start(): void {
    const recorder = this.#link.recorder;
    if (recorder.logUiAction(MANUAL_START) === null) return;
    this.#setError(null);
    this.#send(tareAndStartTimer(), MANUAL_START);
  }

  /** The taste, or null to clear it. Stored at once. */
  setTaste(direction: Direction | null): void {
    // A failure goes on the card: `storeError`.
    void this.#grade({ direction });
  }

  /** Channels or spurts. Stored at once. */
  setChannelled(channelled: boolean): void {
    void this.#grade({ channelled });
  }

  /** Turns a tag on or off for the card's shot. Stored at once. */
  toggleTag(name: string): void {
    const card = this.#card;
    if (card === null) return;
    const tags = card.shot.tags ?? [];
    const on = tags.some((tag) => sameTag(tag, name));
    void this.#grade({
      tags: on ? tags.filter((tag) => !sameTag(tag, name)) : this.#inListOrder([...tags, name]),
    });
  }

  /**
   * Adds a tag to the list, off by default for later shots, and turns it on for the card's
   * shot. Returns its name as kept, or null for an empty name.
   */
  addTag(text: string): string | null {
    const name = this.#preferences.addTag(text);
    const card = this.#card;
    if (name === null || card === null) return name;
    const tags = card.shot.tags ?? [];
    if (!tags.some((tag) => sameTag(tag, name))) {
      void this.#grade({ tags: this.#inListOrder([...tags, name]) });
    }
    return name;
  }

  /**
   * Saves the card's grades as they stand, the channelling as `false` when left off, and closes
   * the card. Resolves to whether they were stored; a card that couldn't be stored stays open
   * with its `storeError`.
   */
  async save(): Promise<boolean> {
    const card = this.#card;
    if (card === null) return true;
    const stored = await this.#grade({
      direction: card.shot.direction,
      channelled: card.shot.channelled ?? false,
      tags: card.shot.tags ?? [],
    });
    if (stored && this.#card?.shot.id === card.shot.id) {
      this.#closeCard();
      this.#emitChange();
    }
    return stored;
  }

  #setTarget(settings: BrewSettings): void {
    this.#link.shot.setTargetG(yieldTargetG(settings.doseG, settings.recipe.coffeeRatio));
  }

  #onShotEvent(event: ShotMonitorEvent): void {
    for (const { command, reason } of scaleCommandsFor(event)) this.#send(command, reason);
    if (event.type === 'shot-done') {
      this.#shotDone(event.tMs).catch((error: unknown) => this.#setError(errorText(error)));
    }
  }

  #send(command: ScaleCommand, reason: string): void {
    // The recorder logs it: command-sent, or command-failed with the error.
    this.#link.recorder
      .sendCommand(command, reason)
      .catch((error: unknown) => this.#setError(`${command.name}: ${errorText(error)}`));
  }

  /** "Shot done": stores the live shot, opens its card and analyses the recording so far. */
  async #shotDone(anchorTMs: number): Promise<void> {
    const display = this.#link.shot.snapshot();
    const recording = this.#link.recorder.recording;
    const recordingId = display.recordingId ?? recording?.id ?? null;
    if (recordingId === null) return;
    const settings = this.#preferences.value;
    const shot = createShot(
      {
        recordingId,
        anchorTMs,
        source: 'live',
        doseG: settings.doseG,
        targetRatio: settings.recipe.coffeeRatio,
        recipeName: settings.recipe.name,
        milkRatio: settings.recipe.milkRatio,
        tags: defaultTagNames(settings.tags),
      },
      this.#epochNow(),
    );
    this.#closeCard();
    this.#card = {
      shot,
      display,
      recordingStartedAtEpochMs: recording?.id === recordingId ? recording.startedAtEpochMs : null,
      result: null,
      analysing: true,
      analysisError: null,
      refusedFrames: display.refusedFrames > 0,
      storeError: null,
    };
    this.#emitChange();
    const created = this.#write(() => this.#shots.create(shot));
    if (!(await created)) {
      this.#updateCard(shot.id, { analysing: false });
      return;
    }
    this.#analyse(shot.id, recordingId);
    for (const ms of this.#reanalyseAfterMs) {
      const timer = this.#timers.setTimeout(() => {
        this.#timersDue = this.#timersDue.filter((due) => due !== timer);
        this.#analyse(shot.id, recordingId);
      }, ms);
      this.#timersDue.push(timer);
    }
  }

  /** Analyses the recording as it stands, after the one running, for the card of `shotId`. */
  #analyse(shotId: Id, recordingId: Id): void {
    const run = async (): Promise<void> => {
      if (this.#card?.shot.id !== shotId) return;
      this.#updateCard(shotId, { analysing: true });
      try {
        // What the recorder still holds goes into the analysis too.
        await this.#link.recorder.flush();
      } catch {
        // Storage failing shows in the recorder's warnings: analyse what is stored.
      }
      try {
        const results = await this.#analysis.analyze(recordingId);
        const result = results?.shots.find((entry) => entry.shot.id === shotId) ?? null;
        const flags = [...(results?.analysis.flags ?? []), ...(result?.segment?.flags ?? [])];
        this.#updateCard(shotId, {
          result,
          analysisError: null,
          refusedFrames: flags.includes('refused-frames'),
          recordingStartedAtEpochMs: results?.recording.startedAtEpochMs ?? null,
        });
      } catch (error) {
        this.#updateCard(shotId, { analysisError: errorText(error) });
      }
      this.#updateCard(shotId, { analysing: this.#timersDue.length > 0 });
    };
    this.#analysing = this.#analysing.then(run).catch((error: unknown) => {
      this.#updateCard(shotId, { analysing: false, analysisError: errorText(error) });
    });
  }

  /** Applies `changes` to the card's shot now, and stores them behind it. */
  #grade(changes: Partial<ShotMetadata>): Promise<boolean> {
    const card = this.#card;
    if (card === null) return Promise.resolve(false);
    const shot = updateShot(card.shot, changes, this.#epochNow());
    this.#updateCard(shot.id, { shot });
    return this.#write(() => this.#shots.update(shot.id, changes, this.#epochNow()), shot.id);
  }

  /**
   * Runs a write after the ones before it. Resolves to whether it stored; a failure goes on the
   * card of `shotId` (the open card when not given).
   */
  #write(write: () => Promise<unknown>, shotId = this.#card?.shot.id): Promise<boolean> {
    const done = this.#writing.then(write).then(
      () => {
        this.#onShotsChanged();
        if (shotId !== undefined) this.#updateCard(shotId, { storeError: null });
        return true;
      },
      (error: unknown) => {
        if (shotId !== undefined) this.#updateCard(shotId, { storeError: errorText(error) });
        return false;
      },
    );
    this.#writing = done;
    return done;
  }

  /** The tags in the list's order, those not in the list after them. */
  #inListOrder(tags: readonly string[]): string[] {
    const list = this.#preferences.value.tags.map((tag) => tag.name);
    const rank = (tag: string) => {
      const i = list.findIndex((name) => sameTag(name, tag));
      return i === -1 ? list.length : i;
    };
    return [...tags].sort((a, b) => rank(a) - rank(b));
  }

  #updateCard(shotId: Id, changes: Partial<ShotCard>): void {
    const card = this.#card;
    if (card === null || card.shot.id !== shotId) return;
    this.#card = { ...card, ...changes };
    this.#emitChange();
  }

  #closeCard(): void {
    for (const timer of this.#timersDue) this.#timers.clearTimeout(timer);
    this.#timersDue = [];
    this.#card = null;
  }

  #setError(error: string | null): void {
    if (error === this.#error) return;
    this.#error = error;
    this.#emitChange();
  }

  #emitChange(): void {
    this.#changes.emit(this.state);
  }
}

/** The brew flow of each link, made on first use and kept for the app's lifetime. */
export class BrewFlows {
  readonly #options: Omit<BrewFlowOptions, 'link'>;
  readonly #flows = new Map<string, BrewFlow>();

  constructor(options: Omit<BrewFlowOptions, 'link'>) {
    this.#options = options;
  }

  /** The settings every flow shares. */
  get preferences(): BrewPreferences {
    return this.#options.preferences;
  }

  get(link: ScaleLink): BrewFlow {
    const existing = this.#flows.get(link.key);
    if (existing) return existing;
    const flow = new BrewFlow({ ...this.#options, link });
    this.#flows.set(link.key, flow);
    return flow;
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
