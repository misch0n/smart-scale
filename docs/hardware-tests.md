# Hardware and runtime tests (user)

Agents can't touch the scale, the machine or the phone, so these tests are yours. Fill in the
**Result** column, or paste your notes or screenshots to an agent and it will record them here.
Once a Part A answer is in, an agent also copies it into the spec's table in "Unknowns to test
before building", as the spec asks.

Part A is the spec's Phase 0. You can run it with nRF Connect or LightBlue (no code needed), or
with the in-app probe, which is deployed (T1.8). The probe records everything it sees, so its
recordings double as test fixtures. Part B needs the deployed app on the phone, in beacio first
(D-016). Part C lists the recordings to capture for the analysis work.

Byte numbers below are **1-based**, as in the spec. Code uses 0-based offsets
(`docs/protocol-notes.md`).

A result marked (S1) comes from session 1; "Sessions" at the end has the details.

## Using the probe (T1.8)

Open <https://misch0n.github.io/smart-scale/> in a Safari tab with beacio; the app opens on the
probe. Tap **Connect** and pick the scale. Everything from Connect to Disconnect is recorded,
and the recording appears under **Recordings**, where **Export** turns it into a file. The probe
turns smoothing off by itself; "Smoothing (A13)" reads `confirmed` once a frame shows it off.
The annotation buttons and the note field put marks on the recording's timeline.

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
| B3 | Connection: **Reconnect known device** |
| B4 | Recording: "Longest silence (B4)". The events list shows `page-hidden` and `page-visible` |
| B5 | Connection: "Screen wake lock", which says `held` or why not. **Keep screen on** asks again |
| B6 | This browser: "Persistent storage" |
| B7 | Recordings: **Export**, then **Download** or **Share…** |
| B8 | Microphone: **Try microphone** |
| B10 | Automatic export: the status line, and **Settings** |

## Part A — Scale protocol (spec Phase 0, plus extras from protocol research)

| # | Question | How | Result |
| --- | --- | --- | --- |
| A1 | Notification rate | Subscribe to `FF11` with the timer running. Diff consecutive ms fields (bytes 3–5) and note the arrival spacing too | **9.93 Hz** (S1): a frame every 100.70 ms of the phone's clock, and none lost in 338 s. The timer field moves 100 ms per frame: 0.1 s ticks of the scale's own clock, which runs 0.70% slow. Arrival gaps are multiples of about 30 ms (median 91 ms, p99 152 ms) |
| A2 | Does pump vibration reach the weight signal? **(Load-bearing for the segmentation design)** | Send smoothing off (`03 0A 08 00 00 01`), put the cup on, pull a shot. Compare the weight jitter before the pump, during the pump while nothing drips yet, and after pump off | |
| A3 | Is the weight net or gross? | Put a cup on, tare, lift the cup off. A negative reading of about minus the cup's mass means net | **Net** (S1): a 9.6 g item, tared, read −9.6 to −9.7 g when lifted |
| A4 | Does `04` start the timer in flow+weight mode? | Send `03 0A 04 00 00 0D` and watch bytes 3–5. Note which mode the scale's display is in | **Sometimes** (S1): `04` started the timer at 257.7 and 274.4 s, but did nothing at 104.5, 131.6 and 137.2 s. The display mode wasn't noted. **Repeat it**, noting the mode |
| A5 | Does `07` start the timer in any mode? | Send `03 0A 07 00 00 0E` and watch bytes 3–5. Does it also tare? Try each display mode | **Not always** (S1): `07` started the timer at 291.4 s, but did nothing at 109.8 and 141.8 s, while `04` didn't work either. Whether it tares didn't show, because the weight already read 0. **Repeat it** with a cup on, noting the mode |
| A6 | Does the Mini honour `25` (keep-alive)? | The standby bytes hold the auto-off setting and don't count down (S1), so watch the scale itself. Set its auto-off to the shortest (5 min) on the scale, stay connected, and leave the platform alone for longer than that. Does the scale switch off while connected? If it does, repeat, tapping **Keep-alive** (`03 0A 25 00 00 2C`) every minute | Not tested yet. The standby bytes read 150 (15.0 min) in every frame of S1, which is why the method changed |
| A7 | Does a physical tare emit anything? | Subscribe to `FF12` (if it supports notify) and press the scale's tare button | **Apparently nothing** (S1): a press that zeroed the scale (118.5 s, no command near it) sent no frame on FF12. FF12 did send two `03 0D` event frames, in the Ultra's layout with every other byte 0: state `01` when the scale started its own timer, and state `00` at the app's stop that ended it |
| A8 | Container masses | Weigh the empty bean cup, espresso cup(s) and dosing cup, if you have one | |
| A9 | Unit byte value | Byte 6 during normal use, in grams | **`01`** in every frame (S1) |
| A10 | Sign byte values | Byte 7 with a positive weight, then a negative one (lift a tared cup). Byte 11 if the flow ever goes negative | **`2B` (+) and `2D` (−)**, for both the weight and the flow (S1) |
| A11 | Weight resolution and noise at rest | Smallest weight step seen (0.01 g? 0.1 g?), and the jitter over 10 s on an empty, still platform with smoothing off | **0.1 g** (S1). 3,340 of 3,359 readings are whole tenths. The other 19, all while the weight moved fast, are a hundredth short (38.59 g): the scale truncates a float. **At rest the reading doesn't move**: not once in 92, 82 and 30 s with a tared item on, nor in 17 and 12 s empty. With the 9.6 g item on, there was one flicker in 28 s. The scale's own flow figure (0.01 g/s steps) does move at rest (σ 0.018 g/s) |
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
| B3 | Can it reconnect without the chooser? **(Spec: "Re-pairing — check early")** | Connect, reload the page, tap "Reconnect known device". Repeat after force-quitting the browser (Safari for beacio). If it fails, copy the message: it lists the devices the browser still knows | |
| B4 | What happens when the screen locks or the browser goes to the background? | While connected, lock the phone for 30 s, then unlock. Is there a gap in the frames? Did the connection survive? | |
| B5 | Does Wake Lock keep the screen on? | Stay connected and idle past the normal auto-lock time | |
| B6 | Does storage persist? | Note the persistence result on the probe screen. Close the browser and reopen: are the recordings still there? | |
| B7 | How do exported files get off the phone? | Export a recording: tap Export, then Download, and Share… if it's offered (it shows only where the browser says it can share files). Does a file download? Does the share sheet appear? Where can you save it? Then import the file in the other runtime (Bluefy if you exported from beacio): does the file picker open, and does the recording appear? Also note where Safari saves downloads (Settings › Apps › Safari › Downloads; iCloud Drive by default): if it's iCloud Drive, Download alone is an iCloud backup (D-026) | **Partly** (S1): an export reached an agent session. Which button was used, where it was saved and the import weren't noted |
| B8 | Microphone (Phase 3 audio) | Is `getUserMedia` listed in the capability table? If yes, does a permission prompt appear when tried? Does it ask again after you close and reopen the browser? | Listed: yes in both runtimes (B1, 2026-10-03). Tried in S1: seven tries, each `granted` with the track "iPhone Microphone". Whether a prompt appeared wasn't noted. **Each try held the scale's notifications back for 0.46–0.71 s**, though none was lost |
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
| C3 | Three or more normal shots, each in its own recording: cup on, settle, pump on, shot, pump off, then **wait at least 30 s** before removing the cup | |
| C4 | Press the physical tare button with a cup on | |
| C5 | A shot where the cup comes off right after pump off (honest yield) | |
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
- **The scale started its timer by itself** at 27.45 s, after a 3 g touch, with no command near
  it. Its first frame already read 1.1 s, and FF12 sent `03 0D 01` (started). While that run
  lasted, the app's two tares (72.0 and 75.9 s) did nothing. The app's `05` at 82.3 s ended it.
  The timer read 0 in the next frame and FF12 sent `03 0D 00` (stopped). The weight went to 0
  0.1 s later, with the item still on.
- **Then, from 82.3 s to at least 141.8 s, the scale ignored `04` and `07`** (five tries). From
  257.7 s every timer command worked as A12 says. Whether a mode changed in between wasn't noted.
  Presses on the platform in that interval could have been button presses.
- **Response times**, measured from the `command-sent` event, which the recorder logs once the
  write is acknowledged:
  - a tare showed within two frames (0.09–0.18 s);
  - a reset after 0.03–0.06 s;
  - a stop by the next frame;
  - the first ticking frame 0.14–0.21 s after a start.

  The smoothing check confirmed on a frame 1 ms before the command's own event, for the same
  reason.
- **Opening the microphone holds Bluetooth back.** Each `getUserMedia` stalled the
  notifications for 0.46–0.71 s, and then the held frames arrived in a burst (T3.1).
- **The battery** read 70% throughout, and the buzzer 0.

Still to do (U1.1):

- A shot or two with the probe recording, tapping **pump on** and **pump off**. A2 is the
  load-bearing answer, and C3 and C5 need it too. Since the reading at rest doesn't move in
  0.1 g steps, the pump's vibration has to reach about ±0.05 g to show in the weight at all.
- A4 and A5 again, noting the display mode and pressing nothing else. For A5, do it with a cup
  on, to see whether `07` tares.
- A6, with the new method.
- A7 once more: a single press of the tare button, with nothing else going on.
- A8: the containers' masses.
- B3–B6 and B10, the rest of B7, and C2, C4 and C6.
