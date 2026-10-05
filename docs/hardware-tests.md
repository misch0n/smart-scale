# Hardware and runtime tests (user)

Agents can't touch the scale, the machine or the phone, so these tests are yours. Fill in the
**Result** column, or paste your notes or screenshots to an agent and it will record them here.
Once a Part A answer is in, an agent also copies it into `docs/spec-v2.md`'s table in "Unknowns to test
before building", as the spec asks.

Part A is the spec's Phase 0. You can run it with nRF Connect or LightBlue (no code needed), or
with the in-app probe, which is deployed (T1.8). The probe records everything it sees, so its
recordings double as test fixtures. Part B needs the deployed app on the phone, in beacio first
(D-016). Part C lists the recordings to capture for the analysis work.

Byte numbers below are **1-based**, as in the spec. Code uses 0-based offsets
(`docs/protocol-notes.md`).

A result marked (S1) or (S2) comes from session 1 or 2; "Sessions" at the end has the details.

## Using the probe (T1.8)

Open <https://misch0n.github.io/smart-scale/> in a Safari tab with beacio; the app opens on the
probe (`#/probe`). Tap **Connect** and pick the scale. Everything from Connect to Disconnect is recorded,
and the recording appears under **Recordings**, where **Export** turns it into a file. The probe
turns smoothing off by itself; "Smoothing (A13)" reads `confirmed` once a frame shows it off.
The annotation buttons and the note field put marks on the recording's timeline.
**Record sound** (under Sound levels) records the microphone's loudness in a few bands, 20
times a second, into every recording until **Stop sound**: before Connect or after, it stays on
across Disconnect and Connect. No audio is kept.

Where each answer shows:

| Test | Where on the probe |
| --- | --- |
| A1 | Recording: "Timer gaps (A1)" once the timer runs (tap **Tare + start**), and "FF11 arrival gaps" |
| A2 | Weight statistics: σ over the last 0.5 s and 2 s, before the pump, during it and after. Tap **pump on** and **pump off** as they happen |
| A3, A8 | Scale: the weight |
| A4, A5, A12 | Commands: **Start timer**, **Tare + start**, **Stop timer**, **Reset timer**; Scale: "Timer (bytes 3–5)" |
| A6 | Scale: "Standby (bytes 15–16)"; Commands: **Keep-alive (unverified)** |
| A7 | "FF12 frames", highlighted once anything arrives. FF11 frames that aren't weight frames are highlighted too |
| A9, A10 | Recording: "Unit byte (A9)"; Weight statistics: "Sign bytes seen (A10)" |
| A11 | Weight statistics: "Smallest step (A11)", and σ over the last 10 s on an empty, still platform |
| A13 | Recording: "Smoothing (A13)" |
| A14 | Connection: the device name. Whether 0FFE is advertised can't be seen from the browser; nRF Connect shows it |
| A15 | Connection: "FF11 properties" and "FF12 properties" |
| A16 | Recording: "Failed frames (A16)". If nearly all fail, the checksum doesn't match |
| B2 | Connection: the state line, which names the step that failed |
| B3 | Connection: **Reconnect known device**, and the line under the state: Web Bluetooth, `getDevices()`, the remembered scale, the failed attempts. The box below it holds the last error |
| B4 | Recording: "Longest silence (B4)". The events list shows `page-hidden` and `page-visible` |
| B5 | Connection: "Screen wake lock", which says `held` or why not. **Keep screen on** asks again |
| B6 | This browser: "Persistent storage" |
| B7 | Recordings: **Export**, then **Download** or **Share…** |
| B8 | Microphone: **Try microphone**. Sound levels: **Record sound**, its status line and the levels |
| B10 | Automatic export: the status line, and **Settings** |

## The brew flow on the phone (T1.18)

Open <https://misch0n.github.io/smart-scale/#/brew> (or **Brew a shot ›** at the top of the
probe). It is the extraction screen, then the live view, then the shot card, in the Instrument
look, light or dark as the phone is set. Pull a shot the usual way and check:

| # | Check | Expected | Result |
| --- | --- | --- | --- |
| D1 | **Connect scale**, then put the cup down | One tap connects; the card turns to "Cup · <its weight> g · on the scale" about a second after the cup settles, and the scale's display zeroes (a plain tare, D-066). The screen stays on | |
| D2 | The recipe and the dose | Tap the recipe to pick another; tap the dose ("18.0") for − and + (hold to repeat). The big target is dose × ratio. Reload the page: both are kept | |
| D3 | Tap **Start** as the pump starts | The live view opens: "x g to go" with the bar, the flow, the time from the tap, the chart; the scale's own timer starts from 0. Readable from about a metre? | |
| D4 | Past the target | "Target reached" in green up to +1.0 g, then "Over target" in red; "Pump off at … s" once the pump stops | |
| D5 | "Shot done" | About a second after the drips stop, the shot card opens and the scale's timer stops. Within a few seconds: yield, time and ratio against the target, first drip, extraction, average flow and a small chart. Do they look right against what you saw? | |
| D6 | Grades and Save | Tap a taste, toggle channelling, tap or add tags, **Save shot**: back to the extraction screen. Export the recording from the probe: the shot carries them | |
| D7 | Dark and light | The screens follow the phone's setting | |

## The reconnect on the phone (T1.21, B3)

The app remembers the scale on the phone and reconnects to it by itself, without the chooser,
and keeps trying while the scale is off (D-071). Open <https://misch0n.github.io/smart-scale/#/brew>
in Safari with beacio; if something fails there, repeat it in Bluefy. Check:

| # | Check | Expected | Result |
| --- | --- | --- | --- |
| R1 | **Connect scale** once (the chooser), then reload the page | After the reload, "Waiting for the scale…" for a moment, then the cup card: connected with no tap and no chooser | |
| R2 | Force-quit Safari, then open the app again | As R1 | |
| R3 | With the app open and connected, switch the scale off; wait 30 s; switch it on | "Waiting for the scale…" while it is off; it connects by itself within about 10 s of switching on | |
| R4 | While it waits, tap **Stop**, then **Connect scale** | Stop: "Not connected", and no more tries. Connect scale: connects without the chooser | |
| R5 | While it waits, tap **Choose scale** | The chooser opens | |
| R6 | Set beacio to "Allow for One Day" for the site (or wait for it to lapse), then open the app | If Web Bluetooth comes late, the app connects by itself. If it never comes: after about 10 s, "No Bluetooth" with **Reload**; setting beacio to "Always Allow on This Website" and reloading fixes it | |
| R7 | After a reconnect with no tap, tap anything (**Start**, say), then check the probe's "Screen wake lock" | The first tap gets the screen wake lock: `held` | |

If R1 or R2 fails, open the probe (`#/probe`): its Connection panel shows whether Web Bluetooth
and `getDevices()` are there, the remembered scale, the failed tries and the last error. Copy
them into B3. If the browser can't reconnect without the chooser at all, the next agent asks
whether to move the Capacitor wrapper (T3.4) up the order (spec "Re-pairing — check early").

## Part A — Scale protocol (spec Phase 0, plus extras from protocol research)

| # | Question | How | Result |
| --- | --- | --- | --- |
| A1 | Notification rate | Subscribe to `FF11` with the timer running. Diff consecutive ms fields (bytes 3–5) and note the arrival spacing too | **9.93 Hz** (S1): a frame every 100.70 ms of the phone's clock, and none lost in 338 s. The timer field moves 100 ms per frame: 0.1 s ticks of the scale's own clock, which runs 0.70% slow. Arrival gaps are multiples of about 30 ms (median 91 ms, p99 152 ms) |
| A2 | Does pump vibration reach the weight signal? **(Load-bearing for the segmentation design)** | Send smoothing off (`03 0A 08 00 00 01`), put the cup on, pull a shot. Compare the weight jitter before the pump, during the pump while nothing drips yet, and after pump off | **No** (S2). In shot B the pump ran 3.3 s before the first drip. The weight held still at −0.2 g (one 0.1 g flicker), and the scale's flow figure was as quiet as at rest (σ 0.016 g/s, against 0.018–0.021 at rest). The only sign was a 0.2 g dip as the pump started, which shot A didn't show. So `pump_on` comes from the Tare + start tap at pump start (Q4, D-048) |
| A3 | Is the weight net or gross? | Put a cup on, tare, lift the cup off. A negative reading of about minus the cup's mass means net | **Net** (S1): a 9.6 g item, tared, read −9.6 to −9.7 g when lifted |
| A4 | Does `04` start the timer in flow+weight mode? | Send `03 0A 04 00 00 0D` and watch bytes 3–5. Note which mode the scale's display is in | **In the timer mode, yes** (S1): it started the timer at 257.7 and 274.4 s. In the automatic mode it did nothing, during the scale's own run (79.4 s) and after it (104.5 s). **In the flow-rate mode, no: that mode has no timer** (the user checked, 2026-10-05). The app uses the timer mode (D-038) |
| A5 | Does `07` start the timer in any mode? | Send `03 0A 07 00 00 0E` and watch bytes 3–5. Does it also tare? Try each display mode | **Not in every mode** (S1): `07` started the timer in the timer mode (291.4 s), and did nothing in the automatic mode (109.8 s) or at 141.8 s (automatic or flow-rate mode). Whether it tares didn't show, because the weight already read 0. **In the timer mode it tares too** (S2): at 264.7 s it tared a 264.8 g vessel to 0 by the next frame and started the timer. The flow-rate mode has no timer, so there `07` has none to start; whether it tares there is moot (D-038) |
| A6 | Does the Mini honour `25` (keep-alive)? | The standby bytes hold the auto-off setting and don't count down (S1), so watch the scale itself. Set its auto-off to the shortest (5 min) on the scale, stay connected, and leave the platform alone for longer than that. Does the scale switch off while connected? If it does, repeat, tapping **Keep-alive** (`03 0A 25 00 00 2C`) every minute | Not tested yet. The standby bytes read 150 (15.0 min) in every frame of S1, which is why the method changed |
| A7 | Does a physical tare emit anything? | Subscribe to `FF12` (if it supports notify) and press the scale's tare button | **Apparently nothing** (S1): a press that zeroed the scale (118.5 s, no command near it) sent no frame on FF12. FF12 did send two `03 0D` event frames, in the Ultra's layout with every other byte 0: state `01` when the scale started its own timer, and state `00` at the app's stop that ended it |
| A8 | Container masses | Weigh the empty bean cup, espresso cup(s) and dosing cup, if you have one | Seen in S2, not yet named: 119.8–119.9 g (the dosing cup, for beans and grounds), and 264.8 g and 257.3 g (the vessels of shots A and B) |
| A9 | Unit byte value | Byte 6 during normal use, in grams | **`01`** in every frame (S1) |
| A10 | Sign byte values | Byte 7 with a positive weight, then a negative one (lift a tared cup). Byte 11 if the flow ever goes negative | **`2B` (+) and `2D` (−)**, for both the weight and the flow (S1) |
| A11 | Weight resolution and noise at rest | Smallest weight step seen (0.01 g? 0.1 g?), and the jitter over 10 s on an empty, still platform with smoothing off | **0.1 g** (S1). 3,340 of 3,359 readings are whole tenths. The other 19, all while the weight moved fast, are a hundredth short (38.59 g): the scale truncates a float. **At rest the reading doesn't move**: not once in 92, 82 and 30 s with a tared item on, nor in 17 and 12 s empty. With the 9.6 g item on, there was one flicker in 28 s. The scale's own flow figure (0.01 g/s steps) does move at rest (σ 0.018 g/s). BOOKOO's published specification is 0.1 g. The finer digits the user saw on the display were the flow figure's, not the weight's |
| A12 | What does the timer do after stop and reset? | After `05` (stop), do bytes 3–5 freeze or go to zero? After `06` (reset)? | **`05` freezes it, and `06` zeroes it only once stopped** (S1). `06` while it runs is ignored. `04` doesn't resume a frozen timer, so a restart takes `06`, then `04`. The exception was the run the scale had started itself: `05` sent that one straight to 0, and zeroed the weight too |
| A13 | Does smoothing off take effect? | After `03 0A 08 00 00 01`, does byte 18 read `00`? | **Yes** (S1): `01` in the first frame, `00` from the second (0.2 s) |
| A14 | What does the scale advertise? | Device name. Is service `0FFE` in the advertisement? | Name **`BOOKOO_SC 109813`** (S1). The advertisement can't be seen from the browser |
| A15 | Characteristic properties | `FF11` and `FF12`: read / write / write-without-response / notify / indicate | **Both: read, write, notify** (S1). Neither has write-without-response or indicate |
| A16 | Do weight frames carry a valid checksum? | Does byte 20 equal the XOR of bytes 1–19? Older doc revisions showed `00` there | **Yes** (S1): all 3,361 frames, the two FF12 frames included |

## Part B — Runtime: the deployed app on iOS (beacio, then Bluefy)

App URL: <https://misch0n.github.io/smart-scale/> (live; every push to `main` redeploys it).

Run each test in beacio, the Safari web extension, which is the runtime you'd rather use
(D-016). It works only in a Safari tab, not from a home-screen icon (B9). If a test fails there,
repeat it in Bluefy and record both results, so we know whether falling back would help.

| # | Question | How | Result |
| --- | --- | --- | --- |
| B1 | Which browser APIs does the runtime expose? | Open the app. The home page shows a capability table: screenshot it | **All eight present in both beacio and Bluefy** (2026-10-03, iOS): secure context, Web Bluetooth, `getDevices()`, IndexedDB, `storage.persist()`, Wake Lock, Web Share, `getUserMedia`. The table only checks that each function exists; B3 and B5–B9 test whether they work. User agents weren't captured |
| B2 | Does connecting work? | Probe screen → Connect → pick the scale in the chooser. If it fails, copy the message: it names the step that failed | **Yes** (2026-10-04, S1): connected on the iPhone, with Safari's user agent (so presumably beacio), and frames arrived for 338 s without a break |
| B3 | Can it reconnect without the chooser? **(Spec: "Re-pairing — check early")** | Since T1.21 the app tries by itself: connect once, reload the page, and see whether it reconnects with no tap. Repeat after force-quitting the browser (Safari for beacio). The checks R1–R7 above go through it. If it fails, copy what the probe's Connection panel says: the last error lists the devices the browser still knows | |
| B4 | What happens when the screen locks or the browser goes to the background? | While connected, lock the phone for 30 s, then unlock. Is there a gap in the frames? Did the connection survive? | |
| B5 | Does Wake Lock keep the screen on? | Stay connected and idle past the normal auto-lock time | |
| B6 | Does storage persist? | Note the persistence result on the probe screen. Close the browser and reopen: are the recordings still there? | |
| B7 | How do exported files get off the phone? | Export a recording: tap Export, then Download, and Share… if it's offered (it shows only where the browser says it can share files). Does a file download? Does the share sheet appear? Where can you save it? Then import the file in the other runtime (Bluefy if you exported from beacio): does the file picker open, and does the recording appear? Also note where Safari saves downloads (Settings › Apps › Safari › Downloads; iCloud Drive by default): if it's iCloud Drive, Download alone is an iCloud backup (D-026) | **Partly** (S1): an export reached an agent session. Which button was used, where it was saved and the import weren't noted |
| B8 | Microphone (Phase 3 audio) | Is `getUserMedia` listed in the capability table? If yes, does a permission prompt appear when tried? Does it ask again after you close and reopen the browser? | Listed: yes in both runtimes (B1, 2026-10-03). Tried in S1: seven tries, each `granted` with the track "iPhone Microphone". Whether a prompt appeared wasn't noted. **Each try held the scale's notifications back for 0.46–0.71 s**, though none was lost. S2: two more tries, both `granted`, with the same hold-up. The button only checks access, so nothing was recorded; T1.24 records sound levels |
| B9 | beacio only: does it work from a home-screen icon? The spec's storage-eviction and microphone re-prompt concerns are about sites that aren't installed | In Safari: Share → Add to Home Screen (leave "Open as Web App" on if it's offered). Open the app from the icon. Does it open without Safari's address bar, and does the capability table still show Web Bluetooth? Once the probe exists: connect, then repeat B6 and B8 from the icon | **No** (2026-10-03): opened from a home-screen icon, beacio isn't available, so there is no Web Bluetooth there. beacio works only in a Safari tab, where the app counts as a site that isn't installed. The rest of this test is moot |
| B10 | Does automatic export reach the data repo from the phone? (T1.20, after U1.2) | Until it's set up, a red reminder at the top of the page says the recordings aren't backed up; its button opens the settings. Set it up (U1.2), tap **Test**, then **Save**: the reminder goes. Record something short with the real scale and disconnect: does a file appear in the repo under `recordings/YYYY/MM/` within a minute, and does the status say "Up to date"? Then disconnect and lock the phone at once: does the upload finish, or happen when you come back? Turn on flight mode, record again: does the status say it is waiting, and does the file arrive once you're back online? | |

## Part C — Fixture recordings to capture with the probe

Send smoothing off first, then capture each scenario as its own recording (connect, do the
scenario, disconnect). Where you can, tap the probe's annotation buttons ("pump on", "pump off",
"cup on", "cup off") as things happen. Those taps carry human latency, but they let an agent
check the detectors against something. Add a note annotation with the dose and grind setting
for each shot.

| # | Scenario | Captured |
| --- | --- | --- |
| C1 | Idle for 60 s on an empty platform (noise floor, rate) | Covered by S1: still stretches of 12–92 s, empty or with a tared item on |
| C2 | Cup on → wait 5 s → app tare+start (`07`) → wait 5 s → lift the cup → put it back → remove it | |
| C3 | Three or more normal shots, each in its own recording: cup on, settle, pump on, shot, pump off, then **wait at least 30 s** before removing the cup | S2, in part: shot A waited 35 s, but ran fast (47 g in 9 s) and the scale was moved as it began |
| C4 | Press the physical tare button with a cup on: once held for about a second, then, a few seconds later, once as a quick click. The analysis takes a held press off with its tare (D-061, from S1's); a quick click is untested | |
| C5 | A shot where the cup comes off right after pump off (honest yield) | S2: shot B, lifted 4 s after pump off |
| C6 | Ten minutes connected and idle (standby countdown, keep-alive test) | |

Hand the exported files to an agent (upload them in a session). It adds them to `fixtures/real/`
with a README describing each one.

## Sessions

### Session 1 — 2026-10-04, the probe's commands (no shot)

One recording of 338 s, exported while still connected:
`fixtures/real/2026-10-04_probe-session_20444bd0.json`, whose README lists what happens when.
The setup was an iPhone with Safari's user agent (presumably beacio), app `a17c07c`, and the
scale `BOOKOO_SC 109813` at 70% battery. There were probe commands, a 9.6 g item tared, lifted
and put back, presses on the platform, and seven microphone tries. No annotations, no shot. The
agent read it with the app's own decoder, timeline and segmentation.

Beyond the table:

- **The timer is a tick counter.** Every timer value is a multiple of 100 ms, and while the
  timer runs it moves one tick per frame. Ticks and samples share the scale's clock, which runs
  0.70% slow against the phone's (fitted drift −6,937 ppm, inside the timebase's 2% limit). A
  tick came twice once, 1 s into a run (1.9 s, at 28.4 s). The timeline treats that as a gap
  between two runs.
- **No frame was lost.** One regular grid of 100.70 ms fits all 3,359 FF11 arrivals. Outside the
  microphone stalls, every arrival is within −22 to +119 ms of it, and the median doesn't shift
  across the stalls. Against the timer, arrivals are late by a median of 16 ms (p95 33 ms).
- **The scale has three modes**, by BOOKOO's description: flow rate (weight and flow), timer
  (weight and time), and automatic (it tares when a cup goes on, and times from the first
  liquid). It doesn't report its mode over Bluetooth. By the user's account, it started in
  automatic mode, then went to flow rate, then to timer, the mode the app will use (D-038). The
  switch times weren't noted.
- **The automatic mode ran its own timer** from 27.45 s, as the item went on, with no command
  near it. Its first frame already read 1.1 s, and FF12 sent `03 0D 01` (started). While that
  run lasted, the app's two tares (72.0 and 75.9 s) did nothing. The app's `05` at 82.3 s ended
  it. The timer read 0 in the next frame and FF12 sent `03 0D 00` (stopped). The weight went to
  0 0.1 s later, with the item still on.
- **`04` and `07` did nothing from 82.3 s to at least 141.8 s** (five tries): in automatic mode,
  and perhaps in flow-rate mode after about 115 s. By 257.7 s the scale was in timer mode, and
  from then on every timer command worked as A12 says.
- **Response times**, measured from the `command-sent` event, which the recorder logs once the
  write is acknowledged:
  - a tare showed within two frames (0.09–0.18 s);
  - a reset after 0.03–0.06 s;
  - a stop by the next frame;
  - the first ticking frame 0.14–0.21 s after a start.

  The smoothing check confirmed on a frame 1 ms before the command's own event, for the same
  reason.

  So a tare or a start shows a frame later than a stop or a reset: the frame after a tare's
  acknowledgment never showed it, and `07`'s timer started a frame after its tare. The
  simulator does it that way (T1.22, D-021): replaying this session's timer commands into it
  gives the three timer runs to the tick.
- **Opening the microphone holds Bluetooth back.** Each `getUserMedia` stalled the
  notifications for 0.46–0.71 s, and then the held frames arrived in a burst (T3.1).
- **The battery** read 70% throughout, and the buzzer 0.

Still to do after session 1: see session 2's list.

### Session 2 — 2026-10-05, beans, grounds and two shots

One recording of 613 s: `fixtures/real/2026-10-05_two-shots_0a69da56.json`, whose README lists
what happens when. The setup was the same iPhone and scale, with app `e954579`. The scale was in
its timer mode. Beans were dosed into the dosing cup (17.7 g, then 17.1 g), the grounds weighed in
it (17.2 g, then 17.1 g), and two shots pulled. Each shot was started with **Tare + start** at
the same moment as the pump (the user's account). There were no annotations. The agent read it
with the app's analysis (`analyzeRaw`, T1.14).

- **A2: no vibration.** See the table. With the pump on, the weight and the scale's flow figure
  read as they do at rest, so the scale can't tell when the pump starts. The user chose the
  Tare + start tap as `pump_on` (Q4, D-048). The 0.2 g dip as shot B's pump started may be worth
  watching on more shots.
- **The shots.**
  - Shot B: first drip about 3.7 s after the tap, a flow building to about 1.75 g/s, pump off at
    about 35.7 s, and 35.1 g.
  - Shot A: first liquid 3.3 s after the tap, then about 5.4 g/s for 6 s, pump off at about
    11.8 s, and 47.3 g. As it began, the scale was moved because it was off centre, and the
    readings swung between −57 and +30 g for 2 s.
- **The drip stops fast.** After pump off the flow dies within about 0.8 s, and the tail is
  0.1–0.3 g. That is much shorter than the simulator's (τ about 1.5 s), so the tail fit refuses
  it (`tail-too-short`).
- **Tenths sent a hundredth short, at rest too.** 746 of 6,085 readings end in 9 hundredths: the
  264.8 g vessel reads 264.79, and shot B settles on 35.09. Every reading is within 0.01 g of a
  tenth.
- **Two new FF12 frames at 6 s,** of types the decoder doesn't know:
  - `03 0C 00 8D`, then "SN" and a 12-character serial number (masked in the fixture), then `01`;
  - `03 0E 01 07`, then zeros.

  Nothing in the log explains them. They may come when the scale wakes or reconnects.
- **What the analysis made of it**, before any tuning (T1.16 has the list):
  - shot B's pump_off came from the regime change, about 0.15 s early, and the yield within 0.2 g
    (35.3 g: the baseline was taken inside the pump's dip);
  - shot A's yield read 39.0 g, not 47.3 g, because the moved scale was taken for two steps;
  - neither shot counted as espresso, so neither would get a post-hoc shot (D-047). It has no
    pump_on, and the tail is too short;
  - the bean pour (28–34 s) was found as a window and rightly not called espresso;
  - the quantum read 0.09 g, because of readings like 35.09.

- **After T1.16's first part** (D-058, analysis version 2): the quantum reads 0.1 g; shot A
  47.3 g with its first drip at 267.97 s; the beans 17.7 g; both shots espresso, pump_on from
  the Tare + start tap: first-drip times 3.24 s (A) and 3.40 s (B), totals 11.56 s and 35.67 s.
  Shot B's yield (35.3 g, its baseline in the pump's dip) and first drip (0.2–0.3 s early) are
  the next part.

- **After T1.16's second part** (D-059, analysis version 3): the yields are measured from the
  level before the pump, so shot B's dip no longer counts: 35.1 g, honest yield 35.1 g (the
  hand's press before the lift is part of the lift now). First drips 267.99 s (A) and 554.74 s
  (B): first-drip times 3.26 and 3.66 s, totals 11.56 and 35.69 s. The drain comes from the
  pump_off knee: τ 0.28 s (A) and 0.18 s (B), w(pump_off) 45.8 and 34.8 g, tails 1.5 and 0.3 g.
  No tail is refused now.

- **The microphone wasn't recording.** The two tries (251.4 and 303.5 s) were the probe's
  access check, which stops the stream at once. No sound was kept, and none was meant to be: T1.24
  adds recording (D-049).
- **The surf.** The user runs the pump through the group for several seconds before each shot.
  The scale doesn't see it, but before each shot the reading plunges to −150 to −400 g for about
  1.5 s and comes back (234.5 s, and 542.1–546.5 s). That is what lifting the scale looks like. A
  microphone would hear the surf, so D-049 takes the pump run the first drip falls into.

Still to do (U1.1):

- **T1.24's check**, in the next session. Turn on **Record sound** before or after Connect.
  1. Allow the microphone if asked. The Sound levels line should read "On: … readings from
     iPhone Microphone at 48000 Hz", and the levels should move when you talk or grind. If every
     level stays at "≤ -127.5 dB", the meter isn't getting audio: say so.
  2. While connected, the line counts the levels "in this recording". The events list shows
     "sound levels start", or "sound levels continue" if Record sound came before Connect.
  3. The scale keeps streaming: Recording → Frames stays near 10/s. A Record sound tap during a
     recording holds the scale back for about half a second, once.
  4. Disconnect, then Connect: the levels stay on, and the new recording shows "sound levels
     continue".
  5. Optional (B4): lock the phone, or switch apps, for 10 s, then come back. Note what the
     events list shows ("sound levels pause" and "resume", or nothing).
  6. Export: the file's frames include `"mic"` rows.
- Three normal shots, as C3 describes: one per recording, waiting at least 30 s before lifting the
  cup, with Tare + start at the pump as you did. Tapping **pump off** when the pump stops would
  give the pump_off detector something to be checked against. Turn on **Record sound**, and surf
  as you normally would.
- A6, with the new method.
- A7 once more: a single press of the tare button, with nothing else going on.
- A8: name the containers seen in session 2, or weigh the others.
- The reconnect, R1–R7 (T1.21), which answers B3.
- B4–B6 and B10, the rest of B7, and C2, C4 and C6.
