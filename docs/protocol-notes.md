# BOOKOO protocol notes

Research that supplements the spec's "BLE protocol reference". Read this before touching
`src/core/protocol` or `src/transport`.

Sources (read 2026-10-03):

- [BooKooCode/OpenSource](https://github.com/BooKooCode/OpenSource) at `6e3f48a` (2026-09-18), MIT:
  `bookoo_mini_scale/protocols.md` (last updated 2026-08-12) and
  `bookoo_ultra_scale/protocols.md` (last updated 2026-09-18).
- [aiobookoo](https://github.com/makerwolf/aiobookoo) 0.1.1 (PyPI, MIT): the third-party Python
  client used by Home Assistant. Treat it as a hint only. It has bugs, listed below.

Anything that is not in the Mini doc is **unverified on the Themis Mini** until
`docs/hardware-tests.md` records a result.

The code is `src/core/protocol/` (T1.1). Its tests pin every command value below, and golden
frames laid out by hand from the tables here.

## Weight frame `03 0B`, 0-based offsets

The spec's table numbers bytes from 1. Code uses 0-based indices:

| Index | Field | Encoding |
| --- | --- | --- |
| 0 | product number | `0x03` |
| 1 | type | `0x0B` |
| 2–4 | timer, milliseconds | u24 big-endian |
| 5 | unit | `01` gram, `02` ounce (Ultra doc). The Mini's value is unverified (see 4) |
| 6 | weight sign | see 3 |
| 7–9 | weight × 100 | u24 big-endian |
| 10 | flow sign | see 3 |
| 11–12 | flow × 100 (g/s) | u16 big-endian |
| 13 | battery | percent |
| 14–15 | standby time, minutes × 10 | u16 big-endian |
| 16 | buzzer gear | |
| 17 | flow smoothing switch | `00` off, `01` on |
| 18 | reserved | `00` |
| 19 | checksum | XOR of bytes 0–18 |

Command frames are 6 bytes, `03 0A <sub> <d1> <d2> <xor>`, with the XOR taken over bytes 0–4.

## Verified command bytes

Computed in this repo and identical to the spec's pre-computed values:

| Command | Bytes |
| --- | --- |
| tare | `03 0A 01 00 00 08` |
| buzzer mute / level 5 | `03 0A 02 00 00 0B` / `03 0A 02 00 05 0E` |
| auto-off 5 / 30 min | `03 0A 03 00 05 0F` / `03 0A 03 00 1E 14` |
| start / stop / reset timer | `03 0A 04 00 00 0D` / `03 0A 05 00 00 0C` / `03 0A 06 00 00 0F` |
| tare and start timer | `03 0A 07 00 00 0E` |
| flow smoothing off | `03 0A 08 00 00 01` |
| keep-alive (Ultra doc, unverified on Mini) | `03 0A 25 00 00 2C` |
| calibration, shutdown | **never sent**: `09` and `15` must stay unrepresentable in code |

## Findings that differ from or add to the spec

1. **Checksums in old docs and in aiobookoo are wrong.** Before 2026-07-30 the Mini doc listed
   `0A 0D 0C 00` as the checksums for `04 05 06 07`. The commit "fix: align mini scale protocol
   with firmware" corrected them to `0D 0C 0F 0E`, and aiobookoo 0.1.1 still sends the old
   values. Never copy command bytes from third-party code. Compute the XOR, and pin the spec's
   values in tests.
2. **The flow-smoothing payload position has moved between doc revisions.** It was in BYTE4 in
   2024-05, BYTE5 in 2025-07, and has been back in BYTE4 since 2025-12. This doesn't matter for
   "off", which is `03 0A 08 00 00 01` either way, and we only ever send off. Confirm it worked
   by reading frame index 17, which must become `00`. The recorder (T1.6) does this.
3. **The sign bytes are probably ASCII.** The docs only say "(+/-)". aiobookoo treats `0x2D`
   (`-`) as negative and `0x2B` (`+`) as positive. The decoder should map those two values and
   flag anything else instead of guessing. Hardware test A10 resolves this.
4. **The unit byte value is unknown on the Mini.** The Mini doc gives no values. The Ultra doc
   says `01` gram and `02` ounce, and that the weight is *always* sent in grams anyway.
   aiobookoo's test fixtures use `00`. Policy (D-005): accepted gram values are a constant.
   Any other value is a loud error in the UI and analysis, but raw recording continues.
   Hardware test A9 resolves this.
5. **The timer field is the scale's shot timer, not a clock.** It stays at zero, or frozen at its
   last value, unless the timer is running. A device timebase therefore exists only while the
   field is advancing (D-006, T1.9).
6. **Checksum failures need a rate alarm.** Doc revisions before 2026-07-30 showed byte 19 of the
   weight frame as `00`, which would mean no checksum. If some firmware really sends that,
   "discard bad frames silently" (spec rule 1) would silently discard everything. Discard per
   frame, but alarm when most recent frames fail (T1.1, T1.6). Raw bytes are stored regardless
   (D-004), so the data could be re-parsed later.
7. **aiobookoo's decoder truncates fields.** It reads only bytes 3–4 of the timer (it wraps at
   65.5 s), bytes 8–9 of the weight (wraps at 655.35 g), and byte 14 alone for standby. Don't
   copy it.
8. **Event frame `03 0D` (Ultra; beta firmware ≥ 3.2.4, release ≥ 4.0.0):** `[2]` event state
   (`00` stopped, `01` started, `02` ready, `03` exit ready, `04` exit done), `[3–5]` ms u24,
   `[6]` weight sign, `[7–9]` weight × 100 u24, `[10]` result sign, `[11–12]` average flow
   (timing mode) or ratio (ratio mode) × 100 u16, `[13–18]` `00`, `[19]` XOR. The doc doesn't
   say which characteristic carries it, so log everything from both FF11 and FF12. **The Mini
   (hardware session 1, D-037):** FF12 carries it, only as the automatic mode's own run starts
   and ends, and every byte after the state is `00`, the sign bytes too.
9. **Powder-weight frame `03 0F` (Ultra):** `[2]` sign, `[3–5]` powder weight × 100 u24,
   `[6–18]` `00`, `[19]` XOR.
10. **Mode gating on the Ultra:** `04`/`05`/`06` work only in timing and ratio modes. `01` (tare)
    is unavailable during an automatic run. What `07` does depends on the mode and firmware. The
    Mini doc says nothing about modes, hence hardware tests A4, A5 and A12.
11. **Firmware-dependent commands on the Ultra:** `0D`/`0F` need beta firmware ≥ 3.2.4 or
    release ≥ 4.0.0, `15` needs ≥ 4.0.0, and `25` needs ≥ 4.0.1. `0B` changed its parameter
    format at 4.0.0. The Mini's firmware versioning is unknown. `0B` and `0D` stay out of the
    command whitelist until the user approves them (D-008).
12. **Device discovery:** aiobookoo matches advertised names starting with `BOOKOO`. Whether
    the Mini advertises service `0x0FFE` is unverified (hardware test A14). Use filters that
    match either one, since filters are OR-ed: `[{ services: [0x0ffe] }, { namePrefix: 'BOOKOO' }]`
    with `optionalServices: [0x0ffe]`.
13. **Serialise writes.** aiobookoo sends commands through a queue with 100 ms spacing. Web
    Bluetooth implementations reject overlapping GATT operations, so keep one in flight.
14. **Subscribe before you see data.** aiobookoo subscribes only to FF11. The spec wants FF12
    notifications too, but FF12 may not have the notify property (hardware test A15). Check
    `characteristic.properties` first and log what is there.
15. **What FF12 sent on the Mini (hardware sessions 1 and 2, D-037, D-048).** FF12 has the
    notify property (A15), and four frames came on it in two sessions, all with valid checksums:
    - `03 0D 01 …` and `03 0D 00 …`, with every other byte 0. They came when the scale's
      automatic mode started its own timer, and at the app's `05` that ended that run: the
      Ultra's event frame (finding 8), with its timer and weight fields left empty.
    - `03 0C 00 8D`, then the ASCII text "SN" and a 12-character serial number, then `01`. It
      came once, 6 s after connecting, with nothing in the log near it.
    - `03 0E 01 07`, then zeros, 0.4 s after the `03 0C` frame.

    The decoder reports the last two as `unknown` frames, and nothing uses them. A button tare
    sent nothing.
16. **Weights are tenths, some sent a hundredth short (D-037, D-048).** The weight field carries
    hundredths, but the Mini weighs in 0.1 g steps. Some tenths come out a hundredth short, as a
    truncated float would: 264.79 for 264.8, 35.09 for 35.1. They come at rest as well as in
    motion: 746 of 6,085 readings in session 2. Every reading is within 0.01 g of a tenth, so
    analysis can snap readings to the grid (T1.16). The decoder reports what was sent.
