# Espresso tracker — implementation spec

Oct 3, 2026 · @Mihail

> **Version 2 — 2026-10-04.** This is the user's original spec (`docs/spec.md`, kept verbatim)
> with the UI/UX decisions from the design exploration folded in: decisions D-039 to D-045,
> revised by D-052 to D-054 (2026-10-05), mockups and the working brief in
> `design/ui-exploration/`. Sections marked **(v2)** were
> changed or added; every other section is the original text. Where this file and
> `docs/spec.md` differ, this file wins.

A web app that reads the BOOKOO Themis Mini over BLE, records every packet to durable storage, and derives shot metrics by post-hoc segmentation rather than by live decisions. Target hardware: Gaggia Classic Pro with 6-bar OPV mod, naked portafilter, 17g La Marzocco basket; Eureka ORO Mignon Single Dose Pro and Comandante C40 MK4 grinders.

## Scope and platform

Build against the standard `navigator.bluetooth` API and run it in a shim browser. Safari does not implement Web Bluetooth and WebKit has stated it will not — the API is classed as a fingerprinting surface under their anti-tracking policy. Every iOS browser is required to use WebKit, so Chrome and Edge on iOS inherit the same gap. This is not a wait-for-support situation.

Three viable runtimes, all consuming the same `navigator.bluetooth` code:

| Runtime | How it works | Trade-off |
| --- | --- | --- |
| Bluefy / WebBLE | iOS app wrapping WKWebView, injects a GATT shim | Fastest to a working prototype; separate browser to launch, no PWA install |
| beacio (formerly iOSWebBLE) | Safari web extension bridging `navigator.bluetooth` to CoreBluetooth | Stays in Safari, home-screen icon; newer, less proven |
| Capacitor wrapper | Native shell with `@capacitor-community/bluetooth-le` | Background BLE, no third-party dependency; needs Xcode and signing |

Write all BLE access behind a single transport interface so the runtime can change without touching anything above it. Target Bluefy for development.

### Out of scope

- **Machine control.** There is no actuator on the Classic Pro. Nothing in this app stops a shot; "auto stop" throughout this spec means stop *recording* or change a displayed state.
- **GaggiMate integration.** BLE is a 1:1 central-peripheral link, so once a PID mod holds the scale connection, this app cannot connect simultaneously. If that happens the app becomes a client of GaggiMate's stream rather than a competing BLE central. Do not design for it now, but keep the transport interface narrow enough that swapping the source is tractable.

## BLE protocol reference

Published by BOOKOO under MIT at [BooKooCode/OpenSource](https://github.com/BooKooCode/OpenSource). All UUIDs are 16-bit shorthand for the standard base UUID `0000xxxx-0000-1000-8000-00805F9B34FB`.

| Element | Value |
| --- | --- |
| Service | `0x0FFE` |
| Weight data (notify) | `0xFF11` |
| Command (write) | `0xFF12` |

### Commands

Frame is 6 bytes: `03 0A <sub> <d2> <d3> <xor>`, where the checksum is an XOR across all five preceding bytes. Pre-computed for the no-payload commands:

| Sub | Bytes | Effect | Source |
| --- | --- | --- | --- |
| `01` | `03 0A 01 00 00 08` | Tare | Mini doc |
| `02` | `03 0A 02 00 <00–05> <xor>` | Buzzer level, `00` mutes | Mini doc |
| `03` | `03 0A 03 00 <05–1E> <xor>` | Auto-off, 5–30 min | Mini doc |
| `04` | `03 0A 04 00 00 0D` | Start timer | Mini doc |
| `05` | `03 0A 05 00 00 0C` | Stop timer | Mini doc |
| `06` | `03 0A 06 00 00 0F` | Reset timer | Mini doc |
| `07` | `03 0A 07 00 00 0E` | Tare and start timer | Mini doc |
| `08` | `03 0A 08 <00/01> 00 <xor>` | Flow smoothing off/on | Mini doc |
| `09` | `03 0A 09 00 00 00` | Calibration — **do not send** | Ultra doc |
| `0B` | `03 0A 0B <00/01> 00 <xor>` | Auto-mode stop condition | Ultra doc |
| `0D` | `03 0A 0D <wt×10 hi> <lo> <xor>` | Set powder weight | Ultra doc |
| `15` | `03 0A 15 00 00 1C` | Shutdown — **do not send** | Ultra doc |
| `25` | `03 0A 25 00 00 2C` | Reset auto-off countdown (keep-alive) | Ultra doc |

The Ultra uses the same service, characteristics and `03 0A` header, so its documented sub-commands are strong candidates on the Mini even though the Mini's own doc omits them. Treat them as unverified until tested. Do not probe undocumented sub-command values — the space contains calibration and firmware commands.

### Weight notification — `03 0B`, 20 bytes

| Byte | Field |
| --- | --- |
| 1–2 | Header `03 0B` |
| 3–5 | Milliseconds, unsigned 24-bit big-endian |
| 6 | Unit of weight (`01` gram, `02` ounce per Ultra doc) |
| 7 | Weight sign |
| 8–10 | Weight × 100, unsigned 24-bit big-endian |
| 11 | Flow rate sign |
| 12–13 | Flow rate × 100, unsigned 16-bit |
| 14 | Battery percentage |
| 15–16 | Standby time, minutes × 10, unsigned 16-bit |
| 17 | Buzzer gear |
| 18 | Flow smoothing switch |
| 19 | Reserved |
| 20 | XOR checksum |

### Parsing rules

1. Validate the XOR on every frame and discard failures silently. A single corrupt packet produces a large spurious spike in any derived flow rate.
2. Assert the unit byte is grams. Refuse loudly rather than silently misinterpreting ounces.
3. Use the packet's millisecond field as the time base wherever it is non-zero. BLE connection-interval jitter on arrival timestamps smears every derivative computed downstream.
4. Record arrival timestamps alongside the device timestamp regardless, so the fallback is available and the jitter is measurable.
5. Send `03 0A 08 00 00 01` at connect to disable on-scale flow smoothing. The app derives its own flow; the scale's smoothing is an undocumented filter that would corrupt the exponential tail fit.

### Likely additional frame — `03 0D`

The Ultra documents a `03 0D` event frame carrying an event state (`00` stopped, `01` started, `02` ready, `03` exit ready, `04` exit done), a timestamp, weight, and a settlement figure. Third-party Python libraries report handling a `0x0D` auto-timer event from the Mini, so the Mini very likely emits a version of this frame despite its doc not listing it. Subscribe to `0xFF12` as well as `0xFF11` and log anything received.

## Unknowns to test before building

Several design decisions below depend on device behaviour that has not been verified. Run these first with nRF Connect or LightBlue — neither needs Web Bluetooth, so this is independent of the runtime question. Record the answers back into this document.

| Question | Test | What it changes | Answer (U1.1, `docs/hardware-tests.md`) |
| --- | --- | --- | --- |
| Does pump vibration reach the weight signal? | Subscribe to `0xFF11` with smoothing off, pull a shot, inspect rolling variance | Load-bearing for the whole segmentation design. If absent, fall back to curve-fit detection | No (2026-10-05). With the pump on, the 0.1 g readings and the scale's own flow figure read as they do at rest. `pump_on` comes from the Tare + start tap (Q4); see "Fallback if vibration does not survive" |
| Actual notification rate | Diff consecutive millisecond fields | Sets filter windows, CUSUM parameters, variance window length | About 9.93 Hz: a frame every 100.7 ms, none lost. The millisecond field moves in 100 ms ticks, one per frame, on the scale's clock, which runs 0.7% slow (2026-10-04) |
| Is weight net or gross? | Place a cup, tare, lift the cup off | Near-certain net — a signed weight field only makes sense against a movable zero. Confirms the offset model | Net (2026-10-04) |
| Does `04` start the timer in flow+weight mode? | Send `03 0A 04 00 00 0D`, watch bytes 3–5 | The Ultra gates `04`/`05`/`06` by mode. If gated here, the ms field stays zero and there is no device timebase | No: the flow-rate mode has no timer at all (2026-10-05). The timer mode is the one with the scale's timer under the app's control: `04` starts it there, and the app uses that mode (D-038). The automatic mode ignores it |
| Does `07` start the timer in any mode? | Send `03 0A 07 00 00 0E`, watch bytes 3–5 | The Ultra places no mode restriction on `07`. If it works, it is the only reliable timebase entry point | No: it does nothing in the automatic mode, and the flow-rate mode has no timer. In the timer mode it tares and starts the timer (2026-10-05) |
| Does the Mini honour `25`? | Send `03 0A 25 00 00 2C`, confirm auto-off countdown resets | Determines whether session keep-alive is a clean command or needs faking activity on the platform | Not tested yet. There is no countdown to watch: the standby bytes hold the auto-off setting (2026-10-04) |
| Does a physical tare emit anything? | Subscribe to `0xFF12`, press the scale's tare button | If it emits an event, zero-tracking is exact and the slope heuristic becomes a fallback | Apparently nothing on `0xFF12`, which did send `03 0D` started and stopped frames when the scale ran its own timer (2026-10-04) |
| Container masses | Weigh the bean cup and espresso cup empty | Constants for phase recognition | Seen, not yet named (2026-10-05): a dosing cup of 119.9 g, and shot vessels of 257.3 g and 264.8 g |

### Audio viability, if pursued

`getUserMedia` requires HTTPS and a user gesture, Safari re-prompts per session for non-installed sites, and behaviour inside Bluefy is unknown. Test before designing around it.

If it works, audio is the better pump sensor by a wide margin. The BLE stream samples at roughly 10–20 Hz against a 50 Hz vibratory pump, far below Nyquist — there is no tone to find, only aliased broadband energy that survives if the scale's filtering is imperfect. Audio at 44.1 kHz resolves 50 Hz and its harmonics directly, and a vibratory pump is strongly tonal. A grinder is broadband and high, so one FFT distinguishes grinder from pump from silence and can drive the entire phase machine.

**(v2)** The brew flow assumes the microphone works and uses it to start the live display at
pump start (D-041). Hardware test B8 still decides; detection can be switched off in Setup, and
the manual start is always there.

**(v2, 2026-10-05)** The scale can't see the pump (D-048), so the probe records the
microphone's sound levels, as loudness in a few frequency bands with no audio kept, for the
detector to be designed on real shots (D-049). A surf before the shot runs the pump too. The
shot's pump on is the start of the pump run its first drip falls into. A run that stops with
nothing in the cup never counts, and on the live display such a run resets the view.

## Data model and storage

The central decision: **record every packet from connect to disconnect, and derive everything afterwards.** No segmentation decision is made in real time. A live state machine that misfires destroys the record of a shot that cannot be re-pulled; a recorder that misfires is re-segmented. The same applies to detection rules improving later — re-run them across the entire history rather than losing the shots pulled under the old rules.

### Layers

**Raw layer.** Append-only. Device timestamp, arrival timestamp, weight, flow as reported, battery, and the frame's remaining fields. Never mutated, never summarised in place, never trimmed.

**Derived layer.** Computed from raw by a pure, versioned function. Markers, durations, yields, filtered series. Stamp each derivation with the algorithm version so a re-run is identifiable. Cache it, but treat it as disposable — raw is the only source of truth.

**Session metadata.** User input and selections: bean, grinder, settings, grades, tags.

### Schema rules

- **Weight is baseline-relative in software.** Net yield is `w(t) − w(baseline)`, where baseline is the stable value before the pump. Tare commands sent to the scale are a display convenience for its own screen and carry no measurement dependency. A stray physical tare then shows up as a step change in the record — detectable, subtractable, harmless.
- **The schema is always complete.** The field configurator controls capture-UI visibility only. A disabled field is null, never absent. Turning a field back on months later must not produce history with a hole that cannot be distinguished from "not applicable".
- **Container masses, grinder profiles and bean bags are entities**, referenced by id from sessions, not denormalised strings.

### Storage and export

IndexedDB, with the understanding that Safari can evict it for non-installed sites under storage pressure. A year of shot history is exactly what would be lost silently.

Automatic JSON export from day one — full raw packets plus metadata, not a summary. Offer a manual export action as well. Treat the export format as the durable artifact and IndexedDB as a cache of it.

## Signal processing

Two pipelines over the same packets, with different objectives. They must not share state and the live filter must never reach stored analysis.

|  | Live | Analysis |
| --- | --- | --- |
| Filter | Short EMA | Savitzky–Golay |
| Causal | Yes, required | No — runs over the complete recorded series |
| Purpose | Glanceable number during the shot | Derivatives, markers, metrics |
| Tuned for | Responsiveness | Preserving peak shape and accurate derivative |

Savitzky–Golay fits a local polynomial and yields the derivative directly, which a moving average cannot do without flattening the features the derivative depends on. Window length follows from the measured sample rate — start near 0.5 s of samples with a quadratic fit and tune against recorded shots.

Derive flow from weight rather than using the scale's reported flow field. On-scale smoothing is an undocumented filter with a single on/off switch; it is disabled at connect, and its output would bias the exponential tail fit in particular. Keep the reported flow in the raw record anyway for comparison.

## Shot segmentation and derived metrics

The organising principle: **vibration and liquid occupy orthogonal channels in the same stream.** The pump changes the *variance* of the weight signal without moving its mean. Liquid changes the *mean*. Reading pump state off variance and liquid off mean removes the need to disambiguate "is flow slowing or did the pump stop" — the two are independent measurements.

### Markers

| Marker | Detection | Notes |
| --- | --- | --- |
| `pump_on` | Rolling variance steps above the quiet-baseline σ **and** mean stays stationary | Requiring both rejects a counter bump, which moves mean and variance together |
| `first_drip` | CUSUM on the mean residual against baseline | Slack ≈ 0.5σ, alarm ≈ 4–5σ |
| `pump_off` | Rolling variance steps back down | Instant and unambiguous while drips continue |
| `settled` | Mean stops moving | Or extrapolated, below |
| `cup_removed` | Large negative step | Honest yield — what was actually taken |

Detection latency and timestamp accuracy are decoupled throughout. A detector needs persistence to fire; once it does, walk backwards to the sample where the change actually occurred. For `first_drip` the retrospective change point is the argmin of the cumulative sum *before* the alarm. Alternatively fit the initial rise and extrapolate back to its intersection with baseline, which gives sub-sample resolution.

This is why automatic detection beats a manual start button on accuracy, not merely convenience: a button press carries irreducible, variable human latency that cannot be recovered. A variance onset carries none.

### Tail handling

Do not trim the tail by threshold — extrapolate it. After `pump_off` drainage is approximately exponential, so log(flow) is linear in the tail. Fit that line to obtain τ, then:

```latex
w_{\mathrm{final}} \approx w(t_{\mathrm{pump\_off}}) + \dot{w}(t_{\mathrm{pump\_off}}) \cdot \tau
```

A two-parameter linear fit on logged flow is far more robust than a three-parameter nonlinear fit to the weight curve, and there is no cut point to choose. This requires on-scale smoothing to be off.

### Fallback if vibration does not survive

Detect `pump_off` as a regime change rather than a magnitude. Pump-driven flow and gravity drainage obey different laws: fit the exponential decay backwards from the end of the record, then walk forward and find where the data departs from that model. The knee is `pump_off`. Weaker than the variance reading, but still close to parameter-free.

**(v2, 2026-10-05)** Vibration does not survive (hardware session 2, D-048). With the pump on, the scale's 0.1 g readings and its own flow figure read as they do at rest, so this fallback is the design:

- `pump_off` is the regime change.
- `pump_on` is the manual start, the Tare + start tap made at pump start (Q4), flagged as manual, until the microphone works (T3.1). Its human latency is the price.

The variance rows in the Markers table stay for a scale or a machine where vibration does show.

### Durations

All three share `pump_off` as the endpoint. Drip tail appears in none of them.

| Metric | Definition |
| --- | --- |
| Pre-infusion | `pump_on` → `first_drip` |
| Extraction | `first_drip` → `pump_off` |
| Total | `pump_on` → `pump_off` |

**Never use last-drip as an endpoint.** When drips stop measures how long the cup was left under the basket, not a property of the shot. Two identical pulls would produce different durations purely from the operator's patience.

### Flow and yield

These take different mass figures, and conflating them is the common error.

| Metric | Definition | Why |
| --- | --- | --- |
| Average flow | `w(pump_off) / t_extraction` | Mass arriving after the clock stopped would inflate it. Uses extraction, not total — pre-drip dead time depresses the figure and weakens it as a proxy for puck resistance |
| Yield | `w(settled)` | Hypothetical maximum had you waited |
| Honest yield | `w(cup_removed)` | What actually reached the cup |
| Tail mass | `w(settled) − w(pump_off)` | A real puck-drainage metric, not a rounding artifact |

**Live ratio target.** Compute from the actual logged dose, not a fixed gram figure — dose varies and the configured ratios are 1:2 for espresso, 1:1.5–1.8 for cappuccino. Display remaining-to-target ("8.2 g to go"), not accumulated yield.

**First-drip time** is a headline metric. Time from `pump_on` to first sustained weight is a strong grind-fineness proxy and arguably more diagnostic than total shot time.

## Brew phases (v2)

Replaces "Session state machine" (Q3). Revised 2026-10-05 (D-052): the user's round-4 model.

The vessel placed on the platform is the declaration of intent, so its mass selects the phase.
Learn each container's empty mass once, store it, and match on arrival. Detection is a
convenience: the user can switch phase by hand at any time, and the record is the same either
way.

| Phase | Container | Required | What it records |
| --- | --- | --- | --- |
| Beans | the bean cup | no | Beans weighed, against the target (the basket's size) |
| Grind | the grind cup (often the bean cup again) | no | The ground dose; retention = beans − ground |
| Extraction | the cup | **yes** | The shot. A shot exists only with a cup and an extraction |
| Milk | the milk jug | no; only for a recipe with a milk ratio | Milk poured, against the recipe's milk target |

- **Skipped phases are recorded as skipped,** not left empty (schema rule).
- **Recognition.** On a stable placement that matches exactly one registered container, the
  phase opens. Readings are 0.1 g (D-037). Two containers with the same weight are a conflict
  the user must resolve; containers within 3 g of each other get a dismissible warning (a wet
  container weighs more). Anything ambiguous falls back to a manual pick.
- **Cautious endings.** A lift is a pause, never an end: beans get poured back, the cup gets
  moved. A phase ends only on evidence that the next one started: another known container
  placed, the grinder's sound, the bean cup returning at about the beans' weight minus retention
  (the grind result), or a tap. Placing the cup doesn't start the extraction either: the cup can
  sit on the scale for a minute before the shot (hardware session 2); the pump start does.
- **Sound.** The microphone separates grinding from brewing and finds the pump start (D-049).
  Setup has a calibration that records the user's grinder and pump. Everything works without
  the microphone through weight and taps.
- **Ambient context.** Each phase shows the equipment that matters for it, with the last used
  as the default and changeable in place; a change becomes the default for next time:
  - Beans: machine and basket (which sets the target), and the coffee pack;
  - Grind: grinder and setting;
  - Extraction: recipe (which sets the ratio);
  - Milk: the recipe's milk ratio.
- **Targets.** Beans: the basket's size. Extraction: the actual dose (ground, else beans, else
  the basket's size) × the recipe's coffee ratio. Milk: the espresso's yield × the recipe's milk
  ratio.

### Tare arming

The extraction auto-tare must be **arm-once**. Weight is stable before the pump and stable again once the tail settles, so a naive "tare after stability" rule fires twice and zeroes the display exactly when the yield is being read. Fire on entering the phase, disarm immediately, re-arm only on cup removal or manual reset.

Stability test: no sample range greater than 0.05 g across a 0.5 s window. At 10 Hz that is five samples, so it needs a tolerance band rather than exact equality. The same window measures the baseline and the variance floor fresh for this shot, which is what the segmentation markers are referenced against.

This is display-only. If it misfires the record is untouched and the metrics re-derive correctly.

### Manual start

Keep a manual start button as a fallback for when auto-detection fails or the microphone is unavailable. It should send `07` — tare and start timer together — which is the only command the Ultra documentation places no mode restriction on. When both the button and auto-detection fire, log both; the gap measures operator reaction time.

**(v2)** Without pump vibration (D-048) the pump start comes from the microphone where it works,
or from this tap. The manual start is always on the extraction screen. It tares and starts the
scale's timer; it never touches the machine.

### Live display (v2)

Each pour shows live progress towards its target: beans towards the basket's size, the
extraction towards its yield, the milk towards its milk target. During the extraction the
screen shows, readable from about a metre away:

- remaining to target ("6.0 g to go") and a progress bar, turning into a warning ("+1.2 g over
  target") past the margin (default +1.0 g);
- live flow and the time since pump start;
- a graph of weight and flow from pump start, with the target line and the first-drip marker.

Everything on it is display-only, from the live pipeline. The recording runs continuously from
connect to disconnect regardless, and the metrics come from post-hoc analysis.

### Grind phase (v2)

Replaces "Grind phase limitation". The Themis Mini is 8×8 cm and will not take a portafilter, so
post-grind weighing needs a cup that fits. The user has one (Q2), usually the same cup used for
the beans. Retention is good to about ±0.1 g at the scale's resolution.

## Equipment, coffee and settings (v2)

Revised 2026-10-05 (D-053). Everything the user can change lives in Setup and can also be changed
in place during the phases.

### Machine (v2)

Name, pressure (optional, cheap to track) and its baskets. A machine has several baskets, each
with an id and a size in grams; the size is the beans target. Shots are told apart by basket
size for now; the id is stored so baskets of the same size can be told apart later.

### Grinders (v2)

Grinder is an entity with its own setting schema, because the two in use are not the same type: the ORO Mignon is stepless, the Comandante C40 with Red Clix is a click count. Do not force one numeric field.

**(v2)** Several grinders, one of them the default: brand, model, type (stepless or clicks) and
the current setting. A setting changed during a shot becomes that grinder's setting for the
next shots. Burr epochs are deferred; the grinder-care date on each shot covers the burr state
for now (D-053).

### Recipes (v2)

A recipe belongs to the extraction: a name, a coffee ratio and an optional milk ratio. Having a
milk ratio makes it a milk drink and brings the milk phase. Prefilled, with initial values the
user can edit: Ristretto 1:1.5, Espresso 1:2, Lungo 1:3, Cortado 1:2 with milk 1:1, Cappuccino
1:2 with milk 1:3, Flat white 1:2 with milk 1:4, Latte 1:2 with milk 1:6 (milk to espresso).
The user can add their own. History shows the drink.

### Coffee packs (v2)

A bag carries a roast date, an initial weight, and a running remaining estimate. Every shot is tagged with **days off roast**, derived from the roast date. This is the highest-value metadata field in the system and nearly free: degassing pushes grind finer over roughly the first fortnight before settling, so without the tag, grind adjustments read as random drift and the log is not analysable.

**(v2)** A pack has a brand, a name or type, a weight, a roast date (required: the age comes
from it), an open date, and optional flavours. When it is finished, an optional "would buy
again". Stock is not tracked: no remaining estimate, no deduction per shot (D-053).

### Containers (v2)

Name, empty weight and its role: bean cup, grind cup, cup or milk jug (one container can have
several). Learned once by placing it empty on the scale.

### Tags (v2)

One list. A tag can be on by default for new shots; an optional group only sorts the list.
Experiments are tagged, so they can be filtered later.

### Maintenance (v2)

Three dates: machine descale, machine backflush, grinder care. Marking one done stamps today. An
optional interval raises a reminder when it comes due. The dates are data points on each shot;
they don't change anything else (D-053).

### Microphone (v2)

On or off, and the calibration of the grinder's and the pump's sound.

### What every shot records (v2)

Besides the raw recording and everything derived from it, every shot keeps a **snapshot** of
its context as values at brew time, next to the ids, so later edits never rewrite history
(D-053):

- date and time;
- the coffee pack, with its roast and open dates;
- the machine, its pressure, the basket's id and size;
- the grinder and its setting;
- the recipe, its coffee ratio and milk ratio;
- the last descale, backflush and grinder-care dates;
- each phase's result (beans, ground dose and retention, milk) or "skipped";
- the grades: taste, channelling, tags.

The context is internal (D-056): the app records it with every shot, but no screen shows it. A
debug view may show it during development.

### Grading (v2)

Revised 2026-10-05 (D-054): back to the spirit of the original.

| Grade | Scope | Values | Purpose |
| --- | --- | --- | --- |
| Taste | Per shot | sour · balanced · bitter | Which way to move the grinder; the one tap that matters |
| Channelling | Per shot | yes / no (channels, spurts) | A puck-prep problem, kept apart from taste |
| Tags | Per shot | from the list, defaults on | Experiments and conditions, for filtering later |
| Would buy again | Per pack | yes / no, optional | What to buy again, asked when the pack is finished |

Nothing is required: saving is one tap, and a shot that is never graded still exists, with its
grades `null`. No score, no strength, no per-shot flavour notes, no "better or worse than last".

### Optional fields

Warm-up elapsed is out of scope as a tracked subsystem — the app's boundary is scale-derived data plus typed input, and warm-up is neither. The confound is real, though: a shot pulled at 10 minutes and one at 30 sit in the dataset looking equally valid. Cover it with a freeform tag applied on the days it matters, so those shots can be filtered later. It becomes available properly once a PID mod reports it from the machine.

Freeform tags are also where puck-prep experiments belong — not as structured fields that feel obligatory every morning.

## Nudge, and learning later (v2)

Revised 2026-10-05 (D-054). One nudge, no learning:

- **The nudge.** When the last graded shot with the same machine, grinder and coffee pack was
  sour or bitter, the next beans or grind phase says so: "Last time it was bitter: grind a
  little coarser for a more balanced cup." It repeats the user's own taste, so it needs no
  model. It is dismissible, and nothing shows after a balanced shot.
- **No learning yet.** No learned windows, step sizes, dial-in states or data pointers. The
  data is collected in full (above), and anything learned later is a pure function of it, so it
  will run over the whole history from the first shot.

## App structure and look (v2)

Revised 2026-10-05 (D-052). Four areas on a tab bar:

- **Home (the landing page)** — the scale's status (name, connection, battery, and a warning
  when it isn't in its timer mode, D-057); the live
  weight with tap-to-tare; which container is on the scale; the last shot; last week's count
  and averages; a maintenance reminder when one is due. Placing a known container opens its
  phase.
- **Brew** — the phases, in focus mode (no tab bar), each with its ambient context and live
  progress, ending on the **shot card**: the hub where the phase results appear as rows
  (beans, grind, extraction, milk, or "skipped"), with the results, the grades and Save.
  Putting the milk jug down while the card is open adds the milk row. The user can open the
  extraction view by hand.
- **History** — one row per shot: date and time, a small graph, the taste and the drink. A row
  opens the shot: a large graph, the metrics, the phases and the grades. Compare overlays two
  shots, aligned at pump on or first drip, with an "A Δ B" table.
- **Setup** — machine and baskets, grinders, recipes, coffee packs, containers, tags,
  maintenance, microphone, and data export.

**Look: Instrument.** Monospaced tabular numbers, hairline rules, square corners and one signal
orange, in light and dark modes following the system. System fonts on iPhone (SF Mono, SF Pro);
IBM Plex Mono and Sans as the fallback elsewhere. The tokens are the `.look-instrument` rules in
`design/ui-exploration/canvas/`. Applied from the first UI task on (D-045).

## Interaction constraints (v2)

**Zero interaction during the shot. At most two taps after.**

This is the constraint most likely to decide whether the app survives past a few weeks. The realistic failure mode is not a missing feature — it is that logging a shot takes forty seconds with hot hands on a portafilter early in the morning, and the habit dies. Friction, not capability, is the binding constraint.

Rules that follow:

- Everything derivable is derived. Nothing the packet stream can answer is ever asked.
- Everything else defaults to last-used: machine, basket, pack, grinder, setting, recipe.
- **(v2)** No post-shot input is required. The taste is one tap, saving is one tap.
- **(v2)** Equipment is shown, never asked: the defaults are visible in each phase and
  changeable in place, never a modal that blocks completion.
- Puck-prep and experiment variables live in tags, used when running an experiment, not as fields that imply an obligation.
- **(v2)** The display during extraction shows remaining-to-target with its progress (or the
  over-target warning), live flow, time and a graph from pump start, readable from about a
  metre.

## Build order (v2 in places)

The sequencing rationale: prove the uncertain foundations — the iOS BLE path, the timebase, tare behaviour, whether vibration survives — before building anything that would need reworking if they come out badly. Everything in later phases is additive and none of it is blocked by deferring.

### Phase 0 — answer the unknowns

nRF Connect or LightBlue, no code. Fill in the table in *Unknowns to test before building*. If vibration does not survive into the weight signal, revise the segmentation section before any of it is implemented.

### Phase 1 — MVP

A complete dialing loop and nothing more.

1. Connect over `navigator.bluetooth` behind the transport interface; run in Bluefy.
2. Parse and validate frames; disable on-scale smoothing at connect.
3. Record raw packets to IndexedDB, continuously, connect to disconnect.
4. App-driven tare via `07`.
5. Post-hoc segmentation producing the five markers and the derived metrics.
6. **(v2)** The shot card: phase results, taste (sour · balanced · bitter), channelling and tags, saved with one tap.
7. Overlay two shots on one chart.
8. Automatic JSON export.
9. **(v2)** The app structure: Home, Brew, History, Setup; live progress towards each target.

### Phase 2

- Bean bags with roast date and days-off-roast tagging. **(v2)** Coffee packs without stock tracking
- Grinder entities, settings, burr epochs. **(v2)** Burr epochs deferred
- Container recognition and the full phase state machine
- Grind phase (the user has a dosing cup; the phase is optional)
- **(v2)** Machine with baskets, recipes, ambient context in each phase, the per-shot snapshot,
  maintenance dates, the milk phase, tags with defaults
- **(v2)** The nudge from the last taste. Learning from the data comes later

### Phase 3

- Audio detection, if Phase 0 showed it viable in the chosen runtime. **(v2)** The brew flow
  uses it for pump start and to tell grinding from brewing, with a sound calibration in Setup;
  the manual start and weight-based detection remain the fallback
- Keep-alive via `25`, if honoured
- Richer charting and history analysis
- Capacitor wrapper, if the shim browser's re-pairing friction proves annoying in daily use

### Re-pairing — check early

Web Bluetooth requires a user gesture to select a device each session unless persisted permissions are available, and the iOS shims may not implement that. If every shot begins with "tap connect, choose scale from a list", the app has reproduced the tedium it exists to remove. Test this in Phase 1 and let the answer decide whether Capacitor moves up the order.
