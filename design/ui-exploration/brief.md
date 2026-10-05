# smart-scale UI mockups v2 — screen kit

Read the ROUND 4 section first; it overrides the rest.

You are writing **artboard files** for a design canvas (Claude "Design" artifact type). Each
artboard is one phone screen of an espresso shot tracker that reads a BOOKOO Themis Mini BLE
scale. The user is settling the UX/content and choosing between two looks, **Instrument** and
**Crema**. Every artboard must support both through the shared theme below.

Folder: `design/ui-exploration/canvas/` (the canvas stores each file as `project/<name>`)
Reference artboard (copy its structure exactly): `Main.dc.html` in that folder (the Home screen).
Chart path data: `design/ui-exploration/tools/paths.json` (from `tools/curves.mjs`).

Write ONLY the files assigned to you, with the Write tool, directly into that folder. Do not
touch any other file, do not publish anything, do not render or screenshot. When done, reply
with: each file name, its height in px, and a short list of anything you assumed or any idea you
left out (ideas go in the reply, never invented into the screen).

## ROUND 4 (2026-10-05) — CURRENT. This section overrides everything below it.

Source of truth: `docs/spec-v2.md`, sections
"Brew phases", "Live display", "Equipment, coffee and settings", "What every shot records",
"Grading", "Nudge, and learning later", "App structure and look"; decisions D-052–D-054 in
docs/DECISIONS.md. Look: Instrument only (keep the `look` tweak working, default instrument).

**Gone (never draw these):** score dial, taste triangle, strength, per-shot flavour notes,
better/worse than last, pointers other than the taste nudge, shot reading fast/on time/slow,
learned windows / "what the app learned", dial-in card, bag stock and remaining weight, milk as
an entity or milk stock, shot-settings screen, phase on/off switches, burr epochs, maintenance
intervals per machine part beyond the three dates below.

**Round-4 sample data (overrides older sample data):**
- Scale: BOOKOO Themis Mini, connected, battery 82 %.
- Machine: Gaggia Classic Pro, pressure 6.0 bar (OPV). Baskets: "LM 17 g" (17 g, default),
  "Stock double" (18 g), "Stock single" (9 g).
- Grinders: Eureka ORO Mignon Single Dose Pro (stepless, default, setting 6.2); Comandante C40
  MK4 Red Clix (clicks, 22).
- Recipes (coffee ratio, milk ratio = milk : espresso): Ristretto 1:1.5; Espresso 1:2; Lungo
  1:3; Cortado 1:2 + milk 1:1; Cappuccino 1:2 + milk 1:3; Flat white 1:2 + milk 1:4; Latte
  1:2 + milk 1:6. Milk drinks are the ones with a milk ratio.
- Coffee packs: Ethiopia Guji · Natural (brand "Local roaster", 250 g, roasted 22 Sep = 12
  days, opened 26 Sep, flavours Blueberry, Jasmine, Bergamot) — open; Kenya Nyeri · Washed
  (roasted 30 Sep, unopened); Colombia Huila · Washed (finished 25 Sep, would buy again: yes);
  Brazil Cerrado (finished 6 Sep, not rated). No stock numbers anywhere.
- Containers (role): Dosing cup 41.0 g (bean cup + grind cup); Espresso cup 112.6 g (cup);
  Glass tumbler 182.0 g (cup); Milk jug 350 ml 181.4 g (milk jug) — within 3 g of the
  tumbler: a dismissible warning.
- Tags: WDT (default on), Puck screen (default on), RDT, Paper filter, Warm-up < 15 min,
  New basket, Experiment.
- Maintenance (three dates): Descale — last 1 Aug, reminder every 60 days → 4 days overdue;
  Backflush — last 23 Sep, every 14 days → due in 3 days; Grinder care (ORO) — last 10 Sep,
  every 30 days → due in 6 days; C40 never logged.
- Today's shot A, Sun 4 Oct 07:12, **Cappuccino**: beans 17.2 g (target 17.0, basket LM 17 g);
  grind 16.9 g, retention 0.3 g (ORO 6.2); extraction: target 33.8 g (16.9 × 2), yield 35.4 g,
  ratio 1:2.09, first drip 7.4 s, extraction 24.6 s, average flow 1.35 g/s; milk 104 g of a
  106 g target (35.4 × 3). Taste balanced, channelling no, tags WDT + Puck screen. Machine
  Gaggia 6.0 bar. Pack Guji (day 12, open 8 days).
- Previous shot B, Sat 3 Oct 07:05, Espresso: ORO 6.4, beans 17.1 → 16.7 g, yield 35.8 g,
  1:2.14, first drip 5.2 s; taste **sour**; channelling no. So before today's shot the nudge
  said: "Last time it was sour: grind a little finer for a more balanced cup." (6.4 → 6.2).
- History (newest first; drink, taste): Sun 07:12 Cappuccino balanced · Sat 07:05 Espresso sour
  · Fri 07:20 Espresso sour · Thu 06:58 Flat white bitter (channelling yes) · Wed 07:15
  Espresso balanced · Tue 07:02 Espresso balanced · Mon 07:10 Espresso sour (C40 22 clicks,
  tag Experiment). Yields/first drips/ratios as in the older table below.
- Last 7 days: 7 shots; average ratio 1:2.06; average first drip 6.7 s; average extraction
  25.1 s; taste 3 balanced · 3 sour · 1 bitter; 1 channelled.
- Live snapshots: beans pouring 15.8 of 17.0 g (93 %, "1.2 g to go"); extraction 27.8 of
  33.8 g (82 %, "6.0 g to go", 1.3 g/s, 27.9 s), over: 35.0 g ("+1.2 g over target"); milk 64 of
  106 g (60 %, "42 g to go").

**Ambient context (every phase):** a compact strip near the top of the phase screen showing the
equipment that matters there, each item a tappable row/chip that would open an inline picker
(draw one picker open via a tweak where the brief says so). Last used is the default; a change
becomes the default ("now the default" note).
- Beans: machine + basket (sets the target) + pack. Grind: grinder + setting (stepper).
  Extraction: recipe (sets the ratio). Milk: the recipe's milk ratio.

**Progress:** every pour has a progress bar (or equivalent) towards its target, plus the big
number; over-target turns to `--warn` past +1.0 g.

**Phases:** Beans, Grind, Extraction, Milk. Only cup + extraction required; skipped phases show
"skipped" on the shot card. Phase stepper on top of brew screens = manual phase switch. Milk
appears only for a recipe with a milk ratio. A lift is a pause (say so where useful, e.g. Beans
"Lift to pour some back — the phase stays open").

**Boards (round 4), as drawn:**
- `Main`: Home. Scale name, connection and battery; the live weight with Tare (Tweak `scale`:
  idle / container / disconnected). The most urgent maintenance reminder, the last shot, the
  last 7 days (count, averages, taste split, channelled).
- `History`: rows with date and time, drink, a small graph, the taste and "channelled"; Tweak
  `compareMode` picks two shots for Compare.
- `History-Detail`: the big graph with markers, every metric, the phases against their targets,
  the grades (editable in place) and the snapshot as it was at brew time (pack dates, machine
  and pressure, basket, grinder and setting, recipe, maintenance dates).
- `History-Compare`: A and B overlaid, aligned at pump on or first drip, and an "A Δ B" table.
- `Brew-Beans`: beans against the basket's size with progress; context machine, basket, pack;
  the nudge. Tweaks `state` (pouring / reached), `picker` (none / basket), `nudge`.
- `Brew-Grind`: the ground dose and retention; grinder and setting (stepper, "now the default").
- `Brew-Ready`: the cup recognised, the recipe and target, listening for the pump or Start by
  hand. Tweaks `pumpDetection` (microphone / manual), `picker` (none / recipe).
- `Brew-Shot`: remaining to target, progress, flow, time and the live chart. Tweak `state`
  (running / over).
- `Brew-Milk`: milk against the recipe's milk target; the jug/tumbler warning; Skip or Done.
- `Brew-Finish`: the shot card. Phases (skipped ones say so), results and chart, grades (taste,
  channelling, tags), context (pack, machine and basket, grinder and setting, recipe), Save.
  Tweaks `milk` (pending / added / skipped), `grindSkipped`.
- `Setup`: maintenance alerts and the settings list.
- `Setup-Machine`: name, pressure (optional), baskets (id and size), descale and backflush.
- `Setup-Grinders`: brand, model, stepless or clicks, setting, grinder care, the default.
- `Setup-Recipes` (was `Setup-Shot`): the list and the editor, a coffee ratio and an optional
  milk ratio. Tweak `editing`.
- `Setup-Packs` and `Setup-Pack`: open, unopened and finished packs; one pack's fields (roast
  date required) and Finish with the optional "buy again". Tweak `finishing`.
- `Setup-Containers`: containers with roles, the 3 g warning, weigh and add.
- `Setup-Tags`: tags, with defaults on for every new shot.
- `Setup-Microphone` (was `Setup-Brew`): on or off, and the pump and grinder calibration. Tweak
  `calibrating`.
- `B-*`: Crema copies of `Main`, `Brew-Shot`, `Brew-Finish`, `History-Compare` and
  `Setup-Grinders` (their `look` tweak defaults to crema). Regenerate them from the Instrument
  boards rather than editing them.
- Removed: `Setup-Milk` (milk is no longer an entity).

## Look (2026-10-04)

The user chose **A · Instrument**. New artboards default to `look: instrument`; Crema stays in the
theme only for reference.

## User decisions, round 2 (2026-10-04) — these override the sample data below

1. Score 1–10 stays, shown compactly: a swipe dial showing the number (prefilled from the last
   shot of the same pack); swipe left/right or tap a neighbour to change it.
2. Direction prefill: open (agent recommends blank direction, everything else prefilled).
3. Tags are simply tags. Groups (Tools, Notes) are a display mechanic only.
4. Containers: recognition picks the nearest container. Same weight = hard conflict. Within a
   3 g band = dismissible warning (a wet container weighs more). A container can serve several
   phases (the user's dosing cup is used for Beans and Grind). New list: Dosing cup 41.0 g →
   Beans + Grind; Espresso cup 112.6 g → Shot; Glass tumbler 182.0 g → Shot; Milk jug 350 ml
   181.4 g → Milk. There is no Bean cup.
5. Packs have a roast date and an open date (age from roast date).
6. Phases: Beans and Shot are mandatory; Grind (weighing the dose) and Milk are optional and can
   be switched off in Setup · Brew flow. Without Grind, the dose is the beans weighed.
7. Pump detection by microphone is assumed to work (to be tested), can be switched off; manual
   start is always available.
8. Per-bag rating (would buy again / wouldn't) is optional, offered when the bag is finished:
   by the last shot, or by finishing it manually (e.g. unmeasured coffee made by someone else).

## User decisions, round 3 (2026-10-04) — the app reads the shot and points the way

Replaces decision 2 above. "Direction" is no longer a required tap. Taste becomes part of the
flavour input, the app reads the shot's data, and **pointers** suggest a change only when it's
relevant. Pointers are small, dismissible cards — never modals, never blocking.

**Taste input (Brew-Finish, "How was it?")**
- *Balance triangle*: corners Sweet (top, = balanced, the goal), Sour (bottom left), Bitter
  (bottom right). Six tappable points: Sweet · Slightly sour · Sour · Slightly bitter · Bitter ·
  Sour + bitter (bottom edge, middle). Distance from Sweet = how strong the off-taste is.
- *Strength*: a 5-step `seg` Watery · Light · Right · Rich · Heavy (default Right).
- Both prefilled from the last shot of the same pack (Sat: Sour, Right) and marked
  "from last shot" until touched. Score dial, flavour notes and better/worse stay as they are.
  Save is never blocked.

**Shot reading (data, no input)** — first drip compared with the bag's learned window:
fast / on time / slow. Ethiopia Guji's learned window is **6.8–7.6 s** (from its well-scored,
balanced shots). For a bag without enough shots the target from Setup · Shot is used
(**first drip 6–9 s**). Today's shot: 7.4 s → on time. Sat: 5.2 s → fast. Thu: 9.8 s → slow.

**Pointer catalogue** (taste × reading; show at most one, the most specific):
| Situation | Pointer text | Action |
| --- | --- | --- |
| Sour + fast | "Sour and fast: grind finer. Try 6.2 (from 6.4)." | `Set 6.2` |
| Bitter + slow | "Bitter and slow: grind coarser. Try 6.3." | `Set 6.3` |
| Sour + on time | "Sour but on time: try a longer ratio, 1:2.2, before touching the grind." | `Use 1:2.2` |
| Bitter + on time | "Bitter but on time: try a shorter ratio, 1:1.8." | `Use 1:1.8` |
| Sour + slow, or bitter + fast | "Taste and timing disagree. Grind won't fix this: check freshness, water temperature or puck prep." | none |
| Sour + bitter | "Sour and bitter together usually means uneven extraction: try WDT and a level tamp." | none |
| Watery / Heavy | "Watery: shorten to 1:1.8." / "Heavy: lengthen to 1:2.2." | `Use 1:1.8` / `Use 1:2.2` |
| Age drift (before grinding) | "Day 12 off roast: beans often want a touch finer around now, and your last 2 Guji shots ran fast." | `Set 6.2` |
| Sweet + on time, or dialled in | no pointer | — |

Every pointer has ✕ (dismiss this one) and a "Not for this bag" link. A pointer about the grind
also appears **at the next Beans phase** ("Before you grind"), where the grinder is adjusted;
tapping its action sets the grinder's setting (it becomes the default), ✕ keeps the current one.

**What the app learned about Ethiopia Guji (from its 9 shots)**
- Sweet spot: ORO 6.2–6.3. Step size: 0.1 on the ORO ≈ 1.0 s of first drip.
- First-drip window 6.8–7.6 s. Notes: Blueberry shows up at 6.2–6.3; Bergamot at 6.4+ (sourer).
- Best recipe: ORO 6.2 · 17.2 g beans → 16.9 g ground → 35.4 g · 1:2.09 · first drip 7.4 s
  (today, 7/10).
- Dial-in status: **2 of 3** good shots (balanced, score ≥ 7: Wed 30 Sep and today) →
  "1 more to call it dialled in". When dialled in: pointers stop, Home shows the best recipe
  with "Repeat", and the app offers the optional "would you buy it again?" bag rating.
- Age: day 12 off roast; beans usually settle around day 14.
- Pointers can be switched off in Setup · Brew flow ("Grind and recipe pointers"), and
  dismissed "not for this bag" pointers can be reset there.

## The .dc.html format (rules that fail silently if broken)

- Start from `Main.dc.html`: same `<!doctype html>`, `<head>` with `<meta charset>`, a `<title>`
  naming the screen, and **exactly** `<script src="./support.js"></script>`.
- Copy the **whole `<helmet>…</helmet>` block from `Main.dc.html` verbatim** (font link + theme
  CSS). Never edit the theme CSS; if you truly need one extra rule, add it at the end of the
  `<style>` and mention it in your reply.
- Root element: `<div class="ss {{theme}}" style="width: 390px; height: NNNpx">`. Phone screens are
  390×844. A screen that scrolls in reality may be taller (e.g. 390×1400): draw it at full length
  rather than clipping. The script's `$preview` must match width × height.
- Close every non-void element, including SVG (`<path ...></path>`, `<circle ...></circle>`).
  Quote every attribute.
- `{{hole}}` is a dotted lookup into `renderVals()` only — never an expression (`{{a+b}}`,
  `{{!x}}` fail). Compute everything in `renderVals()`.
- Attribute holes: `x="{{path}}"` passes the raw value; `x="a {{p}} b"` interpolates a string.
  `class="chip {{g.cls}}"` is fine. **Never put more than one CSS declaration inside one hole**,
  and never make a whole `style` attribute a hole. Inline styles use literal values and
  `var(--token)`; state-driven differences go through classes (`on`, `bg-sour`, …).
- Events: `onClick="{{pick}}"` where `pick` is a function returned by `renderVals()`. Per-item
  handlers: build them in `renderVals()` with `.map(...)` and bind `onClick="{{item.pick}}"`
  inside `<sc-for>`.
- Loops: `<sc-for list="{{items}}" as="item" hint-placeholder-count="3">…</sc-for>` with
  `{{item.x}}` and `{{$index}}` in scope. Conditionals:
  `<sc-if value="{{cond}}" hint-placeholder-val="{{true}}">…</sc-if>` — wrap multiple children in
  one `<div>` inside it.
- State: `const s = this.state || {};` then `this.setState({...})`. Classic JS only
  (`class Component extends DCLogic`, no imports, no TypeScript). Object spread is fine.
- Navigation between artboards: `<a href="Other.dc.html">`. Style the `<a>` itself; never put a
  `<button>` inside an `<a>`.
- All UI is markup. No `innerHTML`, no `appendChild`, no network (the font link is already in
  the helmet), no `<iframe>`, no emoji, no global key handlers.
- Accessible as drawn: real `<button type="button">`, `<a href>`, `<label>` + `<input>`;
  `aria-label` on icon-only buttons; `aria-pressed="{{x.on}}"` on toggles; touch targets
  ≥ 44 px tall where tappable (chips may be 34 px). Icons: inline stroke SVG with `class="ico"`
  and `viewBox="0 0 24 24"`, never emoji.
- `data-props` on the script tag is single-quoted JSON. Always declare the two look tweaks plus
  `$preview`, exactly like `Main.dc.html`:
  `'{"look":{"editor":"enum","options":["instrument","crema"],"default":"instrument"},"mode":{"editor":"enum","options":["auto","light","dark"],"default":"auto"},"$preview":{"width":390,"height":844}}'`
  You may add a state tweak (e.g. `"state":{"editor":"enum","options":["running","over"],"default":"running"}`)
  when the brief asks for one. Inside JSON strings use `\"` for a double quote; `&#39;` for a
  single quote; `&amp;` for `&`.
- `renderVals()` must always compute and return `theme` exactly like `Main.dc.html`:

```js
const look = this.props.look ?? 'instrument';
const mode = this.props.mode ?? 'auto';
const dark = mode === 'auto' ? look === 'crema' : mode === 'dark';
// ...
return { theme: 'look-' + look + ' mode-' + (dark ? 'dark' : 'light'), /* ... */ };
```

## Theme classes (defined in the helmet; use them, don't restyle them)

Tokens (CSS variables, use as `var(--x)` in inline styles): `--bg --panel --chip --ink --sub
--rule --grid --tick --accent` (text-safe accent) `--mark` (accent for lines/marks/fills)
`--btn --btn-fg --chip-on --chip-on-fg --warn --warn-bg --caution --caution-bg --ok --sour
--balanced --bitter --on-dir` (text on a direction fill) `--line-a --line-b` (shot A / shot B in
charts) `--r-card --r-ctl --r-chip`.

| Class | Use |
| --- | --- |
| `lbl` | small label (mono uppercase in Instrument, rounded bold in Crema) |
| `num` | numbers (tabular). Pair units with `unit` |
| `ttl` | screen title `<h1 class="ttl">` |
| `muted` | secondary text colour |
| `card` | surface (bordered panel in Instrument, soft filled card in Crema) |
| `row` | list row inside a card (flex, space-between, 48 px, top hairline). Works on `<a>` too |
| `chev` | the `›` chevron |
| `btn` | primary button (full width, 56 px) — `<button>` or `<a>` |
| `btn2` | secondary button (44 px, outlined) |
| `link` | inline text link in accent colour |
| `chip`, `chip on`, `chip add` | tag/flavour chips; `on` = selected; `add` = dashed "+ Add" |
| `seg` | segmented control container; its `<button>`s get class `on` when selected |
| `badge`, `badge warn`, `badge caution`, `badge accent` | small status pill |
| `dot` + `bg-sour`/`bg-balanced`/`bg-bitter`/`bg-mark`/`bg-warn`/`bg-caution` | coloured dot or fill |
| `c-sour c-balanced c-bitter c-warn c-caution c-accent` | text colours |
| `toggle` / `toggle on` | switch (`<button type="button" class="toggle {{x.cls}}" aria-pressed="{{x.on}}" aria-label="...">`, empty) |
| `stepper` | `<div class="stepper"><button type="button" aria-label="Decrease">−</button><span class="num">6.2</span><button type="button" aria-label="Increase">+</button></div>` |
| `input` | text input (`<label class="lbl" for="x">` + `<input class="input" id="x" type="text" value="...">`) |
| `bar` | progress bar: `<span class="bar"><span style="width: 57%"></span></span>` |
| `ico` | 24 px stroke icon |
| `back` | back link at top of pushed screens: `<a class="back" href="Setup.dc.html">‹ Setup</a>` |
| `tabbar`, `tab`, `tab on` | bottom navigation (copy from Main.dc.html, move `on` + `aria-current="page"` to the right tab) |

Layout: inner wrapper like Main (`<div style="height: 100%; padding: 16px 16px 96px; display: flex; flex-direction: column; gap: 12px">`)
when the screen has the tab bar (it is absolutely positioned, 80 px). Brew screens have **no tab
bar** (focus mode) — use `padding: 16px 16px 24px`.

Direction selected state: a button with class `on` should get a fill. Add to the end of the
style block only if you need it, e.g. `.dirbtn.on.d-sour{background:var(--sour);border-color:var(--sour);color:var(--on-dir)}`
(and the same for balanced, bitter). Brew-Finish needs this; mention it in your reply.

## Content rules

- Concise, plain labels. No lorem ipsum, no marketing copy, no emoji.
- Use only the sample data below so all screens agree. Units: g, s, g/s; ratio written `1:2.09`.
- Don't invent features beyond the brief. If you have an idea, put it in your reply.
- The app never controls the machine. "Start manually" = start recording/timer on the scale, not
  the pump.

## Sample data (canonical)

Today is **Sun 4 Oct 2026**. Times are 24 h.

- Scale: BOOKOO Themis Mini, connected, battery 82 %.
- Machine: Gaggia Classic Pro, pressure 6.0 bar (OPV mod), added 12 Sep 2026. Maintenance:
  - Descale every 60 days, last 1 Aug → overdue by 4 days (warn).
  - Backflush every 14 days, last 23 Sep → due 7 Oct, in 3 days (caution).
  - Shower screen clean every 30 days, last 20 Sep → due 20 Oct, in 16 days.
  - Group gasket every 12 months, never logged → counting from 12 Sep 2026 (the day it was
    added) → due 12 Sep 2027.
  - Rule: if a last-done date exists the cycle runs from it; if not, from the date the item was
    created.
- Grinders:
  - Eureka ORO Mignon Single Dose Pro — **default**, stepless, setting **6.2**, burr epoch
    "Seasoning since 12 Sep" (settings provisional). Clean burrs every 30 days, last 10 Sep →
    due 10 Oct, in 6 days (caution).
  - Comandante C40 MK4 with Red Clix — clicks, setting **22 clicks**. Clean every 60 days, never
    logged → counting from 12 Sep → due 11 Nov.
  - A setting changed during a shot overwrites the grinder's default for the next shots. It can
    also be changed in Setup.
- Shot settings: basket La Marzocco 17 g, target dose **17.0 g**, preferred ratio **Espresso
  1:2.0**. Ratio presets by drink: Ristretto 1:1.5, Espresso 1:2.0, Lungo 1:3.0,
  Cappuccino 1:1.7; otherwise a custom slider 1:1.0–1:3.5. Over-target warning at +1.0 g.
  The target yield is computed from the **actual ground dose**, not the setting.
- Coffee packs:
  - **Ethiopia Guji** · Natural (open) — roasted 22 Sep 2026 (**12 days**), opened 26 Sep
    (8 days), bag 250 g, **159.2 g before today's shot, 142.0 g after** (~8 shots left).
    Origin Ethiopia, region Guji · Hambela, variety Heirloom, elevation 1,950–2,200 m, roast
    level Medium-light, single origin. Flavour profile: Blueberry, Jasmine, Bergamot, Honey,
    Dark chocolate. 9 shots from this pack, average score 6.1, best grind ORO 6.2.
  - **Kenya Nyeri** · Washed (unopened) — roasted 30 Sep (4 days), 250 g. Flavours:
    Blackcurrant, Grapefruit, Brown sugar.
  - **Colombia Huila** · Washed (finished 25 Sep) — 4–25 Sep, 14 shots, average 6.4.
  - **Brazil Cerrado** · Pulped natural (finished 6 Sep) — 20 Aug–6 Sep, 13 shots, average 5.8.
  - Extra flavours to offer as unselected chips: Strawberry, Lemon, Peach, Caramel,
    Milk chocolate, Hazelnut, Brown sugar, Black tea, Red wine.
- Milk: **Oat barista** (default) — 1000 g carton, opened 1 Oct, 620 g before today, **478 g
  after**. **Whole milk 3.5 %** — 1000 g, unopened.
- Containers (match tolerance ± 2.0 g): Bean cup 38.4 g → Beans; Dosing cup 41.0 g → Grind;
  Espresso cup 112.6 g → Shot; Glass tumbler 182.0 g → Shot; Milk jug 350 ml 181.4 g → Milk.
  **Conflict:** Milk jug and Glass tumbler are 0.6 g apart.
- Tags (one list, each tag has a group and a "default" flag; defaults are pre-selected on every
  new shot): Tools — WDT (default, used in 41 shots), Puck screen (default, 38), RDT (12),
  Paper filter (5). Notes — Warm-up < 15 min (6), New basket (2), Experiment (4).

**Today's shot (A)** — Sun 4 Oct 07:12, Ethiopia Guji (day 12), ORO 6.2, Gaggia 6 bar.
Beans weighed 17.2 g (target 17.0, +0.2). Ground out 16.9 g → retention 0.3 g (1.7 %).
Target yield 33.8 g (16.9 × 2.0). Pump on 0 s, first drip 7.4 s, pump off 32.0 s.
Extraction (first drip → pump off) 24.6 s, total (pump on → pump off) 32.0 s. Weight at pump
off 33.3 g, tail 2.1 g, yield 35.4 g (+1.6 over target), ratio 1:2.09, average flow 1.35 g/s.
Milk: Oat barista 142 g. Tags: WDT, Puck screen. Rating: Balanced, notes Blueberry + Dark
chocolate, 7/10, better than last shot.

**Previous shot (B)** — Sat 3 Oct 07:05, Guji (day 11), ORO 6.4. Beans 17.1 g, ground 16.7 g,
retention 0.4 g. First drip 5.2 s, pump off 27.0 s, extraction 21.8 s, yield 35.8 g, ratio
1:2.14, average flow 1.53 g/s. Sour, notes Bergamot, 5/10, worse than last. Tags: WDT.

**History, last 7 days (newest first):**

| When | Coffee | Grind | Direction | Score | vs last | First drip | Yield | Ratio | Tags | Milk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Sun 4 Oct 07:12 | Guji | ORO 6.2 | Balanced | 7 | better | 7.4 s | 35.4 g | 1:2.09 | WDT, Puck screen | Oat 142 g |
| Sat 3 Oct 07:05 | Guji | ORO 6.4 | Sour | 5 | worse | 5.2 s | 35.8 g | 1:2.14 | WDT | — |
| Fri 2 Oct 07:20 | Guji | ORO 6.6 | Sour | 6 | better | 4.6 s | 36.4 g | 1:2.15 | WDT, New basket | — |
| Thu 1 Oct 06:58 | Guji | ORO 5.8 | Bitter | 4 | worse | 9.8 s | 32.9 g | 1:1.95 | Warm-up < 15 min | Oat 120 g |
| Wed 30 Sep 07:15 | Guji | ORO 6.2 | Balanced | 7 | better | 7.1 s | 34.0 g | 1:2.00 | WDT, Puck screen | — |
| Tue 29 Sep 07:02 | Guji | ORO 6.3 | Balanced | 6 | same | 6.8 s | 34.6 g | 1:2.04 | WDT | — |
| Mon 28 Sep 07:10 | Guji | C40 22 clicks | Sour | 5 | — | 5.9 s | 35.1 g | 1:2.07 | WDT, Experiment | — |

7-day stats: 7 shots, average first drip 6.7 s, average score 5.7, average ratio 1:2.06,
3 sour / 3 balanced / 1 bitter.

**Live extraction snapshots (shot A):**
- Running: 27.9 s since pump on, weight 27.8 g, target 33.8 g → **6.0 g to go**, flow 1.3 g/s.
- Over target: 34.7 s, weight 35.0 g → **+1.2 g over target**, flow 0.2 g/s, pump off detected
  at 32.0 s (drips still falling).
- Beans phase: pouring = 15.8 g of 17.0 (1.2 g to go); reached = 17.2 g (+0.2).
- Grind phase: 16.9 g ground vs 17.2 g beans → retention 0.3 g (1.7 %).
- Milk phase: 142 g poured.

## Charts

Inline `<svg viewBox="0 0 1000 500" style="display: block; width: 100%; height: auto">`
(uniform scale, so the drawing height is half its width). Stroke widths are in viewBox units
(at ~330 px wide, 6 units ≈ 2 px). Style SVG with `style="..."` (fill, stroke, stroke-width,
stroke-dasharray), never presentation attributes like `stroke-width="2"`.
Colours: shot A `var(--line-a)`, shot B `var(--line-b)`, grid `var(--grid)`, markers
`var(--tick)`/`var(--sub)`, target `var(--mark)`, over-target `var(--warn)`.

Axes for single-shot and live charts: x = 0…40 s from pump on (x = t × 25), weight 0…40 g
(y = 500 − g × 12.5), flow 0…3 g/s on the same box (y = 500 − f × 166.7). Gridlines at 10/20/30 g:
`M0 125H1000M0 250H1000M0 375H1000`. Target 33.8 g → `y = 77.5`. First drip 7.4 s → `x = 185`.
Pump off 32.0 s → `x = 800`. Running "now" (27.9 s, 27.8 g) → point (696, 152.5). Over "now"
(34.7 s, 35.0 g) → point (868, 62.5).

`tools/paths.json` keys (copy the strings into a `const` in `renderVals()` and bind with
`d="{{P.wA}}"`):
- `single.wA`, `single.fA` — full shot A, 0…40 s (detail screens).
- `live.wA`, `live.fA` — shot A cut at 27.9 s (running state).
- `over.wA`, `over.fA` — shot A cut at 34.7 s (over-target state).
- `pumpOn.{wA,wB,fA,fB,zeroX}` — A and B aligned at pump on, x window −1…39 s
  (ticks: 0 s at 2.5 %, 10 at 27.5 %, 20 at 52.5 %, 30 at 77.5 %).
- `firstDrip.{wA,wB,fA,fB,zeroX}` — A and B aligned at first drip, window −8…32 s
  (ticks: 0 at 20 %, +10 at 45 %, +20 at 70 %, +30 at 95 %).

Axis/tick labels go in HTML under or beside the SVG (absolutely positioned spans with
`left: NN%; transform: translateX(-50%)`), not as SVG text. Weight solid, flow dashed.

## Screens (each brief lists what must be on the screen)

### History group (tab "History" on)

**History.dc.html** — 390×844. Title "History" and a `btn2` "Compare" in the header. The list of
shots from the table above, one row per shot, each row an `<a href="History-Detail.dc.html">`:
line 1 date + time, direction (dot + word), score `7/10` and a ↑/↓/= vs-last marker; line 2
(muted, small) coffee · grind · first drip · yield · ratio; line 3 small chips/text for tags and
milk. Compare is a triggered action: pressing "Compare" switches the screen into selection mode
(state): rows become buttons with a selection circle (marked A / B in pick order, max 2), the
"Compare" button becomes "Cancel", and a bar above the tab bar shows "Pick two shots" / "Compare
2 shots" — the latter an `<a class="btn" href="History-Compare.dc.html">` once two are picked.
Add a boolean tweak `compareMode` (default false) that seeds the initial state so both states
can be seen. Optional: a small filter row (e.g. chips "All coffees", "7 days") if it fits.

**History-Detail.dc.html** — tall (around 390×1300). `back` "‹ History". Title "Sun 4 Oct · 07:12".
Rating summary (direction badge, 7/10, "better than last", flavour chips). Chart of shot A with
weight, flow, the target line (33.8 g), and vertical markers for pump on (x 0), first drip
(x 185) and pump off (x 800) with small HTML labels; time ticks 0/10/20/30/40 s. Metrics grid:
first drip, extraction, total, yield (target 33.8 · +1.6), ratio (target 1:2.0), average flow,
weight at pump off, tail. Beans & grind: beans 17.2 g (target 17.0), ground 16.9 g, retention
0.3 g · 1.7 %. Equipment: coffee (Ethiopia Guji · day 12), grinder (ORO Mignon · 6.2), machine
(Gaggia Classic Pro · 6 bar), milk (Oat barista · 142 g). Tags chips. Actions: `btn2` "Compare
with…" (link to History.dc.html) and `btn2` "Edit rating". Keep the tab bar (History on).

**History-Compare.dc.html** — 390×844 or taller if needed. `back` "‹ History". Title "Compare".
Two legend cards A and B (swatch in `--line-a` / `--line-b`, date, direction, score). A `seg`
"Pump on | First drip" (state, default First drip) that swaps the chart paths and tick labels.
Chart: both shots, weight solid + flow dashed, a vertical alignment line at `zeroX`.
Then a diff table: metric | A | B | Δ for grind (6.2 / 6.4 / −0.2), beans → ground
(17.2→16.9 / 17.1→16.7), retention (0.3 / 0.4), first drip (7.4 / 5.2 / +2.2 s), extraction
(24.6 / 21.8 / +2.8 s), yield (35.4 / 35.8 / −0.4 g), ratio (2.09 / 2.14), average flow
(1.35 / 1.53 / −0.18), score (7 / 5 / +2), direction (Balanced / Sour). Tab bar (History on).

### Brew group (no tab bar — focus mode)

Common top on every Brew screen: an icon-only close link (`<a href="Main.dc.html" aria-label="End session">` with an ✕ stroke icon)
and a **phase stepper**: Beans · Grind · Shot · Milk (Milk labelled "optional"). Each step is an
`<a>` to its artboard (Brew-Beans, Brew-Grind, Brew-Ready for Shot, Brew-Milk) — in the app this
doubles as the manual phase picker when a container isn't recognised. States: done (check icon,
muted), current (ink + `--mark` underline), upcoming (muted). Under it, the recognised container:
e.g. "Bean cup · 38.4 g" with a small `badge` "recognised". Phases advance automatically when the
container is lifted / a new one is placed; say so in a short hint line, not in a tutorial.

**Brew-Beans.dc.html** — 390×844. Huge beans weight vs target dose 17.0 g. Tweak `state`:
`pouring` (15.8 g, "1.2 g to go", progress toward target) / `reached` (17.2 g, "+0.2 g",
target-reached styling). Default `pouring`. Coffee line: "Ethiopia Guji · day 12" and "159.2 g in
the bag → 142.0 g after you lift the cup" (the pack is decremented by the beans weighed). Hint:
"Lift the cup to move on to grinding."

**Brew-Grind.dc.html** — 390×844. Dosing cup recognised (41.0 g). Huge ground weight 16.9 g;
"from 17.2 g beans"; retention 0.3 g · 1.7 % as a clear secondary readout. Grinder chip "ORO
Mignon · 6.2" (tapping would open the inline editor; static here). Optional: last 5 retentions as
small numbers (0.4, 0.3, 0.5, 0.3, 0.3 g). Hint: "Lift the cup, then put your espresso cup down."

**Brew-Ready.dc.html** — 390×844. Espresso cup recognised (112.6 g). Big target "33.8 g" with
"16.9 g × 2.0 · Espresso". State: "Listening for the pump" with a microphone icon and a small
level meter. "Waiting 0:42". An empty chart frame (gridlines, target line) ready to draw.
Fallback `btn2` "Start manually" with a muted note that it tares the scale and starts the timer.
Stepper: Shot current.

**Brew-Shot.dc.html** — 390×844. Tweak `state`: `running` (default) / `over`. Readout first, large
enough to read from a metre away: remaining "6.0 g to go" (huge `num`), flow "1.3 g/s", time
"27.9 s". Below, the live chart (weight solid to "now" with a dot, flow dashed, target line with a
"33.8 g" label, first-drip marker "first drip 7.4 s"). `over` state: readout becomes "+1.2 g over
target" in `--warn` with a `badge warn`, flow 0.2 g/s, time 34.7 s, pump-off marker at x 800, the
part of the weight line above the target emphasised in `--warn` (you may draw a warn-coloured
copy of the over path clipped above y 77.5 with a `<clipPath>`, or tint the region above the
target line), and the muted note "Pump off at 32.0 s · drips still falling". Stepper: Shot current.

**Brew-Milk.dc.html** — 390×844. Milk jug recognised (181.4 g) with a caution line "Also matches
Glass tumbler (182.0 g)" and a `link` "Not the jug?" (conflict handling). Huge "142 g poured".
Milk picker `seg`: Oat barista (on) | Whole 3.5 %. Stock line "620 g → 478 g". Buttons: `btn2`
"Skip milk" and `btn` "Done" (`<a href="Brew-Finish.dc.html">`). Stepper: Milk current.

**Brew-Finish.dc.html** — tall (around 390×1800), no tab bar, no phase stepper (show "Shot
complete · 07:12" header with the close link). Everything is editable here without leaving the
screen. Sections, in order:
1. Results card: first drip 7.4 s, extraction 24.6 s, yield 35.4 g (target 33.8 · +1.6), ratio
   1:2.09, average flow 1.35 g/s, beans 17.2 → ground 16.9 g (retention 0.3 g), milk 142 g; plus
   a small chart of shot A.
2. "How was it?" — a muted line "Prefilled from your last Guji shot". Direction: three large
   buttons Sour / Balanced / Bitter (state; default Balanced), each with a tiny hint (grind finer /
   keep / grind coarser). Flavour notes from the pack profile as chips (Blueberry on, Dark
   chocolate on, Jasmine, Bergamot, Honey) + `chip add`. Score 1–10 as a 5×2 grid of buttons
   (state; default 7). "Compared to last shot": `seg` Worse | Same | Better (state; default
   Better).
3. Equipment — rows that expand inline (accordion, state; default open: Grinder). Coffee
   "Ethiopia Guji · day 12" (expanded: pick between open/unopened packs). Grinder "ORO Mignon ·
   6.2" (expanded: `seg` ORO Mignon | C40, a `stepper` 6.2, muted note "Becomes the default for
   your next shots"). Machine "Gaggia Classic Pro · 6 bar". Milk "Oat barista · 142 g".
4. Tags: chips; WDT and Puck screen on (defaults), RDT, Paper filter, Warm-up < 15 min,
   New basket, Experiment off; `chip add`. Toggle on tap (state).
5. A muted summary: "Saving takes 17.2 g from Ethiopia Guji (159.2 → 142.0 g) and 142 g from
   Oat barista (620 → 478 g)."
6. `btn` "Save shot" at the bottom.

### Setup group (tab "Setup" on)

**Setup.dc.html** — 390×844 (taller only if needed). Title "Setup". An alerts card (rows linking to
the relevant screen): Descale overdue 4 days (warn) → Setup-Machine; Backflush in 3 days
(caution) → Setup-Machine; Clean ORO burrs in 6 days (caution) → Setup-Grinders; Containers:
1 conflict (warn) → Setup-Containers. Then a card of section rows (each `<a class="row">` with
title + muted summary + chevron): Shot "17.0 g · Espresso 1:2.0" → Setup-Shot; Coffee
"Ethiopia Guji · day 12 · 142 g · 1 unopened" → Setup-Packs; Grinders "ORO Mignon (default) · 6.2"
→ Setup-Grinders; Machine "Gaggia Classic Pro · 6 bar" → Setup-Machine; Milk "Oat barista ·
478 g" → Setup-Milk; Containers "5 · 1 conflict" → Setup-Containers; Tags "7 · 2 default" →
Setup-Tags. Then a small "Data" card with `btn2` "Export all (JSON)".

**Setup-Shot.dc.html** — 390×844. `back` "‹ Setup". Title "Shot". Basket row "La Marzocco 17 g".
Target dose `stepper` 17.0 g (0.1 g steps). Ratio: drink presets as a 2-column grid of selectable
cards (state): Ristretto 1:1.5, Espresso 1:2.0 (on), Lungo 1:3.0, Cappuccino 1:1.7, and a "Custom"
card; when Custom is on, show a drawn slider (track + thumb + value "1:2.25") with − / + buttons.
Preview line "17.0 g in → 34.0 g out". Muted note: the target is recalculated from the actual
ground dose on every shot. Over-target warning `stepper` "+1.0 g".

**Setup-Packs.dc.html** — 390×844. `back` "‹ Setup". Title "Coffee" + `btn2` "Add pack". Sections:
Open — the Guji card (name, process, roasted 22 Sep · 12 days, opened 26 Sep · 8 days, `bar`
142 / 250 g, ~8 shots left, 9 shots · average 6.1) as `<a href="Setup-Pack.dc.html">`; Unopened —
Kenya Nyeri (roasted 30 Sep · 4 days, 250 g) with `btn2` "Open"; Finished — Colombia Huila and
Brazil Cerrado rows with dates, shot count and average score.

**Setup-Pack.dc.html** — tall (around 390×1500). `back` "‹ Coffee". Title "Ethiopia Guji". Age
block: "12 days off roast" (big) and "open 8 days". Fields: Name (`input`), Roaster (`input`,
empty, placeholder "Optional"), Roast date "22 Sep 2026", Open date "26 Sep 2026", Bag weight
250 g, Remaining 142 g (estimated) with `btn2` "Weigh the bag to correct". Details (optional):
Origin Ethiopia, Region Guji · Hambela, Variety Heirloom, Process `seg` (Washed, Natural on,
Honey, Other), Elevation 1,950–2,200 m, Roast level 5-step `seg` (Light, Med-light on, Medium,
Med-dark, Dark), Type `seg` (Single origin on | Blend). Flavour profile: toggleable chips (on:
Blueberry, Jasmine, Bergamot, Honey, Dark chocolate; off: the extra flavours) + `chip add`
"Add flavour". Pack stats: 9 shots, average 6.1, best grind ORO 6.2. `btn2` "Mark as finished".

**Setup-Milk.dc.html** — 390×844. `back` "‹ Setup". Title "Milk" + `btn2` "Add milk". Oat barista
card (badge "Default"): `bar` 478 / 1000 g, opened 1 Oct, with fields carton size 1000 g,
remaining 478 g + `btn2` "Weigh to correct", a "Default" `toggle` (on). Whole milk 3.5 % card:
1000 g, unopened, `btn2` "Make default".

**Setup-Grinders.dc.html** — tall if needed (around 390×1100). `back` "‹ Setup". Title "Grinders" +
`btn2` "Add grinder". ORO card expanded (badge "Default"): setting type `seg` Stepless (on) |
Clicks; current setting `stepper` 6.2 with muted note "Changes made on a shot update this";
burr epoch "Seasoning · since 12 Sep" + `btn2` "Start new epoch" (muted note: settings are only
compared within one epoch); maintenance "Clean burrs every 30 days", last done 10 Sep, `badge
caution` "due in 6 days", `btn2` "Done today". C40 card collapsed: "Comandante C40 MK4 · Red
Clix · 22 clicks", maintenance "every 60 days · not logged yet, counting from 12 Sep · due
11 Nov", `btn2` "Make default".

**Setup-Machine.dc.html** — 390×844 or taller. `back` "‹ Setup". Title "Machine". Fields: Brand
`input` Gaggia, Model `input` Classic Pro, Pressure `stepper` "6.0 bar" with muted "OPV".
Maintenance card rows: Descale (every 60 days · last 1 Aug · `badge warn` "4 days overdue" ·
`btn2` "Done"), Backflush (every 14 days · last 23 Sep · `badge caution` "in 3 days"), Shower
screen (every 30 days · last 20 Sep · in 16 days), Group gasket (every 12 months · not logged,
counting from 12 Sep · due Sep 2027). Muted rule note: "No date logged? The cycle starts on the
day the item was added." `btn2` "Add maintenance item".

**Setup-Containers.dc.html** — 390×844. `back` "‹ Setup". Title "Containers". Tolerance row "Match
within ± 2.0 g" `stepper`. A warn banner: "Milk jug and Glass tumbler are 0.6 g apart — the
scale can't tell them apart. Change one, or give them the same phase." Container list rows: name,
weight (`num`), phase `badge` (Beans / Grind / Shot / Milk); the two conflicting rows marked with
a warn dot/icon. An "Add container" card: "Put the empty container on the scale", live reading
"Scale reads 0.0 g", phase `seg` (Beans | Grind | Shot | Milk), `btn` "Weigh & add".

**Setup-Tags.dc.html** — 390×844. `back` "‹ Setup". Title "Tags". Muted note: "Default tags are
switched on for every new shot. You can still change them on the shot." Group "Tools" and group
"Notes" (`lbl` headers) in cards; each row: tag name, muted "41 shots", and a "Default" `toggle`
(state, interactive). An add card: `input` "New tag", group `seg` (Tool | Note), `btn2` "Add".
