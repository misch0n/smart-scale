# Export format, version 1

This document is normative: the app writes files as described here, and must keep reading every
version it ever wrote. The code is `src/core/export/`, and D-025 explains the choices.

The export is the durable artifact. IndexedDB is a cache of it (spec "Storage and export"): a
recording that exists only on the phone can be evicted by Safari, and one that was exported
can't be lost. So the file holds the raw recordings verbatim, every byte of every notification,
together with the metadata that goes with them.

## The file

- JSON in UTF-8, with the extension `.json` and the media type `application/json`.
- Name: `smart-scale_YYYY-MM-DD_HHMMSS_<label>.json`, in local time. A one-recording export is
  named after the recording's start and its short id (the last 8 hex digits of its id, D-017),
  like `smart-scale_2026-10-04_083005_1c2d3e4f.json`. A full export is named after the export
  time, with the label `all`.
- A reader ignores a byte order mark at the start.

## Top level

| Key | Type | Meaning |
| --- | --- | --- |
| `format` | `"smart-scale-export"` | What the file is. Anything else isn't an export |
| `formatVersion` | integer | `1` for this document. See "Reading a file" |
| `exportedAtEpochMs` | number | When the file was written: wall-clock ms since 1970 |
| `app` | object | The build that wrote the file: `{ "commit": string, "buildTime": string }` |
| `recordings` | array | Raw: one entry per recording, oldest first. See "Recordings" |
| `shots` | array | Metadata: shots, discarded ones too. See "Shots" |
| `settings` | object or `null` | The app's settings, or `null` when the file doesn't carry them (a one-recording export). See "Settings" |

A one-recording export holds that recording and its shots. A full export holds every recording,
every shot and the settings.

## Rules for every record

- **Every field is present.** A field that is not set, hidden or not applicable is `null`, never
  missing (spec "Schema rules"). A reader fills a missing nullable field with `null`, so a file
  edited by hand still reads, but the app never writes one.
- **Times.** `tMs` is milliseconds since the recording started, on the recorder's monotonic
  clock, as a float with full precision. Fields ending in `EpochMs` are wall-clock milliseconds
  since 1970, and may be fractional too (`endedAtEpochMs` is the start plus a `tMs`).
- **Ids** are lower-case UUIDv7 strings (D-017), like `019a1b2c-3d4e-7000-8000-0123456789ab`.
- **Numbers are finite.** JSON can't carry NaN or infinities, and no record holds them.
- **Unknown keys are ignored** by readers. A later version adds keys only together with a new
  `formatVersion`, so an older reader refuses the file rather than silently dropping what it
  doesn't know.

## Recordings

Each entry is one recording, one BLE connection from connect to disconnect, with all of its raw
records:

```json
{ "recording": { … }, "frames": [ … ], "events": [ … ] }
```

The frames and events inside an entry don't repeat the recording's id: the entry's `recording.id`
is theirs.

### `recording`

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | id | The recording's id |
| `startedAtEpochMs` | number | Wall clock at `tMs` 0 |
| `endedAtEpochMs` | number or `null` | When it ended; `null` if it was exported while still recording |
| `endReason` | `"user"`, `"device"`, `"error"`, `"unclean"` or `null` | `user`: the app disconnected. `device`: the link dropped. `error`: the app hit an error. `unclean`: the app stopped without ending it, and it was ended at its last record later. `null` while recording |
| `device` | object | `{ "name": string or null, "id": string or null }`: the advertised name, and the browser's opaque per-origin device id |
| `transport` | `"web-bluetooth"` or `"mock"` | What captured it. `mock` is the simulator |
| `app` | object | The build that captured it: `{ "commit", "buildTime" }` |
| `userAgent` | string or `null` | `navigator.userAgent` of the capturing browser (beacio in Safari, or Bluefy) |

### `frames`

Each frame is one BLE notification exactly as it arrived (D-004), written as a compact row:

```json
[seq, tMs, source, hex]
```

| Item | Type | Meaning |
| --- | --- | --- |
| `seq` | integer ≥ 0 | The recording's sequence number, shared with its events |
| `tMs` | number | Arrival time. The scale's own timer is inside the bytes (D-006) |
| `source` | `"ff11"` or `"ff12"` | The characteristic it came from: weight data, or commands |
| `hex` | string | The bytes as packed upper-case hex, two digits per byte with no separators: `030B0000…`. `""` for an empty notification |

Frames are verbatim: a frame with a bad checksum, the wrong length or an unknown header is a
frame too. Decoding the bytes is the job of `src/core/protocol` (byte layouts in
`docs/protocol-notes.md`), so a decoder fix applies to every file ever written. Hex is upper case
only: a reader refuses lower case, spaces or an odd number of digits.

### `events`

Each event is something the app or the user did, on the same timeline as the frames:

```json
{ "seq": 7, "tMs": 368.84, "type": "command-sent", "data": { … } }
```

| `type` | `data` |
| --- | --- |
| `connected` | `{ "deviceName": string or null, "deviceId": string or null }`. The recording's first event |
| `disconnected` | `{ "reason": "user" or "device" or "error", "message": string or null }`. The last record, unless the app died first |
| `command-sent` | `{ "command": whitelist name, "param": integer or null, "hex": packed upper-case hex, "reason": string or null }` |
| `command-failed` | as `command-sent`, plus `"error": string` |
| `ui-action` | `{ "action": string, "detail": any JSON or null }` |
| `annotation` | `{ "label": string, "text": string or null }`. Labels include `pump-on`, `pump-off`, `cup-on`, `cup-off` and `note` |
| `smoothing-confirmed` | `{ "attempts": integer ≥ 0 }` |
| `smoothing-not-confirmed` | `{ "attempts": integer ≥ 0, "smoothingByte": integer ≥ 0 or null }` |
| `error` | `{ "message": string, "context": string or null }` |
| `characteristic-properties` | `{ "characteristic": "ff11" or "ff12", "properties": { "broadcast", "read", "writeWithoutResponse", "write", "notify", "indicate", "authenticatedSignedWrites", "reliableWrite", "writableAuxiliaries" } }`, each a boolean or `null` |

The command names are the whitelist in `src/core/protocol/commands.ts`. A reader refuses an
event type it doesn't know, loudly, rather than dropping it: raw is never lost silently (D-018).

### Order

- Frames are in strictly increasing `seq` order, and so are events. No `seq` belongs to both a
  frame and an event. Merged by `seq`, they are the recording's timeline, in the order the
  recorder saw them.
- A gap in `seq` is allowed: it records a lost record.
- `tMs` usually grows with `seq`, but needn't (D-024).

## Shots

A shot is one extraction: user metadata anchored at a time in a recording (D-007, D-019).

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | id | |
| `recordingId` | id | Its recording. It may be one that isn't in the file, but stored where the file is imported |
| `anchorTMs` | number | A time inside the shot on the recording's timeline. Analysis matches the shot to a segment by it |
| `source` | `"live"`, `"manual"` or `"post-hoc"` | Who created it: the capture flow, the user, or analysis |
| `createdAtEpochMs` | number | |
| `updatedAtEpochMs` | number | When its metadata last changed |
| `discardedAtEpochMs` | number or `null` | When the user deleted it. A discarded shot is a tombstone, and is exported too |
| `direction` | `"sour"`, `"balanced"`, `"bitter"` or `null` | The direction grade |
| `channelled` | boolean or `null` | |
| `tags` | array of strings, or `null` | `[]`: no tags given. `null`: the field wasn't captured |
| `doseG` | number or `null` | Dose in grams |
| `targetRatio` | number or `null` | Yield ÷ dose: `2` for 1:2 |
| `beansWeighedG` | number or `null` | Beans weighed before grinding, in grams |
| `beanBagId`, `grinderId`, `burrEpochId`, `containerId` | id or `null` | Phase 2 entities. Version 1 carries no entities, so these are `null` in practice. Version 2 (T2.1) adds the entities to the file |
| `grindSetting` | `{ "kind": "stepless" or "clicks", "value": number }` or `null` | For `clicks`, `value` is a whole number |

Days off roast isn't stored: it derives from the bag's roast date (T2.2).

## Settings

An object of the app's settings: its key-value store, each value any JSON. `null` when the file
doesn't carry settings, `{}` when there are none. Settings arrive with T1.18 and T2.8.

## What isn't in the file

- **Derived data**: segments, markers and metrics. They are a pure function of raw and are
  recomputed after import (spec "Layers").
- **Entities**: bean bags, grinders, burr epochs and containers. Version 2 adds them (T2.1).
- **Live values** from the display pipeline, which are never stored (CLAUDE.md hard rule 3).

## Layout

How the app lays the file out. It is informative: a reader must accept any JSON with the same
content.

- One record per line: the recording, each frame row, each event and each shot. Tools that
  work line by line, like `grep`, `sed`, `diff` or an agent reading part of a file, see whole
  records, and a fixture's git diff shows the records that changed.
- The structure around the records is indented by one space per level. A frame then takes about
  80 bytes, so three minutes at 10 Hz is about 145 KB (D-025).
- Inside strings, U+0085, U+2028 and U+2029 are written as JSON escapes, because some tools
  (Python's `splitlines()`, for one) take them for line breaks.
- Settings are written in key order. The file ends with a newline.

```json
{
 "format": "smart-scale-export",
 "formatVersion": 1,
 "exportedAtEpochMs": 1791268206234,
 "app": {"commit":"abc1234","buildTime":"2026-10-04T06:00:00.000Z"},
 "recordings": [
  {
   "recording": {"id":"019a1b2c-3d4e-7000-8000-0000000000a1","startedAtEpochMs":1791095405000,"endedAtEpochMs":1791095444945.9058,"endReason":"user","device":{"name":"BOOKOO_MINI","id":"dGVzdA=="},"transport":"web-bluetooth","app":{"commit":"abc1234","buildTime":"2026-10-04T06:00:00.000Z"},"userAgent":"Mozilla/5.0 (iPhone; …)"},
   "frames": [
    [3,65.75187933857801,"ff11","030B000000012B0000012B00005A00B202000062"],
    [4,154.29101801933936,"ff11","030B000000012D0000012D00145A003202000076"]
   ],
   "events": [
    {"seq":0,"tMs":0,"type":"connected","data":{"deviceName":"BOOKOO_MINI","deviceId":"dGVzdA=="}},
    {"seq":7,"tMs":368.8397029851458,"type":"command-sent","data":{"command":"flowSmoothingOff","param":null,"hex":"030A08000001","reason":"connect"}}
   ]
  }
 ],
 "shots": [
  {"id":"019a1b2c-3d4e-7000-9000-000000000002","recordingId":"019a1b2c-3d4e-7000-8000-0000000000a1","anchorTMs":0,"source":"post-hoc","createdAtEpochMs":1791095455000,"updatedAtEpochMs":1791095455000,"discardedAtEpochMs":null,"direction":null,"channelled":null,"tags":null,"doseG":null,"targetRatio":null,"beansWeighedG":null,"beanBagId":null,"grinderId":null,"grindSetting":null,"burrEpochId":null,"containerId":null}
 ],
 "settings": null
}
```

## Reading a file

1. Ignore a byte order mark, and parse the JSON.
2. Check that `format` is `"smart-scale-export"`.
3. Check `formatVersion`, an integer from 1. A version newer than the reader knows is refused
   with a message that says so: reload the app to get a newer build. An older version is
   upgraded one version at a time by the migrations (`EXPORT_MIGRATIONS`), before validation.
4. Validate every record against its schema, the order rules above, and that no recording or
   shot id appears twice. A reader refuses the whole file on any error, naming the place, like
   `recordings[0].frames[12][3]`.

In code: `parseExport(text)` returns the file's version and its content in model terms, and
`serialiseExport(bundle)` writes one.

Outside the app, a file is plain JSON. In Python, for example:

```python
import json

with open("smart-scale_2026-10-04_083005_1c2d3e4f.json", encoding="utf-8") as f:
    export = json.load(f)
assert export["format"] == "smart-scale-export" and export["formatVersion"] == 1
for entry in export["recordings"]:
    for seq, t_ms, source, hex_bytes in entry["frames"]:
        payload = bytes.fromhex(hex_bytes)
```

## Importing

How the app merges a file into its storage (`src/app/export.ts`, D-025):

- **Raw is never replaced.** A recording whose id is stored already is skipped, whatever the
  file holds for it, so importing a file twice changes nothing the second time. A new recording
  is stored whole, with all its frames and events, in one transaction: a failed import leaves
  nothing half-stored, and can simply be run again.
- **An open recording** (`endedAtEpochMs` `null`: exported while recording) is stored ended as
  `unclean`, at `startedAtEpochMs` plus the `tMs` of its last frame or last event, whichever is
  later. That is what startup recovery would do (D-024). Nobody is recording it where it is
  imported.
- When a skipped recording's file copy has records after the stored copy's last one, the import
  says how many. They aren't imported: a stored recording never changes.
- **Metadata** (shots and settings) not stored yet is added. Stored metadata that equals the
  file's is left alone. Stored metadata that differs is kept, unless the user asks for the file's
  to replace it. A shot is replaced only if it is the same shot, with the same recording, anchor,
  source and creation time; otherwise the import reports a conflict and leaves it alone.
- A shot whose recording is neither in the file nor stored is imported anyway, and reported.

## In the automatic export's repo

Informative (T1.20, D-030). Once the user has set up automatic export on the phone, it uploads
each closed recording, as a one-recording file, to a private GitHub repo:

- at `<folder>YYYY/MM/<file name>`, by the recording's local start, with the folder
  `recordings/` unless the user chose another: for example
  `recordings/2026/10/smart-scale_2026-10-04_083005_1c2d3e4f.json`;
- one commit per upload. A file is rewritten in place when its recording's shots change, and
  never deleted. Files written by older builds keep their `formatVersion`;
- open recordings and the simulator's (`"transport": "mock"`) aren't uploaded.

Restoring from the repo is importing its files, which is idempotent.

## Changing the format

Every change gets a new `formatVersion` (CLAUDE.md hard rule 7):

1. Add a migration to `EXPORT_MIGRATIONS` in `src/core/export/format.ts` that turns a file of the
   previous version into the new one. It works on the parsed JSON, before validation.
   `FORMAT_VERSION` follows from the number of migrations.
2. Update this document, and add the version to the history below.
3. Add a test that a file of every older version still imports.

Never edit or remove a migration: files of every version must keep importing.

## Version history

| Version | Date | Task | Change |
| --- | --- | --- | --- |
| 1 | 2026-10-04 | T1.7 | First version |
