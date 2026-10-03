# Implementation plan

The single source of truth for what's done and what's next. **Every agent updates this file in
the same commit as its work** (protocol in `CLAUDE.md`).

**Next task: T1.1** (U0.1 is waiting on the user: enable GitHub Pages)

Status values:

- `todo`: ready once its dependencies are `done`.
- `in-progress`: handed off part-way. Read the task's **Handoff** note and continue.
- `blocked (Q#/U#)`: waiting on an answer or a user task.
- `user`: something only the user can do (hardware, phone, GitHub settings).
- `verify`: code is done, but the user needs to check it on the device. It doesn't block
  dependent tasks unless the task says so.
- `done`

Picking a task: continue an `in-progress` one if there is one. Otherwise take the **Next task**
above. If that one is blocked, take the first `todo` in board order whose dependencies are all
`done` (a `verify` dependency counts as done).

## Milestones

| Milestone | Tasks | Outcome |
| --- | --- | --- |
| M0 Setup | T0.1–T0.3, U0.1 | Repo, docs, toolchain, CI, Pages deploy |
| M1 Raw capture in Bluefy | T1.1–T1.8, U1.1 | The BLE path is proven on the phone, every packet recorded and exportable, Phase 0 answered, real fixtures captured |
| M2 Analysis engine | T1.9–T1.16 | Post-hoc segmentation and metrics, versioned, re-runnable, tuned on real shots |
| M3 Dialing loop (MVP done) | T1.17–T1.21 | Live display, direction tap, history, two-shot overlay, automatic export |
| Phase 2 | T2.1–T2.8 | Beans, grinders, burr epochs, containers, phase routing |
| Phase 3 | T3.1–T3.5 | Audio, keep-alive, richer analysis, Capacitor, UI polish |

## Board

| ID | Task | Status | Depends |
| --- | --- | --- | --- |
| T0.1 | Bootstrap: spec, plan, agent manual, docs | done | — |
| T0.2 | Toolchain scaffold | done | T0.1 |
| T0.3 | CI and GitHub Pages workflow, SessionStart hook | done | T0.2 |
| U0.1 | USER: enable GitHub Pages, open the app in Bluefy | user | T0.3 |
| U0.2 | USER: Phase 0 with nRF Connect or LightBlue (optional, see U1.1) | user | — |
| T1.1 | Protocol codec | todo | T0.2 |
| T1.2 | Core data model | todo | T0.2 |
| T1.3 | Transport interface, shot simulator, mock transport | todo | T1.1, T1.2 |
| T1.4 | Web Bluetooth transport | todo | T1.3 |
| T1.5 | IndexedDB storage | todo | T1.2 |
| T1.6 | Recorder service | todo | T1.3, T1.5 |
| T1.7 | Export/import format v1 and manual export | todo | T1.5 |
| T1.8 | Probe (diagnostics) screen | todo | T1.4, T1.6, T1.7 |
| U1.1 | USER: hardware tests in Bluefy, capture fixtures | user | T1.8 |
| T1.9 | Timebase reconstruction | todo | T1.1, T1.3 |
| T1.10 | Signal toolkit | todo | T0.2 |
| T1.11 | Stability, zero-tracking, shot windows | todo | T1.9, T1.10 |
| T1.12 | Liquid markers and tail fit | todo | T1.11 |
| T1.13 | Pump markers (`pump_on` / `pump_off`) | blocked (U1.1: A2) | T1.11, U1.1 |
| T1.14 | Metrics, analysis runner, derived cache | todo | T1.12 |
| T1.15 | Analysis inspection CLI | todo | T1.7, T1.14 |
| T1.16 | Tune analysis on real fixtures | blocked (U1.1) | T1.13, T1.15, U1.1 |
| T1.17 | Live pipeline (display only) | todo | T1.1, T1.3 |
| T1.18 | Shot capture flow UI | todo | T1.6, T1.14, T1.17 |
| T1.19 | History and two-shot overlay chart | todo | T1.14, T1.18 |
| T1.20 | Automatic JSON export | blocked (Q1) | T1.7 |
| T1.21 | Reconnect without re-pairing | todo | T1.4, U1.1 (B3) |
| T2.1 | Entities: bean bags, grinders, burr epochs, containers | todo | T1.5, T1.7 |
| T2.2 | Bean bag tracking | todo | T2.1, T1.18 |
| T2.3 | Grinder settings and burr epochs in the capture flow | todo | T2.1, T1.18 |
| T2.4 | Container learning and recognition | todo | T2.1, T1.17 |
| T2.5 | Phase routing state machine | blocked (Q3) | T2.4 |
| T2.6 | Beans phase | todo | T2.5, T2.2 |
| T2.7 | Grind phase | blocked (Q2) | T2.5 |
| T2.8 | Field configurator | todo | T1.18 |
| T3.1 | Audio pump detection | todo | U1.1 (B8) |
| T3.2 | Keep-alive via `0x25` | blocked (U1.1: A6) | T1.6 |
| T3.3 | Richer charts and history analysis | todo | T1.19 |
| T3.4 | Capacitor wrapper | todo | T1.21 outcome |
| T3.5 | UI polish | todo | M3 |

## Open questions for the user

Agents: when you reach a task blocked on one of these, ask the user (AskUserQuestion). Then
record the answer here and in `docs/DECISIONS.md`.

| ID | Question | Blocks | Status |
| --- | --- | --- | --- |
| Q1 | Where should automatic exports go? Options: commit to a private GitHub repo with a fine-grained token (zero taps), the iOS share sheet after each session (one tap), something else | T1.20 | open: deferred by the user 2026-10-03 (D-003) |
| Q2 | The grind phase needs a dosing cup that fits the 8×8 cm platform (spec: "Grind phase limitation"). Do you have one, or will you? Without one, the grind phase is beans-in only and retention can't be measured | T2.7 | open |
| Q3 | The spec's "phase routing" diagram (3 phases, 1 decision) didn't survive export (spec line 209). Can you re-share it, or confirm the text-only reading in T2.5? | T2.5 | open |
| Q4 | Only if A2 shows that pump vibration doesn't reach the weight signal: `pump_on` can't then come from the scale. Use the manual-start (`07`) press as `pump_on` (with human latency), or leave pre-infusion `null` until audio (T3.1)? | T1.13 | open (may become moot) |
| Q5 | When should the app ask "like / dislike" for a bean bag? The spec says never on shot one. One idea: after the first shot graded "balanced" | T2.2 | open |

---

## Task details

### T0.1 — Bootstrap: spec, plan, agent manual, docs

**Status:** done

**Completed 2026-10-03:**

- `docs/spec.md` is a verbatim copy of the user's spec.
- This plan, plus `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`,
  `docs/protocol-notes.md`, `docs/hardware-tests.md` and `README.md`.
- Protocol research against the upstream BOOKOO docs and aiobookoo is in
  `docs/protocol-notes.md`. Read it before T1.1.

### T0.2 — Toolchain scaffold

**Status:** done · **Depends:** T0.1 · **Read:** `docs/ARCHITECTURE.md` (modules), D-001, D-009,
D-010, D-011

**Goal:** an app that builds, tests and lints before any feature work starts.

**Deliverables:**

- Vite 8 + Preact 10 + TypeScript ~6.0 (strict), set up like the official `preact-ts` template.
- Vitest (Node environment, `src/**/*.test.ts(x)`).
- ESLint flat config with typed rules for `src` and the D-010 boundary rules.
- Prettier for code only.
- `npm run check` = typecheck + lint + format check + tests.
- `base: './'`, and build info (commit, build time) injected via `define`.
- A placeholder home page showing build info and a browser-capability table: secure context,
  Web Bluetooth, `getDevices`, IndexedDB, `storage.persist`, Wake Lock, Web Share,
  `getUserMedia`, and the user agent. The table answers hardware test B1.
  - It checks only that `navigator.share` exists, not whether *files* can be shared. T1.7
    checks `navigator.canShare({ files })` at export time, and hardware test B7 settles it on
    the phone.

**Acceptance:**

- `npm run check` and `npm run build` pass.
- `dist/` works when served from a sub-path.
- A deliberate boundary violation, such as importing preact in `src/core`, fails lint.

**Completed 2026-10-03:**

- Vite 8.3, Preact 10.29, TypeScript 6.0 (strict, project references like the official
  template), Vitest 5 (Node environment), ESLint 10 with typescript-eslint 8 typed rules, and
  Prettier 3.9 (code only).
- The boundary rules were verified with throwaway violating files: preact in core, live →
  analysis, core → platform, `window` in core, and `navigator.bluetooth` outside transport all
  error.
- `dist/` was served from `/smart-scale/` and rendered in headless Chromium at phone width with
  no console errors.
- The home page is the capability table plus build info (`src/platform/`). It's the starting
  point for the probe UI.
- `src/core/` doesn't exist yet. The first core task creates it, and the lint rules already
  cover it.

### T0.3 — CI and GitHub Pages workflow, SessionStart hook

**Status:** done · **Depends:** T0.2

**Deliverables:**

- `.github/workflows/ci.yml`: `npm ci` + `npm run check` + `npm run build` on every push. On
  `main`, upload `dist/` and deploy to GitHub Pages.
- `.nvmrc` (Node 22).
- `.claude/settings.json` and a SessionStart hook that runs `npm ci` in cloud sessions, so a
  fresh agent can run tests straight away.

**Acceptance:** the workflow parses and its check job passes on GitHub. The deploy job succeeds
once Pages is enabled (U0.1).

**Completed 2026-10-03:**

- **CI triggers:** every push to any branch, plus manual dispatch. There's no separate
  `pull_request` trigger: checks attach to the commit, so PRs from same-repo branches show them
  anyway, and that avoids duplicate runs.
- **Deploy:** only from `main`. It needs `pages: write` and `id-token: write`, uses the
  `github-pages` environment, and runs in a never-cancelled `pages` concurrency group.
- **Actions pinned to current majors:** checkout@v7, setup-node@v7 (Node from `.nvmrc` = 22,
  npm cache), upload-pages-artifact@v5, deploy-pages@v5.
- **Schema check:** `@action-validator/cli` validates the workflow.
- **Hook:** `.claude/hooks/session-start.sh` runs only when `CLAUDE_CODE_REMOTE=true`. It runs
  `npm install` synchronously (the cached container makes later sessions quick) and sends npm's
  output to stderr, because SessionStart stdout lands in the agent's context. Only a one-line
  summary goes to stdout.
- **Hook validation:** run from a clean `node_modules/` (3 s); it's idempotent and leaves the
  lockfile unchanged.
- **Until the user enables Pages (U0.1),** the deploy job fails with "Not Found". That's
  expected and doesn't affect the check job.

### U0.1 — USER: enable GitHub Pages, open the app in Bluefy

**Status:** user · **Depends:** T0.3

1. On GitHub, go to the repo's **Settings → Pages → Build and deployment → Source** and choose
   **GitHub Actions**.
2. Under **Actions → "CI and Pages" → Run workflow**, run it on `main` (or just push anything).
3. Open <https://misch0n.github.io/smart-scale/> in Bluefy and screenshot the capability table
   (hardware test B1). Give it to an agent to record in `docs/hardware-tests.md`.

### U0.2 — USER: Phase 0 with nRF Connect or LightBlue (optional)

**Status:** user

Work through `docs/hardware-tests.md` Part A. This is optional: U1.1 covers the same tests with
the in-app probe, which also records the data. A14 and A15 (advertisement and characteristic
properties) are easiest in nRF Connect, though.

### T1.1 — Protocol codec

**Status:** todo · **Depends:** T0.2 · **Read:** spec "BLE protocol reference", "Parsing rules",
"Likely additional frame — 03 0D"; `docs/protocol-notes.md` (all of it); D-004, D-005, D-008

**Goal:** pure encode and decode for the BOOKOO protocol. This is the only module that knows
byte layouts.

**Deliverables (`src/core/protocol/`):**

- `uuids.ts`: service `0x0FFE`, characteristics `0xFF11` and `0xFF12`, as 16-bit numbers and
  128-bit strings.
- `checksum.ts`: `xorChecksum(bytes)` and `hasValidChecksum(frame)`.
- `commands.ts`: the whitelist (D-008):
  - `tare`, `setBuzzer(0–5)`, `setAutoOff(5–30)`;
  - `startTimer`, `stopTimer`, `resetTimer`, `tareAndStartTimer`;
  - `flowSmoothingOff`;
  - `keepAlive` (flagged unverified).

  Each is a typed `ScaleCommand { name, bytes }`. Range-check parameters. Do not export any
  generic sub-command encoder.
- `frames.ts`: `decodeFrame(bytes)` returns a discriminated union:
  - `weight` (`03 0B`), with every field: `timerMs`, `unitByte`, `unitOk`, `weightG`, raw
    integer and sign byte, `flowGps`, `batteryPct`, `standbyMin`, `buzzerGear`, `flowSmoothing`,
    `reserved`;
  - `event` (`03 0D`, tentative: Ultra layout);
  - `powder` (`03 0F`, tentative);
  - `unknown` (valid checksum, unknown type);
  - `invalid` (`length` or `checksum`).

  The decoder never throws.
- `encodeWeightFrame(fields)`, the inverse of decode. The simulator and tests use it.
- `hex.ts`: `toHex` and `fromHex`.
- `GRAM_UNIT_BYTES = [0x01]` (D-005).
- The sign-byte map: `0x2B` → +, `0x2D` → −. Any other value is flagged (`signKnown: false`).

**Acceptance:**

- Golden tests reproduce every pre-computed command in the spec and in protocol-notes, byte for
  byte.
- A test enumerates the whitelist and proves `0x09` and `0x15` can't be produced.
- Weight frames round-trip, including negative weight, a timer above 65.535 s (24-bit), flow
  above 2.55 g/s (16-bit) and 24-bit maximum values.
- A bad checksum or wrong length decodes as `invalid`. An unknown header with a good checksum
  decodes as `unknown`.

**Notes:**

- The spec's byte table is 1-based; `protocol-notes.md` has the 0-based offsets.
- Do not copy aiobookoo's decoder or command bytes: they have known bugs.
- Also export a small rolling checksum-failure counter helper. The recorder and the probe use it
  to alarm when most frames fail (protocol-notes, finding 6).

### T1.2 — Core data model

**Status:** todo · **Depends:** T0.2 · **Read:** spec "Data model and storage", "Session
metadata and grading"; `docs/ARCHITECTURE.md` "Data model"; D-004, D-007

**Goal:** the types and constructors that storage, export, analysis and UI share.

**Deliverables (`src/core/model/`):**

- Ids: time-sortable (UUIDv7 or similar), generated with `crypto.getRandomValues`.
- `Recording`, `RawFrame`, `AppEvent` (a discriminated union: `connected`, `disconnected`,
  `command-sent`, `command-failed`, `ui-action`, `annotation`, `smoothing-confirmed`,
  `smoothing-not-confirmed`, `error`, `characteristic-properties`, … extensible) and `Shot`.
  `Shot` carries the complete schema, with Phase 2 references set to `null` (D-007).
- A per-recording sequence number shared by frames and events.
- Normalisers that fill `null` for missing fields. Tests prove every key is present after
  normalisation.
- Time conventions: `tMs` is milliseconds since recording start (a float); epoch values are
  ms; durations in seconds appear only in derived metrics.

**Acceptance:** the types compile, the normalisers are tested, and `docs/ARCHITECTURE.md`
"Data model" matches the code. Confirm D-007, or refine it and update `DECISIONS.md`.

### T1.3 — Transport interface, shot simulator, mock transport

**Status:** todo · **Depends:** T1.1, T1.2 · **Read:** spec "Scope and platform" (transport
interface), "Out of scope" (GaggiMate: keep it narrow), "Shot segmentation and derived metrics"
(to make realistic shots)

**Goal:** the seam between BLE and the app, plus a way to develop and test with no hardware.

**Deliverables:**

- `src/transport/types.ts`: a narrow `ScaleTransport`:
  - `connect()` (Web Bluetooth requires a user gesture), `disconnect()`;
  - `send(cmd: ScaleCommand)` (queued);
  - `onNotification(cb({ source: 'ff11'|'ff12', bytes, tArrival }))`;
  - `onStatus(cb)`;
  - `kind`;
  - an injected clock for `tArrival`.

  Commands are whitelist values, never raw bytes from callers.
- `src/core/sim/`: a deterministic simulator (seeded PRNG) of a scale session. Inputs:
  - a script of physical events: cup on/off, tare, pump on, first drip, pump off, cup removed,
    physical tare press;
  - shot parameters: dose, yield, pre-infusion, flow profile, tail τ.

  It models the scale: weight quantisation; noise; vibration σ while the pump runs (0 means
  "vibration doesn't survive"); sample rate with drift; and the timer field (zero until
  `07`/`04`, frozen after `05`). It models BLE: arrival jitter and bursts, plus optional corrupt
  and dropped frames. Output: encoded frames with arrival times, and **ground truth** (exact
  marker times, yields, τ).
- `src/transport/mock.ts`: a `MockTransport` that replays a simulated session in real or
  accelerated time and reacts to commands (`07` tares and starts the timer, `08` sets the
  smoothing byte, `01` tares).

**Acceptance:**

- The simulator is deterministic per seed.
- Ground truth is consistent with the frames it produces.
- Vibration σ visibly changes the rolling variance.
- MockTransport frames decode with T1.1, and its commands change the simulated state.

**Notes:** the simulator is the test bed for all of M2, so keep its parameters explicit and
documented. The mock is selectable in the UI (for example `#/probe?mock`) for development and
for Playwright checks.

### T1.4 — Web Bluetooth transport

**Status:** todo · **Depends:** T1.3 · **Read:** spec "Scope and platform", "BLE protocol
reference", "Parsing rules" (5), "Re-pairing — check early"; protocol-notes 2, 12, 13, 14

**Deliverables (`src/transport/web-bluetooth.ts`):**

- `requestDevice` with filters `[{ services: [0x0ffe] }, { namePrefix: 'BOOKOO' }]` and
  `optionalServices: [0x0ffe]`. Call it synchronously inside the click handler, with no `await`
  before it, or the user-gesture activation is lost.
- Connect GATT, then get the service, FF11 and FF12. Attach listeners **before**
  `startNotifications()`. Subscribe to FF12 only if it has the `notify` or `indicate` property.
  Report both characteristics' properties so the recorder can log them (hardware test A15).
- Copy the bytes out of the `DataView` immediately, because shims may reuse buffers.
- Write queue: one GATT operation in flight, about 100 ms spacing. Use
  `writeValueWithoutResponse` or `writeValueWithResponse` according to the characteristic's
  properties, falling back to `writeValue`.
- `gattserverdisconnected` → a `disconnected` status with a reason. No reconnect loop here
  (that's T1.21).
- Feature-detect `navigator.bluetooth.getDevices()` and expose `reconnectKnownDevice()` when it
  is available (hardware test B3).
- Add `@types/web-bluetooth`.

**Acceptance:**

- Unit tests against a hand-written fake `navigator.bluetooth`: subscription order, byte
  copying, write serialisation and the disconnect path.
- This is the only file that touches `navigator.bluetooth` (lint).
- Status becomes `verify` until the user connects from Bluefy (U1.1, B2).

**Notes:** connect-time policy (smoothing off, its confirmation) belongs to the recorder
(T1.6), not here. The transport stays dumb.

### T1.5 — IndexedDB storage

**Status:** todo · **Depends:** T1.2 · **Read:** spec "Data model and storage" (all);
`docs/ARCHITECTURE.md` "Storage"; D-004

**Deliverables (`src/storage/`, using `idb`):**

- A versioned schema with an upgrade path. Stores: `recordings`, `frameChunks`, `events`,
  `shots`, `derived` and `kv`.
- Repositories:
  - recordings: create, end, get, list;
  - raw: append frames (chunked) and events, and read a recording's raw data in `seq` order.
    No update or delete API;
  - shots: CRUD, since metadata is mutable;
  - derived: put, get, clear-all;
  - kv: get and set.
- A write batcher for the recorder: flush about every second or 20 frames, `flush()` on demand,
  and no lost frames when a chunk fills mid-batch.
- `requestPersistence()`: `navigator.storage.persist()` plus `estimate()`, with the result
  available to the UI.

**Acceptance:**

- `fake-indexeddb` tests cover append and read order across chunk boundaries, upgrade from an
  empty DB, and listing open (unclean) recordings.
- At the type level, raw records can't be updated.

**Notes:**

- `idb` transactions auto-commit as soon as you await something that isn't IDB. Never await
  other promises inside a transaction.
- `Uint8Array` is structured-cloneable, so store bytes directly in IDB. Hex is only for export.

### T1.6 — Recorder service

**Status:** todo · **Depends:** T1.3, T1.5 · **Read:** spec "Data model and storage" ("record
every packet from connect to disconnect"), "Parsing rules" (4, 5), "Manual start" ("log both")

**Deliverables (`src/app/recorder.ts`, framework-free and observable):**

- On connect:
  - create a `Recording` (device, transport kind, app commit and build time);
  - log the `connected` event and the characteristic properties;
  - send `flowSmoothingOff`, then watch decoded frames for smoothing byte `0`;
  - log `smoothing-confirmed`, or after about 2 s retry once and log `smoothing-not-confirmed`
    (a visible warning, because the tail fit depends on smoothing being off).
- Every notification is appended verbatim with `seq`, arrival `tMs` and source. Nothing is
  filtered.
- `sendCommand(cmd, reason)` logs `command-sent` or `command-failed`. `logUiAction(name, data)`
  and `annotate(label)` record onto the same timeline.
- Live stats for the UI: frames/s, the checksum-failure alarm (more than half of the last 50
  frames failed), the latest decoded weight frame, `unitOk`, and smoothing state.
- On disconnect: flush, then end the recording with a reason. At startup, any recording with no
  end time is ended as `unclean` at its last frame time.

**Acceptance:** integration tests with MockTransport and `fake-indexeddb`:

- a simulated session is stored completely, including corrupt frames (count in = count stored);
- frames and events interleave in `seq` order;
- the smoothing confirmation and its retry work;
- unclean recovery works.

### T1.7 — Export/import format v1 and manual export

**Status:** todo · **Depends:** T1.5 · **Read:** spec "Storage and export", "Schema rules";
`docs/ARCHITECTURE.md` "Export format"

**Deliverables:**

- `docs/export-format.md`: the normative v1 format. It covers `format` and `formatVersion`,
  app info, recordings, frames as compact rows (`[seq, tMs, source, hex]`), events, shots, the
  entities those shots reference, and settings.
- `src/core/export/`: serialise, parse and validate (version, required keys, hex sanity), plus
  a migration hook for future versions.
- `src/app/export.ts`:
  - export one recording or everything;
  - import a file as an idempotent merge: existing raw ids are skipped, and existing metadata is
    kept unless the user says otherwise.
- Manual export in the UI: download via a `Blob` and `<a download>`. Offer the share sheet when
  `navigator.canShare({ files })` is true. File names look like
  `smart-scale_YYYY-MM-DD_HHMMSS_<id8>.json`.

**Acceptance:**

- Round-trip tests: raw bytes come back identical, and every metadata key is present, including
  nulls.
- A newer, unknown `formatVersion` gives a clear error.
- Size sanity: 3 minutes at 10 Hz comes out under about 150 KB.

**Notes:** automatic export is T1.20 (Q1). Derived data is left out by default.

### T1.8 — Probe (diagnostics) screen

**Status:** todo · **Depends:** T1.4, T1.6, T1.7 · **Read:** `docs/hardware-tests.md` (the probe
must make every test there doable), spec "Unknowns to test before building", "Re-pairing —
check early"; D-012

**Goal:** the first useful deploy. It connects in Bluefy, shows and records everything, runs
Phase 0, and exports fixtures. It's rudimentary UI on the `#/probe` route, which is the default
route until T1.18.

**Deliverables:**

- Connect and disconnect, plus "Reconnect known device" when `getDevices` exists.
- Status: device name, recording id, frames/s, ms-field delta stats, checksum failures, unit
  byte, and smoothing state (confirmed or not).
- Parsed live values (weight, reported flow, timer, battery, standby) and the last 20 raw hex
  frames for each characteristic. Highlight anything that arrives on FF12.
- Weight mean and σ over 0.5 s and 2 s windows, for hardware test A2. This is display-only code
  in `src/core/live` or the UI, never in analysis.
- Command buttons, each press logged:
  - tare `01`, start `04`, stop `05`, reset `06`, tare+start `07`;
  - smoothing off `08`;
  - keep-alive `25` (labelled unverified);
  - buzzer mute `02`.
- Annotation buttons: pump on, pump off, cup on, cup off, and a free-text note.
- A recordings list with per-recording export and "export all".
- The capability panel, the storage persistence result, and a Screen Wake Lock held while
  connected (with its status shown).
- The mock transport via `#/probe?mock`.

**Acceptance:** works end-to-end with MockTransport in desktop Chromium (verify it with
Playwright). Status becomes `verify` until the user runs it in Bluefy (U1.1).

### U1.1 — USER: hardware tests in Bluefy, capture fixtures

**Status:** user · **Depends:** T1.8

Run `docs/hardware-tests.md` Part B, Part A (unless already done with nRF Connect) and the
Part C captures. Upload the exported recordings to an agent session. The agent then:

- adds them to `fixtures/real/` with a README;
- records the answers in `docs/hardware-tests.md` and in the spec's unknowns table;
- updates this board, unblocking T1.13, T1.16, T1.21, T3.1 and T3.2 as the results allow.

### T1.9 — Timebase reconstruction

**Status:** todo · **Depends:** T1.1, T1.3 · **Read:** spec "Parsing rules" (3, 4); D-006;
`docs/ARCHITECTURE.md` "Timebase"

**Deliverables (`src/core/timebase/`):**

- `buildTimeline(frames)` produces:
  - a per-frame `t` (s since recording start) and its `timeSource` (`device` or `arrival`);
  - the device-advancing runs, each with its fitted offset (the minimum `arrival − device`) and
    a drift check;
  - jitter statistics;
  - the nominal sample interval.

**Acceptance:** simulator tests.

- With the timer running, reconstructed times are within 5 ms of the true sample times despite
  ±50 ms arrival jitter.
- With the timer zero or frozen, it falls back to arrival time.
- A timer reset (`07`) mid-recording gives two stitched runs.

**Notes:** smoothing arrival times when there's no device timer (fitting a regular grid to them)
is optional. Evaluate it on real data in T1.16.

### T1.10 — Signal toolkit

**Status:** todo · **Depends:** T0.2 · **Read:** spec "Signal processing", "Markers" (CUSUM
parameters), "Tail handling"

**Deliverables (`src/core/signal/`, pure):**

- Uniform resampling by linear interpolation.
- Savitzky–Golay coefficients for any odd window and polynomial order, and for derivative
  order 0–2 (general least squares), applied with edge handling.
- O(n) rolling mean, variance and range.
- One-sided CUSUM with alarm time and retrospective change point (the argmin of the cumulative
  sum before the alarm).
- Ordinary and weighted least-squares line fits with residuals.
- Median and MAD.
- A step helper: difference of means across a gap.

**Acceptance:**

- Savitzky–Golay reproduces polynomials of degree ≤ order exactly (value and derivative), and
  matches the textbook 5-point coefficients: smoothing `[−3, 12, 17, 12, −3]/35`, first
  derivative `[−2, −1, 0, 1, 2]/10`.
- CUSUM finds a known mean shift with the right change point.
- Rolling stats match a naive implementation on random data.

### T1.11 — Stability, zero-tracking, shot windows

**Status:** todo · **Depends:** T1.9, T1.10 · **Read:** spec "Schema rules" (baseline-relative
weight; a stray tare is a step), "Tare arming" (the stability test), "Markers"

**Deliverables (`src/core/analysis/`):**

- **Stable windows:** sample range ≤ tolerance over 0.5 s, where tolerance =
  max(0.05 g, k × quantisation step). The noise floor σ per window is never below q/√12, since
  quantised data at rest can show σ = 0.
- **Steps:** abrupt mean changes between stable windows, classified as:
  - tare: a step to about 0 within about 0.5 s after a tare command in the event log, or an
    FF12 tare event if A7 shows one exists, or else a heuristic;
  - cup placed;
  - cup removed (a large negative step);
  - other.
- **Zero-tracking:** a continuous series corrected for tare steps, so that net weight
  `w(t) − w(baseline)` holds across tares.
- **Shot windows:** from cup placed and stable to cup removed (or the end of the recording),
  containing a sustained rise. Each window carries its baseline (the stable value before the
  pump) and σ.

**Acceptance:** simulator scenarios:

- a tare while idle;
- a stray physical tare during the tail, which is subtracted, leaving the yield unchanged;
- two shots in one recording;
- the cup removed before the tail settles;
- quantised data, where the σ floor applies.

### T1.12 — Liquid markers and tail fit

**Status:** todo · **Depends:** T1.11 · **Read:** spec "Markers", "Tail handling", "Flow and
yield"

**Deliverables:**

- `first_drip`: CUSUM on `w − baseline` with slack about 0.5σ and alarm about 4–5σ, located at
  the retrospective change point. Optionally refine it to sub-sample resolution by fitting the
  initial rise and extrapolating back to the baseline.
- `settled`: the point where the mean stops moving, extrapolated when the cup came off first.
- `cup_removed`: the large negative step. Honest yield is the weight just before it.
- Tail fit: given `pump_off` (an input, because T1.13 provides it), fit `ln(flow)` against `t`
  on the tail where flow is above the noise. This gives τ and
  `w_final = w(pump_off) + ẇ(pump_off)·τ`, plus fit quality (R², points used).

**Acceptance** against simulator ground truth:

- `first_drip` within 0.1 s at default noise;
- τ within 10%;
- `w_final` within 0.3 g;
- sensible output when the cup is removed early.

Tests feed ground-truth `pump_off` until T1.13 exists.

### T1.13 — Pump markers (`pump_on` / `pump_off`)

**Status:** blocked (U1.1: A2) · **Depends:** T1.11, U1.1 · **Read:** spec "Markers", "Fallback
if vibration does not survive"; `docs/hardware-tests.md` A1, A2, A11; Q4

**Deliverables:**

- **If A2 shows vibration:** compute the rolling variance of the *detrended* weight (the
  residual from the SG fit, or second differences: the mean moves during extraction, so raw
  variance would include the trend). Compare it against the quiet-baseline σ².
  - `pump_on`: variance steps up while the mean stays stationary. Requiring both rejects a bump,
    which moves mean and variance together.
  - `pump_off`: variance steps down.
  - Locate each onset retrospectively.
- **Always:** implement the regime-change fallback for `pump_off`: fit the exponential decay
  backwards from the end, then walk forward to where the data departs from it. Use it as a
  cross-check, or as the primary method when there's no vibration.
- **Without vibration:** `pump_on` follows Q4 (ask the user).

**Acceptance:**

- With simulator vibration σ > 0, markers are within 0.2 s.
- With σ = 0, the fallback is used and flagged.
- Real fixtures give plausible markers next to the user's annotations (check with T1.15 plots).

**Notes:** if A2 shows no vibration, the spec says to revise the segmentation section before
implementing. Ask the user first.

### T1.14 — Metrics, analysis runner, derived cache

**Status:** todo · **Depends:** T1.12 · **Read:** spec "Durations", "Flow and yield", "Layers";
D-007

**Deliverables:**

- `analyzeRecording(raw, shots)` is pure. It runs decode → timeline → zero-tracking →
  resample → markers per shot window → metrics:
  - pre-infusion, extraction and total durations, all ending at `pump_off` (**never at the last
    drip**);
  - first-drip time (`pump_on` → `first_drip`), the headline metric;
  - average flow = `w(pump_off) / t_extraction`;
  - yield `w(settled)`, honest yield `w(cup_removed)`, tail mass, τ;
  - ratio, when a dose is known;
  - quality flags: which detectors ran, and which fallbacks were used.

  Results are stamped with `ANALYSIS_VERSION` and the parameter set.
- Markers that aren't available yet (before T1.13) are `null`, and the metrics that need them
  are `null` too.
- A read-through derived cache, invalidated by version, and `reanalyzeAll()` to re-run across
  history.
- Shot matching per D-007: segments link to `Shot` entities by anchor time, unmatched segments
  get a `post-hoc` shot, and unmatched shots are flagged.

**Acceptance:**

- End-to-end simulator tests produce metrics within tolerance of ground truth.
- Bumping the version invalidates the cache.
- `reanalyzeAll` is idempotent.

### T1.15 — Analysis inspection CLI

**Status:** todo · **Depends:** T1.7, T1.14

**Goal:** agents can't see the phone, so give them a way to look at real data.

**Deliverables:**

- `npm run analyze -- <export.json> [--out dir]` prints markers and metrics as JSON.
- It also writes an SVG per shot showing weight, derived flow, detrended variance, markers and
  annotations. Render to PNG with Playwright and the preinstalled Chromium if that is useful.

**Acceptance:** runs on a simulated export and on `fixtures/real/*` once they exist. Documented
in README and CLAUDE.md.

### T1.16 — Tune analysis on real fixtures

**Status:** blocked (U1.1) · **Depends:** T1.13, T1.15, U1.1

**Deliverables:**

- Tune the parameters on real data:
  - the SG window, from the measured rate;
  - CUSUM slack and alarm;
  - variance windows;
  - the stability tolerance;
  - timebase regularisation.
- Fixture regression tests: expected markers within tolerance, using annotations as
  approximate truth.
- Bump `ANALYSIS_VERSION`.
- Record the findings in `docs/hardware-tests.md` and `DECISIONS.md`.

If a spec assumption fails, ask the user before working around it.

### T1.17 — Live pipeline (display only)

**Status:** todo · **Depends:** T1.1, T1.3 · **Read:** spec "Signal processing" (live column),
"Tare arming", "Manual start", "Flow and yield" (live ratio target), "Interaction constraints"

**Deliverables (`src/core/live/`):**

- A causal EMA of weight (time constant about 0.3–0.5 s) and causal live flow (slope over
  about 1 s).
- A causal stability detector. The pure stability rule may be shared with analysis; state may
  not.
- A display state machine: idle → cup on (stable) → armed → tare fired (asks the caller to send
  `07`) → running → tail → done or cup removed.
  - **Arm-once:** the tare fires on entering the phase and disarms immediately. It re-arms only
    on cup removal or a manual reset, so it never fires again when the tail settles.
- Offset tracking across tares the app sends (an expected step).
- Remaining-to-target = dose × ratio − net weight.
- A "shot done" signal, which the UI uses to open the post-shot card and run analysis.

**Acceptance:** streaming simulator tests.

- The auto-tare fires exactly once per shot.
- A manual reset re-arms it.
- Remaining-to-target reaches about 0 at the target.
- Lint proves `src/core/analysis` doesn't import this module.

### T1.18 — Shot capture flow UI

**Status:** todo · **Depends:** T1.6, T1.14, T1.17 · **Read:** spec "Interaction constraints"
(all), "Manual start", "Grading", "Optional fields", "Flow and yield" (live ratio target)

**Deliverables (rudimentary UI, route `#/`):**

- One-tap connect.
- A live view showing only remaining-to-target ("8.2 g to go") and live flow, large enough for
  peripheral vision.
- A manual start button as a fallback: it sends `07` and is logged as both a UI action and a
  command.
- On "shot done": run the analysis on the recording so far, then show the post-shot card:
  - the direction tap (sour / balanced / bitter), the **only required input**;
  - channelled yes/no;
  - freeform tags, with recent tags as chips;
  - dose and ratio, defaulting to last-used, editable;
  - headline metrics: first-drip time, extraction time, yield, ratio.

  At most two taps to finish. Save the `Shot` entity with its anchor.

**Acceptance:**

- The full flow works with MockTransport (a Playwright smoke test is a bonus).
- Last-used defaults persist.
- Status becomes `verify` for the user in Bluefy.

### T1.19 — History and two-shot overlay chart

**Status:** todo · **Depends:** T1.14, T1.18 · **Read:** spec "Phase 1 — MVP" (7)

**Deliverables:**

- `#/history`: a list showing date, direction, first-drip time, yield, ratio and tags.
- Shot detail with a chart.
- Pick two shots to overlay weight and flow against time, aligned at `pump_on` or `first_drip`
  (a toggle).

Hand-rolled SVG is fine for now. A chart library can come with T3.3 (and if one is over about
20 kB gzipped, ask the user first).

**Acceptance:** renders simulated shots, and the overlay alignment is correct.

### T1.20 — Automatic JSON export

**Status:** blocked (Q1) · **Depends:** T1.7 · **Read:** spec "Storage and export"; D-003

Ask the user Q1 first. Then:

- export every recording automatically when it ends, together with the metadata it references;
- keep a retry queue for failures;
- show "last exported …" in the UI.

Credentials, if any, are entered by the user on the device and never committed.

### T1.21 — Reconnect without re-pairing

**Status:** todo · **Depends:** T1.4, U1.1 (B3) · **Read:** spec "Re-pairing — check early"

- **If `getDevices()` works in Bluefy:** remember the scale and reconnect with one tap, or
  automatically on load if that's permitted.
- **Otherwise:** document the friction and ask the user whether to move the Capacitor wrapper
  (T3.4) up the order.

### T2.1 — Entities: bean bags, grinders, burr epochs, containers

**Status:** todo · **Depends:** T1.5, T1.7 · **Read:** spec "Schema rules", "Bean bags",
"Grinders and burr epochs", "Session state machine" (containers)

**Deliverables:**

- Models, stores (a DB version upgrade), export support and basic rudimentary CRUD screens for:
  - `BeanBag` { name, roaster, roastDate, initialWeightG, remainingEstimateG, reconciledAt,
    quality: like|dislike|null, archived };
  - `Grinder` { name, settingKind: 'stepless'|'clicks', unit label }. Suggested seeds: Eureka
    ORO Mignon Single Dose Pro (stepless), Comandante C40 MK4 with Red Clix (clicks);
  - `BurrEpoch` { grinderId, startedAt, reason, provisional }. The ORO starts in a
    `provisional` seasoning epoch, as the spec asks;
  - `Container` { name, emptyMassG, role }.
- Shots reference entities by id.

### T2.2 — Bean bag tracking

**Status:** todo · **Depends:** T2.1, T1.18 · **Read:** spec "Bean bags"; Q5

- The bean on the post-shot card defaults to last-used.
- Days off roast is derived for every shot and shown in history.
- The remaining estimate is decremented by **beans weighed**, not by dose achieved. Beans
  weighed comes from the beans phase (T2.6); until then, a manual entry.
- A reconcile action weighs the bag and overwrites the estimate.
- Like/dislike once per bag, never on shot one (the timing rule comes from Q5).

### T2.3 — Grinder settings and burr epochs in the capture flow

**Status:** todo · **Depends:** T2.1, T1.18 · **Read:** spec "Grinders and burr epochs",
"Interaction constraints"

- The post-shot card shows grinder and setting unobtrusively, defaulting to last-used for that
  grinder.
- The input fits the grinder: a decimal for stepless, an integer for clicks.
- The current burr epoch attaches automatically.
- An epoch marker action (after seasoning, a deep clean or any disassembly).
- History marks comparisons across epochs, and shows provisional settings as provisional.

### T2.4 — Container learning and recognition

**Status:** todo · **Depends:** T2.1, T1.17 · **Read:** spec "Session state machine",
"Unknowns" (container masses)

- Learn an empty container's mass once.
- Live recognition: a stable placement step matches a container within ±1–2 g. Mass also
  separates an empty bean cup from one already holding beans.
- An unrecognised step falls through to a manual selector.
- A post-hoc version in analysis labels segments with the container.

### T2.5 — Phase routing state machine

**Status:** blocked (Q3) · **Depends:** T2.4 · **Read:** spec "Session state machine" (the
diagram at line 209 is missing: Q3)

- The vessel's mass selects the phase (beans, grind or extraction). It is not a sequence to
  step through.
- A manual selector is the fallback.
- Display-only, built on the live pipeline.
- Post-hoc labelling of phases in analysis.

### T2.6 — Beans phase

**Status:** todo · **Depends:** T2.5, T2.2

- Weigh the beans in the bean cup to get "beans weighed".
- Decrement the selected bag by that amount.
- Default the dose to it when there's no grind phase.

### T2.7 — Grind phase

**Status:** blocked (Q2) · **Depends:** T2.5 · **Read:** spec "Grind phase limitation"

- Weigh the grounds in the dosing cup after grinding, giving the dose.
- Retention = beans weighed − grounds.
- Without a dosing cup, the grind phase reduces to beans-in only.

### T2.8 — Field configurator

**Status:** todo · **Depends:** T1.18 · **Read:** spec "Schema rules"

- Settings to show or hide optional capture fields.
- Hidden fields are still stored, as `null`. A test proves schema completeness.

### T3.1 — Audio pump detection

**Status:** todo · **Depends:** U1.1 (B8) · **Read:** spec "Audio viability, if pursued"

1. Check feasibility in Bluefy: `getUserMedia` needs HTTPS and a gesture, and Bluefy's behaviour
   is unknown.
2. If it's viable, an FFT detector that tells the 50 Hz pump tone and its harmonics apart from a
   broadband grinder and from silence. It drives `pump_on` and `pump_off`, and phases.

Ask the user how audio should be recorded: raw audio is heavy, so per-band energies stored as
another raw stream may be enough.

### T3.2 — Keep-alive via `0x25`

**Status:** blocked (U1.1: A6) · **Depends:** T1.6

If the Mini honours `25`, send it periodically while connected, well before the auto-off
deadline.

### T3.3 — Richer charts and history analysis

**Status:** todo · **Depends:** T1.19

- Filters: bean, days off roast, burr epoch, tags (for example the warm-up tag).
- Trends, such as first-drip time against grind setting within an epoch.
- A chart library, if it's worth the weight.

### T3.4 — Capacitor wrapper

**Status:** todo · **Depends:** the T1.21 outcome · **Read:** spec "Scope and platform"

- A native shell with `@capacitor-community/bluetooth-le`, implementing `ScaleTransport`.
- Background BLE.
- Xcode and signing (the user).

Only if the shim browser's re-pairing friction proves annoying in daily use.

### T3.5 — UI polish

**Status:** todo · **Depends:** M3

- A design pass, accessibility, and the large-number live display.
- Upgrade Preact to 11 once `@preact/preset-vite` supports it (D-001).

---

## Progress log

One line per finished task, newest last: `date · task · what changed`. The details are in the
commit, found with `git log --grep='(T#.#)'`.

- 2026-10-03 · T0.1 · Spec committed; plan, agent manual, architecture, decisions, protocol
  notes and hardware tests written.
- 2026-10-03 · T0.2 · Toolchain scaffold: Vite + Preact + TS + Vitest + ESLint (boundary rules)
  + Prettier; capability-table home page.
- 2026-10-03 · T0.3 · CI (check + build on every push) with GitHub Pages deploy from `main`;
  SessionStart hook installs dependencies in cloud sessions.
