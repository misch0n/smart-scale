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
| A1 | Notification rate | Subscribe to `FF11` with the timer running. Diff consecutive ms fields (bytes 3–5) and note the arrival spacing too | |
| A2 | Does pump vibration reach the weight signal? **(Load-bearing for the segmentation design)** | Send smoothing off (`03 0A 08 00 00 01`), put the cup on, pull a shot. Compare the weight jitter before the pump, during the pump while nothing drips yet, and after pump off | |
| A3 | Is the weight net or gross? | Put a cup on, tare, lift the cup off. A negative reading of about minus the cup's mass means net | |
| A4 | Does `04` start the timer in flow+weight mode? | Send `03 0A 04 00 00 0D` and watch bytes 3–5. Note which mode the scale's display is in | |
| A5 | Does `07` start the timer in any mode? | Send `03 0A 07 00 00 0E` and watch bytes 3–5. Does it also tare? Try each display mode | |
| A6 | Does the Mini honour `25` (keep-alive)? | Watch standby bytes 15–16 count down, then send `03 0A 25 00 00 2C`. Does the count reset? | |
| A7 | Does a physical tare emit anything? | Subscribe to `FF12` (if it supports notify) and press the scale's tare button | |
| A8 | Container masses | Weigh the empty bean cup, espresso cup(s) and dosing cup, if you have one | |
| A9 | Unit byte value | Byte 6 during normal use, in grams | |
| A10 | Sign byte values | Byte 7 with a positive weight, then a negative one (lift a tared cup). Byte 11 if the flow ever goes negative | |
| A11 | Weight resolution and noise at rest | Smallest weight step seen (0.01 g? 0.1 g?), and the jitter over 10 s on an empty, still platform with smoothing off | |
| A12 | What does the timer do after stop and reset? | After `05` (stop), do bytes 3–5 freeze or go to zero? After `06` (reset)? | |
| A13 | Does smoothing off take effect? | After `03 0A 08 00 00 01`, does byte 18 read `00`? | |
| A14 | What does the scale advertise? | Device name. Is service `0FFE` in the advertisement? | |
| A15 | Characteristic properties | `FF11` and `FF12`: read / write / write-without-response / notify / indicate | |
| A16 | Do weight frames carry a valid checksum? | Does byte 20 equal the XOR of bytes 1–19? Older doc revisions showed `00` there | |

## Part B — Runtime: the deployed app on iOS (beacio, then Bluefy)

App URL: <https://misch0n.github.io/smart-scale/> (live; every push to `main` redeploys it).

Run each test in beacio, the Safari web extension, which is the runtime you'd rather use
(D-016). It works only in a Safari tab, not from a home-screen icon (B9). If a test fails there,
repeat it in Bluefy and record both results, so we know whether falling back would help.

| # | Question | How | Result |
| --- | --- | --- | --- |
| B1 | Which browser APIs does the runtime expose? | Open the app. The home page shows a capability table: screenshot it | **All eight present in both beacio and Bluefy** (2026-10-03, iOS): secure context, Web Bluetooth, `getDevices()`, IndexedDB, `storage.persist()`, Wake Lock, Web Share, `getUserMedia`. The table only checks that each function exists; B3 and B5–B9 test whether they work. User agents weren't captured |
| B2 | Does connecting work? | Probe screen → Connect → pick the scale in the chooser. If it fails, copy the message: it names the step that failed | |
| B3 | Can it reconnect without the chooser? **(Spec: "Re-pairing — check early")** | Connect, reload the page, tap "Reconnect known device". Repeat after force-quitting the browser (Safari for beacio). If it fails, copy the message: it lists the devices the browser still knows | |
| B4 | What happens when the screen locks or the browser goes to the background? | While connected, lock the phone for 30 s, then unlock. Is there a gap in the frames? Did the connection survive? | |
| B5 | Does Wake Lock keep the screen on? | Stay connected and idle past the normal auto-lock time | |
| B6 | Does storage persist? | Note the persistence result on the probe screen. Close the browser and reopen: are the recordings still there? | |
| B7 | How do exported files get off the phone? | Export a recording: tap Export, then Download, and Share… if it's offered (it shows only where the browser says it can share files). Does a file download? Does the share sheet appear? Where can you save it? Then import the file in the other runtime (Bluefy if you exported from beacio): does the file picker open, and does the recording appear? Also note where Safari saves downloads (Settings › Apps › Safari › Downloads; iCloud Drive by default): if it's iCloud Drive, Download alone is an iCloud backup (D-026) | |
| B8 | Microphone (Phase 3 audio) | Is `getUserMedia` listed in the capability table? If yes, does a permission prompt appear when tried? Does it ask again after you close and reopen the browser? | Listed: yes in both runtimes (B1, 2026-10-03). Permission prompt: not tried yet |
| B9 | beacio only: does it work from a home-screen icon? The spec's storage-eviction and microphone re-prompt concerns are about sites that aren't installed | In Safari: Share → Add to Home Screen (leave "Open as Web App" on if it's offered). Open the app from the icon. Does it open without Safari's address bar, and does the capability table still show Web Bluetooth? Once the probe exists: connect, then repeat B6 and B8 from the icon | **No** (2026-10-03): opened from a home-screen icon, beacio isn't available, so there is no Web Bluetooth there. beacio works only in a Safari tab, where the app counts as a site that isn't installed. The rest of this test is moot |
| B10 | Does automatic export reach the data repo from the phone? (T1.20, after U1.2) | Set it up (U1.2), tap **Test**, then **Save**. Record something short with the real scale and disconnect: does a file appear in the repo under `recordings/YYYY/MM/` within a minute, and does the status say "Up to date"? Then disconnect and lock the phone at once: does the upload finish, or happen when you come back? Turn on flight mode, record again: does the status say it is waiting, and does the file arrive once you're back online? | |

## Part C — Fixture recordings to capture with the probe

Send smoothing off first, then capture each scenario as its own recording (connect, do the
scenario, disconnect). Where you can, tap the probe's annotation buttons ("pump on", "pump off",
"cup on", "cup off") as things happen. Those taps carry human latency, but they let an agent
check the detectors against something. Add a note annotation with the dose and grind setting
for each shot.

| # | Scenario | Captured |
| --- | --- | --- |
| C1 | Idle for 60 s on an empty platform (noise floor, rate) | |
| C2 | Cup on → wait 5 s → app tare+start (`07`) → wait 5 s → lift the cup → put it back → remove it | |
| C3 | Three or more normal shots, each in its own recording: cup on, settle, pump on, shot, pump off, then **wait at least 30 s** before removing the cup | |
| C4 | Press the physical tare button with a cup on | |
| C5 | A shot where the cup comes off right after pump off (honest yield) | |
| C6 | Ten minutes connected and idle (standby countdown, keep-alive test) | |

Hand the exported files to an agent (upload them in a session). It adds them to `fixtures/real/`
with a README describing each one.
