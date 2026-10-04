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
- `navigator.bluetooth` is used only in `src/transport/web-bluetooth.ts` (D-022).

Enforced by types, a runtime check and tests (D-008, D-015):

- Only `src/core/protocol/commands.ts` can create a `ScaleCommand` (a type brand). It exports
  one constructor per whitelisted command and no generic encoder, and a test pins its exports.
- Transports pass every command through `isWhitelistedCommand()` right before writing it. They
  all write through `CommandQueue` (`src/transport/command-queue.ts`), which does the check.

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
Derived    (T1.5 envelope) { recordingId, analysisVersion, computedAtEpochMs, result }
  result   (T1.14) { params, segments: [{ markers { pump_on|null, first_drip|null, pump_off|null,
                          settled|null, cup_removed|null }, metrics {…}, flags {…} }] }
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

## Transport (`src/transport`, T1.3, T1.4; D-020, D-022)

`ScaleTransport` (`types.ts`) is the only way to the scale: `connect()`, `disconnect()`,
`send(command)`, `onNotification`, `onStatus`, plus `kind`, `status` and `now()`, and the
optional `reconnectKnownDevice()`, present only where the runtime can reconnect without the
chooser.

- **Status:** `disconnected` → `connecting` → `connected` (with `ConnectionInfo`: device, both
  characteristics' GATT properties, which ones are subscribed) → `disconnected` (with a reason).
  `connected` comes before the first notification and `disconnected` after the last.
- **Notifications:** `{ source, bytes, tArrival }`, in order, `tArrival` non-decreasing on the
  transport's clock. `now()` reads that clock, and the recorder stamps app events with it.
- **Commands:** `send()` takes a `ScaleCommand` only. Every transport writes through
  `CommandQueue`: one write in flight, a pause after each, and `isWhitelistedCommand()` plus a
  copy of the bytes right before the write (D-015). Disconnecting rejects whatever is queued.
- **Time:** clocks and timers come in as a `Scheduler` (`scheduler.ts`). The app uses
  `systemScheduler`; tests use `ManualClock`, whose time moves only on `advance()`.
- **`MockTransport`** (`mock.ts`) runs the simulator (below) in real or accelerated time
  (`speed`). Its clock is virtual, so a session replayed at 10× still has true-to-life
  timestamps. The session's time 0 is the first connect. It writes commands into the simulated
  scale, which reacts to them.
- **`WebBluetoothTransport`** (`web-bluetooth.ts`, D-022) is the only module that touches
  `navigator.bluetooth` (lint). It takes the API as an option (default `navigator.bluetooth`,
  read when needed) and is tested against `fake-web-bluetooth.ts`. `connect()` calls
  `requestDevice()` synchronously, so call it straight from a click handler. Then GATT connect,
  service 0FFE, FF11 and FF12, listeners, `connected`, and `startNotifications()` on FF11 and on
  FF12 if it can notify or indicate. Commands wait for the subscriptions and are written with
  response when FF12 allows it. A failed step ends in `disconnected` with reason `error` and a
  message naming the step; a dropped link gives reason `device`. No reconnect loop, no timeouts.
  `reconnectKnownDevice()` uses `getDevices()` and needs no user gesture.
- Listeners are called synchronously, through `Emitter` (`emitter.ts`). A value emitted from
  inside a listener is delivered after the current one, so every listener sees statuses in
  order.
- Errors are `TransportError` with a `code`: `busy`, `connect-failed`, `not-connected`,
  `disconnected`, `refused` or `write-failed`.

## Storage (`src/storage`, IndexedDB via `idb`; T1.5, D-023)

`openStorage()` returns `AppStorage`: one repository per kind of record, all sharing one
connection (`db.ts`), which opens again by itself if the browser drops it. Only the
repositories reach the database, and every record they read back goes through the model's
normalisers (D-018).

| Store | Key | Holds | Repository methods |
| --- | --- | --- | --- |
| `recordings` | `id` | `Recording` (raw) | `create`, `end` (once), `get`, `list`, `listOpen` |
| `frameChunks` | `[recordingId, firstSeq]` | raw frames, one chunk of up to 256 per append | `raw`: `append`, `addRecording`, `read`, `last` |
| `events` | `[recordingId, seq]` | `AppEvent` (raw) | `raw`, as above |
| `shots` | `id`; index `byRecording` on `[recordingId, anchorTMs]` | `Shot` | `create`, `get`, `update`, `discard`, `replace`, `listForRecording`, `list` |
| `derived` | `[recordingId, analysisVersion]` | `{ recordingId, analysisVersion, computedAtEpochMs, result }`, disposable | `put`, `get`, `clearAll` |
| `kv` | a string | settings and last-used values, as JSON | `get`, `set`, `entries` |

- **Raw is add-only.** There is no update or delete method, writes use IndexedDB's `add`, which
  never overwrites, and an append must come after everything stored for its recording (`seq`).
  Each append is one transaction. Gaps in `seq` are kept: they record a loss. An import stores
  a whole recording, its row and every record, in one transaction (`raw.addRecording`, T1.7).
- **Shots** change through `update` and `discard`. An import that replaces metadata uses
  `replace`, which refuses a shot with another identity (D-019).
- **The recorder writes through `RecordingWriter`.** It creates the recording at once, then
  writes batches about every second or every 20 records, one write at a time. It retries a
  failed write, in order, and drops nothing. The recorder (below) flushes it on disconnect, and
  on `visibilitychange` (hidden) or `pagehide`.
- **Schema versions** are `MIGRATIONS` in `db.ts`, one per version. Phase 2 adds `beanBags`,
  `grinders`, `burrEpochs` and `containers` with a new migration. When another tab upgrades the
  database, this one closes its connection and then fails with `newer-version` (reload).
- **Persistence:** `requestPersistence()` calls `navigator.storage.persist()` and reads the usage
  estimate. The app calls it at startup (T1.8). Safari can evict IndexedDB for sites that
  aren't installed, which is why export exists.
- **Errors** are `StorageError` with a `code`, such as `exists`, `out-of-order` or `quota`.

## Recorder (`src/app/recorder.ts`, T1.6; D-024)

`new Recorder({ transport, storage, app, userAgent })`, made once per transport before the first
connect and kept for the app's lifetime. It follows the transport's status:

```
connected     → Recording (device, transport kind, build, user agent), stored at once
                Web Lock smart-scale:recording:<id> held until the end is stored
                events at tMs 0: connected, characteristic-properties ff11, ff12
                flowSmoothingOff → the first weight frame with smoothing byte 0: smoothing-confirmed
                                 → none 2 s after the write: one retry, 2 s more,
                                   then smoothing-not-confirmed (a warning)
notification  → RawFrame (seq, tMs = tArrival − start, source, bytes verbatim) → RecordingWriter
                decoded for the live stats and onFrame; never filtered
disconnected  → disconnected event (always the last record) → flush until stored
              → recordings.end(id, startedAtEpochMs + tMs, reason) → lock released
```

- **Timeline:** `tMs` is `transport.now()` minus its value at `connected`, for frames and events
  alike; frames and events share one `seq` (`RecordingSequence`).
- **App events:** `sendCommand(cmd, reason)` logs `command-sent` when the write completes, or
  `command-failed`. `logUiAction(action, detail)` and `annotate(label, text)` log at once. They
  return null (or reject `not-connected`) when nothing is recording.
- **Observable, display-only:** `state` (the recording, live stats, `unsaved`, `finishing`,
  `storageError`, `warnings`), `onChange` (after every change, and every second while
  recording), `onFrame` (each frame with its decoding: the live pipeline's input) and
  `onEvent`. Nothing live is stored.
- **Storage failures:** records wait in the writer and are retried; one `error` event per run
  of failures; the warning `storage-failing` until writes succeed. A recording is ended only
  once all its records are stored.
- **Unclean recovery** (`recovery.ts`): at startup, `recoverUncleanRecordings(storage)` ends
  each open recording as `unclean` at its last stored record, if it can take the recording's
  Web Lock, so a recording another tab is making is left alone. Nothing is appended. Without
  Web Locks it ends only recordings quiet for a minute.
- **Seams for tests:** `timers` (a `ManualClock`), `epochNow`, `locks` (`fake-locks.ts`) and
  `page` (`page-lifecycle.ts`: when the page is hidden).

## Export format (`src/core/export`, `src/app/export.ts`; T1.7, D-025)

`docs/export-format.md` is the normative description. The export is versioned JSON (`format`,
`formatVersion`), and the durable artifact: IndexedDB is a cache of it.

```
{ format, formatVersion, exportedAtEpochMs, app,
  recordings: [ { recording, frames: [[seq, tMs, source, hex], …], events: [{ seq, tMs, type, data }, …] } ],   raw
  shots: [Shot, …],                                                                                             metadata
  settings: { key: JSON } | null }
```

- **Core** (`src/core/export`, pure): `serialiseExport(bundle)` and `parseExport(text)` convert
  between the file and an `ExportBundle` of model records. Every record goes through its
  normaliser both ways (D-018); the parser also checks seq order and unique ids, refuses a newer
  `formatVersion` with a clear message, and upgrades older ones through `EXPORT_MIGRATIONS`.
  The layout is one record per line. `recordingExportFileName` and `allExportFileName` name the
  files.
- **App** (`src/app/export.ts`): `exportRecording(storage, id, options)` (the recording and its
  shots) and `exportAll(storage, options)` (everything, with the settings) return the file name,
  its text and a summary. `importBundle(storage, bundle, { metadata })` merges a parsed file:
  raw already stored is skipped (raw is never replaced), a new recording is stored whole in one
  transaction, a recording the file holds open is stored ended as `unclean`, and stored shots
  and settings are kept (`keep`, the default) or replaced (`replace`). It returns a report.
- **UI**: the home page's export panel (`src/ui/ExportPanel.tsx`) prepares a file, then offers
  a download link (`<a download>` on a blob URL) and, where `navigator.canShare({ files })`
  says yes, the share sheet (`src/platform/share.ts`). Import takes a file from a file input.
- Derived data and live values aren't exported. Entities arrive with format version 2 (T2.1).

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

## Simulator (`src/core/sim`, T1.3; D-021)

A deterministic simulation of a scale session, with exact ground truth. It is the test bed for
M2 until real recordings exist (D-013), and it drives `MockTransport`. Every parameter, with its
provisional default, is documented in `params.ts` (scale and link) and `shot.ts` (shots).

```
script (cup on/off/back, shot, pump, bump, tare button, command, power-off)
  → WeighingPlatform: vessel settling in and out, liquid in whole drops (into the cup, or onto
    the platform when there is none), bumps                          → noise-free gross mass
  → scale firmware: samples on a drifting, jittered clock; noise, plus vibration while the
    pump runs; smoothing; tare offset; quantisation; timer; command reactions → 03 0B frames
  → Link: latency, connection-event grid, jitter, stalls (bursts), drops, bit flips, truncation
  → frames with arrival times, each carrying its truth
```

- **Shots** (`shot.ts`): `pump_on`, then no liquid for the pre-infusion, then the flow profile
  until `pump_off`, then an exponential tail with τ, continuous at `pump_off`. The flow is
  scaled so that everything delivered equals `yieldG`.
- **Commands** are bytes: the simulated scale parses them as firmware would, after
  `commandLatencyMs`, and throws on calibration or shutdown bytes as a tripwire. Unknown
  behaviour (timer semantics, smoothing, standby, physical tare, `03 0D`) follows D-021.
- **Ground truth** (`SessionTruth`): per shot the markers and the spec's metrics, in liquid
  terms (independent of tares); every physical event; every command with its effect; tares;
  timer changes; lost frames. Each frame has its own truth: sample time, gross mass, offset,
  noise, pump state, the weight and timer it carries, and any damage.
- **Determinism:** one seed, one named random stream per effect, a fixed number of draws per
  sample and per frame. A session doesn't depend on how it is stepped, and switching one effect
  on (vibration, drops, a flush) leaves everything else unchanged.
- **Entry points:** `simulateSession(scenario)` runs a whole session; `toRawRecording(session)`
  turns it into a `Recording` with `RawFrame`s and `AppEvent`s, as the recorder would store it;
  `espressoScenario()` and `demoScenario()` build the usual sessions; `ScaleSimulator` steps
  through time for streaming use (`advanceTo`, `write`, `nextWakeMs`).

## Testing

- Unit tests live next to the code (`*.test.ts`), run by Vitest in a Node environment.
- Storage tests use `fake-indexeddb`: `freshIndexedDB()` (`src/storage/fake-idb.ts`) gives each
  test an empty database. Node has no Web Locks, so app tests use `FakeLocks`
  (`src/app/fake-locks.ts`), one instance per origin.
- Analysis and live tests use simulator ground truth (`src/core/sim`). For exact checks, turn
  noise, jitter and stalls off through the scenario's `scale` and `link` parameters.
- Export tests share `src/core/export/test-samples.ts`: a bundle with every event type, damaged
  and FF12 frames, an open recording, shots with every field set and with none, and settings.
- Transport and service tests run `MockTransport` on a `ManualClock`, which makes them
  deterministic and instant.
- Real recordings in `fixtures/real/` (exported by the probe) become regression tests once U1.1
  is done.
- UI testing is smoke-level only for now. Chromium and Playwright are available in the agent
  environment, and the mock transport makes UI flows runnable without a scale.
