# UI/UX exploration

Branch `ui-style-exploration`, started 2026-10-04. Mockups of the whole app, drawn on a Claude
Design canvas, to settle the look and the UX **before** T1.18 and later UI tasks are built.

**Status: round 4 is current (2026-10-05).** The model is in `docs/spec-v2.md` (the source of
truth), `docs/DECISIONS.md` D-052 to D-054 (which revise D-040 to D-045) and `docs/PLAN.md`
(T1.18, T1.19, T1.23, T2.1–T2.12, T3.1, T3.5). Every board on the "Screens v2" page shows the
round-4 model. The UI tasks name their boards; where a board and the spec disagree, the spec
wins.

- Canvas: <https://claude.ai/artifact/S9gjCPt8AQMHvmxxbS5AZo> (private to the user; page
  "Screens v2" is current, "Instrument, round 1" holds the three first-round Instrument boards).
- `brief.md`: the working brief the screens were drawn from. Its "ROUND 4" section (sample
  data, ambient context, progress, phases, and what each board shows) overrides the older
  rounds below it, which stay as history.
- `canvas/`: the canvas source, one `.dc.html` per artboard plus `canvas.json` (layout, notes,
  pages). These are canvas files, not app code: they only render inside the Design artifact.
- `tools/`: `curves.mjs` (generates the chart paths in `tools/paths.json`), `check-dc.py`
  (structure check: tags, holes, sizes; written for the round-2+ boards, so the three round-1
  `Instrument-*` boards report a different root element, which is expected) and `run-dc.mjs`
  (runs an artboard's `renderVals()` and handlers under a stub: `node run-dc.mjs <file> '{"mode":"dark"}'`).
- To change the canvas: edit files here (or in a scratch copy), then publish them to the
  artifact URL above with the Artifact tool (`root` = the folder holding `project/`). The canvas
  stores files as `project/<name>`; `canvas.json` holds positions, heights, pages and notes.
  Read the published `canvas.json` first: the user may have moved boards or added notes.

## Look

**Instrument is the only look** (chosen by the user on 2026-10-04; the only one since
2026-10-05, D-055): monospaced tabular numbers, hairline rules, square corners, one signal
orange, light and dark modes. On iPhone it uses system fonts (SF Mono, SF Pro: 0 kB);
elsewhere IBM Plex Mono and Sans as fallbacks. Its tokens are the `.look-instrument` rules in
any artboard's `<helmet>` (colours per mode, type, radii). Each board's Mode tweak shows light
or dark; the app follows the phone's setting (D-040).

Dropped: B · Crema (the runner-up, dropped on 2026-10-05 along with its `look` tweak and its
copies), C · Native and D · Signal (rejected in round 1). Their boards are no longer on the
canvas or in this folder; git history has them (before the commit that records D-055).

## Screens (page "Screens v2")

| Area | Artboards |
| --- | --- |
| Home | `Main` (scale status and live weight with tap-to-tare, the maintenance reminder, the last shot, the last 7 days) |
| History | `History` (rows with drink, small graph and taste; Compare mode), `History-Detail` (big graph, every metric, phases, grades, the snapshot), `History-Compare` (overlay aligned at pump on or first drip, "A Δ B") |
| Brew | `Brew-Beans` (basket target, context, the nudge), `Brew-Grind` (grinder and setting, retention), `Brew-Ready` (recipe and target, waiting for the pump or a manual start), `Brew-Shot` (live progress), `Brew-Milk` (milk ratio target), `Brew-Finish` (the shot card: phases, results, grades, context) |
| Setup | `Setup`, `Setup-Machine` (baskets, pressure, descale and backflush), `Setup-Grinders` (incl. grinder care), `Setup-Recipes`, `Setup-Packs`, `Setup-Pack`, `Setup-Containers`, `Setup-Tags`, `Setup-Microphone` (on or off, calibration) |

Renamed in round 4: `Setup-Shot` → `Setup-Recipes`, `Setup-Brew` → `Setup-Microphone`.
Removed: `Setup-Milk` (milk is no longer an entity). Each board's Tweaks (mode, and the states
listed in `brief.md`) show its variants.

## Decisions by round

Round 4 (user, 2026-10-05; D-052–D-054) is the current model. In short:

1. Home: scale status, live weight with tap-to-tare, the container on the scale, the last
   shot, the last week's count and averages, and the maintenance reminder.
2. Phases: Beans, Grind, Extraction (cup), Milk. Only the cup and the extraction are required;
   skipped phases are marked skipped. Known containers open the phases, a manual switch is
   always there, and endings are cautious: a lift is a pause. Grind is recognised by sound and
   by the bean cup returning at about the beans' weight minus retention. The microphone is
   calibrated in Setup (grinder, pump). The milk phase appears only for a recipe with a milk
   ratio.
3. Ambient context per phase, last used by default and changeable in place: machine, basket
   (its size is the beans target) and pack; grinder and setting; recipe (the ratio); the milk
   ratio. Every pour shows live progress towards its target.
4. Equipment: a machine with several baskets (id and size) and an optional pressure; grinders
   (brand, model, stepless or clicks, setting); recipes (a coffee ratio and an optional milk
   ratio, whose presence makes it a milk drink); coffee packs (roast date required, open date,
   flavours, "buy again"; no stock); containers; tags with defaults; three maintenance dates
   (descale, backflush, grinder care) with reminders.
5. Every shot records its context as it was: date and time, the pack's roast and open dates,
   machine, pressure, basket and size, grinder and setting, recipe, maintenance dates.
6. Grading: taste (sour, balanced, bitter), channelling or spurts, tags. No score, no flavour
   notes per shot, no better or worse. The one pointer is the nudge: "Last time it was sour:
   grind a little finer". Learning is dropped for now; the data it would need is collected.
7. History: rows with date and time, a small graph and the taste; the detail with the big graph
   and all data; Compare overlays two shots with "A Δ B".

Rounds 1 to 3 (user, 2026-10-04) are kept below as history; round 4 replaced the score, the
taste triangle and strength, the pointers and learned values, milk stock and bag stock, and the
shot settings screen.

Round 1 (styles): C · Native and D · Signal are out; A and B both could work. Final pick
(after round 3): **A · Instrument**. B · Crema was dropped entirely on 2026-10-05 (D-055).

Round 2 (structure and content), the user's own model:

1. Four areas: Home (stats and pointers), Brew (phases), History, Setup.
2. History: rows with shot details; a row opens the graph and details; Compare is a triggered
   action, with alignment at pump on or first drip.
3. Brew phases are chosen by the container on the scale: Beans → Grind → Shot → Milk. Beans and
   Shot are mandatory; Grind (weighing the dose) and Milk are optional and can be switched off.
   Without Grind, the dose is the beans weighed.
4. Pump start comes from the microphone (assumed to work until tested; can be switched off);
   a manual start is always available. The graph runs from pump start; extraction is measured
   from first drip; a visual marker shows what's left to the target ratio and warns when exceeded.
5. Shot complete: final details, tags, and machine / grinder / milk / coffee from defaults, all
   changeable on the same screen. A grind setting changed there becomes the grinder's default.
   Saving deducts coffee and milk.
6. Score 1–10 stays (a compact swipe dial, prefilled from the last shot of the same bag), plus
   flavour notes from the bag's profile and better / worse than last.
7. Setup: grinders (one default), coffee bags (history; roast date and open date; optional
   origin, process, elevation, roast level, flavour profile), machine (brand, model, pressure),
   milk, tags (simple tags; groups only sort the list; some default on), containers (name,
   weight, phases; one container can serve several phases), shot (basket dose, ratio presets by
   drink or a slider). Maintenance intervals for machine and grinder with alerts; without a
   logged date, the cycle starts when the item was created.
8. Containers: the nearest registered container wins; same weight = conflict; within 3 g = a
   dismissible warning (a wet cup weighs more).
9. Bags can be finished by hand (unmeasured coffee); an optional "would buy again" rating is
   offered when a bag is finished.

Round 3 (direction): direction (sour / balanced / bitter) is not a required tap. The user
kept the idea as a pointer that only appears when relevant, and asked for all seven proposals:

1. **Taste as part of the flavour input**: a balance triangle (Sour, Sweet, Bitter; distance
   from Sweet = how strong) prefilled from the last shot of the bag (`Brew-Finish`).
2. **Pointers where you act**: a "Before you grind" pointer in the Beans phase, where the
   grinder is adjusted (`Brew-Beans`); "Set 6.2" makes it the grinder's default.
3. **Taste plus data**: the shot's first drip is read against the bag's learned window
   (fast / on time / slow). Agreeing taste and timing give a grind pointer; on-time timing gives
   a ratio pointer; disagreement says grind won't fix it.
4. **Sour and bitter at once** points at puck prep (uneven extraction), not the grind.
5. **Strength** (watery … heavy) is a second input; its pointer changes the ratio.
6. **Learned step size**: the app knows how far 0.1 on each grinder moves first drip for this
   bag, so pointers say "try 6.2", not just "finer" (`Setup-Pack`, `Setup-Grinders`).
7. **Dialled in**: after 3 good shots (balanced, 7+) the bag is dialled in, pointers stop, Home
   shows the best recipe with "Repeat", and the optional bag rating is offered (`Main`).
8. **Age drift**: the app anticipates the grind drifting finer over the first two weeks off roast
   (`Brew-Beans` tweak `pointer: age-drift`).

Every pointer has ✕ and "Not for this bag"; pointers can be switched off and hidden ones reset in
Setup · Brew flow. Full rules and the pointer catalogue: `brief.md`, "User decisions, round 3".

## Deviations from `docs/spec.md` (approved by the user, folded into spec v2)

- Phases follow the containers (Beans, Grind, Extraction, Milk); containers can serve several
  phases; conflict and warning bands; a manual switch.
- The live screen shows progress towards the target, a graph, time and the container, not only
  remaining-to-target and flow; the beans and the milk get progress too.
- New entities and fields: machine with baskets and pressure, grinders, recipes with an optional
  milk ratio, coffee packs (no stock), containers with roles, tag defaults, maintenance dates,
  and a per-shot snapshot of that context.
- Grading stays close to the spec: taste is the spec's direction (sour, balanced, bitter),
  plus channelling and tags; the nudge is the only pointer. The round-3 score and learned
  values are gone.
- Pump start from the microphone where it works (spec: audio is Phase 3, conditional on
  hardware test B8), else the manual start (D-048: no pump vibration in the weight).

## Open

- The microphone: whether sound reliably finds the pump start and the grinder (T3.1, after the
  hardware tests). Everything works without it.
