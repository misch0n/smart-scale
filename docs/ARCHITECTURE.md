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
| `src/core/timebase` | Reconciling device ms with arrival time | protocol, model, signal |
| `src/core/signal` | Generic DSP: resampling, Savitzky–Golay, rolling stats, CUSUM, fits | — |
| `src/core/analysis` | Zero-tracking, segmentation markers, tail fit, metrics, `ANALYSIS_VERSION` | protocol, model, timebase, signal |
| `src/core/live` | Causal display pipeline, stability, tare arming, display state; the probe's statistics | protocol, model, signal |
| `src/core/sim` | Deterministic simulated sessions with ground truth | protocol, model |
| `src/core/sound` | The microphone's sound levels: a spectrum's band levels, and the `mic` frame's bytes (T1.24) | — |
| `src/core/export` | Export format, validation, migrations | protocol, model |
| `src/core/inspect` | The analysis inspection CLI's core: its command line, the JSON report, SVG charts, simulated exports (T1.15). The app never imports it | protocol, model, timebase, signal, analysis, sim, sound, export |
| `src/transport` | `ScaleTransport` interface, Web Bluetooth and mock implementations | core |
| `src/storage` | IndexedDB repositories | core |
| `src/app` | Services wiring things together: startup, links, recorder, analysis runner, export, automatic export, session controller | core, transport, storage, platform |
| `src/platform` | Browser APIs outside BLE and storage: capabilities, build info, wake lock, microphone and its level meter, share | core |
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
RawFrame   { recordingId, seq, tMs /* arrival */, source: 'ff11'|'ff12'|'mic', bytes: Uint8Array }
             // mic (T1.24, D-050): the microphone's levels, layout id + a byte per level
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
  sound-started               { layout, measures: JSON|null, sampleRateHz, fftSize, intervalMs,
                                input|null, continued }
  sound-input                 { contextState, muted }
  sound-stopped               { reason: 'user'|'ended'|'error', message|null }
Shot       { id, recordingId, anchorTMs, source: 'live'|'manual'|'post-hoc',
             createdAtEpochMs, updatedAtEpochMs, discardedAtEpochMs|null,
             direction: 'sour'|'balanced'|'bitter'|null, channelled: boolean|null,
             tags: string[]|null, doseG|null, targetRatio|null, beansWeighedG|null,
             beanBagId|null, grinderId|null, grindSetting { kind: 'stepless'|'clicks', value }|null,
             burrEpochId|null, containerId|null }
Derived    (T1.5 envelope) { recordingId, analysisVersion, computedAtEpochMs, result }
  result   (T1.14, RecordingAnalysis) { analysisVersion, params { timeline, segmentation, liquid,
             pump }, lastSeq, timeline { frames, deviceTimedFrames, rateSource, driftPpm,
             intervalMs },
             refusedFrames, quantisationG, toleranceG, steps[], flags[],
             segments: [{ index, window { startT, endT, end, baseline, cupPlacedT, riseG },
               markers { pumpOn|null, firstDrip|null, pumpOff|null, settled|null,
                         cupRemoved|null }, tail|null, metrics { firstDripS, extractionS,
               totalS, averageFlowGps, pumpOffWeightG, yieldG, honestYieldG, tailMassG, tauS },
               espresso, refusedFrames, flags[] }] }
Settings   (T1.18, T2.8) last-used dose, ratio, bean, grinder and setting; field visibility
Phase 2    BeanBag, Grinder, BurrEpoch, Container (see PLAN T2.1)
Planned    (spec v2, D-053, D-054) Shot keeps direction and channelled and gains a snapshot of
           its context as values (pack and dates, machine, pressure, basket id and size,
           grinder and setting, recipe and ratios, maintenance dates, phase results or
           skipped; T1.18, an export format version). Entities (T2.1): Machine with baskets,
           Grinder, Recipe, CoffeePack, Container with roles, Tag, Maintenance. No learning
           model for now
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

## Timebase (`src/core/timebase`, T1.9; D-006, D-032)

Each frame has two clocks:

- **Arrival**: `performance.now()` in the notification handler, relative to recording start.
  Always present, but jittered by BLE connection intervals and notification batching.
- **Device ms**: frame bytes 2–4. This is the scale's stopwatch. It is meaningful only while
  it advances; it reads zero before `07`/`04` and freezes after `05`.

```
RawFrame[] ─▶ decodeWeightFrames (FF11 weight frames that decode, seq order)
           ─▶ deviceRunIndexes: timer strictly increasing; no 0, no value a neighbour repeats
           ─▶ one rate for all runs (robustSlope: least squares, each run its own intercept,
              stalls trimmed; rate 1 under 30 s of runs or beyond 2% drift)
           ─▶ each run's offset: the line under its frames, touching the fastest (D-006)
           ─▶ arrival-timed frames: arrival − median jitter, held between their neighbours
           ─▶ Timeline { samples: { seq, t (s), timeSource, run, arrivalT, frame }, runs,
                         rateSource, driftPpm, jitter, arrivalCorrectionMs, nominalInterval }
```

- `buildTimeline(rawFrames)` is the analysis's first step after decoding: each sample carries
  its decoded `WeightFrame`, so nothing decodes twice. `t` never decreases; bursts of
  arrival-timed frames can share a value.
- `t` is the sample time plus the link's least latency and the wait of the run's fastest frame:
  constants a recording can't reveal, a few ms apart between runs. Durations and rates don't
  depend on them.
- Each run reports its own drift when it spans 30 s (`ownDriftPpm`, the drift check), and its
  jitter (arrival − mapped time); the timeline reports the drift, the jitter over all runs and
  the nominal sample interval.
- The real scale (D-037) counts 100 ms ticks in the timer field, one per sample, on a clock
  0.7% slow: the rate fit takes that as drift (−6,937 ppm), and a tick that comes twice splits
  a run. Its timer runs only when started, so most frames are arrival-timed.
- Simulated that way (T1.22), device-timed frames are within 2 ms of their samples (around one
  constant) on session 1's link, and within 5 ms with ±50 ms of jitter. Limits (a sample period
  that is a multiple of the connection interval, a scale that barely drifts) are in D-032.

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
| `shots` | `id`; index `byRecording` on `[recordingId, anchorTMs]` | `Shot` | `create`, `get`, `update`, `discard`, `replace`, `createMissing`, `listForRecording`, `list` |
| `derived` | `[recordingId, analysisVersion]` | `{ recordingId, analysisVersion, computedAtEpochMs, result }`, disposable | `put`, `get`, `clearAll` |
| `kv` | a string | settings and last-used values, as JSON; a full export carries them | `get`, `set`, `entries` |
| `local` | a string | device-local values, as JSON: never exported or imported (T1.20, D-030) | `get`, `set`, `delete`, `entries(prefix)` |

- **Raw is add-only.** There is no update or delete method, writes use IndexedDB's `add`, which
  never overwrites, and an append must come after everything stored for its recording (`seq`).
  Each append is one transaction. Gaps in `seq` are kept: they record a loss. An import stores
  a whole recording, its row and every record, in one transaction (`raw.addRecording`, T1.7).
- **Shots** change through `update` and `discard`. An import that replaces metadata uses
  `replace`, which refuses a shot with another identity (D-019). The analysis runner adds
  post-hoc shots with `createMissing`, which reads a recording's shots and adds the ones a
  synchronous callback returns in one transaction, so two tabs can't both add one (T1.14).
- **The recorder writes through `RecordingWriter`.** It creates the recording at once, then
  writes batches about every second or every 20 records, one write at a time. It retries a
  failed write, in order, and drops nothing. The recorder (below) flushes it on disconnect, and
  on `visibilitychange` (hidden) or `pagehide`.
- **Schema versions** are `MIGRATIONS` in `db.ts`, one per version: version 1 (T1.5) has the
  stores above but `local`, which version 2 (T1.20) adds. Phase 2 adds `beanBags`, `grinders`,
  `burrEpochs` and `containers` with a new migration. When another tab upgrades the database,
  this one closes its connection and then fails with `newer-version` (reload).
- **Device-local values** (`local`): the automatic export's settings, token and ledger, and
  whatever else must stay on this device (T1.21's remembered scale). `kv` is for settings that
  travel with a full export.
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
recordSound   → RawFrame (source mic, tMs = now − start): the microphone's levels (T1.24), from
                SoundCapture; not decoded, counted apart (stats.soundFrames), not on onFrame
disconnected  → disconnected event (always the last record) → flush until stored
              → recordings.end(id, startedAtEpochMs + tMs, reason) → lock released
```

- **Timeline:** `tMs` is `transport.now()` minus its value at `connected`, for frames and events
  alike; frames and events share one `seq` (`RecordingSequence`).
- **App events:** `sendCommand(cmd, reason)` logs `command-sent` when the write completes, or
  `command-failed`. `logUiAction(action, detail)`, `annotate(label, text)` and the sound
  levels' `logSoundStarted`, `logSoundInput` and `logSoundStopped` log at once. They return
  null (or reject `not-connected`) when nothing is recording.
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
- **UI**: the probe's export panel (`src/ui/ExportPanel.tsx`) prepares a file, then offers a
  download link (`<a download>` on a blob URL) and, where `navigator.canShare({ files })` says
  yes, the share sheet (`src/platform/share.ts`). Import takes a file from a file input. It
  flushes the recorders before each export.
- Derived data and live values aren't exported. Version 2 (T1.24) added the `mic` frames and
  the sound events; version 1 files import unchanged. Entities arrive in a later version (T2.1).
- **Automatic export** uploads each closed recording's file to a private GitHub repo, when the
  user has set one up on the device: next section.

## Automatic export (`src/app/auto-export/`, T1.20; D-026, D-027, D-030)

```
startApp ─▶ AutoExport.start()        ScaleLinks.onRecordingsChanged ─▶ recordingsChanged()
                │                     import (ExportPanel)          ─▶ recordingsChanged()
                ▼                     shots edited (T1.18)          ─▶ shotsChanged()  (10 s debounce)
   pass: scan ─▶ check() ─▶ for each pending recording, oldest first:
         │                    exportRecording ─▶ write (create: no sha) ─┬▶ ledger: synced
         │                                        conflict (exists, 409) ─▶ read ─▶ compareWithRemote
         │                                                                    same ─▶ synced (no write)
         │                                                                    replace ─▶ write with its sha
         │                                                                    keep ─▶ held (reason)
   recordings ∖ open ∖ simulator, minus those whose ledger entry (this destination) has the
   same shots digest
```

- **`AutoExport`** (`auto-export.ts`) is the queue: one pass at a time, on the triggers above,
  plus `online`, the page being shown again, and a retry timer. Without settings (owner, repo,
  token) it makes no request at all. Status: `off`, `idle`, `working`, `waiting` (retries with
  backoff: network, 5xx, rate limits) or `stopped` (401, 403, 404, a public repo: until the
  settings are saved again or Retry), with the number to go, the held recordings, the last
  export time and the last error.
- **`BackupSink`** (`sink.ts`) is the destination's narrow interface (`check`, `read`,
  `write` with the replaced version); `GitHubSink` (`github.ts`) implements it on the REST
  contents API. Another destination (CloudKit, the share sheet) implements the same interface.
- **Files:** `exportRecording`'s, unchanged format, at `<prefix>YYYY/MM/<file name>`
  (`recordingArchivePath`, local time), one commit each, a second apart. Nothing is ever
  deleted, and a file is replaced only by one holding at least its records.
- **The ledger** (`ledger.ts`, `local` store, `autoExport.ledger.<id>`): per recording the
  destination, path, version (blob `sha`), state and a SHA-256 of its shots. A closed
  recording's raw never changes, so the shots digest tells a scan what to upload again without
  reading raw.
- **Settings** (`settings.ts`, `local` store, `autoExport.settings`): owner, repo, branch
  (null: default), folder prefix and token. The UI sees them without the token
  (`settingsView`). Every message passes through `redact`.
- **UI**: `src/ui/AutoExportPanel.tsx` on the probe, beside the recordings panel: status, held
  recordings, Retry now, and the settings with a write-only token, Save and Test. While
  automatic export is off or stopped, `BackupReminder` at the top of the page says the
  recordings aren't backed up, on every open, with a button to the settings (D-031).

## App shell and probe (`src/app/startup.ts`, `src/app/links.ts`, `src/ui/`; T1.8, D-028)

```
startApp ─▶ openStorage ─▶ requestPersistence() ┐
                         └▶ recoverUncleanRecordings() ┴─▶ ScaleLinks + ScreenWakeLock
                                                          ─▶ AutoExport.start() ─▶ AppServices
ScaleLinks.get(spec) ─▶ link { transport, recorder, monitor }, made once per spec and kept
   spec: { kind: 'web-bluetooth' } | { kind: 'mock', speed }  (key web-bluetooth, mock@<speed>)
```

- **`AppServices`** (`startApp`): storage, the persistence answer, the recovery result (or its
  error), the links, the wake lock and automatic export. `src/ui/App.tsx` starts them once and
  shows the startup state until they are ready.
- **`ScaleLinks`** holds one transport, its one recorder (D-024) and a `ProbeMonitor` per kind.
  Across the links:
  - the screen wake lock is wanted while any link is connecting or connected;
  - the page being hidden or shown goes on the recording in progress as the `ui-action`s
    `page-hidden` and `page-visible`, logged before the recorder's hidden flush;
  - `onRecordingsChanged` fires once a new recording is stored and once an ended one is ended;
  - `flush()` flushes every recorder;
  - `sound`, the one `SoundCapture`, records the microphone's levels into every recording in
    progress (below).
- **Sound levels** (T1.24, D-049, D-050). The probe's **Record sound** tap starts them, before
  Connect or during a recording, and they stay on across recordings until **Stop sound**:
  ```
  tap ─▶ SoundCapture.start() ─▶ startSoundMeter (src/platform/sound-meter.ts)
           AudioContext (in the tap) + getUserMedia (no echo cancellation, noise suppression, AGC)
           ─▶ AnalyserNode, fftSize 4096, no smoothing ─▶ every 50 ms: spectrum (dB per bin)
           ─▶ soundLevels(layout 1) (src/core/sound) ─▶ encodeSoundFrame ─▶ Recorder.recordSound
  ```
  Into each recording: `ui-action` `record-sound` with the tap's outcome; `sound-started`
  (`continued` when it was on before the recording began), after the opening events; a `mic`
  frame per reading; `sound-input` when the levels pause or resume (the audio context isn't
  `running`, or the input is muted); `sound-stopped` with its reason. ScaleLinks tells it when
  a recording starts (`recordingStarted`). One `getUserMedia` for the app's lifetime, because
  each one stalls the scale's notifications (D-037); **Try microphone** waits while it runs.
- **`ScreenWakeLock`** (`src/platform/wake-lock.ts`): `acquire()` and `release()`, asked for
  again when the page is visible again, and a status for the UI. Safari grants it only during a
  tap, so the connect taps ask for it.
- **Routes** (`src/ui/route.ts`, D-009): every hash shows the probe until T1.18. `?mock`
  selects the simulator, and `&speed=N` speeds it up.
- **The probe** (`src/ui/probe/`): the connection, warnings, the latest weight frame, commands,
  annotations, the sound levels, the recording's status, weight statistics, the FF12 and FF11
  frames, events, the microphone check, the recordings panel, automatic export and the
  environment. It redraws at most
  every 150 ms (`src/ui/use-live-updates.ts`).

## Signal toolkit (`src/core/signal`, T1.10; D-033)

Generic numerics, pure, over plain arrays (`ArrayLike<number>` in, `number[]` out), knowing
nothing about scales or shots. Indexes and windows count samples; times and steps are in the
caller's unit (seconds in the analysis).

| Function | What |
| --- | --- |
| `resampleLinear(times, values, step)` | Uneven samples onto `start + k × step` by linear interpolation. Samples that share a time count once, with their mean; outside the samples the grid holds the end values |
| `savitzkyGolay(values, { window, order, derivative, step })` | Smoothing or a derivative, one output per value. The ends take the fit over the first or last window |
| `savitzkyGolayCoefficients({ window, order, derivative, position })` | The weights at any position in the window, in window order (not convolution order) |
| `rollingMean`, `rollingVariance`, `rollingRange` | O(n) statistics of every whole window |
| `cusum(values, { reference, slack, threshold, direction, from, to })` | The first alarm and its retrospective change point |
| `fitLine(x, y, weights?)` | An ordinary or weighted least-squares line, with residuals, SSE and R² |
| `mean`, `median`, `quantile`, `mad`, `MAD_TO_SIGMA` | Descriptive statistics |
| `stepAcrossGap`, `rollingStep` | The mean of a window after a gap less the mean of one before it |

- **Window functions** (`rolling*`) return whole windows only: n − window + 1 values, the k-th
  over samples k … k + window − 1, centred at k + (window − 1) / 2.
- **CUSUM's change point** is the first sample after the last moment the sum was empty before
  the alarm: the argmin of the cumulative sum.
- The timebase takes `median` and `quantile` from here.

## Segmentation (`src/core/analysis`, T1.11; D-034, D-058)

```
Timeline ─▶ trustedWeights: weight frames with hasTrustedWeight; the rest counted, refused
         ─▶ readingGrid and snapToGrid: readings within a hundredth of the scale's grid put
            back on it (the Mini's tenths can come a hundredth short, D-058)
         ─▶ quantisationStep q: the smallest change between consecutive snapped weights (A11)
         ─▶ zeroTrack: transitions (runs of jumps faster than any flow)
                       → tares: a logged tare command's step to 0 (from further off, D-059),
                         or a single jump to 0
                       → zero-tracked samples: every tare taken off from its sample on
                       → runs whose changes cancel at once merged (a push that lingered)
                       → other steps by size: vessel placed / lifted (≥ 20 g), other (≥ 1 g);
                         smaller ones are transients (knocks, pushes)
         ─▶ resampleLinear onto the nominal interval (the grid)
         ─▶ stableStretches: the spec's 0.5 s range test, tolerance max(0.05 g, q), only where
            samples back the grid; level and σ (≥ q/√12) from the samples themselves
         ─▶ shotWindows: vessel intervals → plateaus → anchors (firm stretches of 1 s or more,
                         2 s together) → a rise of 1 g or more over 3 s or more, net of every
                         step → windows with baselines
         ─▶ manualStartTimes: the taps made with the pump (Q4)
         ─▶ Segmentation { params, refusedFrames, readingGridG, quantisationG, toleranceG,
                           sigmaFloorG, stableWindow, samples, series, steps, transients,
                           manualStartsT, stretches, shotWindows }
```

- `segment(timeline, events, params?)` is pure. `params` override `DEFAULT_SEGMENTATION_PARAMS`
  (plain JSON, so T1.14 can stamp them); the device-dependent ones are `PROVISIONAL`.
- **Steps:** `{ kind: tare | cup-placed | cup-removed | other, tareSource: command | jump | null,
  startT, endT, sizeG, levelBeforeG, levelAfterG, jumps }`. `startT` is the last sample before
  the change, `endT` the first after it (after settling, for a vessel). Levels are on the
  zero-tracked series; `sizeG` is the reading's change net of the flow, which for a tare is what
  zero-tracking took off. `jumps` tells something set down at once (1) from a vessel settling,
  a burst of beans or a disturbance (more).
- **Transients:** `{ startT, endT, jumps }`, transitions that are no step. A shot's liquid
  leaves their readings out.
- **Stable stretches:** `{ startIndex, endIndex, startT, endT, levelG, sigmaG, sampleCount }`, a
  run of consecutive stable windows on the grid (`startIndex` … `endIndex − 1`).
- **Shot windows:** `{ startT, endT, startIndex, endIndex, baseline { startT, endT, levelG,
  sigmaG, sampleCount }, cupPlaced, cupRemoved, end: cup-removed | cup-placed | next-shot |
  recording-end, riseEndT, riseG }`. Net weight in a window is the `series` value less
  `baseline.levelG`; honest yield is `cupRemoved.levelBeforeG − baseline.levelG`. The baseline
  ends where the level stopped holding still: near `pump_on` when the pump's vibration shows,
  else near `first_drip`. It's where T1.12 and T1.13 start looking, not a marker. Other steps
  of several jumps between the baseline's end and `riseEndT` are the pour itself (`pourStep`):
  the liquid keeps them, and only leaves their readings out. Once pump_on is known, the markers
  measure the yields from the stable level before it instead (`prePumpBaseline`, D-059).
- The zero-tracked level is relative to the scale's zero when the recording started, so a
  baseline is the cup's weight when the platform started empty.
- `samples` and `series` are working data for the markers; T1.14 decides what the derived cache
  keeps.

## Analysis pipeline (T1.9–T1.16)

1. Decode frames: drop invalid ones; refuse, and count, frames whose unit or sign byte is unknown
   (T1.9, T1.11).
2. Build the timeline (T1.9).
3. Find the steps on the samples and zero-track: take off the tares, from the event log and
   from single jumps to 0 (T1.11).
4. Resample onto a uniform grid (T1.11).
5. Find stable stretches and the noise floor, with a quantisation floor on σ (T1.11).
6. Find shot windows, each with its baseline and σ (T1.11).
7. Take each window's liquid: the zero-tracked weight less its baseline and any other steps
   inside it that are something set down, such as a spoon (T1.12); readings inside a step's
   transition or a transient are left out (D-058). Smooth it and take its derivative with a
   quadratic Savitzky–Golay filter (window `sgWindowS`, 0.5 s, provisional).
8. Find markers (`shotMarkers`: first_drip, then `pumpMarkers`, then `liquidMarkers` with the
   pump_off found and its drain; T1.12, T1.13, D-035, D-036). Once pump_on is known, the yields
   are measured from the stable level just before it, not from the window's baseline, which
   can sit in a dip the pump makes (`prePumpBaseline`, D-059); `ShotMarkers.window` carries that
   baseline:
   - `first_drip`: a CUSUM on the pre-infusion's noise detects the rise, and a fit of the
     initial rise (parabola or line, half a drop ahead) times it;
   - `pump_on`: the likeliest split of the still, pre-drip noise into a quiet level and a louder
     one. The vibration must show and the mean must stay stationary. Otherwise it is the last
     manual start (the Tare + start tap, Q4) at most `manualStartS` before the first drip,
     flagged `manual-pump-on`, as on the real scale (D-058); else null;
   - `pump_off`: the knee where a parabola (pump-driven) gives way to an exponential drain
     (`fitKnee`, τ from 0.05 s). With the vibration it is weighted by the step in the noise
     variance there. Without it, it is the regime-change fallback, flagged. Either way its
     drain (`PumpMarkers.drain`: τ, the flow and the weight at pump_off) goes on to the liquid
     markers, and gives w(pump_off) (D-059);
   - `settled`: measured where the smoothed liquid stops moving, or extrapolated from the tail
     fit;
   - `cup_removed`: the window's `cupRemoved` step, with the honest yield.
9. Fit the tail from pump_off: τ from a weighted `ln(flow)` fit, refitted with weights from its
   own prediction. Then `w_final`, averaged over the tail's last second (T1.12). A drain too
   fast for the smoothed flow (the real machine's τ is about 0.2 s) takes the knee's drain
   instead (`drainTail`, `source: knee`), when its τ reaches `minDrainTauS` (D-059).
10. Compute the metrics from the markers (T1.14, `metrics.ts`).
11. Stamp the result with `ANALYSIS_VERSION` and its parameters (T1.14, `analyzeRaw`).
12. Match the recording's shots to the segments (T1.14, `matchShots`): on every read, from the
    shots as they are, never cached.

The whole pipeline is pure and deterministic. Bump `ANALYSIS_VERSION` (`version.ts`) whenever
outputs change; the runner re-derives across history.

## Analysis results and the runner (`src/core/analysis`, `src/app/analysis-runner.ts`; T1.14, D-047)

```
RawRecording ─▶ analyzeRaw (pure) ─▶ AnalysisRun { analysis: RecordingAnalysis (JSON, cached),
                                                   timeline, segmentation, markers (working) }
RecordingAnalysis + the recording's shots ─▶ matchShots (pure) ─▶ ShotMatching { shots[] (segment
                                             or unmatched: no-segment | claimed, ratio), claims[],
                                             postHoc[] (espresso-like segments no shot claims) }
AnalysisRunner.analyze(recordingId):
  ended ─▶ derived cache (recording, version; shape, version, parameters and lastSeq checked)
           or analyzeRaw
        ─▶ shots.createMissing: post-hoc shots for postHoc, in the transaction that reads the
           shots ─▶ RecordingResults { recording, analysis, cached, shots (each with its segment
           and match), unclaimed segments, created }
  open  ─▶ analyzeRaw on the frames so far; nothing cached, no post-hoc shot
AnalysisRunner.reanalyzeAll(): clear the cache, analyse every ended recording
```

- **Segments and shots.**
  - A segment's shot runs from pump_on (else first_drip, else the baseline's end) to the
    window's end. When the next shot pours into the same cup, it ends where this one settled,
    else at pump_off, whichever comes before the next start.
  - Shots never overlap (`shotSpans`).
  - Each shot claims its nearest segment within `MATCH_SLACK_S` (10 s); within 1 ms the later
    segment wins. Several claimants go in this order: one the user made before a post-hoc one,
    a standing one before a discarded one, then the nearer.
  - A shot that loses its segment stays unmatched. A discarded shot still claims (D-019).
- **Post-hoc shots** are made only for segments that look like espresso (`espresso`: a
  pump_on, or a pump_off with a draining tail). They are anchored at pump_on, else first_drip,
  and only where such a shot would claim its segment, so no round asks twice. Pours of beans,
  ground coffee or milk stay unclaimed segments until containers label them (T2.4, T2.5).
- **The cache** holds ended recordings' results only, and an entry stands only while no raw
  record has been stored after its `lastSeq`. Ratios and matching never enter it, so editing a
  shot never makes it stale. `services.analysis` (`startApp`) is the runner; nothing calls it
  yet (T1.18, T1.19).

## Inspection CLI (`src/core/inspect`, `scripts/analyze.mjs`; T1.15, D-051)

Agents can't see the phone, so `npm run analyze` turns exports into what they can read: JSON,
and charts as SVG and PNG.

```
export files ─▶ parseExport ─▶ per recording: analyzeRecording(raw, its shots, --param overrides)
  ─▶ report: analysis (as the cache keeps it), the pump detectors' diagnostics, matching, events,
             the simulator's truth and the error against it (--simulate)
  ─▶ charts: the whole recording (reading as sent, zero-tracked, steps, windows, sound levels)
             and each segment (liquid with the drain model, derived flow with the scale's own
             figure, detrended variance with the detectors' noise levels, sound levels), with the
             markers, the truth and the app events as vertical lines
scripts/analyze.mjs: argv, files in and out, PNGs with Playwright's Chromium (--png)
```

- **Pure, like the rest of core.** `inspect(inputs, options)` takes export text and gives the
  report and the charts' SVG; `parseAnalyzeArgs` reads the command line; `simulatedExport` writes
  a simulated session through the export serialiser and keeps its truth; `summarise` prints a
  few lines per segment. The shell only reads and writes files.
- **Charts** are built as `ChartSpec`s (`charts.ts`) and laid out by `renderChart` (`chart.ts`)
  on a small SVG kit (`svg.ts`): stacked panels on one time axis, each with its own y axis and
  its own legend, and marks across them all, labelled in rows that don't overlap. A segment
  chart spans its shot: from 5 s before it starts (a Tare + start tap up to 10 s before the
  window counts) to 8 s after it settles, or to the cup's removal when that comes within 15 s.
- **Detrended variance** is the variance of the liquid's residuals from its own smoothing (the
  analysis's SG window), over 1 s, divided by 1 − c₀ (the fit's centre weight) so that it
  estimates the noise variance, as the pump detectors' levels do.
- **Running TypeScript in Node:** `scripts/typescript.mjs` registers a resolve hook for the
  extensionless imports that Vite allows, and Node strips the types itself (Node 22.18 or
  later). `src/` uses only erasable syntax (`erasableSyntaxOnly`), which is what Node strips.
  No build step and no dependency.

## Live pipeline (T1.17)

decode → causal EMA of weight, causal flow → stability → display state machine (idle, cup on,
armed, tare fired, running, tail, done; arm-once tare via `07`) → remaining-to-target → UI.
It is display-only and never stored. If it misfires, the record is untouched.

The probe's statistics live here too (T1.8): `ProbeMonitor` keeps the last frames as hex, the
timer's and arrivals' gaps, the longest silence, the weight's mean and σ over 0.5, 2 and 10 s,
the smallest weight step and the byte values seen, built on `TimeWindow` and `RecentValues`
(`window-stats.ts`).

## Simulator (`src/core/sim`, T1.3, T1.22; D-021)

A deterministic simulation of a scale session, with exact ground truth. It is the test bed for
M2 until real shots are recorded (D-013), and it drives `MockTransport`. Since T1.22 its scale
and link follow hardware session 1 (D-037), and since T1.16 its shots follow session 2's (no
vibration, a drain with τ 0.2 s, a first lump; D-059); what the sessions didn't show is
assumed, as D-021 lists. Every parameter and its default is documented in `params.ts` (scale and link) and
`shot.ts` (shots).

```
script (cup on/off/back, shot, pump, bump, tare button, command, power-off)
  → WeighingPlatform: vessel settling in and out, liquid in a first lump and then whole drops
    (into the cup, or onto the platform when there is none), bumps  → noise-free gross mass
  → scale firmware, in its mode (timer, automatic, flow rate): samples on a drifting, jittered
    clock; noise, plus any vibration while the pump runs (none by default); smoothing; tare
    offset; 0.1 g rounding, sent as the Mini does (a float32 ×100, truncated); a timer that
    counts samples; commands; the automatic mode's own tares and runs
                                                        → 03 0B frames on FF11, 03 0D on FF12
  → Link: latency, connection-event grid, retransmissions, jitter, stalls (bursts), drops, bit
    flips, truncation
  → frames with arrival times, each carrying its truth
```

- **Shots** (`shot.ts`): `pump_on`, then no liquid for the pre-infusion, then the flow profile
  until `pump_off`, then an exponential tail with τ, continuous at `pump_off`. The flow is
  scaled so that everything delivered equals `yieldG`. The first liquid lands as one lump
  (`firstDropG`), and the drops resume once the stream has caught up with it.
- **The firmware works sample by sample.** Each sample it reads the weight, adds a tick to a
  running timer and sends the frame; then it does any tare or timer start it was asked for, and
  in the automatic mode acts on a vessel put on or the first liquid (`AUTOMATIC_MODE`).
- **Commands** are bytes: the simulated scale parses them as firmware would, takes them
  `commandLatencyMs` after the write, and acts as its mode does: a stop or a reset at once, a
  tare or a start once the next frame is out, `07`'s start a frame after its tare. A command its
  mode or state doesn't take is a no-op. It throws on calibration or shutdown bytes as a
  tripwire.
- **Ground truth** (`SessionTruth`): per shot the markers and the spec's metrics, in liquid
  terms (independent of tares); every physical event; every command with its effect; tares;
  timer changes; lost frames. Each frame has its own truth: sample time, gross mass, offset,
  noise, pump state, the weight and timer it carries, and any damage.
- **Determinism:** one seed, one named random stream per effect, a fixed number of draws per
  sample and per frame. A session doesn't depend on how it is stepped, and switching one effect
  on (vibration, drops, a flush, retransmissions) leaves everything else unchanged.
- **Entry points:** `simulateSession(scenario)` runs a whole session; `toRawRecording(session)`
  turns it into a `Recording` with `RawFrame`s and `AppEvent`s, as the recorder would store it;
  `espressoScenario()` and `demoScenario()` build the usual sessions, in the timer mode
  (`espressoScenario({ manualStartMs })` adds the Tare + start tap with the pump, Q4);
  `ScaleSimulator` steps through time for streaming use (`advanceTo`, `write`, `nextWakeMs`).
  `scale: { mode: 'automatic' }` or `'flow-rate'` gives a scale left in another mode (D-038).

## Testing

- Unit tests live next to the code (`*.test.ts`), run by Vitest in a Node environment.
- Storage tests use `fake-indexeddb`: `freshIndexedDB()` (`src/storage/fake-idb.ts`) gives each
  test an empty database. Node has no Web Locks, so app tests use `FakeLocks`
  (`src/app/fake-locks.ts`), one instance per origin.
- Analysis and live tests use simulator ground truth (`src/core/sim`). For exact checks, turn
  noise, jitter and stalls off through the scenario's `scale` and `link` parameters, and set
  `resolutionG: 0.01` (the default is the scale's 0.1 g). The tests of the targets the user
  agreed run in the world they were agreed in (D-046, D-059; `test-runs.ts`): `AGREED_SCALE`
  (0.01 g steps, the vibration, 0.05 g drops), `AGREED_SHOT` (τ 1.5 s, no lump) and
  `AGREED_LIQUID` (the analysis told so), until T1.16 re-agrees them. The variance detector's
  tests keep the vibration on purpose (`VIBRATING_SCALE`).
  Zero-tracking is checked frame by frame: a zero-tracked sample should equal its frame's
  reading plus the scale's true zero (`FrameTruth.weightG + offsetG`, from the first zero).
- Export tests share `src/core/export/test-samples.ts`: a bundle with every event type, damaged
  and FF12 frames, an open recording, shots with every field set and with none, and settings.
- Transport and service tests run `MockTransport` on a `ManualClock`, which makes them
  deterministic and instant.
- Real recordings in `fixtures/real/` (exported by the probe, U1.1; each described in its
  README) are regression tests. `src/core/real-fixtures.test.ts` imports each file as text
  (`?raw`), reads it with `parseExport`, and checks what the hardware answers rest on, through
  the decoder, the timeline and the segmentation. It also holds an idle simulated session up
  against session 1 (the steps, the sample period and drift, the timer's ticks, the still
  reading, the link) and replays session 1's timer commands into the simulator (T1.22).
  What the analysis still gets wrong on a real shot is an `it.fails` test, which turns red once
  fixed: make it an `it` then (session 2, D-048).
- Automatic export tests run against `FakeGitHub` (`src/app/auto-export/fake-github.ts`), an
  in-memory `fetch` that checks the token, the `sha` rules and the headers GitHub's CORS
  preflight allows.
- UI testing is smoke-level only for now. Chromium and Playwright are available in the agent
  environment, and the mock transport makes UI flows runnable without a scale. `npm run e2e`
  builds and runs `scripts/e2e-probe.mjs` (the probe under `/smart-scale/` at phone width, with
  the mock; T1.8), then `scripts/e2e-auto-export.mjs` (automatic export against a stand-in for
  `api.github.com`; T1.20). Shared helpers are in `scripts/e2e-lib.mjs`. They use the
  environment's global Playwright, so CI doesn't run them.
- The inspection CLI's report and charts are tested in `src/core/inspect` on simulated exports
  and on `fixtures/real/`. `scripts/analyze.test.mjs` runs `scripts/analyze.mjs` as a process,
  which is the only test of the TypeScript loader; Vitest picks up `scripts/**/*.test.mjs`
  for it.
