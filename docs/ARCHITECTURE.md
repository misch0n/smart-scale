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
| `src/core/live` | Causal display pipeline, stability, tare arming, display state; the probe's statistics; the scale's mode (T1.25) | protocol, model, signal |
| `src/core/sim` | Deterministic simulated sessions with ground truth | protocol, model |
| `src/core/sound` | The microphone's sound levels: a spectrum's band levels, and the `mic` frame's bytes (T1.24) | — |
| `src/core/export` | Export format, validation, migrations | protocol, model |
| `src/core/inspect` | The analysis inspection CLI's core: its command line, the JSON report, SVG charts, simulated exports (T1.15). The app never imports it | protocol, model, timebase, signal, analysis, sim, sound, export |
| `src/transport` | `ScaleTransport` interface, Web Bluetooth and mock implementations | core |
| `src/storage` | IndexedDB repositories | core |
| `src/app` | Services wiring things together: startup, links with their connectors and mode checks, recorder, analysis runner, export, automatic export, the entities in memory, the brew flow and its settings, the history and its shot editor | core, transport, storage, platform |
| `src/platform` | Browser APIs outside BLE and storage: capabilities, build info, wake lock, microphone and its level meter, share | core |
| `src/ui` | Preact components: the Instrument look (`theme.css`, D-069), Home (`home/`) and the tab bar (`TabBar.tsx`), the brew flow (`brew/`), the history (`history/`), Setup (`setup/`), the probe (`probe/`) | app, core, platform |

Enforced by `eslint.config.js` (D-010):

- `src/core/**` has no DOM globals and no Preact, and imports none of transport, storage, app,
  ui or platform.
- `src/core/analysis/**` does not import `src/core/live/**`, nor the reverse (T1.17).
  `src/core/live/boundaries.test.ts` runs ESLint on files that would cross, both ways.
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

## Data model (`src/core/model`, T1.2, T2.1)

Every stored record carries every field, with `null` meaning "not set, hidden or not
applicable". A field is never absent (spec: "Schema rules"). Each record type has a runtime
schema, and its normaliser (`normaliseRecording`, `normaliseRawFrame`, `normaliseAppEvent`,
`normaliseShot`, `normaliseEntity`) fills a missing nullable field with `null`, drops unknown
keys, and throws `SchemaError` with a path on anything malformed (D-018). Storage normalises every record it
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
             // the grades (D-054)
             direction: 'sour'|'balanced'|'bitter'|null, channelled: boolean|null,
             tags: string[]|null,
             // the extraction's target, and the snapshot at brew time (T1.18, D-068)
             doseG|null, targetRatio|null, recipeId|null, recipeName|null, milkRatio|null,
             beansPhase, grindPhase, milkPhase: 'done'|'skipped'|null,
             beansWeighedG|null, groundG|null, milkG|null,
             machineId|null, machineName|null, pressureBar|null, basketId|null, basketSizeG|null,
             grinderId|null, grinderName|null, grindSetting { kind: 'stepless'|'clicks', value }|null,
             burrEpochId|null, packId|null, packName|null, packRoastDate|null, packOpenDate|null,
             containerId|null, lastDescaleDate|null, lastBackflushDate|null,
             lastGrinderCareDate|null }                       // dates as 'YYYY-MM-DD'
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
Entities   (T2.1, D-074) each { id, createdAtEpochMs, updatedAtEpochMs, removedAtEpochMs|null, … }
  Machine    { name, pressureBar|null, baskets [{ id, name|null, sizeG }],
               descale, backflush: { lastDoneDate|null, reminderDays|null } }
  Grinder    { brand, model, settingKind: 'stepless'|'clicks', currentSetting|null,
               care: { lastDoneDate|null, reminderDays|null } }
  Recipe     { name, coffeeRatio, milkRatio|null }
  CoffeePack { brand|null, name, weightG|null, roastDate, openDate|null, flavours: string[],
               finishedDate|null, buyAgain: boolean|null }
  Container  { name, emptyMassG, roles: ('bean'|'grind'|'cup'|'milk')[], dismissedWarningIds }
  Tag        { name, group|null, isDefault }
Settings   (kv) the brew's last used, by id, and the dose (T1.18, T2.1; D-067, D-074):
           lastUsed.recipeId, lastUsed.doseG, lastUsed.machineId, lastUsed.basketId,
           lastUsed.grinderId, lastUsed.packId. No learning model for now
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
- **The snapshot** (T1.18, D-068): a shot keeps its context as values at brew time next to the
  ids, so later edits to equipment never rewrite history. A phase is `done` or `skipped` beside
  its result, `null` when it wasn't offered. Nothing derivable is stored (retention, days off
  roast, targets). `beanBagId` was renamed `packId` in format version 3; `normaliseShot` still
  reads the old name. `shotSnapshot(context)` makes the snapshot from the entities a brew used
  (T2.1).
- **Entities** (T2.1, D-074): what the user sets up, edited in Setup (T2.9) and during the
  phases. Removing one sets its tombstone `removedAtEpochMs`, never deletes it, so an import
  that keeps this device's metadata doesn't bring it back (one that replaces it does);
  `isListed` leaves removed ones out of the pickers. Maintenance dates
  live on the machine (descale, backflush) and each grinder (care). Which one a brew uses is the
  last used, in `kv` by id: the default is the last used, so no entity has a default flag (a
  tag's `isDefault` means "on for new shots"). `createEntity`, `updateEntity` and
  `sameEntityIdentity` (id and creation time) work for every kind.
- **Seeds** (`seeds.ts`): the spec's machine, basket and grinders, its seven recipes and T1.18's
  seven tags, with fixed ids at `SEED_EPOCH_MS`, so an untouched seed is the same record
  everywhere; `isPristineSeed` tells one apart. Frozen: the migrations use them.
  `legacy-settings.ts` converts T1.18's `tags` and `lastUsed.recipe` settings, also frozen.
- **JSON.** Every record is JSON-native apart from frame bytes, which the export writes as hex.
  Command bytes in events are packed upper-case hex.
- **Evolution.** A field added later must be nullable, so old records read as `null`, or come
  with a migration. An event type added later makes older builds refuse records that use it,
  loudly, rather than drop them.

## Timebase (`src/core/timebase`, T1.9; D-006, D-032, D-063)

Each frame has two clocks:

- **Arrival**: `performance.now()` in the notification handler, relative to recording start.
  Always present, but jittered by BLE connection intervals and notification batching.
- **Device ms**: frame bytes 2–4. This is the scale's stopwatch. It is meaningful only while
  it advances; it reads zero before `07`/`04` and freezes after `05`.

```
RawFrame[] ─▶ decodeWeightFrames (FF11 weight frames that decode, seq order)
           ─▶ deviceRunIndexes: timer strictly increasing; no 0, no value a neighbour repeats
           ─▶ one rate for all runs (robustSlope: least squares, each run its own intercept,
              stalls trimmed; rate 1 under 3 s of runs or beyond 2% drift, D-064)
           ─▶ each run's offset: the line under its frames, touching the fastest (D-006)
           ─▶ the frames between runs, on the scale's sample grid (D-063): stretches cut at a
              gap of 1.5 periods or a hidden lost frame; each part of 10 frames or more timed
              offset + period × k, the period the runs' (rate × the timer's tick) or else the
              stretches' own, the offset under its fastest frame, unless its arrivals drift
              from that grid
           ─▶ what's left: arrival − median jitter, held between their neighbours
           ─▶ Timeline { samples: { seq, t (s), timeSource, run, arrivalT, frame }, runs,
                         rateSource, driftPpm, jitter, arrivalCorrectionMs, gridPeriodMs,
                         nominalInterval }
```

- `buildTimeline(rawFrames)` is the analysis's first step after decoding: each sample carries
  its decoded `WeightFrame`, so nothing decodes twice. `t` never decreases; bursts of
  arrival-timed frames can share a value.
- `t` is the sample time plus the link's least latency and the wait of the run's fastest frame:
  constants a recording can't reveal, a few ms apart between runs. Durations and rates don't
  depend on them.
- Each run reports its own drift when it spans 3 s (`ownDriftPpm`, the drift check), and its
  jitter (arrival − mapped time); the timeline reports the drift, the jitter over all runs and
  the nominal sample interval.
- The real scale (D-037) counts 100 ms ticks in the timer field, one per sample, on a clock
  0.7% slow: the rate fit takes that as drift (−6,937 ppm), and a tick that comes twice splits
  a run. Its timer runs only when started, so most frames are timed by the grid: it samples
  all the time, and the link lost no frame in 9,444, so the frames between runs sit on the
  same grid, late by the same delays (session 2: a median of 16.5 ms, 31 ms at p95).
- `timeSource` says which: `device` (the timer), `grid`, or `arrival` (a stretch too short to
  fit, or one whose arrivals drift from the grid, as lost frames would make them).
- Simulated that way (T1.22), device-timed frames are within 2 ms of their samples (around one
  constant) on session 1's link, and within 5 ms with ±50 ms of jitter. Limits (a sample period
  that is a multiple of the connection interval, a scale that barely drifts) are in D-032.

## Transport (`src/transport`, T1.3, T1.4; D-020, D-022)

`ScaleTransport` (`types.ts`) is the only way to the scale: `connect()`, `disconnect()`,
`send(command)`, `onNotification`, `onStatus`, plus `kind`, `status`, `now()` and `available`
(whether the runtime has Web Bluetooth yet: a shim may inject it late), and the optional
`reconnectKnownDevice(deviceId?)`, present only where the runtime can reconnect without the
chooser. `disconnect()` leaves the status `disconnected` before it returns, so a tap can cancel
an attempt and open the chooser in one go (D-071).

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
  message naming the step; a dropped link gives reason `device`. No reconnect loop here (the
  app's `ScaleConnector` does that, below), no timeouts. `reconnectKnownDevice(deviceId?)` uses
  `getDevices()` and needs no user gesture: it takes the device with that id, else this page's
  last one, else any `BOOKOO…` name.
- Listeners are called synchronously, through `Emitter` (`emitter.ts`). A value emitted from
  inside a listener is delivered after the current one, so every listener sees statuses in
  order.
- Errors are `TransportError` with a `code`: `busy`, `connect-failed`, `no-known-device` (the
  browser lists no scale: only the chooser can connect), `not-connected`, `disconnected`,
  `refused` or `write-failed`.

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
| `machines`, `grinders`, `recipes`, `packs`, `containers`, `tags` | `id` | the entities (T2.1, D-074), one kind each: removed with a tombstone, never deleted | `entities`: `create`, `get`, `update`, `replace`, `list(kind)`, `all` |

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
  stores above but `local` and the entities; version 2 (T1.20) adds `local`; version 3 (T2.1)
  adds the six entity stores with their seeds, and moves T1.18's `tags` and `lastUsed.recipe`
  settings into them (tags, `lastUsed.recipeId`), reading `kv` inside the upgrade transaction.
  When another tab upgrades the database, this one closes its connection and then fails with
  `newer-version` (reload).
- **Entities** change through `update` (which a removal and a restore are too); an import that
  replaces one uses `replace`, which refuses another creation time.
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
  entities: { machines, grinders, recipes, packs, containers, tags } | null,                                    metadata (v4)
  settings: { key: JSON } | null }
```

- **Core** (`src/core/export`, pure): `serialiseExport(bundle)` and `parseExport(text)` convert
  between the file and an `ExportBundle` of model records. Every record goes through its
  normaliser both ways (D-018); the parser also checks seq order and unique ids, refuses a newer
  `formatVersion` with a clear message, and upgrades older ones through `EXPORT_MIGRATIONS`.
  The layout is one record per line. `recordingExportFileName` and `allExportFileName` name the
  files.
- **App** (`src/app/export.ts`): `exportRecording(storage, id, options)` (the recording and its
  shots), `exportAll(storage, options)` (everything, with the entities and the settings) and
  `exportEntities` (the entities alone, for automatic export) return the file name, its text
  and a summary. `importBundle(storage, bundle, { metadata })` merges a parsed file: raw
  already stored is skipped (raw is never replaced), a new recording is stored whole in one
  transaction, a recording the file holds open is stored ended as `unclean`, and stored shots,
  entities and settings are kept (`keep`, the default) or replaced (`replace`); a seed nobody
  changed takes the file's version either way (D-075). It returns a report.
- **UI**: the probe's export panel (`src/ui/ExportPanel.tsx`) prepares a file, then offers a
  download link (`<a download>` on a blob URL) and, where `navigator.canShare({ files })` says
  yes, the share sheet (`src/platform/share.ts`). Import takes a file from a file input. It
  flushes the recorders before each export.
- Derived data and live values aren't exported. Version 2 (T1.24) added the `mic` frames and
  the sound events; version 3 (T1.18) the shot's snapshot, and renamed `beanBagId` to `packId`;
  version 4 (T2.1) the entities, converting T1.18's `tags` and `lastUsed.recipe` settings as
  the database does. Older files import, their new fields null.
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
- **The entities' file** (T2.1, D-076): `<prefix>entities.json`, `exportEntities`' file, after
  the recordings in each pass, with its own ledger entry (`autoExport.entities`, a digest of the
  entities). Only once something in them is the user's (no file for seeds as seeded); held while
  the repo's copy has an entity this device lacks or a newer version of one
  (`compareEntitiesWithRemote`). `entitiesChanged()` (debounced) after each stored change.
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
ScaleLinks.get(spec) ─▶ link { transport, recorder, monitor, shot, connector, mode }, made once
   per spec and kept; spec: { kind: 'web-bluetooth' } | { kind: 'mock', speed, mode? }
   (key web-bluetooth, mock@<speed>, or mock@<speed>/<mode> for a mock scale in another mode)
```

- **`AppServices`** (`startApp`): storage, the persistence answer, the recovery result (or its
  error), the links, the wake lock, automatic export, the analysis runner, the brew flows and
  the history. `src/ui/App.tsx` starts them once and shows the startup state until they are
  ready. When the stored recordings change, the history first analyses any that ended (their
  post-hoc shots), then automatic export looks for closed ones (D-070).
- **`ScaleLinks`** holds one transport, its one recorder (D-024), a `ProbeMonitor`, a
  `LiveShot` (the brew flow's `ShotMonitor`, fed from the link's first use), a
  `ScaleConnector` and a `ScaleModeCheck` (both below) per kind. Across the links:
  - the screen wake lock is wanted while any link is connected, and from a tap that connects
    (the connector acquires it in the tap) until that fails; not while an attempt of the
    connector's own waits for the scale (D-071);
  - the page being hidden or shown goes on the recording in progress as the `ui-action`s
    `page-hidden` and `page-visible`, logged before the recorder's hidden flush;
  - `onRecordingsChanged` fires once a new recording is stored and once an ended one is ended,
    never after a connect that failed;
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
- **`ScaleConnector`** (`src/app/scale-connector.ts`, T1.21, D-071) connects and reconnects:
  ```
  start ─▶ storage.local 'scale.knownDevice' ─┐
         ─▶ transport.available? every 250 ms ┴─▶ (a remembered scale) reconnectKnownDevice(id)
  connected ─▶ remember { id, name }        dropped ─▶ 1 s ─▶ attempt
  attempt failed ─▶ 1, 2, 4, 8, then every 10 s ─▶ attempt   (page shown again ─▶ at once)
  no-known-device ─▶ stop: Connect opens the chooser          Stop (disconnect) ─▶ stop
  tap: connect() ─▶ reconnect() without the chooser where it can, else choose()
       choose() ─▶ cancel the attempt, requestDevice() in the same tap
  ```
  `state` holds whether Web Bluetooth is there (`checking`, `available`, `unavailable` after
  10 s), the remembered scale, whether it is reconnecting by itself, whether a tap can reconnect
  without the chooser, the failures and the last error. `connectionView(status, state)` reduces
  it to what the screens show: `connected`, `connecting` (a tap's), `waiting`, `checking`,
  `unavailable` or `disconnected`. The mock's link remembers its scale for the page only.
- **`ScaleModeCheck`** (`src/app/scale-mode.ts`, T1.25, D-073) says whether the scale is in its
  timer mode (D-038), from the frames and the log (`ScaleModeMonitor`, below), and checks:
  ```
  frame: timer reads 0, no start awaited, live shot idle, not known to be the timer mode,
         and no check in the last 5 s ─▶ 04 'mode-check' (recorder.sendCommand)
  its start seen (within 0.5 s; up to 1.5 s behind a stall) ─▶ the timer mode ─▶ 05, 06 (if idle)
  no start in 0.5 s and 5 frames ─▶ not the timer mode: the warning; again 5 s on while idle
  03 0D frame ─▶ not the timer mode (the automatic mode's run)
  ```
  `state`: the verdict (`unknown`, `timer`, `not-timer`), the evidence, `checking`, the checks
  sent and the last error, per connection. Home's scale card, the brew screen's notices and the
  probe's Connection panel show the warning; nothing is stored.
- **`ScreenWakeLock`** (`src/platform/wake-lock.ts`): `acquire()`, `release()` and `retry()`,
  asked for again when the page is visible again, and a status for the UI. Safari grants it
  only during a tap, so the connect taps ask for it, and every tap calls `retry()` (`App.tsx`):
  a scale that reconnected by itself gets the lock at the next tap.
- **Routes** (`src/ui/route.ts`, D-009): `#/` is Home (T1.23), and so is every hash it doesn't
  know; `#/brew` is the brew flow (T1.18); `#/history`, `#/shot/<id>` and `#/compare/<a>/<b>`
  the history (T1.19); `#/setup`, `#/setup/<section>` and `#/setup/pack/<id|new>` Setup (T2.9,
  D-077); `#/probe` the probe, a row of Setup (D-072). `?mock` selects
  the simulator on any of them, so links keep it, `&speed=N` speeds it up, and
  `&mode=flow-rate` or `&mode=automatic` leaves its scale in another mode (T1.25); `?debug` shows a
  shot's record on its page, and `#/history?pick=<id>` opens Compare mode with that shot
  picked. `linkSpecFor(route)` names the link.
- **The probe** (`src/ui/probe/`), in its own plain layout with the tab bar: the connection,
  warnings, the latest weight frame, commands, annotations, the sound levels, the recording's
  status, weight statistics, the FF12 and FF11 frames, events, the microphone check, the
  recordings panel, automatic export and the environment. It redraws at most every 150 ms
  (`src/ui/use-live-updates.ts`), and once after it subscribes, so a change between the first
  render and the subscription isn't lost. Its connection panel goes through the connector and
  shows its state (B3).

## Brew flow (`src/app/brew-flow.ts`, `src/ui/brew/`; T1.18, D-067)

```
link.shot (LiveShot: ShotMonitor fed by recorder.onFrame/onEvent) ──events──▶ BrewFlow (while attached)
  tare / shot-done / pump-lapsed ─▶ scaleCommandsFor ─▶ recorder.sendCommand (D-066)
link.vessel changes, every frame ─▶ PhaseRouter (T2.5) ─▶ flow.phases, flow.dose (ground ?? beans ?? basket)
                                  └▶ each PhaseChange ─▶ recorder.logUiAction('phase', { phase, state, by })
  pump-on (else first-drip) ─▶ the cup's container: link.vessel.onScale.container (T2.4)
  shot-done ─▶ shots.create(live shot at the event's tMs, default tags, snapshot, containerId,
                            beansPhase and grindPhase done or skipped; doseG null: the analysis's)
            ─▶ recorder.flush ─▶ analysis.analyze(recording) now, +3 s, +10 s ─▶ the card's result
Start tap ─▶ logUiAction('manual-start') + 07 ('manual-start')
grades ─▶ shots.update, in order, as tapped; Save ─▶ all of them, channelled false if left off
BrewPreferences (Entities + kv lastUsed.*) ─▶ the target, dose × coffee ratio; the snapshot
```

- **`BrewFlows`** (`services.brew`) makes one `BrewFlow` per link and keeps it, so the shot card
  outlives the screen. The screen attaches it while shown (`attach()` returns the detach); the
  probe never does, so it never tares a cup during hardware tests.
- **`BrewFlow.state`**: the card (the shot as the card holds it, the live display at "shot
  done", the latest analysis result, and why storing or analysing failed) and the last command
  that failed. Connecting is the link's connector's: the extraction screen shows its
  `ConnectCard` (`parts.tsx`) until the scale is connected, and the top bar its state.
- **`BrewPreferences`** (`src/app/brew-settings.ts`): the stored recipes and tags (T2.1), the
  machine, basket, grinder and pack in use (the last used, `resolveBrewSettings`, D-074) and the
  dose (5–30 g, in tenths), from `Entities` (`src/app/entities.ts`, the entities in memory,
  written behind) and `kv`, read leniently and stored behind each change. At "shot done" the
  flow records them on the shot with `shotSnapshot` (D-068).
- **The phases' equipment** (`equipment.tsx`, T2.6, D-080): rows of pickers (`PickerRow`), each
  the last used and a grid to pick another, which becomes the default (`BrewPreferences`
  setters): the beans phase's machine, basket and pack (`BeansEquipment`).
- **The screens** (`src/ui/brew/`): `BrewScreen` picks the board from the state: the card while
  one is open, the live view while the shot pours (`running`, `tail`), else the extraction
  screen. `ReadyView` (Brew-Ready), `LiveView` (Brew-Shot), `ShotCardView` (Brew-Finish), and
  `ShotChart` with its geometry in `chart.ts` and the numbers' formats in `format.ts`. They
  redraw at most every 100 ms. `Grades.tsx` (with `grades.css`) is the taste, channelling and
  tags, shared with the history's shot page.

## Home and the tab bar (`src/ui/home/`, `src/ui/TabBar.tsx`; T1.23, D-072)

```
HomeScreen ─▶ services.links.get(spec): the link, so the reconnect starts on the landing page
  ScaleCard: connected ─▶ name, battery, link.shot.snapshot().readingG, Tare ─▶ recorder.sendCommand(01, 'home')
                         link.mode.state.verdict 'not-timer' ─▶ the mode warning, a caution line (T1.25)
                         link.vessel.onScale ─▶ the container row: put one down, recognised or
                                                picked, which one (chips), or not known (T2.4)
             otherwise ─▶ ConnectBody (src/ui/brew/parts.tsx): Connect, Stop, Choose scale, Reload
  History.load() ─▶ homeSummary(entries, now) (summary.ts, pure) ─▶ the last shot, the last 7 days
TabBar: Home #/ · Brew #/brew · History #/history · Setup #/setup (the probe a row there, T2.9)
```

- **The tab bar** sits beside the `<main>` of Home, History, a shot, Compare, Setup and the probe, fixed
  at the bottom; `--tabbar-h` (`theme.css`) is the room they leave for it. The brew flow is in
  focus mode without it, and its ✕ goes Home. The links keep `?mock`.
- **Home's figures** come from the history's entries, so from the analysis's cache: the newest
  listed shot, and the history's "Last 7 days" (today and the six days before, local time) with
  each average over the shots that have its figure. It reloads as History does
  (`useHistoryLoad`), and redraws the scale at most every 100 ms.
- **Shared with the other screens**: `src/ui/icons.tsx` (the boards' icons), `src/ui/notices.tsx`
  (the recorder's warnings and the backup reminder, on Home and the brew screen; the mode
  warning's text, and its notice on the brew screen), and the notices' styles in `theme.css`.

## Setup (`src/ui/setup/`; T2.9, D-077)

```
SetupScreen (route.setup) ─▶ the list, or a board's screen: Machine · Grinders · Recipes · Packs · Pack
                             · Containers · Tags · Microphone · Backup (the AutoExportPanel)
edits ─▶ services.entities.update(kind, id, changes | (current) => changes) / add  (stored behind)
      ─▶ services.brew.preferences.setMachine / setBasket / setGrinder / setPack / setRecipe (kv lastUsed.*)
Containers: link.shot.snapshot() still reading ─▶ Weigh & add; containerClashes(containers) ─▶ warnings
Data: links.flush() ─▶ exportAll ─▶ Download / Share
```

- **One screen per board**, each a `SetupPage` (`parts.tsx`: the back link, the title and its
  action, the write-error notice, the tab bar). The list's summaries are pure (`format.ts`).
- **Stored as made**: `TextField` stores when left (its draft worked out as it renders,
  `useDraft`), `Stepper` with each tap (hold to repeat), switches with each tap. Changes made
  from a value pass a function of the current entity, so quick taps all count.
- **Removing** is a tombstone (`removedAtEpochMs`, D-074): the lists and pickers show only
  `isListed` entities; the shots keep their snapshot.
- **Containers** (`src/core/model/containers.ts`): `containerClashes` pairs the listed ones the
  scale can't tell apart: the same weight (within 0.05 g, a conflict) or within 3 g (a warning,
  dismissed per pair on the lighter one). Setup's Needs attention lists the open ones.

## History (`src/app/history.ts`, `src/ui/history/`; T1.19, D-070)

```
History.load() ─▶ reanalyzeAll, once per ANALYSIS_VERSION (storage.local history.analysedVersion)
               ─▶ analysis.analyze(each recording) (cached; open ones from raw)
               ─▶ HistoryEntry { shot, recording, segment | null, match, atEpochMs, refusedFrames }
                  for every listed shot, newest first
History.entry(shotId) ─▶ one entry, listed or not
History.editor(shot) ─▶ ShotEditor: setTaste / setChannelled / toggleTag, applied at once,
                        stored in order (shots.update), then onShotsChanged (automatic export)
History.recordingsChanged() ─▶ analyse each recording that ended since startup (post-hoc shots)
```

- **Listed**: every shot but discarded ones and untouched post-hoc shots without a segment; an
  unmatched live or manual shot stays, flagged (D-007, D-019, D-047). A shot's time is its
  recording's start plus pump_on, else the first drip, else its anchor.
- **The curves** come from the derived cache: `SegmentAnalysis.curve` (`src/core/analysis/
  curve.ts`), the liquid and flow every 0.2 s around the shot. No screen reads raw.
- **The screens**: `HistoryScreen` (board History: rows, Compare mode picking A and B),
  `ShotScreen` (History-Detail: the chart, eight metric tiles, phases, grades, "Compare
  with…"), `CompareScreen` (History-Compare: the overlay, aligned at the first drip or pump on,
  and "A Δ B"). `HistoryChart` draws the large charts. Their logic is pure, in `plot.ts` (the
  zero, the axes and their labels, the overlay's alignment and fallback, the small graph),
  `rows.ts` (rows, sections, picking) and `tables.ts` (tiles, phases, the compare table). They
  reload when the shots or the recordings change (`useHistoryLoad`).

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
         ─▶ zeroTrack: transitions (runs of jumps faster than any flow, with the samples
                       either side already or still off the level, or moving faster than liquid
                       could; runs that then touch are one, D-062)
                       → tares: a logged tare command's step to 0 (from further off, D-059;
                         one jump, or the largest in a run with a knock in it, D-062), or a
                         single jump to 0, measured from before the press on the tare button
                         that came with it (D-061); each applies from its own jump
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
  a burst of beans or a disturbance (more). The button's tare with its press runs from the
  press on (`jumps` 2), and the press is a transient too.
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
RecordingAnalysis + the containers ─▶ segmentContainers (pure; T2.4) ─▶ each segment's ContainerMatch
RecordingAnalysis.phases + the shots ─▶ phasesOfShots (pure; T2.5) ─▶ each shot's beans, ground, milk
                                     ─▶ shotDose: ground ?? beans ?? doseG ?? basketSizeG ─▶ the ratio
AnalysisRunner.analyze(recordingId):
  ended ─▶ derived cache (recording, version; shape, version, parameters and lastSeq checked)
           or analyzeRaw
        ─▶ shots.createMissing: post-hoc shots for postHoc (not for a known non-cup container),
           in the transaction that reads the shots ─▶ RecordingResults { recording, analysis,
           cached, shots (each with its segment, match, phases and dose), unclaimed segments,
           containers, created }
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
  ground coffee or milk stay unclaimed segments. A segment whose vessel is a known container
  without the cup role gets none, whatever it looks like (T2.4, D-078).
- **Phases** (`phases.ts`, T2.5, D-079): `analyzeRaw` measures each logged beans, grind and
  milk phase (`RecordingAnalysis.phases`, cached: raw only, version 9) on the zero-tracked
  stable levels: its vessel's empty weight as it went on, and what it held at its last stable
  level; the grind's vessel is the beans' one when it comes back carrying about the beans. The
  runner gives each shot its phases (`phasesOfShots`: the beans and grind before it, the milk
  after it) and its dose (`shotDose`), which the ratio, the card and History use. Since
  version 10 (T2.11, D-082) a vessel is read until it is lifted, past its phase's own done (up
  to the next phase's open), a rise while it stays on is what went into it, and a vessel still
  on as the next phase opens is that phase's; the brew flow analyses again as the milk settles
  after Done.
- **Containers** (`containers.ts`, T2.4): a segment's vessel weighs its baseline less the level
  before the step that put it on (`segmentVesselG`), matched by the model's `matchContainer`,
  the live display's matcher too. Worked out on every call from the containers as they are now,
  never cached: they are metadata.
- **The cache** holds ended recordings' results only, and an entry stands only while no raw
  record has been stored after its `lastSeq`. Ratios, matching and container labels never enter
  it, so editing a shot or a container never makes it stale. `services.analysis` (`startApp`) is the runner: the brew flow
  analyses its open recording at "shot done" (T1.18), and the history every recording, running
  `reanalyzeAll` once per version (T1.19, D-070).
- **Each segment's curve** (`curve.ts`, D-070): the liquid smoothed over 1 s and its flow over
  2 s, every 0.2 s from 10 s before the shot to 10 s after it, short gaps bridged, in
  hundredths: what the history draws. Display only; no marker or metric reads it.

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

## Live pipeline (`src/core/live`, T1.17; D-065)

```
recorder.onFrame ──▶ decode, trusted weights only ──▶ LiveWeight ──▶ ShotMonitor ──▶ snapshot() ─▶ UI
recorder.onEvent ──▶ tares to expect (isTareCommand), the tap (isManualStart) ──┘        └──▶ events ──▶ scaleCommandsFor ──▶ recorder.sendCommand
```

It is causal and display-only, and never stored. If it misfires, the record is untouched and the
analysis reads the shot right anyway. It shares no code with the analysis, only the log's meaning
from `src/core/model` (`AUTO_TARE_REASON`, `MANUAL_START`, `isManualStart`, `isTareCommand`).

- **`LiveWeight`** turns each reading into a `LiveSample`:
  - `grossG`: the reading plus what the app's tares took away. A tare asked for or sent lands as
    one step to 0, from the level it was asked at, so the weight doesn't move. One that never
    lands leaves the display its own zero.
  - Jumps: a change no pour explains disturbs the signal for 0.5 s. `smoothG` holds meanwhile,
    and the flow leaves the jump out.
  - `smoothG`: an EMA plus its tracked lag on a pour.
  - `flowGps`: the slope over the last second.
  - `noiseG`: from the MAD of the steps between readings; a tare's step and a first drip must
    clear four of it.
  - `stable` and `levelG`: the spec's 0.5 s test at the scale's 0.1 g step.
- **`ShotMonitor`**, the display states:
  - idle → ready: a vessel of at least 20 g put on and stable; the arm-once tare is asked for
    (a `tare` event);
  - ready → running: the Tare + start tap, the only start;
  - running → tail: once 5 g have poured, the flow falls below a quarter of its fastest (the
    live pump_off, a hinge's knee);
  - tail → done: the weight holds still, or the cup comes off. A `shot-done` event, once per
    shot.

  The cup's removal, or `reset()`, re-arms the tare. A cup put back after its shot at the level
  it left is the same one. A tap with no first drip within 15 s lapses (`pump-lapsed`). The
  `ShotDisplay`
  carries the phase, the net weight from the tap's level, the progress towards the target
  (`pourProgress`: remaining, and the warning past +1 g), the flow, the times and a series for
  the graph.
- **`scaleCommandsFor`** says what the app sends the scale for each event (D-066):
  - at the cup's `tare`: `05`, `06`, `01`;
  - at `shot-done`: `05`;
  - at `pump-lapsed`: `05`, `06`.

  So the scale's own timer runs from each Tare + start tap to its "shot done".
- `test-stream.ts` (test support only): `streamLive` streams a simulated session with the test as
  the app; `replayLive` replays a real recording.

**What is on the scale** (T2.4, D-078): `VesselMonitor` (`vessels.ts`), with its own
`LiveWeight`, follows a vessel put on (a stable rise of at least `vesselMinG`, 3 g, from the
stable level before it; its mass settles for 3 s), its contents, and its lift (below half its
mass above where it was put on from). `LiveVessel` (`src/app/live-vessel.ts`, `link.vessel`)
matches it against the containers as they are now with the model's `matchContainer`, which the
analysis's labels use too, and holds the user's pick while it stays on. It also lists the
containers within 3 g of the one matched whose warning wasn't dismissed (`near`), for the
vessel card's "Close to …" (T2.11, D-082).

**The brew's phases** (T2.5, D-079): `PhaseRouter` (`phases.ts`) keeps which phase is on screen
(beans, grind, extraction, milk), opened by a known container's role, the bean cup back with its
grounds (a weight no container matches: a bean or grind cup plus about the beans, after 8 s
off), the pump, or a tap; opening a later phase ends the earlier ones, done or skipped. It
measures the open phase's weight from the vessel's contents (display-only). The brew flow feeds
it and logs each `PhaseChange` in the recording as a `phase` UI action, which the analysis
measures (`measurePhases`).

The probe's statistics live here too (T1.8): `ProbeMonitor` keeps the last frames as hex, the
timer's and arrivals' gaps, the longest silence, the weight's mean and σ over 0.5, 2 and 10 s,
the smallest weight step and the byte values seen, built on `TimeWindow` and `RecentValues`
(`window-stats.ts`).

So does the scale's mode (T1.25, D-073): `ScaleModeMonitor` (`scale-mode.ts`) reads, from the
frames and the log, whether the scale is in its timer mode. A `04` or `07` sent with the timer
at 0 awaits its start: `timerStartVerdict` says `started` (the timer above 0 within 1.5 s),
`not-started` (nothing in five frames and 0.5 s) or `unknown`. An `03 0D` frame is the automatic
mode. A start with no command proves nothing (the scale's timer key), and the latest evidence
decides. `modeCheckStart` and `modeCheckPutBack` are the check's commands (`04`, then `05` and
`06` after its own start); `ScaleModeCheck` in `src/app` sends them.

## Simulator (`src/core/sim`, T1.3, T1.22; D-021)

A deterministic simulation of a scale session, with exact ground truth. It is the test bed for
M2 until real shots are recorded (D-013), and it drives `MockTransport`. Since T1.22 its scale
and link follow hardware session 1 (D-037), and since T1.16 its shots follow session 2's (no
vibration, a drain with τ 0.2 s, a first lump; D-059); what the sessions didn't show is
assumed, as D-021 lists. Every parameter and its default is documented in `params.ts` (scale and link) and
`shot.ts` (shots).

```
script (cup on/off/back, shot, pump, bump, tare button, command, mode switch, power-off)
  → WeighingPlatform: vessel settling in and out, liquid in a first lump and then whole drops
    (into the cup, or onto the platform when there is none), bumps, a press on the tare button
    until the scale tares                                            → noise-free gross mass
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
  `scale: { mode: 'automatic' }` or `'flow-rate'` gives a scale left in another mode (D-038),
  and a script `mode` switches it mid-session, as the user would on the scale: assumed to stop
  the timer at 0 (D-073). `demoScenario(seed, mode)` is the mock's demo in a given mode.

## Testing

- Unit tests live next to the code (`*.test.ts`), run by Vitest in a Node environment.
- Storage tests use `fake-indexeddb`: `freshIndexedDB()` (`src/storage/fake-idb.ts`) gives each
  test an empty database. Node has no Web Locks, so app tests use `FakeLocks`
  (`src/app/fake-locks.ts`), one instance per origin.
- Live tests stream the simulator frame by frame, the test standing in for the app
  (`streamLive` in `src/core/live/test-stream.ts`: it sends the tare the monitor asks for and
  makes the Tare + start tap). They also replay `fixtures/real/` (`replayLive`, and
  `replayMode` for the scale's mode).
- Analysis and live tests use simulator ground truth (`src/core/sim`). For exact checks, turn
  noise, jitter and stalls off through the scenario's `scale` and `link` parameters, and set
  `resolutionG: 0.01` (the default is the scale's 0.1 g). The accuracy targets the user agreed
  for the real scale (D-060) are in `src/core/analysis/targets.test.ts`: 100 shots on the
  simulator's defaults, through `analyzeRaw`. The tests of the first targets (D-035, D-036)
  stay as regressions in the world they were agreed in (D-046, D-059; `test-runs.ts`):
  `AGREED_SCALE` (0.01 g steps, the vibration, 0.05 g drops), `AGREED_SHOT` (τ 1.5 s, no lump)
  and `AGREED_LIQUID` (the analysis told so). The variance detector's tests keep the vibration
  on purpose (`VIBRATING_SCALE`). `test-runs.ts` also has `timelineOffset` and `shotErrors`, to
  compare an analysis with the truth.
  Zero-tracking is checked frame by frame: a zero-tracked sample should equal its frame's
  reading plus the scale's true zero (`FrameTruth.weightG + offsetG`, from the first zero).
- Export tests share `src/core/export/test-samples.ts`: a bundle with every event type, damaged
  and FF12 frames, an open recording, shots with every field set and with none, and settings.
- Transport and service tests run `MockTransport` on a `ManualClock`, which makes them
  deterministic and instant. `src/app/brew-flow.test.ts` pulls a whole simulated shot that way,
  with the real analysis runner on a fake IndexedDB.
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
  `api.github.com`; T1.20), then `scripts/e2e-brew.mjs` (the brew flow from connect to Save,
  the export it leaves, and the shot in History; T1.18), then `scripts/e2e-history.mjs` (the
  history on the real session-2 file imported: list, a shot's page and its grades, Compare;
  T1.19), then `scripts/e2e-reconnect.mjs` (the brew screen on the real Web Bluetooth transport
  and a fake `navigator.bluetooth` put into the page: the reconnect without the chooser, a
  dropped link, Stop, Choose scale, Bluetooth injected late or never; T1.21), then
  `scripts/e2e-home.mjs` (Home and the tab bar, T1.23; and the mode warning on the mock in its
  flow-rate mode, T1.25). Shared helpers are in `scripts/e2e-lib.mjs`. They use the environment's global Playwright, so CI doesn't run
  them.
- The inspection CLI's report and charts are tested in `src/core/inspect` on simulated exports
  and on `fixtures/real/`. `scripts/analyze.test.mjs` runs `scripts/analyze.mjs` as a process,
  which is the only test of the TypeScript loader; Vitest picks up `scripts/**/*.test.mjs`
  for it.
