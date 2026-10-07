# Real recordings

Recordings exported by the probe (U1.1). Each file is kept byte for byte as the app wrote it,
in the export format of its day (`docs/export-format.md`: sessions 1 and 2 are version 1), never
reformatted (`.prettierignore`). Tests read
them through `parseExport`, in `src/core/real-fixtures.test.ts`. The answers they gave are in
`docs/hardware-tests.md`.

Besides the data, every export carries the scale's Bluetooth name, the browser's per-site device
id and the phone's user agent. One exception to "byte for byte": when the scale sends its serial
number (in an `03 0C` frame on FF12), the digits are masked with `X`, and the frame's checksum
is recomputed. The repository is public.

Times below are seconds from the recording's start, the frames' arrival clock.

## `2026-10-04_probe-session_20444bd0.json`

Hardware session 1 (`docs/hardware-tests.md` "Session 1"). The phone saved it as
`smart-scale_2026-10-05_004006_20444bd0.json` (local time).

- Recording `01a108dc-225e-77ea-8126-0d7b20444bd0`, started 2026-10-04 21:40:06 UTC, 338 s. It
  was exported while still connected, so it has no end time and no `disconnected` event.
- App `a17c07c`, on an iPhone with Safari's user agent (Safari 27.0.1), so presumably beacio.
- Scale `BOOKOO_SC 109813`: battery 70%, auto-off 15 min, buzzer 0. Smoothing was off from the
  second frame (0.2 s).
- 3,359 FF11 weight frames, 2 FF12 event frames, and 43 app events: probe commands and seven
  microphone tries. There are no annotations and no shot.
- The user's account: a connectivity test, with a small item placed and played with. The scale
  started in its automatic mode. The user then switched it to the flow-rate mode and then to
  the timer mode, the one the app will use (D-038). The switch times weren't noted. The presses
  at 115–117 s and 219–251 s may be those switches, and the scale was in timer mode by 257.7 s.

| Time (s) | What happens |
| --- | --- |
| 0–27 | Empty platform, still. Some ±0.1–0.3 g flicker from 17 s |
| 27.0–27.3 | Automatic mode. A touch of 3 g at most, and the scale tares and starts its own timer, which reads 1.1 s in its first frame (the user saw it do this as the item went on). FF12 sends `03 0D 01` |
| 27.9–31.6 | Something about 45 g handled on and off |
| 49.5–52.3 | Handling; the reading sits near −136 g for 1.5 s, then returns to 0 |
| 53.7–54.4 | The 9.6 g item put on, and not tared: the run is still going |
| 72.0, 75.9 | Tare commands, ignored: the item still reads 9.6 g while the automatic mode's run goes on |
| 79.4 | `04`, while the timer runs: no visible effect |
| 82.3 | `05` ends the automatic run: the timer goes to 0, and 0.1 s later the weight goes to 0 with the item still on. FF12 sends `03 0D 00` |
| 88.2–109.8 | Still automatic mode (no presses since). `05`, tare twice, `06` twice, `04`, `07`: the timer stays at 0 |
| 112.2–112.9 | The item lifted: −9.7 g, then −9.6 g (net) |
| 115.0–117.0 | Three short presses (a mode switch?) |
| 117.6–118.5 | A press of about 13 g for 0.9 s, and the scale's button tares: 0. Nothing on FF12 |
| 119.1–122.4 | Two presses of about 140 g |
| 123.0–123.7 | The item back on: 9.6 g |
| 126.4 | Tare command: 0 |
| 131.6–141.8 | `04` twice, `05`, `06`, `07`: the timer stays at 0. Automatic or flow-rate mode |
| 192.3–202.1 | Seven microphone tries. Each one holds the notifications back for 0.46–0.71 s, and then they arrive together |
| 218.8–241.0 | The item lifted (−9.6/−9.7 g), with presses of up to 330 g (mode switches?) |
| 241.0 | Tare command, item off: 0 |
| 242.8–251.1 | Five more presses, of up to 180 g |
| 252.4–252.9 | The item back on: 9.7 g |
| 256.1 | Tare command: 0 |
| 257.7 | Timer mode. `04`: the timer starts (100 ms in its first frame) |
| 262.2 | `05`: the timer freezes at 4.4 s |
| 267.0, 269.9 | `04` twice: the timer stays frozen (no resume) |
| 272.8 | `06`: the timer goes to 0 |
| 274.4 | `04`: the timer starts |
| 283.1 | `06` while the timer runs: ignored |
| 286.8 | `05`: the timer freezes at 12.2 s |
| 288.0 | `06`: 0 |
| 291.4 | `07`: the timer starts |
| 297.3 | `05`: the timer freezes at 5.7 s |
| 297.9 | `06`: 0 |
| 298–338 | Still, with the tared item on |

Useful for:

- the frame format and checksums;
- the 0.1 g resolution, and a reading that holds still at rest;
- the sample rate, and the timer's ticks on the scale's clock;
- how timer and tare commands behave in the timer mode, and which the automatic mode ignores;
- tares from the log, from a jump, and from the button, whose press weighed 13.1 g until its
  tare (D-061: zero-tracking measures that tare from before the press);
- a lift that reads net;
- notifications held back without loss;
- the simulator, which `src/core/real-fixtures.test.ts` holds up against this recording and
  into which it replays the timer commands from 250 s (T1.22).

## `2026-10-05_two-shots_0a69da56.json`

Hardware session 2 (`docs/hardware-tests.md` "Session 2", D-048). The phone saved it as
`smart-scale_2026-10-05_090250_0a69da56.json` (local time).

- Recording `01a10aa8-63dc-720e-9083-0b290a69da56`, started 2026-10-05 06:02:50 UTC, 613 s,
  ended from the app (`disconnected`, `user`).
- App `e954579`, the same iPhone and Safari user agent as session 1. Same scale, in its timer
  mode throughout.
- 6,085 FF11 weight frames and 2 FF12 frames, both of types the decoder doesn't know:
  - `03 0C` at 6.2 s, carrying "SN" and the serial number (masked);
  - `03 0E 01 07` at 6.5 s.
- 22 app events: probe commands and two microphone tries. There are no annotations.
- The user's account: two shots back to back, each started with **Tare + start** at the same
  moment as the pump (so the tap is pump on, Q4). The scale was moved a little as shot A began,
  because it was off centre. The two microphone tries were access checks, so no sound was
  recorded. There was a surf before each shot (D-049).
- 746 readings end in 9 hundredths: tenths that the scale sends a hundredth short (264.79 for
  264.8, 35.09 for 35.1), at rest too.

| Time (s) | What happens |
| --- | --- |
| 0–9.8 | Empty platform |
| 9.8 | The dosing cup goes on (119.9 g). Tare command at 14.8 s |
| 28.3–33.6 | Beans poured in, in bursts: 17.7 g. The analysis finds a window here and doesn't call it espresso |
| 43.6 | The cup lifted |
| 46.9–70.4 | The cup back on while ground coffee falls into it: 15.3, 15.8, 16.6, then 17.2 g |
| 108–118 | The cup weighed again: 17.2 g. Lifted at 119 s |
| 125.3 | Tare command, platform empty |
| 237.1 | The shot A vessel goes on (264.8 g) |
| 264.7 | **Shot A.** Tare + start with the pump: tare to 0, timer from 0.1 s |
| 268.0–270.3 | First liquid, while the scale is moved to centre it: readings swing between −57 and +30 g |
| 270.3–276.5 | Flow at about 5.4 g/s. The pump stops at about 276.5 s |
| 278.2 | Settled at 47.3 g, and still until the vessel is lifted at 313.1 s |
| 318.6, 355.2 | Stop: the timer freezes at 53.3 s. Reset |
| 357.5 | The dosing cup on (119.8 g), tared at 367.2 s |
| 369.7–377.2 | Beans poured: 17.1 g. Lifted at 387.1 s |
| 464.5–470.1 | The cup with the grounds weighed: 17.1 g |
| 486.4 | The shot B vessel goes on (257.3 g), tared at 488.2 s |
| 551.1 | **Shot B.** Tare + start with the pump. The timer ticks from 551.3 s |
| 551.4–554.7 | The reading dips to −0.2 g and holds still: no vibration shows |
| 554.75 | First drip. The flow builds to about 1.75 g/s |
| 586.8 | Pump off. The drip stops within about 0.8 s |
| 587.5–590.7 | Settled at 35.09 (35.1) g. Lifted at 590.7 s |
| 595.9–599.0 | Tare, stop twice (the timer freezes at 45.9 s), reset |
| 612.8 | Disconnect from the app |

Useful for:

- a real espresso shot (B) and a fast one (A), timed from the tap;
- A2: the pump's vibration doesn't reach the weight or the scale's flow figure;
- `07` taring and starting the timer in the timer mode (A5);
- beans poured and grounds weighed in the dosing cup, as spec v2's Beans and Grind phases would;
- readings a hundredth short of a tenth, at rest;
- the misses T1.16 fixed (D-058), now plain tests in `src/core/real-fixtures.test.ts`: the
  quantum, shot A's yield through the moved scale, the beans' bursts, and both shots timed from
  the tap.

## `2026-10-06_first-brew_all.json`

Hardware session 3 (`docs/hardware-tests.md` "Session 3"): the first brew with the app's phases.
The phone saved it as `smart-scale_2026-10-06_083801_all.json`: Setup's **Export all**, so it
holds every recording on the phone, sessions 1 and 2 included (the same data as the two files
above), and the entities and settings. Times of day below are the phone's, UTC+3.

- App `7ec6888`, the same iPhone and Safari user agent, the same scale (timer mode). Three
  `03 0C` frames carry the serial number (masked).
- The containers, learned in Setup on the silicone mat after a tare: Coffee cup 257.2 g (cup),
  Bean cup 119.8 g (bean only), Milk jug 215.2 g (milk). One live shot (Cappuccino, graded
  sour), three post-hoc shots from sessions 1–2.
- No sound levels: Record sound wasn't on.

The recordings of the day:

| Recording | Start | What happens |
| --- | --- | --- |
| `…1ddccf1d959d` | 08:10:36, 754 s | 21.1 s: the silicone mat put on, 15.5 g, seen as a vessel until 88 s, so the coffee cup on it wasn't recognised; Home's tares at 25.4 and 89.1 s. 93–185 s: the containers learned in Setup. 635 s: the coffee cup opens the extraction; Start at 657 and 676 s (the first lapses, the second leaves the scale's timer running), no shot. Ended unclean |
| `…aacc2dba1cf1` | 08:23:10, 149 s | 16.1 s: the bean cup opens the beans, 9.6 g poured; Grind tapped at 61.7 s; the cup lifted at 71 s and back empty at 88 s: the beans **re-opened by the container**, from 0 (the bug T2.14 fixes). Taps through grind, extraction, milk. Ended unclean (the page reloaded) |
| `…b01a`, `…f38216` | 08:25:40, 08:25:44 | Reconnects: 3 s and 11 s, the second ended by the scale |
| `…03c3d53e0b2c` | 08:26:03, 223 s | 16.1 s: the bean cup opens the beans, 17.1 g poured; Grind tapped at 63.1 s, Beans tapped back at 65.0 s; the cup back empty at 68 s: the beans count from 0 again. 79–105 s: 17.1 g poured again (hand presses up to 1.3 kg at 98–113 s). Grind tapped at 135.9 s, the cup lifted, back with the grounds at 184 s: 136.8 g, 17.0 g of grounds. 193 s: the page hidden; 222.8 s: disconnected by the scale |
| `…ffda7c6a4c62` | 08:29:47, 493 s | Connected with the cup of grounds on (tared). 15 s: it is lifted. 32.9 s: the coffee cup opens the extraction (auto-tare). 110–113 s: the portafilter going in. **118.1 s: Start** (07), first drip 121.5 s, flow 0.5 → 1.8 g/s, the pump stops at about 146.7 s: **34.8 g**. 147.6 s: shot done. 160.9 s: the cup lifted; 167.5 s: the milk jug opens the milk; 199 g poured in quick pours; Done at 201.4 s. Open at export |

Useful for:

- a shot whose flow gushes at the first drip, dips and climbs again, and stops dead (τ 0.16 s):
  the regime change's coarse search had latched onto the climb (T1.26, D-087);
- the phases as logged by the app, beans twice, the grounds in the bean cup, milk poured fast
  enough that its pours look like vessels put on (`measurePhases`, analysis 10);
- the mat as a vessel of 15.5 g (T2.17), and the empty bean cup back (T2.14).

## `2026-10-06_second-brew.json`

Hardware session 4 (`docs/hardware-tests.md` "Session 4"): the second brew with the app, the
first with sound levels. The phone saved Setup's **Export all** as
`smart-scale_2026-10-06_090158_all.json` (2.5 MB). This file is that export **trimmed to the
session's three recordings** (and its one shot), written by the app's own export code
(`serialiseExport`) with the phone's format version, 4. Each recording is line for line what
the phone wrote, apart from the serial number, masked as above in the two `03 0C` frames.
Everything before 08:38 is in the file above, as it was then; the shot's recording there
(`…ffda7c6a4c62`) went on after that export for 240 more frames, none of them the shot's.
Times of day below are the phone's, UTC+3.

- App `7ec6888` (before T1.26–T2.18), the same iPhone, Safari and scale (timer mode). The same
  containers: Coffee cup 257.2 g, Bean cup 119.8 g (bean only), Milk jug 215.2 g. One live shot
  (Cappuccino, graded bitter).
- Sound levels (layout 1, about 20 readings a second) from the probe's **Record sound**: 883 in
  the first recording, 4,323 in the second, 952 in the third.

| Recording | Start | What happens |
| --- | --- | --- |
| `…fb4f170a4ae2` | 08:38:32, 577 s | Nothing on the scale. Record sound on at 14.0 and 47.5 s, stopped at 42.7 and 65.4 s (broadband noise, not the pump). 72.7 s: the page hidden until 527 s. Ended unclean |
| `…09f15731a650` | 08:55:17, 327 s | 10.5 s: the bean cup put on (Home), not tared; 12.3 s: the brew screen opens the beans. 17.1 g poured; Grind tapped at 41.5 s with the cup on; lifted at 43.6 s. 73–102 s: the probe (Try microphone ×3, Record sound). 117 s: the cup back empty re-opens the beans (the old router, T2.14), 17.1 g poured again; Grind tapped at 137.6 s; lifted. 150–177 s: the grinder heard. 179.6 s: the cup back with the grounds, 136.8 g (17.0 g), auto-tared at 181.1 s; lifted at 193 s, back at 195.6 s, tared again at 196.6 s. 198.5 s: Extraction tapped. **199.9–201.3 s: the bean cup swapped for the coffee cup in about a second**: no tare, the scale reads 128.0 g. 258–262 s: the cup handled (the scale reads down to −281 g). **267.5 s: Start** (07), whose reading of 0 arrives before its `command-sent` (seq 5859, 5860): the live view took it for 128 g gone (T2.19). First drip 271.0 s, the pump heard until 301.6 s, **37.9 g**; shot done 302.4 s; the cup lifted at 304.8 s. Disconnected by the scale at 327.4 s |
| `…535b9abe8456` | 09:00:58, 50 s | The levels continue. 14.8 s: the milk jug opens the milk (auto-tare), 196.9 g in it; Done at 21.8 s. Disconnected by the scale at 49.5 s |

Useful for:

- the pump in the sound levels: the 40–70 Hz band at about −68 dB from the Start tap to the
  pump's stop (the analysis's pump_off within 0.03 s), against −90 dB for the grinder and −99
  dB in the quiet (T3.1);
- a tare whose reading arrives before its `command-sent` (T2.19), and a cup swapped too fast to
  be seen off (T2.20);
- the grind tapped open with the beans still in the cup (T2.21).

## `2026-10-06_evening-grind.json`

Hardware session 5 (`docs/hardware-tests.md` "Session 5"): a small test of the beans and the
grind, the evening after session 4, on app `ce31f2e` (T2.14–T2.21). The phone saved Setup's
**Export all** as `smart-scale_2026-10-07_082733_all.json` (3.5 MB). This file is that export
**trimmed to the one recording of the test**, written by the app's own export code with the
phone's format version, 5; the recording is line for line what the phone wrote (it has no
`03 0C` frame to mask). Times of day are the phone's, UTC+3.

- The same iPhone, Safari and scale. The containers: Coffee cup 257.2 g, Bean cup 119.8 g (bean
  only), Milk jug 215.2 g, and the mat, 15.5 g, a scale accessory (T2.17). No shot.
- Sound levels from Grind's tap on (129.4 s), about 20 readings a second.

| Recording | Start | What happens |
| --- | --- | --- |
| `…e6b00522d941` | 22:49:46, 650 s | 4.7 s: the mat put on (15.5 g); 25.4 s: Setup › Containers tares the empty scale (`setup-tare`). 38–42 s: the mat lifted and put back. 60.6 s: the bean cup put on; the brew opens on the beans and tares it (`phase-tare`). 74.9–76.4 s: **17.8 g** of beans; lifted at 92.9 s. 117–120 s: the scale pressed (down to −272 g). **127.1 s: Grind tapped**, the cup off. **134.9 s: the cup back with 14.6 g of grounds**, 3.2 g short of the beans: not taken for the grounds, so the cup's own tare zeroed them (135.3 s; T2.22). Lifted at 137.7 s, back at 139.4 s; lifted at 147.4 s, back at 150.6 s with 8.0 g: tared again (151.9 s). 168.8 s: Beans tapped, 171.6 s: Grind; lifted at 173.0 s, back at 175.9 s: tared again (177.1 s). Then nothing until the scale disconnected at 650.4 s |

Useful for:

- the grind's grounds well short of the beans, with the grind open by a tap (T2.22): the live
  router takes them for the grounds, so the flow drops the cup's tare;
- the mat as a scale accessory, zeroed by Setup's tare, under the bean cup;
- the analysis: beans 17.8 g, grounds 14.6 g.
