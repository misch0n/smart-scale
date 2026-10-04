# Real recordings

Recordings exported by the probe (U1.1). Each file is kept byte for byte as the app wrote it:
export format v1 (`docs/export-format.md`), never reformatted (`.prettierignore`). Tests read
them through `parseExport`, in `src/core/real-fixtures.test.ts`. The answers they gave are in
`docs/hardware-tests.md`.

Besides the data, every export carries the scale's Bluetooth name, the browser's per-site device
id and the phone's user agent.

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
- notifications held back without loss.
