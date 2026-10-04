# UI/UX exploration (draft)

Branch `ui-style-exploration`, started 2026-10-04. Mockups of the whole app, drawn on a Claude
Design canvas, to settle the look and the UX **before** T1.18 and later UI tasks are built.

**Status: exploration.** Nothing here is in `docs/spec.md`, `docs/DECISIONS.md` or
`docs/PLAN.md` yet. Several decisions below deviate from the spec. When the user settles the
UI, promote them (with the user's approval) into the spec, the decision log and new or changed
plan tasks. Until then, `main` and the plan are unaffected.

- Canvas: <https://claude.ai/artifact/S9gjCPt8AQMHvmxxbS5AZo> (private to the user; page
  "Screens v2" is current, "Styles v1" is the first style round).
- `brief.md`: the working brief the screens were drawn from: the user's decisions per round, the
  canonical sample data, the pointer rules, the theme classes and the `.dc.html` format rules.
- `canvas/`: the canvas source, one `.dc.html` per artboard plus `canvas.json` (layout, notes,
  pages). These are canvas files, not app code: they only render inside the Design artifact.
- `tools/`: `curves.mjs` (generates the chart paths in `tools/paths.json`), `check-dc.py`
  (structure check: tags, holes, sizes; written for the round-2+ boards, so the twelve round-1
  style boards report a different root element, which is expected) and `run-dc.mjs` (runs an
  artboard's `renderVals()` and handlers under a stub: `node run-dc.mjs <file> '{"look":"crema"}'`).
- To change the canvas: edit files here (or in a scratch copy), then publish them to the
  artifact URL above with the Artifact tool (`root` = the folder holding `project/`). The canvas
  stores files as `project/<name>`; `canvas.json` holds positions, heights, pages and notes.

## Looks

Two candidate looks share one theme in every artboard's `<helmet>`: **A · Instrument**
(monospaced numbers, hairlines, square corners, one signal orange) and **B · Crema** (dark roast,
crema gold, rounded numbers, soft cards). Each artboard has `look` and `mode` tweaks. C · Native
and D · Signal were rejected (round 1). Not chosen between A and B yet.

## Screens (page "Screens v2")

| Area | Artboards |
| --- | --- |
| Home | `Main` (Home: ready to brew, dial-in card, alerts, last shot, 7-day stats) |
| History | `History` (list, Compare mode), `History-Detail`, `History-Compare` (align at pump on / first drip) |
| Brew | `Brew-Beans`, `Brew-Grind`, `Brew-Ready` (waiting for the pump), `Brew-Shot` (live), `Brew-Milk`, `Brew-Finish` (results, taste, pointer, equipment, tags) |
| Setup | `Setup`, `Setup-Brew` (phases, mic, pointers), `Setup-Shot`, `Setup-Packs`, `Setup-Pack` (incl. what the app learned), `Setup-Milk`, `Setup-Grinders`, `Setup-Machine`, `Setup-Containers`, `Setup-Tags` |
| Crema check | `B-*`: copies of five screens defaulting to the Crema look |

## Decisions so far (user, 2026-10-04)

Round 1 (styles): C · Native and D · Signal are out; A and B both could work.

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

## Deviations from `docs/spec.md` to approve when promoting

- A 1–10 score per shot (the spec excludes it on purpose).
- Direction is no longer the one required input; taste triangle, strength and pointers
  replace it, and the app keeps learned values per bag and grinder (a new derived layer to
  design: it must stay a pure function of raw data plus metadata, hard rule 2).
- The live screen shows a graph, time and container, not only remaining-to-target and flow.
- Phases are configurable; containers can serve several phases; conflict and warning bands.
- New entities and fields: machine with maintenance, grinder maintenance, milk with stock, tag
  defaults and groups, per-bag learned values, bag rating at finish.
- Pump start from the microphone (spec: audio is Phase 3 and conditional on hardware test B8).

## Open

- A or B look (or a blend).
- Whether pointers need their own entity in the schema (shown / applied / dismissed, for
  learning).
- Hardware tests still decide the microphone (B8) and pump detection from vibration (A2).
