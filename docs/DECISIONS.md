# Decision log

Every decision a future agent would otherwise have to rediscover or re-litigate: the user's
answers, deviations from or clarifications of the spec, and non-obvious technical choices.

Format: `D-### — title` · date · status (`accepted (user)` = the user decided; `accepted` = agent
decided, within the spec; `proposed` = a later task confirms or refines it; `superseded by D-###`).
Append new entries; don't rewrite old ones. Supersede them instead.

---

## D-001 — UI stack: Preact 10 + TypeScript 6.0 + Vite 8

2026-10-03 · accepted (user)

- The user chose Preact + TS (over React, Svelte and vanilla). Core logic is framework-free
  TypeScript either way. Preact is only the thin UI layer, polished later.
- **Preact is pinned to 10.x on purpose.** Preact 11.0.0 shipped on 2026-09-30, but
  `@preact/preset-vite` 2.10.6 still depends on `@prefresh/vite` ^2.4, which predates 11.
  Upgrade once the preset moves to prefresh 4 (T3.5 or earlier).
- **TypeScript is pinned to ~6.0 on purpose.** TS 7.0 (the native port) is `latest` on npm,
  but typescript-eslint 8.x supports `typescript <6.1.0`. Typed lint rules such as
  `no-floating-promises` matter for async BLE code, so we keep the linter working.

## D-002 — Work directly on `main`, one task per agent session

2026-10-03 · accepted (user)

Each task is committed and pushed to `main` together with its plan update, so the next agent
(after a context clear) sees current state without merging anything. Every push to `main`
redeploys GitHub Pages. Protocol: `CLAUDE.md`.

## D-003 — Automatic export destination deferred

2026-10-03 · accepted (user) · superseded by D-027

The user chose to decide later (Q1). The export *format*, manual export and import go ahead
(T1.7). Automatic export (T1.20) is blocked on Q1, and the agent there asks again. Options put to
the user: commit JSON to a private GitHub repo via a fine-grained token (zero taps), or the iOS
share sheet after each session (one tap).

## D-004 — The raw layer stores verbatim notification bytes

2026-10-03 · accepted

- Each notification is stored as received: bytes, arrival time, source characteristic (FF11 or
  FF12) and a per-recording sequence number shared with app events. That includes frames with
  bad checksums, the wrong length or unknown headers.
- Parsed fields (weight, flow, battery, …) are *derived* by the decoder, and the decoder is
  cheap: 20 bytes per frame, about 10–20 Hz.
- Why: the spec says "record every packet … derive everything afterwards" and "re-run detection
  across the entire history". Several byte meanings are still unverified (sign and unit bytes,
  `03 0D` frames; see protocol-notes). With bytes as the source of truth, a decoder fix applies
  retroactively. Corruption rate also stays measurable.
- Spec parsing rule 1 ("discard failures silently") applies when *decoding* for analysis and
  the live display, not when recording.

## D-005 — Unknown unit byte: refuse to interpret, never stop recording

2026-10-03 · accepted

The decoder never throws. It reports `unitOk: false` when byte index 5 is not in
`GRAM_UNIT_BYTES`. The live display and analysis refuse such frames loudly (a visible error),
and the recorder keeps storing them. `GRAM_UNIT_BYTES` starts as `[0x01]` (the Ultra doc value)
until hardware test A9 confirms the Mini's value. This keeps the spec's "refuse loudly rather
than silently misinterpreting ounces" without letting a wrong guess about the byte lose data.

## D-006 — Timebase: device ms only where it advances

2026-10-03 · accepted · refined by D-032 (a fitted rate, which frames count as advancing)

Spec rule 3 says to use the packet's ms field "wherever it is non-zero". That field is the
scale's stopwatch: it is zero until started and can sit **frozen at a non-zero value** after a
stop. So:

- Use device ms only on runs of frames where it strictly increases.
- Map each run onto the arrival clock using that run's minimum `arrival − device` offset (the
  least-delayed packet).
- Use arrival time everywhere else, and flag each sample's time source.
- Always record arrival time (rule 4).

T1.9 implements this. T1.16 checks it against real data.

## D-007 — A shot is a metadata entity anchored in a recording

2026-10-03 · accepted (T1.2 confirmed it and D-019 refines it; T1.14 implements the matching)

- A **recording** is one connect-to-disconnect capture (raw). A **shot** is a user-owned
  metadata entity: grades, tags, dose and entity references, plus `recordingId` and an anchor
  time on that recording's timeline.
- Segmentation results are derived and disposable. They are matched to shots by anchor time.
  Re-running analysis with a new version never deletes or moves user metadata. A shot that no
  longer matches a segment is flagged, never dropped. A new segment with no shot gets one created
  (source `post-hoc`).
- Why: derived data is re-run across all history, and grades must survive that.

## D-008 — The command whitelist is the only way to talk to the scale

2026-10-03 · accepted

`src/core/protocol` exports named commands only:

- tare, buzzer level, auto-off, start/stop/reset timer, tare-and-start, flow smoothing off;
- keep-alive `0x25`, marked unverified.

There is no generic "encode sub-command N" function. Calibration (`0x09`) and shutdown (`0x15`)
are unrepresentable, and a test enumerates the whitelist to prove it. The Ultra-only `0x0B` and
`0x0D` stay out until verified on the Mini and approved by the user. Smoothing *on* is not
exposed either: its payload byte position has moved between doc revisions, and the spec wants
smoothing off.

## D-009 — Relative asset base and hash routing

2026-10-03 · accepted

`vite.config.ts` uses `base: './'` and the UI routes on the URL hash (`#/probe`, `#/history`).
The same build works under the GitHub Pages project path (`/smart-scale/`), on a custom domain,
from `vite preview`, and inside a future Capacitor shell, with no `404.html` SPA workaround.

## D-010 — ESLint enforces the architecture boundaries

2026-10-03 · accepted

- `src/core/**` may not import Preact or the outer layers (transport, storage, app, ui,
  platform), and may not use DOM globals.
- `src/core/analysis/**` may not import `src/core/live/**`. This is the spec's "the live filter
  must never reach stored analysis".
- `navigator.bluetooth` may be used only in `src/transport/**`.

Why: agents start with cleared context, so the linter remembers the spec's structural rules for
them. Configured in `eslint.config.js`.

## D-011 — Prettier formats code, not Markdown

2026-10-03 · accepted

Prettier is configured for TS, JS, JSON, CSS, HTML and YAML. `*.md` is ignored for two reasons:
re-aligned tables in `docs/PLAN.md` would turn every status change into a noisy diff, and
`docs/spec.md` must stay byte-identical to what the user supplied.

## D-012 — The in-app probe is the first deployable

2026-10-03 · accepted

T1.8 builds a diagnostics screen that runs in Bluefy. It connects, shows and records every
frame, sends whitelisted commands, takes annotations and exports recordings. It answers the
spec's Phase 0 questions in the real runtime, plus the runtime questions nRF Connect can't
answer (re-pairing, backgrounding, storage). Its recordings become the analysis fixtures. Doing
Phase 0 with nRF Connect or LightBlue remains valid for Part A of `docs/hardware-tests.md`.

## D-013 — Build against a simulator until real data exists

2026-10-03 · accepted · its gating of T1.13 superseded by D-029

Analysis and live logic are developed against a deterministic shot simulator with ground truth
(T1.3). Their parameters are marked provisional until T1.16 tunes them on real fixtures.
Pump-marker detection (T1.13) waits for hardware test A2, because the spec says: "If vibration
does not survive into the weight signal, revise the segmentation section before any of it is
implemented."

## D-014 — Unrecognised sign byte: keep the magnitude, flag it, refuse downstream

2026-10-03 · accepted

- The decoder maps sign byte `0x2B` to + and `0x2D` to − (protocol-notes, finding 3). Any other
  value gives `weightSignKnown: false` (likewise `flowSignKnown`, `resultSignKnown`,
  `powderSignKnown`), and the value is the unsigned magnitude.
- `hasTrustedWeight(frame)` is `unitOk && weightSignKnown`. Live and analysis code use it and
  refuse other frames loudly, exactly as for the unit byte (D-005). The flow sign doesn't count,
  because the app never uses the scale's own flow figure.
- Why: same reasoning as D-005. A wrong guess must not silently flip negative weights, recording
  never stops, and the raw bytes let a fix after hardware test A10 apply retroactively. Making
  `weightG` null instead was considered and rejected: unit and sign would then be refused in two
  different ways, and a single predicate covering both is harder to get wrong.

## D-015 — Commands are branded values, rebuilt and compared before every write

2026-10-03 · accepted

- `ScaleCommand` has a compile-time brand, so only `src/core/protocol/commands.ts` can create
  one, and `transport.send(cmd)` can't be handed an object literal with arbitrary bytes.
- Every constructor call returns a new `Uint8Array`. Shared constants would be mutable (typed
  arrays with elements can't be frozen), so one stray write could turn tare into calibration
  for every later caller.
- `isWhitelistedCommand(value)` rebuilds the command from its name and parameter and compares
  the bytes. Transports (mock in T1.3, Web Bluetooth in T1.4) call it right before each write
  and refuse anything it rejects. This is the runtime half of CLAUDE.md hard rule 5.
- `commands.test.ts` pins the module's export list, so adding a generic sub-command encoder fails
  a test that points back to D-008.

## D-016 — iOS runtime: beacio preferred, Bluefy as the fallback

2026-10-03 · accepted (user)

- The spec lists three iOS runtimes and says "Target Bluefy for development". On 2026-10-03 the
  user opened the capability table (hardware test B1) in both Bluefy and beacio, the Safari web
  extension, and both showed the same eight APIs. The user would rather use beacio if it works.
- Part B of `docs/hardware-tests.md` runs in beacio first. A test that fails there is repeated
  in Bluefy, to see whether falling back would help. B9 checks beacio from a home-screen icon,
  because the spec's storage-eviction and microphone re-prompt concerns are about non-installed
  sites.
- No code depends on the choice. Both runtimes inject `navigator.bluetooth`, and the transport
  stays runtime-agnostic. Add a runtime-specific workaround only when a hardware test shows it's
  needed, and record it here.
- Recordings store the user agent, so fixtures say which runtime captured them. Notification
  timing and batching may differ between the two (T1.2).
- `docs/spec.md` is unchanged. This entry overrides its "Target Bluefy for development".
- Revisit if beacio fails B2 (connect), B3 (reconnect without the chooser) or B4 (screen lock
  and background). The options then are Bluefy, or the Capacitor wrapper (T3.4) under the spec's
  "Re-pairing — check early" rule.
- **Update 2026-10-03, B9:** beacio isn't available when the app is opened from a home-screen
  icon. It works only in a Safari tab, which contradicts the spec's "home-screen icon" for
  beacio. The preference above still stands, with these consequences:
  - The app is a Safari site that isn't installed. The spec warns that Safari can then evict its
    IndexedDB and re-ask for the microphone every session.
  - WebKit's tracking prevention is documented to delete all of a site's script-writable storage
    (IndexedDB included) after 7 days of Safari use without the user interacting with the site.
    Home-screen web apps are exempt, but that route is closed. Whether a granted
    `navigator.storage.persist()` protects against this deletion is unconfirmed; B6 records what
    it returns.
  - So export is what protects shot history: manual export (T1.7) and automatic export (T1.20,
    Q1). A home-screen manifest or other install work gains nothing under beacio.

## D-017 — Ids are monotonic UUIDv7 strings

2026-10-03 · accepted

- Every record id is a lower-case UUIDv7 (RFC 9562): a 48-bit epoch-ms timestamp, a 12-bit
  counter and 62 random bits from `crypto.getRandomValues`. Ids sort by creation time as plain
  strings, which suits IndexedDB keys and history order, and the format is a standard one that
  an export reader can look up.
- Each generator is monotonic (RFC 9562 §6.2, method 1). Within one millisecond the counter
  goes up, a clock that steps back is ignored, and when the counter overflows the generator
  borrows the next millisecond. Each new millisecond seeds the counter from 11 random bits. Ids
  from different generators (two tabs, say) are unique for practical purposes, through their 62
  random bits, but not ordered within a millisecond.
- `shortId(id)`, the last 8 hex digits, is for display and file names (T1.7's `<id8>`). The
  first 8 digits are timestamp bits, the same for every id made within about 65 seconds.
- `createIdGenerator` takes an injected clock and random source for tests. `newId()` uses the
  shared default generator.

## D-018 — One runtime schema per record type; normalisers fill nulls and fail loudly

2026-10-03 · accepted

- `src/core/model/schema.ts` is a small hand-written parser kit, with no dependency. Each record
  type has an `ObjectSchema<T>`, a mapped type that needs exactly one parser per key of the
  interface, so the type and its runtime check can't drift apart. The normalisers and the
  constructors are built on them.
- A normaliser returns exactly the schema's keys in schema order and fills a missing or
  `undefined` nullable field with `null`. It drops unknown keys, and throws `SchemaError`, with a
  path such as `shot.grindSetting.value`, for a missing required field or a wrong type. It
  doesn't coerce values or judge plausibility, so a stored record never becomes unreadable over a
  judgement call.
- Storage (T1.5) normalises every record it reads, and the importer (T1.7) every record it
  parses. That is how old records gain new fields as `null`.
- Schema evolution:
  - A field added later must be nullable, or come with a storage and export migration.
  - An unknown event type is refused, not dropped: raw data is never lost silently, and a file
    from a newer build fails loudly in an older one.
  - Unknown keys are dropped, because the DB version and the export's `formatVersion` already
    stop an older build from reading newer data.
- Constructors throw on malformed input such as a NaN time. That is a programming error, better
  caught where it happens than as a recording that can't be exported months later.
- Records are JSON-native except frame bytes, which IndexedDB stores as `Uint8Array` and the
  export writes as hex. Command bytes in events are packed upper-case hex.

## D-019 — Shot schema (refines D-007)

2026-10-03 · accepted

- A shot is created with `recordingId`, `anchorTMs` and `source` (`live`, `manual` or
  `post-hoc`). Those, its `id` and its timestamps are never edited: `updateShot` refuses them.
  The anchor is a time inside the shot: the "shot done" moment for a live shot, the user's
  action for a manual one, and the segment's start for a post-hoc one. T1.14 matches segments
  to shots by it.
- **Deleting a shot leaves a tombstone** (`discardedAtEpochMs`). Under D-007 a segment with no
  shot gets a new `post-hoc` one, so a deleted false positive would come back at the next
  re-analysis. A discarded shot keeps claiming its segment, and history hides it (T1.19).
- Fields, all null until set: grading (`direction`, `channelled`, `tags`), recipe (`doseG`,
  `targetRatio`, `beansWeighedG`) and the Phase 2 references (`beanBagId`, `grinderId`,
  `grindSetting`, `burrEpochId`, `containerId`).
  - `tags` is `string[] | null`. `[]` means none were given, and `null` means the field wasn't
    captured (hidden, T2.8). The spec's schema rule needs that difference.
  - `beansWeighedG` is there from day one, because the spec decrements the bag by beans weighed,
    not by dose.
  - `grindSetting` is `{ kind: 'stepless' | 'clicks', value }`, with whole numbers for clicks,
    because the spec says not to force one numeric field. T2.1 and T2.3 may still reshape it
    while every stored value is null.
  - Days off roast isn't stored. It derives from the bag's roast date and the shot's time
    (T2.2), so correcting a roast date corrects the history.
- Matching results and quality flags are derived (T1.14) and never stored on the shot.

## D-020 — The transport contract

2026-10-03 · accepted

- `ScaleTransport` (`src/transport/types.ts`) has `connect`, `disconnect`, `send(ScaleCommand)`,
  `onNotification`, `onStatus`, `kind`, `status` and `now()`, and nothing else. The spec wants
  the source swappable (beacio or Bluefy, Capacitor, a GaggiMate stream), so it stays narrow.
- **Order:** a transport reports `connected`, with the device and both characteristics' GATT
  properties, before its first notification, and `disconnected`, with a reason, after its last.
  The recorder creates the recording on `connected`, so no frame arrives before it exists. For
  Web Bluetooth (T1.4) that means reporting `connected` before `startNotifications()`.
- **One clock:** `now()` is the clock that stamps `tArrival`, and the recorder stamps app events
  with it, so frames and events share one timeline. That holds for the mock too, whose clock is
  virtual and may run at 10×. Clocks and timers are injected as a `Scheduler`. Tests use
  `ManualClock`, so they are deterministic and instant.
- **Commands:** every transport writes through `CommandQueue`. It keeps one write in flight with a
  pause after each (protocol-notes, finding 13) and, right before each write, runs
  `isWhitelistedCommand()` and copies the bytes. That makes D-015's runtime check part of the
  shared path, not something each transport must remember. Commands still queued when a
  connection ends are rejected, so none can be written into the next connection.
- **Errors:** `TransportError` with a `code` (`busy`, `connect-failed`, `not-connected`,
  `disconnected`, `refused`, `write-failed`). The recorder logs its message in `command-failed`.
- Reconnecting without the chooser isn't in the interface yet. T1.4 adds it along with
  `getDevices()` (hardware test B3).
- **Update 2026-10-03, T1.4:** `reconnectKnownDevice` is now an optional member of the interface,
  present only where the runtime can do it (D-022). And `Emitter` delivers a value emitted from
  inside a listener after the current one, so a listener that disconnects on `connected` can't
  make the listeners after it see `disconnected` before `connected`.

## D-021 — The simulator's model, and what it assumes where the docs are silent

2026-10-03 · accepted · revised 2026-10-04 (T1.22) to hardware session 1, and 2026-10-05
(T1.16, D-059) to session 2's shots: no vibration, a fast drain, a first lump, the readings'
truncation

What it models is in `docs/ARCHITECTURE.md` "Simulator", and every parameter with its default
in `src/core/sim/params.ts` and `shot.ts`. Each choice below says where it comes from: **S1** is
hardware session 1 (D-037), **S2** session 2 and its two shots (D-048, D-059), and **open**
names the hardware test that will settle it, with the value marked `PROVISIONAL(U1.1: <test>)`
in the code (D-029). When a result comes in, update
the simulator to match. `src/core/real-fixtures.test.ts` holds an idle simulated session up
against S1's recording.

**From session 1:**

- **Sampling.** A sample every 100 ms of the scale's clock, which runs 0.69% slow (−6,940 ppm):
  a frame every 100.7 ms of the phone's. Each sample instant has ±1 ms of jitter, which no
  recording can tell from the link's.
- **Weight.** Rounded to 0.1 g; the frame carries hundredths. White noise of σ 0.012 g before
  the rounding, so a reading at rest holds still (S1: not one change in 92 s), while the scale's
  own flow figure, the change of the unrounded weight over a second, moves by about σ 0.017
  g/s (S1: 0.018). Each reading goes out as the Mini sends it: the tenth as a float32, times
  100, truncated to hundredths, so 35.1 g reads 35.09, at rest too (S1: 19 of 3,359 readings;
  S2: 746 of 6,085; D-058, D-059). The analysis snaps them back.
- **Timer.** It counts samples: one sample period per sample while it runs, added before the
  frame goes out, so the first frame after a start reads 100 ms.
- **When commands act.** The scale takes a command `commandLatencyMs` after the write (40 ms,
  open: the recorder logs a command once it's acknowledged, after the scale took it). A stop or
  a reset shows in the next frame. A tare or a start waits until that frame is out, so it shows
  in the frame after, and `07` starts its timer a frame after its tare. In S1 the first frame
  after a tare's acknowledgment never showed it, where every stop and reset showed at once; and
  S1's timer commands, replayed into the simulator at their times, give S1's three timer runs
  to the tick.
- **The timer mode** (the default, D-038). `04` starts a stopped timer from 0 and does nothing
  else: it doesn't resume a frozen timer. `05` freezes a running timer. `06` zeroes a stopped
  one and is ignored while it runs. `07` tares, then starts as `04` would (open: S1 sent `07`
  only with the timer at 0). A tare works whatever the timer does (open). Nothing goes out on
  FF12, not even for the app's commands.
- **The automatic mode.** S1 showed what it does; how it decides is open (A4), in
  `AUTOMATIC_MODE`.
  - Between runs, it tares a vessel once the reading settles at least 5 g above where it last
    settled, and it starts its own run when two samples in a row read 0.3–5 g above zero:
    liquid, or anything light, like S1's touch. It decides on the weight before noise and
    rounding: the real scale decides on a signal no frame shows. S1 never showed a vessel
    tared between runs: the item put back at 123 s stayed untared, but by then the scale had
    most likely left the automatic mode (the presses at 115–117 s).
  - The run's timer starts from 1 s, so its first frame reads 1.1 s, as in S1. That about makes
    up for the detection: the default shot's run starts about a second after the first drip.
  - During a run it ignores `01` and `04` (S1), and `06` and `07` (open). `05` ends the run:
    the timer goes to 0 in the next frame, the weight in the frame after, as a tare (S1).
  - Between runs `04`, `05`, `06` and `07` do nothing (S1), and a tare works (open).
  - Not modelled: the tick that came twice in S1's run, 1 s in.
- **The flow-rate mode.** No timer: `04` to `07` are ignored, and a tare works. The user
  confirmed that the mode has no timer (D-038, 2026-10-05). Whether `07` tares there is
  untested, and moot, since the app uses the timer mode.
- **`03 0D` frames** go to FF12 as the automatic mode's run starts and ends, with every field 0
  but the state, as the Mini sent them (S1). No other mode sends any.
- **Physical tare.** It sends nothing (S1, A7: one press; to repeat), and waits for the next
  frame like a commanded tare (open, C4). A press can weigh on the platform (`pressG`) until
  then, so the frame after shows the press gone and the tare done together, as S1's did
  (D-061).
- **Standby.** The frame reports the auto-off setting and never counts down (S1). The scale
  never switches itself off (open, A6), and keep-alive (`25`) changes nothing visible. A script
  ends a session with `power-off`; the phone notices after the BLE supervision timeout (2 s, a
  guess).
- **The link.** A frame waits for the next 30 ms connection event. One in twenty misses it and
  waits for the next (a link-layer retransmission), and can miss more. Then an exponential
  delay of 1 ms on average. S1: gaps of 90, 120 and 150 ms, each within about a millisecond,
  and frames late on the timer's line by a median of 16 ms (p95 33 ms; simulated: 17 and 33).
  S1 lost, damaged and stalled nothing in 338 s, so all three are off by default. Its only
  stalls were the microphone's (0.46–0.71 s, B8). The least latency (15 ms) is a constant no
  recording can show.

**From session 2** (D-048, D-059):

- **No vibration.** With the pump on the readings hold still, as at rest (A2):
  `vibrationSigmaG` is 0.
- **A fast drain.** The tail's τ is 200 ms: the two shots drained with τ 0.18 and 0.27 s.
- **A first lump.** The first liquid lands as one lump of `firstDropG` (0.2 g, open: C3), as
  shot B's did, and the stream's drops resume once the stream has caught up with it.
- **The tap with the pump** (Q4): `espressoScenario({ manualStartMs })` sends Tare + start as
  the user does.

**Still assumed (open):**

- **Smoothing** (A13: S1 showed only that the off command takes effect by the second frame):
  when on, it filters the weight (an EMA, τ 500 ms), not just the scale's flow figure. The spec
  turns it off because it would bias the tail fit, which reads only the weight, so the
  pessimistic reading is the useful one. It's off by default, the state the recorder leaves
  (spec parsing rule 5). `demoScenario` starts with it on, so the recorder's confirmation logic
  has work to do.
- **Vibration**, for a scale or a machine where it shows: white noise with σ
  `vibrationSigmaG` added to every sample while the pump runs, which leaves the mean alone, as
  the spec's segmentation assumes. Off since S2; the variance detector's tests use 0.1 g
  (`VIBRATING_SCALE`). At 0.1 g steps it has to reach about ±0.05 g to show at all.
- **Settling** (C2): a vessel put down or lifted settles exponentially, τ 100 ms.
- **Drops** (C3): after the first lump, liquid lands in drops of 0.05 g, which the 0.1 g
  readings follow smoothly, as S2's did.
- **A tare zeroes the noise-free gross mass** at that instant, as if the scale averaged first.
- **Shots** follow `shot.ts`: no liquid in the pre-infusion, a flow profile, an exponential
  tail (C3; τ from S2).

**Ground truth and determinism:**

- **Ground truth is about the liquid**, not the reading: `first_drip` is when liquid starts to
  land (the first drop), yield is everything the shot delivers in whole drops, `settled` is when
  that is within 0.05 g (the spec's stability band), and honest yield is what has landed at the
  first `cup-off` after `pump_on`. With drops off, yield is exactly w(pump_off) + ẇ(pump_off)·τ.
- **Determinism:** one seed, one named random stream per effect (`Rng.fork`), and a fixed number
  of draws per sample and per frame. A session doesn't depend on how it is stepped, so
  `MockTransport` and `simulateSession` agree frame for frame. Switching one effect on (vibration,
  drops, a flush, retransmissions) leaves every other effect's numbers unchanged, which keeps
  A/B tests honest. It is deterministic on one JS engine; `Math.log` and `Math.cos` may differ
  in the last bit between engines.
- **Before T1.22** the defaults were guesses (D-013): 10 Hz on a clock 300 ppm fast, 0.01 g
  steps, noise σ 0.015 g, a timer counting milliseconds, every command acting at once and in
  any mode (`04` resuming, `06` stopping a running timer, `07` restarting), `03 0D` frames off;
  on the link, 8 ms of mean jitter and a 100–400 ms stall on 0.3% of frames. D-037 says what
  session 1 found instead.

## D-022 — How the Web Bluetooth transport connects, subscribes and writes

2026-10-03 · accepted (U1.1 checks it on the phone: B2, B3, A14, A15) · `reconnectKnownDevice`
amended by D-071

`src/transport/web-bluetooth.ts` (T1.4). Hardware tests may overturn any of these; record the
change here when one does.

- **UUIDs as canonical 128-bit strings.** Discovery and lookups pass `SERVICE_UUID` and the
  characteristic UUIDs (lower-case 128-bit strings built from the 16-bit constants), not the
  numbers `0x0ffe`. The standard accepts both, but a shim has to translate a number, while the
  canonical string is what the standard turns everything into. aiobookoo uses the same strings.
  The filters are
  `[{ services: [SERVICE_UUID] }, { namePrefix: 'BOOKOO' }]` with `optionalServices`.
- **Order** (D-020): `requestDevice()` synchronously inside `connect()`, GATT connect, service,
  FF11, FF12, notification listeners, `connected`, then `startNotifications()` on FF11 and FF12.
  `connect()` resolves when both have started. The `gattserverdisconnected` listener goes on only
  after the GATT connect resolves, so an event left over from an earlier connection to the same
  device object can't end the new one.
- **FF12 is subscribed when it reports `notify` or `indicate` as true.** A property the runtime
  doesn't report counts as false: no subscription. FF11 is always subscribed.
- **Any subscription failure ends the connection**, FF12's included: `connect-failed`, and the
  status goes `connected` → `disconnected` with reason `error`. So `ConnectionInfo.subscribed` is
  never wrong, and the recording shows the failing step in its `disconnected` event. Carrying on
  without FF12 would leave a recording saying FF12 notifies while no FF12 frame ever arrives,
  which reads as a hardware result (A7, A15) and isn't one. If a runtime fails only FF12, make
  that failure non-fatal and give the transport a way to report it.
- **Writes:** `writeValueWithResponse` when FF12 reports `write`, so a resolved write means the
  scale received it. aiobookoo leaves the choice to bleak, which since 0.21 decides the same way
  (checked in their sources, 2026-10-03). Otherwise
  `writeValueWithoutResponse` when it reports `writeWithoutResponse`, else `writeValue`, which
  lets the runtime choose. A command sent between `connected` and the end of the subscriptions
  waits for them, because Web Bluetooth rejects overlapping GATT operations. A write still in
  flight when the link ends is rejected with `disconnected` at once, so `send()` always settles.
- **No timeouts.** `disconnect()` cancels a connection in progress, at any step, including with
  the chooser open; a runtime that finishes connecting after the cancel is disconnected again.
  CoreBluetooth, behind both iOS shims, waits for a device indefinitely, which suits
  "reconnect, then switch the scale on".
- **Failure reasons:** a failed connect reports `disconnected` with reason `error` and a message
  that names the step, like `Getting service 0FFE: NotFoundError: …`. A cancelled chooser is an
  `error` too, since runtimes don't report it in one consistent way. `disconnect()` gives `user`,
  and `gattserverdisconnected` gives `device`.
- **`reconnectKnownDevice`** is a getter, present when `navigator.bluetooth.getDevices` is a
  function. It is checked on each access, as `navigator.bluetooth` itself is, because shims
  inject the API into the page. It takes the device of this transport's last connection if
  `getDevices()` still lists it, otherwise the first device whose name starts with `BOOKOO`.
  When there is none, the error lists what `getDevices()` returned, which is what B3 needs to
  know. It needs no user gesture.
- **Bytes** are copied out of the event's `DataView` at once, read from the event target as the
  standard says, or from the characteristic when the target has no value. A notification with no
  readable value is delivered as zero bytes: raw keeps what arrived (D-004).
- **Lint:** only `web-bluetooth.ts` may touch `navigator.bluetooth`, also in the
  `window.navigator.bluetooth` form (`no-restricted-syntax`). The rest of `src/transport` is
  held to it too.

## D-023 — IndexedDB layout: add-only raw chunks, one per batch, on a self-healing connection

2026-10-03 · accepted

`src/storage/` (T1.5). The stored schema is version 1. Once a phone holds data, a change to it
needs a migration (`MIGRATIONS` in `db.ts`).

- **Stores and keys:** `recordings` by `id`; `frameChunks` by `[recordingId, firstSeq]`;
  `events` by `[recordingId, seq]`; `shots` by `id`, with index `byRecording` on
  `[recordingId, anchorTMs]`; `derived` by `[recordingId, analysisVersion]`; `kv` with
  out-of-line string keys. No auto-increment anywhere.
- **A frame chunk is one batch, written once.** Each append adds new chunks of up to 256 frames
  and never touches a stored chunk. The rejected alternative was fixed-capacity chunks
  rewritten as they fill: fewer records, but every flush would overwrite stored raw, and a bug
  could replace frames. With one chunk per batch nothing ever rewrites raw. The cost is about
  one chunk per second of recording (600 for ten minutes), which one `getAll` reads.
  A chunk is `{ recordingId, firstSeq, frames: [{ seq, tMs, source, bytes }] }`: the recording
  id once, and each frame's bytes as a `Uint8Array` with a buffer of its own (IndexedDB would
  store a view's whole buffer).
- **Raw is add-only, three ways.** The repositories have no update or delete: `raw` has
  `append`, `read` and `last`; `recordings` has `create`, `end` (once), `get`, `list` and
  `listOpen`. A type-level test pins those method sets. Raw writes use IndexedDB's `add`,
  which refuses to overwrite a key. And each append checks, in its transaction, that the
  recording is stored and that every new `seq` exceeds everything stored for it, frames and
  events alike. A gap is accepted, because it records a loss; a repeat is refused. An append
  is one transaction: all of it is stored, or none. Event `add` can't actually collide behind
  that check, so it is defence in depth (the one mutant a mutation pass couldn't kill).
- **Values are `unknown` in the DB schema type**, so the compiler makes every read go through a
  normaliser (D-018). Writes normalise too, so a stored record has exactly the schema's keys.
- **The recorder writes through `RecordingWriter`.** It stores the recording at once (its
  first write is `create`), then batches: a write starts about a second after the first
  waiting record, or when 20 wait. One write runs at a time and takes everything waiting, so
  what is stored is always everything appended up to some point, without gaps. A failed write
  puts its records back ahead of newer ones; after a failure only the timer starts writes, so
  a storage that keeps failing is retried about once a second, and nothing is dropped. Writes
  start on a microtask, so records appended in the same tick join the write.
- **The connection heals itself.** It opens lazily and opens again after the browser closes it:
  on a `close` event, on `InvalidStateError` when creating a transaction (tried once more),
  and after a transaction fails with `UnknownError` or `InvalidStateError`. Safari has been
  known to lose its IndexedDB connection ("Connection to Indexed Database server lost"), and
  the recorder must not fail until a reload. On `versionchange` it closes, so an old tab never
  blocks another tab's upgrade. Its next call then fails with `newer-version` ("reload").
  `onBlocked` reports an upgrade waiting on a tab that can't close (a suspended one).
- **Errors:** IndexedDB errors become `StorageError` with a code (`exists`, `not-found`,
  `already-ended`, `out-of-order`, `quota`, `newer-version`, `unavailable`, `closed`, `failed`)
  and the browser's error as `cause`. Programming errors (`SchemaError`, `TypeError`,
  `RangeError`) pass through unchanged.
- **Shots have no hard delete:** `discard` sets the tombstone and keeps the first discard time
  (D-019). Listing goes through `byRecording`, which gives recording order, then anchor order,
  so history is chronological.
- **Derived entries** are `{ recordingId, analysisVersion, computedAtEpochMs, result }`.
  `analysisVersion` is an integer ≥ 0, and `result` is any JSON, which T1.14 defines and
  checks. **kv** values are JSON, copied on the way in.
- **`listOpen` reads every recording and filters:** IndexedDB doesn't index `null`, and a few
  thousand recordings are a fast scan.
- **`requestPersistence()`** calls `persist()` (or `persisted()` where only that exists) and
  `estimate()`, never throws, and returns a status for the UI. T1.8 calls it at startup and
  shows it (B6).

## D-024 — The recorder: status-driven recordings, a smoothing check, Web Locks for recovery

2026-10-03 · accepted

`src/app/recorder.ts` and `src/app/recovery.ts` (T1.6).

- **The transport's status drives everything.** `connected` starts a recording and
  `disconnected` ends it. A `connect()` that rejects after `connected` (a failed Web Bluetooth
  subscription) still made a recording, which ends with the transport's reason and message.
  The recorder must exist before the first connect (it throws if the transport is already
  connected) and lives as long as its transport: it can't be detached, because two recorders on
  one transport would record every connection twice. A second `connected` without a
  `disconnected` (a contract breach) ends the first recording as `error`; a second
  `disconnected` does nothing.
- **One timeline.** `tMs` is `transport.now()` minus its value at `connected`, for frames
  (`tArrival − start`) and events alike. `connected` and both `characteristic-properties`
  events come first, at tMs 0. `smoothing-confirmed` takes the tMs of the frame that showed
  smoothing off; every other event is stamped when it is logged. `disconnected` is always the
  last record: nothing is logged after it, so a command whose write settles after the
  disconnect goes unlogged. tMs never decreases along `seq`, except when the mock delivers a
  burst of frames in one tick and a listener logs an event mid-burst. Web Bluetooth delivers
  each notification in its own task, so real recordings don't have that.
- **A command is logged when its write settles:** `command-sent` with the time the write
  completed, so a command that waited in the queue (100 ms spacing) carries the time it reached
  the scale; or `command-failed` with the error's message. Never both.
- **The smoothing check (spec parsing rule 5).** `flowSmoothingOff` goes out on `connected`
  (reason `connect`). Any weight frame with a valid checksum and smoothing byte `0` confirms
  it, even one that left the scale before the command took effect, because smoothing is off
  either way. The 2 s wait starts once the write settles, because a Web Bluetooth write first
  waits for the subscriptions. With no confirmation: one retry (reason `smoothing-retry`),
  another 2 s, then `smoothing-not-confirmed` with the last smoothing byte (null if no weight
  frame arrived). A failed write counts as an attempt. A `0` that arrives later still logs
  `smoothing-confirmed`, so the timeline shows when smoothing did go off. The warning
  `smoothing-not-off` shows while it isn't confirmed, and also when a confirmed smoothing reads
  on again (no event for that: the frames record it). Timers run on the injected scheduler, so
  with the mock at speed N the wait lasts 2·N s of the mock's time.
- **Ending.** On `disconnected` the recorder stores every record (`flush`, retried every
  second until it succeeds), then calls `recordings.end(id, startedAtEpochMs + tMs of the
  disconnected event, reason)`, retried the same way. So an ended recording is a complete one,
  and one the app dies before ending stays open and is recovered as `unclean`.
  `endedAtEpochMs` comes from the recording's own timeline, like the unclean path and
  `epochMsAt()`, not from `Date.now()`. `already-ended` counts as ended.
- **Storage failures.** The writer keeps every record and retries (D-023). The recorder logs
  one `error` event (context `storage`) per run of failures, not one per retry, which would
  bury the timeline at one a second. A run ends when a write stores records. The warning
  `storage-failing` shows while any writer, or any end, is failing, including after
  `disconnected`, when nothing more can be logged.
- **Unclean recovery uses Web Locks.** While recording, the recorder holds the Web Lock
  `smart-scale:recording:<id>`. It requests it synchronously on `connected`, before the
  recording's first write can show it to another tab, and releases it once the end is stored.
  `recoverUncleanRecordings()` ends an open recording as `unclean`, at `startedAtEpochMs` plus
  the tMs of its last stored frame or event (0 with none), only if it can take that lock with
  `ifAvailable`, and it holds the lock while it ends it. So recovery never ends a recording
  another tab is recording, and two tabs never both end one. Nothing is appended to a
  recovered recording: no `disconnected` event, because none happened. Without Web Locks (none
  of the target runtimes lacks them, but the fallback is cheap), it ends only recordings that
  stored nothing in the last minute, because a live recording stores a batch every second.
  Rejected: a heartbeat in `kv` (a write every second, and still racy), and ending everything
  open (it would mark a live recording in another tab `unclean`).
- **Live stats are display-only** and never stored: frames, frames/s over 2 s, FF11 decode
  failures (in all, in the last 50, and the over-half alarm), the latest weight frame,
  `unitOk`, the smoothing state, and `unsaved`, `finishing` and `storageError`. FF12 is left out
  of the alarm because it may carry frames of a shape nobody knows yet. Warnings:
  `smoothing-not-off`, `failing-frames`, `unit-not-grams`, `storage-failing`. The state is
  emitted after every change and once a second while recording, so frames/s falls to 0 when
  frames stop.
- **A hidden page flushes:** `visibilitychange` to hidden, and `pagehide`, flush every writer,
  since iOS suspends a background tab soon after.
- `onFrame` listeners get their own copy of the bytes. The queued frame's bytes are what gets
  stored, and a listener that changed them would change raw.

## D-025 — Export format v1: raw entries plus top-level metadata, one record per line

2026-10-04 · accepted

`src/core/export/` and `src/app/export.ts` (T1.7). `docs/export-format.md` is normative.

- **Shape.** `{ format: "smart-scale-export", formatVersion: 1, exportedAtEpochMs, app,
  recordings, shots, settings }`. Each recording entry is `{ recording, frames, events }`, the
  shape `raw.read()` returns, and its records leave out `recordingId`, so a frame or event can't
  claim another recording. Shots and settings sit at the top level, apart from raw, because
  they are metadata, imported by different rules (kept or replaced, where raw is only ever
  skipped). Shots stay complete `Shot` records, so a shot can name a recording that isn't in the
  file, and an orphan shot still has somewhere to go in a full export. Rejected: shots nested in
  their recording's entry, which can't hold an orphan.
- **Frames are compact rows**, `[seq, tMs, source, hex]`, with the bytes as packed upper-case
  hex. Events stay objects: there are few of them, and they are read by eye. The parser accepts
  upper-case hex only, so a hand-edited or foreign file that wrote it differently fails loudly.
- **Layout: one record per line, one-space indents.** grep, sed, diff and agents reading part of
  a file see whole records, and a fixture's git diff shows the records that changed. The
  simulator's arrival times have 15 to 17 significant digits, and real ones (a difference of two
  `performance.now()` readings) can too, so a frame row is about 74 bytes. With one-space
  indents a frame takes about 80 bytes and three minutes at 10 Hz is about 145 KB, under the
  plan's 150 KB. Two-space indents came to about 152 KB. U+0085, U+2028 and U+2029 are escaped
  inside strings, since Python's `splitlines()` breaks lines on them. Times keep full precision:
  rounding them would change raw.
- **Versions.** `FORMAT_VERSION` is one more than the number of `EXPORT_MIGRATIONS`. A migration
  upgrades the parsed JSON by one version before validation, like the database's `MIGRATIONS`.
  A newer version is refused with a message that says to reload the app. Unknown keys are
  dropped and missing nullable fields read as `null` (D-018), but an unknown event type refuses
  the whole file.
- **No entities in version 1.** None exist yet. T2.1 adds them as version 2; its migration can
  give version 1 files empty entity lists. The shots' entity ids are `null` until then.
- **Settings are every `kv` entry**, in a full export only; a one-recording export has
  `settings: null`. Nothing is stored in `kv` yet. Device-local state put there later (a
  remembered device id for T1.21, a "last exported" time for T1.20) must be left out of the
  export or the import explicitly, or it moves between devices.
- **Derived data isn't exported.** It is recomputable, and `ANALYSIS_VERSION` would make a stale
  copy misleading.
- **Import never replaces raw.** A recording whose id is stored is skipped, so importing twice
  changes nothing. A new recording is stored whole by `raw.addRecording`, one transaction for
  the row and every record: with `create` and `append` as separate transactions, a failure
  between them would have left an empty recording that every later import skips.
- **An open recording in a file is stored ended as `unclean`**, at its last record, which is what
  startup recovery would do (D-024). Nobody records it where it is imported, and an open
  recording left behind would wait for the next startup. A skipped recording whose file copy has
  records after the stored copy's last one is reported with that count, but not completed: the
  stored copy may have ended already, and a recording ends once. Completing a snapshot from a
  longer copy is left for later, if it ever matters.
- **Metadata: `keep` by default, `replace` on request.** Equal values (by JSON value, any key
  order) count as unchanged. A shot is replaced only when its identity (recording, anchor,
  source, creation time) matches the stored one (`shots.replace` refuses otherwise, D-019), and
  its timestamps are the file's. A shot whose recording is nowhere is imported anyway and
  counted, so importing metadata before its raw works. Rejected: "newer `updatedAtEpochMs`
  wins", which the plan didn't ask for and which hides edits made on a device with a wrong
  clock.
- **Manual export takes two taps.** The first builds the file; the second downloads it (a real
  `<a download>` on a blob URL) or opens the share sheet. `navigator.share` needs the tap's user
  activation, which building a large export could use up, and Safari is strict about it. Share
  is offered only where `navigator.canShare({ files: [file] })` says yes: some browsers share
  links but not files, or not JSON. Hardware test B7 settles what works on the phone.
- **File names are local time.** Core can't read the time zone, so the app passes the offset.

## D-026 — Shot history is only safe off the phone; automatic export sends closed recordings

2026-10-04 · accepted (user: export is a must) · the export rule is proposed, T1.20 confirms it

- **The user, 2026-10-04:** export is a must-have feature. They asked whether some Safari storage
  persists better than IndexedDB, such as localStorage.
- **What Safari does.** Checked 2026-10-04 through search results quoting WebKit and MDN; the
  agent container can't reach webkit.org or MDN directly. References: WebKit's "Full
  Third-Party Cookie Blocking and More" (2020, webkit.org/blog/10218) and "Updates to Storage
  Policy" (2023, webkit.org/blog/14403).
  - **No storage type is exempt.** Tracking prevention deletes all of a site's script-writable
    storage after 7 days of Safari use without the user interacting with the site. That covers
    IndexedDB, localStorage, sessionStorage, media keys, and service-worker registrations and
    caches. localStorage is on the list, so it is no safer than IndexedDB. It is also worse in
    every other way (about 5 MB, strings only, synchronous). IndexedDB stays.
  - **It's an inactivity timer, not a schedule.** The 7 days count days on which Safari is
    used, and each visit with a tap resets them, so daily use of the app never triggers it. The
    risks are 7+ days of using Safari without opening the app (a holiday), or the user clearing
    Safari's website data.
  - **Home-screen web apps are exempt.** Their day counter runs only while the app is in use.
    That route is closed: beacio works only in a Safari tab (B9), and the spec says Bluefy has
    no install.
  - **Eviction under storage pressure is a separate mechanism.** Since iOS 17 a browser origin
    may use up to about 60% of the disk. Past the overall limit, WebKit evicts whole origins,
    least recently used first, except origins in persistent mode. Safari grants
    `navigator.storage.persist()` without a prompt, based on the user's interaction with the
    site. The app requests it at startup (T1.8), and B6 records the answer.
  - **Undocumented:** whether persistent mode also lifts the 7-day rule. WebKit doesn't say, so
    nothing may rely on it.
- **Consequences:**
  - Off-device copies are the only protection that holds. Manual export stays (T1.7).
    Automatic export (T1.20) is the priority once M1 is done, and Q1 picks where the copies go.
  - **Automatic export sends closed recordings only.** It runs when a recording ends, or at
    startup when recovery ends an unclean one (D-024).
    - Why: a recording runs from connect to disconnect, so a file written while still
      connected (even after the shot) is a snapshot. Import can't complete an imported snapshot
      from a longer copy (D-025). An archive holding a snapshot and the full copy would
      therefore restore whichever it imported first.
    - If T1.20 wants to export while connected (for example on the post-shot tap), it must
      first teach import to extend an imported snapshot.
  - A manual export of the open recording stays allowed: it's useful while probing hardware.
    It is the only way to make a snapshot, so the D-025 limitation doesn't arise in daily use.

## D-027 — Automatic export goes to a private GitHub repo, when one is configured

2026-10-04 · accepted (user) · supersedes D-003, answers Q1 · its "nothing nags" superseded by
D-031

- **The user, 2026-10-04:** "handle auto exports with a private github repo for now, if
  configured". The options were a private GitHub repo with a fine-grained token (zero taps) and
  Safari's Download into iCloud Drive or the share sheet (a tap or two); see D-026.
- **"If configured":** automatic export is opt-in and set up on the device. It runs only once
  the user has entered a repo and a token on the phone. Without them nothing is uploaded, nothing
  nags, and the app works as before. Manual export (T1.7) stays either way, and a manual Download
  into iCloud Drive remains the user's own copy.
- **"For now":** this is today's destination, not a permanent one. Keep it behind a narrow
  interface, as `ScaleTransport` is for BLE, so that a later destination (iCloud via CloudKit,
  or the share sheet) can be added without touching the export queue.
- **What gets uploaded:**
  - closed recordings only (D-026);
  - one file per recording with its shots, in the existing format (D-025);
  - at a stable path per recording, so a re-export overwrites the same file.

  Each upload is one commit in the data repo. The app never deletes files there, and never
  replaces a file with one that holds fewer records.
- **Credentials:** a fine-grained personal access token limited to the one data repo, with
  Contents read and write.
  - The user enters it on the device.
  - It is never built into the app: the Pages site and its bundle are public.
  - It is never committed, and never written to exports, events or error messages.
  - It lives in device-local storage, which `exportAll` must leave out (D-025).
  - If Safari deletes the app's storage, the token goes with it and must be entered again. The
    recordings are already safe in the repo.
- **The repo must be private.** The app checks this before uploading and refuses a public repo,
  which would publish the recordings.
- **A side benefit:** once the user adds the data repo to an agent's session, the agent can read
  real recordings straight from it (fixtures for T1.16) instead of waiting for uploaded files.

## D-028 — The probe: app-level links, page and wake lock events, display-only statistics

2026-10-04 · accepted (U1.1 checks it on the phone)

`src/app/startup.ts`, `src/app/links.ts`, `src/core/live/`, `src/platform/wake-lock.ts`,
`src/platform/microphone.ts` and `src/ui/probe/` (T1.8).

- **Startup order.** `startApp` opens storage, then runs `requestPersistence()` and
  `recoverUncleanRecordings()` together, then makes the links. Nothing can connect before
  recovery has run, because the probe renders only after startup. A recovery that can't list the
  open recordings doesn't stop startup: the probe shows the error, and the next startup tries
  again.
- **One link per kind of transport** (`ScaleLinks`): Web Bluetooth, and the mock at each speed
  (`mock@10`). Each is made on first use and kept for the page's life, with its recorder and its
  `ProbeMonitor`, so a screen that comes and goes never makes a second recorder (D-024). The
  monitor lives with the link rather than the screen, so its figures cover the whole recording
  even if the screen was elsewhere.
- **The screen wake lock is wanted while any link is connecting or connected.** Connecting is
  included because a reconnect may wait for the scale to be switched on (D-022).
  - Safari grants the lock only during the user activation of a tap (WebKit; checked through
    search results, 2026-10-04). So the Connect and Reconnect taps ask for it, right after
    `connect()`. The chooser goes first because a lost chooser breaks B2, while a lost wake lock
    has a fallback.
  - The browser drops the lock when the page is hidden, and it is asked for again when the page
    is visible again. In Safari that request may fail for want of a tap, so a failed or dropped
    lock shows a "Keep screen on" button while connected.
  - Playwright gotcha: a context created with `permissions: [...]` makes Chromium deny every
    permission not listed, the wake lock included.
- **Page visibility goes on the recording**, as the `ui-action`s `page-hidden` and
  `page-visible`, with detail null (hardware test B4). `ScaleLinks` subscribes before any
  recorder exists, so on hiding the event is logged before the recorder's hidden flush, and that
  flush stores it. That matters because iOS may suspend the tab right after. The events tell a
  gap in the frames caused by the browser apart from a lost link. No new event type: the stored
  schema and the export format are unchanged.
- **Other probe presses are `ui-action`s too:**
  - `try-microphone`, with `{ outcome, error, tracks }`, logged when the outcome is known and
    only while recording;
  - `keep-screen-on`.

  Commands go through `sendCommand(cmd, 'probe')`, and annotations through `annotate(label,
  text)`. A note must have text.
- **Buzzer: a level picker (0 to 5, default 0, mute)** rather than the plan's mute button alone,
  so a muted buzzer can be turned back on from the app. Levels 0 to 5 are on the whitelist (Mini
  doc, D-008), so it sends no new kind of command.
- **Display-only statistics** (`src/core/live`), never stored or used by analysis:
  - the weight's mean and σ over the last 0.5, 2 and 10 s of arrival time (A2; 10 s for A11),
    from trusted weights only (D-005, D-014);
  - the timer's gaps between consecutive weight frames with a valid checksum, over the last 100
    gaps, split into advancing, still and backwards (A1);
  - FF11 arrival gaps, and the longest silence between frames of either characteristic since
    connect (B4);
  - the smallest weight step, in whole hundredths so float noise can't fake a step below
    0.01 g (A11);
  - the distinct unit, sign and smoothing byte values seen (A9, A10, A13), and the last
    `03 0D` frame.

  The windows run on arrival time, which every frame has, rather than the scale's timer, which
  runs only after `04` or `07`.
- **Routes.** Every hash shows the probe until T1.18. `?mock` selects the simulator's demo
  session, and `&speed=N` (0 < N ≤ 1000) speeds it up. A bad speed falls back to 1 and says
  so.
- **The simulator ships in the production bundle**, about 8 kB of the 40 kB gzipped, so `?mock`
  works on the deployed site. Lazy-load it if it grows.
- **Export flushes first.** The recordings panel calls `links.flush()` before every export. If
  that fails, it exports what is stored anyway and says so: during probing, some file beats
  none.
- **Rendering** is throttled to one redraw per 150 ms (`useLiveUpdates`), because the recorder
  reports a change per frame, hundreds a second with the mock sped up.
- **Smoke test.** `npm run e2e` (`scripts/e2e-probe.mjs`) drives the production build with
  Playwright. It uses the agent environment's global Playwright and Chromium, so it adds no
  dependency, and CI doesn't run it.

## D-029 — Build ahead of the hardware tests; adjust after U1.1

2026-10-04 · accepted (user)

- **The user, 2026-10-04:** away from the scale; "continue with the other tasks without the
  tests now and adjust later on".
- **Agents keep taking tasks in board order.** A value that depends on the real scale or phone
  is a provisional default: a rate, noise level, threshold, window or timeout. Mark each one in
  code with a comment naming the hardware test it waits on, for example
  `// PROVISIONAL(U1.1: A2)`. `grep -rn 'PROVISIONAL(' src` then lists everything to revisit.
  The simulator's defaults, already marked provisional in `src/core/sim/params.ts` (D-013,
  D-021), count too.
- **T1.13 is unblocked.**
  - It builds both pump detectors, the detrended-variance one and the regime-change fallback.
    It picks per shot window from what the data shows, and flags which one ran.
  - Without vibration, `pump_on` is `null` and flagged; Q4 stays open.
  - This overrides D-013's gating and the spec's "revise the segmentation section before any of
    it is implemented". The user accepted revising afterwards: if A2 shows no vibration, T1.16
    asks the user about the spec and Q4.
- **T1.21 no longer waits for B3.** B1 found `getDevices()` in both runtimes, so T1.21 builds
  the remembered-device reconnect with the chooser as the fallback, and ends as `verify`. B3
  decides whether it works, and whether the Capacitor wrapper (T3.4) moves up.
- **T1.16 is the adjustment pass.** It:
  - tunes everything marked `PROVISIONAL`;
  - settles T1.13's detector choice and Q4;
  - checks T1.21 against B3;
  - brings the simulator in line with real data;
  - bumps `ANALYSIS_VERSION`.
- **Still gated:** T1.16 itself (it needs real fixtures), plus two Phase 3 tasks: T3.1 (the
  microphone, B8) and T3.2 (sending the unverified `0x25` repeatedly, A6).
- `verify` tasks pile up meanwhile. U1.1 checks them all in one session at the scale: the
  board's `verify` rows are the list.

## D-030 — Automatic export: a device-local store, a narrow sink, a ledger, create before compare

2026-10-04 · accepted (confirms D-026's export rule; implements D-027)

`src/app/auto-export/`, `src/storage/local.ts` (T1.20).

- **Device-local values get their own store, `local`** (database version 2), next to `kv`. A
  full export writes every `kv` entry as settings (D-025), so the token and the ledger can't
  live there. A separate store keeps them out of every export and import by construction, where
  a key filter could be forgotten by a later change. T1.21's remembered device id belongs there
  too. `kv` stays the settings that travel between devices.
- **The sink is narrow** (`BackupSink`): `check()`, `read(path)` returning the text and an
  opaque version, and `write(path, text, replacing, note)`. The plan's `upload(path, text)`
  wasn't enough: an update must name the version it replaces, and "compare before writing"
  needs a read. Errors are a `BackupError` whose kind tells the queue what to do: retry
  (network, 5xx, rate limit, an answer it doesn't understand), stop (401, 403, 404, not
  private), compare again (conflict), or hold that one file and go on (rejected, such as too
  large).
- **GitHub's contents API**, one commit per file, `Authorization: Bearer <token>`.
  - Requests carry only `Accept`, `Authorization` and `Content-Type`. GitHub's CORS preflight
    has refused `X-GitHub-Api-Version` (github/docs#24706, community discussion 40619), so the
    default API version (2022-11-28) applies. The fake GitHub in the tests refuses any other
    header, as a browser would.
  - `cache: 'no-store'` on every request: GitHub's answers are cacheable for 60 s, and a cached
    `sha` would make the next update conflict.
  - Reads use the `object` media type, which gives the `sha` for any file up to 100 MB and the
    content up to 1 MB, then `raw` for a larger file's text.
  - Size: reports say the PUT takes 10 MB and refuses about 50 MB (422, "too large"). A
    3-minute recording is about 145 kB, so the Git data API isn't needed. A file that is
    refused is held, with GitHub's message, and the others go on.
  - Every pass that has something to upload checks the repo first, not just the first one
    after the settings change: a repo made public in the meantime must stop the uploads, and it
    costs one GET per pass.
- **Where:** `<prefix>YYYY/MM/<file name>`, by the recording's local start, the same local time
  as the manual export's name (`recordingArchivePath`). The ledger keeps each recording's path
  for good, so a time-zone change never moves a file. Default prefix `recordings/`.
- **What, and when** (D-026 confirmed): closed recordings only, at startup (which covers the
  ones recovery ended and imported ones), when one ends (`ScaleLinks.onRecordingsChanged`), after
  an import, and after shots change (`shotsChanged()`, debounced 10 s, for T1.18 to call).
  **Simulator recordings aren't uploaded**: they aren't shot history, and agents reading the
  data repo for fixtures would have to filter them out. This is the agent's call; flipping it is
  one line in `#scan`.
- **The ledger** has one device-local entry per recording: destination, path, state (`synced`
  or `held`), the destination's version, a digest of the shots, the time and, if held, why.
  - A closed recording's raw records never change (hard rule 1), so its file changes only when
    its shots do. A scan compares the SHA-256 of each recording's shots (canonical JSON, sorted
    by id) with the ledger's, without reading any raw records, so a year of history scans
    quickly. The plan's "hash of the last uploaded text" is covered by the version: GitHub's
    blob `sha` is a hash of the uploaded text.
  - Entries name their destination, so a new repo, branch or folder uploads everything again,
    and an entry this build can't parse counts as missing. Both are safe, because of the next
    point.
- **Create before compare.** A file the ledger doesn't know is written without a `sha`, which
  GitHub refuses with 422 if the path holds a file already. Only then is that file read and
  compared, so a normal upload is two requests (check, PUT) and makes no 404. A held file, and
  any file after a 409 or 422, is read and compared first. `compareWithRemote`:
  - files that differ only in `exportedAtEpochMs` and `app` are the same: the ledger adopts the
    destination's version, and nothing is written;
  - this device's file replaces the destination's only if it has at least as many frames and
    events, and every shot the other has, so no file is ever replaced with one holding fewer
    records;
  - a file that holds another recording, more than one recording, settings, or that this build
    can't parse (a newer format, say) is kept, and the recording held with the reason. It is
    compared again once this device's shots change. Importing the destination's file merges
    its shots, after which this device's copy wins.

  Nothing is ever deleted. After three conflicts in a row on one file, the pass waits and
  retries.
- **Failures and triggers.**
  - Retry delays: 1, 2, 5, 15, then every 30 minutes. A rate limit's `retry-after` or
    `x-ratelimit-reset` sets the least wait, and nothing (not `online`, nor Retry) goes before
    it. A waiting retry runs at once on `online` and when the page is shown again, and every
    app start runs a pass.
  - A stop (401, 403, 404, a public repo) isn't remembered across app starts: the next start
    tries once more, one request, and stops again with its message. Saving the settings or
    Retry lifts it.
  - Writes are at least a second apart (GitHub asks for that between mutating requests). Its
    secondary limits (80 a minute, 500 an hour) show up as rate limits during a first backfill
    of a long history, and the queue waits them out.
- **No lock between tabs.** Two tabs uploading at once is safe: a create is refused if the
  file exists, an update with a stale `sha` conflicts, and either leads to a comparison.
  Rejected: a Web Lock, which a suspended tab could hold for as long as iOS keeps it frozen.
- **Status** isn't stored: the last export time is the latest `synced` entry for the
  destination, and an error that persists shows again on the next pass.
- **The token** sits in the `local` store and in the sink's private field. Every `BackupError`
  message passes through `redact`, which replaces the token, and the status does too. A test
  runs a whole session with the token in GitHub's answers and checks the exports, the files,
  the status, the logs and every request but its header. The UI never gets it back: the field
  is write-only, with Replace and Remove.
  - **Caveat:** every site under `https://misch0n.github.io/` is one origin, so the user's other
    Pages sites, if any, could read this app's IndexedDB. The token's reach is the data repo
    alone, which limits the harm. U1.2 says so.
- **UI** (rudimentary, T3.5 restyles it): status, held recordings, Retry now, and the settings
  (open until the first save). Test checks the form's values, unsaved, with the stored token if
  the field is empty.

## D-031 — Set up automatic export later; remind on the page until then

2026-10-04 · accepted (user) · supersedes D-027's "nothing nags"

- **The user, 2026-10-04,** after T1.20: "Can we continue without this test now? I would do it
  but later." Then: "You can put a reminder on the page so that I don't forget whenever I open
  it."
- **U1.2 waits**, as the hardware tests do (D-029). T1.20 stays `verify (U1.2)`, nothing depends
  on it, and agents keep taking tasks in board order. Until it is set up, recordings exist only
  on the phone, and Export all is the only copy off it (D-026).
- **The reminder** (`BackupReminder`, `src/ui/AutoExportPanel.tsx`) sits at the top of the page
  every time it opens while automatic export is `off` (never set up, or the token removed) or
  `stopped` (a refused token, a missing or public repo). It says the recordings aren't backed up
  off the phone and why, and its button opens the automatic export settings and scrolls to
  them. It can't be dismissed: the point is that it shows on every open, and it goes away by
  itself once automatic export runs. It stays out of the way while uploads wait to retry on
  their own (`waiting`), since those need nothing from the user.
- It replaces D-027's "without settings nothing nags". The rest of D-027 stands: without
  settings, nothing is uploaded and no request is made. When T1.18 makes the capture flow the
  main screen, the reminder goes there too.

## D-032 — Timebase: one fitted rate per recording, each run's least offset

2026-10-04 · accepted · refines D-006 · T1.16 checks it on real recordings (A1) · the frames between runs on the sample grid: D-063

`src/core/timebase/` (T1.9). `buildTimeline(rawFrames)` gives each decoded FF11 weight frame a
time `t` (s), its source (`device` or `arrival`), and the decoded frame itself; plus the device
runs, the drift, the jitter and the nominal sample interval.

- **Which frames are device-timed.** Runs of consecutive weight frames whose timer field strictly
  increases. A 0 is never in a run (the timer isn't running), and neither is a value equal to a
  neighbour's: a frozen timer's first frame carries the moment `05` stopped it, not its own
  sample time, which would put it up to a sample period early. A value that falls starts a new
  run (`07`, or the 24-bit wrap after 4.6 hours). Frames that fail to decode don't break a run.
  A run needs 3 frames.
- **A rate, not only D-006's offset.** The simulator's scale clock drifts 300 ppm (D-021), so one
  offset per run is 18 ms off after a minute, against the 5 ms the plan asks. Each run maps
  `arrival = offset + rate × timer`:
  - **The rate is shared by every run of the recording** (one scale clock), fitted by least
    squares with each run's own intercept, refitted without frames more than 3 robust σ above
    their run's line (stalls). Below 30 s of runs in all, the fit is noisier than the drift it
    corrects, so the rate is 1. A drift beyond 2% is taken for a bad fit (rate 1). Both are
    `PROVISIONAL(U1.1: A1)`.
  - **The offset is D-006's**: each run's line under all its frames, touching the fastest.
  - Each run long enough to fit alone reports its own drift (`ownDriftPpm`): the drift check.
- **Why least squares, not the lower envelope.** The obvious estimator for one-way delays is the
  line under all points (linear programming; Moon, Skelly and Towsley 1999). It suffers from BLE
  connection events. Frames wait for the next event, and as the scale's clock slides past the
  phone's, the fastest frames' wait traces a sawtooth (10 ms high, a period of about 33 s at
  100 ms samples, a 30 ms interval and 300 ppm). The envelope follows that sawtooth whenever a
  run holds fewer than two of its troughs. Least squares averages the cycling waits out.
  Simulated runs, worst of 20 seeds, ms of error around the run's median error (one constant):

  | Link and run length | Least squares | Envelope | One offset |
  | --- | --- | --- | --- |
  | default (30 ms interval, 8 ms jitter), 30 s | 4.6 | 6.1 | 5.0 |
  | default, 60 s | 2.8 | 8.9 | 9.5 |
  | default, 120 s | 1.6 | 1.9 | 18.5 |
  | 20 ms jitter and 2% stalls, 60 s | 3.8 | 6.2 | 9.5 |
  | ±50 ms exponential jitter without connection events, 60 s | 3.2 | 1.4 | 9.5 |

  Real BLE always has connection events, where least squares has the better worst case.
  A hybrid (the envelope's slope clamped to the least-squares band) gained under a millisecond
  for more code, and gating the fit on its significance only helped a scale that doesn't drift.
- **Arrival-timed frames** take their arrival less the median jitter of the device-timed ones
  (0 without runs), so both sources sit on the same footing: the pre-infusion of a shot whose
  timer starts after the pump would otherwise be off by the typical delay. Then each such time
  is held between its neighbours (raised to the time before it, then lowered to the time after
  it), so `t` never decreases: a stalled burst just before a run would otherwise land after
  the run's first frame. Device times aren't moved. Bursts can leave equal times; downstream
  resampling must allow that.
- **What `t` means:** the sample time plus the link's least latency, and for each run the wait
  of its fastest frame. Those constants are unknowable and differ between runs by a few ms
  (simulated: at most 6 ms), far below the 100 ms sample period. Durations and rates don't
  depend on them.
- **Known limits, for T1.16:**
  - When the sample period is a whole multiple of the connection interval (100 ms on a 50 ms
    interval), every frame waits the same, the arrivals carry no information about drift, and
    no method does better than about 20 ms per minute. iOS intervals are multiples of 15 ms, so
    a 100 ms period avoids it; A1 gives the real period.
  - A scale that drifts little (50 ppm) gets a fit noisier than its drift (6 ms against 2 ms).
    Real drift may well be that small; if A1 shows it, T1.16 can raise `minFitSpanMs` or use
    one calibrated drift for the scale.
  - Arrival-only stretches keep their jitter. Fitting a regular sample grid to them stays
    optional, for T1.16 to judge on real data, as the plan said: it needs the scale's true
    rate, and a wrong one would push times off by a period per frame.

## D-033 — Signal toolkit: fitted edges, whole windows, equal times merged

2026-10-04 · accepted · T1.10

`src/core/signal/` (ARCHITECTURE "Signal toolkit"). The choices a caller would otherwise have to
read the code to learn:

- **Savitzky–Golay weights come from least squares, not tables:** Householder QR on abscissae
  centred on the evaluation point and scaled to about ±1. Any window, order (tested up to 21
  points, order 6), derivative and position works, without the precision the normal equations
  lose. The weights match the published tables, and exact rational least squares off the centre.
- **SG ends are fitted, not padded.** The first and last (window − 1) / 2 outputs evaluate the
  fit over the first or last window at their own position (scipy's `mode='interp'`). Mirroring or
  repeating the end value would bend the derivative where a shot starts and stops. Fitted ends
  reproduce polynomials exactly but are noisier than the interior. A series shorter than the
  window gets one fit over all of it.
- **Weights are in window order**, oldest first: Σ w[j] y[j]. scipy's `savgol_coeffs` defaults to
  convolution order (reversed), which flips the sign of odd derivatives.
- **Rolling statistics cover whole windows only** (n − window + 1 outputs). A partial window at an
  end looks quieter than it is (one sample has no range), so it would pass a stability test it
  shouldn't. Output k covers samples k … k + window − 1.
- **Rolling variance is the sample variance** (n − 1), updated by Welford's replace step and
  recomputed exactly every `window` positions so rounding can't build up: within 2·10⁻⁹ g² of the
  two-pass value at a 10 kg level with 300 g steps. A window of equal values gives exactly 0 when
  recomputed, and within rounding of 0 otherwise; the analysis's σ floor (q/√12) covers that.
- **Resampling merges equal times by their mean.** T1.9 gives a burst of arrival-timed frames one
  time: their order is known, their spacing isn't, so they count as one sample. Outside the
  samples the grid holds the end values (as numpy's `interp` does), and grid times are multiplied
  out (start + k × step), never accumulated.
- **CUSUM's change point** is the first sample after the last moment the sum was empty before the
  alarm: the argmin of the cumulative sum (spec "Markers"), the latest on a tie. The alarm needs
  the sum strictly above the threshold.
- **Measured for T1.12:** with the spec's slack of 0.5σ and a threshold of 5σ, a 2σ step in white
  noise is dated with a median error of 0–1 samples, but a tenth of the estimates are 4 or more
  samples off, mostly early: noise before the change keeps the sum from emptying. With the slack
  at half the shift the estimate is unbiased, 90% within 2 samples. At 0.5σ and 5σ the average
  run length without a change is about 940 samples, so a scan over 250 quiet samples raises a
  false alarm a quarter of the time. Start the scan near the expected onset, and refine the change
  point with the rise fit, as T1.12 says.
- **Line fits** sum about the first weighted point and then about the means, so large x keeps its
  precision and equal values give exact answers. Weights are relative (1/σ²; flow² for ln flow).
  Over a simulated 10 s tail with constant noise, τ unweighted was up to 22% off, weighted by flow²
  5%.
- **`median` and `quantile` moved here from the timebase**, unchanged, and the timebase imports
  signal; the module table says so.

## D-034 — Segmentation: steps on the samples, tares from the log or a jump to 0, anchored baselines

2026-10-04 · accepted · T1.11 · T1.16 checks it on real recordings (A2, A5, A7, A11, C2, C4)

`src/core/analysis/` (ARCHITECTURE "Segmentation"). `segment(timeline, events)` gives the
zero-tracked samples and grid, the steps, the stable stretches and the shot windows with their
baselines. Every parameter is in `SegmentationParams` (plain JSON, for T1.14 to stamp); the ones
that depend on the scale are marked `PROVISIONAL`. The choices, and the measurements behind them
(simulated, default espresso scenario unless named):

- **Order.** Steps and zero-tracking run on the trusted samples, before resampling: on the grid a
  tare's one-sample jump would smear across two points. Stability runs on the zero-tracked grid,
  then the shot windows. This is ARCHITECTURE's pipeline, with steps found where zero-tracking
  needs them.
- **Transitions** are runs of jumps: consecutive samples differing by more than `jumpG` (1 g) plus
  `maxFlowGps` (5 g/s) × the time between them, 1.5 g at 10 Hz. Neither flow nor noise jumps (the
  pump's 0.1 g vibration makes differences of σ 0.14 g). A tare is one jump; a vessel settles in
  or out over several, so the fit after it waits `settleS` (0.3 s).
- **Tares.**
  - A logged command (`tare` or `tareAndStartTimer`, `command-sent` only): the step within 0.5 s
    after it, when the reading lands within `tareZeroG` (0.5 g) of 0. A single jump there is the
    tare. With no transition there, the reading was already near 0: the split that lines either
    side fit best, applied only when its step exceeds 4 standard errors. Most such commands are a
    manual start right after the auto-tare, during the pump's vibration, with nothing to take
    off: applying the fitted noise there moved the yield by up to 0.14 g. The price: a tare of
    0.15–0.4 g under vibration goes uncorrected (a manual start pressed about a second after the
    first drip).
  - The scale's tare button sends nothing (D-021): a transition of exactly one jump that lands on
    0, by at least `minStepG`, is a tare. A vessel lifted from a scale that wasn't tared also
    ends near 0, but settles out: at the simulator's 100 ms, the first sample after the lift
    still holds at least 37% of it. A real lift that looks instant, or a tare that takes a few
    samples, would break this (C2, C4); an FF12 tare event, if A7 finds one, would replace it.
- **Step sizes** compare straight lines fitted to up to `stepFitS` (1 s) of clean samples either
  side, at the middle of the transition, so a step during the flow is measured net of it. A
  stray tare at random times 0.2–10 s into the tail: 0.016–0.03 g rms, worst 0.12 g; a tare under
  the pump's vibration: 0.09 g rms, worst 0.36 g in 100 seeds. The 0.05 g drops and the noise
  dominate. Windows of 0.5 s did worse overall; a joint quadratic-and-step fit gives exactly the
  lines' answer on symmetric windows, and a cubic gained 10–20%, which wasn't worth the code. At
  rest a line costs twice a mean's noise (about 0.013 g per tare). That adds up in the absolute
  zero-tracked level across tares (0.07 g after two), but no yield carries it: each baseline is
  measured after the tares before it.
- **Other steps**: 20 g or more is a vessel (placed or lifted), 1–20 g something else (a spoon),
  below 1 g a transient (a knock). A shot's rise isn't a step: it never jumps.
- **Stability** is the spec's test on the grid: range ≤ max(`stableRangeG` 0.05 g, 1 × q), where
  q is the smallest change between consecutive weights (what A11 reads). Readings flickering
  between two neighbouring values span one step.
  - A stretch is a run of consecutive stable windows, so that every window within it passes. Two
    stretches touching across an instant step stay two; two can share samples after a slow drift.
  - A grid sample that the data doesn't back (the samples either side more than 1.5 steps apart:
    a stall, then a burst) can't be stable. The straight line across a stall otherwise passed for
    stable during the pump.
  - Level and σ come from the samples, not the grid: interpolating at another phase shrinks σ by
    up to √2. σ is the plain standard deviation, floored at q/√12. Within a stretch every window
    keeps within the tolerance, so there are no outliers to resist, and the MAD jumped between
    0, one step and two on data quantised at the noise level: some baselines read 0.003 g
    against the true 0.015 g.
- **Shot windows.** Vessel intervals run between vessel steps; one that starts with a vessel
  lifted holds no shot. Stretches at the same level with no step between them make a plateau.
  - **Anchors**: only a plateau with a stretch of at least `minBaselineS` (1 s) can be a
    baseline or end a rise. Under the simulated vibration (σ 0.1 g), five samples in a row fall
    within 0.05 g in about one window in 300, so a 0.4–0.6 s "stable" fragment turns up in about
    one pre-infusion in five. Taken as the baseline, its level was off by up to 0.1 g. A stable
    second during the pump is vanishingly rare at q = 0.01 g.
  - **Limit:** with steps as coarse as the vibration (q = 0.1 g, σ 0.1 g), the baseline ran more
    than a second into the pre-infusion in 15 of 100 seeds, its level up to 0.09 g off. A2 and A11
    show whether the real scale is like that.
  - **A shot** rises at least `minRiseG` (1 g) over at least `minRiseS` (3 s), from an anchor to
    the next anchor or the interval's end, net of other steps. The window runs from the anchor's
    plateau to the start of the cup's removal (whose step carries the honest yield's level),
    to the next shot's baseline end, or to the recording's end.
  - **The baseline** is the last 2 s of the anchor's last long stretch. Its end falls near
    `pump_on` (1.9 s before to 0.35 s after it), or near `first_drip` without vibration (1.1 s
    before to 0.3 s after). It's a starting point for T1.12 and T1.13, not a marker.
- **Measured:** every test scenario, run over up to 100 seeds, gives one window per shot. Over
  100 seeds of the default scenario the baseline level is within 0.04 g of the cup, its σ
  0.007–0.024 g (true 0.015), and the rise to the cup's removal within 0.03 g of the yield. An
  early lift, the demo (smoothing on, a button press in a tail), two shots with the cup changed
  or into the same cup, a flush, a knock, a cup on before connecting and a recording cut
  mid-shot all segment as they should.

## D-035 — Liquid markers: detect with CUSUM, time with a rise fit; a statistical first_drip target

2026-10-04 · accepted · the first_drip acceptance is the user's · for the real scale,
superseded by D-060 (its tests stay as a regression on the 0.01 g scale)

`src/core/analysis/` (T1.12): `liquid.ts`, `first-drip.ts`, `tail.ts` and `liquid-markers.ts`.

- **Liquid** is the zero-tracked weight less the window's baseline and less every other step
  inside the window, such as a spoon set down (`windowLiquid`). Samples inside an other step's
  transition belong to neither level. They are dropped, and are NaN on the grid, so
  Savitzky–Golay windows that touch them drop out by themselves.
- **first_drip** works in two stages.
  - *Detection.* A one-sided CUSUM runs on the liquid, as the spec says (slack 0.5σ, alarm
    4.5σ). σ is the pre-infusion's noise: the RMS of second differences over √6, which a smooth
    trend barely touches. With the pump running, that's the vibration, not the quiet σ.
  - The scan runs up to where the smoothed liquid reaches `riseFitG` (1.5 g), or ¾ of a smaller
    shot's rise. It reports the run still under way there (`cusum`'s new `lastRun` option), so
    false starts that died away don't count. Its change point is only good to about a second.
  - *Timing.* The samples from 1.5 s before the change point up to the rise are fitted with
    "nothing, then half a drop plus a·(t − t₀)^p". The fit scans t₀ on a 1 ms grid. p = 2 is
    flow ramping up from nothing, the leading term of any smooth start. p = 1, flow there at
    once, is taken only when it fits better by 2σ². t₀ is first_drip, and the onset is
    reported as `gradual` or `abrupt`. Without the half drop the fit starts about 0.07 s early.
  - The spec's own options were CUSUM alone, or a fit of the initial rise. A CUSUM alone
    scattered the change point from 0.8 s early to 0.6 s late (T1.3), so both are used.
- **The user's decision (2026-10-04): first_drip's acceptance is statistical.**
  - The plan asked for every shot within 0.1 s at the default noise. With the simulator's
    default pump vibration (σ 0.1 g at 10 Hz), no method that doesn't know the rise's shape can
    beat about ±0.1 s, one standard deviation; that is the information limit.
  - The tests now require, over 100 seeds at the default vibration: median error under 0.1 s,
    90% within 0.25 s, none beyond 0.7 s, and no bias (median signed error under 0.03 s).
    Without vibration, every shot is within 0.1 s.
  - Measured: median 0.07 s, about 90% within 0.2 s, worst 0.64 s. At 0.05 g of vibration,
    96% within 0.1 s.
  - T1.16 re-checks this once A2 gives the real vibration.
- **The tail.**
  - Flow is the quadratic Savitzky–Golay derivative on the grid, in whole windows starting
    `tailStartS` (0.2 s) after pump_off.
  - ln(flow) is fitted by weighted least squares with weights flow², because ln(flow)'s noise
    is about σ/flow. The first pass weighs the flow by itself, while it stays 3σ above its
    noise. Three more passes range and weigh points by the previous fit's prediction. Weighing
    by the data favoured points that noise had raised, which put τ about 3% long.
  - **w_final** is the spec's `w(pump_off) + ẇ(pump_off)·τ`. On an exponential tail that sum is
    the same at any time, so it is averaged over the tail's last second rather than taken at
    pump_off. There the least of the tail remains to extrapolate: within 0.02 g simulated,
    against 0.2 g at pump_off.
  - No fit, named in the flags: `pump-off-after-window`, `tail-too-short` (fitted flow under
    1 s, for example a cup lifted a second after pump_off) or `tail-not-draining`.
- **w(pump_off)** is a least-squares parabola through the samples from the tail's start to 1 s
  later, evaluated at pump_off. Those samples are past the pump's vibration.
- **settled:**
  - *Measured* when the window lasts that long: the first time after which the smoothed liquid
    stays within the stability tolerance (plus 2σ of the smoothing's noise) of the final level.
    The final level is w_final with a tail fit; without pump_off it is the plateau the window
    ends on.
  - *Extrapolated* when the cup came off first: the time when the fitted tail has less than the
    tolerance left to deliver, `pump_off + τ·ln(rest / tolerance)`.
  - Its weight is the yield, as the spec has it.
- **cup_removed** is T1.11's lift step. The honest yield is its level before, less the baseline,
  less any other steps before it.
- **A change to T1.11's steps:**
  - A vessel lifted or set down just before a sample moves that sample by less than a jump, so
    the sample is already part of the change.
  - Up to 2 such samples now join the transition. A sample qualifies when it lies more than 4
    standard errors beyond the line through the samples before it, in the step's direction.
  - Without this, the level before a lift included a half-lifted sample, and the honest yield
    came out low.
- **Provisional (D-029):** `riseFitG` and `dropG` (C3), `sgWindowS` (A1), `tailFlowSigmas` (C3)
  and `tailMinSpanS` (C5).
- **Measured** against the simulator's truth, with pump_off from the truth until T1.13:
  - over 40 seeds, τ within 10% and w_final within 0.3 g, and settled within 0.05 g of the
    yield;
  - a pump_off 0.2 s early or late still gives τ within 15%;
  - two shots into one cup, a spoon set down, 0.1 g quantisation and a recording cut before
    pump_off all behave.

## D-036 — Pump markers: a noise split for pump_on, a knee for pump_off; a statistical pump_on target

2026-10-04 · accepted · the pump_on acceptance is the user's · for the real scale,
superseded by D-060 (pump_on is the tap; its tests stay as a regression on the 0.01 g scale)

`src/core/analysis/` (T1.13): `pump-markers.ts`, `knee.ts` and `shot-markers.ts`, plus
`test-runs.ts`, which only the tests use. The pump reads off the weight's variance, as liquid
reads off its mean (spec "Shot segmentation").

- **Samples:** the window's liquid samples (D-035), less arrival-timed bursts. A sample closer
  than half a step to a neighbour carries the time it arrived, not the time it was taken.
- **pump_on, by the variance:** the noise is split into a quiet level and a louder one.
  - *Where it looks.* Between the window's start (or the last step before the baseline ends)
    and first_drip, the liquid holds still, so its noise is all there is. That stretch is split
    at the likeliest point, each side about its own mean.
  - *The onset.* pump_on is the midpoint between the two samples at the split: the
    retrospective change point the spec asks for.
  - *The vibration shows* when the louder variance is at least `vibrationRatio` (8) times the
    quieter, and the split's evidence (twice the log-likelihood ratio of two levels against one)
    is at least `vibrationEvidence` (15). Otherwise pump_on is null and flagged `no-vibration`,
    and Q4 stays open.
  - *Knocks* are left out of the split, with their neighbours: samples more than `knockSigmas`
    (6) σ of the pre-drip noise from the still liquid's level. An onset next to one is flagged
    `knock-at-pump-on`.
  - *The mean must stay stationary* (spec: "requiring both rejects a counter bump"). The mean
    of the second after the onset must stay within `stationarySigmas` (4) standard errors of the
    second before, or within the stability tolerance. Each side's noise comes from its second
    differences, which a moved mean doesn't touch. Otherwise pump_on is null (`mean-moved`).
- **pump_off, by the regime change** (always tried; the fallback without vibration). The spec
  says to fit the decay backwards from the end and walk forward to where the data departs from
  it. This is the same knee, found as one fit of both laws (`fitKnee`):
  - before the knee, a parabola: pump-driven flow changing steadily;
  - after it, the drain a + b·τ·(1 − e^(−u/τ)), continuous in weight and in flow;
  - a, b and p by weighted least squares, for each knee and τ tried (a log grid of τ, then a
    golden section);
  - knees first from a hinge fit to ln(flow), then scanned every 0.05 s and every 0.005 s.

  It counts when it drains (flow above 0, τ at most `maxDrainTauS`, 5 s) and beats the
  pump-driven law carried on by `regimeEvidence` (20). It also needs `minTailS` (0.5 s) of tail,
  and must be pinned: no knee more than `maxKneeSpreadS` (0.2 s) away fits nearly as well.
- **pump_off, by the variance** (when pump_on's vibration showed): the same knee fit, with the
  pump's noise variance before the knee and the quiet one after. The step down then pins the
  knee far closer.
  - The step must be clear by pump_on's test, on residuals of models that hold either side: a
    parabola before, the fitted drain after, `levelSpanS` (2 s) each.
  - It must also be pinned.
- **Choosing:**
  - the variance's pump_off when its step is clear;
  - else the regime change, flagged `variance-step-unclear` if the vibration showed;
  - else none (`no-pump-off`).

  `PumpOff.detector` says which ran. Two pump_offs more than `disagreementS` (0.5 s) apart are
  flagged `detectors-disagree`.
- **`shotMarkers(segmentation, window)`** runs first_drip, then the pump markers from it, then
  the liquid markers with the pump_off found: T1.14's one call per window.
- **The user's decision (2026-10-04): pump_on's acceptance is statistical.**
  - The plan asked for markers within 0.2 s whenever the simulator vibrates. pump_off meets
    that in every shot. pump_on can't.
  - In about one shot in ten, the first vibrating samples happen to look quiet, and no method
    can see the onset sooner. An oracle that knows both noise levels exactly misses 0.2 s in 9%
    of shots, this detector in 10%.
  - The tests now require, over 100 seeds at the default vibration: median error under 0.05 s,
    85% within 0.2 s, none beyond 0.5 s, and a median signed error under 0.03 s.
  - pump_off: every shot within 0.2 s. Without vibration, the fallback is used, flagged, and
    within 0.1 s.
- **Measured** over 100 seeds unless noted, at the default vibration (σ 0.1 g):
  - pump_on: median 0.034 s, 85% within 0.14 s, 90% within 0.20 s, worst 0.30 s. Its median
    is 0.019 s late, because quiet-looking vibrating samples can only delay it.
  - pump_off (the variance, in all 100): median 0.024 s, 90% within 0.09 s, worst 0.16 s.
  - Without vibration (the regime change, all 100): median 0.012 s, worst 0.064 s.
  - At σ 0.05 g (30 seeds), the variance's step is clear in a third of the shots and the rest
    fall back. pump_off's worst is 0.094 s. pump_on is looser: median 0.07 s, worst 0.55 s, and
    missing in 4 of 30.
  - At σ 0.2 g (30 seeds): pump_on median 0.03 s, worst 0.22 s.
  - About 25 ms per shot window.
- **first_drip changes (T1.12's code).** A knock before the rise, such as the portafilter
  locked in, crossed the rise's level and fooled the CUSUM. Three guards now:
  - the rise must hold half its level for a second;
  - the pre-infusion's σ caps each squared second difference at 20 times their median, or
    (2q)²;
  - the CUSUM counts each value for at most the alarm.
- **steps.ts change (T1.11's code): a lead-out.** Up to 2 samples after a run join it when they
  lie more than 4 standard errors off the line through the samples after them. That covers a
  knock falling back by less than a jump, and a vessel still settling.
  - A run that lands on 0 takes no lead-out: it may be a tare, whose correction starts at the
    sample after its jump.
  - Moved on, the correction left that sample at the old zero, a spike of the tare's size. This
    was found in review, with quantised flat readings, and is covered by a test.
- **Provisional (D-029):** `vibrationRatio` and `vibrationEvidence` (A2), `minTailS` (C5),
  `maxDrainTauS` and `regimeEvidence` (C3), and `disagreementS` (A2).

## D-037 — Hardware session 1: 0.1 g steps, a 100 ms tick timer on a slow clock, commands the scale can ignore

2026-10-04 · accepted · facts from the scale (U1.1 session 1); T1.22 brings the simulator to them

The first recording from the real scale, read with the app's own decoder, timeline and
segmentation: `fixtures/real/2026-10-04_probe-session_20444bd0.json`, described in
`docs/hardware-tests.md` "Session 1". No shot was pulled, so A2 (the pump's vibration) is still
open.

- **The weight comes in 0.1 g steps** (A11). The frame carries hundredths, but every reading is
  a whole tenth. The 19 exceptions in 3,359 frames all came while the weight moved fast, and are
  a hundredth short of a tenth (38.59 g): the scale truncates a float. `quantisationStep` reads
  0.1 g. The segmentation's tolerance (0.1 g) and σ floor (0.029 g) follow from it unchanged.
- **The reading holds still at rest.** It didn't change once in 92 s with a tared item on the
  platform, and flickered once in 28 s with a 9.6 g item on. The simulator's noise
  (σ 0.015 g) would make a reading flicker when it sits near a step's edge, and the real one
  doesn't. The scale's own flow figure, in 0.01 g/s steps, does move at rest (σ 0.018 g/s), so
  the firmware measures finer than it reports. The display agrees: the user saw the flow in
  finer steps there, and the weight in tenths. For the pump to show in the weight (A2), its
  vibration has to reach about ±0.05 g.
- **Rate and timer** (A1, A12):
  - A sample comes every 100.70 ms of the phone's clock, 9.93 Hz.
  - The timer field counts 100 ms ticks of the scale's clock, one per sample, and that clock
    runs 0.70% slow.
  - The timeline (D-032) takes this as it is. It fits a drift of −6,937 ppm, inside
    `DEFAULT_MAX_DRIFT_PPM` (2%). A repeated tick (once in 545 frames) splits a run.
  - No frame was lost in 338 s. One regular grid fits every arrival within −22 to +119 ms
    outside the microphone stalls, so the arrival-only grid fit that T1.16 is to decide on
    looks worth having.
- **Timer commands and the scale's modes** (A4, A5, A12). By BOOKOO's description the scale
  has three modes: flow rate (weight and flow), timer (weight and time), and automatic. It
  doesn't report its mode over Bluetooth. By the user's account, this session went from
  automatic to flow rate to timer, at times that weren't noted.
  - In the timer mode, `04` and `07` start the timer, `05` freezes it, `06` zeroes only a
    stopped one, and `04` doesn't resume a frozen one.
  - The automatic mode tares and starts its own timer as a cup goes on. While that run goes on,
    it ignores tare and `04`. `05` ends the run, and the timer and the weight both go to 0.
    After that, `04` and `07` did nothing.
  - The flow-rate mode still needs a clean test.
  - So `07` doesn't start the timer in every mode, as the spec hoped it would. It does in the
    timer mode, which the app will use (D-038), and the timebase falls back to arrival time
    anyway.
- **FF12 carries `03 0D` events** (A7, protocol-notes finding 8). They are the Ultra's layout
  with every other byte 0: started when the scale started its own timer, and stopped at the
  app's stop that ended it. A tare from the button sent nothing.
- **`getUserMedia` holds notifications back 0.5–0.7 s** (B8). The frames are delayed, not
  lost. T3.1 should open the microphone once per session.
- **What changes:**
  - D-021 got these wrong:
    - the resolution (0.01 g) and the noise at rest;
    - the rate (10 Hz) and the clock (300 ppm fast);
    - the timer's step (1 ms);
    - the timer commands: `04` resuming, `06` stopping a running timer, nothing ignored.

    T1.22 brings the simulator in line. D-021 had these right: there is no standby countdown,
    and a physical tare sends nothing.
  - The T1.12 and T1.13 acceptances (D-035, D-036) were agreed with the user on the 0.01 g
    simulator. Measured during T1.13 over 100 seeds each, with the simulator's vibration
    (σ 0.1 g) unless noted:

    | | 0.01 g steps | 0.1 g steps | 0.1 g, no vibration |
    | --- | --- | --- | --- |
    | first_drip, p90 error | 0.19 s | 0.44 s | 0.10 s |
    | pump_on | median 0.03 s, worst 0.30 s | median 0.25 s late, worst 1.10 s, 6 missed | none (Q4) |
    | pump_off, worst | 0.16 s | 0.17 s | 0.08 s |
    | τ, worst | 8% | 25% | 19% |
    | yield, worst | 0.02 g | 0.06 g | 0.06 g |

    So the coarse steps cost first_drip and pump_on, and barely touch pump_off and the yield.
    Those targets are re-agreed with the user in T1.16, once A2 gives the real vibration:
    re-tuning for the simulator's vibration now would tune to a guess. Until then, T1.22 keeps
    those tests at the resolution they were agreed at.
  - **Re-measured in T1.22, on the simulator brought to session 1** (D-021: the slow clock, the
    noise, the tick timer, the command timing and the link; 100 seeds each, vibration σ 0.1 g
    unless noted). This is T1.16's starting point. first_drip is on D-035's scenario (pump_on
    at 7 s); the rest on D-036's (pump_on's phase varied by seed), with pump_off as found:

    | | 0.01 g steps | 0.1 g steps (the default) | 0.1 g, no vibration |
    | --- | --- | --- | --- |
    | first_drip, p90 error | 0.21 s | 0.37 s | 0.09 s |
    | pump_on | median 0.04 s, worst 0.42 s | median 0.26 s late, worst 0.78 s, 8 missed | none (Q4) |
    | pump_off, worst | 0.12 s | 0.16 s | 0.08 s |
    | τ, worst | 7% | 25% | 23% |
    | yield, worst | 0.02 g | 0.09 g | 0.05 g |

    - At 0.01 g, the targets the user agreed still hold. first_drip: median 0.07 s, 90%
      within 0.21 s, worst 0.64 s. pump_on: median 0.04 s, 85% within 0.14 s, worst 0.42 s.
      pump_off within 0.2 s in every shot: by the variance in 99 of 100, by the regime change
      in the other.
    - At 0.1 g the variance times pump_off in only 49 shots of 100, and one shot gets no tail
      fit (`tail-too-short`: the tail's flow sinks into the 0.1 g noise within a second); its
      yield still comes from the settled plateau.
    - The timebase holds its acceptance with the tick timer: over 50 seeds, each frame within
      2.0 ms of its sample (around the recording's constant) on the default link, 4.7 ms with
      ±50 ms of jitter, 4.4 ms with 20 ms of jitter and 2% stalls. The timer can't see the
      samples' ±1 ms of jitter; without it the worst is 1.1 ms.
  - T1.4 is done (B2). T3.2 stays blocked: A6 needs the new method in `docs/hardware-tests.md`.

## D-038 — The scale runs in its timer mode

2026-10-04 · accepted · the user's decision · its "a timer that starts without a command"
superseded by D-073 (the scale's timer key)

The Themis Mini has three modes: flow rate, timer and automatic (D-037). The user will keep it in
the timer mode, where every timer command worked in session 1.

- The simulator defaults to the timer mode (T1.22). The other two modes exist to test a scale
  left in the wrong one.
- The scale doesn't report its mode, but the app can tell when it's in the wrong one:
  - a `07` or `04` that doesn't start the timer within half a second means it isn't in the timer
    mode. It could be in the flow-rate mode, or in the automatic mode between runs;
  - a timer that starts without a command, or `03 0D` frames on FF12, mean the automatic mode.

  What the app does then is a UX question for T1.17 and T1.18. It could say so, ask the user to
  switch, or carry on with arrival times. Ask the user there.
- The analysis doesn't depend on the mode. Tares come from the weight, and times come from
  arrival whenever the timer doesn't run.
- **Confirmed by the user, 2026-10-05:**
  - The mode is chosen on the scale. No documented command changes it, and undocumented ones are
    never probed (hard rule 5).
  - The flow-rate mode has no timer at all (the user checked), so `04` and `07` have nothing to
    start there. That answers A4.
  - The automatic mode makes its own decisions: it tares and times by itself.
  - The timer mode is the one the app has full control of. The weight reads the same in every
    mode, but only the timer mode keeps the scale's timer in step with the app.

## D-039 — Spec v2: the UI/UX exploration folded into a copy of the spec

2026-10-04 · accepted (user)

- The user explored the app's look and UX on a Claude Design canvas (branch
  `ui-style-exploration`, `design/ui-exploration/`), in three rounds, and asked for the result
  to be folded into the project on that branch for the agent on `main` to pull.
- `docs/spec-v2.md` is a copy of `docs/spec.md` with the decisions folded in. Changed or new
  sections are marked **(v2)**; every other section is the original text. It wins where the two
  differ, and task **Read** lines refer to its section names.
- `docs/spec.md` stays the user's verbatim original (D-011), so the change is auditable.
- D-040 to D-044 record the decisions themselves. The working brief, with the canonical sample
  data and pointer rules, is `design/ui-exploration/brief.md`; the canvas source is beside it.
- Hard rule 9 ("UI stays rudimentary until T3.5") is unchanged: when the chosen look is applied
  is Q7.

## D-040 — App structure: Home, Brew, History, Setup; the Instrument look

2026-10-04 · accepted (user)

- Four areas on a tab bar (spec v2 "App structure and look"): Home (stats and pointers to the
  rest), Brew (the phases, in focus mode without the tab bar), History (rows, detail, compare as
  a triggered mode with alignment at pump on or first drip), Setup (all configuration).
- Routes: `#/` becomes Home, the brew flow moves to `#/brew`, history to `#/history`, setup to
  `#/setup`; `#/probe` stays.
- Look: A · Instrument, chosen over B · Crema (C · Native and D · Signal were rejected in the
  first round). Monospaced tabular numbers, hairlines, square corners, one signal orange, light
  and dark following the system; system fonts on iPhone, IBM Plex as the fallback.
- The live display shows remaining-to-target (or an over-target warning), flow, time and a graph
  from pump start. This replaces the spec's "Nothing else" on that screen, at the user's request.

## D-041 — Brew phases by container; optional grind and milk phases; microphone pump start

2026-10-04 · accepted (user) · answers Q2 and Q3

- Phases: Beans and Shot are mandatory; Grind (weighing the ground dose) and Milk are optional
  and can be switched off in Setup. Without Grind, the dose is the beans weighed and retention
  isn't measured. **Q2:** the user has a dosing cup that fits, usually the same cup as for the
  beans. **Q3:** the container's mass picks the phase; spec v2 "Brew phases" replaces the lost
  diagram.
- Recognition: the nearest registered container wins. A container can serve several phases (the
  phase order, Beans before Grind, tells them apart). The same weight on two containers is a
  conflict to resolve; within 3 g it is a dismissible warning (a wet container weighs more).
- Pump start comes from the microphone (assumed to work until hardware test B8; it can be
  switched off). The manual start (`07`) is always available on the waiting screen, and is the
  primary action when detection is off.

## D-042 — Grading: score, taste balance, strength, notes, versus last; nothing required

2026-10-04 · accepted (user)

- The spec's direction tap (sour · balanced · bitter, the only required input) is replaced by:
  a 1–10 score on a compact swipe dial (the original spec excluded a score on purpose; the user
  wants it), a taste-balance triangle (sweet, slightly sour, sour, slightly bitter, bitter, sour
  and bitter), strength (watery … heavy), flavour notes from the bag's profile, and worse /
  same / better than the last shot.
- Every grade is prefilled from the last shot of the same bag. Saving is one tap and nothing is
  required. Record per grade whether it was changed or left as prefilled (agent's addition, so
  analysis can tell a copied grade from a chosen one).
- Bag rating (would buy again or not) is optional, offered when the bag is finished or dialled
  in, never on shot one. **Q5** is answered by this.
- The per-shot `channelled` flag isn't on the v2 screens; "sour and bitter" leads to the
  puck-prep pointer. Whether to keep channelled, as a tag, is Q6.
- Schema: `Shot.direction` and `Shot.channelled` (D-019) give way to the new fields in T1.18.
  Every stored value is still `null`, but the export format carries them, so the change is a
  format version with a migration (hard rule 7).

## D-043 — Shot reading, pointers and the learned bag model

2026-10-04 · accepted (user) · the rules are agent proposals the user accepted wholesale

- The app reads each shot's first drip against the bag's learned first-drip window (fast, on
  time, slow); a new bag uses the target from shot settings (default 6–9 s).
- Pointers (spec v2 "Shot reading, pointers and learning"): at most one, only when taste or
  timing calls for it, never modal, dismissible (✕ or "Not for this bag"), switchable off in
  Setup. Grind pointers also show before the next grind, at the beans phase. Applying one sets
  the grinder's setting or the next ratio.
- Learned per bag and grinder: sweet spot, step size (first-drip seconds per grinder step),
  first-drip window, notes by setting, best recipe, dial-in status (3 good shots: balanced,
  score ≥ 7, initial values), age drift.
- **Hard rule 2 applies.** Everything learned is derived: a pure function of raw recordings plus
  metadata, versioned and recomputed. Only the user's actions on pointers (applied, dismissed,
  not for this bag) are stored, as metadata.

## D-044 — Equipment, coffee and settings entities

2026-10-04 · accepted (user)

- Bags: name, roast date, open date, bag weight, remaining estimate; optional roaster, origin,
  region, variety, process, elevation, roast level, type, flavour profile. A history of open,
  unopened and finished bags; finished by the emptying shot or by hand (the rest is written off).
- Grinders: several, one default, a setting kind and a current setting; a setting changed on a
  shot becomes the grinder's setting; burr epochs as in the spec.
- Machine: brand, model, pressure. Maintenance items on the machine and grinders: an interval
  and an optional last-done date; due one interval after the last done, or after the item was
  created when never logged; alerts on Home and in Setup.
- Milk: name, carton size, remaining grams, open date, a default; the milk phase deducts grams.
- Tags: one list; an optional display group and an optional "on by default"; groups only sort.
- Shot settings: basket dose, preferred ratio by drink (Ristretto 1:1.5, Espresso 1:2.0, Lungo
  1:3.0, Cappuccino 1:1.7) or a slider, over-target warning margin (+1.0 g), first-drip target
  for new bags (6–9 s). The target yield always uses the actual dose.

## D-045 — Channelled is a tag; the look applies from the first UI task (amends hard rule 9)

2026-10-04 · accepted (user) · answers Q6 and Q7

- **Q6:** the per-shot channelled mark becomes a tag, "Channelled", in the Notes group and off
  by default. The format migration in T1.18 maps `channelled: true` to it. "Sour and bitter" on
  the taste triangle still leads to the puck-prep pointer.
- **Q7:** the Instrument look is applied the first time anyone works on the UI: whichever UI
  task comes first (T1.18 as planned) adds the theme before anything else — the tokens for
  light and dark, the type roles, radii and base components from `design/ui-exploration/`. The
  probe picks it up as it is.
- **Hard rule 9 amended** (`CLAUDE.md`): it said "UI stays rudimentary until T3.5". It now says
  the UI follows the decided design: the look from the first UI task on, each screen from its
  mockup, no design work beyond the mockups until T3.5. T3.5 keeps the remaining design pass
  and accessibility.
- Fonts: font stacks only (SF Mono and SF Pro on iPhone; IBM Plex named as a fallback but not
  downloaded). Downloading a webfont would be a new runtime asset: ask first.

## D-046 — Tests on the simulator after session 1: agreed targets keep 0.01 g, the rest move on

2026-10-04 · accepted · T1.22 · its knock after a tare: D-062

T1.22 brought the simulator to session 1 (D-021, D-037): 0.1 g steps, a 100.7 ms sample on a
slow clock, a tick timer, commands that act a frame apart, the scale's modes and a fitted link.
How the tests built on the old defaults took it:

- **The targets the user agreed keep the scale they were agreed on.** `AGREED_SCALE`
  (`src/core/analysis/test-runs.ts`, `{ resolutionG: 0.01 }`) pins 0.01 g steps for the T1.12
  and T1.13 tests (D-035, D-036) and for T1.11's usual shot, whose baseline at 0.1 g runs into
  the pre-infusion (D-034's limit; the quantised test covers that). Everything else in those
  tests takes the new defaults. T1.16 re-agrees the targets with the user on real shots; D-037
  has the numbers at 0.1 g.
- **Checks of what the old seeds happened to give, as opposed to the agreed targets, were
  loosened where the new defaults' draws fell outside them**, each with its reason in the test:
  - The CUSUM's σ is compared with the noise the shot actually drew (within 20%), not with a
    fixed 0.08–0.12 g: one seed draws σ 0.126 g of vibration.
  - pump_off by the variance in at least 98 shots of 100, not every one. The agreed target,
    every pump_off within 0.2 s, still holds; the one shot that falls back is flagged
    `variance-step-unclear` (its step's ratio 7.4 against `vibrationRatio` 8).
  - first_drip of two shots in one cup within 0.7 s (D-035's worst case), not 0.5 s.
  - pump_on found next to a knock in 10 shots of 12, not 11.
- **Behaviour that changed** is tested as the scale does it now: `07` while the timer runs only
  tares, so a restart in the timebase tests is `05`, `06`, `04`; the first frame after a
  start reads 0 and the next 100 ms; FF12 events come from the automatic mode only.
- **The demo session runs in the timer mode**, the app's, so the mock sends nothing on FF12.
  `npm run e2e` checks that FF12 stays quiet. A UI task that wants the automatic mode in the
  mock can add a mode to the mock route.
- **Found for T1.16** (the analysis, not the simulator):
  - A knock within about 0.5 s after a tare can pull the tare's fitted landing level outside
    `tareZeroG`. The tare then reads as a cup lifted, and the shot window is lost: seed 10 of
    the knock test, with the tare a frame later than before. That test now tares at 4 s.
  - At 0.1 g, one shot in 100 gets no tail fit (`tail-too-short`): its flow sinks into the
    noise within a second of pump_off. The yield still comes from the settled plateau.

## D-047 — Analysis results: a raw-only cache, shots joined on every read, post-hoc shots only for espresso

2026-10-05 · accepted · T1.14 (refines D-007; T1.16 checks the espresso test and the slack on real shots) · revised the same day after review (below)

`src/core/analysis/` (`metrics.ts`, `matching.ts`, `recording-analysis.ts`, `analysis-schema.ts`,
`version.ts`) and `src/app/analysis-runner.ts` (ARCHITECTURE "Analysis results and the runner").

- **The cached result is a pure function of raw alone.** `analyzeRaw(raw)` gives a
  `RecordingAnalysis`: per shot window, the five markers, the tail fit, the metrics, whether it
  looks like espresso, and its flags; for the recording, a timeline summary, the steps, the
  refused frames and their flag. It is stamped with `ANALYSIS_VERSION` (1) and every parameter
  (timeline, segmentation, liquid and pump markers).
  - The shot matching and the ratio need shot metadata. They run on every read (`matchShots`,
    microseconds), so editing a dose or a grade never makes a cached result stale. The plan's
    `analyzeRecording(raw, shots)` is both.
  - Kept: pump_on's time; first_drip with its detection and fit figures; pump_off's time,
    detector and weight; settled; cup_removed; the tail fit. Left out: the samples and the grid
    (working arrays, D-034) and the pump detectors' diagnostics (the vibration's and the variance
    step's levels, the regime change). `AnalysisRun.markers` has those, for T1.15.
- **Metrics** are the spec's. The first-drip time is pump_on → first_drip, which is also the
  pre-infusion: one field, `firstDripS`. Extraction is first_drip → pump_off, total pump_on →
  pump_off. Average flow is w(pump_off) over the extraction. Yield is w(settled), honest yield
  w(cup_removed), tail mass yield − w(pump_off), and τ comes from the tail fit.
  - A metric is null when a marker it needs is. Without the pump's vibration that is the
    first-drip time and the total, until Q4.
  - A duration of 0 or less is null, and the shot is flagged `markers-out-of-order`.
  - The ratio is the yield over the shot's `doseG`, null without either. When the grind phase is
    off, the dose is the beans weighed (D-041): the capture flow sets `doseG` so (T2.6).
- **Flags.** A segment's are the pump markers' and the liquid markers' together (`no-pump-off`
  once), plus `refused-frames` (frames refused inside its window) and `markers-out-of-order`. The
  recording's is `refused-frames`: the visible flag D-005 and D-014 ask for.
- **The cache** holds ended recordings only, keyed by recording and version. An ended recording
  shouldn't change: the recorder stores every record before it ends one (D-024).
  - An entry counts when it passes `parseRecordingAnalysis`, carries the version, and was made
    with the default parameters. Otherwise it is computed again and replaced. The parameter check
    catches a default changed without the version bump it needed.
  - It also counts only while the recording's last stored record is the last one it read
    (`lastSeq`, checked with `raw.last`). Without Web Locks, startup recovery ends a recording
    that has been quiet for a minute (D-024), and a suspended tab can store records after that.
  - A computed result passes the same check before it is used, so a NaN is a bug that fails
    there, loudly, rather than in the cache.
  - A failed cache write (a full disk) is ignored: the result stands.
- **Open recordings** (the capture flow's "shot done", T1.18) are analysed as they stand, never
  cached, and get no post-hoc shots. The capture flow makes their shots.
- **Matching (refines D-007).** A shot's anchor is inside its shot (D-019), but a shot window
  starts at the cup's plateau, before the pump. With two shots into one cup, it also runs
  through the pause until the next shot's baseline ends, so a manual start pressed in that pause
  falls inside the earlier window.
  - Each segment's *shot* runs from pump_on (else first_drip, else the baseline's end) to the
    window's end. When the next shot pours into the same cup, it ends where this one settled,
    else at pump_off: the first of them that comes before the next shot's start.
  - Shots never overlap: each ends at the latest where the next one starts. At 0.1 g the next
    shot's vibration can keep the level from holding still, so settled comes out inside the
    next shot's pre-infusion: 3 recordings in 180 simulated two-shot ones.
  - Each shot looks at its nearest segment only, by how far its anchor lies outside that span,
    and only within `MATCH_SLACK_S` (10 s). Beyond that it is unmatched (`no-segment`).
  - Segments within 1 ms of the nearest tie, and the later one wins. An anchor where one shot
    ends and the next starts is the next one's start, rounding to the millisecond or not.
  - When several shots are nearest one segment, the order is: one the user made (live, manual)
    before a post-hoc one, then a standing one before a discarded one, then the nearer, the
    earlier anchor, the lower id. The others are unmatched (`claimed`). None moves on to another
    segment, where it would take a shot's place.
  - A discarded shot still claims its segment (D-019).
  - The slack covers clock offsets (tens of ms), markers moving between versions, and a "shot
    done" a little after the cup came off. More would let a shot whose segment wasn't found
    take a neighbour's, a bean pour's for instance.
- **Post-hoc shots only for espresso** (the plan's refinement after spec v2). `espresso` means a
  `pump_on`, or a `pump_off` with a draining tail (a tail fit).
  - Beans, ground coffee and milk poured onto the scale rise like a shot, but show no pump
    vibration and stop without a tail. They stay unlabelled segments (`unclaimed`) until
    containers label them (T2.4, T2.5).
  - Simulated: a steady pour without vibration that stops at once isn't espresso. Every
    simulated shot is: at 0.01 g and 0.1 g, with the vibration or without it.
  - Caveat: a grinder whose vibration reaches the scale, grinding straight into a cup on it,
    shows a pump_on. Simulated, such a grind gets a post-hoc shot. Spec v2's grind phase weighs
    a cup put on after grinding (one settle event, no rise), so this takes grinding onto the
    scale. T2.4 and T2.5 can skip post-hoc shots for windows that a container labels otherwise.
  - The price: a shot without vibration whose cup came off within about a second of pump_off
    has no tail fit, so no post-hoc shot. A live shot still claims it.
- **A post-hoc shot is anchored at its segment's start**, pump_on (else first_drip), in ms. That
  is D-019's "the segment's start" read as the shot's start. It lies inside the shot, clear of
  the window's edges, and stays put between versions. The window's own start, the cup's
  plateau, sits on an edge a later version may move.
  - It is asked for only when a shot anchored there would claim its segment. So once it is
    stored, the next round asks for nothing more, whatever the geometry.
- **Creating them.** They are created in the transaction that reads the recording's shots
  (`shots.createMissing`), so two tabs analysing one recording can't both add one. The runner
  then tells automatic export, which uploads the recording's file again.
- **`reanalyzeAll`** clears the whole cache, old versions' entries too, and analyses every ended
  recording. A recording that fails is reported, and the rest carry on. A second run changes
  nothing: the post-hoc shots of the first claim their segments.
- **Nothing runs the analysis yet.** `startApp` makes the runner (`services.analysis`) but calls
  nothing. Post-hoc shots are durable metadata, the analysis is provisional until T1.16, and no
  screen shows them before T1.19. The capture flow (T1.18) and History (T1.19, T1.23) decide
  when to run it.
- **Measured against the simulator's truth** (one shot per seed, pump_on's phase varied; at
  worst unless noted):

  | | 0.01 g (60 seeds) | 0.1 g, the default (60) | 0.1 g, no vibration (40) |
  | --- | --- | --- | --- |
  | first-drip time | 0.55 s | median 0.20 s early, worst 0.91 s, 4 missing | null (Q4) |
  | extraction | 0.64 s | 0.62 s | 0.14 s |
  | total | 0.42 s | median 0.25 s short, worst 0.77 s | null (Q4) |
  | average flow | 3% | 3% | 1% |
  | w(pump_off) | 0.16 g | 0.27 g | 0.23 g |
  | yield, honest yield | 0.02 g, 0.03 g | 0.06 g | 0.05 g |
  | τ | 6% | 25% | 23% |

  The 0.1 g column is D-037's: pump_on runs late at the coarse steps. A recording takes about
  27 ms to analyse in Node, one shot or two.
- **How much tail the analysis needs** (for T1.18's "shot done", 20 seeds each): with the
  simulator's vibration, pump_off is found 4 s after the pump stops in every shot (3 s: 14 of
  20). The yield is extrapolated from the tail fit until about 8 s, when the cup's level has
  settled in the data. Without vibration, pump_off is found from 2 s.
- **The app bundle** now carries the analysis: 48 → 65 kB gzipped. T1.18 needs it on the phone,
  and it is the app's own code, not a dependency.
- **Revised the same day after a review** of the first commit, before anything ran it:
  - The shots of two segments could overlap. The first version ended a shot at its settled
    time even when that came out inside the next shot. The next shot's post-hoc anchor then
    matched the earlier segment and lost it to that segment's own shot. The next shot stayed
    free, and every analysis added one more post-hoc shot for it. The fix is the
    no-overlap rule, the later-wins tie and the claim check above.
  - Also from the review:
    - a result records `lastSeq`, for the cache's check;
    - the timeline's parameters are validated like the others, so a result can't be stamped
      with `Infinity`;
    - `SegmentFlag` is built from the flag lists, so its type and the schema can't drift
      apart.

## D-048 — Hardware session 2: no pump vibration; pump_on from the Tare + start tap

2026-10-05 · accepted · the user's decision on Q4

The second real recording: beans dosed and ground into the dosing cup, then two shots. Each was
started with **Tare + start** (`07`) at the same moment as the pump. It is
`fixtures/real/2026-10-05_two-shots_0a69da56.json`, and `docs/hardware-tests.md` "Session 2" has
the details.

- **A2: the pump's vibration doesn't reach the scale's signal.**
  - In shot B the pump ran 3.3 s before the first drip. The weight held still at −0.2 g, with
    one 0.1 g flicker.
  - The scale's own flow figure was as quiet as at rest: σ 0.016 g/s, against 0.018–0.021 g/s
    at rest.
  - The only sign was a 0.2 g dip as shot B's pump started. Shot A's weight stayed at 0 from the
    tap to its first liquid, so it had none.
- **Q4, the user's decision:** `pump_on` is the Tare + start tap made at pump start, flagged as
  manual, until the microphone works (T3.1; spec v2 makes it primary). The tap carries human
  latency. In session 2 it was made "at the same moment" as the pump, and shot B's dip came
  0.3 s after its logged command. Spec v2's "Fallback if vibration does not survive" now says
  this, as the spec asked for this outcome.
- **`07` tares and starts the timer in the timer mode** (A5): at 264.7 s it tared a 264.8 g
  vessel to 0 by the next frame.
- **The drip stops fast.** After pump off the flow dies within about 0.8 s, and the tail is
  0.1–0.3 g. The regime change's τ sits on its 0.2 s floor, and the tail fit refuses
  (`tail-too-short`). The simulator drains with τ about 1.5 s: too slow for this machine.
- **Tenths sent a hundredth short, at rest too.** 746 of 6,085 readings end in 9 hundredths
  (264.79 for 264.8, 35.09 for 35.1). Every reading is within 0.01 g of a tenth, but
  `quantisationStep` reads 0.09 g.
- **Two unknown FF12 frames at 6 s:** `03 0C` (then "SN" and the serial number) and
  `03 0E 01 07`. The decoder keeps them as `unknown`, and nothing uses them. The fixture masks
  the serial number, because the repository is public.
- **What changes, for T1.16.** Items 2 to 4 are pinned by the `it.fails` tests in
  `src/core/real-fixtures.test.ts`.
  1. `pump_on` from the log: the Tare + start command (or the capture flow's manual start), the
     last one before the first drip within a few seconds, flagged as manual. Pre-infusion, the
     first-drip time and the total then exist for real shots.
  2. Readings snapped to the scale's grid, and a quantum that a hundredth-short tenth doesn't
     fool.
  3. Steps inside a pour: shot A's moved scale became two "other" steps (+3.5 and +4.7 g), which
     came off its yield (39.0 g, not 47.3 g).
  4. D-047's espresso test, which needs a `pump_on` or a draining tail. Neither real shot passed
     it, so neither would get a post-hoc shot. Item 1 mends most of this.
  5. The baseline: shot B's was taken inside the pump's dip, so its yield read 0.2 g high.
  6. first_drip: shot B's read 0.27 s early (the abrupt fit, over 4.5 s at 0.1 g).
  7. The tail fit's minimum spans, for a machine that stops dripping within a second.
  8. The simulator's defaults (T1.22, D-046): no vibration, and a fast drain. The variance
     detector and its tests stay, for a scale that shows vibration.

## D-049 — Record the microphone's sound levels; the shot's pump run is the one its first drip falls into

2026-10-05 · accepted · the user's decisions

The background:
- The scale can't see the pump (A2, D-048).
- The probe's **Try microphone** only checks access: it stops the stream as soon as it is
  granted (`src/platform/microphone.ts`). So session 2 holds no pump sound, although the user
  tried the microphone to get some.
- The user also runs the pump through the group for several seconds before each shot (a surf),
  which a microphone would hear as well.

- **The probe records the microphone's sound levels** (user). It stores loudness in a few
  frequency bands, about 20 times a second, from when it is started until disconnect. It is a
  new raw stream, so real shots and surfs carry pump sound for T3.1 to be designed on.
  - Levels only, not audio: they can't be played back, so nothing said in the room is kept.
    That's about 40 kB a minute against about 5 MB for raw audio.
  - A new raw stream is an export format version (hard rule 7).
  - It is built as T1.24, before T1.15.
- **The shot's `pump_on` is the start of the pump run its first drip falls into** (user).
  - A run that stops with nothing in the cup, such as the surf, never counts.
  - Live, a run that ends without liquid quietly resets the shot view.
  - There is no extra "ready" tap. Arming the shot by the espresso cup going on (spec v2
    "Brew phases") wouldn't be enough: in session 2 the cup sat on the scale for a minute
    before shot B.
  - Until the microphone detector exists (T3.1), the Tare + start tap stays `pump_on` (Q4).
    It stays the fallback after that.
- **The data stays raw, the detector derived.** Pump detection from the recorded levels is
  analysis: a pure function of raw, versioned (hard rule 2). The live display's detector is
  separate (hard rule 3). The analysis ignores the new stream until T3.1: the timeline already
  reads only FF11.
- **Also from the user, on session 2:**
  - Shot A's scale was moved because it was off centre under the spouts.
  - Before each shot the reading plunges to −150 to −400 g for about 1.5 s and comes back.
    That is what lifting the scale looks like, about the time of the surf. The analysis's
    zero-tracking already treats it as a transient.

## D-050 — Sound levels: `mic` frames, layout 1, one meter for the app

2026-10-05 · accepted · T1.24

How T1.24 records the microphone's sound levels (D-049).

- **A reading is a frame with the source `mic`.** It is a row like any frame,
  `[seq, tMs, "mic", hex]`, on the recording's `seq` and clock, appended and never changed (hard
  rule 1). So storage, export, import and automatic export carry it as they are. The timeline
  reads only FF11, so the analysis ignores it until T3.1. A test proves the analysis is the same
  with and without levels, apart from `lastSeq`.
  - The bytes are the layout's id, then one byte per level: −dB × 2, so 0 is 0 dBFS and 255 is
    −127.5 dB or quieter. That is 13 bytes a reading, about 40 kB a minute in the export.
  - A layout never changes; a new one gets a new id (`SOUND_LAYOUTS`). `sound-started` also
    carries the layout's measures as JSON, so a file describes itself.
- **Layout 1 has 12 levels.**
  - Octave bands from 40 Hz to 16 kHz. The first holds the mains hum's fundamental, 50 or 60 Hz.
    The bands together give the spectrum's shape: a grinder is broadband and high.
  - The 50 Hz and 60 Hz harmonic combs up to about 1 kHz: a vibratory pump hums at the mains
    frequency and its harmonics. A comb sums the bin nearest each harmonic, only that bin. At
    11.7 Hz bins, a wider window around 50 Hz's harmonics would overlap 60 Hz's.
  - The overall level, 40 Hz to 16 kHz.
- **The meter** (`src/platform/sound-meter.ts`) is Web Audio's `AnalyserNode`. Nothing needed
  an `AudioWorklet`.
  - FFT size 4096: 11.7 Hz bins over the last 85 ms at 48 kHz. No smoothing. Read every 50 ms.
  - The input has echo cancellation, noise suppression and automatic gain off, so that levels
    from different moments compare.
  - The `AudioContext` is made inside the tap, before `getUserMedia`: iOS starts audio only with
    a tap's user activation. The analyser isn't connected to the output, so nothing plays.
  - Readings are taken only while the context is `running` and the track isn't muted.
    `sound-input` logs each change, which explains the gap. A suspended context is asked to
    resume about once a second.
  - It stops when the user stops it, when the track ends or the context closes (`ended`), or on
    an error. `sound-stopped` gives the reason.
  - None of these values depends on the scale, so none is provisional. Whether the levels
    survive the background (B4), and whether the meter starts in beacio, is the user's check.
- **One meter for the app, on across recordings.** `SoundCapture` (`ScaleLinks.sound`) records
  into every recording in progress. Each `getUserMedia` stalls the scale's notifications for
  0.5–0.7 s (D-037), so the microphone is opened once and kept open.
  - **Record sound** can be tapped before Connect: the levels then start with the next
    recording. Disconnect and Connect don't stop them. Levels between recordings go nowhere.
  - T1.24 asked to try whether the Connect tap could start it. A Record sound tap before Connect
    does the same job, without the Bluetooth chooser and the microphone prompt in one tap. So
    Connect doesn't start it.
  - Each recording gets these, in order:
    - the `ui-action` `record-sound`, with the tap's outcome, as `try-microphone` has. It is
      logged when the outcome is known, so the stall comes just before it.
    - `sound-started`, after the opening events. `continued` is true when the levels were on
      before the recording began, and false when the tap came during it.
    - `mic` frames.
    - `sound-input`.
    - `sound-stopped`.
  - **Try microphone** is disabled while the levels run: on iOS a second `getUserMedia` can end
    the first stream.
- **Export format version 2**, with an identity migration: a version 1 file has no `mic` frames
  and no sound events.
- On the simulator's sped-up link, the levels are stamped on its fast clock, so they come
  `50 × speed` ms apart. Only the demo is affected.

## D-051 — The inspection CLI: Node runs src/ as it is; a pure report and SVG charts

2026-10-05 · accepted · T1.15

`npm run analyze` (`scripts/analyze.mjs`, core in `src/core/inspect/`; ARCHITECTURE "Inspection
CLI").

- **Node runs the app's TypeScript itself.** From 22.18 Node strips the types, and
  `scripts/typescript.mjs` adds a resolve hook (`module.registerHooks`) for the extensionless
  imports Vite allows (`'./samples'`, and `'../model'` for its `index.ts`). `src/` uses only
  erasable syntax (`erasableSyntaxOnly`, `verbatimModuleSyntax`), which is what Node can strip.
  The analysis loads in about 0.2 s, with no build step and no dependency.
  - Rejected: Vite's `runnerImport`, which works but adds about 1.2 s of startup and is
    experimental; `tsx`, a new dependency; and a build step, one more output to keep in step.
  - The catch: syntax Node can't strip, or an import only Vite resolves (`?raw`, JSON, an
    alias), breaks the CLI and not the app. `scripts/analyze.test.mjs` runs the CLI in
    `npm run check`, so CI shows it.
- **The core is pure.** `inspect` turns export text into the report and the charts' SVG, and the
  shell reads and writes the files. It imports the simulator for `--simulate`. The app never
  imports it, so the bundle doesn't change.
- **The report**, per recording:
  - the `RecordingAnalysis` exactly as the derived cache keeps it (T1.14);
  - the pump detectors' diagnostics, which the cache leaves out: the vibration's noise step, the
    variance step at pump_off, and the regime change;
  - the shot matching, with each shot's anchor, source and dose;
  - the app events, one line each;
  - for a simulated recording, the truth and the analysis's error against it.

  JSON writes a number that isn't finite as a string, where `JSON.stringify` would hide it as
  null.
  - `RegimeChange` gained `weightG`, the knee fit's liquid at the knee, so that the chart draws
    the drain the analysis fitted. It is working data and the cached result doesn't hold it, so
    `ANALYSIS_VERSION` stays 1.
- **The charts**: one per recording and one per segment, SVG 1200 px wide. `--png` renders them
  at 1.5× with Playwright's Chromium for agents to Read.
  - A segment's panels:
    - the liquid: samples, the SG-smoothed liquid, and the drain model (the tail fit, else the
      regime change's knee);
    - the flow: the derived SG slope, the scale's own flow figure, and the drain model's flow;
    - the detrended variance on a log axis: the residuals about the smoothed liquid over 1 s,
      divided by 1 − c₀ (the SG fit's centre weight), so it estimates the noise variance as the
      detectors' levels do. Beside it, the quantisation's floor (q²/12) and the detectors' noise
      levels;
    - the sound levels (overall, and the 50 and 60 Hz combs) when there are `mic` frames.
  - The marks:
    - the five markers, labelled with their times and how they were found;
    - the simulator's truth, dotted;
    - the commands, by their sub-command byte (`07 tare + start`);
    - the annotations, in quotes;
    - other app events, dotted.
  - The span starts 5 s before the shot does: the baseline's end, pump_on, first_drip, a `07` tap
    up to 10 s before the window, or the true pump_on. Shot B's tap is what starts its window.
    It ends 8 s after the shot settles, or at the window's end when the cup comes off within
    15 s.
  - The recording's chart has the reading as sent and zero-tracked, the steps as glyphs (tare ◆,
    cup placed ▲, cup removed ▼, other ●), the shot windows shaded, and the events and markers.
  - Colours come from the dataviz skill's reference palette, checked with its validator. The
    series are blue, orange and aqua. The markers, in time order, are green, violet, red, yellow
    and magenta, and each neighbouring pair passes the colour-blind separation. Yellow and
    magenta fall below 3:1 contrast, so every mark carries a text label. Only the light theme,
    since these are diagnostic images.
- **The command line:** files, `--out`, `--png`, `--summary`, `--param stage.name=value`
  (checked by `resolveAnalysisParams`), `--simulate espresso|demo` and `--seed`. Stdout carries
  only the JSON or the summary; the messages go to stderr. It exits 2 on a bad command line, and
  1 on a file that can't be read or isn't an export.
- **What the charts showed at once**, for T1.16:
  - **Session 1's zero-tracked weight ends 13.2 g high** (22.9 g with the 9.7 g item on). At
    117.6 s pressing the scale's tare button loaded the platform by 13.1 g for 0.9 s. Then the
    tare and the release came in the same frame: one jump to 0. Zero-tracking took that for a
    tare of the 3.5 g reading, and kept the press. Shot metrics are net of each baseline, so they
    aren't affected. The absolute level is, and container recognition by mass needs it (T2.4).
  - In session 2, shot A's first liquid (268.0–270.3 s, while the scale was moved) is taken out
    as steps. So first_drip reads 270.32 s and the yield 39.0 g. The bean pour's bursts are
    taken out too, leaving 8.3 of its 17.7 g. Both are D-048 item 3.

## D-052 — Round 4: the brew flow with ambient context, live progress and the shot card

2026-10-05 · accepted (user) · supersedes parts of D-040 and D-041

The user restated the screens after the first hardware sessions; spec v2 "Brew phases", "Live
display" and "App structure and look" are rewritten to match.

- **Phases.** Beans, Grind, Extraction, Milk. Only the cup and the extraction are required for a
  shot; every other phase can be skipped, and a skipped phase is recorded as skipped. There are
  no phase switches in Setup any more: Milk exists when the recipe has a milk ratio.
- **Detection by container, cautiously.** A phase opens on a stable placement matching exactly
  one container. A lift is a pause, never an end. A phase ends only on evidence that the next
  one started: another known container, the grinder's sound, the bean cup returning at about
  the beans' weight minus retention, or a tap. Placing the cup doesn't start the extraction (the
  cup can wait on the scale, D-048); the pump start does. The container rules of D-041 stay
  (same weight = conflict, within 3 g = dismissible warning), now with four roles: bean cup,
  grind cup, cup, milk jug.
- **Sound.** The microphone tells grinding from brewing and finds the pump start; Setup
  calibrates it to the user's grinder and pump. Weight and taps work without it.
- **Ambient context.** Each phase shows its equipment with the last used as the default,
  changeable in place; a change becomes the default. Beans: machine, basket, pack. Grind:
  grinder and setting. Extraction: recipe. Milk: the recipe's milk ratio.
- **Live progress** towards the target on every pour: beans (the basket's size), extraction
  (dose × coffee ratio), milk (yield × milk ratio). Visual, display-only.
- **The shot card is the hub.** After the extraction it shows the phase rows (or "skipped"),
  the results, the grades and Save. Putting the milk jug down while it's open adds the milk.
- **Home** is the landing page: the scale's name, connection and battery; live weight with
  tap-to-tare (the whitelisted tare, `01`); which container is on the scale; the last shot;
  last week's count and averages; a maintenance reminder when one is due.
- **History**: rows with date and time, a small graph, the taste and the drink; the shot detail
  with a large graph and everything recorded; compare as an overlay with an "A Δ B" table.

## D-053 — Equipment as recorded context: machine and baskets, recipes, packs, maintenance dates

2026-10-05 · accepted (user) · supersedes D-044

- **Machine:** name, pressure (optional) and several baskets, each with an id and a size. The
  size is the beans target. Shots are distinguished by basket size for now; the id is stored so
  same-size baskets can be told apart later.
- **Grinders:** several, one default; brand, model, stepless or clicks, current setting. A
  setting changed on a shot becomes the default. Burr epochs are deferred.
- **Recipes:** name, coffee ratio, optional milk ratio (which makes it a milk drink and brings
  the milk phase). A prefilled list the user edits and extends. A recipe belongs to the
  extraction; it never changes the beans target.
- **Coffee packs:** brand, name or type, weight, roast date (required), open date, optional
  flavours, and an optional "would buy again" when finished. **No stock tracking:** no
  remaining estimate, no per-shot deduction, no reconcile. This drops a rule of the original
  spec ("Bean bags"), at the user's request: it adds little.
- **Maintenance:** three dates (descale, backflush, grinder care), "done" stamps today, an
  optional reminder interval. They are recorded on each shot and change nothing else. No
  learning windows.
- **No milk entity, no shot-settings screen, no field configurator (T2.8):** recipes and
  baskets carry the targets; few optional fields remain.
- **Every shot keeps a snapshot** of its context as values at brew time, next to the ids:
  date and time; the pack with its roast and open dates; machine, pressure, basket id and size;
  grinder and setting; recipe with both ratios; the three maintenance dates; each phase's
  result or "skipped"; the grades. Editing equipment later never rewrites history.

## D-054 — Grading: taste, channelling, tags; one nudge; no learning for now

2026-10-05 · accepted (user) · supersedes D-042 and D-043, and D-045's Q6 part

- **Grades:** taste (sour · balanced · bitter), channelling (yes/no, own field), tags (with
  defaults). Nothing required; a shot never graded keeps `null` grades. Dropped: the 1–10
  score, the taste triangle, strength, per-shot flavour notes, better/worse than last, the
  prefill-provenance list. Channelling is its own field again rather than a tag (it reverses
  D-045's Q6 answer), since the user wants it tracked.
- **Schema:** the existing `Shot.direction` (sour/balanced/bitter) and `Shot.channelled`
  (D-019) already fit. T1.18's planned swap to new grade fields is cancelled; what remains is
  adding the snapshot fields (D-053) in an export format version.
- **The nudge:** after a sour or bitter shot, the next brew with the same machine, grinder and
  pack says which way to grind, at the beans or grind phase. It repeats the user's own taste,
  needs no model, and is dismissible.
- **No learning for now:** no learned windows, step sizes, dial-in states, shot readings, data
  pointers or channelling detection. The data is collected in full (D-053), and learning can
  come later as a pure function of it over the whole history (hard rule 2).

## D-055 — Instrument is the only look; Crema dropped

2026-10-05 · accepted (user) · completes D-040's look choice

- The user dropped the Crema variation: only Instrument stays. D-040 already made Instrument
  the app's look; this removes what the mockups kept of the others for reference.
- **Mockups:** the boards in `design/ui-exploration/canvas/` lose the `look` tweak, the
  `.look-crema` theme rules and the Nunito font. The Crema copies (`B-*`) and the round-1
  `Crema-*`, `Native-*` and `Signal-*` style boards are gone from the canvas and the repo (git
  history keeps them). The three round-1 `Instrument-*` boards stay.
- **Mode:** each board's Mode tweak shows light or dark. The app itself follows the phone's
  setting (D-040); the mockups can't, so their former "auto" option is gone.
- Nothing changes for the app or its tasks: T1.18 already takes the `.look-instrument` tokens.

## D-056 — Context is internal: recorded, not shown

2026-10-05 · accepted (user) · refines D-052 and D-053

- The user: "context is an internal concept. We don't need to show it unless we want debugging
  capabilities during dev."
- The context is the per-shot snapshot (D-053): the pack and its dates, the machine and its
  pressure, the basket, the grinder and its setting, the recipe, the maintenance dates. Every
  shot still records all of it (spec v2 "What every shot records").
- The screens show what the user sets and what the shot did: the equipment pickers in each phase
  (D-052's ambient context, which is where the context gets set), the phase results with their
  targets, the metrics and the grades. The grind setting stays visible where it belongs to the
  grind phase (the detail's Grind row, the compare table), because it is what the user dials.
- Gone from the mockups: the shot card's Context section, the shot detail's Snapshot section,
  and the compare table's rows for what both shots share (basket, machine, pack). T1.18, T1.19,
  T2.2 and T2.3 say so.
- A skipped phase keeps its last-used equipment. With no grind phase, the shot records the
  grinder's current setting, and nothing on the shot card corrects it.
- A debug view may show the snapshot during development (for example behind `?debug`). It is
  never part of the normal screens.

## D-057 — The scale's mode: check it on connect, warn when it isn't the timer mode

2026-10-05 · accepted (the user's idea) · answers D-038's open UX question · its sign "a timer
that starts without a command" superseded, and checking again while it warns added, by D-073

- D-038: only the timer mode keeps the scale's timer in step with the app. The scale doesn't
  report its mode, but the wrong one shows. The user proposed a short check with a warning.
- **The check:** on connect, when the scale is idle (its timer at 0 and stopped, no shot under
  way), send `04` (start timer). If the timer advances within 0.5 s, the scale is in its timer
  mode, and `05` then `06` (stop, reset) put it back. If it doesn't, warn: the scale isn't in
  its timer mode; switch it on the scale. These are whitelisted commands (D-008), and the user
  proposed sending them. Nothing tries to change the mode (no command does; hard rule 5), and
  nothing calibrates (`0x09` stays forbidden).
- **Passive signs** give the same warning at any time: a timer that starts without a command,
  `03 0D` frames on FF12 (the automatic mode), or a manual start (`07`) whose timer doesn't
  start within 0.5 s.
- **Never during a shot.** A reconnect mid-shot (T1.21) mustn't stop or reset a running timer,
  so the active check runs only when the timer reads 0 and isn't running.
- **Display only.** The warning sits in the scale's status (Home, the probe) and clears once
  the timer behaves. The recording carries on regardless, and the check's commands and frames
  are in it like any others.
- The 0.5 s comes from D-038 (session 1). It is provisional until the user checks the warning
  on the phone (T1.25 ends as `verify`).

## D-058 — Real shots read right: the tap as pump_on, the scale's grid, steps inside a pour

2026-10-05 · accepted · T1.16, part 1 (D-048's items 1–4; Q4 is the user's)

The first part of T1.16 fixes what hardware session 2's two shots showed (D-048), as the
`it.fails` tests in `src/core/real-fixtures.test.ts` pinned. `ANALYSIS_VERSION` 2.

- **The scale's grid** (D-048 item 2; protocol notes finding 16). Every reading of sessions 1
  and 2, all 9,444, is the tenth held as a float32 in grams, times 100 in float32, truncated:
  `trunc(fround(fround(tenth / 10) × 100))`. So a tenth always reads the same way, and 35.1
  always comes as 35.09.
  - `readingGrid` finds the coarsest of 1, 0.5, 0.2, 0.1 and 0.05 g that every reading lies on
    within a hundredth (one reading in 1000 may stray). `snapToGrid` puts each such reading back
    on it, before zero-tracking (`Segmentation.readingGridG`). Raw stays as it was sent.
  - `quantisationStep` is the smallest change once snapped: 0.1 g for session 2, not 0.09. The
    stability tolerance follows: 0.1 g, so a reading flickering by one step holds still.
- **Anchors: firm stretches, 2 s together.** With the tolerance at 0.1 g, shot B's slow start
  held still for 1.3 s between its first drops (1.3 g from 557.3 to 558.6 s), long enough for
  an anchor under the old rule (one stretch of `minBaselineS`, 1 s). The shot window then
  started there, at 1.3 g.
  - Now a plateau is an anchor when its firm stretches (each lasting `FIRM_STRETCH_S`, 1 s)
    together last `minBaselineS`, now 2 s (`PROVISIONAL(U1.1: C3)`: longer pauses may turn up
    in slower shots). Noise can split a long stretch, which is why they add up; the vibration's
    short fragments never count, as before.
  - Before a real shot the level holds much longer: the cup's wait, then the pre-infusion,
    which shows no vibration (3.3–3.7 s on this machine).
- **Steps inside a pour** (item 3). Shot A's scale was moved as its first liquid landed, and
  the readings swung between −57 and +30 g for 2 s. That became two other steps (+3.5 and
  +4.7 g, the flow during them), taken off the yield. The bean pour's first burst likewise.
  - **A shot's rise keeps a change over several jumps** (`pourStep`, `Step.jumps`): the pour
    landing in bursts, or the scale or cup moved while it runs. Its readings are left out of the
    liquid and nothing is taken off (`WindowLiquid.pourSteps`, flag `pour-disturbed`).
  - **One jump is something set down** (a spoon, a sugar cube), taken out as before
    (`other-steps`). The window's `riseEndT` (the plateau the rise reaches, else the window's
    end) bounds the rise: after it, any step is taken out.
  - **Whether there is a pour at all is judged net of every step.** Under the first version of
    this rule, session 1's item (9.6 g, several jumps as a hand set it down) and a 13 g press
    made a "shot" of 11.9 g. A window still needs `minRiseG` over `minRiseS` with every other
    step taken off; only its liquid keeps the pour's own steps.
  - Rejected: telling a disturbance by its swing beyond the levels either side. The bean burst
    overshoots by less than its own size, and a cup set down with a bounce can overshoot more.
- **Transients** (`Segmentation.transients`). A transition whose net change is under `minStepG`
  (a knock, a push, the surf's lift) was no step, and its readings stayed in the liquid: a
  simulated −60 g push for 1.5 s just after the first drip made first_drip 2 s late or lost
  the window. Its span is now kept, and its readings are left out like a step's. A push that
  lingers at its deepest breaks into two runs of jumps, each vessel-sized; runs at most two
  quiet samples apart whose changes cancel are taken as one (`REVERSAL_GAP_SAMPLES`). A cup
  lifted and put back a second later stays two vessel steps.
  - The pump_on split leaves out the samples next to such a gap, as it did a knock's neighbours.
- **first_drip across a gap.** Readings left out (NaN on the grid) counted as 0 in the CUSUM,
  which emptied the sum and put the change point at the gap's end: shot A's drip read 270.32 s.
  The CUSUM now skips them, and the rise fit looks back `riseLookbackS` from the last reading
  before the change point. Shot A's first drip reads 267.97 s; the readings put it at about
  267.95 s.
- **pump_on from the tap** (item 1; Q4, the user's answer in D-048). `manualStartTimes` takes
  the `manual-start` UI action (T1.18's tap) and every Tare + start (`07`) but the live
  pipeline's own `auto-tare` (T1.17, sent as the cup settles). Starts within `SAME_TAP_S` (1 s)
  of the one before are one tap, at its time: the capture flow logs the tap, then its `07`.
  - The pump markers take the variance's onset when the vibration shows; else the last manual
    start at most `manualStartS` (15 s, `PROVISIONAL(U1.1: C3)`) before the first drip, flagged
    `manual-pump-on`. The cached marker says which: `pumpOn.source` is `variance` or `manual`.
  - Event times are the recording's clock, as tares are read: within the link's latency (tens
    of ms) of the timeline, far less than the tap's human latency.
  - `no-vibration` stays on every real shot: it says the variance found nothing, and that
    pump_off came from the regime change.
- **The espresso test** (item 4) is unchanged (D-047: a pump_on, or a pump_off with a tail
  fit). With the taps, both real shots pass it; the bean pour has neither and doesn't.
- **Session 2, before and after:**

  | | before (version 1) | after |
  | --- | --- | --- |
  | quantum | 0.09 g | 0.1 g |
  | beans | 8.3 g | 17.7 g |
  | shot A | yield 39.0 g, first_drip 270.32 s, not espresso | 47.3 g, 267.97 s, pump_on the tap (264.73 s): first-drip time 3.24 s, total 11.56 s |
  | shot B | 35.3 g, not espresso | 35.3 g, pump_on the tap (551.08 s): first-drip time 3.40 s, total 35.67 s |

  Shot B's yield still reads 0.2 g high (its baseline sits in the pump's dip) and its first
  drip 0.27 s early: D-048 items 5 and 6, the next part of T1.16.
- **Schema of the cached result** (derived, so a version bump and no migration): `Step.jumps`,
  `SegmentWindow.riseEndT`, `pumpOn.source`, and the flags `manual-pump-on` and
  `pour-disturbed`.
- The simulator's tests keep their scales (D-046); the new cases (the tap, a pause in a slow
  start, things set down, a lingering push, a gap at the drip) are tested on it at 0.1 g
  without vibration, as the real scale is.

## D-059 — The yields from before the pump, the drain from the knee, the simulator to session 2

2026-10-05 · accepted · T1.16, part 2 (D-048's items 5–8) · revises D-021's defaults

The second part of T1.16. `ANALYSIS_VERSION` 3.

- **The yields from the stable level before the pump** (item 5; spec "Schema rules": "the stable
  value before the pump"). Shot B's reading dipped from 0.0 to −0.2 g 0.3 s after the tap and
  held there until the first drip, so a yield from the window's baseline, in the dip, read 0.2 g
  high.
  - `shotMarkers` finds first_drip on the window's baseline, the level the pre-infusion holds.
    Once pump_on is known and comes before that baseline's end, `prePumpBaseline` takes the
    last `baselineS` of readings up to pump_on, from the stable stretch that holds pump_on or
    ends within `stableSpanS` of it, in the cup's interval, with no step between. The liquid
    markers measure from it; `ShotMarkers.window` is the window with that baseline, and the
    cached segment's.
  - Without a dip the two agree. Without the pump's vibration the window's baseline also runs
    past the first drops (D-034); the level before the pump doesn't.
  - **A tare zeroes**: a logged tare's step must land nearer 0 than it started. The dip came
    0.28 s after a Tare + start, inside `tareSearchS`, and in the simulator, where it came in one
    jump, it was taken for a quiet tare of the reading at 0.
  - **The hand on the cup.** Grabbing shot B's cup pressed it 0.5 g down before the lift, and
    the honest yield read 35.5 g. A vessel's run now takes in a reading already off the level
    either way (the lead-in, D-035), not only in the lift's direction: 35.1 g.
  - The plateau the window ends on counts stretches that start inside the window, cut at its
    end: the readings after a lift's last one are interpolated towards it, and a stretch can
    reach a grid sample past it.
- **first_drip** (item 6). Shot B's first drops came as lumps of about 0.2 g (−0.2 → 0.0 g, held
  0.4 s, then 0.2 g more), then a stream the 0.1 g readings follow smoothly. Fitted to 1.5 g,
  a line through that reached back 0.27 s.
  - The analysis's `dropG` is 0.2 g (the half lump the rise model starts with) and `riseFitG`
    1 g. Shot B reads 554.74 s, against 554.68–554.78 s in the readings; shot A 267.99 s, against
    about 267.95 s.
  - On the simulator `riseFitG` 1.5 g did a little better (p90 0.05 against 0.06 s); the real
    shot decides.
- **The drain from the knee** (item 7). The user's machine drains with τ 0.18 s (shot B) and
  0.27 s (shot A), by a knee fit with no floor on τ: over within a second, before a 0.5 s
  Savitzky–Golay window of the flow fits in, so the ln(flow) fit refused every real shot
  (`tail-too-short`). The knee that found pump_off (`knee.ts`) has the drain in the weight.
  - `KNEE_TAU_MIN_S` is 0.05 s (half a sample: as good as a step), not 0.2 s, on 57 grid points
    (about 10% apart).
  - `PumpMarkers.drain` is the drain of the detector that gave pump_off (`VarianceStep` now has
    τ, flow and weight too). `shotMarkers` moves its weight onto the yields' baseline.
  - **w(pump_off)** is the knee's weight at pump_off when there is a drain. The parabola through
    the second after pump_off (D-035) assumed a slow drain: with τ 0.2 s most of the tail has
    landed by then, and it read 0.21 g high.
  - **The tail**: the ln(flow) fit when it works (`source: flow`), else, when the flow is too
    short or doesn't fall, the knee's drain (`drainTail`, `source: knee`, R² null): τ, the flow at
    pump_off, and w_final = w + flow·τ, if τ reaches `minDrainTauS` (0.1 s,
    `PROVISIONAL(U1.1: C3)`). Shots A and B: τ 0.28 and 0.18 s, w_final 47.3 and 35.1 g.
  - A pour that stops at once sits on τ's floor: simulated, 0.050–0.081 s over 30 pours, where
    drains of τ 0.2 s gave 0.105–0.223 s. So D-047's espresso test (a pump_on, or a pump_off
    with a draining tail) still holds without a tap, 98 shots in 100. Drains of τ 0.15 s overlap
    the pours; the tap, which every capture-flow shot has, decides those.
- **The simulator to session 2** (item 8; D-021's defaults):
  - no vibration (`vibrationSigmaG` 0, A2);
  - a drain with τ 200 ms (`DEFAULT_SHOT_PARAMS.tailTauMs`);
  - each reading sent as the scale does: the tenth as a float32, times 100, truncated (D-058),
    which matches the real rule for every tenth from −500 to 500 g;
  - a first lump: `ShotParams.firstDropG`, 0.2 g (`PROVISIONAL(U1.1: C3)`), lands at first_drip,
    and the stream's drops (`dropG`, 0.05 g) resume once the stream has caught up. Drops of
    0.2 g throughout, the first try, made the stream a staircase the real readings don't show,
    put pump_off 0.08 s late and left the tail one or two drops;
  - `espressoScenario({ manualStartMs })` adds the tap with the pump, and the CLI's
    `--simulate espresso` uses it at the pump's 7 s.
  - The tests of the agreed targets keep their world (D-046): `AGREED_SCALE` (0.01 g, the
    vibration, 0.05 g drops), `AGREED_SHOT` (τ 1.5 s, no lump) and `AGREED_LIQUID` (the analysis
    told of 0.05 g drops and the 1.5 g rise fit). The variance detector's tests keep
    `VIBRATING_SCALE`, `SLOW_DRAIN_SHOT` and `VIBRATING_LIQUID` on purpose.
- **Measured on the simulator's new defaults**, 100 seeds, the tap at pump_on:

  | | median | 90% | worst | bias |
  | --- | --- | --- | --- | --- |
  | first_drip | 0.035 s | 0.072 s | 0.091 s | 0.033 s late |
  | pump_off | 0.030 s | 0.076 s | 0.117 s | 0.026 s late |
  | first-drip time (tap → drip) | 0.049 s | 0.082 s | 0.106 s | |
  | extraction | 0.025 s | 0.070 s | 0.101 s | |
  | total | 0.041 s | 0.089 s | 0.132 s | |
  | average flow | 0.1% | 0.3% | 0.5% | |
  | w(pump_off) | 0.044 g | 0.113 g | 0.179 g | |
  | yield, honest yield | 0.001 g | | 0.002 g | |
  | τ (98 of 100) | 19% | 34% | 47% | 19% short |

  - The cup lifted 1 s after pump_off: the same markers; the honest yield 0.064 g high on
    average, at worst 0.08 g; 2 shots in 100 without a yield, their knee's τ under 0.1 s.
  - Without the tap the same, but the first-drip time and the total are null, and 98 shots in
    100 are espresso.
  - **τ reads short** because the shot's last partial drop never lands: the truth's τ is the
    continuous stream's, and the cup gets whole drops. At 0.01 g without drops it is unbiased
    (90% within 7%). At 0.1 g a drain of τ 0.2 s is two samples and two or three readings: ±50%
    is what the data holds.
- **Limits found:**
  - A tare during the first half second after pump_off is measured through the drain's curve:
    up to 0.3 g off (0.05 g a second later).
  - With the scale's smoothing left on (the demo, outside the recorder), each first lump smears
    into the window's baseline: up to 0.15 g.
  - The probe shows readings as sent, so its smallest step reads 0.09 g on the real scale.

## D-060 — The accuracy targets for the real scale

2026-10-05 · accepted (user) · T1.16 · supersedes D-035's and D-036's targets, and D-047's
tolerances, for the real scale

D-035 and D-036 set statistical targets on a simulated scale with 0.01 g steps and the pump's
vibration. The real scale reads in 0.1 g steps and shows no vibration, pump_on is the user's
Tare + start tap (Q4, D-048), and the drip stops within a second (D-059). On the simulator
brought to session 2 (D-059's table), the analysis lands much closer than those targets asked,
so the user re-agreed them.

- **Asked** (2026-10-05) with three choices: targets with headroom (about 1.5 times what was
  measured), tight ones at what was measured, or every marker within 0.2 s. **The user chose
  headroom.**
- **The targets**, over 100 simulated shots on the simulator's defaults, each tapped at
  pump_on; the cup lifted 30 s after the pump stops, and again 1 s after:
  - first_drip: the median error within 0.05 s, 90% within 0.1 s, every one within 0.15 s, and
    the median signed error within 0.05 s;
  - pump_off: the same, with every one within 0.2 s;
  - the first-drip time within 0.15 s; the extraction and the total within 0.2 s;
  - the yield within 0.05 g, the honest yield within 0.1 g, w(pump_off) within 0.25 g, the
    average flow within 2%;
  - none for τ: 0.1 g readings of a drain with τ 0.2 s hold it to about ±50%. It only moves the
    extrapolated yield of a cup lifted before the drain is over, and the tail is 0.3 g;
  - none for pump_on: it is the tap, so its timing is the user's.
- **Measured**, at worst: first_drip 0.091 s, pump_off 0.117 s, the first-drip time 0.106 s,
  the extraction 0.126 s, the total 0.132 s, the yield 0.031 g, the honest yield 0.080 g,
  w(pump_off) 0.194 g, the flow 0.5% (D-059 has the medians).
- **Tests:** `src/core/analysis/targets.test.ts` holds the analysis to these, through
  `analyzeRaw` as the app runs it. The tests of D-035's and D-036's targets keep their world
  (`AGREED_SCALE`, `AGREED_SHOT`, `AGREED_LIQUID`) as regression tests, and the variance
  detector's keep the vibration (`VIBRATING_SCALE`), for a scale or a machine where it shows.
- More real shots (C3) can show the simulator wrong. Then bring the simulator to them, measure
  again, and ask the user before moving these targets.

## D-061 — The tare button's press, and where a run's lead-in looks

2026-10-05 · accepted · T1.16 (D-051's finding) · revises D-034's zero-tracking

- **The press on the tare button.** The Mini's buttons are on the platform, so a press weighs
  on it until it's let go, when the scale tares. In session 1 a press put 13.1 g on for 0.9 s,
  then the release and the tare came in one frame: a single jump from the press's level to 0.
  Zero-tracking took that for a tare of the 3.5 g reading, so every later level read 13.1 g
  high (D-051).
  - Now a jump to 0 (a tare with no command) that comes at most `pressTareS` (2 s,
    `PROVISIONAL(U1.1: C4)`) after a step up of one jump, with nothing between, is that press
    let go and its tare. The tare is measured from the level before the press to the one after
    it, at the tare. Its step runs from the press on (`jumps` 2), and the press is a transient,
    so a shot's liquid leaves its readings out.
  - Session 1's levels now hold through every tare: the empty platform reads 0 and the item
    9.6 g after the press, as before it.
  - A press is one jump in the data: real vessels went on in 4 to 14 (both sessions), so a cup
    set down isn't taken for one. A press held longer than `pressTareS`, or one released a frame
    before the tare, isn't joined: the latter needs nothing (a step down, then a tare of the
    level without the press). A press so short that it falls into the tare's own run is a run
    of two jumps that isn't a tare: untested, C4 will tell.
- **The simulator** (D-021): `tare-button` takes `pressG` and `pressMs`. The press weighs from
  `pressMs` before the button is let go until the scale tares, once its next frame is out, as
  S1's did. Without them nothing weighs, as before.
- **Where a run's lead-in looks** (D-035, D-059). Measuring the tare from before the press
  showed two flaws in the levels either side of a run:
  - The lead-in (a sample already off the level before a run joins it) fitted that level from
    the run before's last jump on, a sample often still settling, so the line tilted and missed
    the lead-in: the press's first sample, 0.1 g off. The lead-out now runs first, and the
    lead-in fits after it.
  - A run under a vessel's size looked for its lead-in the way its net change went. A knock or
    a press that comes back has none to speak of, so it looked the wrong way about half the
    time: a 0.5 g lead-in before session 1's presses at 119.1 s stayed in the tare's level
    before it, 0.11 g off. Such a run now looks the way its first jump goes.
  - The session 2 steps are unchanged; session 1's one press of 1.6 g (245.3 s) is a
    transient now, as the presses around it.

## D-062 — A knock at a tare

2026-10-05 · accepted · T1.16 (D-046's finding) · revises D-034's and D-061's transitions

D-046 found that a knock within about half a second after a tare could lose the shot window.
Measured on the simulator's defaults (a knock of 3 g for 0.2 s, 40 seeds, the app's tare at
5 s), it was worse: a knock 0–0.3 s after the tare lost the window in nearly every shot, 12 in
40 at 0.4 s, and a few even 1 s after. Three things went wrong:

- **A knock looked like the button's tare.** It rose by less than a jump a sample (0 → 1.4 →
  2.6 g at 10 Hz, under the 1.5 g that makes a jump) and fell back to 0 in one jump: a single
  jump to 0. Its level then tilted the real tare's, which landed 0.51 g off 0 and read as a cup
  lifted.
- **A knock in the tare's own run** made a run of two or three jumps, which a logged tare never
  took.
- **A knock during the tare** is zeroed with the cup, so once it's over the reading lands off 0
  by its force (−2.6 g), past `tareZeroG`.

What changed:

- **Samples faster than liquid** (more than `maxFlowGps` allows, plus a quarter of `jumpG`;
  0.75 g a sample at 10 Hz) join a run as its lead-in or lead-out, though under a jump. Before,
  only samples statistically off the level did, and a level of one or two samples (a knock right
  after a tare) can't say that.
- **Runs that then touch merge**: a knock rising right after a tare is one change with it.
- **A logged tare takes a run of several jumps** when its largest makes up 80% of the run's
  change (`TARE_JUMP_SHARE`): a vessel settles out over several jumps, none near that. It
  **lands off 0** by as much as the reading had moved off the level just before its jump: the
  knock it zeroed. Its run, but for its own jump, is a transient.
- **Every tare applies from the sample after its own jump** (`tareJumpAt`), wherever its run
  ends, so the lead-out now runs on runs that land on 0 too: before, it couldn't, or the
  correction would start late and leave a spike of the tare's size.
- The lead-in still looks one way for runs under a vessel's size (D-061): tried either way, a
  line through a cup still settling took a sample off the other side.
- **Measured**: no window lost at any knock time from 0 to 1 s after the tare, 40 seeds each.
  On the agreed scale 2 in 320 are lost, with the steps right: under the pump's vibration the
  baseline ends at pump_on, and a knock in the 2 s between the usual tare and the pump leaves no
  stable stretch of 1 s. The real scale shows no vibration, so its baseline runs on.
- **Left**: a knock during the tare leaves the zero between tenths, and the first 0.2 g of a
  knock two samples after a tare can't be told from the level: up to 0.09 g on absolute levels.
- **The real recordings**: no metric changed. Session 1's item now reads 9.60 g (9.66 g: its
  settling taken in), session 2's first bean burst ends 0.2 s later, and a hand's grab before
  the dosing cup's lift at 119 s starts the lift a sample earlier.

## D-063 — The frames between the timer's runs on the scale's sample grid

2026-10-05 · accepted · T1.16 (D-032's open question, settled by D-037)

D-037 found that the Mini samples every 100 ms of its own clock whether or not its timer runs,
and that its arrivals sit on that grid, late by a connection event (−22 to +119 ms) and lost
never. Only frames inside a timer run were timed by it; the rest, most of a recording, took
their arrival less the median delay, so each could be up to a period off, and a stall's burst
shared one time.

- **The grid.** Each stretch of frames between runs is timed as samples: `t = offset + period ×
  k` for its k-th frame (`timeSource: 'grid'`).
  - The period is the runs' (the fitted rate times the timer's tick) when the rate is fitted;
    else the stretches' own, the slope of arrival against frame number over each whole stretch
    (`robustSlope`, which trims stalls).
  - The offset puts the line under every frame of the part, touching the fastest: the device
    runs' footing (D-006), so both kinds of time agree to a few ms.
- **Cuts.** A lost frame would put every later frame of the stretch a period off. A stretch is
  cut at an arrival gap over 1.5 periods (`GRID_GAP_PERIODS`), and where the least delay of the
  frames after rises by three quarters of a period over the least of those before, at least 5
  frames on (a frame lost behind a late one). A part under 10 frames (`GRID_MIN_FRAMES`) keeps
  its arrival time.
- **The guard.** A part whose frames wait more than half a period at the 75th percentile keeps
  its arrival times: its arrivals drift or saw about the grid, as frequent lost frames would
  make them. On the real link three in four wait under 30 ms.
- **Measured** on the simulator, without the timer: within 3.5 ms of the sample, but for one
  constant, on the default link, where the arrivals spread over 100 ms; 13 ms with ±50 ms of
  exponential jitter (225 ms); 21 ms with 2% stalls (385 ms), 60–80% of frames on the grid
  there. The period from the stretches comes within 0.005 ms of the truth: fitted over the cut
  parts instead, it came out 0.1–0.3% short, a long gap tending to follow an early frame and
  precede a late one.
- **On the real recordings**: session 2's 5,095 frames outside the shots' timer runs are all on
  the grid, at 100.70 ms, late by a median of 16.5 ms and 31 ms at p95, as the timer's frames
  are. No metric moved by more than 0.01 s.
- **Limits**: frequent lost frames without a timer run tilt the stretches' period (1% lost: 1.6%
  long); the guard then keeps most of them on arrival time, no worse than before. The link has
  lost none.
- The two shots into one cup (D-047): timed by arrival, the first shot's settled came out inside
  the next one's pre-infusion in 3 of 180 simulated recordings; on the grid, in none.

## D-064 — The D-029 pass: what sessions 1 and 2 settled, and what stays provisional

2026-10-05 · accepted · T1.16 (closes it) · D-029

T1.16 went through every `PROVISIONAL(` value against the two sessions (D-037, D-048).

- **Settled, the marker removed and the evidence cited at the value:**
  - `DEFAULT_MIN_FIT_SPAN_MS` 30 s → **3 s** (A1). The 30 s came from a guessed drift of
    300 ppm. The Mini's clock runs 0.69% slow, so a timer run left at rate 1 drifts 69 ms over
    20 s, and fitted 2 ms; a fit helps from about 3 s (simulated with session 1's link). It
    changes only recordings whose runs total under 30 s: both sessions' total over 70 s.
    `ANALYSIS_VERSION` 7.
  - `DEFAULT_MAX_DRIFT_PPM` 2% (A1): the Mini's −6,940 ppm is well inside.
  - `stableRangeG` 0.05 g and `stableQuantisationSteps` 1 (A11): 0.1 g readings that hold still
    at rest, so the band is one step.
  - `jumpG` 1 g (A2): no vibration, and real shots flow at most 5.5 g/s.
  - `tareSearchS` 0.5 s (A5): a tare shows 0.09–0.18 s after its command is logged.
  - `sgWindowS` 0.5 s (A1): five samples at 100.7 ms. Drains too fast for it go to the knee
    (D-059).
  - `vibrationRatio`, `vibrationEvidence` and `disagreementS` (A2): the Mini shows no vibration,
    so no hardware test can tune them here. They stay as set on the simulator (D-036), for a
    scale or a machine where it shows.
- **Still provisional** (more of the same tests settles them): `settleS` and the simulator's
  `settleTauMs` (C2); `tareZeroG` and `pressTareS` (C4); `minBaselineS`, `riseFitG`, `dropG`,
  `tailFlowSigmas`, `minDrainTauS`, `maxDrainTauS`, `regimeEvidence`, `manualStartS`, and the
  simulator's `dropG` and `firstDropG` (C3: two shots so far); `tailMinSpanS` and `minTailS`
  (C5); the simulator's `commandLatencyMs` (A5: the log only shows the acknowledgement),
  `smoothingTauMs` (A13) and `AUTOMATIC_MODE` (A4).
- **The rest of T1.16's list:**
  - T1.13's detector choice (A2): the regime change gives pump_off, the tap pump_on (Q4,
    D-048); the variance detector stays for a vibrating scale (D-046).
  - The targets: re-agreed (D-060).
  - `MATCH_SLACK_S` (10 s) moves to T1.18, which decides where live shots anchor; post-hoc
    shots anchor at the tap.
  - "Shot done": the analysis has pump_off and the yield 1 s after the pump stops in 40 and 39
    shots of 40 (simulated, with the tap), all 40 from 3 s. A note for T1.18.
  - T1.21 against B3: B3 has no result yet; T1.21 checks it when it does.
  - `verify` tasks: T1.8 (the probe) is done, run on the phone in both sessions. T1.20 waits on
    U1.2, T1.24 on the next session.

## D-065 — The live pipeline: a weight signal and a shot monitor; only the tap starts a shot

2026-10-05 · accepted · T1.17

The live display's pipeline, in `src/core/live`: `LiveWeight` makes each reading fit to show, and
`ShotMonitor` runs the shot's display states on top of it. It is display-only (hard rule 3):
nothing is stored, and the analysis reads the shot right whatever the display did.

- **Its inputs are the recording's**, as the probe's monitor takes them: every frame with its
  decoding, and every app event (`recorder.onFrame`, `onEvent`), on the recording's timeline.
  The log says which tares to expect and when the pump started. Both pipelines read it by the
  same rules, so `AUTO_TARE_REASON`, `MANUAL_START`, `isManualStart` and `isTareCommand` move to
  `src/core/model`. The analysis's outputs don't change.
- **`LiveWeight`:**
  - *The zero across the app's tares.* A tare the app asked for or sent shows as the reading
    landing on 0 in one step, clear of the noise, from the level the scale read when the tare was
    asked for (the mean of the last half second), within 1 s. The zero then takes the step, so the
    weight doesn't move. A tare asked for at about 0 has nothing to show, so nothing is looked for:
    the cup is already tared at the Tare + start tap. A tare that never lands leaves the zero alone:
    the scale may be in another mode (D-038).
  - *Jumps.* A change between readings of more than 1 g + 5 g/s × the gap disturbs the signal
    until 0.5 s pass without one. The smoothed weight holds its value, and the flow leaves the
    jump out. That covers shot A's moved scale (−57 to +30 g for 2 s) and the surf's lifted scale
    (−400 g for 1.5 s), which is never stable, so nothing is decided during it.
  - *The smoothed weight* is an EMA (τ 0.4 s) plus its own lag on a steady pour. The lag follows
    the EMA's recursion, lag ← (1 − α)(lag + dt), so it is right from the first reading after a
    reseed. Remaining-to-target then reads 0 at the target, instead of trailing a pour by 0.35 s.
  - *The flow* is the least-squares slope over the last second of undisturbed readings.
  - *Noise* is the σ from the MAD of the steps between readings. Neither a steady pour nor a single
    drop moves it, and it is 0 on the real scale. A tare's step and a first drip must stand 4σ
    clear of it. That matters only on a scale or machine whose pump shakes the readings: there,
    vibration faked first drips in a quarter of the simulated shots, and tares too.
  - *Stability* is the spec's test. The 0.05 g band is widened to one 0.1 g step, as in the
    analysis, plus a hundredth for the tenths sent short (D-058).
- **`ShotMonitor`:** idle → ready (a vessel of at least 20 g put on and stable; the arm-once tare
  fires) → running (the tap) → tail (the flow falls away) → done (stable). A cup removed after
  the first drip also ends the shot. "Shot done" comes once per shot, with its reason.
  - **Only the tap starts a shot**, and T3.1's microphone later. Spec v2 says the cup can wait
    and the pump start opens the extraction. A trial that let liquid start a shot without a tap
    read session 2's bean pours and the grounds falling into the dosing cup as three shots, so it
    was dropped. While ready, the net weight and the progress show anyway.
  - The tap re-zeroes the net weight at the level of the last half second, because the yield is
    what comes after the pump starts, as the analysis measures it (D-059). If the weight is moving
    at the tap, the first stable reading sets the level instead.
  - **The first drip** is two readings running at least 0.15 g above the level before them
    (session 2's first lumps were 0.2 g). None counts within 1 s of the tap: water fills the group
    first, and the real shots took 3.3 and 3.7 s. The level before follows the stable readings
    after the tap, so shot B's −0.2 g dip becomes its baseline.
  - **The tail** starts once 5 g have poured, the pour has reached 0.5 g/s, and the flow falls
    below a quarter of its fastest. It goes back to running above half (a dip). Shot B's slow
    start held still for 0.6 s at 1 g, and without the 5 g it was "done" 30 s early. **Pump off**
    (the live one) is the knee of a hinge fitted to the last 2 s. It lands about τ into the drain.
  - **A tap with no first drip within 15 s** (the analysis's `manualStartS`) wasn't the pump, and
    the view goes back to waiting, quietly: D-049's rule, applied to the tap. Session 1's three
    probe `07`s, with no shot, do this.
  - **A lift is a pause** (spec v2): a cup lifted after its shot and put back within 2 g of the
    level it left is the same cup, so there is no tare and the shot stays. Any other vessel is a
    new cup, and gets a tare.
  - **Re-arming** happens when the cup comes off, before or after its shot, and on `reset()`,
    which tares what is on the scale now.
- **Measured** (`npm test`; 20–200 simulated shots each, the tap made 0.15 s late):
  - one tare per shot, as the cup settles (about 1.2 s after it goes on), and never at the tail;
  - remaining-to-target −0.25 to +0.05 g at the target (the crossing frame can be 0.2 g past it);
  - the first drip 0.02–0.14 s after the truth (arrival times); the live pump_off 0.14–0.29 s
    late (into the drain); "shot done" 0.93–1.21 s after the pump stops;
  - with a slow drain (τ 1.5 s), pump_off about 2.2 s late and done about 2.9 s after the pump
    stops; the analysis times it afterwards;
  - on a vibrating 0.01 g scale, no false first drip, and the first drip up to 1.4 s late;
  - in the flow-rate mode, which ignores `07`, no tare is taken and remaining still reads right.
    In the automatic mode the scale tares the cup itself before it settles, so no cup is seen,
    but the tap still runs the shot;
  - session 2 replayed: one tare per placement (7 in all), no shot from the beans or the
    grounds, and both shots followed from their taps. The first drips are within 0.1 s of the
    analysis's, pump_off within 0.3 s of the readings', and shot B shows 35.1 g at done.
    Session 1: no shot.
- **Lint:** `src/core/live` may not import `src/core/analysis` either (D-010). The architecture
  table already said so. `boundaries.test.ts` runs ESLint on files that would cross, both ways.
- **Left to the user (Q9):** the auto-tare's command and the scale's own timer. The monitor asks
  for "a tare", and the app sends it (T1.18).

## D-066 — The scale's timer runs from the tap to "shot done": a plain tare at the cup

2026-10-05 · accepted (user) · answers Q9; refines D-065

The question (Q9): T1.17's plan had the auto-tare send `07` (tare and start timer) as the cup
settles. That starts the scale's own timer then, up to a minute before the pump. The Tare + start
tap at the pump can't restart it, because `07` starts only a timer stopped at 0 (D-037). Nothing
stopped it after the shot either.

- **The user's answer, (a):** the cup's tare is a plain tare (`01`), so the tap's `07` starts the
  scale's timer with the pump. The app stops and resets the timer between shots. That is what the
  user did by hand in hardware session 2: Tare after placing shot B's vessel, Tare + start with the
  pump, then stop and reset after the shot.
- **What the app sends** (`scaleCommandsFor` in `src/core/live`, beside the monitor; T1.18 wires
  it):
  - **when the cup settles** (the monitor's `tare`): `05`, `06`, `01`, each logged with
    `AUTO_TARE_REASON`. `06` zeroes only a stopped timer, so the `05` comes first in case
    something left it running; on a stopped timer it does nothing;
  - **at "shot done"**: `05`, logged `shot-done`. The scale then shows the shot's time until
    the next cup;
  - **after a tap that lapsed**: `05` and `06`, logged `pump-lapsed`, so the next tap starts the
    timer from 0. The monitor now says so with a `pump-lapsed` event, when a tap has had no
    liquid within 15 s;
  - **the tap itself** stays the capture flow's: a `manual-start` UI action, then `07`.

  All are whitelisted commands (D-008), and the user approved sending them this way.
- **Checked on the simulator,** over two shots and after a lapsed tap: each cup's tare zeroes the
  stopped timer, each tap starts it from 0 within 0.5 s, and each "shot done" stops it at the
  shot's time (to 0.6 s, on the scale's slow clock). The live display's figures are unchanged.
- **The other modes** (D-038, D-057): a plain tare works where `07` didn't. The simulator's
  flow-rate mode takes it, as session 1's tare command at 126.4 s did outside the timer mode.
  In the automatic mode, `05` ends the scale's own run and zeroes its weight (session 1), so the
  live net weight drops at "shot done" there. T1.25 warns about that mode anyway.
- **Unchanged:** `isManualStart` still leaves out a `07` logged as the auto-tare, for older logs
  and the simulator's scripts. `espressoScenario`'s scripted tare (`tareAndStartMs`) stays a
  `07`, because the analysis's simulated tests are agreed on it (D-060).

## D-067 — The brew flow: the dose on the extraction screen, the tags, and what the flow does

2026-10-05 · accepted (the dose and the tags: the user) · T1.18

The brew flow (`#/brew`) comes before the phases and entities it will later lean on (T2.1–T2.11),
so T1.18 needed stand-ins. The user chose two of them:

- **The dose** (asked): nothing weighs it until the beans and grind phases exist (T2.6, T2.7), and
  there is no basket size until T2.1. The target line ("18.0 g × 2") has a tappable dose with
  ±0.1 g steps (hold to repeat), last used kept as the default (`lastUsed.doseG` in `kv`, 18 g
  before the first change, 5–30 g). It is saved on the shot as its `doseG`; the phases replace it
  later (spec v2: ground, else beans, else the basket's size).
- **The tags** (asked): the design's list (WDT, Puck screen, RDT, Paper filter, Warm-up < 15 min,
  New basket, Experiment), with WDT and Puck screen on by default for every new shot, as drawn.
  "Add" on the shot card adds a tag, off by default, to the list (`tags` in `kv`). T2.1 moves
  the list into Tag entities, and T2.9's Setup edits the defaults.

Decided here, for the same gap:

- **The recipes** are spec v2's prefilled list (Ristretto 1:1.5 … Latte 1:2 + milk 1:6), fixed
  until T2.1 makes them entities. The last used is the default (`lastUsed.recipe`, by name;
  Espresso before the first pick). The picker's "+ New recipe" waits for T2.1/T2.9. A shot
  records the recipe's name and both ratios; `recipeId` stays null.
- **Settings are conveniences** (`BrewPreferences`): a malformed or missing value reads as its
  default, a change applies at once and is stored behind it, and a failed write shows on the
  screen and is retried by the next change. They travel in a full export, as settings do (D-025).

What the flow does (`src/app/brew-flow.ts`, one per link, kept for the app's lifetime):

- **Only while its screen is shown** (`attach()`) does it answer the live shot: the scale's
  commands for the monitor's events (`scaleCommandsFor`, D-066) and "shot done". The probe never
  attaches, so a cup put on there is never tared behind the user's back during hardware tests.
  The live shot itself (`LiveShot`, a `ShotMonitor` per link) is fed from the link's first use,
  so a cup put on before the screen opened is still seen.
- **The tap** is `logUiAction('manual-start')`, then `07` with that reason (T1.6, D-048).
- **"Shot done"** stores the live shot at once, anchored at the event's time (inside the shot,
  D-047), with the dose, the recipe and the default tags. Then it flushes the recorder and
  analyses the recording so far, and again 3 s and 10 s later as the tail settles (T1.16: a cut
  1 s after the pump stops gives pump_off, from 3 s the yield too). The card shows the latest.
  On a 30-minute simulated recording one analysis takes about 0.2–0.3 s in Node.
- **The grades are stored as they are tapped**, in order, so nothing tapped is lost if Save is
  never tapped. Save stores them all, the channelling as `false` when it was left off (the user
  saw it off), and closes the card. A shot never saved keeps what was tapped; the rest stays
  null (spec v2 "Grading"). The taste clears when tapped again, as in the board.
- After Save the extraction screen is back, ready for the next cup (History, T1.19, isn't built:
  the board's Save leads to History-Detail).

Where the screens differ from the boards, and why:

- **No phase stepper** and only the extraction row on the card: the other phases don't exist yet
  (T2.5–T2.11), as the plan says for the card.
- **The cup card** says "Cup · 110.0 g · on the scale" (the weight it added as it went on), not a
  recognised container: containers come with T2.4.
- **The waiting card** is the board's "manual" variant ("Pump detection is off · Tap Start as
  you start the pump."): there is no microphone detection until T3.1.
- **The card's extraction row has no chevron** to the extraction view: there would be no way
  back to the card from it yet.
- **The card's small chart** draws the live display's series with its markers (display-only, hard
  rule 3), while the numbers come from the analysis; History (T1.19) draws from the analysis.
- **The backup reminder** (D-031) sits at the top, smaller than the probe's; its button opens
  the probe's automatic export settings.
- **The readout's "reached" state** (at the target up to +1.0 g over) follows Brew-Beans's: the
  number and the bar in `--ok` with "Target reached". The big number is smaller with two digits
  before the point, so "to go" stays on its line.

## D-068 — The shot's snapshot: export format version 3

2026-10-05 · accepted · T1.18 · spec v2 "What every shot records", D-053, D-054

- **Fields** (all nullable, hard rule 6), next to the ids, as values at brew time: `recipeId`,
  `recipeName`, `milkRatio` (the coffee ratio is `targetRatio`); `beansPhase`, `beansWeighedG`,
  `grindPhase`, `groundG`, `milkPhase`, `milkG`; `machineId`, `machineName`, `pressureBar`,
  `basketId`, `basketSizeG`; `grinderId`, `grinderName`, `grindSetting`; `packId`, `packName`,
  `packRoastDate`, `packOpenDate`; `containerId`; `lastDescaleDate`, `lastBackflushDate`,
  `lastGrinderCareDate`. `direction` (the taste) and `channelled` stay as they are (D-054).
- **A phase is `done` or `skipped`,** each beside its result; `null` means it wasn't offered (before
  it existed) or doesn't apply (the milk of a recipe without milk). Skipped is never left empty.
  The extraction is the shot itself, so it has no state.
- **Dates are `YYYY-MM-DD`** (`field.isoDate`): days the user names, which no time zone moves.
  The pattern is checked, not whether the day exists (parsers guard structure only, D-018).
- **Nothing derivable is stored:** retention (beans − ground), days off roast and open (T2.2), and
  every target.
- **`beanBagId` is renamed `packId`** (D-053's coffee packs), in the same version, while every
  stored value is null. Migration 2 → 3 renames it in a file; `normaliseShot` reads a stored
  `beanBagId` as `packId`, so IndexedDB needs no upgrade.
- `burrEpochId` stays, null: burr epochs are deferred (D-053).
- Older files read the new fields as null. Tests: a version 2 file and a version 1 file import,
  with the snapshot null and the pack's id carried over.

## D-069 — The Instrument look in the app

2026-10-05 · accepted · T1.18 · D-040, D-045, D-055

- `src/ui/theme.css` holds the `.look-instrument` tokens of the boards' `<helmet>` on `:root`,
  light by default and dark under `prefers-color-scheme: dark`, the type roles and radii, and the
  base components as the boards' class names (`card`, `row`, `btn`, `btn2`, `chip`, `seg`,
  `badge`, `dirbtn`, `toggle`, `stepper`, `input`, `bar`, `tabbar`/`tab`, `lbl`, `num`, `unit`,
  `ttl`, `muted`), so a screen can be built from its board by name.
- Font stacks only: `system-ui`/`ui-monospace` first (SF Pro and SF Mono on iPhone), IBM Plex
  named as a fallback, never downloaded.
- The probe keeps its plain layout under `.probe` (`src/ui/app.css`), in the theme's colours and
  type. The brew screens' layout is `src/ui/brew/brew.css`.
- `main.tsx` imports the theme before any screen, so a screen's styles build on it rather than
  lose to it.

## D-070 — The history: curves in the derived cache, what it lists, and how it compares

2026-10-05 · accepted · T1.19 · D-007, D-019, D-047, D-056

- **The curves are derived and cached.** Each `SegmentAnalysis` carries `curve`: its liquid and
  flow every 0.2 s (whole grid steps), from 10 s before the shot to 10 s after it, inside its
  window, in hundredths. The weight is smoothed over 1 s, the flow over 2 s: on the scale's 0.1 g
  steps a narrower fit draws each step as a spike. Gaps up to 5 s (another step's transition, a
  transient, a step of the pour itself) are bridged in a straight line; longer ones are null.
  Display only: no marker or metric reads it. Why: the list's small graphs, the detail and the
  overlay then come from the cache in milliseconds; reading raw per row would cost about 30 ms
  of analysis per recording on every visit. T1.14 left both ways open; this one bumps
  `ANALYSIS_VERSION` to 8 and adds about 1–2 KB per segment.
- **When the analysis runs.** History runs `reanalyzeAll` once per analysis version, on its first
  load, and keeps the version in `storage.local` (`history.analysedVersion`): device-local, as
  the derived cache is. A recording that ends while the app runs is analysed at once, and
  automatic export looks at it only after that, so the file it uploads carries its post-hoc
  shots. Recordings that ended elsewhere (recovery, an import) get theirs at the next load.
- **What is listed.** Every shot but the discarded ones (D-019), and but post-hoc shots without
  a segment that nobody edited (D-047). A live or manual shot without a segment stays, with a
  "Not found" badge and no graph (D-007). Segments no shot claims stay out.
- **A shot's time** is its recording's start plus its pump_on, else its first drip, else its
  anchor: the minute the pump started, which a live shot's anchor ("shot done") is not.
- **The zero.** Charts count from pump_on (the Tare + start tap, Q4), else from the first drip,
  then starting 3 s before it. The overlay aligns both shots at what the user picks if both have
  it, else at what they share (the other button is disabled, and a line says why). Aligned at
  the first drip it starts as long before as the longer pre-infusion (8 s for the board's 7.4 s),
  and times read "+10"; at pump on it starts 1 s before, and times read "10". Marker labels that
  would overlap go on a second line (session 2's first drips came 3.3 and 3.7 s after the taps).
- **Small additions to the boards**, each the least that fills a gap: shots older than seven
  days go under "Earlier"; an ungraded shot shows a dash for its taste; History links back to
  the probe ("‹ Probe") until the tab bar (T1.23); the detail's grades don't add tags (the
  board has no Add there). The compare table shows every metric of the detail (Total, Weight at
  pump off and Tail too, beyond the board's five) and the dose the target came from (D-067),
  and leaves out a row neither shot has. A grind setting's Δ shows only on the same grinder
  and the same kind of setting.
- **The detail's grades** go through a `ShotEditor`: applied at once, stored in order, exported
  (T1.20), as the shot card's are. The shot card and the detail share one `Grades` component.
- `?debug` on a shot's page shows the stored shot and its segment (D-056); nothing else does.

## D-071 — Reconnecting without the chooser: a connector per link, the scale remembered on the device

2026-10-05 · accepted (the user's wishes in T1.21; B3 checks it on the phone) · T1.21 · D-022,
D-029, D-030

`src/app/scale-connector.ts`, `src/transport/`, `src/ui/brew/parts.tsx`, the probe.

- **One `ScaleConnector` per link, kept with it**, and every connect goes through it: the brew
  screen's card, the probe's buttons and, with T1.23, Home's. It starts when the link is made,
  so the real scale reconnects as soon as a screen that shows it opens, not on the history's
  pages, and not behind the simulator's.
- **The scale is remembered in `storage.local`** (`scale.knownDevice`: `{ id, name }`, both
  nullable), written on each connection that changes it. Device-local, never exported (D-030):
  device ids are per origin and mean nothing on another phone. The mock's link remembers its
  scale for the page only, so on a fresh page it waits for a tap, as the smoke tests expect.
- **It reconnects by itself only to a remembered scale**, where the runtime has `getDevices()`:
  on startup, when Web Bluetooth appears, after a dropped link (1 s later) and after a tap on
  Connect. Without a remembered scale nothing happens until a tap, so a first visit never
  flashes "Waiting for the scale…" while `getDevices()` comes back empty.
- **Retries, for as long as the page is open** (the user, 2026-10-05): after 1, 2, 4 and 8 s,
  then every 10 s; showing the page again tries at once. There is no attempt timeout, as D-022
  has none: in the iOS shims `gatt.connect()` may wait until the scale is switched on, which is
  the wait we want, and Choose scale is always there if it never ends. The pauses and the
  Bluetooth watch (every 250 ms for 10 s, the user's figures) are `PROVISIONAL(U1.1: B3)`.
- **The chooser is the fallback.** The transport now tells "the browser lists no scale" apart
  (`TransportError` `no-known-device`) from a scale it can't reach (`connect-failed`). The first
  stops the attempts and turns Connect into the chooser ("The browser no longer knows the
  scale: choose it once more"): retrying can't bring a permission back. A tap on Choose scale
  cancels the attempt in progress and opens the chooser in the same tap; `disconnect()` leaves
  the status `disconnected` before it returns (now part of the transport's contract), so the
  chooser keeps the tap's user activation. A cancelled or failed chooser leaves it to the user.
- **Stop is the user's.** `disconnect()`, or any disconnect with reason `user`, ends the
  attempts until the next tap or reload. Any successful connection turns them back on.
- **Web Bluetooth may come late** (beacio): the transport's new `available` says whether it is
  there. The connector looks every 250 ms for 10 s, then says it isn't ("No Bluetooth": allow
  beacio on the site with Always Allow on This Website, then Reload), and looks again whenever
  the page is shown. A tap that connects anyway marks it available.
- **`reconnectKnownDevice(deviceId?)`** looks for the remembered id first, then this page's last
  device, then any `BOOKOO…` name (amends D-022).
- **The screen wake lock is wanted while connected, or from a tap that connects**, no longer
  while merely connecting: an attempt can wait for a scale that stays off, and the screen should
  sleep meanwhile. Safari grants the lock only during a tap, so a scale that reconnected by
  itself has none yet: every tap now calls `ScreenWakeLock.retry()` (`App.tsx`), and the next
  tap, at the latest Start, gets it.
- **Failed connects cost nothing.** `ScaleLinks` tells the history and automatic export that
  recordings changed only when a connection ended; a failed attempt recorded nothing.
- **`useLiveUpdates` re-renders once after subscribing.** Screens subscribe after their first
  render, and the connector settles in between (the store's read, then the first attempt); a
  screen could otherwise show "Looking for Bluetooth…" until something else changed. A
  connector without a store settles before the first render.
- **The UI** follows the board Main's card: "Waiting for the scale…" with Stop and Choose scale,
  "Looking for Bluetooth…", "No Bluetooth" with Reload, and "Not connected" with Connect scale
  (and the last failure, small). The brew screen's top bar says the same. The probe shows the
  connector's state for B3: Web Bluetooth, whether `getDevices()` exists, the remembered scale,
  the failed attempts and the last error; its Disconnect reads Stop while not connected.
- **Tested** on the real transport against the unit fake, and in Chromium with a fake
  `navigator.bluetooth` that keeps its permission across reloads, injects late or never, can
  switch the scale off and refuses the chooser without the tap's activation
  (`scripts/e2e-reconnect.mjs`).

## D-072 — Home and the tab bar; the probe is the Setup tab until T2.9

2026-10-05 · accepted (the Setup tab: the user) · T1.23 · spec v2 "App structure and look",
D-031, D-052, D-071

- **The Setup tab is the probe until the Setup screens** (the user, 2026-10-05, Q12): it holds
  export, automatic export, the microphone's levels and the diagnostics. The probe gets the tab
  bar, with Setup current, and loses its "Brew a shot ›" and "History ›" links; History loses
  "‹ Probe". T2.9 replaces it with `#/setup`, where the probe becomes a row. Home, the brew
  screen and the backup reminder still open the automatic export settings on the probe.
- **Routes.** Home is `#/`; every unknown hash shows Home with a line saying so (the probe did
  before). `pageHash('home', mock)` is `#/` or `#/?mock…`. The startup screen says "Espresso
  tracker", not "Probe". The brew flow keeps focus mode: no tab bar, and its ✕ goes Home.
- **The tab bar** (`src/ui/TabBar.tsx`) sits beside each screen's `<main>`, not in it, so the
  probe's `.probe a` colour doesn't reach it. `--tabbar-h` (80 px) is the room the screens leave
  for it; on a window wider than the 480 px column its tabs stay under the column. Compare
  mode's bar sits on it, as the board History draws it.
- **Home** (`src/ui/home/`), from the board Main, with what exists now. The container on the
  scale (T2.4), the maintenance reminder (T2.10) and the mode warning (T1.25) come with their
  tasks; their rows aren't drawn until then, since none could say anything true yet.
  - *The scale's card*: its name as the scale reports it (`BOOKOO_SC 109813` on the user's; the
    board's "BOOKOO Themis Mini" isn't anything the scale sends), else the remembered name, else
    "Scale"; the battery icon has a bar per started quarter. Once connected, the weight is the
    scale's latest trusted reading (`LiveShot`'s `readingG`, display-only) and **Tare** sends
    `01` through `recorder.sendCommand`, logged with the reason `home`. The analysis takes it as
    any tare (`isTareCommand`). Otherwise the card's body is the brew screen's connect card's
    (`ConnectBody`): connect, Stop and Choose scale while it waits, Reload without Bluetooth.
    Home gets the link first, so the reconnect starts there (D-071).
  - *The figures* (`summary.ts`, pure) come from `History.load()`'s entries, so from the
    analysis's cache. The last shot is the newest listed one, named by weekday and time as the
    board does, with its date too once it's older than the week (a weekday alone would be
    ambiguous). "Last 7 days" is the history's section: today and the six days before, from
    midnight. Shots counts every listed shot; each average (ratio, first drip, extraction) is
    over the shots that have the figure, so a post-hoc shot without a dose has no ratio and an
    unmatched shot has no figures. The taste bar shows once a shot of the week is graded or
    channelled; "N channelled" only when N > 0.
  - *Small additions to the board*, each the least that fills a gap: without any shot, one card
    "Last shot · No shots yet." and no week; an ungraded last shot shows a dash for its taste;
    the recorder's warnings, the backup reminder (D-031), a load failure and the recordings that
    couldn't be read show as notices above the cards, as on the brew screen and History.
- **Shared pieces moved, unchanged in look:** the icons to `src/ui/icons.tsx`; the recorder's
  warnings and the backup reminder to `src/ui/notices.tsx` (Home and the brew screen); the
  notices' styles, `.dot-ok` and `.dot-off` to `theme.css`; History's failure notice to
  `LoadFailures`; `lastSevenDaysStart` and `weekdayLabel` to `rows.ts`. `brew/parts.tsx` and
  `history/parts.tsx` import their own styles, since Home uses their pieces.
- **Tested:** `summary.test.ts` with no shots, one and many; `scripts/e2e-home.mjs` drives Home
  with no shots, the tabs, connect and Tare on the mock (the `01` logged with `home`), one shot
  brewed and graded, then three with session 2 imported; `e2e-reconnect.mjs` reloads on Home
  and sees it reconnect by itself. On the phone: H1–H5 (`docs/hardware-tests.md`).

## D-073 — The scale-mode check: a `04` on connect, again every 5 s while in doubt; event frames, not a lone start, mean the automatic mode

2026-10-05 · accepted (the re-check and the timer key: the user) · T1.25 · D-038, D-057, D-066,
D-071

`src/core/live/scale-mode.ts`, `src/app/scale-mode.ts`, the screens, the simulator.

- **The user's answers (2026-10-05):**
  - *How the warning clears* (Q13): the app checks again by itself, every 5 s while the warning
    stands and the scale sits idle. The other offers were a Check again button, and leaving it to
    the next connect or the next Start whose timer starts.
  - *The timer key* (Q14): the user's scale has a key that starts its timer by hand, and they may
    press it while the app is connected. So a timer that starts with no command from the app
    proves nothing, and D-057's passive sign "a timer that starts without a command" is dropped.
    The automatic mode still shows by its `03 0D` frames, which the Mini sends on FF12 as its runs
    start and end (session 1).
- **What counts as evidence** (`ScaleModeMonitor`, display-only, `src/core/live`): a `04` or `07`
  logged as sent while the latest weight frame's timer read 0 awaits its start. A running timer
  never reads 0, so "at 0" is "stopped at 0".
  - The timer above 0 in a weight frame that arrives within 1.5 s of the command: **started**, the
    timer mode.
  - Nothing above 0 once five weight frames have arrived after it, the latest at least 0.5 s
    after the command: **not started**, not the timer mode (the flow-rate mode has no timer; the
    automatic mode ignores both between its runs). `timerStartVerdict` is this rule, pure. Both
    conditions, because a stall (B8: 0.5–0.7 s) delivers held frames in a burst: the time alone
    could pass before any frame shows the start. A start later than the window but within 1.5 s
    still turns "not started" back; one later than that may be the timer key, and counts for
    nothing.
  - **An `03 0D` frame**, any state: not the timer mode. It also drops a start awaited, and leaves
    the timer unknown until the next weight frame: the automatic mode announces its run a frame
    before the timer shows it running, and a check sent in between would otherwise take the
    run's start for its own (found by the service's tests).
  - Nothing else counts: a lone start (the key), a `07` at a frozen timer (D-066's exception: no
    cup put on since the last shot), a `04` while the timer runs. Another timer command (`04`,
    `05`, `06`, `07`) before the start shows drops the start awaited: which did what can't be
    told.
  - **The latest evidence decides**, so the verdict follows the user switching modes.
- **The check** (`ScaleModeCheck`, one per link, made with it and kept, whichever screen is
  open; `link.mode`):
  - It sends the `04` (reason `mode-check`, through `recorder.sendCommand`, so logged) when the
    mode isn't known to be the timer mode, the latest weight frame reads 0, no start is awaited,
    and the live shot is `idle` (no cup put on since connect, or the cup lifted). So at connect,
    within a few frames, unless the timer runs or stands at a shot's time. A reconnect while the
    timer runs sends nothing.
  - **Again every 5 s while in doubt** (the user, Q13): while the warning stands, or no check
    could tell (a write that failed). Each check is one more `04` in the recording; in the other
    modes it does nothing. Once the timer mode is seen, nothing more on that connection. The
    frames are its clock: no timers.
  - **Putting the timer back**: once its own `04` starts the timer, `05` then `06`, only while the
    live shot is still `idle`. A Tare + start tap logs its `manual-start` before sending its `07`,
    so a tap that comes meanwhile keeps the timer running for the shot rather than stopping it;
    a cup put on meanwhile has its tare zero it (D-066). Nothing is sent after a check whose
    timer didn't start.
  - The check's state (`verdict`, the evidence, `checking`, the checks sent, the last error) is
    per connection, back to `unknown` at `disconnected`.
- **The warning, display only** (D-057): the recording goes on whatever the mode, and nothing is
  stored. One text everywhere, "The scale isn't in its timer mode: switch it on the scale.":
  the evidence changes as the re-checks come (an automatic mode's `03 0D`, then its ignored
  `04`s), and the advice is the same.
  - Home: a caution line across the scale card's foot, under the weight, while connected (no
    board has it; the board Brew-Milk's caution line in a card is the pattern).
  - The brew screen: a caution notice with the others, adding that the scale's own timer won't
    follow the shot until then, and the app times it anyway.
  - The probe: a line in the Connection panel with what the verdict rests on (the command, its
    time and the start's lag, or the `03 0D` frame), red while it warns.
- **The analysis is untouched** (D-038): the check's commands are timer commands, which no
  analysis step reads. Its timer run is two or three ticks, too short for a device run
  (`DEFAULT_MIN_RUN_FRAMES` 3, or a run of its own otherwise), and its frames are timed by the
  grid. `ANALYSIS_VERSION` and the export format stay as they are: `mode-check` is a reason like
  any other.
- **The simulator** gains a script action, `{ type: 'mode', atMs, mode }`: the user switching
  modes on the scale. Assumed until the user checks it (T1.25's verify): the timer stops at 0, a
  start waiting is dropped, an automatic run ends without an `03 0D`, and the automatic mode
  watches from what is on the platform then (a vessel already on isn't tared).
  `demoScenario(seed, mode)` leaves the demo's scale in another mode, and the mock's routes take
  `&mode=flow-rate` or `&mode=automatic` (`linkKey` `mock@<speed>/<mode>`), so the warning can
  be seen without the scale. The probe links to each mode.
- **Provisional** (D-029): the 0.5 s window and the 1.5 s late window are
  `PROVISIONAL(U1.1: T1.25 check)`: session 1's starts showed 0.14–0.21 s after the command and
  session 2's taps 0.18–0.27 s, so both have room. Replayed through the monitor, session 1 reads
  as the user ran it: the automatic mode's run, then `04` and `07` starting nothing from 104.5 to
  141.8 s, then the timer mode from 257.7 s; session 2 the timer mode from both taps.
- **Tested:** `scale-mode.test.ts` in `src/core/live` (the pure verdict; the simulator in each
  mode, 30 seeds each on session 1's link; the passive signs; a mode switch; a late start behind
  a stall; the automatic mode's run announced first) and in `src/app` (connect in each mode, the
  re-checks, the warning clearing within 5 s of a switch, a reconnect mid-shot, a tap during the
  check, a cup on the scale, a write that fails); session 1 and 2 replayed in
  `real-fixtures.test.ts`; `scripts/e2e-home.mjs` (the timer mode on the mock: no warning; the
  flow-rate mode: Home, the brew screen and the probe warn). On the phone: M1–M5
  (`docs/hardware-tests.md`).

## D-074 — The entities: tombstones, maintenance on the machine and grinders, the last used as the default, fixed-id seeds

2026-10-05 · accepted · T2.1 · spec v2 "Equipment, coffee and settings", D-053, D-056, D-068

`src/core/model/entities.ts`, `seeds.ts`, `snapshot.ts`; `src/storage/entities.ts`, `db.ts`
(version 3); `src/app/entities.ts`, `brew-settings.ts`.

- **Six kinds, one store each** (database version 3): `machines` (with their baskets),
  `grinders`, `recipes`, `packs`, `containers`, `tags`, by id. One repository serves them all
  (`storage.entities`: `create`, `get`, `update`, `replace`, `list`, `all`), and every entity read
  goes through `normaliseEntity` (D-018). The fields are the plan's, with the changes below.
- **Every entity has `id`, `createdAtEpochMs`, `updatedAtEpochMs` and a tombstone,
  `removedAtEpochMs`.** Removing one sets it, and clearing it restores; the lists the user picks
  from leave removed ones out (`isListed`). There is no delete, for the reason shots have their
  tombstone (D-019): a hard-deleted entity would come back with the next import of an older file
  or a restore from the backup, which add whatever isn't stored. Shots name entities by id, so a
  removed grinder stays findable from its shots. Whether Setup offers Remove is T2.9's.
- **Maintenance lives on what it maintains**, not in a `Maintenance` store of its own as the
  plan sketched: `Machine.descale` and `Machine.backflush`, `Grinder.care`, each
  `{ lastDoneDate, reminderDays }` (dates as `YYYY-MM-DD`, like the shot's snapshot, D-068).
  There are exactly three kinds (D-053; the brief draws no other), and the boards show them on
  the machine's and the grinders' screens. Embedded, a grinder's care can't outlive or miss its
  grinder, a new grinder has its care from the start, and nothing needs seeding per grinder.
  `Pack.finishedDate` is a date too (finishing is like opening), not the plan's `finishedAt`.
- **The default is the last used, in `kv`** (`lastUsed.machineId`, `.basketId`, `.grinderId`,
  `.packId`, `.recipeId`, with `.doseG`), and no entity carries an `isDefault` of its own (the
  plan had one on `Machine` and `Grinder`). Spec v2: the last used is the default and a change
  becomes the default, so one value says which is in use: Setup's "Make default" (board
  Setup-Grinders) and a change during a brew are the same write. A flag on each entity could
  disagree with the last used, and an import could leave two defaults. `resolveBrewSettings`
  picks: the last used while listed, else the first listed (the seeds' order: the Gaggia, its LM
  17 g basket, the ORO); the recipe falls back to Espresso, as before (D-067); a coffee pack only
  while unfinished, since after a finished pack the next is unknown until picked (T2.2). A tag's
  `isDefault` is another thing: the tag is on for every new shot.
- **Seeds** (`SEEDS`), written by migration 3 into a new database: the spec's target hardware
  ("Gaggia Classic Pro with 6-bar OPV mod … 17g La Marzocco basket; Eureka ORO Mignon Single
  Dose Pro and Comandante C40 MK4 grinders"), as the board's sample names them (machine
  "Gaggia Classic Pro", 6 bar, basket "LM 17 g" of 17 g; "Eureka" "ORO Mignon Single Dose Pro",
  stepless; "Comandante" "C40 MK4 Red Clix", clicks), spec v2's seven recipes, and T1.18's seven
  tags with WDT and Puck screen on. No setting, maintenance date or reminder interval is
  seeded: those are the user's. No packs or containers.
  - **Fixed ids and times.** Each seed has a literal UUIDv7 at `SEED_EPOCH_MS` (2026-10-05T00:00Z)
    with `5eed` in its random part, and that time as its creation and change time. An untouched
    seed is then the same record on every device and in every file, so a restore or a second
    device adds no second Espresso. Random ids would duplicate every seed on each restore.
  - **A seed nobody changed gives way** (`isPristineSeed`: equal to its seed, field for field):
    an import replaces it with the file's version whatever the policy (D-075), because it holds
    no choice of the user's, and the automatic export uploads no entities file while every
    entity is one (D-076).
  - **Frozen**: migrations 3 (database) and 3 → 4 (export) use them. A new seed comes with a new
    migration and a list of its own.
- **The snapshot** (`shotSnapshot`, D-068): at "shot done" `BrewFlow` records the recipe with
  both ratios, the machine with its pressure, the basket's id and size, the grinder's name and
  current setting (none until the user sets one), the pack with its dates, and the three
  maintenance dates, ids next to values, from `BrewPreferences`. Until the phases let the user
  pick them (T2.2, T2.3, T2.6), that is the seeded Gaggia, LM 17 g and ORO for every shot, and
  no pack. The phases, the cup's container and the dose stay as they were (D-067).
- **In memory** (`Entities`, `services.entities`): loaded at startup, a change applies at once
  and is stored behind it, in order; a failed write stays for the session and shows
  (`writeError`); `reload()` after an import. `BrewPreferences` resolves the brew's settings from
  it and `kv`, and the recipe picker lists the stored recipes by id.

## D-075 — Export format version 4: the entities, and T1.18's settings converted

2026-10-05 · accepted · T2.1 · D-025, D-068, D-074

`src/core/export/`, `src/core/model/legacy-settings.ts`, `src/app/export.ts`,
`docs/export-format.md`.

- **`entities`** at the top level, after `shots`: `{ machines, grinders, recipes, packs,
  containers, tags }`, every list present, removed entities too, each in id order, one entity a
  line. A full export carries it; a one-recording export has `null`, as it has for settings.
  Ids are unique within a kind; the same id in two kinds' lists isn't checked against, since
  each kind is its own store.
- **Migration 3 → 4:** a file without settings (one recording's) gains `entities: null`; a file
  with settings gains every list, empty but for the tags, which come from T1.18's `tags`
  setting. The same conversion turns `lastUsed.recipe` (a prefilled recipe's name) into
  `lastUsed.recipeId`, and both old keys leave the settings. Database migration 3 does the same
  to a device's `kv`, with the same functions (`tagsFromLegacySetting`,
  `recipeIdFromLegacySetting`), so a device and its old exports convert alike:
  - a seed's name (in any case) keeps the seed's id, with what the list says;
  - a tag the user added gets an id derived from its name (`legacyTagId`: FNV-1a with murmur3's
    finaliser over the lower-cased name, 74 bits, at `SEED_EPOCH_MS + 1`, so after the seeds).
    Converting the same list twice gives the same tags, so importing an old export onto the
    device that converted its own `kv` adds no duplicate. Several added tags sort among
    themselves by hash, not in the order they were added: a handful at most, from T1.18's
    weeks.
- **Import merges entities like shots** (`importBundle`, after the shots and before the
  settings, which name entities): added when not stored, unchanged when equal, a conflict (left
  alone, reported with its kind) when the creation time differs, else kept (`keep`) or replaced
  (`replace`). **Except a seed as seeded,** which takes the file's version whatever the policy:
  restoring a backup onto a new database (whose seeds are pristine) brings back the user's
  edits to the seeds, where `keep` would have kept the pristine ones.
- `exportAll` reads the entities in one transaction; the summary counts them (`entities`), and
  the probe's import says what became of them.
- A recording's file holding entities counts as "more than this recording" in the automatic
  export's comparison, like settings.

## D-076 — The automatic export's entities file

2026-10-05 · accepted · T2.1 · D-027, D-030, D-074

`src/app/auto-export/` (`auto-export.ts`, `ledger.ts`, `compare.ts`), `exportEntities` in
`src/app/export.ts`.

- **`<prefix>entities.json`**, next to the year folders (`recordings/entities.json` by default),
  rather than the plan's `metadata/entities.json`: the prefix is where the user put the app's
  files, so everything the app writes stays inside it. The file is an export (format 4) with no
  recordings, shots or settings, only every entity, removed ones too (`exportEntities`), so
  restoring it is importing it, like any other file. Settings (the last used and the dose)
  aren't backed up: they are conveniences, and change on every brew.
- **Its own ledger entry**, `autoExport.entities` in `local` (outside the recordings' prefix, so
  `readLedger` never sees it): destination, path, state, version, a SHA-256 of the entities
  (canonical JSON, each list sorted by id), time, reason. A scan compares the digest, so
  unchanged entities cost no request.
- **Only once something is the user's:** while every entity is a seed as seeded there is
  nothing of the user's to back up, so no file is written. A fresh device then never pushes
  pristine seeds over the repo's file; restoring is importing that file.
- **The rules of D-030:** created without a version, compared on a conflict, a held file
  compared again only once the entities change here, nothing deleted. `compareEntitiesWithRemote`
  keeps the repo's file when it holds an entity this device lacks or a newer version of one
  (`updatedAtEpochMs` later than this device's), or isn't the entities alone, or can't be read;
  equal files (but for when and by which build they were written) aren't written; else this
  device's replaces it. The time decides only in the safe direction, holding a file, never
  overwriting one (D-025 rejected "newer wins" for imports because of wrong clocks).
- **When:** in every pass, after the recordings, whose files matter more. `entitiesChanged()`
  (debounced like the shots, 10 s) is called after each stored entity change
  (`Entities.onStored`); startup, an import and any other pass find a changed digest too.
- **Status:** `entitiesPending` and `entitiesHeld` (path and reason). The probe's panel says
  "your setup" for it: "2 recordings and your setup to go", and a held file's reason with
  "Import the repo's file to merge it".

## D-077 — Setup: its routes, changes stored as made, Remove, and the containers' clashes

2026-10-05 · accepted (provisional where Q15–Q19 say) · T2.9 · D-052, D-053, D-068, D-072, D-074

`src/ui/setup/` (`SetupScreen.tsx` and a file per board), `src/ui/route.ts` (`setup`,
`setupHash`), `src/core/model/containers.ts` (`containerClashes`), `src/core/model/dates.ts`,
`BrewPreferences.setMachine`, `setBasket`, `setGrinder`, `setPack`, `Entities.update` with a
function.

- **Routes:** `#/setup` is the list; `#/setup/<section>` the machine, grinders, recipes, packs,
  containers, tags, microphone and backup (the automatic export's panel); `#/setup/pack/<id>` one
  pack and `#/setup/pack/new` a new one. An unknown Setup path shows Home with the problem, as
  any unknown hash does. The Setup tab opens `#/setup`; the probe is a row there with a
  **‹ Setup** link (Q12's answer); the backup reminder opens `#/setup/backup` with the settings
  open. The probe keeps its own export panels.
- **Stored as made, no Save:** the boards have no Save button. A text field stores when it is
  left (or Enter, or the keyboard's Done), a stepper with each tap (a hold repeats), a switch
  with each tap. Each is an `entities.update` (or a `BrewPreferences` setter), stored behind;
  a failed write shows at the top of the page and is retried with the next change (D-074).
- **From the entity as it is now:** a step or a list change is `entities.update(kind, id,
  (current) => changes)`, so two taps before the screen draws again both count, and a text
  field works out what it shows as it renders (`useDraft`): copying the value in an effect ran
  up to 100 ms after the field appeared and put the old value back over what was typed (found
  by the e2e test, which types at once).
- **Remove** (provisional, Q15): the boards draw none. Each editor has one (a basket while the
  machine has another, a grinder, a recipe, a pack, a container, a tag): a tombstone (D-074),
  so the item leaves the lists and pickers, and the shots keep their snapshot. Restoring has no
  screen yet: only an import that replaces metadata brings an older, listed version back.
- **The default is the last used** (D-074): a basket's and a grinder's **Make default**, and a
  recipe's **Use next** (provisional, Q18: the board only marks "Last used"), are the
  `BrewPreferences` setters. `setBasket` takes only a basket of the machine in use; `setPack`
  refuses a finished or removed pack.
- **Packs** (provisional, Q17): **Add pack** opens `#/setup/pack/new`, the pack page as a form;
  **Add pack** stores it once it has a name and a roast date (the age comes from it), and the
  first pack becomes the one in use while none is. The list's **Open** sets the open date to
  today; **Finish** asks the optional "would buy again" in place (Q5); a finished pack's page
  has **Not finished**. Dates are local `YYYY-MM-DD` (`todayDate`).
- **Containers:** learned on the connected scale: **Weigh & add** takes the scale's still
  reading (the live display's `stable`), at least 1 g, in tenths; **Weigh again** learns it
  again. Two within 0.05 g (the scale's 0.1 g steps) weigh the same: a conflict, which can't be
  dismissed, only fixed. Two within 3 g are a warning, which Dismiss puts away for that pair:
  the lighter container keeps the heavier's id in `dismissedWarningIds`. The warning reads "A
  wet <lighter> may read as <heavier>": a wet container weighs more, so it is the lighter one
  that can pass for the other; the board's "A wet tumbler may read as the jug" had them the other
  way round (Q16). Open warnings go to Setup's Needs attention.
- **Steppers:** pressure 0.5 bar (1–15, from 9), basket 0.5 g (5–30, from 18), a stepless
  grinder 0.1 (0–100, from 5), clicks 1 (0–100, from 20), the coffee ratio 0.1 (1–4), the milk
  ratio 0.5 (0.5–10, from 3). A value not set reads "Not set", and the first tap starts from
  the middle value. Pressure has **Clear**.
- **Grinders** (provisional, Q15): **Add grinder** opens a form (brand, model, type); brand and
  model are editable in the open card. Changing the type to clicks rounds the setting.
- **Tags:** a rename keeps the old name on the shots that have it (D-068); counts are of the
  stored shots, by name, discarded ones left out.
- **Microphone** (provisional, Q19): the board's switch is on, but there is nothing to switch on
  until T3.1, so the switch and **Record** are drawn disabled with "Not ready yet: tap Start as
  the pump starts". The probe's Record sound collects the levels meanwhile (T1.24).
- **The order of Phase 2:** Setup comes before the phases (T2.2–T2.7), since they need packs,
  grinders and containers to exist, and their in-place changes reuse its parts.

## D-078 — Container recognition: a vessel monitor, one matcher for live and post-hoc, labels outside the cache

2026-10-05 · accepted (provisional where Q20 says) · T2.4 · D-037, D-041, D-047, D-052, D-077

`src/core/live/vessels.ts` (`VesselMonitor`), `src/core/model/containers.ts`
(`matchContainer`), `src/app/live-vessel.ts` (`LiveVessel`, `link.vessel`),
`src/core/analysis/containers.ts` (`segmentContainers`), the runner, Home's container row.

- **What is on the scale** is its own live monitor, beside the shot's: with nothing on, a stable
  rise of at least 3 g (`MIN_CONTAINER_G`, also Setup's least) is a vessel put on, weighing the
  difference from the stable level before it, so the app's tares and a zero off the empty
  platform don't count. For 3 s a stable level within 0.5 g is it still settling (the
  simulator's smoothing reads 109.8 for 110 at first); after that, anything on top is its
  contents. Off: a stable level less than half its mass above where it was put on from. The
  scale's own tare button reads as a lift (A7 sends nothing); lifted and put back, it is seen
  again. A vessel already on when the recording starts isn't seen.
- **One matcher** (`matchContainer`, in the model so the live display and the analysis share the
  rule but no state): the listed containers within 0.3 g below and 3 g above their learned mass
  (a wet container weighs more: the "within 3 g" band); the nearest is the one when no other is
  within 0.15 g of its distance; else ambiguous; none, unknown. The 0.3 g is provisional (K2).
- **Setup weighs the same way:** Weigh & add takes the vessel's mass when one was seen put on,
  else the still reading, so learning and recognising measure alike.
- **Live:** `link.vessel.onScale` is the vessel, its match against the containers as they are
  now (read at every look), and a pick: when two could be it, the user picks one on Home (and
  may pick for an unknown one too), until it comes off. Home's scale card has the board's row:
  "Put a container down", or the container "Recognised · <roles>" linking to the brew (T2.5
  opens its phase); "Which container is it?" with a chip each, and "Not a known container ·
  110.0 g" linking to Setup, aren't drawn on any board (Q20).
- **The shot's `containerId`** is the container on the scale at the Tare + start tap, else at
  the first drip (a cup lifted at the end has gone by "shot done").
- **Post-hoc labels outside the cache:** each segment's vessel weighs its baseline less the level
  before the step that put it on (the step's own size is measured mid-transition, short of a
  settling vessel: 105 g for 110). Matched against the containers, it labels the segment
  (`RecordingResults.containers`). A segment whose vessel is a known container without the cup
  role (bean or grind cup, milk jug) gets no post-hoc shot, whatever it looks like. The plan had
  the label in `SegmentAnalysis` with a version bump; but the label depends on the containers,
  which are metadata, so it is worked out after the cache like the shots' matching, and
  `ANALYSIS_VERSION` stays 8. Post-hoc shots keep `containerId` null: analysis writes no
  metadata.
- **Hardware session 2 agrees:** the monitor weighs the empty dosing cup 119.9 and 119.8 g on
  its two placements, the shots' vessels 264.8 and 257.3 g, the same as the analysis's
  baselines; with grounds in it the dosing cup (135.2, 137.1, 136.9 g) is no container.

## D-079 — The phases: routed live, logged in raw, measured post-hoc; the dose from the phases

2026-10-05 · accepted (provisional where Q21–Q23 say) · T2.5 · D-047, D-052, D-067, D-068, D-078,
hard rules 1–3

`src/core/live/phases.ts` (`PhaseRouter`), `src/core/model/phases.ts`,
`src/core/analysis/phases.ts` (`measurePhases`, `phasesOfShots`, `shotDose`), the brew flow
(`flow.phases`, `flow.dose`, `selectPhase`, `endMilk`), `src/ui/brew/phases.tsx`.

- **Live routing, display-only.** `PhaseRouter` keeps which phase is on screen: a known container
  opens its role's phase (the milk jug the milk, for a milk drink; the cup the extraction,
  before its shot; the bean cup the beans; the grind cup the grind; a bean-and-grind cup the
  beans until they are weighed, then the grind when it comes back empty after 8 s off); a weight
  no container matches that is a bean or grind cup plus the beans (2 g less to 1 g more) after
  8 s off is the cup back with its grounds; the pump opens the extraction; a tap opens any
  phase. Opening a later phase ends the earlier ones, done if they weighed something, else
  skipped. A lift is a pause. During the shot nothing put on changes the phase. The live
  weights (the vessel's contents, plus what it carried back) and the target show; they are
  never stored. The vessel monitor gives no contents while the weight is below half the vessel
  (a lift not yet settled), so a lift doesn't zero the beans.
- **The flow is logged in raw**, as `ui-action`s `phase` (`{ phase, state, by }`), the way the
  manual start is: what the app and the user did, append-only, not a measurement. The first
  vessel of a brew announces the phase on screen, routed or not, so it is measured.
- **The record is post-hoc** (hard rule 3: live values are never stored). The analysis measures
  each logged beans, grind and milk phase on the zero-tracked stable levels (`measurePhases`,
  `RecordingAnalysis.phases`, analysis version 9): its vessel (on as it opened, or put on
  during it) weighed empty as it went on, and what it held at its last stable level; the grind's
  vessel is the beans' one when it comes on weighing that plus up to the beans and a gram (the
  cup back with its grounds); a vessel put back counts from where it went on; another vessel
  ends what can be measured. The runner gives each shot the last beans and grind phases before
  it and the first milk phase after it (`phasesOfShots`), on `ShotResult.phases`, and the shot
  card and the history show those.
- **The shot stores the phase states**, done or skipped (D-068), from the flow: the beans and the
  grind at "shot done" (never begun is skipped), the milk at Done or Skip milk, or skipped at
  Save for a milk drink left without it. `beansWeighedG`, `groundG` and `milkG` stay null: the
  analysis's values replace them, and older shots' still show where set.
- **The dose** (spec v2's targets) is the grounds weighed, else the beans, else the dose set on
  the shot (T1.18's), else the basket's size (`shotDose`): the live target uses the live
  weights the same way, and the ratio the analysis's. A live shot stores `doseG` null from now
  on. T1.18's dose stepper is gone (Q10's answer said the phases would replace it); the
  extraction screen says where the dose comes from (ground, beans, basket).
- **Where a brew starts:** on the beans when a bean cup is learned, else on the extraction, as
  before (Q22). After Save the next brew's router ignores what is still on the scale (the cup
  of the shot just saved); only a vessel put on from then on is routed.
- **The shot card** gains the board's phase rows: beans (`of` the basket, ticked within 0.5 g),
  grind (with the retention), and for a milk drink the milk: "Put the jug down to add the milk
  or Skip", then its weight against the yield × the milk ratio. Putting the jug down with the
  card open opens the milk view (Skip milk, Done); Done goes back to the card and analyses the
  recording again for the milk.

## D-080 — The beans phase's equipment: pickers in place; an unopened pack picked is opened

2026-10-05 · accepted (provisional where Q24 says) · T2.6, T2.2 · D-052, D-053, D-056, D-074

`src/ui/brew/equipment.tsx` (`PickerRow`, `BeansEquipment`), `packAgeAt` in
`src/core/model/snapshot.ts`.

- **The board's rows** (Brew-Beans): Machine, Basket and Pack in one card, each with what the
  brew uses (the last used, D-074) and, on a tap, a grid to pick another, "Your pick becomes the
  default", as the recipe picker does (T1.18). Once changed here the row says what it was ("was
  LM 17 g · now the default"). The basket's size is the beans' target, and the extraction's
  dose when no phase weighed one (D-079).
- **Packs in the flow (T2.2):** the grid lists the open packs (name · day off roast), then the
  unopened ones, then None. An unopened pack picked for a brew is opened today (Q24), so its
  days open start with its first brew. The pack in use can be finished from the picker with
  the optional "would buy again" (Q5), the same panel as Setup's; finishing leaves no pack in
  use until another is picked. No stock is kept (D-053).
- **No default pack before the first pick:** a pack is in use only once picked (or added first
  in Setup, D-077); with none, the row says None and shots record no pack.
- **Days off roast and days open** are derived from the shot's snapshot dates on the day it was
  pulled (`packAgeAt`), never stored (D-068) and not shown (D-056): there for later analysis.

## D-081 — The grind phase's grinder and setting in place; the last five retentions

2026-10-05 · accepted · T2.7, T2.3 · D-037, D-053, D-056, D-079, D-080

`GrindEquipment` in `src/ui/brew/equipment.tsx`, `RetentionCard` in `src/ui/brew/phases.tsx`,
`recentRetentions` in `src/ui/brew/format.ts`.

- **The board's rows** (Brew-Grind): Grinder, a picker like the beans' (D-080), and Setting, a
  stepper (0.1 for stepless, whole clicks) whose step is the grinder's `currentSetting` at once
  (an entity update), so it is the default next time and the shot's snapshot takes it at "shot
  done" (D-068). The row says what it was ("was 6.4 · now the default"). With no grind phase the
  shot records the grinder's setting as it stands (D-056).
- **Retention** is this brew's beans less its grounds (the live weights), and under it the
  grinder's last five from the shots the analysis weighed (`recentRetentions` over the history,
  newest first, that grinder's only), in tenths and no percentage: two 0.1 g readings make it
  good to about ±0.1 g, so it is read as a trend (D-037). The card shows only when it has
  something.

## D-082 — The milk phase: the milk ratio in place, the jug's near-weight warning

2026-10-05 · accepted (provisional where Q25 says) · T2.11 · D-052, D-078, D-079, D-080

`MilkEquipment` in `src/ui/brew/equipment.tsx`, `BrewFlow.setMilkRecipe` and `milkRecipes`,
`VesselOnScale.near` (`src/app/live-vessel.ts`), the vessel card's warning.

- **The milk ratio** (board Brew-Milk's row, "Cappuccino · milk 1:3") is the recipe's, picked
  from the milk drinks like the other pickers (D-080). The pick is the default; with the card
  open, the shot takes the drink's name and milk ratio (its coffee ratio stays the
  extraction's), so the milk target and the card follow it.
- **The jug's warning:** a recognised container with another within 3 g whose warning wasn't
  dismissed (`near`) shows "Close to Glass tumbler (182.0 g)" under it, on every phase's vessel
  card. "Not the jug?" (or "Not the cup?") picks that other container for the vessel in place
  (Q25: the board links to Setup › Containers, which would leave the brew).
- **Whole grams** for the milk, as the board writes it (64 g, target 106 g, 42 g to go), and on
  the card's milk row.
- **The milk read until the jug is lifted** (`ANALYSIS_VERSION` 10): Done is often tapped as
  the pour ends, before the scale settles, which left the card's milk "Not measured". A phase's
  vessel is now read until it is lifted, past the phase's own done (never past the next phase's
  open), and the flow analyses again 3 s and 10 s after Done, as after "shot done". Two faults
  of T2.5's measurement went with it: a pour fast enough to look like a vessel put on (milk
  from a carton) was taken for another vessel, and the bean cup back with the grounds was read
  as the beans put back (16.9 g of beans for 17.2 g). Now only a vessel put on after a lift can
  be the phase's put back, and not one still on as the next phase opens.
- The milk view itself (the target from the espresso's yield × the milk ratio, Skip milk and
  Done, the card's milk row) is T2.5's (D-079).

## D-083 — Maintenance: the dates, their reminders on Home and in Setup

2026-10-05 · accepted (provisional where Q26 and Q27 say) · T2.10 · D-053, D-074

`src/core/model/maintenance.ts`, `MaintenanceBlock` and `MaintenanceRow`
(`src/ui/setup/MaintenanceBlock.tsx`), the Machine and Grinders screens, Home's card, Setup's
Needs attention and Maintenance row (boards Setup-Machine, Setup-Grinders, Main, Setup).

- **Due** once the reminder's interval has run from the day it was last done (on that day: "due
  today", then "N days overdue", warn); **coming up** in the 7 days before ("in 3 days",
  "tomorrow", caution). Never logged, or without an interval, it raises nothing: there is no day
  to count from (Q27).
- **Where reminders show** (Q27): Home has a row for each date due, the most overdue first,
  between the scale card and the last shot (board Main draws only the overdue descale, while
  board Setup has the backflush and the grinder care coming up as well); Setup's Needs attention
  has the due and the coming up, each naming its machine or grinder. Setup's Maintenance row
  (board Setup) says the next one ("Descale overdue" in red) and opens the machine. Home names
  the machine only when there is more than one; a grinder's care always names its grinder.
- **Setting the dates** (Q26): the boards write "Reminder every 60 days" with no control. A tap
  on the dates opens "Last done" (the phone's date picker: what was done before the app, or on
  another day; a day still to come is refused) and "Reminder", a stepper through 7, 14, 21, 30,
  45, 60, 90, 120, 180 and 365 days (from none it starts at 30) with Clear. "Done today" stamps
  today, and is greyed once it has.
- Each grinder card shows its care, open or not (board Setup-Grinders). The dates go into each
  shot's snapshot at "shot done" (T2.1); nothing else reads them.

## D-084 — The taste nudge: the last shot's taste, at the beans and the grind

2026-10-05 · accepted (provisional where Q28 says) · T2.12 · D-054

`tasteNudge` (`src/core/model/nudge.ts`), `NudgeDismissal` (`src/app/nudge.ts`, `services.nudge`),
`TasteNudgeCard` (`src/ui/brew/nudge.tsx`; board Brew-Beans).

- **Which shot** (Q28): the newest listed shot with the brew's machine, grinder and coffee pack
  (none matching none, so a user who doesn't track packs still gets it). Sour says "grind a
  little finer", bitter "a little coarser", for a more balanced cup. A balanced or ungraded
  newest shot says nothing, even when an earlier one was sour: "last time" is that shot, and an
  ungraded one may already have been fixed. The spec says "the last graded shot"; the plan's
  "nothing after a balanced or ungraded shot" and the message's "Last time" decided it.
- **Where:** under the beans' readout (the board) and under the grind's retention, while it is
  not dismissed. Its line: the shot's day and time, the grinder in a word and its setting then
  ("Sat 07:05 · ORO 6.4").
- **Dismissed** per shot with ✕, kept on this device (`storage.local` `nudge.dismissedShotId`,
  not exported: a screen's state, not a setting), so it stays away until another shot brings
  one. A failed write dismisses it for the session.
- A pure function of the shots' metadata over the history's listed shots, newest first; no
  model, no learning (D-054).

## D-085 — History: a filter by what the shots recorded, and the trend of a figure

2026-10-05 · accepted (provisional where Q29 says) · T3.3 · D-053, D-068, D-070

`src/ui/history/filters.ts` and `trends.ts` (pure), `HistoryFilters.tsx`, `TrendCard.tsx`,
`HistoryScreen.tsx`. No board draws them (Q29): they are built from the boards' chips, cards and
segmented controls, and T3.5's design pass revisits them.

- **The filter** is a panel of chip groups under History's title (Filter, beside Compare), each
  offering only what some shot has, with its count: the coffee pack (by the name the newest shot
  recorded; "No pack" for shots without one), days off roast when pulled (0–7, 8–14, 15–28, 29+
  days), the grinder, then "Since care <date>" (shots that recorded the grinder's current care
  date: the stand-in for a burr epoch, D-053), the tags (every one picked, any case) and the
  taste (or "Not graded"). Closed, a line says what it keeps ("5 of 6 shots") with Clear. It
  reads only the shots' snapshots (D-068), so a pack or grinder renamed later still filters.
- **The trend** shows above a filtered list: a figure (first drip, time, ratio, yield) against
  the grind setting, the days off roast or the day; a dot per shot in its taste's colour (hollow
  when not graded), a tap opening it; a least-squares line from three shots at more than one x,
  and what it says per step ("First drip −0.5 s per 0.1 of grind, fitted over 5 shots"). Grind
  settings of different grinders share no axis, so the grind needs one grinder in the filter.
  Unfiltered, History looks as its board draws it.
- **No chart library:** the scatter is a few lines of SVG on the history's own chart look, far
  under the 20 kB the plan allows for one, and needs nothing a library would add.
- **Kept while the app runs:** the filter and the axes live in the History module, so a shot
  opened from the filtered list comes back to it; a reload starts unfiltered.

## D-086 — The design pass and the accessibility audit

2026-10-05 · accepted · T3.5 · D-001, D-045, D-073

- **The design pass:** each screen rendered beside its board (`design/ui-exploration/tools/
  render-dc.mjs`) in the boards' states: Main, Brew-Ready, Brew-Shot, Brew-Finish, Brew-Grind,
  Brew-Milk, History, History-Detail, History-Compare (and Setup's, Brew-Beans' with their
  tasks). They follow their boards. Fixed: the live view's recipe row shows the coffee ratio
  only, as Brew-Shot does; the milk's "Target = … espresso × 3" sits under its readout, not by
  the buttons; the card's pending milk line is 14 px, one line on a phone, as on Brew-Finish.
- **Not built, for the user:** Brew-Finish draws a chevron on the extraction row, linking to
  Brew-Shot. The card is the hub after the shot and its results chart is the shot's, so the app
  has no row link; the stepper is hidden on the card, as on the board. The grind picker shows
  the grinder's model whole ("ORO Mignon Single Dose Pro") where Brew-Grind abbreviates it.
- **Accessibility:** `scripts/e2e-a11y.mjs` runs axe-core (a dev dependency, 4.14) with WCAG
  2.2 A and AA and best practices on every screen in light and dark mode. Found and fixed: the
  brew's phase views had no level-one heading (now a screen-reader-only "Brew: beans" and so
  on: the boards show the stepper, not a title); Setup's automatic export had none (its panel's
  title is `h1` there); the probe's recordings table had an empty header. No contrast
  violation in either mode. Added a focus ring in the look's accent for keyboard focus, and the
  toggle's motion goes under `prefers-reduced-motion`.
- **The mode warning** (D-073) keeps its caution line and notice: the look's caution colours,
  no board to follow.
- **Preact stays on 10** (D-001): `@preact/preset-vite` is still 2.10.6 on prefresh 2.4.

## D-087 — pump_off where the flow stops, after a gush at the first drip

2026-10-06 · accepted · T1.26 · D-036, D-059

- **Session 3's shot** gushed at its first drip (2.2 g/s for a moment), fell to 0.5 g/s, climbed
  to 1.8 g/s over ten seconds and stopped dead (τ 0.16 s). The regime change's coarse step fits
  two lines through ln(flow) from 0.5 s after the flow first reaches 80% of its high: the gush
  reached it, so the fit took in the dip and the climb, and their bend (138.9 s) beat the stop
  (146.7 s). The fine fit there found no drain, and the shot had no pump_off.
- **The fix:** the coarse fit starts no earlier than `LAST_HIGH_LEAD_S`, 5 s, before the flow is
  last at 80% of its high. pump_off is where the flow falls from there, and 5 s of it is enough
  for the line before the knee. Session 2's shots and the simulator's 100 are unchanged (shot
  B's pump_off moves 10 ms); analysis version 11.
- **The fixture** is the phone's whole export (`fixtures/real/2026-10-06_first-brew_all.json`):
  byte for byte but for the serial number, masked as before, so it repeats sessions 1 and 2's
  recordings.

## D-088 — The user's answers after the first brew (Q30–Q32)

2026-10-06 · accepted (user) · T2.16, T2.17, T2.18

- **Q30, the scale mat:** learned as a container with a new role, "Scale accessory". Recognised,
  it is part of the platform: containers on it are recognised as usual, and it never opens a
  phase or gets a shot. The new role takes the export format to version 5; older files read
  unchanged. (Not one mat weight under Machine, nor "anything light left on".)
- **Q31, Home:** a known container put down while Home shows opens the brew on its phase, as
  spec v2 says ("Placing a known container opens its phase"), instead of Home's row suggesting
  it.
- **Q32, sound:** every brew records the microphone's sound levels, from the Connect tap on the
  brew screen; Setup › Microphone has the off switch. The levels are the data T3.1 needs.
- Also from the user: ✕ during a brew should reset the scale, tare and stop/reset the timer
  (T2.15); the empty bean cup back lost the weighed beans (T2.14); and taring during the phases
  without getting in the way is for the user to test first (Q33).

## D-089 — The empty bean cup back from the grinder keeps the beans

2026-10-06 · accepted · T2.14 · D-079

- **Session 3:** the user's bean cup has the bean role only. The router opened the grind for a
  cup back empty after the grinder only when it was a grind cup too, so the bean cup back empty
  reopened the beans and counted them from 0: by itself in one recording, and after Grind and
  Beans tapped with the cup off in the next. The user poured the beans again.
- **Now:** a bean cup, whatever its other roles, back after its beans were weighed and
  `grindMinMs` (8 s) off the scale opens the grind; the beans are done with their weight. Once
  they are done, a bean cup put back opens nothing (back sooner than 8 s, it stays with the
  grind), and only a tap opens the beans again. A tap on Beans then weighs what the cup holds
  from the tap: the user asked to weigh them again.
- **A tap on another phase** drops what the vessel carried in: the grounds a cup came back with
  are the grind's, not the beans'.
- **Not changed:** the live beans can read a few tenths high when a hand presses the cup as it
  lifts it (17.6 g live, 17.1 g in the analysis, in session 3). The live figure is display only;
  the card and History show the analysis's.

## D-090 — ✕ ends the brew and resets the scale

2026-10-06 · accepted · T2.15 · D-066, D-079

- **The user** (session 3): "stopping a brew early from the x should reset the scale: tare and
  stop/reset timers". A second Start with no shot had left the scale's timer running after the
  brew was left: the flow was detached, so the lapse's `05` and `06` never went out.
- **✕ ends the brew unless the shot card is open.** With the card open the brew isn't over (the
  milk, the grades), so ✕ only goes Home, as before. Otherwise, when connected, `05`, `06`,
  `01` with the reason `end-session`, the same as the cup's auto-tare: the timer stopped and
  zeroed whatever left it running, then a plain tare. Both monitors take the tare as the app's
  (`expectTare`), so a vessel on the scale stays on, with its contents.
- **The live shot starts over** (`ShotMonitor.startOver`): idle, the tare armed, any shot under
  way forgotten. A tap with no shot can't lapse into commands nobody answers, and an abandoned
  shot opens no card later. A real shot left by ✕ stays in the recording: the analysis finds it,
  and it becomes a post-hoc shot once the recording ends.
- **The open phase ends in the log** (`PhaseRouter.end`: done if it weighed something, else
  skipped, `by: 'user'`), so the analysis's span stops at ✕ instead of running into the next
  brew's phase of the same name. No new phase cause: the log's format is unchanged.
- **The next brew starts afresh:** a new router, which takes what is on the scale as its first
  vessel when the screen is next shown (as a brew opened fresh does), so a bean cup still on is
  weighed in the new brew.
- **A skipped phase holds nothing for its shot** (`phasesOfShots`): the ended brew's beans and
  grounds stay in the recording, the last before the next shot, which may skip them. The shot
  records its phases as done or skipped, so a skipped one now gets no weight, and its dose
  falls back to the basket, as the card's "Skipped" row already said. This is computed with the
  shots when they are read, not stored: `ANALYSIS_VERSION` stays 11.

## D-091 — Home opens the brew for a container put down

2026-10-06 · accepted (Q31) · T2.16 · D-078, D-079

- **The user's answer (Q31):** a known container put down while Home shows opens the brew on its
  phase, as spec v2 says, instead of Home's row suggesting it.
- **Put down while Home shows:** a vessel that went on after Home opened, recognised as it went
  on (or as its mass settled), or one the user picks on Home ("Which container is it?"). The
  vessel on the scale as Home opened doesn't open it, nor a pick made before: ✕ with the cup
  still on comes back to Home and stays. Lifted and put down again, it opens the brew.
- **The brew routes it:** Home only goes to `#/brew` (a history entry, so Back is Home); the brew
  flow takes the container on the scale as it attaches, as when the brew is opened by its tab.
  A container no one knows stays on Home, its row offering Setup › Containers.
- K2–K4 are rewritten for it: they were written for Home's row only.

## D-092 — The scale mat: a container that is part of the platform

2026-10-06 · accepted (Q30) · T2.17 · D-078, D-088

- **The user's answer (Q30):** the mat (15.5 g), which protects the scale, is learned as a
  container with the role "Scale accessory" (`accessory`), and is ignored from the measurements.
  Put on while connected in session 3, it was taken for a vessel, so containers on it were its
  contents and weren't recognised.
- **Part of the platform:** the live vessel monitor takes an accessory on the scale into the
  platform (`VesselMonitor.absorb`) as soon as the app knows it is one: recognised as it goes
  on, picked on Home, or learned in Setup while on (checked at every frame). The next vessel is
  put on from it, so it weighs itself, and is recognised as usual. Lifted, the platform's level
  just falls. The live shot is told too (`ShotMonitor.platform`): a heavier accessory than the
  mat would look like a cup, and the cup put on it would get no tare.
- **Nothing else sees it:** `onScale` never shows an accessory, so the router opens no phase for
  it, Home doesn't open the brew for it, and no shot records it. The analysis gives a segment in
  one no post-hoc shot (`knownNotCup`).
- **One role only:** Setup's chip turns the others off, and another turns it off; anywhere else
  the accessory role wins.
- **Learning weighs the last thing put on** (`useReading`): the vessel's mass, or what went on
  top of it. A cup put on a mat not learned yet weighs itself, not the mat; and with the mat
  learned, a container on it weighs itself (the app saw it put on).
- **Export format 5:** the new role value; a version 4 file holds none, so it imports unchanged.
  The database needs no migration: the stored containers stay valid.
- **Not done:** the analysis measures the phases from the steps, without the containers. A mat
  put on during a phase opened by a tap, before the phase's vessel, would be taken for that
  vessel. Put on before the brew, or on its own, it changes nothing; giving the analysis the
  containers would make the cached phases depend on metadata. A follow-up if it happens.

## D-093 — Sound levels with every brew

2026-10-06 · accepted (Q32), the tap provisional (Q34) · T2.18 · D-037, D-049, D-050

- **The user's answer (Q32):** every brew records the microphone's sound levels, from the Connect
  tap on the brew screen, with an off switch in Setup › Microphone. They are what T3.1 (the pump
  and grinder detector) needs.
- **A tap opens the microphone:** Safari needs one for the microphone and Web Audio, and each
  opening holds the scale's notifications back for half a second (D-037), so it opens once,
  before the shot, and stays open across recordings (T1.24's `SoundCapture`). The brew screen
  hands every tap but Start and ✕ to `BrewSound.tap()`, after the tap's own handler, in the
  same tap: Connect's, or, once the scale reconnects by itself (T1.21) and there is no Connect
  tap, the first other one. Never Start, made as the pump starts; ✕ leaves. Whether that first
  tap is right is Q34 (provisional).
- **The switch** is on by default and kept on the device (`storage.local`, never exported:
  D-030), like the nudge's dismissal. Off, it stops the levels it started; the probe's Record
  sound stays the probe's.
- **A refusal is final for the session:** `denied` or `unsupported` (`SoundCapture.state
  .lastStart`) isn't asked again until the app reloads; an `error` is, at the next tap. The brew
  goes on either way, with no notice: the probe's Sound levels panel says why.

## D-094 — The user's rule for taring, and the grind before its grounds (Q33)

2026-10-06 · accepted (user) · T2.20, T2.21 · D-066

- **Q33, taring during the phases:** "we should tare the scale at the beginning of each phase,
  if there is no weight or only negative weight there", and "use taring more wherever
  appropriate as we are still working with real weight". The scale's own display is the user's
  reference while pouring: it should show what the app shows. T2.20 turns this into rules.
- **The grind phase with the bean cup lifted** should show no weight from the beans, and no
  retention of the whole beans, but ask for the bean cup back with the grounds, or to skip the
  phase (T2.21).
- Seen in session 4 too (app `7ec6888`): the tare at the Start tap read as 128 g gone, when its
  reading arrived before the app logged the command (T2.19); a cup put down before the brew
  screen opened, and a cup swapped in within a second, weren't tared (T2.20).

## D-095 — The app's own tares are expected from when they are sent

2026-10-06 · accepted · T2.19 · D-066

- **Session 4:** Start's `07` zeroed 128 g on the scale (the cup had gone on untared), and the
  reading of 0 arrived before the app logged the command: frame seq 5859, `command-sent` 5860.
  The live weight expects the app's tares from their `command-sent`, so it took the step for
  128 g gone, and the shot counted down from "162 g to go". The analysis read the shot right.
- In every real recording, a `07`'s reading follows its write at once, a `01`'s a frame later:
  the write resolves after the scale has answered, about when its notification arrives.
- **Expect a tare from when it is sent.** The Start tap's `manual-start` is logged before its
  `07` goes out, so both live monitors expect a tare from it (`announcesTare`, which replays of
  recordings see too). And the recorder says which command goes to the transport, before the
  write (`onSending`, not logged): `LiveShot` and `LiveVessel` expect every tare from there. A
  second expectation from the `command-sent` is harmless: once the step is taken, the scale
  reads 0 and nothing more is looked for.
- An expectation lapses after `tareWindowMs` (1 s): a tare queued behind other commands
  (`05`, `06`, `01`) lands within about half a second.

## D-096 — The user's tares: at a phase's start, and wherever it helps

2026-10-06 · accepted · T2.20 · D-066, D-094

- **The rule** (`wantsTare`): the scale wants a tare when its reading is steady, isn't 0 (more
  than 0.15 g either way), and nothing is on it (a cup lifted off a scale tared with it reads
  negative; a mat the scale wasn't zeroed with reads its weight), or the vessel on it holds
  nothing for the open phase and reads its own weight. Never a vessel holding what its phase
  weighs: the scale shows that, as the app does.
- **When:** as the brew screen opens (a cup put down with Home showing had its tare asked for
  with no screen to send it, session 4), and when a phase opens by a tap, or by a container too
  light for the live shot to take for a cup (under 20 g). A container put on gets the cup's own
  tare, as before. Never while the shot pours. Not for the grind while the bean cup is off with
  its beans weighed: tared empty at the beans, the scale shows the grounds when it comes back,
  which the user's own rule would lose. The commands are the cup's, `05`, `06`, `01`, with the
  reason `phase-tare`: the scale's timer stays ready for the Start tap's `07`.
- **The cup's own tare waits for the frame's end:** the live shot asks for it before the vessel
  monitor has the frame, so the flow holds it until both have, and drops it for a vessel
  carrying what its phase weighs. The bean cup back with its grounds was tared before (session
  4 at 181 s): now the scale shows the grounds.
- **A cup swapped in fast is a new cup:** in session 4 the coffee cup went on 1.4 s after the
  bean cup came off, never steady in between, so the live shot took it for a vessel on top and
  didn't tare it. Before the shot, a stable rise of 20 g or more after a jump is now a new cup,
  tared. A rise with no jump is a pour: a shot started with no tap goes on counting from the cup.
- **Setup › Containers** tares the scale whenever nothing is on it (`tareWhileEmpty`, a plain
  `01`, reason `setup-tare`), once per spell with nothing on, so a scale that ignores tares
  isn't asked again and again.
- **One tare at a time:** none within a second of the last (`TARE_SPACING_MS`), so the phase's
  and the cup's never both go out.

## D-097 — The grind before its grounds

2026-10-06 · accepted · T2.21 · D-089, D-094

- **Live:** a tap on Grind with a vessel on, the grind open or not, weighs only what goes into
  that vessel from the tap (`PhaseRouter`: what it holds at the next measure is held back until
  it comes off). The beans in the bean cup aren't grounds; what a cup carried back from the
  grinder stays. Session 4 tapped Grind twice with beans in the cup: at 41.5 s, and at 137.6 s,
  after the empty cup came back while the grind was open and beans were poured in again (done
  beans reopen only by a tap, D-089, so that pour was the grind's until the tap). A tap on the
  open grind changes no phase and logs nothing; the analysis doesn't need it.
- **The grind view:** less than 0.3 g of grounds (`HOLDS_NOTHING_G`, the phases' least) is none.
  The readout shows 0.0, as the other live readouts do with nothing to show (a dash at that
  size is a bar), there is no retention, and a card asks for the bean cup with the grounds, or
  with a vessel on to grind and put the cup back, beside **Skip grind**. Skip grind opens the
  extraction, as its tab does: the grind is skipped when it weighed nothing. The user's nudge
  (session 4); no board draws it, Skip milk is its model.
- **Analysis, version 12:** a grind whose vessel at its open is the very placement the beans
  were last read on (not lifted since) weighs only what that vessel comes back with after a
  lift. Matching the placement, not the weight, matters: the bean cup back empty from the
  grinder weighs what the beans' vessel did, but it is a new placement, and grounds tipped into
  it on the scale count as before. Session 4's first grind (tapped, then back to Beans) is now
  null, and so is session 3's first (9.6 g of beans); the shots' beans and grounds don't change.
- **The router's log ends a phase and opens the next in one breath** (`beans done` and `grind
  open`, within a millisecond). The spans took that `done` for the phase's own end, so D-082's
  rule, a vessel still on as the next phase opens is that phase's, never applied to a real log:
  the cup back with its grounds was the beans' vessel put back, and the beans read the grounds
  (brew-flow's simulated brew: 16.9 g for 17.2 g). Now a `done` or `skipped` logged within 50 ms
  of another phase's open by a container is ended by that open. Not at a tap: the vessel on
  then is the phase's own (session 3 put the empty cup back during the beans, poured its second
  beans into it, then tapped Grind).
- Not done: the milk tapped open with the shot cup on would count the espresso as milk, the
  same pattern; not seen, as the milk goes into a jug.

## D-098 — With the grind open, the cup back brings its grounds, whatever the retention

2026-10-06 · accepted (user, 2026-10-07) · T2.22 · D-079, D-096, D-097

- Session 5: Grind tapped with the bean cup at the grinder; the cup came back with 14.6 g of
  grounds from 17.8 g of beans. The router took a cup back for the grounds only within 2 g of
  the beans (`retentionMaxG`), a window meant for opening the grind by itself from the beans.
  The grind held nothing, so the flow's guard (no cup tare for a vessel carrying its phase's
  weight, D-096) didn't apply: the cup's tare zeroed the grounds, and again at each put-back.
- Now, with the grind open, a bean or grind cup back carrying from 0.3 g up to the beans (and
  `carriedExtraG`, 1 g, more) is the grounds, whatever the grinder kept; with no beans weighed,
  whatever it carries. The 2 g window still decides whether a cup back opens the grind by
  itself while the beans are open.
- More than the beans and a gram is no cup of grounds: those grams stay unclaimed.
- The user (2026-10-07): the 3.2 g were beans taken out by hand to show a friend, not
  retention; "the new rule seems more fitting generally".

## D-099 — The cup back too soon brings no grounds, and a cup carrying anything is never tared

2026-10-07 · accepted · T2.23 · D-096, D-097, D-098

- Session 6: Grind tapped with the beans in the cup; the cup lifted and back 4.7 s later with
  them. D-098 took any cup back to the open grind for its grounds, so the beans became 17 g of
  grounds. The cup now counts as back from the grinder only after `grindMinMs` (8 s, already
  the rule for opening the grind by itself) off the scale; back sooner, its beans stay out of
  the grind, and the grind asks for the cup with the grounds.
- The cup's own tare no longer hangs on what the router took the cup for: in the beans or the
  grind, a vessel that is a bean or grind cup carrying from 0.3 g up to the beans (or 30 g, a
  dose, none weighed) and a gram is never tared (`PhaseRouter.carries`). That is the user's
  rule (Q33): tare only what is empty or reads negative.
- A cup lifted off with what Grind's tap held back reads a gram or two more as the hand lifts it
  (session 6: 1.0 g, shown as Ground with the cup off). Under 2 g (`liftNoiseG`, provisional,
  P20) is dropped when the cup comes off; a real grind into the cup on the scale weighs more.

## D-100 — The phases move by the cups: beans to grind at the lift, grind to extraction at the cup

2026-10-07 · accepted (user) · T2.24 · D-079, D-089, D-098, D-099

The user (2026-10-07): "we need to figure out a way on how to transition between beans and
grind. And it needs to be a stable rule. The idea is to avoid having to tap to change the
phase"; "I don't think we need the rule of … the cup needs to have been off for at least X
seconds … we treat whatever comes back as the grind … We just need to take the configuration
of the bean cup from the first phase and use that"; and from the grind, "once … the coffee cup
has been placed, we take the last measurement and switch to extraction".

- **Beans → grind:** the cup the beans were weighed in, lifted with them in it (0.3 g or more),
  ends the beans and opens the grind (logged `by: 'container'`). A lift with nothing weighed is
  a pause.
- **The grind:** that cup is the grind's. Whatever it brings back is the grounds: its weight
  less what it weighed empty (the bean cup's learned empty weight, or what it weighed as the
  beans went in), however long it was off, whatever the grinder kept. No time limit (D-099's
  8 s goes) and no window around the beans (D-098's). Each return is the grind's last weight;
  back empty (the grounds tipped out), the last weight stands. Limits: lighter than the cup
  empty, or more than a dose (30 g) and a gram, it is another vessel.
- **Grind → extraction:** the coffee cup (a container with the cup role) put down ends the
  grind with its last weight, as before.
- The cup carrying beans or grounds is never tared (D-099 stays): the scale shows them.
- The analysis (version 13) measures the same: the grind's vessel is the beans' one with up to a
  dose in it; put back empty, the last grounds stand. No fixture's phases change.
- **The microphone:** no detection of the milk steamer (it only bears on the milk's volume) and
  none of the grinder, which voices imitate (session 5). T3.1 is the pump only.

## D-101 — No grind phase, no phase tabs: the beans, the extraction and the milk

2026-10-07 · accepted (user) · T2.25, T2.26, T2.27 · supersedes D-081's grind phase, D-089,
D-097–D-100 for the grind; deviates from spec v2 "Brew phases" and the Brew-Grind board

The user (2026-10-07): "remove the grind phase and data collection relevant to that phase, in
particular the grinder retention and container. we move the grind setting to the bean phase";
"we remove the tab on the brew screen"; "goal is to remove action clutter. we don't need to
design finicky ways to transition between bean and grind when grind retention doesn't provide
any actually useful or actionable information."

- **No grind phase:** the router never opens, closes or logs it; a tap on it does nothing. The
  grinder and its setting are on the beans screen. No grounds are weighed, no retention shown
  (the card, History, Compare's "Ground" row, the brew's "Last 5"). A shot's dose is its beans
  (else the dose set, else the basket): analysis 14 gives no shot grounds, the old recordings'
  included.
- **No phase tabs:** the brew's phase follows what goes on the scale: the bean cup the beans,
  the coffee cup the extraction, the jug the milk once the shot is done; the pump (Start) the
  extraction.
- **The beans through the grinder:** a lift is a pause. The bean cup put back with what it
  carried is the beans going on (the grounds back from the grinder are counted the same way);
  put back empty (the beans in the grinder), the beans weighed stand until more go in. The cup
  carrying something is never tared (D-099).
- **The stored schema is unchanged** (hard rule 6, the export format 5): `grindPhase`,
  `groundG` and the `grind` container role stay, null or unused for new shots; old exports
  import as before. A container with the old grind role is a bean cup; Setup no longer offers
  the role.
- **The microphone:** no grinder or steamer detection (D-100 stands).
- **The milk** (T2.26): no tab and no buttons. With the card open after the shot, the jug put
  down opens the milk screen; the jug lifted having held 10 g or more ends it (done), as the
  user put it: "the milk phase ends after the container has been there and filled with weight
  before being lifted off. if the container has no weight inside and is lifted and placed again
  with the same weight the phase continues". A quiet "Not now" skips it.
- **Home's timer button** (T2.27): "on the landing screen we add a button to start/stop/reset
  the timer (on one button, change label wrt the action)". It reads the scale's timer from its
  frames: running → Stop, stopped above 0 → Reset, at 0 → Start; `04`, `05`, `06`, reason
  `home-timer`.

## D-102 — The grinder's step, no machine row in the beans, the scale's own name

2026-10-07 (T2.28–T2.30). The user: "to the grinder config add a step size for configuring the
grind size. currently it's in steps of 0.1 but for my oro being stepless it's more convenient
to use steps of 0.05 so I can mark between marking states. when configured +\- changes setting
with the step amount in the relevant direction."

- **The step is the grinder's** (`Grinder.settingStep`, null for the default 0.1): Setup offers
  0.05, 0.1, 0.25, 0.5 and 1 for a stepless grinder; − and + move its setting by it, on Setup and
  on the beans screen. A clicks grinder always steps one click (its setting is whole, D-019), so
  the field is offered for stepless only and kept, unused, when the kind changes.
- **From where it is, not on a grid:** a step adds to the setting as it is, so a setting of 6.05
  goes to 6.15 by a step of 0.1; the old stepper snapped to the step's grid, which would have
  turned 6.05 into 6.1 or 6.2. Settings are kept to 3 decimals.
- **Written as it is:** a stepless setting shows one decimal, or two when it falls between
  (`6.05`); before, 6.25 showed as 6.3.
- **The export format 6** (hard rule 7): a grinder has `settingStep`. The user asked for the
  setting to be stored, which is the approval CLAUDE.md asks for. A version 5 file's grinders
  read it as null, as stored grinders do (missing nullable fields read as null, D-018), so no
  database migration is needed.
- **No machine row in the beans** (T2.29): "remove the machine selector from the bean phase.
  changes to that are extremely unlikely and simply consumes space. remove it from that display
  only, keep it in settings." The beans keep the basket (from the machine in use, the beans'
  target) and the pack; Setup's Machine page picks the machine (Make default).
- **The scale's own name** (T2.30): "make the scale's name tappable. when tapped we can set a
  custom name persisted for future sessions." A tap on Home's scale name opens a field in its
  place: Enter or leaving it keeps the name, Escape doesn't, a blank name (or the scale's own)
  gives the scale its own name back; 40 characters at most. It is a setting (`kv`
  `scale.names`, carried by a full export, back with a restore), keyed by the name the scale
  advertises (`BOOKOO_SC …`): the same in every browser, where the browser's id for it is per
  origin and per browser (beacio and Bluefy would differ). Two scales keep two names. Only the
  screens use it: a recording's device name is raw and stays the advertised one, and the probe
  shows that.

## D-103 — The beans screen: the figure first, and the way on to the extraction

2026-10-07 (T2.31). The user: "the brew process does not list an extraction phase", "next to
the basket name, provide the grams, the same way you display pack age", "remove the lift to
pour hint", "we can display a hint "place coffee cup to start extraction" when weight has
settled after pouring beans", "move the pickers on the bottom. they take too much space now
and the grams get pushed down which is the most important piece of the screen". Asked what the
first meant, they chose "hint plus a way in" over a passive list of the phases.

- **Order:** the cup's card, the beans' figure, the hint, the taste nudge, then the basket and
  pack and the grinder card.
- **The hint** ("Place the coffee cup to start the extraction") shows once beans are weighed
  (0.3 g or more) and the scale's weight holds still, or the bean cup is off (at the grinder):
  `beansSettled`. It is also a link: a tap opens the extraction (`selectPhase`), for a cup the
  app doesn't recognise, which otherwise left no way out of the beans (D-101 took the tabs).
  Quiet: ink, underlined, not the accent.
- **The basket row** reads `LM 17 g · 17.0 g`, its size beside its name, as the pack's
  `· day 12`.
- **No "Lift to pour some back" line.**
- The user's machine row (T2.29) was already gone in the deployed build; their phone likely
  showed the build before it (GitHub Pages lets a browser keep a page for 10 minutes).

