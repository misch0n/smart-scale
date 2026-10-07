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
 *   (D-047), with what the brew used: the dose, the default tags, and the snapshot of its
 *   context (D-068), the recipe, machine and basket, grinder and pack as ids next to their
 *   values (T2.1), and the cup's container (T2.4): the one on the scale at the tap, else at the
 *   first drip, as recognised or picked (`link.vessel`). Then the recording so far is stored and analysed, and analysed again as the
 *   tail settles (T1.16: cut 1 s after the pump stops, the recording gives pump_off; from 3 s,
 *   the yield too). The shot card shows the latest result.
 * - **The grades** are stored as they are tapped, so nothing tapped is lost. Save stores them
 *   all, the channelling as `false` when it was left off, and closes the card. A shot that is
 *   never saved keeps what was tapped, the rest null (spec v2 "Grading").
 * - **✕ ends the brew** (T2.15) unless its card is open: the scale is reset (`05`, `06`, `01`,
 *   reason `end-session`), the live shot forgets a shot under way, and the next brew starts
 *   afresh, from what is on the scale when the screen is next shown.
 * - **The user's tares** (T2.20, Q33): at each phase's start and as the screen opens, the scale
 *   is tared when nothing is on it and it doesn't read 0, or when an empty vessel on it reads
 *   its own weight (`wantsTare`): `05`, `06`, `01`, reason `phase-tare`. Not while the shot
 *   pours, and not for the grind while the bean cup is off with its beans weighed. The cup's own
 *   tare isn't sent for a vessel carrying what its phase weighs (the bean cup back with its
 *   grounds), nor for a bean cup carrying beans or grounds in the beans or the grind (T2.23).
 *   One tare at a time: none within `TARE_SPACING_MS` of the last.
 *
 * Everything the screen shows live comes from the live shot (display-only, hard rule 3); the
 * card's results come from the analysis.
 */

import {
  DEFAULT_LIVE_PARAMS,
  endSessionCommands,
  HOLDS_NOTHING_G,
  PhaseRouter,
  phaseTareCommands,
  scaleCommandsFor,
  wantsTare,
  type ScaleCommandToSend,
  yieldTargetG,
  type PhaseRouterState,
  type PhaseStatus,
  type PhaseVessel,
  type ShotDisplay,
  type ShotMonitorEvent,
} from '../core/live';
import {
  createShot,
  isListed,
  MANUAL_START,
  PHASE_ACTION,
  shotSnapshot,
  updateShot,
  type BrewPhase,
  type Container,
  type Direction,
  type Id,
  type PhaseChange,
  type PhaseState,
  type Recipe,
  type Shot,
  type ShotMetadata,
} from '../core/model';
import { tareAndStartTimer, type ScaleCommand } from '../core/protocol';
import type { ShotRepository, Timers } from '../storage';
import { Emitter, type Unsubscribe } from '../transport/emitter';
import type { AnalysisRunner, ShotResult } from './analysis-runner';
import {
  defaultTagNames,
  sameTag,
  tagsInListOrder,
  toggledTag,
  type BrewPreferences,
  type BrewSettings,
} from './brew-settings';
import type { ScaleLink } from './links';
import type { VesselOnScale } from './live-vessel';

/** When to analyse again after "shot done", ms: as the tail settles, then once it has. */
export const REANALYSE_AFTER_MS: readonly number[] = [3000, 10_000];

/** No tare within this long of the last one, ms: the cup's and a phase's coincide (T2.20). */
export const TARE_SPACING_MS = 1000;

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
  /** The last command that failed, for the screen to say; null when none. */
  readonly error: string | null;
}

/** Where the extraction's dose comes from, live: the phases, else the basket or the setting. */
export interface LiveDose {
  readonly g: number;
  readonly source: 'ground' | 'beans' | 'basket' | 'set';
}

export interface BrewFlowOptions {
  readonly link: Pick<ScaleLink, 'transport' | 'recorder' | 'shot' | 'vessel'>;
  readonly shots: Pick<ShotRepository, 'create' | 'update'>;
  readonly analysis: Pick<AnalysisRunner, 'analyze'>;
  readonly preferences: BrewPreferences;
  /** Called once a shot is created or edited: automatic export uploads its file again (T1.20). */
  readonly onShotsChanged?: () => void;
  /** Default: the global timers. Tests pass a `ManualClock`. */
  readonly timers?: Timers;
  /** The wall clock, for the shots' stamps. Default `Date.now`. */
  readonly epochNow?: () => number;
  /** Default `REANALYSE_AFTER_MS`. */
  readonly reanalyseAfterMs?: readonly number[];
  /** The containers as they are now, for the phases (T2.5). Default none. */
  readonly containers?: () => readonly Container[];
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
  /** The container the shot pours into: on the scale at the tap, else at the first drip. */
  #cupContainerId: Id | null = null;
  readonly #containers: () => readonly Container[];
  /** The brew's phases (T2.5): a new router for each brew. */
  #router: PhaseRouter;
  /** The vessel the phases last saw, so each one is routed once. */
  #lastVessel: { readonly onMs: number; readonly containerId: Id | null } | null = null;
  /** The brew ended by its ✕: the next attach routes what is on the scale into the new one. */
  #routeOnAttach = false;
  /** When the flow last sent a tare, epoch ms; null before one (T2.20). */
  #lastTareMs: number | null = null;
  /** The live shot asked for the cup's tare in this frame: sent at its end (`#afterFrame`). */
  #cupTare: readonly ScaleCommandToSend[] | null = null;

  constructor(options: BrewFlowOptions) {
    this.#link = options.link;
    this.#shots = options.shots;
    this.#analysis = options.analysis;
    this.#preferences = options.preferences;
    this.#onShotsChanged = options.onShotsChanged ?? (() => {});
    this.#timers = options.timers ?? GLOBAL_TIMERS;
    this.#epochNow = options.epochNow ?? (() => Date.now());
    this.#reanalyseAfterMs = options.reanalyseAfterMs ?? REANALYSE_AFTER_MS;
    this.#containers = options.containers ?? (() => []);
    this.#router = this.#newRouter();
  }

  get state(): BrewFlowState {
    return { card: this.#card, error: this.#error };
  }

  /** The recipes with a milk ratio: the milk phase's picker (T2.11). */
  get milkRecipes(): readonly Recipe[] {
    return this.#preferences.value.recipes.filter((recipe) => recipe.milkRatio !== null);
  }

  /** The brew's phases, live (display-only): which is open, and what each weighs. */
  get phases(): PhaseRouterState {
    return this.#router.state;
  }

  /**
   * The extraction's dose, live (spec v2 "Brew phases": the targets): the grounds weighed, else
   * the beans, else the basket's size, else the dose set before the phases (T1.18).
   */
  get dose(): LiveDose {
    const { groundG, beansG } = this.#router.state;
    if (groundG !== null && groundG > 0) return { g: groundG, source: 'ground' };
    if (beansG !== null && beansG > 0) return { g: beansG, source: 'beans' };
    const { basket, doseG } = this.#preferences.value;
    return basket !== null ? { g: basket.sizeG, source: 'basket' } : { g: doseG, source: 'set' };
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
        this.#preferences.onChange((settings) => {
          this.#router.setMilkOffered(settings.recipe.milkRatio !== null);
          this.#setTarget();
        }),
        this.#link.vessel.onChange(() => this.#onVessel()),
        this.#link.recorder.onFrame(() => this.#afterFrame()),
      ];
      this.#detach = () => offs.forEach((off) => off());
      this.#router.setMilkOffered(this.#preferences.value.recipe.milkRatio !== null);
      if (this.#routeOnAttach) {
        this.#routeOnAttach = false;
        this.#lastVessel = null;
      }
      this.#onVessel();
      // An empty cup put down with Home showing has had no tare yet (session 4).
      this.#tareIfNeeded();
      this.#setTarget();
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

  /**
   * ✕ (T2.15): the brew ends, unless its shot card is open: the card stays, the brew's hub, until
   * it is saved. The scale is reset when connected: the timer stopped and zeroed and the scale
   * tared (`05`, `06`, `01`, logged with the reason `end-session`), whatever a Start with no shot
   * left running (session 3). The live shot forgets a shot under way: none is stored, and the
   * analysis finds it in the recording as any other. The next brew starts afresh: new phases,
   * which take what is on the scale as their first vessel when the screen is next shown.
   */
  end(): void {
    if (this.#card !== null) return;
    this.#setError(null);
    if (this.#link.transport.status.state === 'connected') {
      for (const { command, reason } of endSessionCommands()) this.#send(command, reason);
    }
    // The open phase ends here in the log, so the analysis measures it no further.
    this.#log(this.#router.end());
    this.#link.shot.startOver();
    this.#cupContainerId = null;
    this.#router = this.#newRouter();
    this.#routeOnAttach = true;
    this.#setTarget();
    this.#emitChange();
  }

  /** The user's tap on a phase: it opens, and the earlier ones end (T2.5). */
  selectPhase(phase: BrewPhase): void {
    this.#log(this.#router.select(phase));
    this.#setTarget();
    this.#emitChange();
  }

  /**
   * The milk is done (Done) or skipped (Skip milk): the card's shot records it, and the
   * recording is analysed again for what the jug held (T2.5).
   */
  endMilk(how: PhaseState): void {
    const changes = this.#router.endMilk(how);
    if (changes.length === 0) return;
    this.#log(changes);
    const card = this.#card;
    if (card !== null) {
      void this.#grade({ milkPhase: how });
      // The milk is read until the jug is lifted, so again as the pour settles.
      if (how === 'done') this.#analyseAsItSettles(card.shot.id, card.shot.recordingId);
      else this.#analyse(card.shot.id, card.shot.recordingId);
    }
    this.#emitChange();
  }

  /**
   * The milk phase's ratio, in place (T2.11): a milk drink's recipe becomes the default, and the
   * open card's shot takes its name and milk ratio (its coffee ratio was the extraction's).
   */
  setMilkRecipe(recipeId: Id): void {
    const recipe = this.#preferences.value.recipes.find((r) => r.id === recipeId);
    if (recipe === undefined || recipe.milkRatio === null) return;
    this.#preferences.setRecipe(recipe.id);
    const card = this.#card;
    if (card !== null && card.shot.recipeId !== recipe.id) {
      void this.#grade({
        recipeId: recipe.id,
        recipeName: recipe.name,
        milkRatio: recipe.milkRatio,
      });
    }
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
    void this.#grade({
      tags: toggledTag(this.#preferences.value.tags, card.shot.tags ?? [], name),
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
      void this.#grade({ tags: tagsInListOrder(this.#preferences.value.tags, [...tags, name]) });
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
    // A milk phase never begun is skipped (spec v2: skipped is recorded as skipped).
    const milk = this.#router.state;
    const milkPhase: PhaseState | null =
      card.shot.milkPhase ?? (milk.milkOffered && milk.status.milk !== 'done' ? 'skipped' : null);
    if (milkPhase === 'skipped' && card.shot.milkPhase === null) {
      this.#log(this.#router.endMilk('skipped'));
    }
    const stored = await this.#grade({
      direction: card.shot.direction,
      channelled: card.shot.channelled ?? false,
      tags: card.shot.tags ?? [],
      milkPhase,
    });
    if (stored && this.#card?.shot.id === card.shot.id) {
      this.#closeCard();
      // The next brew: its own phases. What is on the scale now (the last cup, full) is no part
      // of it: only a vessel put on from here is routed.
      this.#router = this.#newRouter();
      this.#setTarget();
      this.#emitChange();
    }
    return stored;
  }

  #newRouter(): PhaseRouter {
    // Start on the beans when there is a bean cup to put on, else on the extraction as before.
    const beanCup = this.#containers().some((c) => isListed(c) && c.roles.includes('bean'));
    return new PhaseRouter({
      start: beanCup ? 'beans' : 'extraction',
      milkOffered: this.#preferences.value.recipe.milkRatio !== null,
      containers: this.#containers,
    });
  }

  /** Routes a vessel put on, lifted, or recognised since. */
  #onVessel(): void {
    const onScale = this.#link.vessel.onScale;
    const previous = this.#lastVessel;
    if (onScale === null) {
      if (previous !== null) this.#router.vesselOff(this.#link.vessel.changedAtMs ?? 0);
      this.#lastVessel = null;
    } else {
      const key = { onMs: onScale.vessel.onMs, containerId: onScale.container?.id ?? null };
      if (
        previous === null ||
        previous.onMs !== key.onMs ||
        previous.containerId !== key.containerId
      ) {
        this.#log(this.#router.vesselOn(phaseVessel(onScale), onScale.vessel.onMs));
      }
      this.#lastVessel = key;
    }
    this.#setTarget();
    this.#emitChange();
  }

  /** What the vessel on holds now, for the open phase. */
  /**
   * After the live shot and the vessel monitor have each taken a frame (they listen first): what
   * the vessel holds, then the cup's tare if the live shot asked for one.
   */
  #afterFrame(): void {
    this.#measure();
    const cupTare = this.#cupTare;
    if (cupTare === null) return;
    this.#cupTare = null;
    // The bean cup back with its grounds is no empty cup: the scale shows the grounds (T2.20).
    // Nor is one carrying beans or grounds the phase hasn't taken for its own (T2.23).
    if (this.#phaseLoadG() >= HOLDS_NOTHING_G) return;
    const onScale = this.#link.vessel.onScale;
    if (onScale !== null && this.#router.carries(phaseVessel(onScale))) return;
    this.#tare(cupTare);
  }

  #measure(): void {
    const onScale = this.#link.vessel.onScale;
    this.#router.measure(onScale === null ? null : phaseVessel(onScale));
    this.#setTarget();
  }

  /** What the open phase weighs now, g: 0 for the extraction, or nothing yet. */
  #phaseLoadG(): number {
    const phases = this.#router.state;
    const load =
      phases.current === 'beans'
        ? phases.beansG
        : phases.current === 'grind'
          ? phases.groundG
          : phases.current === 'milk'
            ? phases.milkG
            : null;
    return load ?? 0;
  }

  /** Logs the phase changes in the recording (raw: what the app did), for the analysis. */
  #log(changes: readonly PhaseChange[]): void {
    for (const change of changes) {
      this.#link.recorder.logUiAction(PHASE_ACTION, { ...change });
    }
    // A phase's start: the user's tare (T2.20). Not as the pump starts; and a container put on
    // that the live shot takes for a cup gets the cup's own tare, at the frame's end.
    const opened = changes.find((change) => change.state === 'open');
    if (opened === undefined || opened.by === 'pump') return;
    const vesselG = this.#link.vessel.onScale?.vessel.massG ?? 0;
    if (opened.by === 'container' && vesselG >= DEFAULT_LIVE_PARAMS.cupMinG) return;
    this.#tareIfNeeded();
  }

  /**
   * The user's rule for taring (T2.20, Q33, D-096), at a phase's start and as the screen opens:
   * the scale is tared when nothing is on it and it doesn't read 0, or when an empty vessel on it
   * reads its own weight (`wantsTare`). Not while the shot pours. Not for the grind while the
   * bean cup is off with its beans weighed: tared with it at the beans, the scale shows the
   * grounds when it comes back.
   */
  #tareIfNeeded(): void {
    if (!this.attached || this.#link.transport.status.state !== 'connected') return;
    // The cup's own tare is on its way, at this frame's end.
    if (this.#cupTare !== null) return;
    const phases = this.#router.state;
    const live = this.#link.shot;
    if (phases.pouring || live.phase === 'running' || live.phase === 'tail') return;
    const onScale = this.#link.vessel.onScale;
    const beansWeighed = (phases.beansG ?? 0) >= HOLDS_NOTHING_G;
    if (onScale === null && phases.current === 'grind' && beansWeighed) return;
    const display = live.snapshot();
    const check = {
      readingG: display.readingG,
      stable: display.stable,
      vesselOn: onScale !== null,
      holdsG: Math.max(onScale?.contentsG ?? 0, this.#phaseLoadG()),
    };
    if (wantsTare(check, DEFAULT_LIVE_PARAMS.tareZeroG)) this.#tare(phaseTareCommands());
  }

  /** Sends a tare's commands, unless one went out within `TARE_SPACING_MS` (T2.20). */
  #tare(commands: readonly ScaleCommandToSend[]): void {
    const now = this.#epochNow();
    if (this.#lastTareMs !== null && now - this.#lastTareMs < TARE_SPACING_MS) return;
    this.#lastTareMs = now;
    for (const { command, reason } of commands) this.#send(command, reason);
  }

  #setTarget(): void {
    const settings: BrewSettings = this.#preferences.value;
    this.#link.shot.setTargetG(yieldTargetG(this.dose.g, settings.recipe.coffeeRatio));
  }

  #onShotEvent(event: ShotMonitorEvent): void {
    const commands = scaleCommandsFor(event);
    // The cup's tare waits for the frame's end, once the vessel is routed to its phase.
    if (event.type === 'tare') this.#cupTare = commands;
    else for (const { command, reason } of commands) this.#send(command, reason);
    if (event.type === 'pump-on' || event.type === 'pump-lapsed') {
      this.#cupContainerId = event.type === 'pump-on' ? this.#containerOnScale() : null;
    } else if (event.type === 'first-drip') {
      this.#cupContainerId ??= this.#containerOnScale();
    }
    if (event.type === 'pump-on') this.#log(this.#router.pumpOn());
    if (event.type === 'pump-lapsed') this.#router.pumpLapsed();
    if (event.type === 'shot-done') this.#log(this.#router.shotDone());
    if (event.type === 'shot-done') {
      this.#shotDone(event.tMs).catch((error: unknown) => this.#setError(errorText(error)));
    }
  }

  #containerOnScale(): Id | null {
    return this.#link.vessel.onScale?.container?.id ?? null;
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
    const containerId = this.#cupContainerId;
    this.#cupContainerId = null;
    const { status } = this.#router.state;
    const shot = createShot(
      {
        recordingId,
        anchorTMs,
        source: 'live',
        // The dose is the analysis's: the grounds or the beans it measures, else the basket.
        doseG: null,
        ...shotSnapshot(settings),
        containerId,
        beansPhase: phaseState(status.beans),
        grindPhase: phaseState(status.grind),
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
    this.#analyseAsItSettles(shot.id, recordingId);
  }

  /** Analyses now, and again as the weight settles (`reanalyseAfterMs`). */
  #analyseAsItSettles(shotId: Id, recordingId: Id): void {
    this.#analyse(shotId, recordingId);
    for (const ms of this.#reanalyseAfterMs) {
      const timer = this.#timers.setTimeout(() => {
        this.#timersDue = this.#timersDue.filter((due) => due !== timer);
        this.#analyse(shotId, recordingId);
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

/** A phase's state as the shot records it: done, or skipped (never begun counts). */
function phaseState(status: PhaseStatus): PhaseState {
  return status === 'done' ? 'done' : 'skipped';
}

function phaseVessel(onScale: VesselOnScale): PhaseVessel {
  return {
    massG: onScale.vessel.massG,
    contentsG: onScale.contentsG,
    container: onScale.container,
  };
}
