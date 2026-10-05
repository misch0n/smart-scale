/**
 * The history (T1.19; spec v2 "App structure and look": History): every shot worth listing,
 * newest first, each with its segment from the analysis, and the shot detail's grades.
 *
 * - **Post-hoc shots exist only for recordings the analysis has read** (D-047). The first load
 *   after a new `ANALYSIS_VERSION` runs `reanalyzeAll`, which clears the old versions' entries
 *   from the derived cache; the version it ran for is kept in `storage.local`. Every load then
 *   reads each recording's results, from the cache once analysed, so it adds the post-hoc shots
 *   of recordings that ended while the app wasn't watching. A recording that ends while it runs
 *   is analysed at once (`recordingsChanged`), so its post-hoc shots go out with the next
 *   automatic export.
 * - **What is listed** (`isListed`): every shot but the discarded ones (D-019), and but the
 *   post-hoc shots that match no segment and that nobody edited: they hold nothing the user
 *   entered (D-047). A live or manual shot without a segment stays, flagged (D-007). Segments
 *   no shot claims are pours, not shots.
 * - **When**: a shot's time is its recording's start plus its pump_on, else its first drip, else
 *   its anchor (the live shot's "shot done").
 * - **Edits**: the grades, through a `ShotEditor`, as on the shot card. Every change to the
 *   shots, here or by the brew flow (`shotsChanged`), is told to `onChange`.
 */

import { ANALYSIS_VERSION, type SegmentAnalysis, type ShotMatch } from '../core/analysis';
import type { Id, Recording, Shot } from '../core/model';
import type { LocalRepository, RecordingRepository, ShotRepository } from '../storage';
import { Emitter, type Unsubscribe } from '../transport/emitter';
import type { AnalysisRunner, RecordingResults, ShotResult } from './analysis-runner';
import type { BrewPreferences } from './brew-settings';
import { ShotEditor } from './shot-editor';

/** The `storage.local` key of the analysis version `reanalyzeAll` last ran for. */
export const ANALYSED_VERSION_KEY = 'history.analysedVersion';

/** A listed shot. */
export interface HistoryEntry {
  readonly shot: Shot;
  readonly recording: Recording;
  /** Its segment, or null: the shot is unmatched (`match.unmatched` says why, D-007). */
  readonly segment: SegmentAnalysis | null;
  readonly match: ShotMatch;
  /** When it was pulled, epoch ms: see the module comment. */
  readonly atEpochMs: number;
  /** Weight frames were refused in the recording or the segment (D-005, D-014). */
  readonly refusedFrames: boolean;
}

export interface HistoryLoad {
  /** Newest first. */
  readonly entries: readonly HistoryEntry[];
  /** The recordings that couldn't be analysed, and why: their shots are missing. */
  readonly failures: readonly { readonly recordingId: Id; readonly error: string }[];
}

export interface HistoryOptions {
  readonly storage: {
    readonly recordings: Pick<RecordingRepository, 'list'>;
    readonly shots: Pick<ShotRepository, 'get' | 'update'>;
    readonly local: Pick<LocalRepository, 'get' | 'set'>;
  };
  readonly analysis: Pick<AnalysisRunner, 'analyze' | 'reanalyzeAll'>;
  /** The tag list, for the tags' order. */
  readonly preferences: Pick<BrewPreferences, 'value'>;
  /** Called once a grade is stored: automatic export uploads the file again (T1.20). */
  readonly onShotsChanged?: () => void;
  /** The wall clock. Default `Date.now`. */
  readonly epochNow?: () => number;
  /** The analysis's version. Default `ANALYSIS_VERSION`; tests bump it. */
  readonly version?: number;
}

export class History {
  readonly #options: HistoryOptions;
  readonly #epochNow: () => number;
  readonly #version: number;
  readonly #changes = new Emitter<void>();
  /** When this history was made: recordings that end after it are analysed at once. */
  readonly #sinceEpochMs: number;
  /** The recordings `recordingsChanged` has analysed. */
  readonly #analysedEnded = new Set<Id>();
  /** The reanalysis for this version, once started. */
  #reanalysis: Promise<void> | null = null;
  /** `recordingsChanged`'s work, one at a time. */
  #catchingUp: Promise<void> = Promise.resolve();

  constructor(options: HistoryOptions) {
    this.#options = options;
    this.#epochNow = options.epochNow ?? (() => Date.now());
    this.#version = options.version ?? ANALYSIS_VERSION;
    this.#sinceEpochMs = this.#epochNow();
  }

  /** Called when the shots changed: a grade, a new shot, post-hoc shots. */
  onChange(listener: () => void): Unsubscribe {
    return this.#changes.on(listener);
  }

  /**
   * Every listed shot, newest first, analysing the recordings that need it.
   *
   * @throws StorageError if the recordings can't be listed, or the reanalysis can't start.
   */
  async load(): Promise<HistoryLoad> {
    await this.#reanalyseOnce();
    const recordings = await this.#options.storage.recordings.list();
    const entries: HistoryEntry[] = [];
    const failures: { recordingId: Id; error: string }[] = [];
    for (const recording of recordings) {
      try {
        const results = await this.#options.analysis.analyze(recording.id);
        if (results === null) continue;
        for (const result of results.shots) {
          if (isListed(result)) entries.push(entryOf(results, result));
        }
      } catch (error) {
        failures.push({ recordingId: recording.id, error: errorText(error) });
      }
    }
    entries.sort((a, b) => b.atEpochMs - a.atEpochMs);
    return { entries, failures };
  }

  /**
   * One shot, listed or not (a discarded one too), with its segment; null if it isn't stored.
   *
   * @throws StorageError; SchemaError on a malformed stored record.
   */
  async entry(shotId: Id): Promise<HistoryEntry | null> {
    const shot = await this.#options.storage.shots.get(shotId);
    if (shot === null) return null;
    const results = await this.#options.analysis.analyze(shot.recordingId);
    const result = results?.shots.find((candidate) => candidate.shot.id === shotId);
    return results && result ? entryOf(results, result) : null;
  }

  /** An editor of `shot`'s grades. */
  editor(shot: Shot): ShotEditor {
    const editor = new ShotEditor(shot, {
      shots: this.#options.storage.shots,
      tags: () => this.#options.preferences.value.tags,
      onShotsChanged: () => {
        this.#options.onShotsChanged?.();
        this.shotsChanged();
      },
      epochNow: this.#epochNow,
    });
    return editor;
  }

  /** The shots changed elsewhere: the brew flow stored one, or a grade. */
  shotsChanged(): void {
    this.#changes.emit();
  }

  /**
   * The stored recordings changed. Analyses each one that ended since this history was made, so
   * that its post-hoc shots exist; the rest wait for a load. Resolves once done; never rejects.
   */
  recordingsChanged(): Promise<void> {
    const run = async (): Promise<void> => {
      const recordings = await this.#options.storage.recordings.list();
      let added = false;
      for (const recording of recordings) {
        const ended = recording.endedAtEpochMs;
        if (ended === null || ended < this.#sinceEpochMs) continue;
        if (this.#analysedEnded.has(recording.id)) continue;
        this.#analysedEnded.add(recording.id);
        const results = await this.#options.analysis.analyze(recording.id);
        added ||= (results?.created.length ?? 0) > 0;
      }
      if (added) this.#changes.emit();
    };
    // A failure leaves the post-hoc shots to the next load, which reports it.
    this.#catchingUp = this.#catchingUp.then(run).catch(() => {});
    return this.#catchingUp;
  }

  async #reanalyseOnce(): Promise<void> {
    this.#reanalysis ??= (async () => {
      const { local } = this.#options.storage;
      if ((await local.get(ANALYSED_VERSION_KEY)) === this.#version) return;
      await this.#options.analysis.reanalyzeAll();
      await local.set(ANALYSED_VERSION_KEY, this.#version);
    })();
    try {
      await this.#reanalysis;
    } catch (error) {
      this.#reanalysis = null; // the next load tries again
      throw error;
    }
  }
}

/** Whether History lists the shot: see the module comment. */
export function isListed({ shot, segment }: ShotResult): boolean {
  if (shot.discardedAtEpochMs !== null) return false;
  const untouchedPostHoc =
    shot.source === 'post-hoc' && shot.updatedAtEpochMs === shot.createdAtEpochMs;
  return segment !== null || !untouchedPostHoc;
}

/** When the shot was pulled, epoch ms: see the module comment. */
export function shotTimeEpochMs(recording: Recording, result: ShotResult): number {
  const markers = result.segment?.markers;
  const t = markers?.pumpOn?.t ?? markers?.firstDrip?.t ?? result.shot.anchorTMs / 1000;
  return recording.startedAtEpochMs + Math.round(t * 1000);
}

function entryOf(results: RecordingResults, result: ShotResult): HistoryEntry {
  const flags = [...results.analysis.flags, ...(result.segment?.flags ?? [])];
  return {
    shot: result.shot,
    recording: results.recording,
    segment: result.segment,
    match: result.match,
    atEpochMs: shotTimeEpochMs(results.recording, result),
    refusedFrames: flags.includes('refused-frames'),
  };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
