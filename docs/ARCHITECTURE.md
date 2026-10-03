# Architecture

Initial design (T0.1). Tasks refine the section they implement, so keep this file true: if code
and this document disagree, fix one of them in the same commit.

## Principles (from the spec)

- **Record everything, decide later.** Every packet from connect to disconnect is stored. No
  segmentation decision is made in real time (spec: "Data model and storage").
- **Three layers.** Raw is append-only and canonical. Derived is a pure, versioned, disposable
  function of raw. Metadata is user input.
- **Two signal pipelines.** Live is causal and display-only. Analysis is post-hoc and its
  results are stored. They share no state.
- **One narrow transport interface.** All BLE access sits behind it, so the runtime (beacio or
  Bluefy on iOS, Capacitor, a GaggiMate stream) can change without touching anything above it.
- **The export JSON is the durable artifact.** IndexedDB is a cache of it.

## Data flow

```
                  commands (whitelist)            app events (button presses, commands, annotations)
                 ┌──────────────────────┐        ┌──────────────────────────────────┐
                 │                      ▼        │                                  ▼
 BOOKOO ──BLE──▶ ScaleTransport ──notifications──▶ Recorder ──append-only──▶ IndexedDB raw ──▶ Export JSON
 Themis Mini     (web-bluetooth │ mock)           │                           (frames, events)  (durable)
                                                  │
                                                  └──▶ Live pipeline ──▶ live UI (remaining-to-target, flow)
                                                       causal, display-only, never stored

 IndexedDB raw ──▶ Analysis (pure, ANALYSIS_VERSION) ──▶ derived cache ──▶ post-shot card, history, charts
                   decode → timebase → zero-tracking → resample → SG → markers → metrics
 Metadata (shots, beans, grinders, …) ──────────────────────────────────▶ (joined for display and export)
```

## Modules and boundaries

| Module | Responsibility | May import |
| --- | --- | --- |
| `src/core/protocol` | Byte layouts, checksum, command whitelist, frame decode and encode | — |
| `src/core/model` | Types, ids, normalisers (schema completeness), constants | protocol |
| `src/core/timebase` | Reconciling device ms with arrival time | protocol, model |
| `src/core/signal` | Generic DSP: resampling, Savitzky–Golay, rolling stats, CUSUM, fits | — |
| `src/core/analysis` | Zero-tracking, segmentation markers, tail fit, metrics, `ANALYSIS_VERSION` | protocol, model, timebase, signal |
| `src/core/live` | Causal display pipeline, stability, tare arming, display state | protocol, model, signal |
| `src/core/sim` | Deterministic simulated sessions with ground truth | protocol, model |
| `src/core/export` | Export format, validation, migrations | protocol, model |
| `src/transport` | `ScaleTransport` interface, Web Bluetooth and mock implementations | core |
| `src/storage` | IndexedDB repositories | core |
| `src/app` | Services wiring things together: recorder, analysis runner, export, session controller | core, transport, storage, platform |
| `src/platform` | Browser capability detection, build info | — |
| `src/ui` | Preact components (rudimentary until T3.5) | app, core, platform |

Enforced by `eslint.config.js` (D-010):

- `src/core/**` has no DOM globals and no Preact, and imports none of transport, storage, app,
  ui or platform.
- `src/core/analysis/**` does not import `src/core/live/**`.
- `navigator.bluetooth` is used only in `src/transport/**`.

Enforced by types, a runtime check and tests (D-008, D-015):

- Only `src/core/protocol/commands.ts` can create a `ScaleCommand` (a type brand). It exports
  one constructor per whitelisted command and no generic encoder, and a test pins its exports.
- Transports pass every command through `isWhitelistedCommand()` right before writing it.

## Glossary

- **Recording**: one BLE connection, connect to disconnect. Raw. (In "Data model and storage"
  the spec calls this a session.)
- **Frame**: one notification as received: bytes, arrival time, source characteristic.
- **App event**: something the app or the user did (command sent, button pressed, annotation,
  connection change). Events sit on the same timeline and sequence counter as frames.
- **Shot**: one extraction within a recording. A metadata entity anchored at a time in that
  recording (D-007).
- **Segment / markers**: derived per detected shot: `pump_on`, `first_drip`, `pump_off`,
  `settled`, `cup_removed`.
- **Phase**: beans, grind or extraction. The vessel on the scale selects it (Phase 2).
- **Net weight**: `w(t) − w(baseline)`, computed in software. Tares sent to the scale are only
  a convenience for its display.

## Data model (`src/core/model`, T1.2; T2.1 adds the entities)

Every stored record carries every field, with `null` meaning "not set, hidden or not
applicable". A field is never absent (spec: "Schema rules"). Each record type has a runtime
schema, and its normaliser (`normaliseRecording`, `normaliseRawFrame`, `normaliseAppEvent`,
`normaliseShot`) fills a missing nullable field with `null`, drops unknown keys, and throws
`SchemaError` with a path on anything malformed (D-018). Storage normalises every record it
reads, and the importer every record it parses. The constructors (`createRecording`,
`createShot`, …) go through the same schemas.

- **Ids** are lower-case UUIDv7 strings, so they sort by creation time (D-017). Show and name
  files with `shortId(id)`, the last 8 random hex digits.
- **Time:** `tMs` is ms since the recording started, on the recorder's monotonic clock (a
  float). Frames, app events and shot anchors all use it. `…EpochMs` fields are wall-clock epoch
  ms. Durations in seconds appear only in derived metrics.

```
Recording  { id, startedAtEpochMs, endedAtEpochMs|null,
             endReason: 'user'|'device'|'error'|'unclean'|null,
             device { name|null, id|null }, transport: 'web-bluetooth'|'mock',
             app { commit, buildTime }, userAgent|null }
RawFrame   { recordingId, seq, tMs /* arrival */, source: 'ff11'|'ff12', bytes: Uint8Array }
AppEvent   { recordingId, seq, tMs, type, data }        // seq shared with frames: one total order
  type                        data
  connected                   { deviceName|null, deviceId|null }
  disconnected                { reason: 'user'|'device'|'error', message|null }
  command-sent                { command /* whitelist name */, param|null, hex, reason|null }
  command-failed              { …as command-sent, error }
  ui-action                   { action, detail: any JSON|null }
  annotation                  { label /* pump-on, pump-off, cup-on, cup-off, note, … */, text|null }
  smoothing-confirmed         { attempts }
  smoothing-not-confirmed     { attempts, smoothingByte|null }
  error                       { message, context|null }
  characteristic-properties   { characteristic: 'ff11'|'ff12',
                                properties { broadcast, read, writeWithoutResponse, write, notify,
                                             indicate, authenticatedSignedWrites, reliableWrite,
                                             writableAuxiliaries: boolean|null } }
Shot       { id, recordingId, anchorTMs, source: 'live'|'manual'|'post-hoc',
             createdAtEpochMs, updatedAtEpochMs, discardedAtEpochMs|null,
             direction: 'sour'|'balanced'|'bitter'|null, channelled: boolean|null,
             tags: string[]|null, doseG|null, targetRatio|null, beansWeighedG|null,
             beanBagId|null, grinderId|null, grindSetting { kind: 'stepless'|'clicks', value }|null,
             burrEpochId|null, containerId|null }
Derived    (T1.14) { recordingId, analysisVersion, params, computedAt,
             segments: [{ markers { pump_on|null, first_drip|null, pump_off|null, settled|null,
                          cup_removed|null }, metrics {…}, flags {…} }] }
Settings   (T1.18, T2.8) last-used dose, ratio, bean, grinder and setting; field visibility
Phase 2    BeanBag, Grinder, BurrEpoch, Container (see PLAN T2.1)
```

- **Raw.** `RecordingSequence` stamps a recording's frames and events with `seq` numbers from
  one counter: 0, 1, 2, … in the order the recorder saw them. `seq` alone orders everything in a
  recording, and the numbers are contiguous, so a gap means a lost record. Frames keep their
  bytes verbatim, whatever the decoder makes of them (D-004), and `createRawFrame` copies them.
  A recording row changes once, when it ends (`endRecording`).
- **Shots** (D-007, D-019) are user metadata anchored at `anchorTMs`. Analysis never writes to
  a shot: it matches segments to shots by anchor time. Deleting a shot sets
  `discardedAtEpochMs` instead of removing it, so the shot keeps claiming its segment and
  re-analysis doesn't recreate it as `post-hoc`. `tags: []` means none were given, while
  `null` means the field wasn't captured. Days off roast isn't stored: it derives from the bag's
  roast date (T2.2).
- The Phase 2 references on `Shot` exist from day one, set to `null`, so history never has a
  hole that can't be told apart from "not applicable".
- **JSON.** Every record is JSON-native apart from frame bytes, which the export writes as hex.
  Command bytes in events are packed upper-case hex.
- **Evolution.** A field added later must be nullable, so old records read as `null`, or come
  with a migration. An event type added later makes older builds refuse records that use it,
  loudly, rather than drop them.

## Timebase (D-006, T1.9)

Each frame has two clocks:

- **Arrival**: `performance.now()` in the notification handler, relative to recording start.
  Always present, but jittered by BLE connection intervals and notification batching.
- **Device ms**: frame bytes 2–4. This is the scale's stopwatch. It is meaningful only while
  it advances; it reads zero before `07`/`04` and freezes after `05`.

The analysis time axis uses device ms on runs where it strictly increases, mapped onto the
arrival clock with that run's minimum `arrival − device` offset, and arrival time elsewhere.
Each sample records which source it used. Jitter (`arrival − mapped device`) is reported as a
diagnostic.

## Storage (IndexedDB via `idb`; T1.5)

Initial object stores:

- `recordings`;
- `frameChunks`: key `[recordingId, chunkNo]`, append-only arrays of frames;
- `events`: key `[recordingId, seq]`, append-only;
- `shots`;
- `derived`: key `[recordingId, analysisVersion]`, disposable;
- `kv`: settings and last-used values.

Phase 2 adds `beanBags`, `grinders`, `burrEpochs` and `containers` through a DB version upgrade.

Raw stores have no update or delete API. Writes are batched: flushed about every second or
every 20 frames, and on `pagehide` or `visibilitychange`. `navigator.storage.persist()` is
requested at startup. Safari can evict IndexedDB for non-installed sites, which is why export
exists.

## Export format (T1.7 writes `docs/export-format.md`)

The export is versioned JSON (`format`, `formatVersion`):

- per recording: the recording, its frames as compact rows with hex bytes, its events, its
  shots, and the entities those shots reference;
- an "export all" bundle.

Derived data is excluded by default. Import is idempotent: raw with an existing id is skipped,
because raw is immutable. Old format versions must keep importing, through migrations.

## Analysis pipeline (T1.9–T1.16)

1. Decode frames: drop invalid ones, refuse unknown units.
2. Build the timeline.
3. Zero-track: subtract tare steps, using the event log and step heuristics.
4. Resample onto a uniform grid.
5. Savitzky–Golay smoothing and derivative (window about 0.5 s, quadratic, tuned on real data).
6. Find stability windows and the noise floor, with a quantisation floor on σ.
7. Find shot windows.
8. Find markers:
   - `first_drip`: CUSUM with a retrospective change point;
   - `pump_on` and `pump_off`: variance of the detrended signal, or the regime-change fallback;
   - `settled`;
   - `cup_removed`.
9. Fit the tail: τ from `ln(flow)`, then `w_final`.
10. Compute metrics.
11. Stamp the result with `ANALYSIS_VERSION` and its parameters.

The whole pipeline is pure and deterministic. Bump `ANALYSIS_VERSION` whenever outputs change;
the runner re-derives across history.

## Live pipeline (T1.17)

decode → causal EMA of weight, causal flow → stability → display state machine (idle, cup on,
armed, tare fired, running, tail, done; arm-once tare via `07`) → remaining-to-target → UI.
It is display-only and never stored. If it misfires, the record is untouched.

## Testing

- Unit tests live next to the code (`*.test.ts`), run by Vitest in a Node environment.
- Storage tests use `fake-indexeddb`.
- Analysis and live tests use simulator ground truth (`src/core/sim`).
- Real recordings in `fixtures/real/` (exported by the probe) become regression tests once U1.1
  is done.
- UI testing is smoke-level only for now. Chromium and Playwright are available in the agent
  environment, and the mock transport makes UI flows runnable without a scale.
