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

2026-10-03 · accepted · revised 2026-10-04 (T1.22) to hardware session 1 · T1.16 checks it
against real shots

What it models is in `docs/ARCHITECTURE.md` "Simulator", and every parameter with its default
in `src/core/sim/params.ts` and `shot.ts`. Each choice below says where it comes from: **S1** is
hardware session 1 (D-037), and **open** names the hardware test that will settle it, with the
value marked `PROVISIONAL(U1.1: <test>)` in the code (D-029). When a result comes in, update
the simulator to match. `src/core/real-fixtures.test.ts` holds an idle simulated session up
against S1's recording.

**From session 1:**

- **Sampling.** A sample every 100 ms of the scale's clock, which runs 0.69% slow (−6,940 ppm):
  a frame every 100.7 ms of the phone's. Each sample instant has ±1 ms of jitter, which no
  recording can tell from the link's.
- **Weight.** Rounded to 0.1 g; the frame carries hundredths. White noise of σ 0.012 g before
  the rounding, so a reading at rest holds still (S1: not one change in 92 s), while the scale's
  own flow figure, the change of the unrounded weight over a second, moves by about σ 0.017
  g/s (S1: 0.018). Not modelled: the readings a hundredth short of a tenth while the weight
  moves fast (S1: 19 of 3,359), which the analysis takes in its stride.
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
- **The flow-rate mode.** No timer: `04` to `07` are ignored, and a tare works. Open: A4 and
  A5 are to be repeated in this mode.
- **`03 0D` frames** go to FF12 as the automatic mode's run starts and ends, with every field 0
  but the state, as the Mini sent them (S1). No other mode sends any.
- **Physical tare.** It sends nothing (S1, A7: one press; to repeat), and waits for the next
  frame like a commanded tare (open, C4).
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

**Still assumed (open):**

- **Smoothing** (A13: S1 showed only that the off command takes effect by the second frame):
  when on, it filters the weight (an EMA, τ 500 ms), not just the scale's flow figure. The spec
  turns it off because it would bias the tail fit, which reads only the weight, so the
  pessimistic reading is the useful one. It's off by default, the state the recorder leaves
  (spec parsing rule 5). `demoScenario` starts with it on, so the recorder's confirmation logic
  has work to do.
- **Vibration** (A2): white noise with σ `vibrationSigmaG` (0.1 g) added to every sample while
  the pump runs, which leaves the mean alone, as the spec's segmentation assumes. σ 0 is the
  spec's fallback case. At 0.1 g steps it has to reach about ±0.05 g to show at all.
- **Settling** (C2): a vessel put down or lifted settles exponentially, τ 100 ms.
- **Drops** (C3): liquid lands in drops of 0.05 g.
- **A tare zeroes the noise-free gross mass** at that instant, as if the scale averaged first.
- **Shots** follow `shot.ts`: no liquid in the pre-infusion, a flow profile, an exponential
  tail (C3).

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

2026-10-03 · accepted (U1.1 checks it on the phone: B2, B3, A14, A15)

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

2026-10-04 · accepted · refines D-006 · T1.16 checks it on real recordings (A1)

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

2026-10-04 · accepted · the first_drip acceptance is the user's

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

2026-10-04 · accepted · the pump_on acceptance is the user's

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

2026-10-04 · accepted · the user's decision

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

2026-10-04 · accepted · T1.22

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
