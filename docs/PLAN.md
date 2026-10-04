# Implementation plan

The single source of truth for what's done and what's next. **Every agent updates this file in
the same commit as its work** (protocol in `CLAUDE.md`).

**Next task: T1.22** (bring the simulator to the first hardware answers), then T1.14 (metrics,
analysis runner, derived cache) and the board in order. Hardware session 1 (U1.1, D-037)
answered most of Part A. The rest of U1.1 waits until the user is at the scale, above all a shot
recorded with the probe for A2, the pump's vibration. Setting up automatic export (U1.2) waits for
the user too (D-031). Until then, build against the simulator and mark device-dependent values
`PROVISIONAL(U1.1: <test>)`; T1.16 adjusts them afterwards (D-029).

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
| M1 Raw capture on the phone | T1.1–T1.8, U1.1 | The BLE path is proven on the phone, every packet recorded and exportable, Phase 0 answered, real fixtures captured |
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
| U0.1 | USER: enable GitHub Pages, open the app in Bluefy | done | T0.3 |
| U0.2 | USER: Phase 0 with nRF Connect or LightBlue (optional, see U1.1) | user | — |
| T1.1 | Protocol codec | done | T0.2 |
| T1.2 | Core data model | done | T0.2 |
| T1.3 | Transport interface, shot simulator, mock transport | done | T1.1, T1.2 |
| T1.4 | Web Bluetooth transport | done | T1.3 |
| T1.5 | IndexedDB storage | done | T1.2 |
| T1.6 | Recorder service | done | T1.3, T1.5 |
| T1.7 | Export/import format v1 and manual export | done | T1.5 |
| T1.8 | Probe (diagnostics) screen | verify (U1.1) | T1.4, T1.6, T1.7 |
| U1.1 | USER: hardware tests on the phone, capture fixtures | user (session 1 done) | T1.8 |
| T1.9 | Timebase reconstruction | done | T1.1, T1.3 |
| T1.10 | Signal toolkit | done | T0.2 |
| T1.11 | Stability, zero-tracking, shot windows | done | T1.9, T1.10 |
| T1.12 | Liquid markers and tail fit | done | T1.11 |
| T1.13 | Pump markers (`pump_on` / `pump_off`) | done | T1.11 |
| T1.14 | Metrics, analysis runner, derived cache | todo | T1.12 |
| T1.15 | Analysis inspection CLI | todo | T1.7, T1.14 |
| T1.16 | Tune analysis on real fixtures | blocked (U1.1) | T1.13, T1.15, T1.22, U1.1 |
| T1.17 | Live pipeline (display only) | todo | T1.1, T1.3 |
| T1.18 | Shot capture flow UI | todo | T1.6, T1.14, T1.17 |
| T1.19 | History and two-shot overlay chart | todo | T1.14, T1.18 |
| T1.20 | Automatic export to a private GitHub repo | verify (U1.2) | T1.6, T1.7 |
| U1.2 | USER: set up automatic export (private data repo, token) | user | T1.20 |
| T1.21 | Reconnect without re-pairing | todo | T1.4 |
| T1.22 | Simulator to the first hardware answers | todo | T1.3, U1.1 (session 1) |
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
| Q1 | Where should automatic exports go? Options: commit to a private GitHub repo with a fine-grained token (zero taps, and agents can read real recordings straight from it), Safari's Download into iCloud Drive or the share sheet after each session (a tap or two), something else | T1.20 | **answered 2026-10-04:** a private GitHub repo, for now, used only when configured on the device (D-027) |
| Q2 | The grind phase needs a dosing cup that fits the 8×8 cm platform (spec: "Grind phase limitation"). Do you have one, or will you? Without one, the grind phase is beans-in only and retention can't be measured | T2.7 | open |
| Q3 | The spec's "phase routing" diagram (3 phases, 1 decision) didn't survive export (spec line 209). Can you re-share it, or confirm the text-only reading in T2.5? | T2.5 | open |
| Q4 | Only if A2 shows that pump vibration doesn't reach the weight signal: `pump_on` can't then come from the scale. Use the manual-start (`07`) press as `pump_on` (with human latency), or leave pre-infusion `null` until audio (T3.1)? | T1.16 | open: asked in T1.16 once A2 is known, and moot if the pump vibration shows up (D-029) |
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

**Status:** done · **Depends:** T0.3

1. On GitHub, go to the repo's **Settings → Pages → Build and deployment → Source** and choose
   **GitHub Actions**.
2. Under **Actions → "CI and Pages" → Run workflow**, run it on `main` (or just push anything).
3. Open <https://misch0n.github.io/smart-scale/> in Bluefy and screenshot the capability table
   (hardware test B1). Give it to an agent to record in `docs/hardware-tests.md`.

**Completed 2026-10-03:**

- Pages is live. The user's manual run #3 was the first successful deploy, and every push to
  `main` redeploys since.
- B1 is recorded in `docs/hardware-tests.md`: Bluefy and beacio both show all eight APIs as
  present, including `getDevices()` and `getUserMedia`. That's feature detection only. Whether
  they actually work is B3 and B5–B9, run with the probe in U1.1.
- The user would rather use beacio than Bluefy if it works (D-016). Part B runs in beacio first.
- B9 (same day): beacio isn't available from a home-screen icon, only in a Safari tab. Its
  storage is therefore a non-installed site's, which Safari can delete (D-016 update), and that
  makes automatic export (Q1, T1.20) more pressing.

### U0.2 — USER: Phase 0 with nRF Connect or LightBlue (optional)

**Status:** user

Work through `docs/hardware-tests.md` Part A. This is optional: U1.1 covers the same tests with
the in-app probe, which also records the data. A14 and A15 (advertisement and characteristic
properties) are easiest in nRF Connect, though.

### T1.1 — Protocol codec

**Status:** done · **Depends:** T0.2 · **Read:** spec "BLE protocol reference", "Parsing rules",
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

**Completed 2026-10-03:**

- `src/core/protocol/`, imported through its `index.ts` barrel:
  - `uuids.ts`: 16-bit and 128-bit UUIDs, plus `DEVICE_NAME_PREFIX` (`BOOKOO`) for T1.4's
    discovery filter.
  - `checksum.ts` and `hex.ts`. `toHex` defaults to upper case with spaces, like the docs;
    `toHex(bytes, '')` packs it.
  - `commands.ts`: one constructor per whitelisted command, `allWhitelistedCommands()` and
    `isWhitelistedCommand()`. A `ScaleCommand` is `{ name, param, bytes, unverified }` plus a
    type brand (D-015).
  - `frames.ts`: `decodeFrame()`, `hasTrustedWeight()` (D-014) and `encodeWeightFrame()`, which
    has idle defaults and throws `RangeError` instead of truncating.
  - `failure-counter.ts`: `RollingFailureCounter`. It alarms when more than 25 of the last 50
    frames failed. Feed it `decodeFrame(bytes).kind === 'invalid'`.
- Decode rules: a known header (`03 0B`, `0D`, `0F`) with the wrong length is `invalid`
  (`length`) even when its checksum is valid. Any other header with a valid checksum is
  `unknown`, including echoed `03 0A` commands and other product bytes. Values are never `-0`.
- Tests (133): golden command bytes from the spec and protocol-notes; golden weight, event and
  powder frames laid out by hand from the docs, so the decoder isn't only checked against its own
  encoder; round trips at the 16- and 24-bit limits; a seeded 20 000-frame fuzz; the whitelist
  enumeration; and a pinned export list. A mutation pass confirmed the tests catch each of these:
  a truncated u24 (aiobookoo's bug), a missing length check, an added `0x09`, unknown signs read
  as `+`, and skipping the byte comparison.
- For later tasks: transports call `isWhitelistedCommand()` before every write (now in T1.3 and
  T1.4). The event and powder layouts are the Ultra's, so treat them as tentative until real
  frames arrive (U1.1).

### T1.2 — Core data model

**Status:** done · **Depends:** T0.2 · **Read:** spec "Data model and storage", "Session
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
- `Recording` stores the user agent, which the app layer passes in because core can't read
  `navigator`. Fixtures can come from beacio or Bluefy (D-016), and their notification timing
  may differ.

**Acceptance:** the types compile, the normalisers are tested, and `docs/ARCHITECTURE.md`
"Data model" matches the code. Confirm D-007, or refine it and update `DECISIONS.md`.

**Completed 2026-10-03:**

- `src/core/model/`, imported through its `index.ts` barrel:
  - `ids.ts`: `newId()`, `createIdGenerator()` (injectable clock and random source), `isId`,
    `idTimestampMs` and `shortId` (D-017).
  - `schema.ts`: the `field.*` parsers, `ObjectSchema<T>`, `SchemaError` and `JsonValue`
    (D-018). Reuse it for new record types (T2.1) and for import validation (T1.7).
  - `recording.ts`: `Recording`, `createRecording`, `endRecording` (it throws on a second end),
    `normaliseRecording` and `epochMsAt`.
  - `frame.ts`: `RawFrame`, `CharacteristicName`, `createRawFrame` (copies the bytes) and
    `normaliseRawFrame`.
  - `events.ts`: `AppEvent`, a union over `AppEventDataMap` with the ten types listed above;
    `createAppEvent`, `normaliseAppEvent`, `commandEventData(cmd, reason)`,
    `ANNOTATION_LABELS` and `APP_EVENT_TYPES`.
  - `sequence.ts`: `RecordingSequence` stamps a recording's frames and events from one
    contiguous counter.
  - `shot.ts`: `Shot`, `createShot`, `updateShot` (skips `undefined`, refuses the identity
    fields) and `normaliseShot`.
- D-007 is confirmed, and D-019 refines it: deleting a shot sets `discardedAtEpochMs`, so
  re-analysis doesn't recreate it; `tags` tells `[]` (none) from `null` (not captured);
  `beansWeighedG` is there from day one; `grindSetting` is `{ kind, value }`.
- Tests (177 new, 315 in all). `completeness.test.ts` covers every record type and each event
  type. A record with only its required fields normalises to every key, the rest `null`, and
  keeps them through JSON. A complete record normalises to itself in key order. Every required
  field is enforced, and unknown keys are dropped. The complete samples are typed as the
  interfaces, so a new field doesn't compile until its sample has it. A mutation pass (14
  mutants, such as a nullable field parsed as required, a non-monotonic id counter, a `seq` gap
  or uncopied frame bytes) was caught in full.
- For later tasks: notes added to T1.3, T1.5, T1.6, T1.7, T1.14, T1.19, T2.1 and T2.8.

### T1.3 — Transport interface, shot simulator, mock transport

**Status:** done · **Depends:** T1.1, T1.2 · **Read:** spec "Scope and platform" (transport
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

  Commands are whitelist values, never raw bytes from callers. Every implementation, the mock
  included, calls `isWhitelistedCommand()` right before writing and refuses to write anything
  that fails it (D-015).
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
for Playwright checks. Take `CharacteristicName` and `TransportKind` from `src/core/model` for
`source` and `kind`.

**Completed 2026-10-03:**

- `src/transport/` (D-020):
  - `types.ts`: `ScaleTransport`, `ScaleNotification`, `ConnectionInfo` (device, both
    characteristics' GATT properties, `subscribed`), `TransportStatus` and `TransportError`
    with a `code`.
  - `command-queue.ts`: `CommandQueue`, which every transport writes through. It keeps one
    write in flight with a pause after each, and runs `isWhitelistedCommand()` and copies the
    bytes right before each write (D-015). `clear()` rejects what's queued, on disconnect.
  - `scheduler.ts`: `Scheduler`, `systemScheduler`, and `ManualClock` (virtual time for tests).
  - `emitter.ts`: the listener helper. A listener that throws doesn't stop the others.
  - `mock.ts`: `MockTransport({ scenario, speed, scheduler, connectDelayMs, writeSpacingMs,
    ff12Notify })`. It replays a simulated session on a virtual clock (session time 0 is the
    first connect) and writes commands into the simulated scale. Reconnecting rejoins the same
    world. `mock.simulator.truth()` has the ground truth.
- `src/core/sim/` (D-021; ARCHITECTURE "Simulator"): `Rng` (seeded, one stream per effect);
  `params.ts` (every scale and link parameter, documented, with provisional defaults);
  `shot.ts` (the analytic shot model); `script.ts` (cup on/off/back, shot, pump, bump, tare
  button, command, power-off); `weighing-platform.ts`; `link.ts`; `simulator.ts`
  (`ScaleSimulator` and the truth types); `session.ts` (`simulateSession`, `toRawRecording`,
  `espressoScenario`, `demoScenario`).
- `src/core/protocol`: `encodeEventFrame()` (`03 0D`), for the simulator's optional timer
  events.
- Tests (207 new, 522 in all). They cover determinism per seed and independence from how the
  simulator is stepped; every frame decoding to its truth; markers and yields where the frames
  show them; vibration raising the rolling variance more than tenfold in pre-infusion without
  moving the mean, and changing nothing at σ 0; each command's effect, both in the simulator and
  through `MockTransport`; and the D-015 refusal of a command mutated while queued. A mutation
  pass of 18 mutants was caught in full, after two added tests. The mutants included skipping
  the whitelist check, vibration always on, random draws tied to stepping, and a queued command
  surviving a disconnect.
- Gotcha: the lint rule that keeps `src/platform` out of core matches any import ending in
  `/platform`, hence the name `weighing-platform.ts`.
- For later tasks: notes added to T1.4, T1.6, T1.8, T1.9, T1.11–T1.13, T1.15–T1.17 and U1.1.

### T1.4 — Web Bluetooth transport

**Status:** done · **Depends:** T1.3 · **Read:** spec "Scope and platform", "BLE protocol
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
  properties, falling back to `writeValue`. Re-check each command with `isWhitelistedCommand()`
  immediately before its GATT write (D-015), and test that a mutated command is refused.
- Discovery uses `SERVICE_UUID16` and `DEVICE_NAME_PREFIX` from `src/core/protocol`.
- `gattserverdisconnected` → a `disconnected` status with a reason. No reconnect loop here
  (that's T1.21).
- Feature-detect `navigator.bluetooth.getDevices()` and expose `reconnectKnownDevice()` when it
  is available (hardware test B3).
- Add `@types/web-bluetooth`.

**Acceptance:**

- Unit tests against a hand-written fake `navigator.bluetooth`: subscription order, byte
  copying, write serialisation and the disconnect path.
- This is the only file that touches `navigator.bluetooth` (lint).
- Status becomes `verify` until the user connects from the phone: beacio first, Bluefy as the
  fallback (U1.1, B2; D-016).

**Notes:** connect-time policy (smoothing off, its confirmation) belongs to the recorder
(T1.6), not here. The transport stays dumb.

From T1.3: implement `ScaleTransport` (`src/transport/types.ts`) and keep its contract
(D-020). Report `connected`, with `ConnectionInfo`, before calling `startNotifications()`, and
write through `CommandQueue` with about 100 ms spacing, since that's where the D-015 check
lives. `command-queue.test.ts` shows the mutated-command test. Take a `Scheduler`
(`systemScheduler` by default) so tests can run on `ManualClock`. Add `reconnectKnownDevice()`
to the interface as an optional member, and to `MockTransport`.

**Completed 2026-10-03:**

- `src/transport/web-bluetooth.ts`: `WebBluetoothTransport({ bluetooth?, scheduler?,
  writeSpacingMs? })`. `bluetooth` defaults to `navigator.bluetooth`, read when needed. D-022
  has the choices:
  - canonical 128-bit UUID strings, and filters for service 0FFE or a name starting `BOOKOO`;
  - order: `requestDevice()` synchronously inside `connect()`, GATT connect, the
    `gattserverdisconnected` listener, service, FF11, FF12, notification listeners,
    `connected`, `startNotifications()` on FF11 and then on FF12 (only if it reports `notify`
    or `indicate`), and only then does `connect()` resolve;
  - any failed subscription, FF12's included, fails the connect: the status goes `connected` →
    `disconnected` with reason `error`;
  - writes go with response when FF12 reports `write`, else without, else `writeValue`. A
    command sent before the subscriptions finish waits for them, and a write in flight rejects
    as `disconnected` when the link ends;
  - error messages name the step, like `Getting service 0FFE: NotFoundError: …`;
  - `reconnectKnownDevice` is a getter, present when `getDevices` exists. It takes this
    transport's last device id, else the first `BOOKOO…` name, and its error lists what
    `getDevices()` returned.
- `ScaleTransport.reconnectKnownDevice?` is an optional member. `MockTransport` has it, and it
  is just `connect()` there.
- `Emitter` delivers a value emitted inside a listener after the current one, so every listener
  sees statuses in order (D-020 update).
- `src/transport/fake-web-bluetooth.ts` is the test fake. It logs every call, can hold or fail
  any step, reuses one buffer for every notification, reports properties as prototype getters,
  and fires `gattserverdisconnected` synchronously from `gatt.disconnect()`.
- Lint: only `web-bluetooth.ts` may touch `navigator.bluetooth` now, not all of
  `src/transport`, and the `window.navigator.bluetooth` form is caught too. `@types/web-bluetooth`
  is a dev dependency, listed in `tsconfig.app.json` `types`.
- Tests: 57 new (579 in all), against the fake. A mutation pass of 34 mutants caught 33,
  among them `connected` after subscribing, no byte copy, a spread of the properties, an
  `await` before the chooser, and a write left hanging after a disconnect. The survivor is
  equivalent: `send()` checks both the status and the queue, which always agree.
- Not run against hardware: nothing in the UI uses it yet. T1.8 adds the probe's Connect
  button, and U1.1 checks it in beacio, then Bluefy (B2, B3, A14, A15).

**Verified 2026-10-04 (U1.1 session 1, D-037):**

- B2: it connected on the iPhone, with Safari's user agent (so presumably beacio), and streamed
  338 s without a break. Nothing was lost, though seven microphone tries each held the
  notifications back for 0.5–0.7 s.
- A15: FF11 and FF12 are both read, write and notify. A14: the scale is `BOOKOO_SC 109813`.
- B3 (reconnect) wasn't tried. It is T1.21's check.

### T1.5 — IndexedDB storage

**Status:** done · **Depends:** T1.2 · **Read:** spec "Data model and storage" (all);
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
- Run every record read from IDB through the model's normalisers (`normaliseRecording` and the
  rest; D-018), so old records gain new fields as `null`.
- Frames and events carry a contiguous per-recording `seq` (`RecordingSequence`), so the
  read-order tests can also check for gaps.

**Completed 2026-10-03:**

- `src/storage/`: `openStorage({ name?, framesPerChunk?, onBlocked? })` returns `AppStorage`
  with `recordings`, `raw`, `shots`, `derived`, `kv` and `close()`. D-023 has the choices:
  - schema version 1, built by `MIGRATIONS` in `db.ts`; the stores and keys are in
    ARCHITECTURE "Storage";
  - raw is add-only three ways: no update or delete method (a type-level test pins the method
    sets), IndexedDB `add`, and an append check (the recording is stored, and every new `seq`
    comes after everything stored for it, frames and events alike; gaps are allowed, repeats
    refused). One transaction per append;
  - one frame chunk per append, at most 256 frames, never rewritten. The plan's
    fixed-capacity chunks would have meant rewriting stored raw on every flush;
  - store values are typed `unknown`, so every read goes through a normaliser; writes
    normalise too;
  - one shared `Connection`, which opens again after the browser closes it (a `close` event,
    `InvalidStateError`, `UnknownError`) and closes itself on `versionchange`. A database a
    newer build upgraded gives `newer-version`;
  - `StorageError` with a `code` for IndexedDB failures. Programming errors pass through.
- `RecordingWriter(storage, recording, { maxDelayMs, maxRecords, timers, onError })` is the
  batcher. It creates the recording with its first write, at once, then writes about every
  second or every 20 records. `flush()` writes everything now. A failed write keeps its records
  in order, and the timer retries them about once a second. It exposes `pendingCount`,
  `writtenCount`, `lastError` and `whenIdle()`.
- `requestPersistence(manager?)` returns `{ supported, persisted, usageBytes, quotaBytes,
  error }` and never throws.
- Dependencies: `idb` 8 (runtime, about 3 kB gzipped) and `fake-indexeddb` 6 (dev).
  `src/storage/fake-idb.ts` holds the test helpers: `freshIndexedDB()`, `closeAsBrowser()` and
  `openDirect()`.
- Tests: 99 new (678 in all). They cover an upgrade from an empty database and from version 1
  to a test version 2, read order across chunk boundaries, gaps and repeats, atomicity,
  `listOpen`, the type-level append-only checks, the writer's timing, failures, retries and
  order, and the healing connection. A simulated espresso session with 22 damaged frames goes
  through the writer and reads back identical. A mutation pass killed 50 of 51 mutants. The
  survivor, `put` for `add` on events, can't change behaviour behind the order check.
- Nothing in the app imports storage yet, so the bundle is unchanged. T1.6 and T1.8 wire it in.

### T1.6 — Recorder service

**Status:** done · **Depends:** T1.3, T1.5 · **Read:** spec "Data model and storage" ("record
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
  frames failed: `RollingFailureCounter` from `src/core/protocol`), the latest decoded weight
  frame, `unitOk`, and smoothing state.
- On disconnect: flush, then end the recording with a reason. At startup, any recording with no
  end time is ended as `unclean` at its last frame time.

**Acceptance:** integration tests with MockTransport and `fake-indexeddb`:

- a simulated session is stored completely, including corrupt frames (count in = count stored);
- frames and events interleave in `seq` order;
- the smoothing confirmation and its retry work;
- unclean recovery works.

**Notes:** build every record with `src/core/model`:

- `createRecording`, passing `navigator.userAgent`;
- `RecordingSequence` for every frame and event, so they share one `seq`;
- `commandEventData(cmd, reason)` for command events;
- `endRecording`, which throws on a second end, so make the disconnect path idempotent.

The event types are in `AppEventDataMap`. Add one there if the recorder needs a new kind
(D-018).

From T1.3: test against `MockTransport` on a `ManualClock`; `mock.test.ts` shows the pattern
(`connect()`, `clock.advance(300)`, then `await`). The recording starts at `transport.now()`
when the status turns `connected`, so `tMs = tArrival − start`. Stamp app events with
`transport.now()` too. `ConnectionInfo.properties` feeds the `characteristic-properties` events.
`demoScenario()`, or `scale: { initialSmoothing: true }`, starts with smoothing on, and
`mock.simulator.truth().commands` lists what the scale received. `ManualClock.advance()` is
synchronous, so await between advances where IndexedDB promises chain.

From T1.4: `connected` comes before notifications start, and a command sent on `connected` waits
for them, so sending `flowSmoothingOff` from the status listener is fine. If a subscription then
fails, the status goes `connected` → `disconnected` (reason `error`, a message naming the step),
the command rejects as `disconnected`, and `connect()` rejects even though `connected` was
reported. End the recording with that reason. Don't take a rejected `connect()` to mean that no
recording was started.

From T1.5:

- Write through `RecordingWriter` (`src/storage`). Make one on `connected`, then
  `appendFrame(sequence.frame(…))` and `appendEvent(sequence.event(…))`. It creates the
  recording itself, at once, so don't call `recordings.create`. In tests, pass the transport's
  `ManualClock` as `timers`. A write starts on a microtask, so records appended in the same
  tick go into it.
- On disconnect, `await writer.flush()`, then `storage.recordings.end(id, epochMs, reason)`. A
  second `end` throws `StorageError` with code `already-ended`. Flush on `visibilitychange`
  (hidden) and `pagehide` too.
- `onError` reports each failed write. The records stay queued (`pendingCount`) and are
  retried. Log an `error` event (context `storage`) and show a warning, but drop nothing.
- Unclean recovery: `storage.recordings.listOpen()`, then `storage.raw.last(id)` for the last
  frame and event, then `end(id, startedAtEpochMs + tMs, 'unclean')`. **Trap:** another tab may
  be recording one of those open recordings right now, and ending it would mark a live
  recording `unclean`. One way out: hold a Web Lock (`navigator.locks.request`) named after the
  recording while recording, and skip open recordings whose lock is held. Decide, and record
  the choice in `docs/DECISIONS.md`.

**Completed 2026-10-03:**

- `src/app/recorder.ts`: `new Recorder({ transport, storage, app, userAgent, epochNow?, timers?,
  locks?, page?, writer? })`. D-024 has the choices, ARCHITECTURE "Recorder" the shape:
  - `connected` starts a recording: stored at once, with its Web Lock held, then `connected`
    and both `characteristic-properties` events, then `flowSmoothingOff`. The first weight
    frame with smoothing byte 0 logs `smoothing-confirmed`. Without one, a retry 2 s after the
    write settled, then `smoothing-not-confirmed` 2 s later, shown as a warning;
  - every notification is stored verbatim with `seq`, `tMs = tArrival − start` and its source;
  - `sendCommand(cmd, reason)` logs `command-sent` when the write completes, or
    `command-failed`. `logUiAction(action, detail)` and `annotate(label, text)` return the
    event, or null when nothing is recording;
  - `disconnected` logs the last event, stores every record (retrying until it can), ends the
    recording with the transport's reason at `startedAtEpochMs + tMs`, then releases the lock;
  - a failing storage gets one `error` event per run of failures and a `storage-failing`
    warning, and loses nothing. A hidden page flushes every writer;
  - observable: `state` (`recording`; `stats` with frames, frames/s, FF11 decode failures and
    the alarm, the latest weight frame, `unitOk`, smoothing; `unsaved`, `finishing`,
    `storageError`, `warnings`), `onChange` (after every change, and every second while
    recording), `onFrame` (each frame with its decoding, bytes copied) and `onEvent`, plus
    `flush()` and `whenIdle()`.
- `src/app/recovery.ts`: `recoverUncleanRecordings(storage, { locks?, epochNow? })` returns
  `{ ended, skipped, failed }`. It ends an open recording as `unclean` at its last stored
  record only if it can take that recording's Web Lock; without Web Locks, only if the
  recording stored nothing in the last minute. It appends nothing.
- Helpers: `recording-locks.ts` (the lock name, `holdRecordingLock`, `ifRecordingLockFree`,
  `systemLocks()`), `page-lifecycle.ts` (`browserPageLifecycle`), and `fake-locks.ts`, a Web
  Locks fake for tests (Node has none).
- Tests: 62 new (740 in all), with MockTransport, the Web Bluetooth fake, a hand-driven
  transport, fake-indexeddb and `FakeLocks`. They cover a damaged espresso session stored frame
  for frame (count in = count stored), seq and tMs order, every smoothing path, when commands
  are logged, the end reasons (`user`, `device`, and `error` after `connected`), storage
  failures and retries, a hidden page, the live stats, and recovery with and without locks. A
  mutation pass killed all 9 mutants tried, once a test for FF12 frames was added.
- Nothing in the UI uses it yet; T1.8 wires it in, so the bundle is unchanged.

### T1.7 — Export/import format v1 and manual export

**Status:** done · **Depends:** T1.5 · **Read:** spec "Storage and export", "Schema rules";
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

**Notes:**

- Automatic export is T1.20 (Q1). Derived data is left out by default.
- Validate each record with the model's normalisers (D-018). Everything is JSON-native except
  frame bytes. Discarded shots (`discardedAtEpochMs`) are exported too.
- The `<id8>` in file names is `shortId(id)`, the id's last 8 digits. Its first 8 are timestamp
  bits (D-017).

From T1.5: `storage.raw.read(id)` returns `{ recording, frames, events }`, each list in `seq`
order, the same shape as the simulator's `RawSession`. `storage.shots.listForRecording(id)`
gives the shots. To import, `recordings.create` takes an ended recording and refuses an existing
id with code `exists`, which is the "skip existing raw" check. Then `raw.append` stores the
frames and events (it chunks them itself, and one call is one transaction). `create` and
`append` are separate transactions, so an import that fails between them leaves an empty
recording. If that matters, add a combined write to `src/storage/raw.ts`. Keeping or overwriting
existing shot metadata needs a replace method on `ShotRepository`, which doesn't exist yet.

**Completed 2026-10-04:**

- `docs/export-format.md` is the normative format, and D-025 has the choices. A file is
  `{ format: "smart-scale-export", formatVersion: 1, exportedAtEpochMs, app, recordings, shots,
  settings }`. Each recording entry is `{ recording, frames, events }` without repeating the
  recording id, frames are `[seq, tMs, source, hex]` rows, and shots and settings are top-level
  metadata. One record per line with one-space indents: about 80 bytes a frame, so three minutes
  at 10 Hz is about 145 KB. No entities until format version 2 (T2.1), and no derived data.
- `src/core/export/`: `serialiseExport(bundle)`; `parseExport(text)`, which refuses non-JSON,
  non-exports and newer versions (`ExportFormatError` with a code, and a message that says to
  reload), validates every record with the model's normalisers plus seq order and unique ids,
  naming the place (`recordings[0].frames[12][3]`), and upgrades older versions through
  `EXPORT_MIGRATIONS` (`FORMAT_VERSION` is their count plus one); and
  `recordingExportFileName` / `allExportFileName`. `test-samples.ts` is a bundle for tests with
  every event type, damaged and FF12 frames, an open recording and full and empty shots.
- `src/app/export.ts`: `exportRecording(storage, id, { app })` (the recording and its shots),
  `exportAll(storage, { app })` (everything, with the settings), and
  `importBundle(storage, bundle, { metadata: 'keep' | 'replace' })`, which returns a report.
  Import never replaces raw: a stored recording is skipped, and the report counts records the
  file has past the stored copy's end. A recording open in the file is stored ended as
  `unclean`. Stored shots and settings are kept unless `replace`; a shot with another identity
  is a conflict, left alone. `src/app/storage.ts` re-exports `openStorage` for the UI.
- Storage: `raw.addRecording` stores a whole recording in one transaction, so a failed import
  leaves nothing behind; `shots.replace` (refuses another identity); `kv.entries`. Model:
  `normaliseAppInfo`, `sameShotIdentity`. Recovery exports `uncleanEndEpochMs`.
- UI: the home page opens storage and shows `ExportPanel`: the recordings, Export per
  recording and Export all, which prepare the file, then Download (an `<a download>` blob link)
  and Share… where `navigator.canShare({ files })` says yes (`src/platform/share.ts`); Import from
  a file input, with a "replace" checkbox, and its report.
- Tests: 89 new (829 in all), covering the acceptance criteria: raw bytes come back identical,
  every key comes back, nulls included, a newer version gives a clear error, and three minutes
  at 10 Hz is under 150 KB. A mutation pass killed all 19 mutants tried. Playwright on the
  production build in Chromium: imported a simulated export, exported one recording and all,
  downloaded, shared (stubbed share sheet), re-imported with nothing changed, had a newer
  version refused, reloaded, and found no sideways scroll at 390 px.
- Known limitation (D-025): a recording first imported from a snapshot taken while recording
  can't later be completed from a longer copy. The import reports how many records it skipped.

### T1.8 — Probe (diagnostics) screen

**Status:** verify (U1.1) · **Depends:** T1.4, T1.6, T1.7 · **Read:** `docs/hardware-tests.md` (the probe
must make every test there doable), spec "Unknowns to test before building", "Re-pairing —
check early"; D-012

**Goal:** the first useful deploy. It connects from the phone (beacio first, Bluefy as the
fallback; D-016), shows and records everything, runs Phase 0, and exports fixtures. It's
rudimentary UI on the `#/probe` route, which is the default route until T1.18.

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
- A "Try microphone" button for B8: call `getUserMedia({ audio: true })`, show and log the
  outcome (granted, denied or error), then stop the stream. B1 showed the API is present.
- A recordings list with per-recording export and "export all".
- The capability panel, the storage persistence result, and a Screen Wake Lock held while
  connected (with its status shown).
- The mock transport via `#/probe?mock`.

**Acceptance:** works end-to-end with MockTransport in desktop Chromium (verify it with
Playwright). Status becomes `verify` until the user runs it on the phone (U1.1).

**Notes:** from T1.3, `new MockTransport({ speed })` replays `demoScenario()` by default: two
shots, a stray tare-button press in the second tail, smoothing on at the start, and `03 0D` timer
events on FF12 when the timer starts or stops, so the FF12 highlight has something to show.

From T1.4: use `new WebBluetoothTransport()`. Call `transport.connect()` directly in the click
handler, with no `await` or other asynchronous work before it, because the chooser needs the
click's user activation. Show the `disconnected` message, which names the failing step. Show
"Reconnect known device" only when `transport.reconnectKnownDevice` is defined; it needs no
gesture. Show `ConnectionInfo.subscribed` and both characteristics' properties (A15). Offer
Disconnect while connecting too: it cancels, and in the iOS shims a reconnect may wait until the
scale is switched on. `fake-web-bluetooth.ts` is for unit tests only; Playwright uses the mock.

From T1.5: call `requestPersistence()` at startup and show its status (B6). `openStorage()` can
fail with code `unavailable` or `newer-version` (show it: the second means reload), and its
`onBlocked` option fires when another tab holds an older version open (ask the user to close
it). `storage.recordings.list()` feeds the recordings list.

From T1.6 (D-024):

- Make one `Recorder` per transport at app level, right after the transport and before the
  first connect, and keep it: it can't be detached, and two on one transport record everything
  twice. Screens subscribe (`onChange`, `onFrame`, `onEvent`) and unsubscribe. The mock and Web
  Bluetooth each need their own transport and recorder. Pass `app: BUILD_INFO` and
  `userAgent: navigator.userAgent`.
- At startup, after `openStorage()`, run `recoverUncleanRecordings(storage)` and show what it
  ended or failed to end.
- The status panel reads `recorder.state`: `stats.framesPerSecond`, `stats.failedFrames`,
  `recentFailures` and `failureAlarm`, `stats.lastWeight.frame` (unit byte) and `unitOk`,
  `stats.smoothing` (`status`, `attempts`, `byte`), and `warnings`, with `storageError` as the
  text for `storage-failing`. `unsaved` and `finishing` say whether everything is stored yet.
- Command buttons call `recorder.sendCommand(cmd, 'probe')`, which logs them; catch the
  rejection. Annotation buttons call `recorder.annotate(label, text)`, other presses
  `recorder.logUiAction(name)`.
- The last 20 hex frames per characteristic and the ms-field delta stats come from `onFrame`
  (`frame.source`, `frame.bytes`, `frame.tMs`, `decoded`).
- `await recorder.flush()` before exporting a recording that is still in progress.
- Consider a "Web Locks" row in the capability panel: unclean recovery is exact only with them.

From T1.7 (D-025):

- The export panel (`src/ui/ExportPanel.tsx`, given an `AppStorage`) lists the recordings with
  Export, Export all, Download, Share… and Import. It is on the home page for now; move it to
  the probe, and have it refresh its list when a recording starts or ends. Its Export doesn't
  flush a recorder: flush first for a recording in progress.
- `App.tsx`'s `useStorage` opens storage. Replace it with the startup wiring: open, then
  `requestPersistence()` and `recoverUncleanRecordings()`. The UI reaches storage through
  `src/app/storage.ts`.
- An export made while recording holds the recording open (`endedAtEpochMs: null`). Imported
  elsewhere, it is ended as `unclean` at its last record.

**Completed 2026-10-04** (D-028):

- **Startup** (`src/app/startup.ts`, `startApp`): opens storage, then runs `requestPersistence()`
  and `recoverUncleanRecordings()` together, then makes the links and the screen wake lock.
  - If recovery can't list the open recordings, startup goes on and the probe shows why.
  - `App.tsx` shows the startup state: waiting for another tab (`onBlocked`), "reload" for
    `newer-version`, and storage that isn't available.
- **Links** (`src/app/links.ts`, `ScaleLinks`): one transport, recorder and `ProbeMonitor` per
  kind of transport (Web Bluetooth, and the mock at each speed), each made on first use and kept.
  - The wake lock is wanted while any link is connecting or connected.
  - The page being hidden and shown again goes on the recording in progress as the `ui-action`s
    `page-hidden` and `page-visible` (B4). They are logged before the recorder's hidden flush, so
    that flush stores them.
  - `onRecordingsChanged` fires once a new recording is stored and once an ended one is ended.
    `flush()` flushes every recorder.
- **Display-only statistics** in `src/core/live`, the module's first code (CLAUDE.md hard
  rule 3):
  - `ProbeMonitor`: the last 20 frames per characteristic as hex, counts, the timer's gaps
    (A1), FF11 arrival gaps, the longest silence (B4), the weight's mean and σ over 0.5, 2 and
    10 s (A2, A11), the smallest weight step (A11), the byte values seen (A9, A10, A13), the
    last `03 0D` frame and the last 30 events.
  - `TimeWindow`, `RecentValues` and `summarise`, which it builds on.
- **Platform:**
  - `ScreenWakeLock`, which asks again when the page is visible again. Safari grants the lock
    only during a tap, so Connect asks for it right after `connect()`, and a failed request
    offers a "Keep screen on" button.
  - `tryMicrophone` (B8).
  - A Web Locks row in the capability table.
- **UI:**
  - Every hash shows the probe for now (`src/ui/route.ts`). `?mock` uses the simulator, and
    `&speed=N` runs it N times faster.
  - `src/ui/probe/ProbeScreen.tsx` shows, top to bottom:
    - the connection: Connect, Reconnect known device where the runtime has it, Disconnect
      (also while connecting), the failing step, the device, the subscribed characteristics and
      both characteristics' properties, and the wake lock;
    - warnings, and the latest weight frame's values and bytes;
    - commands, each with its bytes (keep-alive labelled unverified; a buzzer level picker that
      defaults to mute), annotations and notes;
    - recording status, weight statistics, FF12 frames (highlighted), FF11 frames and events;
    - the microphone, the recordings panel and the environment (capabilities, persistence,
      recovery, build).
  - The recordings panel moved from the home page. It flushes the recorders before exporting,
    and reloads its list when a recording starts or ends.
  - The screen redraws at most about 7 times a second.
- **Tests:** 82 new (911 in all). A mutation pass killed every mutant of 23 that wasn't
  equivalent.
- **Playwright:** `npm run e2e` runs `scripts/e2e-probe.mjs`, 36 checks. It drives the
  production build, served under `/smart-scale/` at phone width, in headless Chromium with the
  mock. It covers: connect, smoothing confirmed, the wake lock, tare+start with an FF12 event
  frame, the annotations, commands, the microphone, export while recording (flushed),
  disconnect, export all, unclean recovery after a reload, page visibility events, import into
  a fresh profile, a denied wake lock, and no page errors. It needs the agent environment's
  global Playwright, so CI doesn't run it.
- **Known limits:**
  - The probe can't answer A14's "is 0FFE advertised?": Web Bluetooth doesn't say which filter
    matched. nRF Connect can.
  - The simulator ships in the bundle (about 8 of 40 kB gzipped), so `?mock` works on the
    deployed site.

### U1.1 — USER: hardware tests on the phone, capture fixtures

**Status:** user · **Depends:** T1.8

Do this whenever you're at the scale. The other tasks continue meanwhile (D-029), and each one
that needs a device check ends as `verify`. This session checks them all: the board's `verify`
rows are the list.

Run `docs/hardware-tests.md` Part B (in beacio first, repeating anything that fails in Bluefy;
D-016), Part A (unless already done with nRF Connect) and the Part C captures. Upload the
exported recordings to an agent session. Once automatic export is set up (T1.20, U1.2), you can
skip the upload: add the data repo to the agent's session instead. The agent then:

- adds them to `fixtures/real/` with a README;
- records the answers in `docs/hardware-tests.md` and in the spec's unknowns table;
- brings the simulator's assumptions (D-021) in line with the answers;
- updates this board, unblocking T1.13, T1.16, T1.21, T3.1 and T3.2 as the results allow.

B2 also checks T1.4: once it connects in beacio (or Bluefy), set T1.4 to `done`. A failed
connect shows a message naming the step (`Getting service 0FFE: …`), and a failed reconnect
lists what `getDevices()` returned. Those messages are the useful part of the result, so record
them in `docs/hardware-tests.md`, and a runtime-specific fix goes in D-022.

From T1.8: the probe is the app's start page. "Using the probe" in `docs/hardware-tests.md` says
where each answer shows. Once B2 to B8 are in, set T1.8 to `done` too, or file what failed as a
task.

**Session 1 (2026-10-04, D-037):** one recording of probe commands, with no shot. It is now
`fixtures/real/2026-10-04_probe-session_20444bd0.json`, with a README and tests in
`src/core/real-fixtures.test.ts`.

- Answered: A1, A3, A9–A13, A15, A16 and B2. A14 is answered in part (the name), and the
  recording covers C1. T1.4 is done.
- Partly answered: A4 and A5 (the scale sometimes ignored `04` and `07`, and the mode wasn't
  noted), A7 (apparently nothing), B7 and B8.
- A6's method changed: the standby bytes don't count down.
- The simulator's assumptions go to T1.22.
- Still to do is in `docs/hardware-tests.md` "Session 1". Most of all: a shot with the probe
  recording, for A2, C3 and C5. T1.8 stays `verify` (B3–B6).

### T1.9 — Timebase reconstruction

**Status:** done · **Depends:** T1.1, T1.3 · **Read:** spec "Parsing rules" (3, 4); D-006;
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

From T1.3 (ARCHITECTURE "Simulator"): `simulateSession(espressoScenario({ ... }))` gives frames
that each carry their truth, and `truth.sampleTMs` is the true sample time. Every arrival is at
least `minLatencyMs` (15) after its sample, so compare reconstructed times after removing that
constant, or set it to 0. Jitter comes from `link: { jitterMeanMs, connectionIntervalMs,
stallProbability }`. For two stitched runs, script a second `07` (`type: 'command'`).
`truth.timer` lists every timer change, and `toRawRecording()` gives `RawFrame`s and events.

**Completed 2026-10-04:**

- `src/core/timebase/`: `buildTimeline(rawFrames)` decodes the FF11 weight frames and gives
  each a time `t` (s), its source (`device` or `arrival`) and the decoded frame. It also reports
  the device runs (offset, shared rate, own drift as the drift check, jitter), the recording's
  `rateSource` and `driftPpm`, the jitter, the arrival correction and the nominal interval.
  `fit.ts` has the pooled robust slope, `median` and `quantile`. D-032 has the design and the
  measurements.
- **Deviations from the plan's wording, both in D-032:**
  - Runs are mapped with a fitted rate as well as the least offset: at the simulator's 300 ppm
    drift, a single offset is 18 ms off after a minute.
  - The rate is shared by all runs (one scale clock), fitted by trimmed least squares, not the
    lower envelope: BLE connection events make the envelope ride a sawtooth.
- **Acceptance**, simulated: device-timed frames are within 5 ms of their samples, apart from
  one constant offset (the link's least latency), on the default link, with ±50 ms jitter and
  with stalls; outright within 5 ms on the default link. A timer that never runs gives arrival
  time. A frozen timer falls back to arrival from the stop, its first frozen frame included. A
  second `07` gives two runs, each within 5 ms, with a seam under 10 ms.
- **Next agents:** `t` never decreases, but bursts of arrival-timed frames can share a value.
  Arrival-timed frames are shifted by the median jitter (`arrivalCorrectionMs`). The two
  defaults that depend on the scale are `PROVISIONAL(U1.1: A1)`.

### T1.10 — Signal toolkit

**Status:** done · **Depends:** T0.2 · **Read:** spec "Signal processing", "Markers" (CUSUM
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

**Notes:** from T1.9, `src/core/timebase/fit.ts` already has `median`, `quantile` and a robust
(pooled, trimmed) least-squares slope. The module table lets timebase import only protocol and
model: either keep its copies, or let it import signal and say so in ARCHITECTURE.

**Completed 2026-10-04:**

- `src/core/signal/`: `resampleLinear`; `savitzkyGolay` and `savitzkyGolayCoefficients`;
  `rollingMean`, `rollingVariance` and `rollingRange`; `cusum`; `fitLine` (ordinary or
  weighted); `mean`, `median`, `quantile` and `mad` with `MAD_TO_SIGMA`; `stepAcrossGap` and
  `rollingStep`. Plain arrays in, `number[]` out; indexes and windows count samples. D-033 has the
  conventions, ARCHITECTURE "Signal toolkit" the list.
- `median` and `quantile` moved here from `src/core/timebase/fit.ts`, unchanged: the timebase
  imports signal now, and the module table says so.
- **Acceptance:** the SG weights match the published tables (and exact rational least squares
  off the centre), and reproduce polynomials up to the fit's order exactly, in value and the
  first two derivatives, ends included. CUSUM dates a noise-free step exactly, and matches its
  definition on 200 random series. The rolling statistics match the slow way on traces with
  300 g steps, near 0 and at 10 kg.
- **Next agents:** window functions return whole windows only: output k covers samples
  k … k + window − 1. SG ends are fitted, so they reproduce polynomials but are noisier than the
  interior. CUSUM with the spec's slack of 0.5σ dates changes early, and raises false alarms over
  long quiet scans (D-033 has the numbers): start the scan near the onset, and refine (T1.12).

### T1.11 — Stability, zero-tracking, shot windows

**Status:** done · **Depends:** T1.9, T1.10 · **Read:** spec "Schema rules" (baseline-relative
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

**Notes:** from T1.3, these are all script events or parameters. Use `type: 'command'` with
`tare()`, or `tare-button`; `demoScenario()` has a tare-button press in a tail. Script two
`shot`s with `cup-off` and `cup-on` between them. For an early lift, use
`espressoScenario({ cupOffAfterPumpOffMs: 1000 })`: the later drips land on the bare platform.
For quantised data, use `scale: { resolutionG: 0.1 }`. `truth.tares` lists every change of zero.

From T1.9: start from `buildTimeline(raw.frames)` (`src/core/timebase`). Its samples carry `t` in
seconds and the decoded `frame`; use `frame.weightG` only where `hasTrustedWeight(frame)`
(D-005, D-014). `t` never decreases, but a burst of arrival-timed frames can share one value, so
resampling must cope with equal times.

From T1.10 (`src/core/signal`, D-033): `resampleLinear` copes with equal times (it averages
them). `rollingRange` gives the stability test, `rollingVariance` σ, and `stepAcrossGap` and
`rollingStep` the steps; window functions return whole windows only, output k covering samples
k … k + window − 1. `median` and `mad` (× `MAD_TO_SIGMA`) give robust levels and noise.

**Completed 2026-10-04:**

- `src/core/analysis/`: `segment(timeline, events, params?)` gives a `Segmentation`: the
  trusted samples (refused frames counted), the quantisation step q read off the data, the
  stability tolerance and σ floor, the zero-tracked samples and their uniform grid (`series`),
  the steps (tares with their source, vessels placed and lifted, other), the stable stretches,
  and the shot windows with their baselines. Parameters, with the provisional ones marked, are
  in `params.ts`. D-034 has the design and the measurements, ARCHITECTURE "Segmentation" the
  shapes.
- **Deviations from the plan's wording, all in D-034:**
  - Steps are runs of jumps on the samples, not only changes between stable windows: a stray
    tare in the tail and a cup lifted before the tail settles happen while the weight moves.
  - A logged tare too small to jump is applied only when it stands out of the noise by 4
    standard errors: a manual start right after the auto-tare has nothing to take off. The
    button's tare is a single jump that lands on 0. There's no FF12 tare event (A7 unknown).
  - A baseline needs a stable stretch of a second or more: the pump's vibration fakes short
    stable fragments, whose levels are off by the noise.
  - σ is the samples' standard deviation, floored at q/√12: the MAD reads quantised data badly.
- **Acceptance**, simulated: a tare while idle, from the app or the button, zero-tracked within
  0.05 g. A stray button press 0.3–10 s into the tail: within 0.15 g, the baseline unchanged
  and the rise within 0.15 g of the same session without it. Two shots, with the cup changed
  and into the same cup. A cup lifted 1 s after pump_off: the window ends at the lift, honest
  yield within 0.1 g, and the late drips on the platform make no window. Quantised to 0.1 g:
  q 0.1, tolerance 0.1, every σ at least q/√12, and exactly that on the empty platform.
- **Next agents:**
  - Work inside `shotWindows[k]` on `series`, the zero-tracked weight on the grid, whose step
    is the nominal interval. Net weight is `series` less `baseline.levelG`. `cupRemoved` is
    the window's `cup_removed` step (null when something else ended it), and honest yield is
    `cupRemoved.levelBeforeG − baseline.levelG`.
  - `baseline.endT` falls near `pump_on` (1.9 s before to 0.35 s after) when the vibration
    shows, near `first_drip` without it: start scans there. `baseline.sigmaG` is the quiet σ.
  - Times are timeline seconds: true times plus the link's latency (15 ms and up).
  - Tests compare zero-tracking with the truth frame by frame (`segment.test.ts`,
    `zeroTrackingError`).

### T1.12 — Liquid markers and tail fit

**Status:** done · **Depends:** T1.11 · **Read:** spec "Markers", "Tail handling", "Flow and
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

- `first_drip`, statistically (the user's decision, D-035): at the default vibration, median
  error under 0.1 s, 90% within 0.25 s, none beyond 0.7 s, no bias; without vibration, every
  shot within 0.1 s. The plan first asked for every shot within 0.1 s, below the information
  limit at σ 0.1 g;
- τ within 10%;
- `w_final` within 0.3 g;
- sensible output when the cup is removed early.

Tests feed ground-truth `pump_off` until T1.13 exists.

**Notes:** from T1.3, two things make `first_drip` harder than it looks:
- The pump runs at `first_drip`, so the noise there is the vibration σ (0.1 g by default), not
  the quiet σ (0.015 g). Take σ from the pre-infusion window.
- The default profile ramps from zero over the first 8% of the extraction (about 1.8 s), so the
  mean rises quadratically. Measured in T1.3 over 20 seeds, a plain CUSUM (slack 0.5σ, alarm
  4.5σ, σ from pre-infusion) put the change point anywhere from 0.8 s early to 0.6 s late, with
  a median near 0. Meeting 0.1 s needs the rise fit, or more. If the target looks wrong rather
  than hard, raise it with the user.

Liquid lands in 0.05 g drops (`dropG`), the first at `first_drip`. With `dropG: 0`, yield is
exactly w(pump_off) + ẇ(pump_off)·τ.

From T1.10 (`src/core/signal`, D-033): `cusum` returns `alarmIndex` and `changeIndex`, indexes
into the array it scanned. Measured on white noise, the spec's slack of 0.5σ dates a 2σ step
with a median error of 0–1 samples but a tenth 4 or more samples off, mostly early, and scans over
long quiet stretches raise false alarms: start near the onset. `fitLine(x, y, weights)` fits the
rise and the tail; for ln(flow), weights of flow² kept τ within 5% where unweighted was 22% off.
`savitzkyGolay` with `derivative: 1` and `step` gives the flow in g/s.

From T1.11 (`src/core/analysis`, D-034): work in `segment(timeline, events).shotWindows[k]`, on
`series` (the zero-tracked weight on the grid) from `startIndex` to `endIndex`.
`baseline.levelG` is w(baseline) and `baseline.sigmaG` the quiet σ; for `first_drip` take σ from
the pre-infusion, after `baseline.endT`. `cup_removed` is the window's `cupRemoved` step, null
when something else ended the window (`end`: `cup-removed`, `next-shot`, `cup-placed`,
`recording-end`); honest yield is its `levelBeforeG` less the baseline. After an early lift the
drips land on the platform, outside the window. `riseG` is a diagnostic, not the yield.

**Completed 2026-10-04:**

- `src/core/analysis/` gains four modules:
  - `liquidMarkers(segmentation, window, { pumpOffT })` returns `firstDrip`, `pumpOff`
    (w(pump_off)), `tail` (τ, ẇ(pump_off), w_final, R², points), `settled` (measured or
    extrapolated, with the yield), `cupRemoved` (with the honest yield), `flags` and the
    `params` it ran with;
  - `windowLiquid` gives the window's liquid: less the baseline and other steps, NaN inside
    their transitions;
  - `findFirstDrip` and `fitOnset`;
  - `fitTail`.

  D-035 has the methods and measurements.
- Parameters are `LiquidParams` and `DEFAULT_LIQUID_PARAMS`, validated by
  `resolveLiquidParams`. Five carry `PROVISIONAL(U1.1: …)` markers. `cusum` has a `lastRun`
  option.
- **Segmentation change:** up to 2 lead-in samples now join a step's transition (D-035), so the
  level before a lift excludes a half-lifted sample.
- **Tests:** unit tests per module, plus `liquid-markers.test.ts` against simulator ground truth.
  Over 100 seeds it checks first_drip's statistical acceptance. It covers τ and w_final, early
  lifts at 1 s (tail declined) and 2 s (extrapolated), pump_off ±0.2 s, no pump_off, a
  recording cut before pump_off, two shots in one cup, a spoon, 0.1 g quantisation, and purity.
- pump_off still comes from the simulator's truth in the tests. T1.13 provides it.

### T1.13 — Pump markers (`pump_on` / `pump_off`)

**Status:** done · **Depends:** T1.11 · **Read:** spec "Markers", "Fallback if vibration does not
survive"; `docs/hardware-tests.md` A1, A2, A11; Q4; D-029

**Deliverables:**

Built ahead of hardware test A2 (D-029): implement both detectors, and choose per shot window
from what the data shows.

- **Variance detector:** compute the rolling variance of the *detrended* weight (the
  residual from the SG fit, or second differences: the mean moves during extraction, so raw
  variance would include the trend). Compare it against the quiet-baseline σ².
  - `pump_on`: variance steps up while the mean stays stationary. Requiring both rejects a bump,
    which moves mean and variance together.
  - `pump_off`: variance steps down.
  - Locate each onset retrospectively.
- **Always:** implement the regime-change fallback for `pump_off`: fit the exponential decay
  backwards from the end, then walk forward to where the data departs from it. Use it as a
  cross-check, or as the primary method when there's no vibration.
- **Choosing:**
  - Use the variance detector when the window's detrended variance steps clearly above its quiet
    floor. Otherwise use the fallback for `pump_off`.
  - Flag which detector ran.
  - Mark the "clearly above" threshold `PROVISIONAL(U1.1: A2)`.
- **Without vibration:** `pump_on` is `null` and flagged, and the metrics that need it are
  `null` too. Q4 decides later whether the manual-start press stands in for it.

**Acceptance:**

- With simulator vibration σ > 0, markers are within 0.2 s. For `pump_on` this is statistical
  (the user's decision, D-036). Over 100 seeds at the default vibration: median error under
  0.05 s, 85% within 0.2 s, none beyond 0.5 s, no bias. About one shot in ten can't make 0.2 s,
  however it is measured.
- With σ = 0, the fallback is used and flagged.
- The real-fixture check moves to T1.16.

**Notes:** the spec says to revise the segmentation section if A2 shows no vibration. The user
chose to build first and adjust afterwards (D-029), so T1.16 raises the revision with the user if
A2 comes back negative.

From T1.3: `vibrationSigmaG: 0` is the no-vibration case. A `pump` script event is a flush
(vibration and no liquid), and a `bump` moves mean and variance together.

From T1.10 (`src/core/signal`, D-033): the detrending residual is the values less their
`savitzkyGolay` smoothing. `rollingVariance` is the sample variance over whole windows, and
`cusum` with `direction: 'down'` finds the step down at `pump_off`. `fitLine` fits ln(flow) for
the fallback.

From T1.11 (D-034): `baseline.sigmaG` is the quiet σ (never below `sigmaFloorG`, q/√12). Where
the pump's vibration shows, `baseline.endT` falls near `pump_on` (simulated: 1.9 s before to
0.35 s after); without vibration it runs on to near `first_drip`, itself a hint. With
quantisation as coarse as the vibration, the baseline can run into the pre-infusion.

From T1.12 (D-035):
- **Inputs and outputs:** `liquidMarkers(segmentation, window, { pumpOffT })` takes pump_off as
  its input; pass what T1.13 finds. `windowLiquid` gives the liquid series, and `quadraticSG`
  with `derivative: 1` gives the flow.
- **A vibration hint:** `firstDrip.sigmaG` is the pre-infusion's noise. Next to
  `baseline.sigmaG`, the quiet σ, it already says whether the vibration shows.
- **The fallback:** `fitTail` can serve the regime-change `pump_off`. Fitting from the end
  backwards is new, though.
- **Tolerance:** the tail fit starts 0.2 s after pump_off, so a pump_off 0.2 s early or late
  still gives τ within 15%. That is the room T1.13's accuracy has.

**Completed 2026-10-04:**

- `src/core/analysis/` gains three modules, and `test-runs.ts` (simulated runs, for tests only):
  - `pumpMarkers(segmentation, window, { firstDrip })` returns `pumpOn`, `pumpOff` (with its
    `detector`, `variance` or `regime-change`), the `vibration` step, `varianceStep`,
    `regimeChange`, `flags` and `params`;
  - `fitKnee` is the regime-change model: a parabola, then an exponential drain;
  - `shotMarkers(segmentation, window)` runs first_drip, then the pump markers, then the liquid
    markers with the pump_off found.

  D-036 has the methods and measurements.
- Parameters are `PumpParams` and `DEFAULT_PUMP_PARAMS`, validated by `resolvePumpParams`. Six
  carry `PROVISIONAL(U1.1: …)` markers.
- **Acceptance** (D-036): at the default vibration, pump_off is within 0.2 s in every shot by the
  variance (worst 0.16 s), and pump_on meets the user's statistical target (median 0.034 s,
  worst 0.30 s). Without vibration, pump_on is null, flagged `no-vibration`, and the regime
  change times pump_off within 0.1 s (worst 0.064 s).
- **Also changed:**
  - first_drip is robust to knocks before the rise.
  - Segmentation steps take a lead-out of up to 2 samples, except runs that land on 0 (tares).
    Review found that a tare's correction could otherwise start a sample late.
- **Tests:** `pump-markers.test.ts` (acceptance over 100 seeds) and
  `pump-markers-scenarios.test.ts`. The scenarios cover knocks, a mean shift, a flush, early
  lifts, a recording cut short, other flows and drains, 0.1 g quantisation, arrival times only,
  stalls, two shots in one cup and a spoon. `knee.test.ts` covers the model.

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
  get a `post-hoc` shot, and unmatched shots are flagged. A discarded shot still claims its
  segment, so it isn't recreated (D-019). Make post-hoc shots with `createShot`, anchored at
  the segment's start.

**Acceptance:**

- End-to-end simulator tests produce metrics within tolerance of ground truth.
- Bumping the version invalidates the cache.
- `reanalyzeAll` is idempotent.

**Notes:** from T1.5, the derived store holds `{ recordingId, analysisVersion,
computedAtEpochMs, result }`, keyed by recording and version: `storage.derived.put`, `get` and
`clearAll`. `analysisVersion` must be an integer ≥ 0. `result` must be JSON (no typed arrays),
and T1.14 checks its shape when it reads one back. `storage.raw.read(id)` gives the raw input.

From T1.11 (D-034): `segment(buildTimeline(raw.frames), raw.events, params)` comes after the
timeline; stamp `segmentation.params` with the rest of the parameters. `ANALYSIS_VERSION`
doesn't exist yet: create it here, with the first stored result. A `refusedFrames` above 0
must become a visible flag (D-005, D-014). `samples` and `series` are working arrays: keep them
out of the cache. The segments to match with shots are the shot windows; their times are
timeline seconds, within the link's latency of the recorder's `tMs` (shot anchors are in ms).

From T1.12 (D-035), the metrics map onto `LiquidMarkers`:
- first-drip time: `firstDrip.t − pump_on`;
- extraction: `pump_off − firstDrip.t`;
- average flow: `pumpOff.weightG / extraction`;
- yield: `settled.weightG`;
- honest yield: `cupRemoved.weightG`;
- tail mass: `settled.weightG − pumpOff.weightG`;
- τ: `tail.tauS`.

Any of them can be null. Carry `flags` into the result (`no-pump-off`, a tail issue,
`other-steps`), and stamp `params` as well. The markers survive a JSON round trip unchanged,
which a test checks.

From T1.13 (D-036):
- **One call per window:** `shotMarkers(segmentation, window)` gives `{ pump, liquid }`, and
  `pump_on` is `pump.pumpOn?.t`. Pre-infusion is `liquid.firstDrip.t − pump_on` and total is
  `pump.pumpOff.t − pump_on`. Both are null without vibration, until Q4.
- **Quality flags:** `pump.flags` (`no-vibration`, `knock-at-pump-on`, `mean-moved`,
  `variance-step-unclear`, `no-pump-off`, `detectors-disagree`), `liquid.flags`, and
  `pump.pumpOff.detector`.
- **Stamping:** stamp `pump.params` with the others.
- **Tests:** `test-runs.ts` has `simulateRun`, `seeds`, `phasedPumpOnMs` and `absQuantile` for
  simulator ground-truth tests.

### T1.15 — Analysis inspection CLI

**Status:** todo · **Depends:** T1.7, T1.14

**Goal:** agents can't see the phone, so give them a way to look at real data.

**Deliverables:**

- `npm run analyze -- <export.json> [--out dir]` prints markers and metrics as JSON.
- It also writes an SVG per shot showing weight, derived flow, detrended variance, markers and
  annotations. Render to PNG with Playwright and the preinstalled Chromium if that is useful.

A simulated export: T1.7's serialiser applied to `toRawRecording(simulateSession(...))` (T1.3).

From T1.7: `parseExport(text).bundle` reads a file. Each `bundle.recordings[i]` is
`{ recording, frames, events }`, as the simulator's `RawSession`, and `bundle.shots` holds the
shots of every recording (group them by `recordingId`). Write a simulated export with
`serialiseExport({ exportedAtEpochMs, app, recordings: [toRawRecording(session)], shots: [],
settings: null })`. `src/core/export/test-samples.ts` has a richer bundle.

**Acceptance:** runs on a simulated export and on `fixtures/real/*` once they exist. Documented
in README and CLAUDE.md.

### T1.16 — Tune analysis on real fixtures

**Status:** blocked (U1.1) · **Depends:** T1.13, T1.15, T1.22, U1.1

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
- Bring the simulator in line with the data: its defaults (rate, noise, vibration σ, resolution,
  drop size, link timing) and its assumptions (D-021).
- **The D-029 adjustment pass:**
  - Revisit every value marked `PROVISIONAL(` (`grep -rn 'PROVISIONAL(' src`). That includes the
    live pipeline's thresholds if T1.17 is done.
  - The timebase (D-032): the scale's real sample period and drift (A1), and whether the
    sample period is a multiple of the connection interval. If the drift is tiny, raise
    `minFitSpanMs` or use one calibrated drift; check the arrival correction against real
    jitter; decide on a regular-grid fit for arrival-only stretches.
  - Settle T1.13's detector choice with A2. If there is no vibration, ask the user about the
    spec's segmentation revision and Q4.
  - Check T1.21's reconnect against B3.
  - Re-check first_drip against D-035's statistical acceptance with the real vibration (A2),
    drop size and flow shape (C3).
  - Re-check pump_on and pump_off against D-036 with the real vibration (A2). The thresholds
    that choose the detector (`vibrationRatio`, `vibrationEvidence`) and the regime change's
    (`regimeEvidence`, `maxDrainTauS`, `minTailS`) are provisional.
  - Close the `verify` tasks the hardware session confirmed.

If a spec assumption fails, ask the user before working around it.

From T1.11 (D-034), beyond its `PROVISIONAL` values: whether the pump's vibration shows above the
stability band, and the quantisation step (A2, A11: with q as coarse as the vibration, baselines
run into the pre-infusion); how fast a lifted cup leaves the reading, and whether the button's
tare takes one sample (C2, C4: the button's tare is told from a lift by that); whether a
physical tare sends anything (A7: it would replace that heuristic); and the command latency
behind `tareSearchS` (A5).

From U1.1 session 1 (D-037):

- **The weight comes in 0.1 g steps, and holds still at rest.** On the 0.01 g simulator, the
  user agreed statistical targets for first_drip and pump_on (D-035, D-036). At 0.1 g those
  detectors miss them by far: D-037 has the table. Re-measure them on the real shots, then
  re-agree the targets with the user (AskUserQuestion) before tuning to them.
- The stability tolerance already follows q: max(`stableRangeG`, `stableQuantisationSteps` × q)
  is 0.1 g, twice the spec's 0.05 g band.
- **If A2 shows no vibration in the weight:** the scale's own flow figure, in 0.01 g/s steps,
  moves at rest (σ 0.018 g/s), so the firmware sees finer than it reports. Check whether the
  pump shows there. Using that figure would go against the spec ("recorded, never used"), so
  ask the user first. Q4 is the other way out.
- **Arrivals sit on a regular 100.70 ms grid**, within −22 to +119 ms outside stalls, with no
  frame lost. That settles the regular-grid fit for arrival-timed stretches: build it. Stalls
  (a microphone opening) deliver late frames in bursts.
- **The scale can ignore `04`, `07` and tare.** A command's effect must be read off the frames,
  never assumed from the log. The segmentation already treats a logged tare as one only when the
  weight shows it.

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

**Notes:** from T1.3, stream from `ScaleSimulator`: `advanceTo()` for frames, and `write()` for
the `07` the pipeline asks for. `espressoScenario({ tareAndStartMs: null })` leaves the tare to
the code under test.

From T1.6: in the app, the pipeline's input is `recorder.onFrame`, which gives each frame with
its decoding and `frame.tMs` on the recording's timeline. Send the `07` it asks for through
`recorder.sendCommand(tareAndStartTimer(), 'auto-tare')`, so it is logged.

From T1.8: `src/core/live` already holds the probe's display statistics (`window-stats.ts`,
`probe-monitor.ts`). Put the shot pipeline beside them. `TimeWindow` gives a time window's
values, and `ScaleLinks` (`src/app/links.ts`) shows how a per-link consumer subscribes to the
recorder.

From U1.1 session 1 (D-037): the scale sometimes ignores `07`, `04` and tare. When the timer
was running on its own, tares did nothing; for a while after that, `04` and `07` did nothing.
After asking for `07`, read the next frames: a weight that didn't go to 0 means no tare. Keep
the display's own offset then, rather than assume the scale zeroed. A tare shows within 0.2 s of
the write's acknowledgement. The weight comes in 0.1 g steps, a sample every 100.7 ms.

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
- Status becomes `verify` for the user on the phone.

**Notes:** from T1.6, the manual start logs both halves (spec "Manual start"):
`recorder.logUiAction('manual-start')`, then `recorder.sendCommand(tareAndStartTimer(),
'manual-start')`. Anchor the shot on the recording's timeline (`tMs`).

From T1.8:

- `src/ui/App.tsx` starts the services (`startApp`) and shows the probe for every hash
  (`src/ui/route.ts`). Make `#/` the capture flow and keep `#/probe`.
- `services.links.get({ kind: 'web-bluetooth' })` gives the transport and its recorder. Never
  make a second recorder (D-024).
- The wake lock already follows the links. Call `services.wakeLock.acquire()` in the connect
  tap, right after `transport.connect()`, as the probe does: Safari needs the tap.
- `useLiveUpdates` (`src/ui/use-live-updates.ts`) throttles redraws to the recorder's
  per-frame changes.
- Extend `scripts/e2e-probe.mjs`, or add a script beside it, for the Playwright smoke test.

From T1.20: put `BackupReminder` (`src/ui/AutoExportPanel.tsx`) at the top of the capture
screen too, as the probe has it (D-031). Call `services.autoExport.shotsChanged()` whenever the
flow creates or edits a shot.
It re-uploads the recording's file 10 s after the last change, once the recording has ended
(D-030). Last-used values go in `kv` (they travel with a full export); anything that must stay
on this device goes in `storage.local`. `scripts/e2e-lib.mjs` has the e2e helpers.

### T1.19 — History and two-shot overlay chart

**Status:** todo · **Depends:** T1.14, T1.18 · **Read:** spec "Phase 1 — MVP" (7)

**Deliverables:**

- `#/history`: a list showing date, direction, first-drip time, yield, ratio and tags.
- Shot detail with a chart.
- Pick two shots to overlay weight and flow against time, aligned at `pump_on` or `first_drip`
  (a toggle).

Hand-rolled SVG is fine for now. A chart library can come with T3.3 (and if one is over about
20 kB gzipped, ask the user first).

Hide discarded shots. If history offers deleting a shot, set `discardedAtEpochMs` with
`updateShot` rather than removing the record, or re-analysis brings it back (D-019).

**Acceptance:** renders simulated shots, and the overlay alignment is correct.

### T1.20 — Automatic export to a private GitHub repo

**Status:** verify (U1.2) · **Depends:** T1.6, T1.7 · **Read:** spec "Storage and export";
D-025, D-026, D-027, D-030; `docs/export-format.md`

**Goal:** back up every finished recording off the phone with zero taps, into a private GitHub
repo the user owns, **when the user has configured one** (D-027). Without a configuration
nothing changes: no uploads, no nagging, manual export as before.

The user has approved the destination and the credential (D-027), so don't ask about them again.

**Deliverables:**

- **A destination interface** in `src/app/`, for example `BackupSink` with `check()` and
  `upload(path, text)`, plus a GitHub implementation. Because D-027 says "for now", a later
  destination (iCloud via CloudKit, or the share sheet) must be addable without touching the
  queue.
- **The GitHub sink.** It uses the REST contents API: `PUT /repos/{owner}/{repo}/contents/{path}`
  with base64 content, the branch, and the current file's `sha` when updating. `api.github.com`
  allows CORS from the Pages origin.
  - Before the first upload, and whenever the settings change, it calls
    `GET /repos/{owner}/{repo}` and refuses unless `private` is true. A public repo would
    publish the recordings.
  - It uploads one file at a time, because two commits racing on one branch get a 409.
- **What gets uploaded, and when** (D-026):
  - Closed recordings only. Upload one when it ends, and at startup upload any closed recording
    not yet uploaded. That covers recordings ended by unclean recovery, and imported ones.
  - One file per recording with its shots, made by T1.7's `exportRecording` in the unchanged
    format.
  - A stable path per recording, so a re-upload overwrites the same file. For example
    `recordings/YYYY/MM/<recordingExportFileName>`.
  - Re-upload a recording, debounced, when its shots change after it has ended (a grade added
    later, for example).
- **A ledger and a retry queue** in device-local storage.
  - Per recording the ledger keeps the path, the blob `sha` and a hash of the last uploaded
    text, so an unchanged file is skipped.
  - When the ledger has no entry but the path already exists (a new device, or storage that was
    wiped), compare the two files before writing. Never replace a file with one that holds fewer
    records, and never delete anything in the repo.
  - Retry with backoff on network errors, 5xx and rate limits, both at the next app open and on
    the `online` event.
  - A 401, 403 or 404 stops the queue and shows "check the settings" rather than looping.
- **Settings** (rudimentary): owner, repo, branch (default: the repo's default branch), path
  prefix (default `recordings/`) and the token. A Test button runs the check above. The token
  field is write-only: once saved it shows as set, with Replace and Remove.
- **Status** on the home or probe page: off (not configured), the last export time, the number
  pending, and the last error.

**Acceptance:**

- Unit tests with a fake `fetch`:
  - a recording uploads once when it ends, and an open recording is never uploaded;
  - a changed recording updates in place with the right `sha`, and an unchanged one is skipped;
  - failures retry, and auth errors stop with a clear message;
  - a public repo is refused;
  - with no configuration, nothing calls the network.
- The token never appears in exports (`exportAll` leaves device-local keys out), events, logs
  or error text, and a test proves it.
- A Playwright check of the settings and status UI against a stubbed API.
- Status `verify` until the user has configured it on the phone (U1.2) and a recording appears
  in the data repo.

**Notes:**

- **Credentials:**
  - The user enters them on the device and they stay in device-local storage.
  - Never commit them, and never build them into the bundle: the Pages site is public, so a
    build-time token would be published.
  - If Safari deletes the app's storage, the token goes with it. The recordings are already in
    the repo, and the user enters the token again.
- **File size:** a 3-minute recording is about 145 KB, and a long idle session is a few MB.
  Check the contents API's size limits. If they bite, switch the sink to the Git data API (blob,
  tree, commit).
- **Entities:** they arrive with format version 2 (T2.1) and need backing up too. Leave room for
  a metadata file in the sink.
- **From T1.7:**
  - `exportRecording(storage, id, { app })` makes one recording's file with its shots.
  - `importBundle` is idempotent, so restoring from the repo is just importing its files.
  - Keep device-local state (the token, the ledger) out of what `exportAll` writes as settings.
    Today that is every `kv` entry (D-025).
- **iCloud:** Safari's Download saves to Files › Downloads, which is in iCloud Drive by default
  (Settings › Apps › Safari › Downloads). So the manual Download stays the user's own iCloud
  copy. B7 records the actual location.
- **From T1.8:**
  - `startApp` (`src/app/startup.ts`) is where startup work goes. `services.recovery.ended`
    lists the recordings recovery ended as `unclean`, and they need uploading too.
  - `ScaleLinks.onRecordingsChanged` fires once an ended recording is stored and ended, which
    is when to queue its upload. `recorder.whenIdle()` resolves at the same point.
  - The probe page holds the recordings panel, so the auto-export status and settings can go
    beside it.
  - `npm run e2e` (`scripts/e2e-probe.mjs`) shows how to drive the build with Playwright. Stub
    `api.github.com` with `page.route()`.

**Completed 2026-10-04** (verify: U1.2 on the phone):

- `src/app/auto-export/`: `AutoExport` (the queue), `BackupSink` and `BackupError` (the narrow
  destination interface), `GitHubSink` (REST contents API), the ledger, settings and
  `compareWithRemote`. `startApp` starts it and passes `ScaleLinks.onRecordingsChanged` on;
  `services.autoExport` is in `AppServices`. D-030 has the design.
- **Device-local store:** `storage.local` (IndexedDB version 2, a new `local` store), never
  exported or imported. It holds `autoExport.settings` (with the token) and
  `autoExport.ledger.<recordingId>`.
- **Uploads:** closed recordings, not the simulator's, at `<prefix>YYYY/MM/<file name>`, one
  commit each, at least a second apart. At startup, when one ends, after an import, and 10 s
  after `shotsChanged()` (T1.18 must call it). A file the ledger doesn't know is created
  without a `sha`; GitHub refuses that if a file is there, and only then is it read and
  compared: equal → adopted, fewer records here → kept and the recording "held", otherwise
  replaced with its `sha`. Nothing is deleted.
- **Failures:** network, 5xx and rate limits wait 1, 2, 5, 15, then 30 minutes (a rate limit's
  own wait first), and retry at once on `online` or when the page is shown. 401, 403, 404 and a
  public repo stop, saying to check the settings, until Save or Retry; the next app start tries
  once more. GitHub's CORS preflight refuses `X-GitHub-Api-Version`, so the app doesn't send it.
- **UI:** an "Automatic export" panel on the probe, under the recordings: status, held
  recordings, Retry now, and the settings (owner, repo, branch, folder, write-only token with
  Replace and Remove, Save, Test). At the user's request (D-031), a reminder at the top of the
  page (`BackupReminder`) says while it is off or stopped that recordings aren't backed up, with
  a button to the settings.
- **Tests:** `FakeGitHub` (`fake-github.ts`) is an in-memory `fetch` that enforces the token,
  the `sha` rules and the CORS-allowed headers. The acceptance cases are in
  `auto-export.test.ts`, including the token test (exports, files, status, logs, requests).
  `npm run e2e` now also runs `scripts/e2e-auto-export.mjs` (24 checks against a stubbed
  `api.github.com`); the helpers moved to `scripts/e2e-lib.mjs`.
- **Next agent:** the status is computed, not stored; the last export time is the newest
  ledger entry. The exported format is unchanged. Hardware test B10 checks it on the phone.

### U1.2 — USER: set up automatic export

**Status:** user, later (D-031): the probe shows a reminder until it is done · **Depends:** T1.20

1. On GitHub, create a **private** repo for the data, for example `smart-scale-data`. It can
   be empty.
2. Create a fine-grained personal access token: Settings → Developer settings → Personal access
   tokens → Fine-grained tokens → Generate new token.
   - Repository access: **Only select repositories**, then pick the data repo.
   - Permissions: **Contents: Read and write**. Metadata: Read is added automatically.
   - Pick an expiry. When it runs out, the app stops and says the token was refused.
3. In the app on the phone (the probe page), scroll to **Automatic export**, open **Settings**,
   enter the owner (your GitHub user name), the repo and the token. Leave Branch empty and
   Folder as `recordings/` unless you want otherwise. Tap **Test**: it should say "It works".
   Then tap **Save**.
4. Connect to the real scale (simulator recordings aren't uploaded), record something short,
   disconnect, and check that a file appears in the data repo under `recordings/YYYY/MM/`. The
   status line says when the last export happened.
5. Recordings already on the phone are uploaded too, oldest first, one commit each.

Good to know:

- The token stays on the phone and is never shown again: Replace and Remove are the only
  options. If Safari deletes the app's storage, enter it again; the recordings are already in
  the repo.
- Every site at `https://misch0n.github.io/` shares the phone's storage for that address. If
  you publish other GitHub Pages sites from this account, their scripts could read the token.
  It can only reach the data repo.

To let an agent read the recordings (for example as fixtures for T1.16), add the data repo to
its session.

### T1.21 — Reconnect without re-pairing

**Status:** todo · **Depends:** T1.4 · **Read:** spec "Re-pairing — check early"; D-029

Built ahead of hardware test B3 (D-029). B1 found `getDevices()` in both runtimes, so build the
optimistic path:

- Remember the scale, and reconnect with one tap, or automatically on load if that's permitted.
- Keep the chooser as the fallback whenever reconnecting fails.
- End as `verify` (B3).
- **If B3 shows it doesn't work:** T1.16 or the next agent documents the friction and asks the
  user whether to move the Capacitor wrapper (T3.4) up the order.

From T1.4: `reconnectKnownDevice()` looks for the last device id of this page session, then the
first device whose name starts `BOOKOO`. To survive a reload, persist `ConnectionInfo.device.id`
and add a way to pass it in. It has no timeout: in the CoreBluetooth-based shims it may wait
until the scale is switched on, and `disconnect()` cancels it.

From T1.7: if the device id goes into `kv`, leave it out of the full export, which writes every
`kv` entry as settings (D-025). Device ids are per origin and mean nothing on another phone.

From T1.20: put it in `storage.local` instead, the device-local store that no export or import
touches (D-030).

From T1.8: the probe's Reconnect known device button calls `reconnectKnownDevice` and shows its
error. Its result in B3 decides which branch above applies.

### T1.22 — Simulator to the first hardware answers

**Status:** todo · **Depends:** T1.3, U1.1 (session 1) · **Read:** D-037, D-021,
`docs/hardware-tests.md` "Session 1", `fixtures/real/README.md`, `docs/ARCHITECTURE.md`
"Simulator"

D-021 asks for the simulator to follow each hardware answer as it comes in. Session 1 answered
enough to replace most of its guesses (D-037).

**Deliverables:**

- New `src/core/sim` defaults:
  - weights in 0.1 g steps (the frame still carries hundredths);
  - noise at rest small enough that a reading holds still, as the real one does: not one change
    in 92 s;
  - a sample every 100.7 ms, with the scale's clock 0.7% slow;
  - the timer in 100 ms ticks, one per sample, reading 100 ms in its first frame after a start;
  - a link whose connection interval is about 30 ms. Arrival gaps come in 91, 121 and 152 ms,
    and frames are late on the timer's line by a median of 16 ms (p95 33 ms);
  - command reactions:
    - `05` freezes the timer;
    - `06` zeroes only a stopped timer;
    - `04` doesn't resume a frozen one.

    Add a way to script a scale that ignores `04`, `07` or tare (D-037), off by default.
- D-021 and ARCHITECTURE "Simulator" updated. Each assumption either cites its answer or is
  marked as still open.
- A test that compares an idle simulated session with the real fixture: the quantum, the
  sample period, the timer's step, the drift's sign and size, and the still reading.
- The tests built on the old defaults:
  - Each acceptance stays at the resolution it was agreed at. The D-035 and D-036 targets were
    agreed on the 0.01 g simulator, so those tests pin 0.01 g; the user re-agrees them in T1.16
    with the real vibration (A2).
  - Other tests take the new defaults where they can.
  - Re-measure first_drip, the pump markers, τ and the yield at 0.1 g, and update D-037's table
    with the result. That is T1.16's starting point.

**Acceptance:**

- `npm run check` passes on the new defaults.
- The comparison test passes.
- D-021 lists no assumption that session 1 contradicts.

**Notes:**

- The timebase needs no change for the real timer (D-037). Its acceptance ("within 5 ms despite
  ±50 ms of jitter") was measured with a 1 ms timer, so re-measure it with ticks and report the
  result.
- The analysis has no `ANALYSIS_VERSION` yet (T1.14 creates it), so there is nothing to bump.

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

Define the entities with `field` and `ObjectSchema` from `src/core/model/schema.ts`, and add
their samples to `completeness.test.ts`. `Grinder.settingKind` should match the shots'
`GrindSetting.kind` (D-019).

From T1.5: add the stores with a new migration at the end of `MIGRATIONS` in
`src/storage/db.ts`. Never edit an existing migration (version 2, T1.20, added `local`).
`db.test.ts` shows how to test an upgrade with data already stored.

From T1.7: entities in the export are format version 2. Add a migration to `EXPORT_MIGRATIONS`
in `src/core/export/format.ts` (version 1 files gain empty entity lists), extend
`src/core/export/document.ts` and `importBundle` (merge entities like shots: added, kept or
replaced), update `docs/export-format.md` and its version history, and test that a version 1
file still imports.

From T1.20: automatic export uploads recordings with their shots. Entities need a backup too, so
add them to the GitHub sink, for example as a metadata file, under the same rules (D-027).
`AutoExport` (`src/app/auto-export/auto-export.ts`) uploads recordings only: give it a second
kind of item (say `metadata/entities.json`), with its own ledger key in `storage.local` and a
digest of the entities, and keep the rules of D-030: create without a version, compare on a
conflict, never replace a file with one holding fewer records, never delete.

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

Shot fields are already all nullable and normalised (D-018, D-019). For `tags`, `null` means
hidden and `[]` means none.

### T3.1 — Audio pump detection

**Status:** todo · **Depends:** U1.1 (B8) · **Read:** spec "Audio viability, if pursued"

1. Check feasibility in the chosen runtime (D-016): `getUserMedia` needs HTTPS and a gesture.
   beacio runs only in a Safari tab (B9), and the spec says Safari re-prompts every session for
   sites that aren't installed, so expect a permission tap per session (B8 confirms). Bluefy's
   behaviour is unknown.
2. If it's viable, an FFT detector that tells the 50 Hz pump tone and its harmonics apart from a
   broadband grinder and from silence. It drives `pump_on` and `pump_off`, and phases.

Ask the user how audio should be recorded: raw audio is heavy, so per-band energies stored as
another raw stream may be enough.

From U1.1 session 1 (D-037): in Safari with beacio, every `getUserMedia` call held the scale's
notifications back for 0.5–0.7 s. They then arrived together, none lost. So open the microphone
once, before the shot, and keep it open. Each of the seven tries was `granted`. Whether a prompt
appeared each time wasn't noted (B8).

### T3.2 — Keep-alive via `0x25`

**Status:** blocked (U1.1: A6) · **Depends:** T1.6

If the Mini honours `25`, send it periodically while connected, well before the auto-off
deadline. Send it with `recorder.sendCommand(keepAlive(), 'keep-alive')` (T1.6), so each one is
logged.

From U1.1 session 1 (D-037): the standby bytes hold the auto-off setting (15.0 min) and don't
count down, so A6 now watches whether the scale switches off while connected
(`docs/hardware-tests.md`).

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
- 2026-10-03 · T1.1 · Protocol codec in `src/core/protocol/`: UUIDs, checksum, command
  whitelist with a runtime check, frame decoder and weight-frame encoder, hex, failure counter.
- 2026-10-03 · U0.1 · Pages live; Bluefy and beacio both expose all eight APIs the app checks
  for (B1); the user prefers beacio (D-016), which works only in a Safari tab, not from a
  home-screen icon (B9). M0 is complete.
- 2026-10-03 · T1.2 · Core data model in `src/core/model/`: UUIDv7 ids, runtime schemas and
  normalisers, `Recording`, `RawFrame`, `AppEvent`, `Shot`, and one `seq` shared by frames and
  events.
- 2026-10-03 · T1.3 · `ScaleTransport` contract, shared command queue and `MockTransport` in
  `src/transport/`; deterministic scale and BLE simulator with ground truth in `src/core/sim/`.
- 2026-10-03 · T1.4 · `WebBluetoothTransport` (verify: B2 on the phone), with
  `reconnectKnownDevice` via `getDevices()`, tested against a fake `navigator.bluetooth`; status
  listeners see statuses in order.
- 2026-10-03 · T1.5 · IndexedDB storage in `src/storage/`: add-only raw (one chunk per append,
  a seq check), recordings, shots, derived and kv repositories, the `RecordingWriter` batcher,
  a connection that reopens itself, and `requestPersistence()`.
- 2026-10-03 · T1.6 · Recorder service in `src/app/`: every notification stored from connect
  to disconnect, app events on the same timeline, the smoothing check with one retry, live
  stats and warnings, and unclean recovery guarded by Web Locks.
- 2026-10-04 · T1.7 · Export format v1 (`docs/export-format.md`) in `src/core/export/`, export
  and idempotent import in `src/app/export.ts`, whole-recording import in one transaction, and
  an export and import panel on the home page (download, share sheet).
- 2026-10-04 · T1.8 · Probe screen on `#/probe` (verify: U1.1): startup wiring with persistence
  and unclean recovery, one transport and recorder per kind, live diagnostics, commands,
  annotations, the microphone, the wake lock, and export; `npm run e2e` drives it with the
  mock.
- 2026-10-04 · T1.20 · Automatic export to a private GitHub repo when set up on the phone
  (verify: U1.2): a queue with a ledger in a new device-local store, a narrow sink with a
  GitHub implementation, compare before replacing, retries and stops, and a settings and
  status panel on the probe.
- 2026-10-04 · T1.20 · The user sets up automatic export later (U1.2, D-031); until it runs, a
  reminder at the top of the probe says the recordings aren't backed up.
- 2026-10-04 · T1.9 · Timebase in `src/core/timebase/`: device runs mapped onto the arrival
  clock with one robust least-squares rate per recording and each run's least offset, arrival
  time elsewhere, simulator ground-truth tests (D-032).
- 2026-10-04 · T1.10 · Signal toolkit in `src/core/signal/`: resampling, Savitzky–Golay by least
  squares with fitted ends, O(n) rolling statistics, CUSUM with a retrospective change point,
  weighted line fits, robust statistics and step helpers (D-033).
- 2026-10-04 · T1.11 · Segmentation in `src/core/analysis/`: steps on the samples (tares from
  the log or a single jump to 0, vessels, other), zero-tracking, stable stretches on the backed
  grid with a q/√12 floor on σ, and shot windows with baselines from a stable second;
  simulator ground-truth tests (D-034).
- 2026-10-04 · T1.12 · Liquid markers in `src/core/analysis/`: first_drip (CUSUM, then a
  millisecond rise fit), w(pump_off), the tail fit (τ, w_final), settled (measured or
  extrapolated) and cup_removed with the honest yield, given pump_off; the user chose a
  statistical first_drip acceptance (D-035).
- 2026-10-04 · T1.13 · Pump markers in `src/core/analysis/`: pump_on from a split of the
  pre-drip noise (vibration shown, mean stationary, knocks out), pump_off from a knee fit (the
  variance step when the vibration shows, else the regime change, flagged), and `shotMarkers`
  for all markers of a window. The user chose a statistical pump_on acceptance (D-036).
- 2026-10-04 · U1.1 · Hardware session 1 recorded, without a shot. Weights come in 0.1 g steps
  and hold still at rest. Samples come at 9.93 Hz; the timer counts 100 ms ticks on a clock 0.7%
  slow, and the scale sometimes ignores timer and tare commands. The weight is net, and FF12
  sends `03 0D` events. The recording is the first real fixture, with tests. T1.4 done, T1.22
  added (D-037).
