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

2026-10-03 · accepted

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

2026-10-03 · accepted

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

2026-10-03 · accepted (T1.16 checks it against real recordings)

What it models is in `docs/ARCHITECTURE.md` "Simulator", and every parameter with its default
in `src/core/sim/params.ts` and `shot.ts`. These are the choices a later agent would otherwise
have to rediscover. Each names the hardware test that will confirm or correct it; when a result
comes in, update the simulator to match.

- **Timer** (A4, A5, A12): `04` resumes a stopped timer from where it froze and does nothing
  while it runs. `05` freezes it, and `06` zeroes and stops it. `07` tares, zeroes and starts it,
  even while it runs, so a second `07` gives two stitched runs (T1.9). No command is gated by a
  display mode.
- **Smoothing** (A13): when on, it filters the weight (an EMA, τ 500 ms), not just the scale's
  flow figure. The spec turns it off because it would bias the tail fit, which reads only the
  weight, so the pessimistic reading is the useful one. It's off by default, the state the
  recorder leaves (spec parsing rule 5). `demoScenario` starts with it on, so the recorder's
  confirmation logic has work to do.
- **Standby** (A6): the frame reports the auto-off setting. There's no countdown and no
  automatic switch-off, and keep-alive (`25`) changes nothing visible. A script ends a session
  with `power-off`; the phone notices after the BLE supervision timeout (2 s).
- **Physical tare** (A7): it zeroes the scale and sends nothing.
- **`03 0D` events** (protocol-notes, finding 8): off by default. When `timerEvents` names a
  characteristic, the scale sends a started or stopped frame there, in the Ultra layout, when the
  timer starts or stops. It exists so FF12 handling can be exercised (T1.6, T1.8).
- **Vibration** (A2): white noise with σ `vibrationSigmaG` added to every sample while the pump
  runs, which leaves the mean alone, as the spec's segmentation assumes. σ 0 is the spec's
  fallback case.
- **Tare** zeroes the noise-free gross mass at that instant, as if the scale averaged first.
- **Ground truth is about the liquid**, not the reading: `first_drip` is when liquid starts to
  land (the first drop), yield is everything the shot delivers in whole drops, `settled` is when
  that is within 0.05 g (the spec's stability band), and honest yield is what has landed at the
  first `cup-off` after `pump_on`. With drops off, yield is exactly w(pump_off) + ẇ(pump_off)·τ.
- **Determinism:** one seed, one named random stream per effect (`Rng.fork`), and a fixed number
  of draws per sample and per frame. A session doesn't depend on how it is stepped, so
  `MockTransport` and `simulateSession` agree frame for frame. Switching one effect on (vibration,
  drops, a flush) leaves every other effect's numbers unchanged, which keeps A/B tests honest.
  It is deterministic on one JS engine; `Math.log` and `Math.cos` may differ in the last bit
  between engines.
- The defaults are guesses (D-013): 10 Hz, clock drift 300 ppm, 0.01 g resolution, noise σ
  0.015 g, vibration σ 0.1 g, 0.05 g drops, command latency 40 ms; on the link, 15 ms latency, a
  30 ms connection interval, 8 ms mean jitter, and a 100–400 ms stall on 0.3% of frames.

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

2026-10-04 · accepted (user) · supersedes D-003, answers Q1

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
