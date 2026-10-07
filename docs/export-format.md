# Export format, version 6

This document is normative: the app writes files as described here, and must keep reading every
version it ever wrote. The code is `src/core/export/`, and D-025 and D-075 explain the choices.

The export is the durable artifact. IndexedDB is a cache of it (spec "Storage and export"): a
recording that exists only on the phone can be evicted by Safari, and one that was exported
can't be lost. So the file holds the raw recordings verbatim, every byte of every notification,
and the microphone's sound levels where they were recorded, together with the metadata that goes
with them.

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
| `formatVersion` | integer | `6` for this document. See "Reading a file" |
| `exportedAtEpochMs` | number | When the file was written: wall-clock ms since 1970 |
| `app` | object | The build that wrote the file: `{ "commit": string, "buildTime": string }` |
| `recordings` | array | Raw: one entry per recording, oldest first. See "Recordings" |
| `shots` | array | Metadata: shots, discarded ones too. See "Shots" |
| `entities` | object or `null` | Version 4. Metadata: the machines, grinders, recipes, coffee packs, containers and tags, removed ones too, or `null` when the file doesn't carry them (a one-recording export). See "Entities" |
| `settings` | object or `null` | The app's settings, or `null` when the file doesn't carry them (a one-recording export). See "Settings" |

A one-recording export holds that recording and its shots. A full export holds every recording,
every shot, every entity and the settings.

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

Each frame is one BLE notification exactly as it arrived (D-004), or one reading of the
microphone's sound levels (version 2), written as a compact row:

```json
[seq, tMs, source, hex]
```

| Item | Type | Meaning |
| --- | --- | --- |
| `seq` | integer ≥ 0 | The recording's sequence number, shared with its events |
| `tMs` | number | Arrival time. The scale's own timer is inside the bytes (D-006) |
| `source` | `"ff11"`, `"ff12"` or `"mic"` | The characteristic it came from (weight data, or commands), or `mic`: the microphone's sound levels (below) |
| `hex` | string | The bytes as packed upper-case hex, two digits per byte with no separators: `030B0000…`. `""` for an empty notification |

Frames are verbatim: a frame with a bad checksum, the wrong length or an unknown header is a
frame too. Decoding the bytes is the job of `src/core/protocol` (byte layouts in
`docs/protocol-notes.md`), so a decoder fix applies to every file ever written. Hex is upper case
only: a reader refuses lower case, spaces or an odd number of digits.

#### Sound levels: `mic` frames (version 2)

While the probe records sound (T1.24, D-049, D-050), the microphone's levels arrive about 20
times a second, as frames with the source `mic`. `tMs` is when the reading was made. Its spectrum
covers the last `fftSize / sampleRateHz` seconds before that, about 85 ms. A recording's
`sound-started` events say when levels begin, and how they were measured. Levels are read only
while audio reaches the meter: a `sound-input` event says when they pause and resume.

`tMs` is the recording's clock, as for every record. On the simulator's sped-up link
(`#/probe?mock&speed=10`) that clock runs fast, while the microphone runs in real time, so the
levels come `intervalMs × speed` apart there.

The bytes are the layout's id, then one byte per level. A level byte is −dB × 2, so 0 is 0 dB
(full scale) and 255 is −127.5 dB or quieter. Levels are power sums over bins of
`sampleRateHz / fftSize` Hz, in dB relative to full scale (`src/core/sound`). They can't be
turned back into sound.

Layout 1, the 12 levels in order:

| # | Level | Bins |
| --- | --- | --- |
| 1 | `40-70 Hz` | centred from 40 Hz up to 70 Hz: a pump's mains hum, at 50 or 60 Hz |
| 2 | `70-130 Hz` | 70–130 Hz |
| 3 | `130-260 Hz` | 130–260 Hz |
| 4 | `260-520 Hz` | 260–520 Hz |
| 5 | `520-1000 Hz` | 520–1000 Hz |
| 6 | `1-2 kHz` | 1–2 kHz |
| 7 | `2-4 kHz` | 2–4 kHz |
| 8 | `4-8 kHz` | 4–8 kHz |
| 9 | `8-16 kHz` | 8–16 kHz |
| 10 | `50 Hz harmonics` | the bin nearest each of 50, 100, … 1000 Hz |
| 11 | `60 Hz harmonics` | the bin nearest each of 60, 120, … 960 Hz |
| 12 | `all` | 40 Hz–16 kHz |

A frame whose layout a reader doesn't know is still a frame: raw is kept, whatever it holds.

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
| `sound-started` | Version 2. `{ "layout": integer, "measures": the layout's levels as JSON or null, "sampleRateHz": number, "fftSize": integer, "intervalMs": number, "input": string or null, "continued": boolean }`. `mic` frames follow. `continued` is true when the microphone was already running as this recording began |
| `sound-input` | Version 2. `{ "contextState": string, "muted": boolean }`. The microphone's input changed state. Levels are read only while `contextState` is `running` and `muted` is false, so this explains a gap in the `mic` frames: the page went to the background, or the system took the microphone. After `sound-started`, it says the levels start paused |
| `sound-stopped` | Version 2. `{ "reason": "user" or "ended" or "error", "message": string or null }`. No more `mic` frames until the next `sound-started` |

The command names are the whitelist in `src/core/protocol/commands.ts`. A reader refuses an
event type it doesn't know, loudly, rather than dropping it: raw is never lost silently (D-018).

The `ui-action`s the app logs (informative: any action and detail are valid):

| `action` | `detail` |
| --- | --- |
| `manual-start` | `null`. The Tare + start tap made with the pump (D-048); its `07` follows with the same reason |
| `phase` | `{ "phase": "beans" or "grind" or "extraction" or "milk", "state": "open" or "done" or "skipped", "by": "container" or "user" or "pump" or "shot" }`. The brew's phase flow (T2.5, D-079): the analysis measures the beans, grounds and milk inside the phases it marks |
| `page-hidden`, `page-visible` | `null`. The page went to the background, or came back (B4) |

### Order

- Frames are in strictly increasing `seq` order, and so are events. No `seq` belongs to both a
  frame and an event. Merged by `seq`, they are the recording's timeline, in the order the
  recorder saw them.
- A gap in `seq` is allowed: it records a lost record.
- `tMs` usually grows with `seq`, but needn't (D-024).

## Shots

A shot is one extraction: user metadata anchored at a time in a recording (D-007, D-019). Besides
its grades, it keeps a snapshot of its context as values at brew time, next to the ids (version
3; spec v2 "What every shot records", D-053, D-068), so that editing equipment later never
rewrites history. The ids name the entities (version 4), which a full export carries. A shot
made before the entities existed (T2.1) has most of its snapshot `null`, and the phases fill in
theirs as they come (T2.4–T2.11).

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | id | |
| `recordingId` | id | Its recording. It may be one that isn't in the file, but stored where the file is imported |
| `anchorTMs` | number | A time inside the shot on the recording's timeline. Analysis matches the shot to a segment by it |
| `source` | `"live"`, `"manual"` or `"post-hoc"` | Who created it: the capture flow, the user, or analysis |
| `createdAtEpochMs` | number | |
| `updatedAtEpochMs` | number | When its metadata last changed |
| `discardedAtEpochMs` | number or `null` | When the user deleted it. A discarded shot is a tombstone, and is exported too |
| `direction` | `"sour"`, `"balanced"`, `"bitter"` or `null` | The taste grade |
| `channelled` | boolean or `null` | Channels or spurts |
| `tags` | array of strings, or `null` | `[]`: no tags given. `null`: the field wasn't captured |
| `doseG` | number or `null` | The dose the target was set from, in grams: the ground dose, else the beans weighed, else the basket's size; until those phases exist, the dose set on the extraction screen |
| `targetRatio` | number or `null` | The recipe's coffee ratio, yield ÷ dose: `2` for 1:2 |
| `recipeId` | id or `null` | Version 3. The recipe entity |
| `recipeName` | string or `null` | Version 3. The drink, like `"Cappuccino"` |
| `milkRatio` | number or `null` | Version 3. Milk to espresso, `3` for 1:3; `null` for a recipe without milk |
| `beansPhase`, `grindPhase`, `milkPhase` | `"done"`, `"skipped"` or `null` | Version 3. What became of each phase of the brew. `null`: the phase wasn't offered (before it existed) or doesn't apply (the milk of a recipe without a milk ratio). The extraction is the shot itself |
| `beansWeighedG` | number or `null` | Beans weighed before grinding, in grams |
| `groundG` | number or `null` | Version 3. The ground dose, in grams. The retention is `beansWeighedG` less this |
| `milkG` | number or `null` | Version 3. The milk poured, in grams |
| `machineId`, `basketId` | id or `null` | Version 3. The machine and its basket |
| `machineName` | string or `null` | Version 3 |
| `pressureBar` | number or `null` | Version 3. The machine's pressure |
| `basketSizeG` | number or `null` | Version 3. The basket's size in grams: the beans target |
| `grinderId` | id or `null` | The grinder |
| `grinderName` | string or `null` | Version 3. Its brand and model |
| `grindSetting` | `{ "kind": "stepless" or "clicks", "value": number }` or `null` | For `clicks`, `value` is a whole number |
| `burrEpochId` | id or `null` | Burr epochs are deferred (D-053), so `null` |
| `packId` | id or `null` | The coffee pack. Named `beanBagId` up to version 2 |
| `packName` | string or `null` | Version 3. Its brand and name |
| `packRoastDate`, `packOpenDate` | date or `null` | Version 3. As on the pack |
| `containerId` | id or `null` | The cup's container |
| `lastDescaleDate`, `lastBackflushDate`, `lastGrinderCareDate` | date or `null` | Version 3. The maintenance dates at brew time |

A date is a calendar day as `YYYY-MM-DD`, like `"2026-09-22"`: a day the user names, so no time
zone moves it.

Nothing derivable is stored: days off roast and days open derive from the pack's dates (T2.2),
the retention from the beans and the ground dose, and the targets from the doses and ratios.

## Entities

Version 4 (T2.1, D-074). What the user sets up: the machine with its baskets and maintenance
dates, the grinders, the recipes, the coffee packs, the containers and the tags (spec v2
"Equipment, coffee and settings"). Shots name them by id and keep their values as a snapshot.

```json
{ "machines": [ … ], "grinders": [ … ], "recipes": [ … ], "packs": [ … ], "containers": [ … ], "tags": [ … ] }
```

Every kind's list is present, `[]` when there are none, and the app writes each in id order,
which is creation order. Ids are unique within a kind. Every entity has these fields first:

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | id | |
| `createdAtEpochMs` | number | |
| `updatedAtEpochMs` | number | When it last changed |
| `removedAtEpochMs` | number or `null` | When the user removed it. A removed entity is a tombstone, kept and exported, so that an import never brings it back |

Then each kind's own fields:

| Kind | Field | Type | Meaning |
| --- | --- | --- | --- |
| `machines` | `name` | string | Like `"Gaggia Classic Pro"` |
| | `pressureBar` | number or `null` | Its brew pressure |
| | `baskets` | array of `{ "id": id, "name": string or null, "sizeG": number }` | Each basket's size is the beans target; the id tells apart baskets of the same size |
| | `descale`, `backflush` | maintenance | See below |
| `grinders` | `brand`, `model` | string | Like `"Eureka"` and `"ORO Mignon Single Dose Pro"` |
| | `settingKind` | `"stepless"` or `"clicks"` | As a shot's `grindSetting.kind` |
| | `currentSetting` | number or `null` | The setting now. For `clicks`, a whole number |
| | `settingStep` | number or `null` | Version 6. How far a step of − or + moves a `stepless` setting, above 0, like `0.05` to mark between the dial's marks; `null` for the default step, 0.1. A `clicks` grinder steps one click whatever it holds |
| | `care` | maintenance | Grinder care. See below |
| `recipes` | `name` | string | The drink, like `"Cappuccino"` |
| | `coffeeRatio` | number | Yield ÷ dose: `2` for 1:2 |
| | `milkRatio` | number or `null` | Milk ÷ espresso: `3` for 1:3; `null` for a drink without milk |
| `packs` | `brand` | string or `null` | The roaster |
| | `name` | string | Its name or type |
| | `weightG` | number or `null` | The pack's weight when bought |
| | `roastDate` | date | As on the pack. Required |
| | `openDate`, `finishedDate` | date or `null` | When it was opened, and finished |
| | `flavours` | array of strings | As on the pack; `[]` for none |
| | `buyAgain` | boolean or `null` | Would buy again, asked when it is finished; `null` when not answered |
| `containers` | `name` | string | |
| | `emptyMassG` | number | Its mass empty, as the scale weighed it |
| | `roles` | array of `"bean"`, `"grind"`, `"cup"`, `"milk"`, `"accessory"` | What it is put down for: bean cup, grind cup, cup, milk jug; or a scale accessory, like the mat that protects the scale, which is part of the platform and opens no phase (version 5). The app gives an accessory no other role |
| | `dismissedWarningIds` | array of ids | The containers whose "within 3 g" warning with this one the user dismissed |
| `tags` | `name` | string | What a shot's `tags` hold |
| | `group` | string or `null` | Only sorts the list |
| | `isDefault` | boolean | On for every new shot |

A maintenance date is `{ "lastDoneDate": date or null, "reminderDays": integer ≥ 0 or null }`:
when it was last done (`null`: never logged), and how many days after that to remind (`null`:
no reminder).

Which entity the next brew uses is not an entity's field: it is the last used, in the settings.

A new database starts with seeds: the spec's machine and grinders, its prefilled recipes and the
design's tags (`src/core/model/seeds.ts`). Their ids and times are fixed, so a seed nobody changed
is the same record in every file.

## Settings

An object of the app's settings: its key-value store, each value any JSON. `null` when the file
doesn't carry settings, `{}` when there are none. The brew flow keeps its last-used values here:
`lastUsed.recipeId` and `lastUsed.doseG` (T1.18, T2.1), and the machine, basket, grinder and pack
as the phases come (`lastUsed.machineId`, `lastUsed.basketId`, `lastUsed.grinderId`,
`lastUsed.packId`).

Up to version 3 the tag list was the setting `tags` (`[{ "name", "isDefault" }]`) and the last
recipe the setting `lastUsed.recipe`, a prefilled recipe's name. Reading such a file turns them
into tags and `lastUsed.recipeId` (see "Reading a file").

## What isn't in the file

- **Derived data**: segments, markers and metrics. They are a pure function of raw and are
  recomputed after import (spec "Layers").
- **Live values** from the display pipeline, which are never stored (CLAUDE.md hard rule 3).
- **Device-local values**: the automatic export's settings, token and ledger, and the remembered
  scale (D-030).

## Layout

How the app lays the file out. It is informative: a reader must accept any JSON with the same
content.

- One record per line: the recording, each frame row, each event, each shot and each entity.
  Tools that work line by line, like `grep`, `sed`, `diff` or an agent reading part of a file,
  see whole records, and a fixture's git diff shows the records that changed.
- The structure around the records is indented by one space per level. A frame then takes about
  80 bytes, so three minutes at 10 Hz is about 145 KB (D-025).
- Inside strings, U+0085, U+2028 and U+2029 are written as JSON escapes, because some tools
  (Python's `splitlines()`, for one) take them for line breaks.
- The entities' lists are written in the order above, and settings in key order. The file ends
  with a newline.

```json
{
 "format": "smart-scale-export",
 "formatVersion": 6,
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
  {"id":"019a1b2c-3d4e-7000-9000-000000000002","recordingId":"019a1b2c-3d4e-7000-8000-0000000000a1","anchorTMs":0,"source":"post-hoc","createdAtEpochMs":1791095455000,"updatedAtEpochMs":1791095455000,"discardedAtEpochMs":null,"direction":null,"channelled":null,"tags":null,"doseG":null,"targetRatio":null,"recipeId":null,"recipeName":null,"milkRatio":null,"beansPhase":null,"beansWeighedG":null,"grindPhase":null,"groundG":null,"milkPhase":null,"milkG":null,"machineId":null,"machineName":null,"pressureBar":null,"basketId":null,"basketSizeG":null,"grinderId":null,"grinderName":null,"grindSetting":null,"burrEpochId":null,"packId":null,"packName":null,"packRoastDate":null,"packOpenDate":null,"containerId":null,"lastDescaleDate":null,"lastBackflushDate":null,"lastGrinderCareDate":null}
 ],
 "entities": null,
 "settings": null
}
```

A full export's entities, shortened:

```json
 "entities": {
  "machines": [
   {"id":"01a1095c-3400-7000-8000-5eed00000000","createdAtEpochMs":1791158400000,"updatedAtEpochMs":1791158400000,"removedAtEpochMs":null,"name":"Gaggia Classic Pro","pressureBar":6,"baskets":[{"id":"01a1095c-3400-7001-8000-5eed00000001","name":"LM 17 g","sizeG":17}],"descale":{"lastDoneDate":null,"reminderDays":null},"backflush":{"lastDoneDate":null,"reminderDays":null}}
  ],
  "grinders": [ … ],
  "recipes": [ … ],
  "packs": [],
  "containers": [],
  "tags": [ … ]
 },
```

## Reading a file

1. Ignore a byte order mark, and parse the JSON.
2. Check that `format` is `"smart-scale-export"`.
3. Check `formatVersion`, an integer from 1. A version newer than the reader knows is refused
   with a message that says so: reload the app to get a newer build. An older version is
   upgraded one version at a time by the migrations (`EXPORT_MIGRATIONS`), before validation.
   Upgrading a version 3 file to 4 adds `entities`: `null` when the file has no settings (a
   one-recording export), else every kind's list. The settings' T1.18 tag list `tags` becomes
   those tags (a seed's name keeps the seed's id, any other name an id derived from it, so the
   same list always gives the same tags), and `lastUsed.recipe`, a prefilled recipe's name,
   becomes `lastUsed.recipeId`. The app's database makes the same change to its own settings.
4. Validate every record against its schema, the order rules above, and that no recording or
   shot id appears twice, nor an entity's id in its kind's list. A reader refuses the whole file
   on any error, naming the place, like `recordings[0].frames[12][3]` or
   `entities.packs[0].roastDate`.

In code: `parseExport(text)` returns the file's version and its content in model terms, and
`serialiseExport(bundle)` writes one.

Outside the app, a file is plain JSON. In Python, for example:

```python
import json

with open("smart-scale_2026-10-04_083005_1c2d3e4f.json", encoding="utf-8") as f:
    export = json.load(f)
assert export["format"] == "smart-scale-export" and export["formatVersion"] in (1, 2, 3, 4, 5, 6)
for entry in export["recordings"]:
    for seq, t_ms, source, hex_bytes in entry["frames"]:
        payload = bytes.fromhex(hex_bytes)
        if source == "mic" and payload[0] == 1:
            levels_db = [-b / 2 for b in payload[1:]]  # layout 1's 12 levels
```

## Importing

How the app merges a file into its storage (`src/app/export.ts`, D-025, D-075):

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
- **Metadata** (shots, entities and settings) not stored yet is added. Stored metadata that
  equals the file's is left alone. Stored metadata that differs is kept, unless the user asks
  for the file's to replace it. A shot is replaced only if it is the same shot, with the same
  recording, anchor, source and creation time, and an entity only if it has the same creation
  time; otherwise the import reports a conflict and leaves it alone.
- **A seed nobody changed** on this device (a stored entity exactly as seeded) takes the file's
  version whatever the user asked: it holds no choice of theirs, so restoring a backup onto a
  new database brings back their edits to the seeds.
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

The entities go to `<folder>entities.json` (version 4, T2.1, D-076): an export with no
recordings, no shots and no settings, only every entity, removed ones too. It is rewritten when
they change, and left alone, with the reason shown, while it holds an entity this device lacks
or a newer version of one (another device's edit): importing it merges them.

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
| 2 | 2026-10-05 | T1.24 | Frames from the microphone (`"mic"`): its sound levels, layout 1. The events `sound-started`, `sound-input` and `sound-stopped`. A version 1 file holds none of them, so it imports unchanged |
| 3 | 2026-10-05 | T1.18 | Shots carry a snapshot of their context and the phases' results: `recipeId`, `recipeName`, `milkRatio`, `beansPhase`, `grindPhase`, `groundG`, `milkPhase`, `milkG`, `machineId`, `machineName`, `pressureBar`, `basketId`, `basketSizeG`, `grinderName`, `packName`, `packRoastDate`, `packOpenDate`, `lastDescaleDate`, `lastBackflushDate` and `lastGrinderCareDate`, and `beanBagId` is renamed `packId`. An older shot reads the new fields as `null` and its `beanBagId` as `packId` |
| 4 | 2026-10-05 | T2.1 | The entities: `entities`, with the machines (baskets, descale and backflush), grinders (care), recipes, coffee packs, containers and tags, `null` in a one-recording export. An older full export gains empty lists, its T1.18 setting `tags` becomes tags and `lastUsed.recipe` (a name) becomes `lastUsed.recipeId`; an older one-recording export gains `null` |
| 5 | 2026-10-06 | T2.17 | A container's `roles` may hold `"accessory"`: a scale accessory, like the mat on the scale. A version 4 file holds none, so it imports unchanged |
| 6 | 2026-10-07 | T2.28 | A grinder's `settingStep`: the step its stepless setting moves by. A version 5 grinder has none, which reads as `null` (the default step), so the file imports unchanged |
