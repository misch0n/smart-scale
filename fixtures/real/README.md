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
- tares from the log, from a jump, and from the button;
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
- the known misses T1.16 is to fix (`it.fails` in `src/core/real-fixtures.test.ts`).
