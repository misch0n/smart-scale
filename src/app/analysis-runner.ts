/**
 * The analysis runner (T1.14): a recording's analysis through the derived cache, and its shots
 * with their segments (D-007, D-047).
 *
 * - **Read-through cache.** An ended recording's analysis is read from the derived store, keyed
 *   by recording and `ANALYSIS_VERSION`, and computed from raw and stored on a miss. A version
 *   bump misses every entry. An entry whose shape, version or parameters don't check out is
 *   recomputed and replaced: other parameters mean a default changed without the bump it needed.
 *   An ended recording shouldn't change again (the recorder stores every record before it ends
 *   one, D-024). But without Web Locks, startup recovery ends a recording that has been quiet
 *   for a minute, and a suspended tab may store its last records after that: an entry also
 *   stands only while the recording's last stored record is the last one it read.
 * - **Open recordings** (the capture flow's "shot done", T1.18) are analysed from raw as they
 *   stand, never cached, and get no post-hoc shots: the capture flow makes their shots.
 * - **Post-hoc shots.** For an ended recording, every espresso-like segment that no shot claims
 *   gets a `post-hoc` shot, anchored at its start, in the same transaction that reads the shots
 *   (`shots.createMissing`), so two tabs can't both add one. Nothing else ever writes a shot.
 * - **`reanalyzeAll`** clears the cache, old versions' entries too, and analyses every ended
 *   recording again. Running it twice changes nothing the second time.
 *
 * Shot matching and ratios come from the shots as they are now, on every call: metadata never
 * enters the cache.
 */

import {
  ANALYSIS_VERSION,
  analyzeRaw,
  matchShots,
  parseRecordingAnalysis,
  resolveAnalysisParams,
  type AnalysisParams,
  type RecordingAnalysis,
  type SegmentAnalysis,
  type ShotMatch,
} from '../core/analysis';
import { createShot, type Id, type JsonValue, type Recording, type Shot } from '../core/model';
import {
  StorageError,
  type DerivedRepository,
  type RawRecording,
  type RawRepository,
  type RecordingRepository,
  type ShotRepository,
} from '../storage';
import { jsonEqual } from './export';

/** What the runner needs from storage (`AppStorage` has it). */
export interface AnalysisStorage {
  readonly recordings: Pick<RecordingRepository, 'get' | 'list'>;
  readonly raw: Pick<RawRepository, 'read' | 'last'>;
  readonly shots: Pick<ShotRepository, 'createMissing' | 'listForRecording'>;
  readonly derived: DerivedRepository;
}

export interface AnalysisRunnerOptions {
  readonly storage: AnalysisStorage;
  /** The wall clock, for the cache's stamp and new shots. Default `Date.now`. */
  readonly epochNow?: () => number;
  /** Called after post-hoc shots were added to a recording, for automatic export (T1.20). */
  readonly onShotsCreated?: (recordingId: Id) => void;
  /** The analysis's version. Default `ANALYSIS_VERSION`; tests bump it. */
  readonly version?: number;
  /**
   * The analysis. Default `analyzeRaw`'s; tests stand in for it. A cached entry counts only when
   * its parameters are the defaults, as `analyzeRaw`'s are.
   */
  readonly analyze?: (raw: RawRecording) => RecordingAnalysis;
}

/** A shot with the segment it claims. */
export interface ShotResult {
  readonly shot: Shot;
  /** Its segment, or null: the shot is unmatched, and `match.unmatched` says why (D-007). */
  readonly segment: SegmentAnalysis | null;
  readonly match: ShotMatch;
}

export interface RecordingResults {
  readonly recording: Recording;
  readonly analysis: RecordingAnalysis;
  /** Whether the analysis came from the derived cache. */
  readonly cached: boolean;
  /** Every shot of the recording, discarded ones too, in anchor-time order. */
  readonly shots: readonly ShotResult[];
  /**
   * The segments no shot claims: unlabelled ones (beans, ground coffee or milk until containers
   * label them, T2.4), and an open recording's espresso-like ones.
   */
  readonly unclaimed: readonly SegmentAnalysis[];
  /** The post-hoc shots this call added. */
  readonly created: readonly Shot[];
}

export interface ReanalysisSummary {
  /** Ended recordings analysed. */
  readonly analysed: number;
  /** Recordings still open, left alone. */
  readonly open: number;
  /** Post-hoc shots added. */
  readonly created: number;
  /** Shots without a segment, flagged (D-007). */
  readonly unmatched: number;
  /** The recordings that couldn't be analysed, and why. */
  readonly failures: readonly { readonly recordingId: Id; readonly error: string }[];
}

export class AnalysisRunner {
  readonly #storage: AnalysisStorage;
  readonly #epochNow: () => number;
  readonly #onShotsCreated: (recordingId: Id) => void;
  readonly #version: number;
  readonly #analyze: (raw: RawRecording) => RecordingAnalysis;
  readonly #params: AnalysisParams = resolveAnalysisParams();

  constructor(options: AnalysisRunnerOptions) {
    this.#storage = options.storage;
    this.#epochNow = options.epochNow ?? (() => Date.now());
    this.#onShotsCreated = options.onShotsCreated ?? (() => {});
    this.#version = options.version ?? ANALYSIS_VERSION;
    this.#analyze = options.analyze ?? ((raw) => analyzeRaw(raw).analysis);
  }

  /**
   * The recording's analysis and its shots, adding post-hoc shots to an ended recording where
   * they are missing. Null if the recording isn't stored.
   *
   * @throws StorageError if storage fails; SchemaError on a malformed stored record, or on an
   *   analysis that isn't JSON (a NaN: a bug, which fails here rather than in the cache).
   */
  async analyze(recordingId: Id): Promise<RecordingResults | null> {
    const recording = await this.#storage.recordings.get(recordingId);
    if (recording === null) return null;
    const ended = recording.endedAtEpochMs !== null;
    let analysis = ended ? await this.#cached(recordingId) : null;
    const cached = analysis !== null;
    if (analysis === null) {
      const raw = await this.#storage.raw.read(recordingId);
      if (raw === null) return null;
      analysis = parseRecordingAnalysis(this.#analyze(raw));
      if (ended) await this.#store(recordingId, analysis);
    }

    const { segments } = analysis;
    let shots: readonly Shot[];
    let created: readonly Shot[] = [];
    if (ended) {
      const now = this.#epochNow();
      ({ shots, added: created } = await this.#storage.shots.createMissing(recordingId, (stored) =>
        matchShots(segments, stored).postHoc.map((wanted) =>
          createShot({ recordingId, anchorTMs: wanted.anchorTMs, source: 'post-hoc' }, now),
        ),
      ));
      if (created.length > 0) this.#onShotsCreated(recordingId);
    } else {
      shots = await this.#storage.shots.listForRecording(recordingId);
    }

    const matching = matchShots(segments, shots);
    return {
      recording,
      analysis,
      cached,
      shots: shots.map((shot, i) => {
        const match = matching.shots[i];
        return { shot, segment: match.segment === null ? null : segments[match.segment], match };
      }),
      unclaimed: segments.filter((_, i) => matching.claims[i] === null),
      created,
    };
  }

  /**
   * Clears the derived cache and analyses every ended recording again, adding the post-hoc
   * shots that are missing. A recording that fails is reported and the rest carry on.
   *
   * @throws StorageError if the cache can't be cleared or the recordings listed.
   */
  async reanalyzeAll(): Promise<ReanalysisSummary> {
    await this.#storage.derived.clearAll();
    const recordings = await this.#storage.recordings.list();
    let analysed = 0;
    let created = 0;
    let unmatched = 0;
    const failures: { recordingId: Id; error: string }[] = [];
    for (const recording of recordings) {
      if (recording.endedAtEpochMs === null) continue;
      try {
        const results = await this.analyze(recording.id);
        if (results === null) continue;
        analysed++;
        created += results.created.length;
        unmatched += results.shots.filter((result) => result.segment === null).length;
      } catch (error) {
        failures.push({ recordingId: recording.id, error: errorText(error) });
      }
    }
    const open = recordings.filter((recording) => recording.endedAtEpochMs === null).length;
    return { analysed, open, created, unmatched, failures };
  }

  /** The cached analysis, or null when there's none, or none that checks out. */
  async #cached(recordingId: Id): Promise<RecordingAnalysis | null> {
    const entry = await this.#storage.derived.get(recordingId, this.#version);
    if (entry === null) return null;
    let analysis: RecordingAnalysis;
    try {
      analysis = parseRecordingAnalysis(entry.result, 'derived.result');
    } catch {
      return null; // malformed: computed again, and replaced
    }
    const current =
      analysis.analysisVersion === this.#version && jsonEqual(analysis.params, this.#params);
    if (!current) return null;
    const last = await this.#storage.raw.last(recordingId);
    const lastSeq = Math.max(last.frame?.seq ?? -1, last.event?.seq ?? -1);
    return lastSeq === (analysis.lastSeq ?? -1) ? analysis : null;
  }

  async #store(recordingId: Id, analysis: RecordingAnalysis): Promise<void> {
    try {
      await this.#storage.derived.put({
        recordingId,
        analysisVersion: this.#version,
        computedAtEpochMs: this.#epochNow(),
        // JSON-native by construction; the repository checks it.
        result: analysis as unknown as JsonValue,
      });
    } catch (error) {
      // The cache only saves time: a failed write (a full disk) leaves the analysis valid, and
      // the next read computes it again.
      if (!(error instanceof StorageError)) throw error;
    }
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
