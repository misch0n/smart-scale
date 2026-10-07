# Implementation plan

The single source of truth for what's done and what's next. **Every agent updates this file in
the same commit as its work** (protocol in `CLAUDE.md`).

**Next task: none an agent can take without the user** (below: the checks and answers). T2.24
is `verify` (D-100): the phases move by the cups with no tap but Start: the beans' cup lifted
with the beans opens the grind, whatever it brings back is the grounds, and the coffee cup opens
the extraction. The user checks P21. T2.23
is `verify` (D-099): session 6 (a Cappuccino, 2026-10-07) showed T2.22's rule taking beans put
straight back for the grounds; the cup now counts as back from the grinder only after 8 s off,
a bean cup carrying anything is never tared, and a lift's push isn't grounds. The user checks
P20. T2.22
is `verify` (D-098): session 5 (the evening of 2026-10-06, a test of the grind) had the grind
tare its grounds away each time the bean cup went down, as they came back 3.2 g short of the
beans; with the grind open, the cup back with up to the beans now brings the grounds, and isn't
tared. The user checks P19. What
the second brew with the app showed (session 4, 2026-10-06, the first with sound; T1.27 made it
a fixture) is built. T2.19 is `verify` (D-095): the app's own tares are expected from when they
are sent, and Start's from its tap, so the live view no longer reads a tare as the cup's weight
gone ("130 g to go"). The user checks P16. T2.20 is `verify` (D-096): the user's tares (Q33):
at a phase's start and as the brew opens, an empty scale that doesn't read 0, or an empty cup
reading its own weight, is tared; a cup swapped in fast is tared; the bean cup back with its
grounds isn't (the scale shows them); Setup tares an empty scale. The user checks P17. T2.21 is
`verify` (D-097): a tap on Grind with the beans in the cup weighs only what goes into it from
the tap, and the grounds it comes back with; until there are grounds the grind view reads 0.0,
has no retention, and asks for the bean cup with the grounds, or **Skip grind** (analysis 12).
The user checks P18. The fixes the first brew asked for (session 3) are built, T2.14–T2.18,
each `verify`.
T1.26 is done: the session's shot gets its pump_off (analysis 11), and the day's export is a
fixture. T2.14 is `verify` (D-089): the empty bean cup back from the grinder keeps the beans
weighed, and opens the grind. The user checks P13. T2.15 is `verify` (D-090): ✕ ends the brew
and resets the scale (its timer stopped and zeroed, a tare), unless the shot card is open. The
user checks P14. T2.16 is `verify` (D-091): a known container put down while Home shows opens
the brew on its phase. The user checks K2–K4 (rewritten for it). T2.17 is `verify` (D-092): a
container can be a "Scale accessory", like the mat: recognised as it goes on, it is part of the
platform, and what goes on it is recognised and weighed as usual; export format 5. The user
learns the mat and checks K7. T2.18 is `verify` (D-093): every brew records the microphone's
sound levels from the brew screen's first tap but Start (Connect, or any other once the scale
connected by itself), unless Setup › Microphone's switch is off. The user checks P15 and
answers Q34.
After them, nothing an agent can take without the user: T3.1 (the microphone) needs recordings
with sound levels of the pump and the grinder (T2.18 records them with every brew) and the
user's answer on how to keep audio; T3.2 waits on A6, T3.4 on the reconnect's outcome (B3). The
user runs the checks in `docs/hardware-tests.md` and answers Q15–Q29 and Q34; the next agent
then fixes what they find, in board order.
**The user's marks may be in the run sheet** (2026-10-06): a private page,
<https://claude.ai/artifact/6Z2czpKX5anqzJR9bAsTjb>, with the 82 open checks in run order
(refreshed after T2.24: P16–P21 added) and Q15–Q29, Q34. Its database
holds a document per id in `results` (`{status: pass|fail|skip|null,
note, at}`) and `answers` (`{answer: keep|change|null, note, at}`). Read both with the
ArtifactData tool (`list`), or take the text the user pastes from its "Copy results". Copy the
results into the Result columns of `docs/hardware-tests.md` and the answers into the questions
table and `docs/DECISIONS.md`, then fix the fails.
T3.5 is `verify` (D-086): the screens follow their boards (three small fixes), and an
accessibility audit (axe-core, WCAG 2.2 A and AA, both modes) is clean on every screen. The user
checks V1–V2.
T3.3 is `verify` (D-085): History has a filter (coffee, days off roast, grinder and since its
care, tags, taste) and, filtered, a trend of a figure against the grind, the days off roast or
the day, with a fitted line. No board draws them: the user checks F1–F3 and answers Q29.
T2.12 is `verify` (D-084): after a sour or bitter shot, the next brew with the same machine,
grinder and pack says at the beans and the grind which way to grind, until dismissed. The user
checks P12 and answers Q28.
T2.10 is `verify` (D-083): the machine's descale and backflush and each grinder's care, "Done
today", the last date and a reminder set in place; the reminders due on Home, and due or coming
up in Setup's Needs attention. The user checks N1–N4 and answers Q26 and Q27.
T2.11 is `verify` (D-082): the milk phase has the milk ratio in place (the open card's shot
takes the drink), the jug's card warns of a container within 3 g ("Not the jug?" picks it), and
the milk shows in whole grams. The user checks P5 and P11.
T2.7 and T2.3 are `verify` (D-081): the grind phase has the grinder and its setting in place (a
step is the grinder's setting, the default next time) and the grinder's last five retentions.
The user checks P10.
T2.6 and T2.2 are `verify` (D-080): the beans phase has the machine, basket and pack in place,
each the last used and picked from a grid; an unopened pack picked is opened today, and the pack
in use can be finished there with "would buy again". The user checks P8–P9.
Phase 2 is re-sequenced: Setup (T2.9) came first, since the phases need packs, grinders and
containers to exist (D-077). M3 is built: what's left of it is the user's, the checks on the
phone and setting up automatic export (U1.2).
T2.5 is `verify` (D-079): the brew has its phases, Beans, Grind, Extraction and Milk, with the
stepper; a learned container opens its phase (the dosing cup back with its grounds opens the
grind), the pump the extraction, a tap any phase; the beans, grounds and milk show live against
their targets, and the target follows the ground weight (else the beans, else the basket: the
dose stepper is gone). The phase flow is logged in the recording, the analysis measures the
phases (version 9), and the card and History show its weights; the shot stores which phases
were done or skipped. The user checks P1–P7 (`docs/hardware-tests.md`, "The brew's phases on
the phone").
T2.4 is `verify` (D-078): the app sees what is put on the scale (`link.vessel`) and matches it
against the containers; Home's scale card names the one on it, or asks which of two it is; a
live shot records its cup's container; and a segment whose vessel is a known bean cup, grind
cup or milk jug gets no post-hoc shot. The user checks K1–K6 on the phone
(`docs/hardware-tests.md`, "Containers recognised on the phone").
T2.9 is `verify` (D-077): Setup (`#/setup`) lists the machine and its baskets, the grinders,
recipes, coffee packs, containers (weighed on the scale, with the "same weight" and "within
3 g" clashes), tags and the microphone (not ready until T3.1), with Export all, the automatic
export and the probe; each opens its board's screen, and changes are stored as they are made.
Some controls the boards don't draw are provisional (Q15–Q19). The user checks S1–S8 on the
phone (`docs/hardware-tests.md`, "Setup on the phone").
T2.1 is done (D-074–D-076): the entities are stored (database version 3), seeded with the
spec's Gaggia, its LM 17 g basket, the ORO and the C40, the seven recipes and T1.18's tags (the
user's added tags and last recipe carried over), exported in format version 4 and backed up as
`<folder>entities.json`; every live shot records its context from them (`shotSnapshot`).
T1.25 is `verify` (D-073): on connect, with the scale idle, the app sends Start timer (`04`); if
the timer starts it stops and resets it, and if not, Home's scale card and the brew screen warn
that the scale isn't in its timer mode, and the app checks again every 5 s while the scale is
idle (Q13), so the warning goes once the user switches. Only the automatic mode's `03 0D`
frames count besides, since the scale's timer key can start the timer (Q14). The user checks
M1–M5 on the phone (`docs/hardware-tests.md`, "The scale-mode check on the phone").
T1.23 is `verify` (D-072): the app opens on Home (`#/`), with the scale, its live weight and
Tare, the last shot and the last 7 days, and every screen but the brew flow has the tab bar
(Home, Brew, History, Setup). Setup was the probe until T2.9 (Q12); the probe is now a row in
Setup. The user checks H1–H5 on the phone (`docs/hardware-tests.md`, "Home and the tab bar on the phone").
T1.21 is `verify` (D-071): the app remembers the scale on the phone and reconnects to it by
itself, without the chooser, on load and after a dropped link, retrying while the scale is off;
Stop stops it, Choose scale opens the chooser, and without Web Bluetooth (beacio injecting late,
or not allowed) the card says so with Reload. The user checks R1–R7 on the phone
(`docs/hardware-tests.md`, "The reconnect on the phone"), which answers B3.
T1.19 is done (D-070): the history at `#/history` lists every shot with a small graph of the real
curve, a shot's page has the large chart, the metrics, the phases and the grades, and Compare
overlays two shots aligned at the first drip or pump on with an "A Δ B" table; the curves live in
the derived cache (`ANALYSIS_VERSION` 8). T1.18 is
`verify` (D-067–D-069): the brew flow at `#/brew`, in the Instrument look, takes a shot from the
cup's tare and the Tare + start tap through the live view to the shot card, stores the live shot
with its grades and a snapshot of its context (export format version 3), and the user checks it
on the phone (`docs/hardware-tests.md`, "The brew flow on the phone"). T1.17 is done (D-065,
D-066): the live pipeline and the scale's commands. T1.16 is done (D-058–D-064): the analysis
reads the user's two real shots right and meets the targets the user re-agreed for the real
scale (D-060). T1.24 is `verify`: the probe records the microphone's sound levels, and the user
checks it on the phone in their next session.
Hardware session 1 (U1.1, D-037) answered most of Part A, and the simulator now follows it
(T1.22, D-021). Session 2 (D-048) recorded two real shots. It answered A2: the pump's vibration
doesn't show, so `pump_on` comes from the Tare + start tap (Q4, the user's answer). The
microphone is the only automatic pump detector left, so the user's next shots should carry its
sound levels, which the probe now records (T1.24, D-050). T1.16 tuned the analysis on the two
shots (`npm run analyze` shows what it makes of a recording, T1.15, D-051), and more shots (C3)
will sharpen it. Setting up automatic export (U1.2) waits for the user too (D-031). Until then,
build against the simulator and mark device-dependent values `PROVISIONAL(U1.1: <test>)` for a
later pass (D-029); D-064 lists the ones still open.

**UI and UX follow `docs/spec-v2.md`** (D-039–D-045, revised by D-052–D-054): the user's design exploration, folded into
a copy of the spec, with mockups in `design/ui-exploration/`. The UI tasks (T1.18, T1.19,
T1.23) and Phase 2 (T2.1–T2.12) are written against it. The Instrument look is applied
(`src/ui/theme.css`, D-069): build each screen from its board with the theme's classes.

Status values:

- `todo`: ready once its dependencies are `done`.
- `in-progress`: handed off part-way. Read the task's **Handoff** note and continue.
- `blocked (Q#/U#)`: waiting on an answer or a user task.
- `user`: something only the user can do (hardware, phone, GitHub settings).
- `verify`: code is done, but the user needs to check it on the device. It doesn't block
  dependent tasks unless the task says so.
- `done`
- `dropped`: removed by a decision; the section stays for reference.

Picking a task: continue an `in-progress` one if there is one. Otherwise take the **Next task**
above. If that one is blocked, take the first `todo` in board order whose dependencies are all
`done` (a `verify` dependency counts as done).

## Milestones

| Milestone | Tasks | Outcome |
| --- | --- | --- |
| M0 Setup | T0.1–T0.3, U0.1 | Repo, docs, toolchain, CI, Pages deploy |
| M1 Raw capture on the phone | T1.1–T1.8, T1.24, U1.1 | The BLE path is proven on the phone, every packet recorded and exportable, Phase 0 answered, real fixtures captured |
| M2 Analysis engine | T1.9–T1.16, T1.22 | Post-hoc segmentation and metrics, versioned, re-runnable, tuned on real shots |
| M3 Dialing loop (MVP done) | T1.17–T1.21, T1.23, T1.25 | Live display, the shot phase and shot-complete screen, history with compare, Home and navigation, automatic export, the scale-mode check (spec v2) |
| Phase 2 | T2.1–T2.12 | Machine and baskets, grinders, recipes, packs, containers, tags, maintenance dates, phase routing, setup, the milk phase, the taste nudge |
| Phase 3 | T3.1–T3.5 | Audio, keep-alive, richer analysis, Capacitor, UI polish (the Instrument look) |

## Board

| ID | Task | Status | Depends |
| --- | --- | --- | --- |
| T0.1 | Bootstrap: spec, plan, agent manual, docs | done | — |
| T0.2 | Toolchain scaffold | done | T0.1 |
| T0.3 | CI and GitHub Pages workflow, SessionStart hook | done | T0.2 |
| U0.1 | USER: enable GitHub Pages, open the app in Bluefy | done | T0.3 |
| U0.2 | USER: Phase 0 with nRF Connect or LightBlue (optional, see U1.1) | user | — |
| T1.1 | Protocol codec | done | T0.2 |
| T1.2 | Core data model | done | T0.2 |
| T1.3 | Transport interface, shot simulator, mock transport | done | T1.1, T1.2 |
| T1.4 | Web Bluetooth transport | done | T1.3 |
| T1.5 | IndexedDB storage | done | T1.2 |
| T1.6 | Recorder service | done | T1.3, T1.5 |
| T1.7 | Export/import format v1 and manual export | done | T1.5 |
| T1.8 | Probe (diagnostics) screen | done | T1.4, T1.6, T1.7 |
| U1.1 | USER: hardware tests on the phone, capture fixtures | user (sessions 1–2 done) | T1.8 |
| T1.9 | Timebase reconstruction | done | T1.1, T1.3 |
| T1.10 | Signal toolkit | done | T0.2 |
| T1.11 | Stability, zero-tracking, shot windows | done | T1.9, T1.10 |
| T1.12 | Liquid markers and tail fit | done | T1.11 |
| T1.13 | Pump markers (`pump_on` / `pump_off`) | done | T1.11 |
| T1.14 | Metrics, analysis runner, derived cache | done | T1.12 |
| T1.15 | Analysis inspection CLI | done | T1.7, T1.14 |
| T1.16 | Tune analysis on real fixtures | done | T1.13, T1.15, T1.22, U1.1 (session 2) |
| T1.17 | Live pipeline (display only) | done | T1.1, T1.3 |
| T1.18 | Brew flow UI: the extraction and the shot card | verify | T1.6, T1.14, T1.17 |
| T1.19 | History, shot detail and compare | done | T1.14, T1.18 |
| T1.20 | Automatic export to a private GitHub repo | verify (U1.2) | T1.6, T1.7 |
| U1.2 | USER: set up automatic export (private data repo, token) | user | T1.20 |
| T1.21 | Reconnect without re-pairing | verify (U1.1: B3) | T1.4 |
| T1.22 | Simulator to the first hardware answers | done | T1.3, U1.1 (session 1) |
| T1.23 | Home screen and navigation | verify | T1.18, T1.19 |
| T1.24 | Probe: record the microphone's sound levels | verify (U1.1) | T1.6, T1.7, T1.8 |
| T1.25 | Scale mode check on connect | verify (M1–M5) | T1.4, T1.6 |
| T1.26 | pump_off for a shot that gushes at its first drip (session 3) | done | T1.16 |
| T1.27 | Session 4 as a fixture: the second brew, with sound | done | T1.24 |
| T2.1 | Entities: machine and baskets, grinders, recipes, packs, containers, tags, maintenance | done | T1.5, T1.7 |
| T2.2 | Coffee packs in the flow | verify (P8–P9) | T2.1, T1.18 |
| T2.3 | Grinder and setting in the flow | verify (P10) | T2.1, T1.18 |
| T2.4 | Containers: registration, recognition, conflicts | verify (K1–K6) | T2.1, T1.17 |
| T2.5 | Phase routing by container | verify (P1–P7) | T2.4 |
| T2.6 | Beans phase | verify (P1–P2, P8) | T2.5, T2.2 |
| T2.7 | Grind phase | verify (P3, P10) | T2.5 |
| T2.8 | Field configurator | dropped (D-053) | T1.18 |
| T2.9 | Setup screens | verify (S1–S8) | T2.1, T1.23 |
| T2.10 | Maintenance dates | verify (N1–N4) | T2.1, T2.9 |
| T2.11 | Milk phase | verify (P5, P11) | T2.1, T2.5 |
| T2.12 | The taste nudge | verify (P12) | T2.3, T2.6, T1.18 |
| T2.13 | Learning from the data | dropped for now (D-054) | — |
| T2.14 | The empty bean cup back keeps its beans (session 3) | verify (P13) | T2.5 |
| T2.15 | ✕ ends the brew and resets the scale (session 3) | verify (P14) | T1.18, T2.5 |
| T2.16 | Home opens the brew for a container put down (Q31) | verify (K2–K4) | T2.4, T2.5 |
| T2.17 | The scale mat: a container role, part of the platform (Q30) | verify (K7) | T2.4, T2.9 |
| T2.18 | Sound levels with every brew (Q32) | verify (P15) | T1.24, T1.18 |
| T2.19 | The app's own tares seen when their reading comes first (session 4) | verify (P16) | T1.17 |
| T2.20 | Tare at each phase's start, and wherever it helps (Q33) | verify (P17) | T2.5, T2.15 |
| T2.21 | The grind phase before its grounds (session 4) | verify (P18) | T2.7 |
| T2.22 | The grind tares its grounds away (session 5) | verify (P19) | T2.21 |
| T2.23 | The beans put straight back aren't grounds (session 6) | verify (P20) | T2.22 |
| T2.24 | The phases by the cups, no tap: beans → grind → extraction (the user's rule) | verify (P21) | T2.23 |
| T3.1 | Audio pump detection (the pump only, D-100) | todo | T1.24, U1.1 (B8) |
| T3.2 | Keep-alive via `0x25` | blocked (U1.1: A6) | T1.6 |
| T3.3 | Richer charts and history analysis | verify (F1–F3) | T1.19 |
| T3.4 | Capacitor wrapper | todo | T1.21 outcome |
| T3.5 | UI polish: design pass and accessibility | verify (V1–V2) | M3 |

## Open questions for the user

Agents: when you reach a task blocked on one of these, ask the user (AskUserQuestion). Then
record the answer here and in `docs/DECISIONS.md`.

| ID | Question | Blocks | Status |
| --- | --- | --- | --- |
| Q1 | Where should automatic exports go? Options: commit to a private GitHub repo with a fine-grained token (zero taps, and agents can read real recordings straight from it), Safari's Download into iCloud Drive or the share sheet after each session (a tap or two), something else | T1.20 | **answered 2026-10-04:** a private GitHub repo, for now, used only when configured on the device (D-027) |
| Q2 | The grind phase needs a dosing cup that fits the 8×8 cm platform (spec: "Grind phase limitation"). Do you have one, or will you? Without one, the grind phase is beans-in only and retention can't be measured | T2.7 | **answered 2026-10-04:** yes, usually the same cup as for the beans; the grind phase is optional (D-041) |
| Q3 | The spec's "phase routing" diagram (3 phases, 1 decision) didn't survive export (spec line 209). Can you re-share it, or confirm the text-only reading in T2.5? | T2.5 | **answered 2026-10-04:** spec v2 "Brew phases": Beans → Grind → Shot → Milk by container, Grind and Milk optional (D-041) |
| Q4 | Only if A2 shows that pump vibration doesn't reach the weight signal: `pump_on` can't then come from the scale. Use the manual-start (`07`) press as `pump_on` (with human latency), or leave pre-infusion `null` until audio (T3.1)? | T1.16 | **answered 2026-10-05:** A2 showed no vibration. `pump_on` is the Tare + start tap made at pump start, flagged as manual, until the microphone works (T3.1) (D-048) |
| Q5 | When should the app ask "like / dislike" for a bean bag? The spec says never on shot one. One idea: after the first shot graded "balanced" | T2.2 | **answered 2026-10-04:** optional "would buy again", offered when the bag is finished (last shot or by hand) or dialled in (D-042) |
| Q6 | Keep a per-shot "channelled" mark? The v2 screens drop it: "sour and bitter" on the taste triangle leads to a puck-prep pointer. Proposal: a default-off tag "Channelled" in the Notes group, and the format migration maps `channelled: true` to it | T1.18 | **answered 2026-10-04:** a tag "Channelled" in the Notes group, off by default; `channelled: true` migrates to it (D-045). Superseded 2026-10-05: channelling is its own field again (D-054) |
| Q7 | When should the chosen Instrument look be applied? Hard rule 9 keeps the UI plain until T3.5; applying the theme (tokens, fonts, both modes) before T1.18 avoids restyling every screen twice | T1.18, T3.5 | **answered 2026-10-04:** from the first UI task on: whichever UI task comes first applies the theme before anything else (D-045; hard rule 9 amended) |
| Q8 | The marker targets (D-035, D-036) were agreed on a simulated 0.01 g scale with the pump's vibration. The real scale reads 0.1 g, shows no vibration, and the analysis now lands within 0.12 s on the simulator brought to session 2. Which targets for the real scale: with headroom (about 1.5 times what's measured), tight at what's measured, or every marker within 0.2 s? | T1.16 | **answered 2026-10-05:** with headroom: first_drip and pump_off median 0.05 s, 90% 0.1 s, worst 0.15 s and 0.2 s, bias 0.05 s; yields 0.05 and 0.1 g, w(pump_off) 0.25 g, flow 2%; none for τ or pump_on (D-060) |
| Q9 | The scale's own timer around a shot. T1.17's plan has the auto-tare send `07` (tare and start timer) as the cup settles, so the scale's timer starts then, up to a minute before the pump (session 2's cup waited a minute). The Tare + start tap at the pump can't restart it: `07` starts only a timer stopped at 0 (D-037). Nothing stops it after the shot either, so the next tap can't restart it. The app shows its own time from the tap regardless. Options: (a) the auto-tare sends `01` (tare only), so the tap's `07` starts the scale's timer with the pump; the app also stops and resets it between shots (`05` at "shot done", `06` with the next cup's tare). That is what the user did by hand in session 2: Tare after placing shot B's vessel, Tare + start with the pump, stop and reset after the shot; (b) keep `07`, and the scale's timer runs from the cup; (c) send nothing at the cup: the display zeroes itself, and the scale shows the cup's weight until the tap | T1.18 | **answered 2026-10-05:** (a): a plain tare at the cup; the app stops the timer at "shot done" and resets it before the next tap (`scaleCommandsFor`, D-066) |
| Q10 | T1.18's target is dose × ratio, but nothing weighs the dose until the beans and grind phases (T2.6, T2.7) and baskets (T2.1). Where should the dose come from until then: a dose stepper on the extraction screen, or no target yet? | T1.18 | **answered 2026-10-05:** a dose stepper, ±0.1 g, last used kept as the default; the phases replace it later (D-067) |
| Q11 | Tags arrive before their Setup screen (T2.9). Which should the shot card offer, and which are on by default? | T1.18 | **answered 2026-10-05:** the design's list (WDT, Puck screen, RDT, Paper filter, Warm-up < 15 min, New basket, Experiment), WDT and Puck screen on by default; "Add" adds more (D-067) |
| Q12 | Until the Setup screens (T2.9), where should the Setup tab lead? Home replaces the probe at `#/`, so the probe needs a way in. Options: the probe, with the tab bar; a small Setup page with only what exists (data export, automatic export, the probe); no Setup tab until T2.9 | T1.23 | **answered 2026-10-05:** the probe, with the tab bar; T2.9 swaps in the Setup list and the probe becomes a row there (D-072) |
| Q13 | When the app warns that the scale isn't in its timer mode and the user then switches it on the scale, how should the warning clear? Options: the app checks again by itself (a `04` every 5 s while the warning stands and the scale is idle); a Check again button; only at the next connect, or the next Start whose timer starts | T1.25 | **answered 2026-10-05:** it checks again by itself, every 5 s while the scale is idle (D-073) |
| Q14 | D-057 counts a timer that starts with no command from the app as a sign of the automatic mode. Does the scale have a key that starts its timer by hand, which the user may press while connected? | T1.25 | **answered 2026-10-05:** yes, and the user may press it: a lone start doesn't warn; only the automatic mode's `03 0D` frames do (D-073) |
| Q15 | Setup has controls the boards don't draw: **Remove** in each editor (a basket while the machine has another, a grinder, a recipe, a pack, a container, a tag; it hides the item, and shots keep what they recorded), **Add grinder** (brand, model, type), and a grinder's brand and model editable in its card. Keep them, drop some, or change them? | T2.9 | **provisional (D-077):** built as described, until the user says otherwise |
| Q16 | Two containers within 3 g: the board's warning says "A wet tumbler may read as the jug" (the heavier one, wet, reading as the lighter). A wet container weighs more, so the app says it the other way round: "A wet Milk jug may read as Glass tumbler" (the lighter one, wet, reads as the heavier). Is that right, or did the board mean something else? | T2.9, T2.4 | **provisional (D-077):** the lighter one, wet |
| Q17 | Adding a coffee pack: no board draws an empty pack. Built: **Add pack** opens the pack's page as an empty form, stored with its own **Add pack** once it has a name and a roast date; the first pack becomes the one in use. OK? | T2.9 | **provisional (D-077):** as described |
| Q18 | Recipes: the board marks the last used one. Built: an open recipe has **Use next**, which makes it the one the next brew uses, as picking it on the brew screen does. Keep it? | T2.9 | **provisional (D-077):** kept |
| Q19 | The microphone page: the board shows the switch on, with calibration. Until the detector exists (T3.1), the switch and **Record** are shown disabled, with "Not ready yet: tap Start as the pump starts". Or hide the row until then? | T2.9, T3.1 | **provisional (D-077):** shown disabled |
| Q20 | Home's container row when the app isn't sure (no board draws it). Built: when two containers could be what is on the scale, "Which container is it?" with a chip for each, and the pick holds until it comes off; when none matches, "Not a known container · 110.0 g" linking to Setup › Containers. OK? | T2.4 | **provisional (D-078):** as described |
| Q21 | Hard rule 3 says live values are never stored, so the phases' weights (beans, grounds, milk) aren't saved from the live display: the app logs the phase flow in the recording, and the analysis measures the weights from it (they show on the card and in History, and come back if the analysis improves); the shot saves only whether each phase was done or skipped. The dose is the ground weight, else the beans, else the basket's size, so T1.18's dose stepper is gone (your Q10 answer said the phases would replace it). OK, or should the live weights be saved with the shot as well? | T2.5 | **provisional (D-079):** as described |
| Q22 | Where should the brew screen start? Built: on Beans when a bean cup is learned in Setup, else on Extraction as before. A container put down opens its phase either way | T2.5 | **provisional (D-079):** as described |
| Q23 | The dosing cup back from the grinder with the grounds opens the grind only after 8 s off the scale, and when it weighs the cup plus the beans less up to 2 g (retention) or plus up to 1 g; back sooner it is taken as beans poured back. Does that fit how you grind? | T2.5 | **provisional (D-079):** 8 s, −2 g to +1 g (P3 checks it) |
| Q24 | The beans phase's pack picker lists the open packs, then the unopened ones. Picking an unopened pack opens it today; the pack in use can be finished from the picker too (with "would buy again"). OK? | T2.2 | **provisional (D-080):** as described |
| Q25 | The jug's warning, "Close to Glass tumbler · Not the jug?": the board links "Not the jug?" to Setup › Containers. Built: it picks the other container for what is on the scale, in place, so the brew isn't left. OK? | T2.11 | **provisional (D-082):** picks in place |
| Q26 | How are a maintenance date's day and reminder set? The boards write "Reminder every 60 days" with no control. Built: a tap on the dates opens "Last done" (a date picker, for what you did before the app) and "Reminder", a stepper through 7, 14, 21, 30, 45, 60, 90, 120, 180 and 365 days, with Clear. OK, or other intervals? | T2.10 | **provisional (D-083):** as described |
| Q27 | When do reminders show? Built: on Home once due ("due today", then "N days overdue"); in Setup's Needs attention from 7 days before ("in 3 days"). A date never logged raises no reminder, even with an interval. OK? | T2.10 | **provisional (D-083):** as described |
| Q28 | The taste nudge looks at the newest shot with the same machine, grinder and pack: sour says grind finer, bitter coarser; balanced or ungraded says nothing, even if an earlier one was sour (the spec says "the last graded shot"; the nudge's "Last time" reads as the newest). No pack counts as the same no pack. Dismissed per shot, on this device. OK? | T2.12 | **provisional (D-084):** as described |
| Q29 | History's filter and trend have no board. Built: a Filter button beside Compare opens chip groups (coffee, days off roast, grinder with "Since care", tags, taste), and a filtered list gets a trend card above it: a figure (first drip, time, ratio, yield) against the grind, the days off roast or the day, dots in the taste's colours, a fitted line and what it says per step. Does it help you dial in, and what would you change? | T3.3 | **provisional (D-085):** as described; T3.5 revisits the design |
| Q30 | The silicone mat on the scale (15.5 g) is taken for a vessel when put on, so containers on it aren't recognised. Learn it as a container with a new role, add one mat weight under Machine, or treat anything light left on as part of the platform? | T2.17 | **answered 2026-10-06:** learn it as a container, with a new role "Scale accessory": part of the platform, no phase, no shot; export format 5 (D-088) |
| Q31 | On Home, should putting a known container down open the brew on its phase by itself, or keep the row that suggests it? | T2.16 | **answered 2026-10-06:** open the brew, for a container put down while Home shows (D-088) |
| Q32 | Should every brew record the microphone's sound levels by default? | T2.18 | **answered 2026-10-06:** yes, from the Connect tap on the brew screen, with an off switch in Setup › Microphone (D-088) |
| Q33 | Taring during the phases without getting in the way: the app tares each vessel as it settles (05, 06, 01, D-066), and there may be moments it should tare and doesn't. The user will test on the scale and report | T2.15, T2.20 | **answered 2026-10-06:** tare at the start of each phase when nothing is on the scale or it reads negative, and tare wherever it helps: the scale should show what the app shows (D-094) |
| Q34 | With the scale connecting by itself (T1.21) there is no Connect tap, so every brew's sound levels start at the brew screen's first tap other than Start and ✕ (a phase, a picker, the screen itself). Is that right, or should something else open the microphone, such as a Sound chip in the top bar? | T2.18 | **provisional (built):** the first tap but Start; the iPhone shows its microphone indicator from then (D-093) |

---

## Task details

### T0.1 — Bootstrap: spec, plan, agent manual, docs

**Status:** done

**Completed 2026-10-03:**

- `docs/spec.md` is a verbatim copy of the user's spec.
- This plan, plus `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`,
  `docs/protocol-notes.md`, `docs/hardware-tests.md` and `README.md`.
- Protocol research against the upstream BOOKOO docs and aiobookoo is in
  `docs/protocol-notes.md`. Read it before T1.1.

### T0.2 — Toolchain scaffold

**Status:** done · **Depends:** T0.1 · **Read:** `docs/ARCHITECTURE.md` (modules), D-001, D-009,
D-010, D-011

**Goal:** an app that builds, tests and lints before any feature work starts.

**Deliverables:**

- Vite 8 + Preact 10 + TypeScript ~6.0 (strict), set up like the official `preact-ts` template.
- Vitest (Node environment, `src/**/*.test.ts(x)`).
- ESLint flat config with typed rules for `src` and the D-010 boundary rules.
- Prettier for code only.
- `npm run check` = typecheck + lint + format check + tests.
- `base: './'`, and build info (commit, build time) injected via `define`.
- A placeholder home page showing build info and a browser-capability table: secure context,
  Web Bluetooth, `getDevices`, IndexedDB, `storage.persist`, Wake Lock, Web Share,
  `getUserMedia`, and the user agent. The table answers hardware test B1.
  - It checks only that `navigator.share` exists, not whether *files* can be shared. T1.7
    checks `navigator.canShare({ files })` at export time, and hardware test B7 settles it on
    the phone.

**Acceptance:**

- `npm run check` and `npm run build` pass.
- `dist/` works when served from a sub-path.
- A deliberate boundary violation, such as importing preact in `src/core`, fails lint.

**Completed 2026-10-03:**

- Vite 8.3, Preact 10.29, TypeScript 6.0 (strict, project references like the official
  template), Vitest 5 (Node environment), ESLint 10 with typescript-eslint 8 typed rules, and
  Prettier 3.9 (code only).
- The boundary rules were verified with throwaway violating files: preact in core, live →
  analysis, core → platform, `window` in core, and `navigator.bluetooth` outside transport all
  error.
- `dist/` was served from `/smart-scale/` and rendered in headless Chromium at phone width with
  no console errors.
- The home page is the capability table plus build info (`src/platform/`). It's the starting
  point for the probe UI.
- `src/core/` doesn't exist yet. The first core task creates it, and the lint rules already
  cover it.

### T0.3 — CI and GitHub Pages workflow, SessionStart hook

**Status:** done · **Depends:** T0.2

**Deliverables:**

- `.github/workflows/ci.yml`: `npm ci` + `npm run check` + `npm run build` on every push. On
  `main`, upload `dist/` and deploy to GitHub Pages.
- `.nvmrc` (Node 22).
- `.claude/settings.json` and a SessionStart hook that runs `npm ci` in cloud sessions, so a
  fresh agent can run tests straight away.

**Acceptance:** the workflow parses and its check job passes on GitHub. The deploy job succeeds
once Pages is enabled (U0.1).

**Completed 2026-10-03:**

- **CI triggers:** every push to any branch, plus manual dispatch. There's no separate
  `pull_request` trigger: checks attach to the commit, so PRs from same-repo branches show them
  anyway, and that avoids duplicate runs.
- **Deploy:** only from `main`. It needs `pages: write` and `id-token: write`, uses the
  `github-pages` environment, and runs in a never-cancelled `pages` concurrency group.
- **Actions pinned to current majors:** checkout@v7, setup-node@v7 (Node from `.nvmrc` = 22,
  npm cache), upload-pages-artifact@v5, deploy-pages@v5.
- **Schema check:** `@action-validator/cli` validates the workflow.
- **Hook:** `.claude/hooks/session-start.sh` runs only when `CLAUDE_CODE_REMOTE=true`. It runs
  `npm install` synchronously (the cached container makes later sessions quick) and sends npm's
  output to stderr, because SessionStart stdout lands in the agent's context. Only a one-line
  summary goes to stdout.
- **Hook validation:** run from a clean `node_modules/` (3 s); it's idempotent and leaves the
  lockfile unchanged.
- **Until the user enables Pages (U0.1),** the deploy job fails with "Not Found". That's
  expected and doesn't affect the check job.

### U0.1 — USER: enable GitHub Pages, open the app in Bluefy

**Status:** done · **Depends:** T0.3

1. On GitHub, go to the repo's **Settings → Pages → Build and deployment → Source** and choose
   **GitHub Actions**.
2. Under **Actions → "CI and Pages" → Run workflow**, run it on `main` (or just push anything).
3. Open <https://misch0n.github.io/smart-scale/> in Bluefy and screenshot the capability table
   (hardware test B1). Give it to an agent to record in `docs/hardware-tests.md`.

**Completed 2026-10-03:**

- Pages is live. The user's manual run #3 was the first successful deploy, and every push to
  `main` redeploys since.
- B1 is recorded in `docs/hardware-tests.md`: Bluefy and beacio both show all eight APIs as
  present, including `getDevices()` and `getUserMedia`. That's feature detection only. Whether
  they actually work is B3 and B5–B9, run with the probe in U1.1.
- The user would rather use beacio than Bluefy if it works (D-016). Part B runs in beacio first.
- B9 (same day): beacio isn't available from a home-screen icon, only in a Safari tab. Its
  storage is therefore a non-installed site's, which Safari can delete (D-016 update), and that
  makes automatic export (Q1, T1.20) more pressing.

### U0.2 — USER: Phase 0 with nRF Connect or LightBlue (optional)

**Status:** user

Work through `docs/hardware-tests.md` Part A. This is optional: U1.1 covers the same tests with
the in-app probe, which also records the data. A14 and A15 (advertisement and characteristic
properties) are easiest in nRF Connect, though.

### T1.1 — Protocol codec

**Status:** done · **Depends:** T0.2 · **Read:** spec "BLE protocol reference", "Parsing rules",
"Likely additional frame — 03 0D"; `docs/protocol-notes.md` (all of it); D-004, D-005, D-008

**Goal:** pure encode and decode for the BOOKOO protocol. This is the only module that knows
byte layouts.

**Deliverables (`src/core/protocol/`):**

- `uuids.ts`: service `0x0FFE`, characteristics `0xFF11` and `0xFF12`, as 16-bit numbers and
  128-bit strings.
- `checksum.ts`: `xorChecksum(bytes)` and `hasValidChecksum(frame)`.
- `commands.ts`: the whitelist (D-008):
  - `tare`, `setBuzzer(0–5)`, `setAutoOff(5–30)`;
  - `startTimer`, `stopTimer`, `resetTimer`, `tareAndStartTimer`;
  - `flowSmoothingOff`;
  - `keepAlive` (flagged unverified).

  Each is a typed `ScaleCommand { name, bytes }`. Range-check parameters. Do not export any
  generic sub-command encoder.
- `frames.ts`: `decodeFrame(bytes)` returns a discriminated union:
  - `weight` (`03 0B`), with every field: `timerMs`, `unitByte`, `unitOk`, `weightG`, raw
    integer and sign byte, `flowGps`, `batteryPct`, `standbyMin`, `buzzerGear`, `flowSmoothing`,
    `reserved`;
  - `event` (`03 0D`, tentative: Ultra layout);
  - `powder` (`03 0F`, tentative);
  - `unknown` (valid checksum, unknown type);
  - `invalid` (`length` or `checksum`).

  The decoder never throws.
- `encodeWeightFrame(fields)`, the inverse of decode. The simulator and tests use it.
- `hex.ts`: `toHex` and `fromHex`.
- `GRAM_UNIT_BYTES = [0x01]` (D-005).
- The sign-byte map: `0x2B` → +, `0x2D` → −. Any other value is flagged (`signKnown: false`).

**Acceptance:**

- Golden tests reproduce every pre-computed command in the spec and in protocol-notes, byte for
  byte.
- A test enumerates the whitelist and proves `0x09` and `0x15` can't be produced.
- Weight frames round-trip, including negative weight, a timer above 65.535 s (24-bit), flow
  above 2.55 g/s (16-bit) and 24-bit maximum values.
- A bad checksum or wrong length decodes as `invalid`. An unknown header with a good checksum
  decodes as `unknown`.

**Notes:**

- The spec's byte table is 1-based; `protocol-notes.md` has the 0-based offsets.
- Do not copy aiobookoo's decoder or command bytes: they have known bugs.
- Also export a small rolling checksum-failure counter helper. The recorder and the probe use it
  to alarm when most frames fail (protocol-notes, finding 6).

**Completed 2026-10-03:**

- `src/core/protocol/`, imported through its `index.ts` barrel:
  - `uuids.ts`: 16-bit and 128-bit UUIDs, plus `DEVICE_NAME_PREFIX` (`BOOKOO`) for T1.4's
    discovery filter.
  - `checksum.ts` and `hex.ts`. `toHex` defaults to upper case with spaces, like the docs;
    `toHex(bytes, '')` packs it.
  - `commands.ts`: one constructor per whitelisted command, `allWhitelistedCommands()` and
    `isWhitelistedCommand()`. A `ScaleCommand` is `{ name, param, bytes, unverified }` plus a
    type brand (D-015).
  - `frames.ts`: `decodeFrame()`, `hasTrustedWeight()` (D-014) and `encodeWeightFrame()`, which
    has idle defaults and throws `RangeError` instead of truncating.
  - `failure-counter.ts`: `RollingFailureCounter`. It alarms when more than 25 of the last 50
    frames failed. Feed it `decodeFrame(bytes).kind === 'invalid'`.
- Decode rules: a known header (`03 0B`, `0D`, `0F`) with the wrong length is `invalid`
  (`length`) even when its checksum is valid. Any other header with a valid checksum is
  `unknown`, including echoed `03 0A` commands and other product bytes. Values are never `-0`.
- Tests (133): golden command bytes from the spec and protocol-notes; golden weight, event and
  powder frames laid out by hand from the docs, so the decoder isn't only checked against its own
  encoder; round trips at the 16- and 24-bit limits; a seeded 20 000-frame fuzz; the whitelist
  enumeration; and a pinned export list. A mutation pass confirmed the tests catch each of these:
  a truncated u24 (aiobookoo's bug), a missing length check, an added `0x09`, unknown signs read
  as `+`, and skipping the byte comparison.
- For later tasks: transports call `isWhitelistedCommand()` before every write (now in T1.3 and
  T1.4). The event and powder layouts are the Ultra's, so treat them as tentative until real
  frames arrive (U1.1).

### T1.2 — Core data model

**Status:** done · **Depends:** T0.2 · **Read:** spec "Data model and storage", "Session
metadata and grading"; `docs/ARCHITECTURE.md` "Data model"; D-004, D-007

**Goal:** the types and constructors that storage, export, analysis and UI share.

**Deliverables (`src/core/model/`):**

- Ids: time-sortable (UUIDv7 or similar), generated with `crypto.getRandomValues`.
- `Recording`, `RawFrame`, `AppEvent` (a discriminated union: `connected`, `disconnected`,
  `command-sent`, `command-failed`, `ui-action`, `annotation`, `smoothing-confirmed`,
  `smoothing-not-confirmed`, `error`, `characteristic-properties`, … extensible) and `Shot`.
  `Shot` carries the complete schema, with Phase 2 references set to `null` (D-007).
- A per-recording sequence number shared by frames and events.
- Normalisers that fill `null` for missing fields. Tests prove every key is present after
  normalisation.
- Time conventions: `tMs` is milliseconds since recording start (a float); epoch values are
  ms; durations in seconds appear only in derived metrics.
- `Recording` stores the user agent, which the app layer passes in because core can't read
  `navigator`. Fixtures can come from beacio or Bluefy (D-016), and their notification timing
  may differ.

**Acceptance:** the types compile, the normalisers are tested, and `docs/ARCHITECTURE.md`
"Data model" matches the code. Confirm D-007, or refine it and update `DECISIONS.md`.

**Completed 2026-10-03:**

- `src/core/model/`, imported through its `index.ts` barrel:
  - `ids.ts`: `newId()`, `createIdGenerator()` (injectable clock and random source), `isId`,
    `idTimestampMs` and `shortId` (D-017).
  - `schema.ts`: the `field.*` parsers, `ObjectSchema<T>`, `SchemaError` and `JsonValue`
    (D-018). Reuse it for new record types (T2.1) and for import validation (T1.7).
  - `recording.ts`: `Recording`, `createRecording`, `endRecording` (it throws on a second end),
    `normaliseRecording` and `epochMsAt`.
  - `frame.ts`: `RawFrame`, `CharacteristicName`, `createRawFrame` (copies the bytes) and
    `normaliseRawFrame`.
  - `events.ts`: `AppEvent`, a union over `AppEventDataMap` with the ten types listed above;
    `createAppEvent`, `normaliseAppEvent`, `commandEventData(cmd, reason)`,
    `ANNOTATION_LABELS` and `APP_EVENT_TYPES`.
  - `sequence.ts`: `RecordingSequence` stamps a recording's frames and events from one
    contiguous counter.
  - `shot.ts`: `Shot`, `createShot`, `updateShot` (skips `undefined`, refuses the identity
    fields) and `normaliseShot`.
- D-007 is confirmed, and D-019 refines it: deleting a shot sets `discardedAtEpochMs`, so
  re-analysis doesn't recreate it; `tags` tells `[]` (none) from `null` (not captured);
  `beansWeighedG` is there from day one; `grindSetting` is `{ kind, value }`.
- Tests (177 new, 315 in all). `completeness.test.ts` covers every record type and each event
  type. A record with only its required fields normalises to every key, the rest `null`, and
  keeps them through JSON. A complete record normalises to itself in key order. Every required
  field is enforced, and unknown keys are dropped. The complete samples are typed as the
  interfaces, so a new field doesn't compile until its sample has it. A mutation pass (14
  mutants, such as a nullable field parsed as required, a non-monotonic id counter, a `seq` gap
  or uncopied frame bytes) was caught in full.
- For later tasks: notes added to T1.3, T1.5, T1.6, T1.7, T1.14, T1.19, T2.1 and T2.8.

### T1.3 — Transport interface, shot simulator, mock transport

**Status:** done · **Depends:** T1.1, T1.2 · **Read:** spec "Scope and platform" (transport
interface), "Out of scope" (GaggiMate: keep it narrow), "Shot segmentation and derived metrics"
(to make realistic shots)

**Goal:** the seam between BLE and the app, plus a way to develop and test with no hardware.

**Deliverables:**

- `src/transport/types.ts`: a narrow `ScaleTransport`:
  - `connect()` (Web Bluetooth requires a user gesture), `disconnect()`;
  - `send(cmd: ScaleCommand)` (queued);
  - `onNotification(cb({ source: 'ff11'|'ff12', bytes, tArrival }))`;
  - `onStatus(cb)`;
  - `kind`;
  - an injected clock for `tArrival`.

  Commands are whitelist values, never raw bytes from callers. Every implementation, the mock
  included, calls `isWhitelistedCommand()` right before writing and refuses to write anything
  that fails it (D-015).
- `src/core/sim/`: a deterministic simulator (seeded PRNG) of a scale session. Inputs:
  - a script of physical events: cup on/off, tare, pump on, first drip, pump off, cup removed,
    physical tare press;
  - shot parameters: dose, yield, pre-infusion, flow profile, tail τ.

  It models the scale: weight quantisation; noise; vibration σ while the pump runs (0 means
  "vibration doesn't survive"); sample rate with drift; and the timer field (zero until
  `07`/`04`, frozen after `05`). It models BLE: arrival jitter and bursts, plus optional corrupt
  and dropped frames. Output: encoded frames with arrival times, and **ground truth** (exact
  marker times, yields, τ).
- `src/transport/mock.ts`: a `MockTransport` that replays a simulated session in real or
  accelerated time and reacts to commands (`07` tares and starts the timer, `08` sets the
  smoothing byte, `01` tares).

**Acceptance:**

- The simulator is deterministic per seed.
- Ground truth is consistent with the frames it produces.
- Vibration σ visibly changes the rolling variance.
- MockTransport frames decode with T1.1, and its commands change the simulated state.

**Notes:** the simulator is the test bed for all of M2, so keep its parameters explicit and
documented. The mock is selectable in the UI (for example `#/probe?mock`) for development and
for Playwright checks. Take `CharacteristicName` and `TransportKind` from `src/core/model` for
`source` and `kind`.

**Completed 2026-10-03:**

- `src/transport/` (D-020):
  - `types.ts`: `ScaleTransport`, `ScaleNotification`, `ConnectionInfo` (device, both
    characteristics' GATT properties, `subscribed`), `TransportStatus` and `TransportError`
    with a `code`.
  - `command-queue.ts`: `CommandQueue`, which every transport writes through. It keeps one
    write in flight with a pause after each, and runs `isWhitelistedCommand()` and copies the
    bytes right before each write (D-015). `clear()` rejects what's queued, on disconnect.
  - `scheduler.ts`: `Scheduler`, `systemScheduler`, and `ManualClock` (virtual time for tests).
  - `emitter.ts`: the listener helper. A listener that throws doesn't stop the others.
  - `mock.ts`: `MockTransport({ scenario, speed, scheduler, connectDelayMs, writeSpacingMs,
    ff12Notify })`. It replays a simulated session on a virtual clock (session time 0 is the
    first connect) and writes commands into the simulated scale. Reconnecting rejoins the same
    world. `mock.simulator.truth()` has the ground truth.
- `src/core/sim/` (D-021; ARCHITECTURE "Simulator"): `Rng` (seeded, one stream per effect);
  `params.ts` (every scale and link parameter, documented, with provisional defaults);
  `shot.ts` (the analytic shot model); `script.ts` (cup on/off/back, shot, pump, bump, tare
  button, command, power-off); `weighing-platform.ts`; `link.ts`; `simulator.ts`
  (`ScaleSimulator` and the truth types); `session.ts` (`simulateSession`, `toRawRecording`,
  `espressoScenario`, `demoScenario`).
- `src/core/protocol`: `encodeEventFrame()` (`03 0D`), for the simulator's optional timer
  events.
- Tests (207 new, 522 in all). They cover determinism per seed and independence from how the
  simulator is stepped; every frame decoding to its truth; markers and yields where the frames
  show them; vibration raising the rolling variance more than tenfold in pre-infusion without
  moving the mean, and changing nothing at σ 0; each command's effect, both in the simulator and
  through `MockTransport`; and the D-015 refusal of a command mutated while queued. A mutation
  pass of 18 mutants was caught in full, after two added tests. The mutants included skipping
  the whitelist check, vibration always on, random draws tied to stepping, and a queued command
  surviving a disconnect.
- Gotcha: the lint rule that keeps `src/platform` out of core matches any import ending in
  `/platform`, hence the name `weighing-platform.ts`.
- For later tasks: notes added to T1.4, T1.6, T1.8, T1.9, T1.11–T1.13, T1.15–T1.17 and U1.1.

### T1.4 — Web Bluetooth transport

**Status:** done · **Depends:** T1.3 · **Read:** spec "Scope and platform", "BLE protocol
reference", "Parsing rules" (5), "Re-pairing — check early"; protocol-notes 2, 12, 13, 14

**Deliverables (`src/transport/web-bluetooth.ts`):**

- `requestDevice` with filters `[{ services: [0x0ffe] }, { namePrefix: 'BOOKOO' }]` and
  `optionalServices: [0x0ffe]`. Call it synchronously inside the click handler, with no `await`
  before it, or the user-gesture activation is lost.
- Connect GATT, then get the service, FF11 and FF12. Attach listeners **before**
  `startNotifications()`. Subscribe to FF12 only if it has the `notify` or `indicate` property.
  Report both characteristics' properties so the recorder can log them (hardware test A15).
- Copy the bytes out of the `DataView` immediately, because shims may reuse buffers.
- Write queue: one GATT operation in flight, about 100 ms spacing. Use
  `writeValueWithoutResponse` or `writeValueWithResponse` according to the characteristic's
  properties, falling back to `writeValue`. Re-check each command with `isWhitelistedCommand()`
  immediately before its GATT write (D-015), and test that a mutated command is refused.
- Discovery uses `SERVICE_UUID16` and `DEVICE_NAME_PREFIX` from `src/core/protocol`.
- `gattserverdisconnected` → a `disconnected` status with a reason. No reconnect loop here
  (that's T1.21).
- Feature-detect `navigator.bluetooth.getDevices()` and expose `reconnectKnownDevice()` when it
  is available (hardware test B3).
- Add `@types/web-bluetooth`.

**Acceptance:**

- Unit tests against a hand-written fake `navigator.bluetooth`: subscription order, byte
  copying, write serialisation and the disconnect path.
- This is the only file that touches `navigator.bluetooth` (lint).
- Status becomes `verify` until the user connects from the phone: beacio first, Bluefy as the
  fallback (U1.1, B2; D-016).

**Notes:** connect-time policy (smoothing off, its confirmation) belongs to the recorder
(T1.6), not here. The transport stays dumb.

From T1.3: implement `ScaleTransport` (`src/transport/types.ts`) and keep its contract
(D-020). Report `connected`, with `ConnectionInfo`, before calling `startNotifications()`, and
write through `CommandQueue` with about 100 ms spacing, since that's where the D-015 check
lives. `command-queue.test.ts` shows the mutated-command test. Take a `Scheduler`
(`systemScheduler` by default) so tests can run on `ManualClock`. Add `reconnectKnownDevice()`
to the interface as an optional member, and to `MockTransport`.

**Completed 2026-10-03:**

- `src/transport/web-bluetooth.ts`: `WebBluetoothTransport({ bluetooth?, scheduler?,
  writeSpacingMs? })`. `bluetooth` defaults to `navigator.bluetooth`, read when needed. D-022
  has the choices:
  - canonical 128-bit UUID strings, and filters for service 0FFE or a name starting `BOOKOO`;
  - order: `requestDevice()` synchronously inside `connect()`, GATT connect, the
    `gattserverdisconnected` listener, service, FF11, FF12, notification listeners,
    `connected`, `startNotifications()` on FF11 and then on FF12 (only if it reports `notify`
    or `indicate`), and only then does `connect()` resolve;
  - any failed subscription, FF12's included, fails the connect: the status goes `connected` →
    `disconnected` with reason `error`;
  - writes go with response when FF12 reports `write`, else without, else `writeValue`. A
    command sent before the subscriptions finish waits for them, and a write in flight rejects
    as `disconnected` when the link ends;
  - error messages name the step, like `Getting service 0FFE: NotFoundError: …`;
  - `reconnectKnownDevice` is a getter, present when `getDevices` exists. It takes this
    transport's last device id, else the first `BOOKOO…` name, and its error lists what
    `getDevices()` returned.
- `ScaleTransport.reconnectKnownDevice?` is an optional member. `MockTransport` has it, and it
  is just `connect()` there.
- `Emitter` delivers a value emitted inside a listener after the current one, so every listener
  sees statuses in order (D-020 update).
- `src/transport/fake-web-bluetooth.ts` is the test fake. It logs every call, can hold or fail
  any step, reuses one buffer for every notification, reports properties as prototype getters,
  and fires `gattserverdisconnected` synchronously from `gatt.disconnect()`.
- Lint: only `web-bluetooth.ts` may touch `navigator.bluetooth` now, not all of
  `src/transport`, and the `window.navigator.bluetooth` form is caught too. `@types/web-bluetooth`
  is a dev dependency, listed in `tsconfig.app.json` `types`.
- Tests: 57 new (579 in all), against the fake. A mutation pass of 34 mutants caught 33,
  among them `connected` after subscribing, no byte copy, a spread of the properties, an
  `await` before the chooser, and a write left hanging after a disconnect. The survivor is
  equivalent: `send()` checks both the status and the queue, which always agree.
- Not run against hardware: nothing in the UI uses it yet. T1.8 adds the probe's Connect
  button, and U1.1 checks it in beacio, then Bluefy (B2, B3, A14, A15).

**Verified 2026-10-04 (U1.1 session 1, D-037):**

- B2: it connected on the iPhone, with Safari's user agent (so presumably beacio), and streamed
  338 s without a break. Nothing was lost, though seven microphone tries each held the
  notifications back for 0.5–0.7 s.
- A15: FF11 and FF12 are both read, write and notify. A14: the scale is `BOOKOO_SC 109813`.
- B3 (reconnect) wasn't tried. It is T1.21's check.

### T1.5 — IndexedDB storage

**Status:** done · **Depends:** T1.2 · **Read:** spec "Data model and storage" (all);
`docs/ARCHITECTURE.md` "Storage"; D-004

**Deliverables (`src/storage/`, using `idb`):**

- A versioned schema with an upgrade path. Stores: `recordings`, `frameChunks`, `events`,
  `shots`, `derived` and `kv`.
- Repositories:
  - recordings: create, end, get, list;
  - raw: append frames (chunked) and events, and read a recording's raw data in `seq` order.
    No update or delete API;
  - shots: CRUD, since metadata is mutable;
  - derived: put, get, clear-all;
  - kv: get and set.
- A write batcher for the recorder: flush about every second or 20 frames, `flush()` on demand,
  and no lost frames when a chunk fills mid-batch.
- `requestPersistence()`: `navigator.storage.persist()` plus `estimate()`, with the result
  available to the UI.

**Acceptance:**

- `fake-indexeddb` tests cover append and read order across chunk boundaries, upgrade from an
  empty DB, and listing open (unclean) recordings.
- At the type level, raw records can't be updated.

**Notes:**

- `idb` transactions auto-commit as soon as you await something that isn't IDB. Never await
  other promises inside a transaction.
- `Uint8Array` is structured-cloneable, so store bytes directly in IDB. Hex is only for export.
- Run every record read from IDB through the model's normalisers (`normaliseRecording` and the
  rest; D-018), so old records gain new fields as `null`.
- Frames and events carry a contiguous per-recording `seq` (`RecordingSequence`), so the
  read-order tests can also check for gaps.

**Completed 2026-10-03:**

- `src/storage/`: `openStorage({ name?, framesPerChunk?, onBlocked? })` returns `AppStorage`
  with `recordings`, `raw`, `shots`, `derived`, `kv` and `close()`. D-023 has the choices:
  - schema version 1, built by `MIGRATIONS` in `db.ts`; the stores and keys are in
    ARCHITECTURE "Storage";
  - raw is add-only three ways: no update or delete method (a type-level test pins the method
    sets), IndexedDB `add`, and an append check (the recording is stored, and every new `seq`
    comes after everything stored for it, frames and events alike; gaps are allowed, repeats
    refused). One transaction per append;
  - one frame chunk per append, at most 256 frames, never rewritten. The plan's
    fixed-capacity chunks would have meant rewriting stored raw on every flush;
  - store values are typed `unknown`, so every read goes through a normaliser; writes
    normalise too;
  - one shared `Connection`, which opens again after the browser closes it (a `close` event,
    `InvalidStateError`, `UnknownError`) and closes itself on `versionchange`. A database a
    newer build upgraded gives `newer-version`;
  - `StorageError` with a `code` for IndexedDB failures. Programming errors pass through.
- `RecordingWriter(storage, recording, { maxDelayMs, maxRecords, timers, onError })` is the
  batcher. It creates the recording with its first write, at once, then writes about every
  second or every 20 records. `flush()` writes everything now. A failed write keeps its records
  in order, and the timer retries them about once a second. It exposes `pendingCount`,
  `writtenCount`, `lastError` and `whenIdle()`.
- `requestPersistence(manager?)` returns `{ supported, persisted, usageBytes, quotaBytes,
  error }` and never throws.
- Dependencies: `idb` 8 (runtime, about 3 kB gzipped) and `fake-indexeddb` 6 (dev).
  `src/storage/fake-idb.ts` holds the test helpers: `freshIndexedDB()`, `closeAsBrowser()` and
  `openDirect()`.
- Tests: 99 new (678 in all). They cover an upgrade from an empty database and from version 1
  to a test version 2, read order across chunk boundaries, gaps and repeats, atomicity,
  `listOpen`, the type-level append-only checks, the writer's timing, failures, retries and
  order, and the healing connection. A simulated espresso session with 22 damaged frames goes
  through the writer and reads back identical. A mutation pass killed 50 of 51 mutants. The
  survivor, `put` for `add` on events, can't change behaviour behind the order check.
- Nothing in the app imports storage yet, so the bundle is unchanged. T1.6 and T1.8 wire it in.

### T1.6 — Recorder service

**Status:** done · **Depends:** T1.3, T1.5 · **Read:** spec "Data model and storage" ("record
every packet from connect to disconnect"), "Parsing rules" (4, 5), "Manual start" ("log both")

**Deliverables (`src/app/recorder.ts`, framework-free and observable):**

- On connect:
  - create a `Recording` (device, transport kind, app commit and build time);
  - log the `connected` event and the characteristic properties;
  - send `flowSmoothingOff`, then watch decoded frames for smoothing byte `0`;
  - log `smoothing-confirmed`, or after about 2 s retry once and log `smoothing-not-confirmed`
    (a visible warning, because the tail fit depends on smoothing being off).
- Every notification is appended verbatim with `seq`, arrival `tMs` and source. Nothing is
  filtered.
- `sendCommand(cmd, reason)` logs `command-sent` or `command-failed`. `logUiAction(name, data)`
  and `annotate(label)` record onto the same timeline.
- Live stats for the UI: frames/s, the checksum-failure alarm (more than half of the last 50
  frames failed: `RollingFailureCounter` from `src/core/protocol`), the latest decoded weight
  frame, `unitOk`, and smoothing state.
- On disconnect: flush, then end the recording with a reason. At startup, any recording with no
  end time is ended as `unclean` at its last frame time.

**Acceptance:** integration tests with MockTransport and `fake-indexeddb`:

- a simulated session is stored completely, including corrupt frames (count in = count stored);
- frames and events interleave in `seq` order;
- the smoothing confirmation and its retry work;
- unclean recovery works.

**Notes:** build every record with `src/core/model`:

- `createRecording`, passing `navigator.userAgent`;
- `RecordingSequence` for every frame and event, so they share one `seq`;
- `commandEventData(cmd, reason)` for command events;
- `endRecording`, which throws on a second end, so make the disconnect path idempotent.

The event types are in `AppEventDataMap`. Add one there if the recorder needs a new kind
(D-018).

From T1.3: test against `MockTransport` on a `ManualClock`; `mock.test.ts` shows the pattern
(`connect()`, `clock.advance(300)`, then `await`). The recording starts at `transport.now()`
when the status turns `connected`, so `tMs = tArrival − start`. Stamp app events with
`transport.now()` too. `ConnectionInfo.properties` feeds the `characteristic-properties` events.
`demoScenario()`, or `scale: { initialSmoothing: true }`, starts with smoothing on, and
`mock.simulator.truth().commands` lists what the scale received. `ManualClock.advance()` is
synchronous, so await between advances where IndexedDB promises chain.

From T1.4: `connected` comes before notifications start, and a command sent on `connected` waits
for them, so sending `flowSmoothingOff` from the status listener is fine. If a subscription then
fails, the status goes `connected` → `disconnected` (reason `error`, a message naming the step),
the command rejects as `disconnected`, and `connect()` rejects even though `connected` was
reported. End the recording with that reason. Don't take a rejected `connect()` to mean that no
recording was started.

From T1.5:

- Write through `RecordingWriter` (`src/storage`). Make one on `connected`, then
  `appendFrame(sequence.frame(…))` and `appendEvent(sequence.event(…))`. It creates the
  recording itself, at once, so don't call `recordings.create`. In tests, pass the transport's
  `ManualClock` as `timers`. A write starts on a microtask, so records appended in the same
  tick go into it.
- On disconnect, `await writer.flush()`, then `storage.recordings.end(id, epochMs, reason)`. A
  second `end` throws `StorageError` with code `already-ended`. Flush on `visibilitychange`
  (hidden) and `pagehide` too.
- `onError` reports each failed write. The records stay queued (`pendingCount`) and are
  retried. Log an `error` event (context `storage`) and show a warning, but drop nothing.
- Unclean recovery: `storage.recordings.listOpen()`, then `storage.raw.last(id)` for the last
  frame and event, then `end(id, startedAtEpochMs + tMs, 'unclean')`. **Trap:** another tab may
  be recording one of those open recordings right now, and ending it would mark a live
  recording `unclean`. One way out: hold a Web Lock (`navigator.locks.request`) named after the
  recording while recording, and skip open recordings whose lock is held. Decide, and record
  the choice in `docs/DECISIONS.md`.

**Completed 2026-10-03:**

- `src/app/recorder.ts`: `new Recorder({ transport, storage, app, userAgent, epochNow?, timers?,
  locks?, page?, writer? })`. D-024 has the choices, ARCHITECTURE "Recorder" the shape:
  - `connected` starts a recording: stored at once, with its Web Lock held, then `connected`
    and both `characteristic-properties` events, then `flowSmoothingOff`. The first weight
    frame with smoothing byte 0 logs `smoothing-confirmed`. Without one, a retry 2 s after the
    write settled, then `smoothing-not-confirmed` 2 s later, shown as a warning;
  - every notification is stored verbatim with `seq`, `tMs = tArrival − start` and its source;
  - `sendCommand(cmd, reason)` logs `command-sent` when the write completes, or
    `command-failed`. `logUiAction(action, detail)` and `annotate(label, text)` return the
    event, or null when nothing is recording;
  - `disconnected` logs the last event, stores every record (retrying until it can), ends the
    recording with the transport's reason at `startedAtEpochMs + tMs`, then releases the lock;
  - a failing storage gets one `error` event per run of failures and a `storage-failing`
    warning, and loses nothing. A hidden page flushes every writer;
  - observable: `state` (`recording`; `stats` with frames, frames/s, FF11 decode failures and
    the alarm, the latest weight frame, `unitOk`, smoothing; `unsaved`, `finishing`,
    `storageError`, `warnings`), `onChange` (after every change, and every second while
    recording), `onFrame` (each frame with its decoding, bytes copied) and `onEvent`, plus
    `flush()` and `whenIdle()`.
- `src/app/recovery.ts`: `recoverUncleanRecordings(storage, { locks?, epochNow? })` returns
  `{ ended, skipped, failed }`. It ends an open recording as `unclean` at its last stored
  record only if it can take that recording's Web Lock; without Web Locks, only if the
  recording stored nothing in the last minute. It appends nothing.
- Helpers: `recording-locks.ts` (the lock name, `holdRecordingLock`, `ifRecordingLockFree`,
  `systemLocks()`), `page-lifecycle.ts` (`browserPageLifecycle`), and `fake-locks.ts`, a Web
  Locks fake for tests (Node has none).
- Tests: 62 new (740 in all), with MockTransport, the Web Bluetooth fake, a hand-driven
  transport, fake-indexeddb and `FakeLocks`. They cover a damaged espresso session stored frame
  for frame (count in = count stored), seq and tMs order, every smoothing path, when commands
  are logged, the end reasons (`user`, `device`, and `error` after `connected`), storage
  failures and retries, a hidden page, the live stats, and recovery with and without locks. A
  mutation pass killed all 9 mutants tried, once a test for FF12 frames was added.
- Nothing in the UI uses it yet; T1.8 wires it in, so the bundle is unchanged.

### T1.7 — Export/import format v1 and manual export

**Status:** done · **Depends:** T1.5 · **Read:** spec "Storage and export", "Schema rules";
`docs/ARCHITECTURE.md` "Export format"

**Deliverables:**

- `docs/export-format.md`: the normative v1 format. It covers `format` and `formatVersion`,
  app info, recordings, frames as compact rows (`[seq, tMs, source, hex]`), events, shots, the
  entities those shots reference, and settings.
- `src/core/export/`: serialise, parse and validate (version, required keys, hex sanity), plus
  a migration hook for future versions.
- `src/app/export.ts`:
  - export one recording or everything;
  - import a file as an idempotent merge: existing raw ids are skipped, and existing metadata is
    kept unless the user says otherwise.
- Manual export in the UI: download via a `Blob` and `<a download>`. Offer the share sheet when
  `navigator.canShare({ files })` is true. File names look like
  `smart-scale_YYYY-MM-DD_HHMMSS_<id8>.json`.

**Acceptance:**

- Round-trip tests: raw bytes come back identical, and every metadata key is present, including
  nulls.
- A newer, unknown `formatVersion` gives a clear error.
- Size sanity: 3 minutes at 10 Hz comes out under about 150 KB.

**Notes:**

- Automatic export is T1.20 (Q1). Derived data is left out by default.
- Validate each record with the model's normalisers (D-018). Everything is JSON-native except
  frame bytes. Discarded shots (`discardedAtEpochMs`) are exported too.
- The `<id8>` in file names is `shortId(id)`, the id's last 8 digits. Its first 8 are timestamp
  bits (D-017).

From T1.5: `storage.raw.read(id)` returns `{ recording, frames, events }`, each list in `seq`
order, the same shape as the simulator's `RawSession`. `storage.shots.listForRecording(id)`
gives the shots. To import, `recordings.create` takes an ended recording and refuses an existing
id with code `exists`, which is the "skip existing raw" check. Then `raw.append` stores the
frames and events (it chunks them itself, and one call is one transaction). `create` and
`append` are separate transactions, so an import that fails between them leaves an empty
recording. If that matters, add a combined write to `src/storage/raw.ts`. Keeping or overwriting
existing shot metadata needs a replace method on `ShotRepository`, which doesn't exist yet.

**Completed 2026-10-04:**

- `docs/export-format.md` is the normative format, and D-025 has the choices. A file is
  `{ format: "smart-scale-export", formatVersion: 1, exportedAtEpochMs, app, recordings, shots,
  settings }`. Each recording entry is `{ recording, frames, events }` without repeating the
  recording id, frames are `[seq, tMs, source, hex]` rows, and shots and settings are top-level
  metadata. One record per line with one-space indents: about 80 bytes a frame, so three minutes
  at 10 Hz is about 145 KB. No entities until a later format version (T2.1), and no derived data.
- `src/core/export/`: `serialiseExport(bundle)`; `parseExport(text)`, which refuses non-JSON,
  non-exports and newer versions (`ExportFormatError` with a code, and a message that says to
  reload), validates every record with the model's normalisers plus seq order and unique ids,
  naming the place (`recordings[0].frames[12][3]`), and upgrades older versions through
  `EXPORT_MIGRATIONS` (`FORMAT_VERSION` is their count plus one); and
  `recordingExportFileName` / `allExportFileName`. `test-samples.ts` is a bundle for tests with
  every event type, damaged and FF12 frames, an open recording and full and empty shots.
- `src/app/export.ts`: `exportRecording(storage, id, { app })` (the recording and its shots),
  `exportAll(storage, { app })` (everything, with the settings), and
  `importBundle(storage, bundle, { metadata: 'keep' | 'replace' })`, which returns a report.
  Import never replaces raw: a stored recording is skipped, and the report counts records the
  file has past the stored copy's end. A recording open in the file is stored ended as
  `unclean`. Stored shots and settings are kept unless `replace`; a shot with another identity
  is a conflict, left alone. `src/app/storage.ts` re-exports `openStorage` for the UI.
- Storage: `raw.addRecording` stores a whole recording in one transaction, so a failed import
  leaves nothing behind; `shots.replace` (refuses another identity); `kv.entries`. Model:
  `normaliseAppInfo`, `sameShotIdentity`. Recovery exports `uncleanEndEpochMs`.
- UI: the home page opens storage and shows `ExportPanel`: the recordings, Export per
  recording and Export all, which prepare the file, then Download (an `<a download>` blob link)
  and Share… where `navigator.canShare({ files })` says yes (`src/platform/share.ts`); Import from
  a file input, with a "replace" checkbox, and its report.
- Tests: 89 new (829 in all), covering the acceptance criteria: raw bytes come back identical,
  every key comes back, nulls included, a newer version gives a clear error, and three minutes
  at 10 Hz is under 150 KB. A mutation pass killed all 19 mutants tried. Playwright on the
  production build in Chromium: imported a simulated export, exported one recording and all,
  downloaded, shared (stubbed share sheet), re-imported with nothing changed, had a newer
  version refused, reloaded, and found no sideways scroll at 390 px.
- Known limitation (D-025): a recording first imported from a snapshot taken while recording
  can't later be completed from a longer copy. The import reports how many records it skipped.

### T1.8 — Probe (diagnostics) screen

**Status:** done · **Depends:** T1.4, T1.6, T1.7 · **Read:** `docs/hardware-tests.md` (the probe
must make every test there doable), spec "Unknowns to test before building", "Re-pairing —
check early"; D-012

**Verified 2026-10-05 (T1.16, D-064):** the user ran the probe on the phone in hardware sessions
1 and 2: it connected (B2), streamed for 338 and 613 s without a break, sent every timer and tare
command, tried the microphone, and exported both fixtures. Not yet exercised on the phone: the
annotation buttons, Reconnect known device (B3), and the platform checks B4–B6.

**Goal:** the first useful deploy. It connects from the phone (beacio first, Bluefy as the
fallback; D-016), shows and records everything, runs Phase 0, and exports fixtures. It's
rudimentary UI on the `#/probe` route, which is the default route until T1.18.

**Deliverables:**

- Connect and disconnect, plus "Reconnect known device" when `getDevices` exists.
- Status: device name, recording id, frames/s, ms-field delta stats, checksum failures, unit
  byte, and smoothing state (confirmed or not).
- Parsed live values (weight, reported flow, timer, battery, standby) and the last 20 raw hex
  frames for each characteristic. Highlight anything that arrives on FF12.
- Weight mean and σ over 0.5 s and 2 s windows, for hardware test A2. This is display-only code
  in `src/core/live` or the UI, never in analysis.
- Command buttons, each press logged:
  - tare `01`, start `04`, stop `05`, reset `06`, tare+start `07`;
  - smoothing off `08`;
  - keep-alive `25` (labelled unverified);
  - buzzer mute `02`.
- Annotation buttons: pump on, pump off, cup on, cup off, and a free-text note.
- A "Try microphone" button for B8: call `getUserMedia({ audio: true })`, show and log the
  outcome (granted, denied or error), then stop the stream. B1 showed the API is present.
- A recordings list with per-recording export and "export all".
- The capability panel, the storage persistence result, and a Screen Wake Lock held while
  connected (with its status shown).
- The mock transport via `#/probe?mock`.

**Acceptance:** works end-to-end with MockTransport in desktop Chromium (verify it with
Playwright). Status becomes `verify` until the user runs it on the phone (U1.1).

**Notes:** from T1.3, `new MockTransport({ speed })` replays `demoScenario()` by default: two
shots, a stray tare-button press in the second tail, smoothing on at the start, and `03 0D` timer
events on FF12 when the timer starts or stops, so the FF12 highlight has something to show.

From T1.4: use `new WebBluetoothTransport()`. Call `transport.connect()` directly in the click
handler, with no `await` or other asynchronous work before it, because the chooser needs the
click's user activation. Show the `disconnected` message, which names the failing step. Show
"Reconnect known device" only when `transport.reconnectKnownDevice` is defined; it needs no
gesture. Show `ConnectionInfo.subscribed` and both characteristics' properties (A15). Offer
Disconnect while connecting too: it cancels, and in the iOS shims a reconnect may wait until the
scale is switched on. `fake-web-bluetooth.ts` is for unit tests only; Playwright uses the mock.

From T1.5: call `requestPersistence()` at startup and show its status (B6). `openStorage()` can
fail with code `unavailable` or `newer-version` (show it: the second means reload), and its
`onBlocked` option fires when another tab holds an older version open (ask the user to close
it). `storage.recordings.list()` feeds the recordings list.

From T1.6 (D-024):

- Make one `Recorder` per transport at app level, right after the transport and before the
  first connect, and keep it: it can't be detached, and two on one transport record everything
  twice. Screens subscribe (`onChange`, `onFrame`, `onEvent`) and unsubscribe. The mock and Web
  Bluetooth each need their own transport and recorder. Pass `app: BUILD_INFO` and
  `userAgent: navigator.userAgent`.
- At startup, after `openStorage()`, run `recoverUncleanRecordings(storage)` and show what it
  ended or failed to end.
- The status panel reads `recorder.state`: `stats.framesPerSecond`, `stats.failedFrames`,
  `recentFailures` and `failureAlarm`, `stats.lastWeight.frame` (unit byte) and `unitOk`,
  `stats.smoothing` (`status`, `attempts`, `byte`), and `warnings`, with `storageError` as the
  text for `storage-failing`. `unsaved` and `finishing` say whether everything is stored yet.
- Command buttons call `recorder.sendCommand(cmd, 'probe')`, which logs them; catch the
  rejection. Annotation buttons call `recorder.annotate(label, text)`, other presses
  `recorder.logUiAction(name)`.
- The last 20 hex frames per characteristic and the ms-field delta stats come from `onFrame`
  (`frame.source`, `frame.bytes`, `frame.tMs`, `decoded`).
- `await recorder.flush()` before exporting a recording that is still in progress.
- Consider a "Web Locks" row in the capability panel: unclean recovery is exact only with them.

From T1.7 (D-025):

- The export panel (`src/ui/ExportPanel.tsx`, given an `AppStorage`) lists the recordings with
  Export, Export all, Download, Share… and Import. It is on the home page for now; move it to
  the probe, and have it refresh its list when a recording starts or ends. Its Export doesn't
  flush a recorder: flush first for a recording in progress.
- `App.tsx`'s `useStorage` opens storage. Replace it with the startup wiring: open, then
  `requestPersistence()` and `recoverUncleanRecordings()`. The UI reaches storage through
  `src/app/storage.ts`.
- An export made while recording holds the recording open (`endedAtEpochMs: null`). Imported
  elsewhere, it is ended as `unclean` at its last record.

**Completed 2026-10-04** (D-028):

- **Startup** (`src/app/startup.ts`, `startApp`): opens storage, then runs `requestPersistence()`
  and `recoverUncleanRecordings()` together, then makes the links and the screen wake lock.
  - If recovery can't list the open recordings, startup goes on and the probe shows why.
  - `App.tsx` shows the startup state: waiting for another tab (`onBlocked`), "reload" for
    `newer-version`, and storage that isn't available.
- **Links** (`src/app/links.ts`, `ScaleLinks`): one transport, recorder and `ProbeMonitor` per
  kind of transport (Web Bluetooth, and the mock at each speed), each made on first use and kept.
  - The wake lock is wanted while any link is connecting or connected.
  - The page being hidden and shown again goes on the recording in progress as the `ui-action`s
    `page-hidden` and `page-visible` (B4). They are logged before the recorder's hidden flush, so
    that flush stores them.
  - `onRecordingsChanged` fires once a new recording is stored and once an ended one is ended.
    `flush()` flushes every recorder.
- **Display-only statistics** in `src/core/live`, the module's first code (CLAUDE.md hard
  rule 3):
  - `ProbeMonitor`: the last 20 frames per characteristic as hex, counts, the timer's gaps
    (A1), FF11 arrival gaps, the longest silence (B4), the weight's mean and σ over 0.5, 2 and
    10 s (A2, A11), the smallest weight step (A11), the byte values seen (A9, A10, A13), the
    last `03 0D` frame and the last 30 events.
  - `TimeWindow`, `RecentValues` and `summarise`, which it builds on.
- **Platform:**
  - `ScreenWakeLock`, which asks again when the page is visible again. Safari grants the lock
    only during a tap, so Connect asks for it right after `connect()`, and a failed request
    offers a "Keep screen on" button.
  - `tryMicrophone` (B8).
  - A Web Locks row in the capability table.
- **UI:**
  - Every hash shows the probe for now (`src/ui/route.ts`). `?mock` uses the simulator, and
    `&speed=N` runs it N times faster.
  - `src/ui/probe/ProbeScreen.tsx` shows, top to bottom:
    - the connection: Connect, Reconnect known device where the runtime has it, Disconnect
      (also while connecting), the failing step, the device, the subscribed characteristics and
      both characteristics' properties, and the wake lock;
    - warnings, and the latest weight frame's values and bytes;
    - commands, each with its bytes (keep-alive labelled unverified; a buzzer level picker that
      defaults to mute), annotations and notes;
    - recording status, weight statistics, FF12 frames (highlighted), FF11 frames and events;
    - the microphone, the recordings panel and the environment (capabilities, persistence,
      recovery, build).
  - The recordings panel moved from the home page. It flushes the recorders before exporting,
    and reloads its list when a recording starts or ends.
  - The screen redraws at most about 7 times a second.
- **Tests:** 82 new (911 in all). A mutation pass killed every mutant of 23 that wasn't
  equivalent.
- **Playwright:** `npm run e2e` runs `scripts/e2e-probe.mjs`, 36 checks. It drives the
  production build, served under `/smart-scale/` at phone width, in headless Chromium with the
  mock. It covers: connect, smoothing confirmed, the wake lock, tare+start with an FF12 event
  frame, the annotations, commands, the microphone, export while recording (flushed),
  disconnect, export all, unclean recovery after a reload, page visibility events, import into
  a fresh profile, a denied wake lock, and no page errors. It needs the agent environment's
  global Playwright, so CI doesn't run it.
- **Known limits:**
  - The probe can't answer A14's "is 0FFE advertised?": Web Bluetooth doesn't say which filter
    matched. nRF Connect can.
  - The simulator ships in the bundle (about 8 of 40 kB gzipped), so `?mock` works on the
    deployed site.

### U1.1 — USER: hardware tests on the phone, capture fixtures

**Status:** user · **Depends:** T1.8

Do this whenever you're at the scale. The other tasks continue meanwhile (D-029), and each one
that needs a device check ends as `verify`. This session checks them all: the board's `verify`
rows are the list.

Run `docs/hardware-tests.md` Part B (in beacio first, repeating anything that fails in Bluefy;
D-016), Part A (unless already done with nRF Connect) and the Part C captures. Upload the
exported recordings to an agent session. Once automatic export is set up (T1.20, U1.2), you can
skip the upload: add the data repo to the agent's session instead. The agent then:

- adds them to `fixtures/real/` with a README;
- records the answers in `docs/hardware-tests.md` and in spec v2's unknowns table
  (`docs/spec-v2.md`; `docs/spec.md` stays verbatim);
- brings the simulator's assumptions (D-021) in line with the answers;
- updates this board, unblocking T1.13, T1.16, T1.21, T3.1 and T3.2 as the results allow.

B2 also checks T1.4: once it connects in beacio (or Bluefy), set T1.4 to `done`. A failed
connect shows a message naming the step (`Getting service 0FFE: …`), and a failed reconnect
lists what `getDevices()` returned. Those messages are the useful part of the result, so record
them in `docs/hardware-tests.md`, and a runtime-specific fix goes in D-022.

From T1.8: the probe is the app's start page. "Using the probe" in `docs/hardware-tests.md` says
where each answer shows. Once B2 to B8 are in, set T1.8 to `done` too, or file what failed as a
task.

**Session 1 (2026-10-04, D-037):** one recording of probe commands, with no shot. It is now
`fixtures/real/2026-10-04_probe-session_20444bd0.json`, with a README and tests in
`src/core/real-fixtures.test.ts`.

- Answered: A1, A3, A9–A13, A15, A16 and B2. A14 is answered in part (the name), and the
  recording covers C1. T1.4 is done.
- Partly answered: A4 and A5, A7 (apparently nothing), B7 and B8. In the timer mode, `04` and
  `07` start the timer. In the automatic mode they don't. The flow-rate mode has no timer (the
  user, 2026-10-05), which answers A4 (D-038).
- The user's account: the scale started in its automatic mode, then went to flow rate, then to
  timer. The timer mode is the one the app will use (D-038).
- A6's method changed: the standby bytes don't count down.
- The simulator's assumptions go to T1.22.
- Still to do is in `docs/hardware-tests.md` "Session 1". Most of all: a shot with the probe
  recording, for A2, C3 and C5. T1.8 stays `verify` (B3–B6).

**Session 2 (2026-10-05, D-048):** beans dosed, ground and weighed in the dosing cup, then two
shots, each started with Tare + start at the pump. It is
`fixtures/real/2026-10-05_two-shots_0a69da56.json` (serial number masked), with a README and
tests.

- Answered: A2 (no vibration) and A5 in the timer mode (`07` tares and starts the timer). C5 is
  covered by shot B; A8 in part (masses seen, not named).
- The user's answer to Q4: `pump_on` is the Tare + start tap.
- The user's account (D-049):
  - shot A's scale was moved because it was off centre;
  - the two microphone tries were only access checks, so there's no sound in the recording;
  - the user runs a surf (the pump, for several seconds) before each shot.
- Two unknown FF12 frames (`03 0C` with the serial number, `03 0E`): protocol-notes 15.
- T1.16 is unblocked. Still to do is in `docs/hardware-tests.md` "Session 2", most of all three
  normal shots (C3).

### T1.9 — Timebase reconstruction

**Status:** done · **Depends:** T1.1, T1.3 · **Read:** spec "Parsing rules" (3, 4); D-006;
`docs/ARCHITECTURE.md` "Timebase"

**Deliverables (`src/core/timebase/`):**

- `buildTimeline(frames)` produces:
  - a per-frame `t` (s since recording start) and its `timeSource` (`device` or `arrival`);
  - the device-advancing runs, each with its fitted offset (the minimum `arrival − device`) and
    a drift check;
  - jitter statistics;
  - the nominal sample interval.

**Acceptance:** simulator tests.

- With the timer running, reconstructed times are within 5 ms of the true sample times despite
  ±50 ms arrival jitter.
- With the timer zero or frozen, it falls back to arrival time.
- A timer reset (`07`) mid-recording gives two stitched runs.

**Notes:** smoothing arrival times when there's no device timer (fitting a regular grid to them)
is optional. Evaluate it on real data in T1.16.

From T1.3 (ARCHITECTURE "Simulator"): `simulateSession(espressoScenario({ ... }))` gives frames
that each carry their truth, and `truth.sampleTMs` is the true sample time. Every arrival is at
least `minLatencyMs` (15) after its sample, so compare reconstructed times after removing that
constant, or set it to 0. Jitter comes from `link: { jitterMeanMs, connectionIntervalMs,
stallProbability }`. For two stitched runs, script a second `07` (`type: 'command'`).
`truth.timer` lists every timer change, and `toRawRecording()` gives `RawFrame`s and events.

**Completed 2026-10-04:**

- `src/core/timebase/`: `buildTimeline(rawFrames)` decodes the FF11 weight frames and gives
  each a time `t` (s), its source (`device` or `arrival`) and the decoded frame. It also reports
  the device runs (offset, shared rate, own drift as the drift check, jitter), the recording's
  `rateSource` and `driftPpm`, the jitter, the arrival correction and the nominal interval.
  `fit.ts` has the pooled robust slope, `median` and `quantile`. D-032 has the design and the
  measurements.
- **Deviations from the plan's wording, both in D-032:**
  - Runs are mapped with a fitted rate as well as the least offset: at the simulator's 300 ppm
    drift, a single offset is 18 ms off after a minute.
  - The rate is shared by all runs (one scale clock), fitted by trimmed least squares, not the
    lower envelope: BLE connection events make the envelope ride a sawtooth.
- **Acceptance**, simulated: device-timed frames are within 5 ms of their samples, apart from
  one constant offset (the link's least latency), on the default link, with ±50 ms jitter and
  with stalls; outright within 5 ms on the default link. A timer that never runs gives arrival
  time. A frozen timer falls back to arrival from the stop, its first frozen frame included. A
  second `07` gives two runs, each within 5 ms, with a seam under 10 ms.
- **Next agents:** `t` never decreases, but bursts of arrival-timed frames can share a value.
  Arrival-timed frames are shifted by the median jitter (`arrivalCorrectionMs`). The two
  defaults that depend on the scale are `PROVISIONAL(U1.1: A1)`.

### T1.10 — Signal toolkit

**Status:** done · **Depends:** T0.2 · **Read:** spec "Signal processing", "Markers" (CUSUM
parameters), "Tail handling"

**Deliverables (`src/core/signal/`, pure):**

- Uniform resampling by linear interpolation.
- Savitzky–Golay coefficients for any odd window and polynomial order, and for derivative
  order 0–2 (general least squares), applied with edge handling.
- O(n) rolling mean, variance and range.
- One-sided CUSUM with alarm time and retrospective change point (the argmin of the cumulative
  sum before the alarm).
- Ordinary and weighted least-squares line fits with residuals.
- Median and MAD.
- A step helper: difference of means across a gap.

**Acceptance:**

- Savitzky–Golay reproduces polynomials of degree ≤ order exactly (value and derivative), and
  matches the textbook 5-point coefficients: smoothing `[−3, 12, 17, 12, −3]/35`, first
  derivative `[−2, −1, 0, 1, 2]/10`.
- CUSUM finds a known mean shift with the right change point.
- Rolling stats match a naive implementation on random data.

**Notes:** from T1.9, `src/core/timebase/fit.ts` already has `median`, `quantile` and a robust
(pooled, trimmed) least-squares slope. The module table lets timebase import only protocol and
model: either keep its copies, or let it import signal and say so in ARCHITECTURE.

**Completed 2026-10-04:**

- `src/core/signal/`: `resampleLinear`; `savitzkyGolay` and `savitzkyGolayCoefficients`;
  `rollingMean`, `rollingVariance` and `rollingRange`; `cusum`; `fitLine` (ordinary or
  weighted); `mean`, `median`, `quantile` and `mad` with `MAD_TO_SIGMA`; `stepAcrossGap` and
  `rollingStep`. Plain arrays in, `number[]` out; indexes and windows count samples. D-033 has the
  conventions, ARCHITECTURE "Signal toolkit" the list.
- `median` and `quantile` moved here from `src/core/timebase/fit.ts`, unchanged: the timebase
  imports signal now, and the module table says so.
- **Acceptance:** the SG weights match the published tables (and exact rational least squares
  off the centre), and reproduce polynomials up to the fit's order exactly, in value and the
  first two derivatives, ends included. CUSUM dates a noise-free step exactly, and matches its
  definition on 200 random series. The rolling statistics match the slow way on traces with
  300 g steps, near 0 and at 10 kg.
- **Next agents:** window functions return whole windows only: output k covers samples
  k … k + window − 1. SG ends are fitted, so they reproduce polynomials but are noisier than the
  interior. CUSUM with the spec's slack of 0.5σ dates changes early, and raises false alarms over
  long quiet scans (D-033 has the numbers): start the scan near the onset, and refine (T1.12).

### T1.11 — Stability, zero-tracking, shot windows

**Status:** done · **Depends:** T1.9, T1.10 · **Read:** spec "Schema rules" (baseline-relative
weight; a stray tare is a step), "Tare arming" (the stability test), "Markers"

**Deliverables (`src/core/analysis/`):**

- **Stable windows:** sample range ≤ tolerance over 0.5 s, where tolerance =
  max(0.05 g, k × quantisation step). The noise floor σ per window is never below q/√12, since
  quantised data at rest can show σ = 0.
- **Steps:** abrupt mean changes between stable windows, classified as:
  - tare: a step to about 0 within about 0.5 s after a tare command in the event log, or an
    FF12 tare event if A7 shows one exists, or else a heuristic;
  - cup placed;
  - cup removed (a large negative step);
  - other.
- **Zero-tracking:** a continuous series corrected for tare steps, so that net weight
  `w(t) − w(baseline)` holds across tares.
- **Shot windows:** from cup placed and stable to cup removed (or the end of the recording),
  containing a sustained rise. Each window carries its baseline (the stable value before the
  pump) and σ.

**Acceptance:** simulator scenarios:

- a tare while idle;
- a stray physical tare during the tail, which is subtracted, leaving the yield unchanged;
- two shots in one recording;
- the cup removed before the tail settles;
- quantised data, where the σ floor applies.

**Notes:** from T1.3, these are all script events or parameters. Use `type: 'command'` with
`tare()`, or `tare-button`; `demoScenario()` has a tare-button press in a tail. Script two
`shot`s with `cup-off` and `cup-on` between them. For an early lift, use
`espressoScenario({ cupOffAfterPumpOffMs: 1000 })`: the later drips land on the bare platform.
For quantised data, use `scale: { resolutionG: 0.1 }`. `truth.tares` lists every change of zero.

From T1.9: start from `buildTimeline(raw.frames)` (`src/core/timebase`). Its samples carry `t` in
seconds and the decoded `frame`; use `frame.weightG` only where `hasTrustedWeight(frame)`
(D-005, D-014). `t` never decreases, but a burst of arrival-timed frames can share one value, so
resampling must cope with equal times.

From T1.10 (`src/core/signal`, D-033): `resampleLinear` copes with equal times (it averages
them). `rollingRange` gives the stability test, `rollingVariance` σ, and `stepAcrossGap` and
`rollingStep` the steps; window functions return whole windows only, output k covering samples
k … k + window − 1. `median` and `mad` (× `MAD_TO_SIGMA`) give robust levels and noise.

**Completed 2026-10-04:**

- `src/core/analysis/`: `segment(timeline, events, params?)` gives a `Segmentation`: the
  trusted samples (refused frames counted), the quantisation step q read off the data, the
  stability tolerance and σ floor, the zero-tracked samples and their uniform grid (`series`),
  the steps (tares with their source, vessels placed and lifted, other), the stable stretches,
  and the shot windows with their baselines. Parameters, with the provisional ones marked, are
  in `params.ts`. D-034 has the design and the measurements, ARCHITECTURE "Segmentation" the
  shapes.
- **Deviations from the plan's wording, all in D-034:**
  - Steps are runs of jumps on the samples, not only changes between stable windows: a stray
    tare in the tail and a cup lifted before the tail settles happen while the weight moves.
  - A logged tare too small to jump is applied only when it stands out of the noise by 4
    standard errors: a manual start right after the auto-tare has nothing to take off. The
    button's tare is a single jump that lands on 0. There's no FF12 tare event (A7 unknown).
  - A baseline needs a stable stretch of a second or more: the pump's vibration fakes short
    stable fragments, whose levels are off by the noise.
  - σ is the samples' standard deviation, floored at q/√12: the MAD reads quantised data badly.
- **Acceptance**, simulated: a tare while idle, from the app or the button, zero-tracked within
  0.05 g. A stray button press 0.3–10 s into the tail: within 0.15 g, the baseline unchanged
  and the rise within 0.15 g of the same session without it. Two shots, with the cup changed
  and into the same cup. A cup lifted 1 s after pump_off: the window ends at the lift, honest
  yield within 0.1 g, and the late drips on the platform make no window. Quantised to 0.1 g:
  q 0.1, tolerance 0.1, every σ at least q/√12, and exactly that on the empty platform.
- **Next agents:**
  - Work inside `shotWindows[k]` on `series`, the zero-tracked weight on the grid, whose step
    is the nominal interval. Net weight is `series` less `baseline.levelG`. `cupRemoved` is
    the window's `cup_removed` step (null when something else ended it), and honest yield is
    `cupRemoved.levelBeforeG − baseline.levelG`.
  - `baseline.endT` falls near `pump_on` (1.9 s before to 0.35 s after) when the vibration
    shows, near `first_drip` without it: start scans there. `baseline.sigmaG` is the quiet σ.
  - Times are timeline seconds: true times plus the link's latency (15 ms and up).
  - Tests compare zero-tracking with the truth frame by frame (`segment.test.ts`,
    `zeroTrackingError`).

### T1.12 — Liquid markers and tail fit

**Status:** done · **Depends:** T1.11 · **Read:** spec "Markers", "Tail handling", "Flow and
yield"

**Deliverables:**

- `first_drip`: CUSUM on `w − baseline` with slack about 0.5σ and alarm about 4–5σ, located at
  the retrospective change point. Optionally refine it to sub-sample resolution by fitting the
  initial rise and extrapolating back to the baseline.
- `settled`: the point where the mean stops moving, extrapolated when the cup came off first.
- `cup_removed`: the large negative step. Honest yield is the weight just before it.
- Tail fit: given `pump_off` (an input, because T1.13 provides it), fit `ln(flow)` against `t`
  on the tail where flow is above the noise. This gives τ and
  `w_final = w(pump_off) + ẇ(pump_off)·τ`, plus fit quality (R², points used).

**Acceptance** against simulator ground truth:

- `first_drip`, statistically (the user's decision, D-035): at the default vibration, median
  error under 0.1 s, 90% within 0.25 s, none beyond 0.7 s, no bias; without vibration, every
  shot within 0.1 s. The plan first asked for every shot within 0.1 s, below the information
  limit at σ 0.1 g;
- τ within 10%;
- `w_final` within 0.3 g;
- sensible output when the cup is removed early.

Tests feed ground-truth `pump_off` until T1.13 exists.

**Notes:** from T1.3, two things make `first_drip` harder than it looks:
- The pump runs at `first_drip`, so the noise there is the vibration σ (0.1 g by default), not
  the quiet σ (0.015 g). Take σ from the pre-infusion window.
- The default profile ramps from zero over the first 8% of the extraction (about 1.8 s), so the
  mean rises quadratically. Measured in T1.3 over 20 seeds, a plain CUSUM (slack 0.5σ, alarm
  4.5σ, σ from pre-infusion) put the change point anywhere from 0.8 s early to 0.6 s late, with
  a median near 0. Meeting 0.1 s needs the rise fit, or more. If the target looks wrong rather
  than hard, raise it with the user.

Liquid lands in 0.05 g drops (`dropG`), the first at `first_drip`. With `dropG: 0`, yield is
exactly w(pump_off) + ẇ(pump_off)·τ.

From T1.10 (`src/core/signal`, D-033): `cusum` returns `alarmIndex` and `changeIndex`, indexes
into the array it scanned. Measured on white noise, the spec's slack of 0.5σ dates a 2σ step
with a median error of 0–1 samples but a tenth 4 or more samples off, mostly early, and scans over
long quiet stretches raise false alarms: start near the onset. `fitLine(x, y, weights)` fits the
rise and the tail; for ln(flow), weights of flow² kept τ within 5% where unweighted was 22% off.
`savitzkyGolay` with `derivative: 1` and `step` gives the flow in g/s.

From T1.11 (`src/core/analysis`, D-034): work in `segment(timeline, events).shotWindows[k]`, on
`series` (the zero-tracked weight on the grid) from `startIndex` to `endIndex`.
`baseline.levelG` is w(baseline) and `baseline.sigmaG` the quiet σ; for `first_drip` take σ from
the pre-infusion, after `baseline.endT`. `cup_removed` is the window's `cupRemoved` step, null
when something else ended the window (`end`: `cup-removed`, `next-shot`, `cup-placed`,
`recording-end`); honest yield is its `levelBeforeG` less the baseline. After an early lift the
drips land on the platform, outside the window. `riseG` is a diagnostic, not the yield.

**Completed 2026-10-04:**

- `src/core/analysis/` gains four modules:
  - `liquidMarkers(segmentation, window, { pumpOffT })` returns `firstDrip`, `pumpOff`
    (w(pump_off)), `tail` (τ, ẇ(pump_off), w_final, R², points), `settled` (measured or
    extrapolated, with the yield), `cupRemoved` (with the honest yield), `flags` and the
    `params` it ran with;
  - `windowLiquid` gives the window's liquid: less the baseline and other steps, NaN inside
    their transitions;
  - `findFirstDrip` and `fitOnset`;
  - `fitTail`.

  D-035 has the methods and measurements.
- Parameters are `LiquidParams` and `DEFAULT_LIQUID_PARAMS`, validated by
  `resolveLiquidParams`. Five carry `PROVISIONAL(U1.1: …)` markers. `cusum` has a `lastRun`
  option.
- **Segmentation change:** up to 2 lead-in samples now join a step's transition (D-035), so the
  level before a lift excludes a half-lifted sample.
- **Tests:** unit tests per module, plus `liquid-markers.test.ts` against simulator ground truth.
  Over 100 seeds it checks first_drip's statistical acceptance. It covers τ and w_final, early
  lifts at 1 s (tail declined) and 2 s (extrapolated), pump_off ±0.2 s, no pump_off, a
  recording cut before pump_off, two shots in one cup, a spoon, 0.1 g quantisation, and purity.
- pump_off still comes from the simulator's truth in the tests. T1.13 provides it.

### T1.13 — Pump markers (`pump_on` / `pump_off`)

**Status:** done · **Depends:** T1.11 · **Read:** spec "Markers", "Fallback if vibration does not
survive"; `docs/hardware-tests.md` A1, A2, A11; Q4; D-029

**Deliverables:**

Built ahead of hardware test A2 (D-029): implement both detectors, and choose per shot window
from what the data shows.

- **Variance detector:** compute the rolling variance of the *detrended* weight (the
  residual from the SG fit, or second differences: the mean moves during extraction, so raw
  variance would include the trend). Compare it against the quiet-baseline σ².
  - `pump_on`: variance steps up while the mean stays stationary. Requiring both rejects a bump,
    which moves mean and variance together.
  - `pump_off`: variance steps down.
  - Locate each onset retrospectively.
- **Always:** implement the regime-change fallback for `pump_off`: fit the exponential decay
  backwards from the end, then walk forward to where the data departs from it. Use it as a
  cross-check, or as the primary method when there's no vibration.
- **Choosing:**
  - Use the variance detector when the window's detrended variance steps clearly above its quiet
    floor. Otherwise use the fallback for `pump_off`.
  - Flag which detector ran.
  - Mark the "clearly above" threshold `PROVISIONAL(U1.1: A2)`.
- **Without vibration:** `pump_on` is `null` and flagged, and the metrics that need it are
  `null` too. Q4 decides later whether the manual-start press stands in for it.

**Acceptance:**

- With simulator vibration σ > 0, markers are within 0.2 s. For `pump_on` this is statistical
  (the user's decision, D-036). Over 100 seeds at the default vibration: median error under
  0.05 s, 85% within 0.2 s, none beyond 0.5 s, no bias. About one shot in ten can't make 0.2 s,
  however it is measured.
- With σ = 0, the fallback is used and flagged.
- The real-fixture check moves to T1.16.

**Notes:** the spec says to revise the segmentation section if A2 shows no vibration. The user
chose to build first and adjust afterwards (D-029), so T1.16 raises the revision with the user if
A2 comes back negative.

From T1.3: `vibrationSigmaG: 0` is the no-vibration case. A `pump` script event is a flush
(vibration and no liquid), and a `bump` moves mean and variance together.

From T1.10 (`src/core/signal`, D-033): the detrending residual is the values less their
`savitzkyGolay` smoothing. `rollingVariance` is the sample variance over whole windows, and
`cusum` with `direction: 'down'` finds the step down at `pump_off`. `fitLine` fits ln(flow) for
the fallback.

From T1.11 (D-034): `baseline.sigmaG` is the quiet σ (never below `sigmaFloorG`, q/√12). Where
the pump's vibration shows, `baseline.endT` falls near `pump_on` (simulated: 1.9 s before to
0.35 s after); without vibration it runs on to near `first_drip`, itself a hint. With
quantisation as coarse as the vibration, the baseline can run into the pre-infusion.

From T1.12 (D-035):
- **Inputs and outputs:** `liquidMarkers(segmentation, window, { pumpOffT })` takes pump_off as
  its input; pass what T1.13 finds. `windowLiquid` gives the liquid series, and `quadraticSG`
  with `derivative: 1` gives the flow.
- **A vibration hint:** `firstDrip.sigmaG` is the pre-infusion's noise. Next to
  `baseline.sigmaG`, the quiet σ, it already says whether the vibration shows.
- **The fallback:** `fitTail` can serve the regime-change `pump_off`. Fitting from the end
  backwards is new, though.
- **Tolerance:** the tail fit starts 0.2 s after pump_off, so a pump_off 0.2 s early or late
  still gives τ within 15%. That is the room T1.13's accuracy has.

**Completed 2026-10-04:**

- `src/core/analysis/` gains three modules, and `test-runs.ts` (simulated runs, for tests only):
  - `pumpMarkers(segmentation, window, { firstDrip })` returns `pumpOn`, `pumpOff` (with its
    `detector`, `variance` or `regime-change`), the `vibration` step, `varianceStep`,
    `regimeChange`, `flags` and `params`;
  - `fitKnee` is the regime-change model: a parabola, then an exponential drain;
  - `shotMarkers(segmentation, window)` runs first_drip, then the pump markers, then the liquid
    markers with the pump_off found.

  D-036 has the methods and measurements.
- Parameters are `PumpParams` and `DEFAULT_PUMP_PARAMS`, validated by `resolvePumpParams`. Six
  carry `PROVISIONAL(U1.1: …)` markers.
- **Acceptance** (D-036): at the default vibration, pump_off is within 0.2 s in every shot by the
  variance (worst 0.16 s), and pump_on meets the user's statistical target (median 0.034 s,
  worst 0.30 s). Without vibration, pump_on is null, flagged `no-vibration`, and the regime
  change times pump_off within 0.1 s (worst 0.064 s).
- **Also changed:**
  - first_drip is robust to knocks before the rise.
  - Segmentation steps take a lead-out of up to 2 samples, except runs that land on 0 (tares).
    Review found that a tare's correction could otherwise start a sample late.
- **Tests:** `pump-markers.test.ts` (acceptance over 100 seeds) and
  `pump-markers-scenarios.test.ts`. The scenarios cover knocks, a mean shift, a flush, early
  lifts, a recording cut short, other flows and drains, 0.1 g quantisation, arrival times only,
  stalls, two shots in one cup and a spoon. `knee.test.ts` covers the model.

### T1.14 — Metrics, analysis runner, derived cache

**Status:** done · **Depends:** T1.12 · **Read:** spec "Durations", "Flow and yield", "Layers";
D-007

**Deliverables:**

- `analyzeRecording(raw, shots)` is pure. It runs decode → timeline → zero-tracking →
  resample → markers per shot window → metrics:
  - pre-infusion, extraction and total durations, all ending at `pump_off` (**never at the last
    drip**);
  - first-drip time (`pump_on` → `first_drip`), the headline metric;
  - average flow = `w(pump_off) / t_extraction`;
  - yield `w(settled)`, honest yield `w(cup_removed)`, tail mass, τ;
  - ratio, when a dose is known;
  - quality flags: which detectors ran, and which fallbacks were used.

  Results are stamped with `ANALYSIS_VERSION` and the parameter set.
- Markers that aren't available yet (before T1.13) are `null`, and the metrics that need them
  are `null` too.
- A read-through derived cache, invalidated by version, and `reanalyzeAll()` to re-run across
  history.
- Shot matching per D-007: segments link to `Shot` entities by anchor time, unmatched segments
  get a `post-hoc` shot, and unmatched shots are flagged. A discarded shot still claims its
  segment, so it isn't recreated (D-019). Make post-hoc shots with `createShot`, anchored at
  the segment's start.

**Acceptance:**

- End-to-end simulator tests produce metrics within tolerance of ground truth.
- Bumping the version invalidates the cache.
- `reanalyzeAll` is idempotent.

**Notes:** from T1.5, the derived store holds `{ recordingId, analysisVersion,
computedAtEpochMs, result }`, keyed by recording and version: `storage.derived.put`, `get` and
`clearAll`. `analysisVersion` must be an integer ≥ 0. `result` must be JSON (no typed arrays),
and T1.14 checks its shape when it reads one back. `storage.raw.read(id)` gives the raw input.

From T1.11 (D-034): `segment(buildTimeline(raw.frames), raw.events, params)` comes after the
timeline; stamp `segmentation.params` with the rest of the parameters. `ANALYSIS_VERSION`
doesn't exist yet: create it here, with the first stored result. A `refusedFrames` above 0
must become a visible flag (D-005, D-014). `samples` and `series` are working arrays: keep them
out of the cache. The segments to match with shots are the shot windows; their times are
timeline seconds, within the link's latency of the recorder's `tMs` (shot anchors are in ms).

From T1.12 (D-035), the metrics map onto `LiquidMarkers`:
- first-drip time: `firstDrip.t − pump_on`;
- extraction: `pump_off − firstDrip.t`;
- average flow: `pumpOff.weightG / extraction`;
- yield: `settled.weightG`;
- honest yield: `cupRemoved.weightG`;
- tail mass: `settled.weightG − pumpOff.weightG`;
- τ: `tail.tauS`.

Any of them can be null. Carry `flags` into the result (`no-pump-off`, a tail issue,
`other-steps`), and stamp `params` as well. The markers survive a JSON round trip unchanged,
which a test checks.

From T1.13 (D-036):
- **One call per window:** `shotMarkers(segmentation, window)` gives `{ pump, liquid }`, and
  `pump_on` is `pump.pumpOn?.t`. Pre-infusion is `liquid.firstDrip.t − pump_on` and total is
  `pump.pumpOff.t − pump_on`. Both are null without vibration, until Q4.
- **Quality flags:** `pump.flags` (`no-vibration`, `knock-at-pump-on`, `mean-moved`,
  `variance-step-unclear`, `no-pump-off`, `detectors-disagree`), `liquid.flags`, and
  `pump.pumpOff.detector`.
- **Stamping:** stamp `pump.params` with the others.
- **Tests:** `test-runs.ts` has `simulateRun`, `seeds`, `phasedPumpOnMs` and `absQuantile` for
  simulator ground-truth tests.

From T1.22 (D-046): the simulator's defaults are the real scale's now, 0.1 g steps among them,
so end-to-end tests see what real shots will give: tolerances from D-037's second table.
Where a test compares with D-035's or D-036's agreed targets, run it on `AGREED_SCALE`
(`test-runs.ts`), as theirs do.

From the UI merge (spec v2, D-041): the brew flow's Beans, Grind and Milk phases pour beans,
ground coffee and milk onto the scale. Each of those pours passes today's shot-window test, a
rise of `minRiseG` (1 g) over `minRiseS` (3 s). D-007 gives every unmatched window a post-hoc
shot, which would put each pour in History as a shot.

- Create post-hoc shots only for windows that look like espresso: a `pump_on`, or a `pump_off`
  with a draining tail.
- Keep the rest as unlabelled segments until containers label them (T2.4, T2.5).
- Record the refinement of D-007, and ask the user if a case is unclear.

**Completed 2026-10-05** (D-047; ARCHITECTURE "Analysis results and the runner"):

- **`analyzeRaw(raw)`** (`src/core/analysis/recording-analysis.ts`) runs the whole pipeline. It
  returns the JSON `RecordingAnalysis` that the cache stores, beside working data that is never
  cached: the timeline, the segmentation, and every marker with its diagnostics.
  - Per segment: the window, the five markers, the tail fit, the metrics (`metrics.ts`),
    `espresso` and the flags. Per recording: a timeline summary, the steps, the refused frames
    and the flags.
  - It is stamped with `ANALYSIS_VERSION` (`version.ts`, now 1) and every parameter
    (`AnalysisParams`: timeline, segmentation, liquid, pump; `resolveAnalysisParams`).
    `parseRecordingAnalysis` (`analysis-schema.ts`) checks a result read back.
- **`matchShots(segments, shots)`** (`matching.ts`) is D-007 refined (D-047):
  - each shot claims its nearest segment's shot span, within `MATCH_SLACK_S` (10 s); spans never
    overlap, and near ties go to the later segment;
  - shots the user made come before post-hoc ones, standing ones before discarded ones;
  - a shot that loses its segment stays unmatched and never moves on;
  - post-hoc shots are wanted only for `espresso` segments (a pump_on, or a pump_off with a
    draining tail), anchored at pump_on, else first_drip, and only where they would claim the
    segment, so no round asks twice.

  The ratio is computed here, from the shot's dose. `analyzeRecording(raw, shots)` is both.
- **`AnalysisRunner`** (`src/app/analysis-runner.ts`) is made by `startApp` as
  `services.analysis`.
  - `analyze(recordingId)` reads an ended recording's analysis through the cache (checked for
    shape, version, parameters and `lastSeq`, the last raw record it read) and adds the missing
    post-hoc shots, atomically, through the new `shots.createMissing`. An open recording is analysed as it stands, uncached, with
    no post-hoc shots.
  - `reanalyzeAll()` clears the cache and analyses every ended recording again. A second run
    changes nothing.
  - Nothing calls it yet: T1.18 and T1.19 decide when.
- **Against the simulator:** at 0.01 g every metric is within the sums of the agreed marker
  targets (yield 0.02 g, τ 6% at worst). At 0.1 g, pump_on runs about 0.2 s late and goes
  missing in 4 shots of 60 (D-037). Without vibration, the first-drip time and the total are
  null (Q4). D-047 has the table.
- **Edge cases tested:** two shots into one cup, the demo, a recording cut mid-shot, refused
  frames, a pour that isn't espresso, and a JSON round trip. Session 1's fixture analyses to no
  segment. The type unions the schema checks are const arrays now (`PUMP_FLAGS`,
  `LIQUID_FLAGS`, `STEP_KINDS` and others).
- **For the next agent:**
  - Bump `ANALYSIS_VERSION` whenever an output changes. The cache also refuses an entry whose
    parameters differ from the defaults, but that is only a safety net.
  - The analysis needs the tail after the pump stops: 4 s with the simulator's vibration, 2 s
    without (T1.18's notes).

### T1.15 — Analysis inspection CLI

**Status:** done · **Depends:** T1.7, T1.14

**Goal:** agents can't see the phone, so give them a way to look at real data.

**Deliverables:**

- `npm run analyze -- <export.json> [--out dir]` prints markers and metrics as JSON.
- It also writes an SVG per shot showing weight, derived flow, detrended variance, markers and
  annotations. Render to PNG with Playwright and the preinstalled Chromium if that is useful.

A simulated export: T1.7's serialiser applied to `toRawRecording(simulateSession(...))` (T1.3).

From T1.7: `parseExport(text).bundle` reads a file. Each `bundle.recordings[i]` is
`{ recording, frames, events }`, as the simulator's `RawSession`, and `bundle.shots` holds the
shots of every recording (group them by `recordingId`). Write a simulated export with
`serialiseExport({ exportedAtEpochMs, app, recordings: [toRawRecording(session)], shots: [],
settings: null })`. `src/core/export/test-samples.ts` has a richer bundle.

**Acceptance:** runs on a simulated export and on `fixtures/real/*` once they exist. Documented
in README and CLAUDE.md.

From T1.14 (D-047):

- `analyzeRecording(raw, shots, overrides?)` gives `analysis`, the JSON the app caches, which is
  what to print, and `matching`. Pass the recording's own shots, from `bundle.shots` by
  `recordingId`.
- It also gives the working data:
  - `segmentation`: the zero-tracked `samples` and `series`, and the shot windows;
  - `markers[i]`: every marker of segment `i`, with the detectors' diagnostics
    (`pump.vibration`, `pump.varianceStep`, `pump.regimeChange`, `liquid.firstDrip`).
- For the SVG: `windowLiquid(segmentation, window)` gives a window's liquid. `quadraticSG(values,
  sgWindowSamples(params.liquid.sgWindowS, step), step, 1)` gives its flow, as the tail fit
  takes it.
- `AnalysisOverrides` (by stage: `timeline`, `segmentation`, `liquid`, `pump`) lets the CLI try
  other parameters, which T1.16 will want.

**Completed (2026-10-05):** the design is D-051, and ARCHITECTURE "Inspection CLI" has the
pipeline.

- `npm run analyze -- <export.json>... [--out dir] [--png] [--summary] [--param stage.name=value]
  [--simulate espresso|demo] [--seed n]`. `--help` lists the options.
  - It prints the JSON report on stdout, or a few lines per shot window with `--summary`.
  - With `--out`, it also writes `report.json`, an SVG chart per recording and per shot window,
    and, with `--simulate`, the simulated export. `--png` renders the charts.
  - README "Inspecting recordings" and CLAUDE.md "Commands" describe it.
- `src/core/inspect/` is the pure core, and `scripts/analyze.mjs` only reads and writes.
  - `inspect` gives the report and the charts; `parseAnalyzeArgs` reads the command line;
    `simulatedExport` writes a simulated session through the serialiser and keeps its truth;
    `summarise` gives the text view.
  - The charts: `charts.ts` builds the specs, `chart.ts` renders them, and `svg.ts` is the
    plotting kit.
- **The report**, per recording:
  - `analysis`, as the cache keeps it;
  - `diagnostics`: the pump detectors' vibration, variance step and regime change;
  - `matching`;
  - `events`, one line each;
  - `truth`: for `--simulate`, the truth and the error against it;
  - `charts`: the chart names.
- **A segment's chart** has four panels:
  - the liquid, with the drain model;
  - the flow, with the scale's own figure;
  - the detrended variance, with the detectors' noise levels;
  - the sound levels, when there are `mic` frames.

  Vertical lines mark the markers, the truth (dotted) and the app events.
- `scripts/typescript.mjs` lets Node run `src/` as it is: Node 22.18 strips the types, and the
  hook resolves the extensionless imports. `scripts/playwright.mjs` now finds Playwright for the
  e2e tests and the PNGs alike.
- `RegimeChange` gained `weightG`, the knee's fitted liquid, so the chart draws the analysis's
  own drain. It is working data, so `ANALYSIS_VERSION` stays 1.
- Tests: 64 in `src/core/inspect` (the SVG kit, the renderer, the chart specs, the report on a
  simulated export and on both fixtures, the command line, the simulated export, the summary),
  and `scripts/analyze.test.mjs`, which runs the CLI as a process. Vitest now includes
  `scripts/**/*.test.mjs`.
- **For T1.16:** the charts show the known misses (D-048), and one that wasn't known:
  zero-tracking keeps a tare-button press's load (D-051). Its "From T1.15" note says how to use
  them.

### T1.16 — Tune analysis on real fixtures

**Status:** done · **Depends:** T1.13, T1.15, T1.22, U1.1 (session 2 has two shots)

**Completed 2026-10-05** (D-058 to D-064, `ANALYSIS_VERSION` 7). Session 2 reads: shot A 47.3 g,
first-drip time 3.26 s, total 11.55 s, τ 0.28 s; shot B 35.1 g (honest 35.1 g), 3.66 s, 35.69 s,
w(pump_off) 34.8 g, τ 0.18 s; the beans 17.7 g; both shots espresso, timed from the tap.

- **Part 1 (D-058):** readings snapped to the scale's 0.1 g grid (the float32 rule, protocol
  notes finding 16); anchors from firm stretches (1 s each, `minBaselineS` 2 s together); other
  steps of several jumps inside a rise are the pour (`pourStep`, flag `pour-disturbed`), though
  a window still needs its rise net of every step; transients kept and left out of the liquid;
  `pump_on` from the Tare + start tap (`manual-start.ts`, `manualStartS` 15 s, `source: manual`,
  flag `manual-pump-on`).
- **Part 2 (D-059):** the yields from the stable level before pump_on (`prePumpBaseline`,
  `ShotMarkers.window`); a logged tare must bring the reading nearer 0; a vessel's run takes a
  press either way; first_drip with `dropG` 0.2 g and `riseFitG` 1 g; the drain from the pump_off
  knee (`PumpMarkers.drain`, τ from 0.05 s) gives w(pump_off), and the tail when the flow fit
  can't (`drainTail`, `TailFit.source: knee`); the simulator follows session 2 (no vibration,
  τ 200 ms, a 0.2 g first lump, the float32 truncation, `espressoScenario({ manualStartMs })`).
- **The targets (D-060, Q8):** re-agreed with headroom. `targets.test.ts` holds the analysis to
  them over 100 tapped shots on the simulator's defaults, through `analyzeRaw` (`timelineOffset`
  and `shotErrors` in `test-runs.ts`). D-035's and D-036's tests stay as regressions on the
  vibrating 0.01 g scale (`AGREED_*`); the variance detector's keep `VIBRATING_SCALE`.
- **The button's press (D-061):** a jump to 0 within `pressTareS` (2 s) of a one-jump step up is
  the press let go with its tare, measured from before the press, which is a transient. The
  simulator's `tare-button` takes `pressG` and `pressMs`.
- **A knock at a tare (D-062):** samples faster than liquid join a run, touching runs merge, a
  logged tare takes a run with a knock in it, every tare applies from its own jump (`Tare.from`).
- **The sample grid (D-063):** frames between the timer's runs are timed `offset + period × k`
  (`timeSource: 'grid'`), cut where a frame may be lost. Session 2's sit on it as the timer's do.
- **The D-029 pass (D-064):** settled `DEFAULT_MIN_FIT_SPAN_MS` (now 3 s: the Mini drifts
  0.69%), the drift bound, the stability band, `jumpG`, `tareSearchS`, `sgWindowS`; the
  vibration thresholds stay for a vibrating scale. D-064 lists what stays provisional (C2–C5,
  A4, A5's latency, A13).
- **Closed:** T1.8 (run on the phone in both sessions).
- **For the next agents:**
  - T1.18: "shot done" can come 1 s after the pump stops (pump_off in 40 of 40 simulated shots,
    the yield in 39), 3 s for all. `MATCH_SLACK_S` (10 s) is to check against where live shots
    anchor. Shot B's `settled` reads 0.15 s after pump_off, one quantum under its final level: at
    0.1 g that is all the readings say.
  - T1.21: B3 has no result yet; check the reconnect against it when it has.
  - Two shots into one cup: the first window still ends at the second's baseline end, in its
    pre-infusion without vibration; no marker comes out there now (D-063). Ending it at the next
    tap is left undone.
  - More shots (C3), the button with a cup on (C4: a held press and a quick click) and the
    settling (C2) would settle the rest; `npm run analyze -- fixtures/real/*.json --summary`
    shows what the analysis makes of new fixtures.

**Deliverables:**

- Tune the parameters on real data:
  - the SG window, from the measured rate;
  - CUSUM slack and alarm;
  - variance windows;
  - the stability tolerance;
  - timebase regularisation.
- Fixture regression tests: expected markers within tolerance, using annotations as
  approximate truth.
- Bump `ANALYSIS_VERSION`.
- Record the findings in `docs/hardware-tests.md` and `DECISIONS.md`.
- Bring the simulator in line with the data: its defaults (rate, noise, vibration σ, resolution,
  drop size, link timing) and its assumptions (D-021).
- **The D-029 adjustment pass:**
  - Revisit every value marked `PROVISIONAL(` (`grep -rn 'PROVISIONAL(' src`). That includes the
    live pipeline's thresholds if T1.17 is done.
  - The timebase (D-032): the scale's real sample period and drift (A1), and whether the
    sample period is a multiple of the connection interval. If the drift is tiny, raise
    `minFitSpanMs` or use one calibrated drift; check the arrival correction against real
    jitter; decide on a regular-grid fit for arrival-only stretches.
  - Settle T1.13's detector choice with A2. If there is no vibration, ask the user about the
    spec's segmentation revision and Q4.
  - Check T1.21's reconnect against B3.
  - Re-check first_drip against D-035's statistical acceptance with the real vibration (A2),
    drop size and flow shape (C3).
  - Re-check pump_on and pump_off against D-036 with the real vibration (A2). The thresholds
    that choose the detector (`vibrationRatio`, `vibrationEvidence`) and the regime change's
    (`regimeEvidence`, `maxDrainTauS`, `minTailS`) are provisional.
  - Close the `verify` tasks the hardware session confirmed.

If a spec assumption fails, ask the user before working around it.

From T1.11 (D-034), beyond its `PROVISIONAL` values: whether the pump's vibration shows above the
stability band, and the quantisation step (A2, A11: with q as coarse as the vibration, baselines
run into the pre-infusion); how fast a lifted cup leaves the reading, and whether the button's
tare takes one sample (C2, C4: the button's tare is told from a lift by that); whether a
physical tare sends anything (A7: it would replace that heuristic); and the command latency
behind `tareSearchS` (A5).

From U1.1 session 1 (D-037):

- **The weight comes in 0.1 g steps, and holds still at rest.** On the 0.01 g simulator, the
  user agreed statistical targets for first_drip and pump_on (D-035, D-036). At 0.1 g those
  detectors miss them by far: D-037 has the table. Re-measure them on the real shots, then
  re-agree the targets with the user (AskUserQuestion) before tuning to them.
- The stability tolerance already follows q: max(`stableRangeG`, `stableQuantisationSteps` × q)
  is 0.1 g, twice the spec's 0.05 g band.
- **If A2 shows no vibration in the weight:** the scale's own flow figure, in 0.01 g/s steps,
  moves at rest (σ 0.018 g/s), so the firmware sees finer than it reports. The display shows
  the flow in finer steps too, by the user's account. Check whether the
  pump shows there. Using that figure would go against the spec ("recorded, never used"), so
  ask the user first. Q4 is the other way out.
- **Arrivals sit on a regular 100.70 ms grid**, within −22 to +119 ms outside stalls, with no
  frame lost. That settles the regular-grid fit for arrival-timed stretches: build it. Stalls
  (a microphone opening) deliver late frames in bursts.
- **Outside the timer mode, the scale ignores commands** (D-037, D-038): the automatic mode
  ignores tare and `04` while its own run goes on. Read a command's effect off the frames, and
  never assume it from the log. The segmentation already treats a logged tare as one only when
  the weight shows it.

From T1.22 (D-021, D-046):

- The simulator follows session 1 now; what a shot shows is still assumed: the vibration (A2),
  drops and flow shape (C3), settling (C2), smoothing (A13), and the automatic mode's
  thresholds (A4). Bring those to the real shots, as D-021 lists them.
- D-037's second table is the starting point for re-agreeing D-035's and D-036's targets, and
  `AGREED_SCALE` (0.01 g) pins their tests until then: move them to the real scale once agreed.
- Two analysis limits turned up: a knock within about 0.5 s after a tare pulls the tare's
  landing level off 0, so it reads as a cup lifted and the shot window is lost; and at 0.1 g
  one tail in 100 is `tail-too-short`. Check both on real shots.
- A tare and a timer start show a frame later than a stop or a reset (S1). `tareSearchS`
  (0.5 s) covers it.

From T1.14 (D-047):

- Bump `ANALYSIS_VERSION` (`src/core/analysis/version.ts`) with the tuning, so the runner
  computes every cached result again.
- Check on real shots:
  - the `espresso` test: every real shot should pass it, and pours of beans or milk shouldn't;
  - `MATCH_SLACK_S` (10 s), against where T1.18 anchors live shots;
  - how much tail the analysis needs after the pump stops. Simulated: 4 s with the vibration,
    2 s without. T1.18's "shot done" waits on it.
- The metrics' tolerances at 0.1 g (D-047's table) follow the marker targets you re-agree.
- **When two shots pour into one cup**, the first window runs to the second's baseline end. At
  0.1 g that can lie inside the second shot's pre-infusion. The first shot's settled time then
  comes out there too: its yield is right, but the time is late (3 recordings in 180 simulated).
  Matching copes, since pump_off ends that shot. A window that ends at the next pump_on would fix
  it (T1.11, T1.12).

From U1.1 session 2 (D-048), on two real shots. **Start here.** D-048 lists eight fixes in
order. The first four:
1. `pump_on` from the Tare + start tap (Q4), flagged as manual;
2. readings snapped to the 0.1 g grid;
3. steps inside a pour;
4. the espresso test without vibration.

The three `it.fails` tests in `src/core/real-fixtures.test.ts` pin items 2–4: turn each into an
`it` as it passes. Then:
- Re-measure the marker targets (D-035, D-036) with no vibration and the real drain, then
  re-agree them with the user.
- Bump `ANALYSIS_VERSION`.
- The variance detector stays, but no longer decides anything on this scale. Its tests keep the
  simulator's vibration on purpose (D-046).

From T1.15 (D-051):
- **Look before you tune:** `npm run analyze -- fixtures/real/*.json --out <dir> --png
  --summary`, then Read the PNGs. Run it again with `--param stage.name=value` to see what a
  parameter does, and with `--simulate espresso --seed n` to set the simulator's shot beside a
  real one. In the JSON, `diagnostics` holds what the cache leaves out (the regime change's τ,
  flow, evidence and spread).
- **One more miss, not in D-048:** zero-tracking keeps the load of a press on the scale's tare
  button. In session 1 at 117.6 s, the press put 13.1 g on the platform for 0.9 s. Then the
  tare and the release came in one frame, a single jump to 0. Zero-tracking read that as a tare
  of the 3.5 g reading, so every later zero-tracked level is 13.1 g high: 22.9 g with the 9.7 g
  item on.
  - Shot metrics are net of each baseline, so they aren't affected.
  - Absolute levels are, and container recognition by mass needs them (T2.4).
  - A jump to 0 that comes right after a step up within a second or so is likely a press and its
    tare together.
- The charts show D-048's items 3 and 6 directly:
  - shot A's first liquid removed as steps, so first_drip reads 270.32 s;
  - the bean pour's bursts removed too, leaving a yield of 8.3 of its 17.7 g;
  - shot B's abrupt rise fit, and the regime change's τ on its 0.2 s floor.

### T1.17 — Live pipeline (display only)

**Status:** done · **Depends:** T1.1, T1.3 · **Read:** spec "Signal processing" (live column),
"Tare arming", "Manual start", "Flow and yield" (live ratio target), "Interaction constraints"

**Completed 2026-10-05** (D-065; ARCHITECTURE "Live pipeline"). Not wired into the app yet:
that is T1.18.

- `LiveWeight` (`src/core/live/live-weight.ts`): each trusted reading made fit to show.
  - The zero follows the app's tares, so the weight doesn't move at one. A tare that never lands
    leaves the display's own zero.
  - Jumps (a cup put on or lifted, the scale moved or lifted for the surf) hold the display for
    0.5 s.
  - An EMA (τ 0.4 s) that tracks its own lag on a pour.
  - The flow: the slope over the last second.
  - Stability: the spec's 0.5 s test at the scale's 0.1 g step.
  - A noise estimate. A tare's step and a first drip must stand clear of it.
- `ShotMonitor` (`src/core/live/shot-monitor.ts`), the display states:
  - idle → ready: a vessel put on and stable, and the arm-once tare fires;
  - ready → running: the Tare + start tap, read off the log with the analysis's rule
    (`isManualStart`). Nothing else starts a shot;
  - running → tail: the flow falls away (the live pump_off);
  - tail → done: the weight holds still, or the cup comes off. "Shot done" comes once per shot.
  - Also: the first drip, remaining-to-target with the +1 g warning, the elapsed time, and a
    series of weight and flow from the tap for the graph.
  - A lift after the shot is a pause. A tap with no liquid within 15 s lapses quietly.
    `reset()` re-arms the tare.
- Helpers: `pourProgress` and `yieldTargetG` (`pour.ts`), `pourEndMs` (`pour-end.ts`). The
  parameters are in `params.ts`; the values that depend on real shots are
  `PROVISIONAL(U1.1: C3)`.
- Shared with the analysis through `src/core/model`, whose outputs don't change:
  `AUTO_TARE_REASON`, `MANUAL_START`, `isManualStart`, `isTareCommand`.
- Lint now also keeps live from importing analysis. `boundaries.test.ts` runs ESLint on files
  that would cross, both ways: the acceptance.
- Tests:
  - `test-stream.ts` has `streamLive`, which streams the simulator with the test as the app, and
    `replayLive`, which replays real recordings.
  - Measured on 20–200 shots: one tare per shot, never at the tail; remaining −0.25 to +0.05 g at
    the target; the first drip ≤ 0.14 s late; the live pump_off 0.14–0.29 s late; "shot done"
    0.9–1.2 s after the pump stops.
  - Session 2 replayed: both shots from their taps, no shot from the beans or the grounds, one
    tare per vessel. Session 1: no shot.
- **For T1.18** (see its notes): send the scale what `scaleCommandsFor` says for each event (the
  user's answer to Q9, D-066): a plain tare at the cup, the timer stopped at "shot done" and put
  back after a tap that lapsed (the `pump-lapsed` event), so it runs from each tap.

**Deliverables (`src/core/live/`):**

- A causal EMA of weight (time constant about 0.3–0.5 s) and causal live flow (slope over
  about 1 s).
- A causal stability detector. The pure stability rule may be shared with analysis; state may
  not.
- A display state machine: idle → cup on (stable) → armed → tare fired (asks the caller to send
  `07`) → running → tail → done or cup removed.
  - **Arm-once:** the tare fires on entering the phase and disarms immediately. It re-arms only
    on cup removal or a manual reset, so it never fires again when the tail settles.
- Offset tracking across tares the app sends (an expected step).
- Remaining-to-target = dose × ratio − net weight.
- A "shot done" signal, which the UI uses to open the post-shot card and run analysis.

**Acceptance:** streaming simulator tests.

- The auto-tare fires exactly once per shot.
- A manual reset re-arms it.
- Remaining-to-target reaches about 0 at the target.
- Lint proves `src/core/analysis` doesn't import this module.

**Notes:** from T1.3, stream from `ScaleSimulator`: `advanceTo()` for frames, and `write()` for
the `07` the pipeline asks for. `espressoScenario({ tareAndStartMs: null })` leaves the tare to
the code under test.

From T1.6: in the app, the pipeline's input is `recorder.onFrame`, which gives each frame with
its decoding and `frame.tMs` on the recording's timeline. Send the `07` it asks for through
`recorder.sendCommand(tareAndStartTimer(), 'auto-tare')`, so it is logged.

From T1.8: `src/core/live` already holds the probe's display statistics (`window-stats.ts`,
`probe-monitor.ts`). Put the shot pipeline beside them. `TimeWindow` gives a time window's
values, and `ScaleLinks` (`src/app/links.ts`) shows how a per-link consumer subscribes to the
recorder.

From U1.1 session 1 (D-037, D-038): the app expects the scale in its timer mode. In the
automatic mode the scale ignores `07`, `04` and tare. After asking for `07`, read the next
frames:
- a timer that doesn't tick within half a second means the scale isn't in timer mode;
- a weight that doesn't go to 0 means no tare. Keep the display's own offset then, rather than
  assume the scale zeroed.

A tare shows within 0.2 s of the write's acknowledgement. The weight comes in 0.1 g steps, a
sample every 100.7 ms.

From T1.22: the simulator has the scale's modes (`scale: { mode: 'automatic' }` or
`'flow-rate'`), so the wrong-mode checks can be tested; the demo and `espressoScenario` run in
the timer mode. In the simulator, `07`'s first ticking frame arrives 0.26–0.38 s after the write
(the tare a frame after the scale takes it, the start a frame after that), `04`'s 0.16–0.30 s:
inside the half second.

**(v2)** Spec v2 "Live display" (D-040, D-052): the shot view also draws weight and flow since
pump start, the target line and the first-drip marker, shows progress towards the target, and
turns remaining-to-target into an over-target warning past the margin (default +1.0 g). The
beans and milk pours show progress the same way (T2.6, T2.11). Expose a causal,
display-only series for the graph; pump start comes from the manual start now and from the
microphone later (T3.1). None of it is stored (hard rule 3).

From D-049: once the microphone starts the shot view (T3.1), a pump run that ends with no liquid
reaching the cup (the user's surf before each shot) must reset the view quietly, not leave a
shot running. Until then the Tare + start tap starts it.

### T1.18 — Brew flow UI: the extraction and the shot card

**Status:** verify · **Depends:** T1.6, T1.14, T1.17 · **Read:** spec v2 "Brew phases" (with
"Manual start" and "Live display"), "What every shot records", "Grading (v2)", "Interaction
constraints (v2)", "Flow and yield"; D-045, D-052, D-053, D-054; the boards `Brew-Ready`,
`Brew-Shot` and `Brew-Finish` in `design/ui-exploration/canvas/` (each `.dc.html` is plain HTML with the
content, states and sample data; `design/ui-exploration/README.md` says how to read them)

**Deliverables (route `#/brew`, in the Instrument look; the content and states follow the
mockups):**

- **The Instrument look first, unless an earlier UI task already added it** (D-045): the
  `.look-instrument` tokens from any board's `<helmet>` in `design/ui-exploration/canvas/`
  as CSS custom properties in `src/ui`, light and dark via `prefers-color-scheme`, the type
  roles (mono numbers and labels, system text), radii and the base components (card, row,
  buttons, chips, segmented control, badge, toggle, stepper, tab bar). Font stacks only: SF
  Mono and SF Pro on iPhone, IBM Plex named as a fallback but not downloaded (a webfont would
  be a new runtime asset: ask first). The probe picks the theme up as it is.
- One-tap connect.
- **The extraction screen** (opened by the cup, or by hand): the recipe as ambient context
  (last used by default, changeable in place; until recipes exist, T2.1, a ratio), the target
  yield (dose × coffee ratio), and the manual start (sends `07`, logged as a UI action and a
  command) with, once T3.1 exists, the microphone's listening state.
- **The live view:** remaining to target with a progress bar, or the over-target warning; live
  flow; time since pump start; the graph from T1.17. Large enough to read from about a metre.
- **On "shot done":** run the analysis on the recording so far, then the **shot card** (the
  hub, D-052):
  - the phase rows: beans, grind, extraction, milk, each with its result or "skipped" (until
    the phases exist, T2.5–T2.11, only the extraction);
  - the results: first drip, extraction, yield against the target, ratio, average flow; a small
    chart;
  - the grades: taste (sour · balanced · bitter, one tap), channelling (yes/no), tags with the
    default ones on;
  - no context section: the context is set in the phases and recorded, not shown (D-056);
  - Save: one tap, nothing required.
- **Shot schema (D-053, D-054):** `direction` (the taste) and `channelled` stay as they are.
  Add the snapshot (spec v2 "What every shot records"): the context as values at brew time next
  to the ids, the phase results or "skipped", and the maintenance dates. All nullable (hard
  rule 6), in an export format version with a migration (hard rule 7): older files read the
  new fields as `null`. The fields whose entities come later (T2.1) start as `null` too, so the
  schema is complete from this version on. Update `docs/export-format.md` and test that older
  files still import.

**Acceptance:**

- The full flow works with MockTransport, with a Playwright smoke test.
- Grading and saving take at most two taps; last-used defaults persist.
- Status becomes `verify` for the user on the phone.

**Notes:** from T1.6, the manual start logs both halves (spec "Manual start"):
`recorder.logUiAction('manual-start')`, then `recorder.sendCommand(tareAndStartTimer(),
'manual-start')`. Anchor the shot on the recording's timeline (`tMs`).

From T1.8:

- `src/ui/App.tsx` starts the services (`startApp`) and shows the probe for every hash
  (`src/ui/route.ts`). Make `#/brew` the brew flow (T1.23 makes `#/` Home) and keep `#/probe`.
- `services.links.get({ kind: 'web-bluetooth' })` gives the transport and its recorder. Never
  make a second recorder (D-024).
- The wake lock already follows the links. Call `services.wakeLock.acquire()` in the connect
  tap, right after `transport.connect()`, as the probe does: Safari needs the tap.
- `useLiveUpdates` (`src/ui/use-live-updates.ts`) throttles redraws to the recorder's
  per-frame changes.
- Extend `scripts/e2e-probe.mjs`, or add a script beside it, for the Playwright smoke test.

From U1.1 session 1 (D-038): the app expects the scale in its timer mode, and the scale doesn't
report its mode. A `07` that doesn't start the timer means another mode. A timer that starts
without a command, or `03 0D` frames on FF12, mean the automatic mode. What the flow does then
(a warning, a prompt to switch, or carrying on) is a UX choice: ask the user.

From T1.20: put `BackupReminder` (`src/ui/AutoExportPanel.tsx`) at the top of the capture
screen too, as the probe has it (D-031). Call `services.autoExport.shotsChanged()` whenever the
flow creates or edits a shot.
It re-uploads the recording's file 10 s after the last change, once the recording has ended
(D-030). Last-used values go in `kv` (they travel with a full export); anything that must stay
on this device goes in `storage.local`. `scripts/e2e-lib.mjs` has the e2e helpers.

From the UI merge and session 1 (D-037, D-038, D-041):

- Spec v2 says the manual start tares and starts the scale's timer. In the timer mode `07`
  starts the timer, but whether it also tares is still open (A5). Don't rely on it: the live
  display keeps its own offset (T1.17).
- Weights come in tenths, the scale's step, so show them in tenths.

From T1.14 (D-047):

- On "shot done", `services.analysis.analyze(recordingId)` analyses the open recording as it
  stands. Nothing is cached and no post-hoc shot is made. Each shot comes back with its
  segment (`shots[i].segment.metrics`, `markers`, `flags`) and its ratio (`shots[i].match.ratio`).
- **Create the live shot first**, anchored inside the shot: between pump_on and the cup's
  removal, such as the moment the live view decides the shot is done. Matching allows 10 s
  outside (`MATCH_SLACK_S`). A live shot created only after the recording ended would race an
  analysis that adds a post-hoc shot for the same segment. Matching then prefers the live shot,
  but the post-hoc one stays in the store, unmatched.
- **The analysis needs the tail.** In the simulator, pump_off is found from about 4 s after
  the pump stops (2 s without vibration), and the yield is extrapolated until about 8 s.
  Analyse again as frames come in, or wait. A null metric means not yet, or never: the
  first-drip time is null without the pump's vibration (Q4).
- Show `refused-frames` (on `analysis.flags` and the segment's flags) when it's there
  (D-005, D-014).

From U1.1 session 2 (D-048): `pump_on` is the Tare + start tap (Q4), so pre-infusion and the
first-drip time are only as good as a tap made as the pump starts. Until the microphone (T3.1),
the waiting screen's manual start is how a shot starts. Its wording should ask for the tap with
the pump: the `Brew-Ready` mockup only says it tares and starts the timer.

From T1.16 (D-060–D-064):

- **"Shot done"** can come about 1 s after the pump stops: on the simulator's defaults, with the
  tap, a recording cut 1 s after the pump stops gives pump_off in 40 shots of 40 and the yield
  within 0.05 g in 39; from 3 s, all 40. The real machine's drip stops within about 0.8 s.
- **`MATCH_SLACK_S`** (10 s): check it against where the live shot anchors. Post-hoc shots
  anchor at pump_on, the tap.
- `settled` can read within a tenth of the final level, before the drain is quite over (shot B:
  0.15 s after pump_off): at 0.1 g that is all the readings say.

From T1.17 (D-065), the live pipeline is `ShotMonitor` (`src/core/live`):

- **The scale's commands:** Q9 is answered (D-066). For every monitor event, send what
  `scaleCommandsFor(event)` returns, in order, with `recorder.sendCommand(command, reason)`:
  `05`, `06`, `01` at `tare`; `05` at `shot-done`; `05`, `06` at `pump-lapsed`. The scale's timer
  then runs from each tap to its "shot done".
- **Wiring.** Make one per link, beside the probe's `ProbeMonitor` (`src/app/links.ts`). Feed it
  `recorder.onFrame` (`addFrame(frame, decoded)`) and `recorder.onEvent` (`addEvent(event)`). It
  starts afresh for each recording.
- **Its events:**
  - `tare`: tare the scale (the commands above).
  - `shot-done`: create the live shot, anchored at the event's `tMs` (inside the shot, as D-047
    asks), then run the analysis.
  - `pump-lapsed`: a tap with no liquid within 15 s; the view is back to waiting.
  - The rest say what changed: `cup-on`, `pump-on`, `first-drip`, `pump-off` (again after a
    dip), `cup-off`, and `cup-back` (the same cup put back after its shot: a pause, no tare).
- **The manual start** is `recorder.logUiAction(MANUAL_START)`, then
  `recorder.sendCommand(tareAndStartTimer(), MANUAL_START)`. The monitor reads the tap from the
  log, so nothing else needs calling.
- **The target:** call `setTargetG(yieldTargetG(dose, ratio))` whenever the recipe or the dose
  changes. `reset()` is a manual reset: it re-arms the tare and tares what is on the scale.
- **`snapshot()`** gives the `ShotDisplay`:
  - `phase`: idle, ready, running, tail or done;
  - `netG`, and `progress` (`remainingG`, `progress`, and `overTarget` past +1 g);
  - `flowGps`, and `elapsedMs` from the tap;
  - `pumpOffMs` (for "pump off at 32.0 s"), `firstDripMs`, and `series` for the graph.

  Show the grams in tenths.
- **Only the tap starts the live view** until T3.1 (D-065: liquid alone read beans and grounds as
  shots). While `ready` it still shows the net weight and the progress, so make the tap the
  screen's obvious action. Any vessel of 20 g or more counts as the cup until containers exist
  (T2.4). The screen decides which phase is open; the monitor only watches.

**Completed 2026-10-05** (D-067, D-068, D-069; the user answered Q10 and Q11):

- **The look** (D-069): `src/ui/theme.css` has the boards' `.look-instrument` tokens on `:root`,
  dark under `prefers-color-scheme`, and the base components by the boards' class names. The
  probe keeps its layout under `.probe` (`src/ui/app.css`) in the theme's colours.
- **The flow** (`src/app/brew-flow.ts`, `BrewFlows` in `services.brew`, one per link): attached
  while `#/brew` is shown, it answers the live shot (`LiveShot` in each link, fed from the link's
  first use) with `scaleCommandsFor`; the Start tap logs `manual-start` and sends `07`; at "shot
  done" it stores the live shot (anchored there, with the dose, recipe and default tags), flushes,
  and analyses the open recording now, at +3 s and at +10 s. Grades are stored as tapped; Save
  stores them all (channelling `false` if left off) and closes the card. The probe never
  attaches.
- **Settings** (`src/app/brew-settings.ts`, `BrewPreferences`, in `kv`): `lastUsed.recipe`,
  `lastUsed.doseG` (the dose stepper, Q10) and `tags` (the design's list, WDT and Puck screen on
  by default, Q11). The recipes are spec v2's prefilled list.
- **The screens** (`src/ui/brew/`): `ReadyView` (Brew-Ready, the "manual" variant), `LiveView`
  (Brew-Shot, with a "reached" state like Brew-Beans's), `ShotCardView` (Brew-Finish: the
  extraction row only, results from the analysis, a small chart from the live series, taste,
  channelling, tags with Add, Save). D-067 lists where they differ from the boards. The probe
  links to `#/brew` ("Brew a shot ›"); the brew screen's ✕ goes back to the probe until Home.
- **The schema** (D-068): the shot's snapshot fields, export format version 3, `beanBagId` →
  `packId`; older files import with the new fields null. `ShotDisplay` gained `cupG` and
  `cupOnMs`.
- **Tests:** `npm run check` (1569 tests), the build, and `npm run e2e` (probe 47, automatic
  export 29, the new `scripts/e2e-brew.mjs` 28: connect, tare, dose, tap, live view, card with
  its analysis, grades, Save, the kept dose, and the export's commands, shot and settings).
  Screens checked against the boards in screenshots, light and dark.
- **For the user** (`verify`): `docs/hardware-tests.md`, "The brew flow on the phone", D1–D7.
- **Next agents:**
  - Settings imported from a full export reach the brew flow after a reload: `BrewPreferences`
    is loaded once at startup.
  - Every "shot done" analyses the whole open recording three times: about 0.2–0.3 s each for 30
    minutes in Node. If the phone is slow, crop the analysis to the shot's neighbourhood.
  - `BrewFlow.state.card.display` keeps the live series for the card's chart; History (T1.19)
    draws from the analysis instead.

### T1.19 — History, shot detail and compare

**Status:** done · **Depends:** T1.14, T1.18 · **Read:** spec v2 "App structure and look"
(History), "What every shot records"; D-052, D-053; the boards `History`, `History-Detail` and
`History-Compare` in `design/ui-exploration/canvas/`

**Deliverables:**

- `#/history`: one row per shot with date and time, a small graph, the taste and the drink. A
  row opens the detail.
- Shot detail: a large chart with the pump-on, first-drip and pump-off markers and the target
  line; every metric; the phase results with their targets (the grind setting with the grind
  phase); the grades and tags, editable. Not the snapshot: the context is internal (D-056).
- Compare is a mode the user switches on: pick two shots (A, B); overlay weight and flow aligned
  at `pump_on` or `first_drip` (a toggle); a table in the form "A Δ B": the grind setting, the
  doses, every metric, the drink and the taste. No rows for the context the two shots share
  (D-056).
- Optional, for development: a debug view of a shot's snapshot (for example behind `?debug`),
  never on the normal screens (D-056).

Hand-rolled SVG is fine for now. A chart library can come with T3.3 (and if one is over about
20 kB gzipped, ask the user first).

Hide discarded shots. If history offers deleting a shot, set `discardedAtEpochMs` with
`updateShot` rather than removing the record, or re-analysis brings it back (D-019).

**Acceptance:** renders simulated shots, compare picks two, and the overlay alignment is
correct.

From T1.14 (D-047):

- **Post-hoc shots exist only for recordings the runner has analysed.** Run
  `services.analysis.reanalyzeAll()` once per `ANALYSIS_VERSION` (keep the last version run in
  `storage.local`), and `analyze(id)` when a recording ends. Then `analyze(id)` per recording
  gives each shot its segment, from the cache in milliseconds.
- **A shot with `segment: null` is unmatched** (`match.unmatched`: `no-segment` or `claimed`).
  Flag it, never drop it (D-007). An unmatched post-hoc shot the user never edited
  (`updatedAtEpochMs === createdAtEpochMs`) holds nothing the user entered, so History may hide
  it.
- `unclaimed` segments (pours, not espresso) aren't shots and stay out of History.
- **The detail chart needs the weight and flow**, which the cache doesn't keep. Read the raw
  recording and `analyzeRaw` it (about 30 ms), or add a per-segment series to the result with a
  version bump.
- `markers.pumpOn` is the Tare + start tap on the real scale (Q4, D-058), and null when there was
  none, so aligning at pump_on needs a fallback: first_drip.

From T1.18 (D-067, D-068):

- Live shots are anchored at "shot done" and carry `recipeName` (the drink), `doseG`,
  `targetRatio` and `milkRatio`; the rest of the snapshot is null until T2.1. The target is
  `doseG × targetRatio`.
- The grades on the detail edit the same fields as the card: `direction`, `channelled`, `tags`
  (the tag list is `services.brew.preferences`). Call `services.autoExport.shotsChanged()` after
  each edit.
- `src/ui/brew/ShotChart.tsx` and `chart.ts` (axes that grow from 0–40 s and 0–40 g, curves,
  markers) can draw the detail and the overlay; the shot card's styles are in
  `src/ui/brew/brew.css`.

**Completed 2026-10-05** (D-070; ARCHITECTURE "History"):

- **The curves** (`src/core/analysis/curve.ts`): each `SegmentAnalysis` carries `curve`, its
  liquid and flow every 0.2 s from 10 s before the shot to 10 s after it, smoothed for the eye
  (weight over 1 s, flow over 2 s) with short gaps bridged (session 2's shot A gushed through
  two steps at its first drip). The derived cache keeps it, so no screen reads raw;
  `ANALYSIS_VERSION` is 8. Markers and metrics are unchanged. The CLI prints the arrays on one
  line.
- **The service** (`src/app/history.ts`, `services.history`): `load()` runs `reanalyzeAll` once
  per analysis version (the version is kept in `storage.local` under `history.analysedVersion`),
  then reads every recording's results and lists the shots newest first, timed from pump_on
  (else the first drip, else the anchor); `entry(id)` reads one; `editor(shot)` gives a
  `ShotEditor` (`src/app/shot-editor.ts`) for the grades, stored in order and exported. It hides
  discarded shots and untouched post-hoc shots without a segment; other unmatched shots stay,
  flagged "Not found". A recording that ends while the app runs is analysed at once, and only
  then does automatic export look at it, so its file carries its post-hoc shots from the first
  upload (`startup.ts`).
- **The screens** (`src/ui/history/`, styles in `history.css`): `#/history` (board History,
  with Compare mode, sections "Last 7 days" and "Earlier"), `#/shot/<id>` (History-Detail: chart,
  eight metric tiles, phases, grades through the shared `src/ui/brew/Grades.tsx`, "Compare
  with…" → `#/history?pick=<id>`, and the shot record behind `?debug`), `#/compare/<a>/<b>`
  (History-Compare). The view logic is pure and tested: `plot.ts` (zero, axes, overlay
  alignment, label rows), `rows.ts`, `tables.ts`. The probe links to History ("History ›"), and
  History back to the probe ("‹ Probe") until the tab bar.
- **Tests:** `npm run check` (1623 tests: the curve against the liquid and the truth, the
  overlay's alignment on simulated shots with known pre-infusions, the service on a fake
  IndexedDB), the build, and `npm run e2e` (probe 47, automatic export 29, brew 30 with the shot
  in History, and the new `scripts/e2e-history.mjs` 17 on the real session-2 file: list, detail,
  a grade across a reload, `?debug`, Compare at both alignments). Screens checked against the
  boards in screenshots, light and dark.
- **Next agents:**
  - Each History load asks the runner for every recording (cached: a few IndexedDB reads each),
    and analyses open ones from raw. Fine for months of shots; page it if it gets slow (T3.3).
  - The detail's tag list is read when it renders: a tag added on the shot card shows there
    after the next render.
  - Nothing deletes a shot yet. If something does, set `discardedAtEpochMs` (D-019): History
    hides it, and the shot's page says it was deleted.

### T1.20 — Automatic export to a private GitHub repo

**Status:** verify (U1.2) · **Depends:** T1.6, T1.7 · **Read:** spec "Storage and export";
D-025, D-026, D-027, D-030; `docs/export-format.md`

**Goal:** back up every finished recording off the phone with zero taps, into a private GitHub
repo the user owns, **when the user has configured one** (D-027). Without a configuration
nothing changes: no uploads, no nagging, manual export as before.

The user has approved the destination and the credential (D-027), so don't ask about them again.

**Deliverables:**

- **A destination interface** in `src/app/`, for example `BackupSink` with `check()` and
  `upload(path, text)`, plus a GitHub implementation. Because D-027 says "for now", a later
  destination (iCloud via CloudKit, or the share sheet) must be addable without touching the
  queue.
- **The GitHub sink.** It uses the REST contents API: `PUT /repos/{owner}/{repo}/contents/{path}`
  with base64 content, the branch, and the current file's `sha` when updating. `api.github.com`
  allows CORS from the Pages origin.
  - Before the first upload, and whenever the settings change, it calls
    `GET /repos/{owner}/{repo}` and refuses unless `private` is true. A public repo would
    publish the recordings.
  - It uploads one file at a time, because two commits racing on one branch get a 409.
- **What gets uploaded, and when** (D-026):
  - Closed recordings only. Upload one when it ends, and at startup upload any closed recording
    not yet uploaded. That covers recordings ended by unclean recovery, and imported ones.
  - One file per recording with its shots, made by T1.7's `exportRecording` in the unchanged
    format.
  - A stable path per recording, so a re-upload overwrites the same file. For example
    `recordings/YYYY/MM/<recordingExportFileName>`.
  - Re-upload a recording, debounced, when its shots change after it has ended (a grade added
    later, for example).
- **A ledger and a retry queue** in device-local storage.
  - Per recording the ledger keeps the path, the blob `sha` and a hash of the last uploaded
    text, so an unchanged file is skipped.
  - When the ledger has no entry but the path already exists (a new device, or storage that was
    wiped), compare the two files before writing. Never replace a file with one that holds fewer
    records, and never delete anything in the repo.
  - Retry with backoff on network errors, 5xx and rate limits, both at the next app open and on
    the `online` event.
  - A 401, 403 or 404 stops the queue and shows "check the settings" rather than looping.
- **Settings** (rudimentary): owner, repo, branch (default: the repo's default branch), path
  prefix (default `recordings/`) and the token. A Test button runs the check above. The token
  field is write-only: once saved it shows as set, with Replace and Remove.
- **Status** on the home or probe page: off (not configured), the last export time, the number
  pending, and the last error.

**Acceptance:**

- Unit tests with a fake `fetch`:
  - a recording uploads once when it ends, and an open recording is never uploaded;
  - a changed recording updates in place with the right `sha`, and an unchanged one is skipped;
  - failures retry, and auth errors stop with a clear message;
  - a public repo is refused;
  - with no configuration, nothing calls the network.
- The token never appears in exports (`exportAll` leaves device-local keys out), events, logs
  or error text, and a test proves it.
- A Playwright check of the settings and status UI against a stubbed API.
- Status `verify` until the user has configured it on the phone (U1.2) and a recording appears
  in the data repo.

**Notes:**

- **Credentials:**
  - The user enters them on the device and they stay in device-local storage.
  - Never commit them, and never build them into the bundle: the Pages site is public, so a
    build-time token would be published.
  - If Safari deletes the app's storage, the token goes with it. The recordings are already in
    the repo, and the user enters the token again.
- **File size:** a 3-minute recording is about 145 KB, and a long idle session is a few MB.
  Check the contents API's size limits. If they bite, switch the sink to the Git data API (blob,
  tree, commit).
- **Entities:** they arrive with a later format version (T2.1) and need backing up too. Leave room for
  a metadata file in the sink.
- **From T1.7:**
  - `exportRecording(storage, id, { app })` makes one recording's file with its shots.
  - `importBundle` is idempotent, so restoring from the repo is just importing its files.
  - Keep device-local state (the token, the ledger) out of what `exportAll` writes as settings.
    Today that is every `kv` entry (D-025).
- **iCloud:** Safari's Download saves to Files › Downloads, which is in iCloud Drive by default
  (Settings › Apps › Safari › Downloads). So the manual Download stays the user's own iCloud
  copy. B7 records the actual location.
- **From T1.8:**
  - `startApp` (`src/app/startup.ts`) is where startup work goes. `services.recovery.ended`
    lists the recordings recovery ended as `unclean`, and they need uploading too.
  - `ScaleLinks.onRecordingsChanged` fires once an ended recording is stored and ended, which
    is when to queue its upload. `recorder.whenIdle()` resolves at the same point.
  - The probe page holds the recordings panel, so the auto-export status and settings can go
    beside it.
  - `npm run e2e` (`scripts/e2e-probe.mjs`) shows how to drive the build with Playwright. Stub
    `api.github.com` with `page.route()`.

**Completed 2026-10-04** (verify: U1.2 on the phone):

- `src/app/auto-export/`: `AutoExport` (the queue), `BackupSink` and `BackupError` (the narrow
  destination interface), `GitHubSink` (REST contents API), the ledger, settings and
  `compareWithRemote`. `startApp` starts it and passes `ScaleLinks.onRecordingsChanged` on;
  `services.autoExport` is in `AppServices`. D-030 has the design.
- **Device-local store:** `storage.local` (IndexedDB version 2, a new `local` store), never
  exported or imported. It holds `autoExport.settings` (with the token) and
  `autoExport.ledger.<recordingId>`.
- **Uploads:** closed recordings, not the simulator's, at `<prefix>YYYY/MM/<file name>`, one
  commit each, at least a second apart. At startup, when one ends, after an import, and 10 s
  after `shotsChanged()` (T1.18 must call it). A file the ledger doesn't know is created
  without a `sha`; GitHub refuses that if a file is there, and only then is it read and
  compared: equal → adopted, fewer records here → kept and the recording "held", otherwise
  replaced with its `sha`. Nothing is deleted.
- **Failures:** network, 5xx and rate limits wait 1, 2, 5, 15, then 30 minutes (a rate limit's
  own wait first), and retry at once on `online` or when the page is shown. 401, 403, 404 and a
  public repo stop, saying to check the settings, until Save or Retry; the next app start tries
  once more. GitHub's CORS preflight refuses `X-GitHub-Api-Version`, so the app doesn't send it.
- **UI:** an "Automatic export" panel on the probe, under the recordings: status, held
  recordings, Retry now, and the settings (owner, repo, branch, folder, write-only token with
  Replace and Remove, Save, Test). At the user's request (D-031), a reminder at the top of the
  page (`BackupReminder`) says while it is off or stopped that recordings aren't backed up, with
  a button to the settings.
- **Tests:** `FakeGitHub` (`fake-github.ts`) is an in-memory `fetch` that enforces the token,
  the `sha` rules and the CORS-allowed headers. The acceptance cases are in
  `auto-export.test.ts`, including the token test (exports, files, status, logs, requests).
  `npm run e2e` now also runs `scripts/e2e-auto-export.mjs` (24 checks against a stubbed
  `api.github.com`); the helpers moved to `scripts/e2e-lib.mjs`.
- **Next agent:** the status is computed, not stored; the last export time is the newest
  ledger entry. The exported format is unchanged. Hardware test B10 checks it on the phone.

### U1.2 — USER: set up automatic export

**Status:** user, later (D-031): the probe shows a reminder until it is done · **Depends:** T1.20

1. On GitHub, create a **private** repo for the data, for example `smart-scale-data`. It can
   be empty.
2. Create a fine-grained personal access token: Settings → Developer settings → Personal access
   tokens → Fine-grained tokens → Generate new token.
   - Repository access: **Only select repositories**, then pick the data repo.
   - Permissions: **Contents: Read and write**. Metadata: Read is added automatically.
   - Pick an expiry. When it runs out, the app stops and says the token was refused.
3. In the app on the phone (the probe page), scroll to **Automatic export**, open **Settings**,
   enter the owner (your GitHub user name), the repo and the token. Leave Branch empty and
   Folder as `recordings/` unless you want otherwise. Tap **Test**: it should say "It works".
   Then tap **Save**.
4. Connect to the real scale (simulator recordings aren't uploaded), record something short,
   disconnect, and check that a file appears in the data repo under `recordings/YYYY/MM/`. The
   status line says when the last export happened.
5. Recordings already on the phone are uploaded too, oldest first, one commit each.

Good to know:

- The token stays on the phone and is never shown again: Replace and Remove are the only
  options. If Safari deletes the app's storage, enter it again; the recordings are already in
  the repo.
- Every site at `https://misch0n.github.io/` shares the phone's storage for that address. If
  you publish other GitHub Pages sites from this account, their scripts could read the token.
  It can only reach the data repo.

To let an agent read the recordings (for example as fixtures for T1.16), add the data repo to
its session.

### T1.21 — Reconnect without re-pairing

**Status:** verify (U1.1: B3) · **Depends:** T1.4 · **Read:** spec "Re-pairing — check early";
D-029, D-071

Built ahead of hardware test B3 (D-029). B1 found `getDevices()` in both runtimes, so build the
optimistic path:

- Remember the scale, and reconnect with one tap, or automatically on load if that's permitted.
- Keep the chooser as the fallback whenever reconnecting fails.
- End as `verify` (B3).
- **If B3 shows it doesn't work:** T1.16 or the next agent documents the friction and asks the
  user whether to move the Capacitor wrapper (T3.4) up the order.

From T1.4: `reconnectKnownDevice()` looks for the last device id of this page session, then the
first device whose name starts `BOOKOO`. To survive a reload, persist `ConnectionInfo.device.id`
and add a way to pass it in. It has no timeout: in the CoreBluetooth-based shims it may wait
until the scale is switched on, and `disconnect()` cancels it.

From T1.7: if the device id goes into `kv`, leave it out of the full export, which writes every
`kv` entry as settings (D-025). Device ids are per origin and mean nothing on another phone.

From T1.20: put it in `storage.local` instead, the device-local store that no export or import
touches (D-030).

From T1.8: the probe's Reconnect known device button calls `reconnectKnownDevice` and shows its
error. Its result in B3 decides which branch above applies.

From the UI merge (spec v2, D-040): Home (T1.23) opens on "ready to brew", so a reconnect
without the chooser matters more than before. B3 decides which branch above applies.

From the user (2026-10-05): connect automatically, and keep retrying for a while until it
connects. On the phone, beacio sometimes works only after a reload. Two likely causes: beacio
injects `navigator.bluetooth` after the app has rendered (the probe reads it only on render),
or its permission for the site was "allow for one day" rather than "always allow on this
website". So:

- after load, watch for `navigator.bluetooth` (every 250 ms for about 10 s) and re-render when
  it appears; then reconnect to the known scale without a tap;
- keep retrying with a backoff while the page is open, since the scale may still be off. The
  status says so ("Waiting for the scale…"), with a way to stop;
- if the API never appears, say so, with a Reload button and the hint to always allow beacio
  on this site;
- B3 still decides whether a reconnect without the chooser works at all.

The user also asked whether an iOS Shortcut could open the app when the scale connects. It
can't: the scale never pairs with iOS itself (the page connects to it), so the Shortcuts
Bluetooth trigger never sees it. What works, and keeps beacio (a Safari tab, B9): an NFC tag
automation, the Action button or a Home Screen shortcut running "Open URLs" with the app's URL.
Reacting to the scale switching on needs a native app (T3.4).

From T1.17 (D-065): the live monitor starts afresh for each recording, so a reconnect mid-shot
loses the live view, though not the data. A reconnect that kept the recording would let it carry
on.

**Completed (2026-10-05, verify):** the design is D-071.

- `src/app/scale-connector.ts`: `ScaleConnector`, one per link (`link.connector`), started when
  `ScaleLinks` makes the link; every connect goes through it.
  - It remembers the scale of each connection in `storage.local` (`scale.knownDevice`,
    `{ id, name }`), never exported; the mock's link remembers it for the page only.
  - It looks for Web Bluetooth every 250 ms for 10 s (`transport.available`), then says it isn't
    there, and looks again when the page is shown.
  - With a remembered scale and `getDevices()`, it reconnects by itself on load, 1 s after a
    dropped link, and after a tap on Connect. Failed attempts are retried after 1, 2, 4, 8 s, then
    every 10 s, for as long as the page is open; showing the page tries at once. No attempt
    timeout: in the iOS shims an attempt may wait until the scale is on.
  - `no-known-device` (the browser lists no scale) stops it, and Connect opens the chooser.
    `choose()` cancels the attempt in progress and opens the chooser in the same tap.
    `disconnect()`, or any disconnect by the user, stops it until the next tap.
  - `connect()` is the Connect tap: without the chooser where it can, else the chooser.
    `connectionView()` is what the screens show.
- The transport: `available`; `reconnectKnownDevice(deviceId?)` looks for the remembered id,
  then this page's last device, then any `BOOKOO…`; `TransportError` `no-known-device`; and
  `disconnect()` leaves the status `disconnected` before it returns (now in the contract).
- The brew screen: the card shows "Waiting for the scale…" (Stop, Choose scale), "Looking for
  Bluetooth…", "No Bluetooth" (the beacio hint and Reload), or "Not connected" (Connect scale,
  and the last failure); the top bar says the same. `BrewFlow.connect()` is gone.
- The probe's buttons go through the connector (Disconnect reads Stop while not connected), and
  a line shows Web Bluetooth, `getDevices()`, the remembered scale and the failed attempts (B3).
- The screen wake lock is wanted while connected, or from a tap that connects, no longer while
  an attempt waits for the scale; every tap calls `ScreenWakeLock.retry()`, so a scale that
  reconnected with no tap gets the lock at the next one (Safari grants it only in a tap).
- `ScaleLinks.onRecordingsChanged` no longer fires after a failed connect, and `useLiveUpdates`
  re-renders once after subscribing (a change between the first render and the subscription
  was lost).
- Tests: the connector on the real transport against the unit fake (20), the transport's new
  paths, the links and the wake lock. `scripts/e2e-reconnect.mjs` (in `npm run e2e`) drives the
  brew screen in Chromium on a fake `navigator.bluetooth` that keeps its permission across
  reloads, injects late or never, switches the scale off, and refuses the chooser without the
  tap's activation: 19 checks.
- **The user's check**: R1–R7 in `docs/hardware-tests.md`, "The reconnect on the phone", which
  answers B3. If the phone can't reconnect without the chooser, document the friction and ask
  the user whether to move the Capacitor wrapper (T3.4) up.
- Not done: a reconnect mid-shot still starts a new recording, so the live view starts afresh
  (above). If B3 and B4 show the link dropping mid-shot, a later task could carry the shot
  across.

### T1.22 — Simulator to the first hardware answers

**Status:** done · **Depends:** T1.3, U1.1 (session 1) · **Read:** D-037, D-038, D-021,
`docs/hardware-tests.md` "Session 1", `fixtures/real/README.md`, `docs/ARCHITECTURE.md`
"Simulator"

D-021 asks for the simulator to follow each hardware answer as it comes in. Session 1 answered
enough to replace most of its guesses (D-037).

**Deliverables:**

- New `src/core/sim` defaults:
  - weights in 0.1 g steps (the frame still carries hundredths);
  - noise at rest small enough that a reading holds still, as the real one does: not one change
    in 92 s;
  - a sample every 100.7 ms, with the scale's clock 0.7% slow;
  - the timer in 100 ms ticks, one per sample, reading 100 ms in its first frame after a start;
  - a link whose connection interval is about 30 ms. Arrival gaps come in 91, 121 and 152 ms,
    and frames are late on the timer's line by a median of 16 ms (p95 33 ms);
  - the scale's modes (D-037, D-038), with the timer mode as the default:
    - timer: `04` and `07` start the timer, `05` freezes it, `06` zeroes only a stopped timer,
      and `04` doesn't resume a frozen one;
    - automatic: it tares as a cup goes on, and starts its own timer on the first liquid, with
      `03 0D` started and stopped frames on FF12. It ignores tare and `04` during that run,
      and `05` ends the run, zeroing the timer and the weight. `04` and `07` do nothing
      between runs;
    - flow rate: no timer. Model `04`–`07` as ignored, and mark that provisional until A4 and
      A5 are repeated.
- D-021 and ARCHITECTURE "Simulator" updated. Each assumption either cites its answer or is
  marked as still open.
- A test that compares an idle simulated session with the real fixture: the quantum, the
  sample period, the timer's step, the drift's sign and size, and the still reading.
- The tests built on the old defaults:
  - Each acceptance stays at the resolution it was agreed at. The D-035 and D-036 targets were
    agreed on the 0.01 g simulator, so those tests pin 0.01 g; the user re-agrees them in T1.16
    with the real vibration (A2).
  - Other tests take the new defaults where they can.
  - Re-measure first_drip, the pump markers, τ and the yield at 0.1 g, and update D-037's table
    with the result. That is T1.16's starting point.

**Acceptance:**

- `npm run check` passes on the new defaults.
- The comparison test passes.
- D-021 lists no assumption that session 1 contradicts.

**Notes:**

- The timebase needs no change for the real timer (D-037). Its acceptance ("within 5 ms despite
  ±50 ms of jitter") was measured with a 1 ms timer, so re-measure it with ticks and report the
  result.
- The analysis has no `ANALYSIS_VERSION` yet (T1.14 creates it), so there is nothing to bump.

**Completed 2026-10-04:**

- **The simulator follows session 1** (`src/core/sim`; D-021 rewritten, every choice citing S1
  or naming its open test). Defaults: 0.1 g steps; noise σ 0.012 g, so a reading at rest holds
  still while the scale's flow figure, now worked out before rounding, moves as the real one
  does; a sample every 100 ms of a clock −6,940 ppm slow (100.7 ms); a timer that counts samples
  and reads 100 ms in its first frame. On the link: 30 ms connection events, 5% of frames a
  connection event late (`retransmitProbability`, new), 1 ms of jitter, and no stalls.
- **The scale's modes** (`ScaleParams.mode`, default `timer`; `AUTOMATIC_MODE` holds the
  automatic mode's thresholds). The automatic mode tares a settled vessel, times its own run
  from 0.3 g of liquid (its first frame reads 1.1 s) and announces it on FF12 in the Mini's
  all-zero frame (`encodeEventFrame` takes sign bytes now). The flow-rate mode ignores
  `04`–`07`. `timerEvents` is gone: only the automatic mode sends `03 0D`.
- **Command timing, found by replaying session 1:** a stop or a reset shows in the next frame,
  a tare or a start a frame later, and `07` starts its timer a frame after its tare. Replaying
  S1's timer commands now gives its three timer runs to the tick (the comparison test does it).
  `docs/hardware-tests.md` records it.
- **The comparison test** (`src/core/real-fixtures.test.ts`): an idle simulated session against
  the fixture, for the 0.1 g step, the 100.7 ms period, the drift's sign and size (within
  50 ppm), the timer's ticks, 92 s of still reading with a moving flow figure, and the link
  (lateness median and p95, gap clusters); plus the replay.
- **Tests on the old defaults** (D-046): the targets the user agreed (D-035, D-036) and T1.11's
  usual shot pin 0.01 g (`AGREED_SCALE`); the rest take the new defaults. A few seed-bound
  checks were loosened, each with its reason; the timer tests follow the scale's semantics; the
  demo runs in the timer mode, so the mock's FF12 is quiet, and `npm run e2e` checks that.
- **Re-measured at 0.1 g** (D-037's second table, T1.16's starting point): first_drip p90
  0.37 s, pump_on median 0.26 s late with 8 of 100 missed, pump_off worst 0.16 s (by the
  variance in 49 of 100), τ worst 25%, yield worst 0.09 g. At 0.01 g the agreed targets hold.
  The timebase stays within 2.0 ms on the default link and 4.7 ms with ±50 ms of jitter.
- **For T1.16** (D-046): a knock within half a second after a tare can lose the shot window; at
  0.1 g one tail in 100 is too short to fit.
- Seen once: `src/app/links.test.ts` ("says when the stored recordings change…") failed in a
  partial run under load, and passed in six full runs since. It counts on fake IndexedDB
  finishing within a few `settle()` steps; if it fails again, give it more.

### T1.23 — Home screen and navigation

**Status:** verify (H1–H5) · **Depends:** T1.18, T1.19 · **Read:** spec v2 "App structure and
look"; D-052; the board `Main` (Home) in `design/ui-exploration/canvas/`

- A tab bar with Home, Brew, History and Setup. The brew phases hide it (focus mode).
- `#/` Home, the landing page: the scale's name, connection and battery, with T1.25's warning
  when it isn't in its timer mode; the live weight with
  tap-to-tare (the whitelisted `01`, logged through `recorder.sendCommand`); the container on
  the scale once T2.4 exists (placing a known one opens its phase, T2.5); the last shot with a
  small graph; last week's count and averages; a maintenance reminder when one is due (T2.10).
- Keep `BackupReminder` visible (D-031).

**Acceptance:** navigation works with the mock; Home renders with no shots, one shot and many.

From T1.14 (D-047): the last shot and the seven-day figures come from
`services.analysis.analyze(id)` per recording, cached. T1.19 says when to run `reanalyzeAll`.

From T1.18: `#/` still shows the probe, and the brew screen's ✕ ("End session") goes to
`probeHash(route.mock)` in `src/ui/brew/BrewScreen.tsx`: point both at Home. The tab bar's CSS
(`.tabbar`, `.tab`) is in `src/ui/theme.css`; the brew screens stay in focus mode without it.

From T1.21 (D-071): Home's scale card is `ConnectCard` (`src/ui/brew/parts.tsx`) with
`connectionView(link.transport.status, link.connector.state)` and `link.connector`; subscribe to
`link.connector.onChange` too. A link's connector starts when a screen first gets the link, so
Home, as the landing page, starts the reconnect on load. Tap-to-tare and the battery need the
link connected; the card covers every other state.

From T1.19 (D-070): the history's screens have no tab bar yet. Add it to `#/history`,
`#/shot/<id>` and `#/compare/<a>/<b>` (the boards show it on all three), drop History's
"‹ Probe" link and the probe's "History ›" link, and give `.history` room for the bar. Compare
mode's bar (`.compare-bar`, fixed at the bottom) then sits on top of the tab bar, as the board
draws it, and `.history.picking`'s bottom padding grows by the tab bar's height. The last shot and the week's figures can come from `services.history.load()`,
whose entries carry the segment and the time; `src/ui/history/plot.ts`'s `sparkline` draws the
last shot's small graph.

**Completed (2026-10-05, D-072):**

- `#/` is Home (`src/ui/home/HomeScreen.tsx`, `home.css`), and every unknown hash shows it. The
  scale's card: its name as the scale reports it, the connection, the battery, the live weight
  (`link.shot.snapshot().readingG`) and **Tare** (`01` through `recorder.sendCommand`, reason
  `home`); while not connected, the brew screen's connect body (`ConnectBody` in
  `src/ui/brew/parts.tsx`). Home gets the link first, so the reconnect starts there. Then the
  last shot (a link to its page) and "Last 7 days", from `History.load()` through the pure
  `src/ui/home/summary.ts`; without shots, one "No shots yet" card. Notices above the cards:
  route problems, the recorder's warnings, the backup reminder, load failures.
- The tab bar (`src/ui/TabBar.tsx`) is on Home, History, a shot, Compare and the probe, beside
  their `<main>`; `--tabbar-h` in `theme.css` is the room they leave. Setup is the probe (Q12)
  until T2.9. The brew flow has none, and its ✕ goes Home. History's "‹ Probe" and the probe's
  "Brew a shot ›" and "History ›" are gone; Compare mode's bar sits on the tab bar.
- Moved, unchanged: the icons to `src/ui/icons.tsx`, the recorder's warnings and the backup
  reminder to `src/ui/notices.tsx`, the notices' CSS and `.dot-off` (and a new `.dot-ok`) to
  `theme.css`.
- Not drawn yet, for their tasks: the container row (T2.4), the maintenance reminder (T2.10)
  and the mode warning (T1.25), each noted in its task.
- Tests: `summary.test.ts`; `scripts/e2e-home.mjs` (in `npm run e2e`); `e2e-reconnect.mjs`
  reloads on Home; `e2e-probe.mjs` and `e2e-history.mjs` reach the probe and History through
  the tabs.
- The user checks H1–H5 on the phone: Home connecting by itself, Tare, the tab bar clear of
  Safari's toolbar and the home indicator, the figures after a shot.

### T1.24 — Probe: record the microphone's sound levels

**Status:** verify (U1.1) · **Depends:** T1.6, T1.7, T1.8 · **Read:** D-049, D-048; spec v2 "Audio
viability, if pursued"; `src/platform/microphone.ts`; `docs/export-format.md`; ARCHITECTURE
"Recorder" and "Export format"; `docs/hardware-tests.md` B8 and "Session 2"

The scale can't see the pump (A2), so the microphone is the only automatic `pump_on` there will
be. The user chose to record its sound levels with every probe session, so that real shots, and
the surf before them, carry pump sound to design T3.1 on (D-049).

**Deliverables:**

- **A level meter in `src/platform/`.** It opens the microphone once, from a tap
  (`getUserMedia` needs the tap's user activation). It runs Web Audio (an `AnalyserNode`, or an
  `AudioWorklet` if Safari allows) and reports the energy in a few bands, in dB, about 20 times
  a second.
  - The bands are internal, but they must cover the pump's mains hum and its harmonics (50 and
    60 Hz, 100–120, 150–180), the broadband sound of a grinder, and the overall level.
  - Record the band edges with the stream, so the format describes itself.
- **A new raw stream.** The levels are raw records on the recording's `seq` and `tMs`, like
  frames:
  - append-only, never edited (hard rule 1);
  - complete records (hard rule 6);
  - compact: a frame row with a new source such as `mic` and the levels packed in its bytes is
    one way. Decide, and record it in DECISIONS.
  - The analysis must keep ignoring the stream until T3.1. The timeline already reads only
    FF11; add a test that proves it.
- **An export format version** (hard rule 7): the new source and its payload in
  `docs/export-format.md`, a migration in `EXPORT_MIGRATIONS` (version 1 files have no levels),
  and round-trip tests. T1.18's Shot change is a later version on top of this one.
- **The probe:**
  - a **Record sound** control that starts the meter for the rest of the recording (or until it
    is turned off);
  - a small live level display per band, so the pump's hum can be seen;
  - logging when it starts and stops, as app events.

  Open the microphone once and keep it open: each `getUserMedia` holds the scale's
  notifications back for 0.5–0.7 s (D-037). Try whether the Connect tap can start it too. If
  the runtime refuses, keep it a separate tap.
- **Automatic export** (T1.20) carries the new stream like any raw record.

**Acceptance:**

- With a fake audio source, levels reach storage at about 20 Hz, beside mock scale frames, in
  one `seq` order.
- An export holds them and imports again, and version 1 files still import.
- The analysis of a recording with levels equals the analysis without them.
- `npm run e2e` still passes.
- The status becomes `verify`: the user records a session on the phone with **Record sound**
  on and a surf and a shot in it, and the export carries the levels.

**Notes:**

- Whether the levels survive a locked screen or the page in the background is unknown (B4).
  Log when the meter stops, and why.
- This task doesn't detect anything. Detection is T3.1, by D-049's rule: the pump run the
  first drip falls into.

**Completed (2026-10-05, verify):** the design is D-050.

- `src/core/sound`: layout 1 (12 levels: octave bands from 40 Hz to 16 kHz, the 50 and 60 Hz
  harmonic combs, the overall level), `soundLevels`, and `encodeSoundFrame` and
  `decodeSoundFrame` for the `mic` frame's bytes.
- `src/platform/sound-meter.ts`: `startSoundMeter`.
  - It makes the `AudioContext` in the tap, then calls `getUserMedia` without echo
    cancellation, noise suppression or AGC.
  - It reads an `AnalyserNode` (FFT size 4096, no smoothing) every 50 ms.
  - It pauses while the context isn't `running` or the input is muted.
  - It stops when the track ends, the context closes, or something fails.
  - `fake-sound.ts` is the tests' microphone.
- `src/app/sound-capture.ts`: `SoundCapture`, one for the app (`ScaleLinks.sound`).
  - It records into every recording in progress: `record-sound`, then `sound-started`, the `mic`
    frames, `sound-input` and `sound-stopped`.
  - It stays on across recordings. **Record sound** works before Connect too, so Connect doesn't
    start it.
- The recorder:
  - `recordSound` stamps a level frame on the recording's clock. It isn't decoded or passed to
    `onFrame`, and it's counted in `stats.soundFrames`.
  - `logSoundStarted`, `logSoundInput` and `logSoundStopped` log the sound events.
  - `recording` returns the recording in progress.
- The model and export:
  - frames from the source `mic`;
  - the events `sound-started`, `sound-input` and `sound-stopped`;
  - **export format version 2**, with an identity migration, written up in
    `docs/export-format.md`.
- The probe's **Sound levels** panel: Record sound and Stop sound, a status line, and a level
  per band with a meter. **Try microphone** waits while the levels run.
- The tests:
  - the analysis is the same with and without levels (`recording-analysis.test.ts`);
  - levels reach storage at 20 Hz among the mock's frames, across two recordings, in one `seq`
    order (`links.test.ts`);
  - `npm run e2e` records Chromium's fake microphone, and its beeps show in the levels and in
    the export.
- **The user's check** is in `docs/hardware-tests.md` under "T1.24's check". It covers:
  - whether the meter starts in beacio;
  - whether the levels move with sound;
  - whether the scale keeps streaming;
  - whether the export holds `mic` frames.

  The background (B4) is unknown: `sound-input` and the gaps will show it.
- For T3.1: design on the levels of the user's next sessions. Each has a surf and a shot.
  `decodeSoundFrame` reads them back.

### T1.25 — Scale mode check on connect

**Status:** verify (M1–M5) · **Depends:** T1.4, T1.6 · **Read:** D-037, D-038, D-057;
`docs/protocol-notes.md` (the timer field, FF12)

The user's idea (D-057): check the scale's mode on connect and warn when it isn't the timer
mode, the only one that keeps the scale's timer in step with the app (D-038).

**Deliverables:**

- A pure function in `src/core` that reads the notifications after the check's `04` and says
  timer mode, not the timer mode, or unknown (too few frames). Another for the passive signs: a
  timer that starts without a command, `03 0D` on FF12, or a `07` whose timer doesn't start.
  Tests drive both with the simulator in each of its three modes (T1.22, D-038).
- A service in `src/app` that runs the check once connected, only while the scale is idle (timer
  at 0 and stopped, no shot under way): `04`, then `05` and `06` once the timer has moved. It
  sends through `recorder.sendCommand`, so the commands are logged. It keeps watching the
  passive signs.
- The warning, display only: in the probe's connection status now, and in Home's scale status
  with T1.23 (no mockup state yet: a caution line in the scale card, like the maintenance
  reminder). It clears once the timer behaves. The brew screen (T1.18) can show it as a caution
  notice like its others (`Notices` in `src/ui/brew/BrewScreen.tsx`).
- Mark the 0.5 s `PROVISIONAL(U1.1: T1.25 check)`.

**Acceptance:** the simulator in the flow-rate and automatic modes gets the warning, and in the
timer mode it doesn't; a reconnect while the timer runs sends nothing. `npm run check` passes.
Ends as `verify`: the user connects with the scale in the flow-rate mode (a warning), then in
the timer mode (no warning, and the scale's timer starts and resets once).

From T1.23 (D-072): Home's scale card is `ScaleCard` in `src/ui/home/HomeScreen.tsx`; put the
caution line inside it, under the weight (the card is `.scale`, its parts `.scale-body`). The
brew screen's notices are in `BrewScreen` (`RecorderWarnings` and `BackupNotice` come from
`src/ui/notices.tsx`): a mode warning there can sit beside them.

From T1.17 (D-065, D-066): the app stops the scale's timer at "shot done" and zeroes it with each
cup's tare, so it reads 0 and stopped when the Tare + start tap comes. A `07` whose timer
doesn't start is then the passive sign as designed. The exception is a tap with no cup put on
since the last shot, whose timer is still frozen at that shot's time. The live pipeline doesn't
check the mode: a tare that never lands just leaves it its own zero.

**Completed (2026-10-05, D-073):**

- The user's answers: the warning clears by the app checking again by itself, every 5 s while
  the scale is idle (Q13); the scale has a timer key the user may press, so a timer that starts
  with no command proves nothing and D-057's sign for it is dropped (Q14).
- `src/core/live/scale-mode.ts`: `timerStartVerdict` (pure: a `04` or `07` sent with the timer at
  0 `started` it if a frame within 1.5 s shows it above 0, `not-started` once five frames and
  0.5 s have passed without, else `unknown`) and `ScaleModeMonitor` (frames and events in; the
  evidence out: `started`, `not-started`, or an `03 0D` frame; the latest decides). Also
  `MODE_CHECK_REASON` (`mode-check`), `modeCheckStart()` and `modeCheckPutBack()`. Both windows
  are `PROVISIONAL(U1.1: T1.25 check)`.
- `src/app/scale-mode.ts`: `ScaleModeCheck`, one per link (`link.mode`, made in
  `ScaleLinks.get` after the live shot), whatever screen is open. It sends the `04` through
  `recorder.sendCommand` when the timer reads 0, no start is awaited, the live shot is `idle`
  (`LiveShot.phase`, new) and the mode isn't known to be the timer's; at most every 5 s
  (`MODE_RECHECK_MS`), on the frames' clock. After its own start: `05`, `06`, only while the
  live shot is still idle. `state`: verdict, evidence, `checking`, checks, error; per connection.
- The warning: a caution line across the foot of Home's scale card (`.scale-caution` in
  `home.css`), a caution notice on the brew screen (`ScaleModeNotice` in `src/ui/notices.tsx`,
  with the shared text `MODE_WARNING`), and a line in the probe's Connection panel
  (`modeStatus` in `src/ui/probe/format.ts`) with what it rests on.
- The simulator: a script `mode` action (the user switching modes; the timer assumed to stop at
  0), `ScaleSimulator.mode`, `demoScenario(seed, mode)`. The mock's routes take `&mode=` (kept
  by the links, `linkKey` `mock@<speed>/<mode>`), and the probe links to each mode.
- Every connection's recording now opens with the check's `04` (and `05`, `06` in the timer
  mode): the brew-flow tests and `scripts/e2e-brew.mjs` expect them. The analysis doesn't read
  timer commands, so nothing else changed (no `ANALYSIS_VERSION` bump, export format as it was).
- Tests: `src/core/live/scale-mode.test.ts` (the verdict, the simulator in each mode over 30
  seeds, the passive signs, a mode switch, a late start, the automatic mode's run announced a
  frame early), `src/app/scale-mode.test.ts` (the check on the mock in each mode, the re-checks,
  the warning clearing after a switch, a reconnect mid-shot, a tap during the check, a cup on,
  a failed write), sessions 1 and 2 replayed (`real-fixtures.test.ts`: session 1 reads
  automatic, then no timer, then the timer mode, as the user ran it), simulator tests for the
  switch, route and probe-format tests, and `scripts/e2e-home.mjs` (the warning on Home, the
  brew screen and the probe with `&mode=flow-rate`; none in the timer mode).
- The user checks M1–M5 on the phone. M2 also says what the real scale's timer does on a mode
  switch, which the simulator only assumes; if the check misfires, the probe's "Scale mode"
  line says on what.

### T1.26 — pump_off for a shot that gushes at its first drip

**Status:** done · **Depends:** T1.16 · **Read:** `docs/hardware-tests.md` "Session 3"; D-036,
D-059

The first brew with the app (session 3) pulled a shot whose flow gushed at the first drip, fell
to 0.5 g/s, climbed to 1.8 g/s and stopped dead. The analysis found no pump_off: the regime
change's coarse search took the climb's bend for the knee.

**Completed (2026-10-06, D-087):** the coarse regime change (`pump-markers.ts`) starts at most
`LAST_HIGH_LEAD_S` (5 s) before the flow is last at 80% of its high, so the stop outweighs the
start. The shot: pump_off 146.7 s (regime change), extraction 25.2 s, 34.8 g, τ 0.16 s. Session
2 is unchanged (shot B's pump_off moves 10 ms) and the 100-shot targets hold. Analysis version
11. The day's export is `fixtures/real/2026-10-06_first-brew_all.json` (serial masked), with
tests in `real-fixtures.test.ts`: the shot's markers and metrics, the milk (199.3 g in quick
pours), both bean pours and the grounds.

### T1.27 — Session 4 as a fixture: the second brew, with sound

**Status:** done · **Depends:** T1.24 · **Read:** `docs/hardware-tests.md` "Session 4"

**Completed (2026-10-06):** `fixtures/real/2026-10-06_second-brew.json`: the phone's 09:01
Export all trimmed to the session's three recordings with the app's own export code (format
4, as the phone wrote it; each recording line for line the phone's, the serial masked). Its
README section has the recordings. Tests (`real-fixtures.test.ts`): the shot (pump_on 267.5 s
from the tap, first drip 271.0 s, pump_off 301.6 s by the regime change, 37.9 g, 30.6 s of
extraction, `tail-too-short`), the shot's phases (beans 17.1 g, grounds 17.0 g) and the milk
(196.9 g), and the pump in the sound levels: the 40–70 Hz band's one long run above −85 dB runs
from the tap to pump_off, 15 dB over the grinder and 25 dB over the quiet. What the session
showed became T2.19–T2.21; the user answered Q33 (D-094).

### T2.1 — Entities: machine and baskets, grinders, recipes, packs, containers, tags, maintenance

**Status:** done · **Depends:** T1.5, T1.7 · **Read:** spec v2 "Equipment, coffee and settings
(v2)" (all subsections), "What every shot records", "Schema rules"; D-053

**Deliverables:** models, stores (a DB version upgrade) and export support for:

- `Machine` { name, pressureBar|null, baskets: [{ id, name|null, sizeG }], isDefault }. The
  basket's size is the beans target; the id lets same-size baskets be told apart later.
- `Grinder` { brand, model, settingKind: 'stepless'|'clicks', currentSetting, isDefault }.
  Seeds: Eureka ORO Mignon Single Dose Pro (stepless), Comandante C40 MK4 with Red Clix (clicks).
- `Recipe` { name, coffeeRatio, milkRatio|null }, seeded with spec v2's prefilled list; a milk
  ratio makes it a milk drink.
- `CoffeePack` { brand, name, weightG|null, roastDate (required), openDate|null,
  flavours: string[], finishedAt|null, buyAgain: boolean|null }. No stock (D-053).
- `Container` { name, emptyMassG, roles: ('bean'|'grind'|'cup'|'milk')[], dismissed warnings }.
- `Tag` { name, group|null, isDefault }.
- `Maintenance` { kind: 'descale'|'backflush'|'grinder-care', grinderId|null, lastDoneAt|null,
  reminderDays|null }.
- Last-used defaults in `kv`: machine, basket, pack, grinder, recipe.

Shots reference entities by id and carry the snapshot as values (T1.18 adds the fields).

Define the entities with `field` and `ObjectSchema` from `src/core/model/schema.ts`, and add
their samples to `completeness.test.ts`. `Grinder.settingKind` should match the shots'
`GrindSetting.kind` (D-019).

From T1.18 (D-067, D-068):

- The shot's snapshot fields exist (export format version 3): fill them from the entities at
  "shot done" in `BrewFlow` (`src/app/brew-flow.ts`), ids and values both. `beanBagId` is now
  `packId`.
- The recipes are a fixed list (`DEFAULT_RECIPES` in `src/app/brew-settings.ts`) and the tag
  list is the `kv` setting `tags` ([{ name, isDefault }]); the last-used recipe is
  `lastUsed.recipe`, by name. Seed the Recipe and Tag stores from them, and keep the user's tags
  and defaults. The dose stepper (`lastUsed.doseG`) stands in for the basket's size until the
  phases weigh the dose (T2.6, T2.7).

From T1.5: add the stores with a new migration at the end of `MIGRATIONS` in
`src/storage/db.ts`. Never edit an existing migration (version 2, T1.20, added `local`).
`db.test.ts` shows how to test an upgrade with data already stored.

From T1.7: entities in the export are a new format version (version 2 is T1.24's sound levels, version 3 T1.18's shot snapshot). Add a migration to `EXPORT_MIGRATIONS`
in `src/core/export/format.ts` (older files gain empty entity lists), extend
`src/core/export/document.ts` and `importBundle` (merge entities like shots: added, kept or
replaced), update `docs/export-format.md` and its version history, and test that version 1, 2
and 3 files still import.

From T1.20: automatic export uploads recordings with their shots. Entities need a backup too, so
add them to the GitHub sink, for example as a metadata file, under the same rules (D-027).
`AutoExport` (`src/app/auto-export/auto-export.ts`) uploads recordings only: give it a second
kind of item (say `metadata/entities.json`), with its own ledger key in `storage.local` and a
digest of the entities, and keep the rules of D-030: create without a version, compare on a
conflict, never replace a file with one holding fewer records, never delete.

**Completed (2026-10-05, D-074–D-076):**

- `src/core/model/entities.ts`: the six kinds (`ENTITY_KINDS`: `machines`, `grinders`,
  `recipes`, `packs`, `containers`, `tags`), each with `id`, `createdAtEpochMs`,
  `updatedAtEpochMs` and the tombstone `removedAtEpochMs` (removing never deletes, `isListed`
  leaves removed ones out), `normaliseEntity(kind, …)`, `createEntity`, `updateEntity`,
  `sameEntityIdentity`, `grinderName`, `packName`. Changed from the sketch above: maintenance
  lives on what it maintains (`Machine.descale`, `.backflush`, `Grinder.care`, each
  `{ lastDoneDate, reminderDays }`), there is no `isDefault` on machines or grinders (the
  default is the last used, in `kv`), the grinder's setting is `currentSetting` (null until
  set), and a pack's `finishedDate` is a date.
- `seeds.ts`: `SEEDS` with fixed ids at `SEED_EPOCH_MS` (the Gaggia Classic Pro at 6 bar with
  its "LM 17 g" basket, the ORO stepless and the C40 in clicks, spec v2's seven recipes, T1.18's
  seven tags), `isPristineSeed`, `DEFAULT_RECIPE_ID`. `legacy-settings.ts` converts T1.18's
  `tags` and `lastUsed.recipe` settings. Both frozen: the migrations use them.
- `snapshot.ts`: `shotSnapshot(context)`, which `BrewFlow` spreads into the live shot at "shot
  done": recipe, machine, basket, grinder and setting, pack and dates, the maintenance dates.
- Storage: database version 3 creates the six stores, adds the seeds and moves `kv`'s `tags` into
  the tags (the user's added ones and defaults kept) and `lastUsed.recipe` into
  `lastUsed.recipeId`. `storage.entities` (`create`, `get`, `update`, `replace`, `list(kind)`,
  `all`).
- Export format version 4: `entities` (every kind, removed ones too; `null` in a one-recording
  export). Migration 3 → 4 gives older full exports the lists, converting their T1.18 settings
  as the database does. `importBundle` merges entities like shots (conflicts by creation time),
  except that a seed nobody changed takes the file's version whatever the policy. `exportAll`
  carries them; the probe's import reports them.
- `src/app/entities.ts`: `Entities` (`services.entities`), the entities in memory, written behind
  in order, `onStored`, `reload()`. `BrewPreferences.load(kv, entities)` resolves the brew's
  settings (`resolveBrewSettings`): the listed recipes and tags, and the recipe, machine,
  basket, grinder and pack in use (the last used while listed, else the first; Espresso for the
  recipe; a pack only while unfinished). `setRecipe(id)` now takes an id; `addTag` adds a tag
  entity, or lists a removed one again. `SETTING_KEYS` has `recipeId`, `doseG`, `machineId`,
  `basketId`, `grinderId`, `packId`; only the recipe and the dose have setters so far.
- Automatic export: `<prefix>entities.json` (`exportEntities`), after the recordings, with its
  ledger entry `autoExport.entities`; only once something in the entities is the user's;
  `compareEntitiesWithRemote` holds the repo's file while it has an entity this device lacks or
  a newer version of one. `entitiesChanged()` after each stored change. Status
  `entitiesPending`, `entitiesHeld`; the probe says "your setup".
- Tests: completeness samples of every kind, the model, seeds and conversion, the repository,
  the upgrade from version 2 with T1.18 data, format 4 with files of versions 1–3, the import
  rules, `Entities`, `BrewPreferences`, the snapshot at "shot done", the entities' file against
  the fake GitHub; `scripts/e2e-brew.mjs` checks the shot names the seeded entities.
- For the next tasks: every live shot now records the seeded Gaggia, LM 17 g basket and ORO
  (no setting) until the pickers exist (T2.2, T2.3, T2.6) and Setup can change them (T2.9).
  Nothing on screen shows the entities yet but the recipe picker (from the stored recipes) and
  the tags.

### T2.2 — Coffee packs in the flow

**Status:** verify (P8–P9) · **Depends:** T2.1, T1.18 · **Read:** spec v2 "Coffee packs (v2)"; D-053

- The pack in the beans phase's ambient context (last used by default). Not on the shot card
  (D-056).
- Days off roast and days open derived for every shot from the snapshot's dates, kept with the
  shot for later analysis, not shown (D-056).
- Finish a pack by hand; the optional "would buy again" is asked then (Q5).
- No stock tracking: no remaining estimate, deduction or reconcile (D-053).

From T2.1 (D-074): packs are `CoffeePack` entities (`services.entities`); none is seeded, so the
user adds them (here or in Setup, T2.9). `BrewPreferences.value.pack` is the last used
(`lastUsed.packId`) while it isn't finished, else null; add a `setPack(id)` beside `setRecipe`.
Finishing is `entities.update('packs', id, { finishedDate, buyAgain })`, `finishedDate` a local
`YYYY-MM-DD`. The shot's snapshot already takes the pack's id, name and dates at "shot done".
The beans phase, whose ambient context holds the pack, comes with T2.6: where the pack picker
sits until then (the extraction screen's equipment card, beside the recipe, say) isn't drawn on
any board, so ask the user. From T2.9 (D-077): re-sequenced to come with T2.6, so the picker
goes where the board Brew-Beans draws it; `setPack` exists, and Setup adds, opens and finishes
packs.

**Completed with T2.6 (2026-10-05, D-080):** the Pack row of the beans phase's equipment
(`BeansEquipment`, `src/ui/brew/equipment.tsx`): open packs, then unopened (picked: opened
today), then None; Finish <pack> with the optional "would buy again" (`FinishPanel`). Days off
roast and open: `packAgeAt(shot, atEpochMs, offsetMinutes)` in `src/core/model/snapshot.ts`,
derived, not shown.


### T2.3 — Grinder and setting in the flow

**Status:** verify (P10) · **Depends:** T2.1, T1.18 · **Read:** spec v2 "Grinders (v2)", "Brew phases"
(ambient context); D-053

- The grind phase's ambient context: grinder and setting, last used by default, changeable in
  place; a change becomes the grinder's setting. Not on the shot card (D-056): with no grind
  phase, the shot records the grinder's current setting.
- The input fits the grinder: a decimal for stepless, an integer for clicks.
- Burr epochs are deferred (D-053): the grinder-care date in the snapshot covers the burr state.

From T2.1 (D-074): `BrewPreferences.value.grinder` is the last used (`lastUsed.grinderId`),
else the first listed (the ORO); add a `setGrinder(id)`. A setting changed in place is
`entities.update('grinders', id, { currentSetting })` (whole numbers for clicks, or
`normaliseEntity` refuses it); the snapshot takes `currentSetting` at "shot done".

**Completed with T2.7 (2026-10-05, D-081):** `GrindEquipment` (`src/ui/brew/equipment.tsx`):
the Grinder picker (`setGrinder`) and the Setting stepper, whose step updates the grinder's
`currentSetting` with a function of the current entity (0.1 stepless, whole clicks).

### T2.4 — Containers: registration, recognition, conflicts

**Status:** verify (K1–K6) · **Depends:** T2.1, T1.17 · **Read:** spec v2 "Brew phases", "Containers
(v2)"; D-041, D-052

- Learn an empty container's mass once, with its roles (bean cup, grind cup, cup, milk jug).
- Live recognition: a stable placement that matches exactly one container. The same weight on
  two containers is a conflict to fix; within 3 g a dismissible warning (a wet container).
  Anything ambiguous falls back to a manual pick.
- A post-hoc version in analysis labels segments with the container. Board: `Setup-Containers`.

From T2.1 (D-074): containers are `Container` entities (`name`, `emptyMassG`, `roles`, and
`dismissedWarningIds` for the "within 3 g" warnings the user dismissed), none seeded. The shot's
`containerId` is still null: set it at "shot done" from the recognised cup.

From session 1 (D-037): the scale reads container masses in 0.1 g steps and holds them still,
so the nearest match is sharp, and the 3 g band is for wet containers. A tare from the scale's
button sends nothing (A7), so the live pipeline must follow a jump to 0 itself, as `zeroTrack`
does after the fact.

From T1.23 (D-072): Home's scale card (`ScaleCard`, `src/ui/home/HomeScreen.tsx`) has no
container row yet. The board Main draws it under the weight: "Put a container down · A known
container opens its phase" while none is on, and the recognised one with "opens Beans ›" (T2.5
makes that open the phase).

From T1.14 (D-047): the analysis makes a post-hoc shot only for an `espresso` segment, and pours
stay `unclaimed`. Labelling segments by container should also keep a segment that a
container labels as something else from getting a post-hoc shot: a grinder whose vibration
reaches the scale would otherwise look like espresso. Add the label to `SegmentAnalysis`, with a
version bump.

**Completed (2026-10-05, D-078):**

- Registration and the clashes are T2.9's (Setup › Containers, D-077); Weigh & add now takes
  the vessel's mass as it was put on.
- `VesselMonitor` (`src/core/live/vessels.ts`): with nothing on, a stable rise of at least
  `vesselMinG` (3 g, `MIN_CONTAINER_G`) is a vessel put on; its mass settles for
  `vesselSettleMs` (3 s) within `vesselSettleG` (0.5 g); contents on top; off below half its
  mass. Events `vessel-on`, `vessel-settled`, `vessel-off`. `replayVessels` in `test-stream.ts`.
- `matchContainer(massG, containers)` (`src/core/model/containers.ts`): `known`, `ambiguous`
  (nearest first) or `unknown`; 0.3 g below to 3 g above, the nearest when clearly nearer
  (0.15 g).
- `LiveVessel` (`src/app/live-vessel.ts`, `link.vessel`): `vessel`, `onScale` (the match
  against the containers now, the pick, the container), `pick(id)`, `onChange`. `ScaleLinks`
  takes `containers`. The brew flow records `containerId` from it at the tap (else the first
  drip).
- Home (`ContainerRow` in `HomeScreen.tsx`): Put a container down; the container, Recognised or
  Picked, with its roles, linking to `#/brew`; Which container is it? with chips; Not a known
  container, linking to Setup (Q20).
- Post-hoc (`src/core/analysis/containers.ts`): `segmentVesselG` (the baseline less the level
  before the placing step), `segmentContainers`, `knownNotCup`. `AnalysisRunner` takes
  `containers`, returns `RecordingResults.containers`, and gives no post-hoc shot to a segment in
  a known non-cup container. Outside the cache: no version bump (D-078).
- Tests: the matcher, the monitor on simulated sessions, `LiveVessel`, the brew flow's
  `containerId` (recognised, ambiguous, picked), the runner's labels, and hardware session 2
  (the dosing cup 119.9/119.8 g, the shots' vessels as the analysis weighs them). The e2e
  `e2e-setup.mjs` checks Home naming the cup just learned.
- For T2.5: `link.vessel` says what is on the scale and which container it is, and its events
  are the phases' cues (a container put on opens its role's phase; a lift is a pause). The
  vessel back on after the grinder weighs the cup plus the grounds: `matchContainer` won't know
  it, so the phases must match "the bean cup plus about the beans" themselves (spec v2: "the
  bean cup returning at about the beans' weight minus retention"). Home's row should say
  "opens <phase>" and open it.

### T2.5 — Phase routing by container

**Status:** verify (P1–P7) · **Depends:** T2.4 · **Read:** spec v2 "Brew phases"; D-052

- Phases Beans, Grind, Extraction, Milk. Only the cup and the extraction are required; a
  skipped phase is recorded as skipped. Milk exists when the recipe has a milk ratio.
- Cautious transitions: open on a stable, unique match; a lift is a pause; end only on evidence
  that the next phase started (another known container, the grinder's sound once T3.1 exists,
  the bean cup back at about the beans' weight minus retention, or a tap). The cup doesn't start
  the extraction: the pump does (the tap now, the microphone later).
- The user can switch phase by hand at any time (the phase stepper).
- Display-only, built on the live pipeline; post-hoc phase labels in analysis (with T2.4's
  container label). The shot card (T1.18) collects the phase rows.

**Completed (2026-10-05, D-079):**

- `src/core/model/phases.ts`: `BREW_PHASES`, `MEASURED_PHASES`, the `phase` UI action
  (`PHASE_ACTION`, `{ phase, state, by }`) and `phaseChangeOf`.
- `PhaseRouter` (`src/core/live/phases.ts`): the routing above, `measure`, `pumpOn`,
  `pumpLapsed`, `shotDone`, `select`, `endMilk`; parameters `grindMinMs` 8 s and
  `retentionMaxG` 2 g provisional (P3). `VesselMonitor.contentsG` is null while a lift settles.
- The brew flow: a router per brew (`flow.phases`), fed by `link.vessel` and every frame while
  attached, and the shot monitor's pump on, lapse and "shot done"; each change logged with
  `recorder.logUiAction('phase', …)`; `flow.dose` (ground, beans, basket, set) sets the target;
  `selectPhase`, `endMilk` (re-analyses for the milk); "shot done" stores `beansPhase` and
  `grindPhase`, `doseG` null; Save skips a milk drink's untouched milk; the next brew starts on
  Beans when a bean cup is learned, else Extraction, and ignores what is still on the scale.
- The analysis (version 9): `measurePhases` (`RecordingAnalysis.phases`), `phasesOfShots`,
  `shotDose`; `matchShots` takes the dose for the ratio; `ShotResult.phases` and `.dose`;
  `HistoryEntry.phases`; the history's phase rows, target and dose column read them.
- The UI: `PhaseStepper`, `VesselCard` (replaces the cup card; picks between two containers),
  `BeansView`, `GrindView`, `MilkView` (`src/ui/brew/phases.tsx`); the extraction screen shows
  the dose's source, no stepper; the card's beans, grind and milk rows; Home's row says which
  phase a container opens.
- Tests: the router, the measurement on a simulated brew in phases, the flow through a whole
  brew (beans, the cup back with grounds, the shot, the milk) and its log, the e2e
  `scripts/e2e-phases.mjs` (6 checks), `e2e-brew` updated (38), `e2e-reconnect` (the vessel
  card).
- For the next tasks: the beans, grind and milk views have no equipment yet: T2.6 adds the
  machine, basket and pack pickers to Beans (board Brew-Beans; the basket picker sets the
  target), T2.7 the grinder and setting to Grind (and the last five retentions), T2.11 the
  milk ratio and the "Close to … · Not the jug?" warning to Milk. The views are in
  `src/ui/brew/phases.tsx`; the pickers can follow the recipe picker in `ReadyView.tsx`.

### T2.6 — Beans phase

**Status:** verify (P1–P2, P8) · **Depends:** T2.5, T2.2 · **Read:** spec v2 "Brew phases", "Live display";
D-052; board `Brew-Beans`

- Ambient context: machine and basket (the target is the basket's size) and the pack.

From T2.1 (D-074): the machine and basket in use are `BrewPreferences.value.machine` and
`.basket` (the last used, `lastUsed.machineId` and `lastUsed.basketId`, else the first: the
seeded Gaggia and its LM 17 g basket); add setters beside `setRecipe`.
- Live weight with progress towards the target; beans poured back (a lift) don't end it.
- Holds the taste nudge (T2.12).

From T1.14 (D-047): the ratio is the yield over the shot's `doseG`, so set `doseG` to the beans
weighed when there's no grind phase.

From T1.17 (D-065): `LiveWeight` (the zero across tares, the jumps, the smoothed weight, the
flow) and `pourProgress` serve this pour, and the milk's (T2.11), as they serve the extraction.

**Completed (2026-10-05, D-080):** T2.5 built the view (`BeansView`: the bean cup, the beans
against the basket's size, "beans poured back don't end it"); this adds its equipment:
`PickerRow` (a row with a grid, "was … · now the default") and `BeansEquipment` (Machine,
Basket, Pack) in `src/ui/brew/equipment.tsx`, on `BrewPreferences.setMachine`, `setBasket`,
`setPack`. The dose is the analysis's (D-079), so nothing sets `doseG`. The nudge is T2.12's
(the board draws it under the readout). Tests: `e2e-phases.mjs` picks a basket (the target
follows), an unopened pack (opened, in use) and finishes it.

### T2.7 — Grind phase

**Status:** verify (P3, P10) · **Depends:** T2.5 · **Read:** spec v2 "Grind phase (v2)", "Brew phases";
D-052; board `Brew-Grind`

- Ambient context: grinder and setting (T2.3).
- The result: the bean cup back at about the beans' weight minus retention, or the grind cup
  plus the beans. The grinder's sound confirms it once T3.1 exists.
- The dose is the ground weight; skipped, it is the beans weighed; both skipped, the basket's
  size.
- Retention is the difference of two 0.1 g readings, good to about ±0.1 g (D-037): show tenths
  only, no percentage, and trend it over shots rather than read single ones.

**Completed (2026-10-05, D-081):** T2.5 built the view (`GrindView`: the cup back with its
grounds, the ground weight from the beans) and the dose rule (D-079); this adds its equipment
(`GrindEquipment`) and the retention card: this brew's, and the grinder's last five
(`recentRetentions` over the history's entries, whose phases the analysis measured). The
grinder's sound (T3.1) isn't there yet. Tests: `recentRetentions`; `e2e-phases.mjs` steps the
setting and picks the other grinder.

### T2.8 — Field configurator

**Status:** dropped (D-053): few optional fields remain, and every field is stored, `null` when
not set.

### T2.9 — Setup screens

**Status:** verify (S1–S8) · **Depends:** T2.1, T1.23 · **Read:** spec v2 "Equipment, coffee and settings
(v2)", "App structure and look"; D-052, D-053; the `Setup*` boards in `design/ui-exploration/canvas/`

- `#/setup`: machine and baskets, grinders, recipes (the prefilled list, edit, add), coffee
  packs (finish, "would buy again"), containers, tags (default switches; seed "Experiment"),
  maintenance (T2.10), microphone (on or off; the calibration comes with T3.1), data export.
- Everything here is also changeable in place during the phases.

From T2.1 (D-074): the screens edit `services.entities` (`add`, `update`; removing is
`update(kind, id, { removedAtEpochMs: now })`, restoring sets it back to null), and each change
is stored behind and backed up by itself. "Make default" (board Setup-Grinders, the basket's
Default) is the last used in `kv`: `BrewPreferences` setters, not an entity field. The seeds
include "Experiment" already. Whether to offer Remove, and sorting tags by group, are this
task's. After an import, `services.brew.preferences.reload()` reads entities and settings
again (the probe does it).

From T1.23 (D-072, Q12): the Setup tab is the probe until this task (`TabBar`'s `setup` tab
points at `#/probe`). Point it at `#/setup`, and keep the probe as a row in Setup (the user's
answer). The backup reminder (`BackupNotice`, `src/ui/notices.tsx`) opens the automatic export
settings on the probe through `wantAutoExportSettings()`: point it at their new place. Unknown
hashes show Home (`src/ui/route.ts`).

**Completed (2026-10-05, D-077):**

- Routes (`src/ui/route.ts`): `Route.setup` (`SetupView`), `setupHash(view, mock)`;
  `#/setup`, `#/setup/<section>` (`SETUP_SECTIONS`: machine, grinders, recipes, packs,
  containers, tags, microphone, backup), `#/setup/pack/<id>` and `#/setup/pack/new`. The Setup
  tab opens `#/setup`; the probe is Setup's last row, with **‹ Setup**; `BackupNotice` opens
  `#/setup/backup` with the settings open.
- `src/ui/setup/`: `SetupScreen.tsx` (the list: Needs attention with the containers' open
  clashes, a row per kind with its summary from `format.ts`, the Data card's Export all with
  Download and Share, the automatic export, the probe), `MachineScreen` (name, pressure with
  Clear, baskets with Make default, Add basket, Remove), `GrindersScreen` (the one in use open:
  type, setting, brand and model; Make default; Add grinder; Remove), `RecipesScreen` (edit,
  New recipe, milk drink, Use next, Remove), `PacksScreen` (open, unopened, finished; Open;
  Finish in place with `FinishPanel`), `PackScreen` (age, fields, flavours, Finish, Not
  finished, Remove; the new-pack form), `ContainersScreen` (weigh on the connected scale: Weigh
  & add, Weigh again, roles; the clashes, Dismiss), `TagsScreen` (default switches, counts,
  rename, remove, add), `MicrophoneScreen` (disabled until T3.1), `BackupScreen` (the automatic
  export panel). `parts.tsx`: `SetupPage`, `TextField` (stores on leaving), `useDraft`,
  `DateField`, `Stepper` (hold to repeat, "Not set"), `LinkRow`, `useSetupUpdates`.
- Model: `containerClashes`/`openClashes` (`src/core/model/containers.ts`: the same weight
  within 0.05 g, near within 3 g, a dismissal per pair kept on the lighter container),
  `src/core/model/dates.ts` (`dayNumber`, `daysBetween`, `addDays`, `localDate`).
- App: `BrewPreferences.setMachine`, `setBasket` (a basket of the machine in use), `setGrinder`,
  `setPack` (refuses finished or removed packs); `Entities.update(kind, id, change)` takes a
  function of the current entity too.
- Tests: `format`, `containers`, `dates`, `route`, the preferences' setters, `Entities`; the
  e2e `scripts/e2e-setup.mjs` (35 checks: every screen, a container weighed on the mock, Export
  all with the entities, an import making a clash, Dismiss, a reload); `e2e-home` and
  `e2e-probe` reach the probe through Setup.
- For the next tasks: the maintenance cards of Machine and Grinders, and their Needs attention
  rows, are T2.10's (the boards draw them). Recognition (T2.4) matches against the listed
  containers' `emptyMassG`; `containerClashes` already says which pairs can't be told apart.
  The phases' in-place changes can reuse `Stepper`, `TextField`, `FinishPanel` (exported from
  `PacksScreen.tsx`) and the setters.

### T2.10 — Maintenance dates

**Status:** verify (N1–N4) · **Depends:** T2.1, T2.9 · **Read:** spec v2 "Maintenance (v2)"; D-053

- Three dates: descale, backflush, grinder care. "Done" stamps today; an optional interval
  raises a reminder on Home when it comes due.

From T2.1 (D-074): the dates live on the machine (`descale`, `backflush`) and each grinder
(`care`), each `{ lastDoneDate, reminderDays }`; "Done" is an `entities.update` with today's
local date as `YYYY-MM-DD`. The snapshot already records the machine's and the grinder's dates
at "shot done".
- The dates go into every shot's snapshot. Nothing else depends on them.

From T1.23 (D-072): Home has no maintenance card yet. The board Main draws it between the scale
card and the last shot: a row per due item ("Descale · 4 days overdue ›").

**Completed (2026-10-05, D-083):** `src/core/model/maintenance.ts` says when a date is due
(`maintenanceStatus`: due once the interval has run from the last done, `soon` the week before)
and lists the listed machines' and grinders' dates and reminders. The Machine screen has the
Maintenance section (descale, backflush), each grinder card its care (`MaintenanceBlock`: the
badge, "Last 1 Aug", the reminder, "Done today"; a tap on the dates sets the last done and the
interval, Q26). Home has a row per date due (`MaintenanceRow`), Setup's Needs attention the due
and the coming up, and Setup's Maintenance row the next one (Q27). Tests: the model's dates and
reminders, the badges and the stepper's intervals, and `scripts/e2e-setup.mjs` (done today,
dated back with a reminder, Needs attention, Home, a grinder's care, after a reload).

### T2.11 — Milk phase

**Status:** verify (P5, P11) · **Depends:** T2.1, T2.5 · **Read:** spec v2 "Brew phases", "Recipes (v2)",
"Live display"; D-052; board `Brew-Milk`

- Only for a recipe with a milk ratio. The jug recognised; the target is the espresso's yield ×
  the milk ratio; live progress; the grams poured go onto the shot card.
- The recipe's milk ratio as ambient context, changeable in place.
- The jug put down while the shot card is open adds the milk row. No milk entity, no stock.

**Completed (2026-10-05, D-082):** T2.5 built the milk view (`MilkView`: the jug, the target
from the yield × the milk ratio, Skip milk and Done, the card's milk row; D-079). This adds the
Milk ratio picker (`MilkEquipment`, the milk drinks; `BrewFlow.setMilkRecipe` makes it the
default and gives the open card's shot the drink), the vessel card's "Close to … · Not the
jug?" from `VesselOnScale.near`, and whole grams. The analysis (version 10) reads a phase's
vessel until it is lifted, past Done, and the flow analyses again as the milk settles, so a Done
tapped mid-pour still gets the milk; it also fixes T2.5's beans read off the cup back with the
grounds, and a fast pour taken for a vessel. Tests: `LiveVessel`'s near containers, the flow's
milk recipe change and Done mid-pour, the measurement's three cases; `scripts/e2e-milk.mjs`
(in `npm run e2e`) drives the milk end to end.

### T2.12 — The taste nudge

**Status:** verify (P12) · **Depends:** T2.3, T2.6, T1.18 · **Read:** spec v2 "Nudge, and learning
later"; D-054

- After a sour or bitter shot, the next beans or grind phase with the same machine, grinder and
  pack says which way to grind ("Last time it was bitter: grind a little coarser for a more
  balanced cup"). Dismissible; nothing after a balanced or ungraded shot.
- A pure function of the shots' metadata, no model. Unit tests.

**Completed (2026-10-05, D-084):** `tasteNudge` (`src/core/model/nudge.ts`) picks the newest
listed shot with the brew's machine, grinder and pack (none matching none) and says finer after
sour, coarser after bitter, nothing after balanced or ungraded (Q28). `TasteNudgeCard`
(`src/ui/brew/nudge.tsx`) shows it under the beans (board Brew-Beans) and the grind, with the
shot's day, time and setting; ✕ dismisses it per shot, kept in `storage.local`
(`NudgeDismissal`, `services.nudge`). The grind view loads the history once for the retentions
and the nudge. Tests: the nudge's rules, the dismissal across a restart, and
`scripts/e2e-phases.mjs` (a sour shot, the nudge on the beans and the grind, dismissed, still
gone after a reload).

### T2.13 — Learning from the data

**Status:** dropped for now (D-054). No learned windows, step sizes, dial-in states, readings
or data pointers. The snapshot (D-053) collects what learning would need; when it comes back,
it is a pure function of the history (hard rule 2), and three earlier notes still apply: give
any first-drip window a margin for first_drip's error at 0.1 g; don't mix `pump_on` sources
(tap, microphone) in one window; the model spans recordings while the derived store is keyed
per recording.

### T2.14 — The empty bean cup back keeps its beans

**Status:** verify (P13) · **Depends:** T2.5 · **Read:** `docs/hardware-tests.md` "Session 3"; D-079

In session 3 the empty bean cup, put back after its beans were weighed, counted the beans from 0
again: by itself in one recording (the router re-opened the beans for a bean cup), and after a
tap back to Beans in the next. The user's Bean cup has the bean role only, so the router's rule
for a cup back empty after the grinder (bean and grind cups only) didn't apply.

- `PhaseRouter`: a bean cup (whatever its other roles) back empty after its beans were weighed
  and `grindMinMs` off the scale ends the beans, done with their weight, and opens the grind.
- The weighed beans aren't lost to an empty cup put back: test the session's sequences
  (`phases.test.ts`, and the session's vessels and taps replayed from the fixture).

**Completed (2026-10-06, D-089):** `PhaseRouter.#phaseFor` (`src/core/live/phases.ts`): a bean
cup, whatever its other roles, back after its beans were weighed and at least `grindMinMs` off
the scale opens the grind, the beans done with their weight. Once the beans are done, a bean cup
put back opens nothing (sooner than `grindMinMs`, it stays the grind's); only a tap opens the
beans again, and the beans then weigh what the cup holds from that tap. A tap on another phase
also drops what the vessel carried in for the phase it opened. Tests: the sequences in
`phases.test.ts`, and session 3's vessels and taps replayed from the fixture through
`VesselMonitor` and `PhaseRouter` (`real-fixtures.test.ts`): at 75 s of the fourth recording,
after Grind and Beans tapped and the cup back empty, the grind is open with the beans kept; in
the third, at 95 s, 9.6 g. Both fail without the fix. The live beans read 17.6 g there where the
analysis has 17.1 g (a hand on the cup as it was lifted): display only, as before.

### T2.15 — ✕ ends the brew and resets the scale

**Status:** verify (P14) · **Depends:** T1.18, T2.5 · **Read:** `docs/hardware-tests.md` "Session 3"; D-066

The user: "stopping a brew early from the x should reset the scale: tare and stop/reset timers".
In session 3 a second Start with no shot left the scale's timer running after the brew was left.

- ✕ ends the brew: when connected, `05` (stop), `06` (reset), `01` (tare), logged with the
  reason `end-session`; the next brew starts afresh (a new router). A shot card that is open
  stays, as it does today.

**Completed (2026-10-06, D-090):** `BrewFlow.end()` (`src/app/brew-flow.ts`), called by the brew
screen's ✕ as it goes Home. Unless the shot card is open (then nothing: the card stays): when
connected, `endSessionCommands` (`src/core/live/scale-commands.ts`: `05`, `06`, `01`, reason
`end-session`); the open phase ends in the log (`PhaseRouter.end`: done if it weighed
something, else skipped, by the user), so the analysis measures it no further; the live shot
forgets a shot under way (`ShotMonitor.startOver`: idle, the tare armed), so a tap with no
shot never lapses into a stale timer and no card opens for an abandoned shot; and a new router,
which takes what is on the scale as its first vessel when the screen is next shown. The
analysis: `phasesOfShots` gives a shot nothing for a phase it records as skipped, so an ended
brew's beans or grounds never reach the next shot (not stored: no version change). Tests: the
monitor through the simulator (the timer stopped and zeroed at ✕, the next shot as usual), the
flow (the commands, an open card kept, not connected, the log, the next brew's first vessel,
the ended brew's beans kept from a shot that skips them), `phasesOfShots`, and
`scripts/e2e-brew.mjs` (a Start with no shot, then ✕).

### T2.16 — Home opens the brew for a container put down

**Status:** verify (K2–K4) · **Depends:** T2.4, T2.5 · **Read:** spec v2 "App structure and look" (Home:
"Placing a known container opens its phase"); Q31

- On Home, a known container put down (recognised or picked) opens the brew screen, which
  routes it to its phase. Only a container put down while Home shows: ending a brew with the cup
  still on doesn't bounce back.

**Completed (2026-10-06, D-091):** `useBrewOnPutDown` in `src/ui/home/HomeScreen.tsx`, with
the rule in `src/ui/home/put-down.ts` (`opensBrew`): on each change of `link.vessel`, a known
container on the scale opens `#/brew` (a history entry, so Back is Home) when the vessel went
on after Home opened, or was picked on Home. The vessel on as Home opened, and its pick, don't.
The brew screen routes it as it attaches. Tests: `put-down.test.ts`, and
`scripts/e2e-phases.mjs` (the demo's 110 g cup put down on Home opens the extraction; ✕ with it
on stays Home; the 95 g dosing cup put down next opens the beans). K2–K4 are rewritten for it.

### T2.17 — The scale mat: a container role, part of the platform

**Status:** verify (K7) · **Depends:** T2.4, T2.9 · **Read:** Q30; D-078; `docs/export-format.md`

The user's silicone mat (15.5 g) protects the scale. Put on while connected, the vessel monitor
took it for a vessel, so containers on it were its contents and weren't recognised.

- A container role `accessory` ("Scale accessory"): learned in Setup › Containers like a cup.
  Recognised as it goes on, it becomes part of the platform: the next vessel on it is weighed
  from it and recognised as usual. It opens no phase and gets no shot.
- Learning a container weighs what it added when it was put on, where the app saw that, so the
  mat (or any reading the scale wasn't tared from) doesn't count.
- Export format 5 for the new role value; version 4 files read unchanged.

**Completed (2026-10-06, D-092):** the role `accessory` (`CONTAINER_ROLES`, `isAccessory`;
"Scale accessory" in Setup › Containers, a chip that takes no other role: `toggledRole`).
`LiveVessel` takes an accessory on the scale (recognised as it goes on, picked, or learned
while on) into the platform: `VesselMonitor.absorb()`, so `onScale` never shows it and the next
vessel is put on from it, recognised by its own mass; the link tells the live shot
(`ShotMonitor.platform()`), so a heavy accessory isn't the cup and the cup on it gets its tare
(the 15.5 g mat is under the shot monitor's 20 g anyway). The router never sees it, so it opens
no phase; the analysis gives a segment in it no shot (`knownNotCup`). Learning a container
weighs the last thing put on (`useReading`): the vessel's mass, or what went on top of it, so a
cup put on a mat not learned yet weighs itself. Export format 5 (an identity migration). The
simulator has `mat-on`. Tests: the simulator, `VesselMonitor.absorb`, the shot monitor with a
40 g accessory, `LiveVessel` (recognised, learned while on, picked), the brew's beans weighed in
the bean cup on the mat (the full stack), the format (a version 4 file unchanged, an accessory
kept), `toggledRole`, `knownNotCup`; `scripts/e2e-setup.mjs` (the chip). Not done: the analysis
measures the phases without the containers, so a mat put on during a phase opened by a tap,
before its vessel, is taken for that vessel (D-092).

### T2.18 — Sound levels with every brew

**Status:** verify (P15) · **Depends:** T1.24, T1.18 · **Read:** Q32; D-049, D-050

- The brew screen's Connect tap also turns on the sound levels (T1.24's meter) for the
  recordings that follow, unless Setup › Microphone's "Record sound with every brew" is off
  (on by default, kept on the device).
- Safari may ask for the microphone each session (B8); a refusal leaves the brew as it is.

**Completed (2026-10-06, D-093):** `BrewSound` (`src/app/brew-sound.ts`, `services.brewSound`):
the switch, on by default, kept on the device (`storage.local`, `sound.withEveryBrew`), and
`tap()`, which starts the link's `SoundCapture` (T1.24) when it is on and the levels are off.
The brew screen calls it from every tap but those on `[data-no-mic]` (Start, ✕), after the
tap's own handler, in the same tap: so Connect's tap, or with a scale that connected by itself
(T1.21) the first other one. A refusal, or no microphone (`SoundCapture.state.lastStart`), isn't
asked again until reload; an error is, at the next tap. Turned off, the switch stops the levels
it started (not the probe's). Setup › Microphone has "Record sound with every brew", and its
row in Setup says which. Tests: `brew-sound.test.ts`; `scripts/e2e-brew.mjs` (the Connect tap
records the fake microphone's levels into the brew's recording), `scripts/e2e-setup.mjs` (the
switch, kept after a reload). Q34 asks whether the first tap is the right moment when there
is no Connect tap.

### T2.19 — The app's own tares seen when their reading comes first

**Status:** verify (P16) · **Depends:** T1.17 · **Read:** `docs/hardware-tests.md` "Session 4"; D-066

In session 4 the Start tap's `07` zeroed 128 g on the scale, and the reading of 0 arrived before
the app logged the command (seq 5859, then 5860). The live weight expects the app's tares from
their `command-sent`, so it took the step for 128 g gone: the shot read −128 g and counted down
from "162 g to go". The scale's reading for a `07` follows its write at once; for a `01`, a
frame later (every real recording so far).

- The live shot and the vessel monitor expect the `07`'s tare from the `manual-start` UI
  action, logged before the command is sent.
- And every tare the app sends from the moment it is sent (a recorder hook before the write),
  not only once it is logged.
- Test: session 4's shot replayed reads its yield, not −128 g.

**Completed (2026-10-06, D-095):** `announcesTare` (`src/core/model/events.ts`): a tare sent, or
the Tare + start tap (`manual-start`), logged before its `07`. `ShotMonitor` and
`VesselMonitor` expect a tare from either, and have `expectTare(tMs)` for the app.
`Recorder.onSending` says which command goes to the transport, with its time, before the write
(nothing logged); `LiveShot` and `LiveVessel` expect every tare from it. Tests: session 4's shot
replayed reads 0 at the tap and its yield after, not −128 g (it fails without the fix);
`live-tares.test.ts` (a tare's reading before its log keeps the cup on; Start's `07` from the
tap); the recorder's hook. The analysis read session 4 right already: it matches tares to steps
on both sides of the command.

### T2.20 — Tare at each phase's start, and wherever it helps

**Status:** verify (P17) · **Depends:** T2.5, T2.15 · **Read:** Q33 (answered, D-094); D-066, D-079

The user (session 4): "we should tare the scale at the beginning of each phase, if there is no
weight or only negative weight there", and "use taring more wherever appropriate as we are still
working with real weight": the scale's display should show what the app shows. In session 4 the
bean cup put down with Home showing was never tared (the live view's tare came before the brew
screen opened), and the coffee cup swapped in within a second for the bean cup wasn't either.

- At a phase's start (a tap, a container, the brew screen opening), with nothing on the scale
  and a steady reading that isn't 0 (negative, or the mat): `05`, `06`, `01`, reason
  `phase-tare`. Not while the shot pours. Not at the grind's start while the bean cup is off
  with its beans weighed: its tare from the beans phase makes the scale show the grounds when it
  comes back.
- An empty vessel on the scale as the brew screen opens, not tared since it went on: tared then.
- The live shot takes a vessel put on top before the shot (a cup swapped too fast to be seen
  off) for a new cup, tared.
- Setup › Containers tares the empty scale before a container is weighed.
- One tare at a time: none within a second of the last.

**Completed (2026-10-06, D-096):** `wantsTare` (`src/core/live/tare-rules.ts`): a steady reading
that isn't 0 with nothing on, or with an empty vessel (holding less than 0.3 g for the phase).
`BrewFlow` applies it as the screen opens (`attach`) and when a phase opens by a tap, or by a
container the live shot won't take for a cup (under 20 g): `phaseTareCommands` (`05`, `06`,
`01`, reason `phase-tare`). Not while the shot pours; not for the grind while the bean cup is
off with its beans weighed. The cup's own tare (the live shot's `tare` event) now waits for the
frame's end, once the vessel is routed, and isn't sent for a vessel carrying what its phase
weighs: the bean cup back with its grounds keeps them on the scale's display. One tare at a time
(`TARE_SPACING_MS`, 1 s). `ShotMonitor`: a vessel put on top before the shot with a jump (a cup
swapped too fast to be seen off) is a new cup, tared; a pour with no tap still counts from the
cup. Setup › Containers: `tareWhileEmpty` (`src/app/empty-scale-tare.ts`), a plain `01` (reason
`setup-tare`) once per spell with nothing on. Tests: the rule; the flow (an empty scale at a
phase's start, an empty cup as the screen opens, the grind waiting for its cup, none while
pouring); the swap (simulated, and session 4 replayed: the coffee cup tared at 201.8 s);
`tareWhileEmpty` with the mat learned; the T2.17 accessory test updated (the cup on a heavy
accessory is tared too now).

### T2.21 — The grind phase before its grounds

**Status:** verify (P18) · **Depends:** T2.7 · **Read:** `docs/hardware-tests.md` "Session 4"; D-081, D-089

The user (session 4): "when I lift the bean cup for grind it says the number of the bean measure
phase when there is nothing there. It shouldn't say 17 g retention but it should nudge us to put
down the bean cup for retention or skip the phase." The grind had been tapped open with the beans
still in the cup, so the live view and the analysis counted the beans as grounds.

- Live: the grind tapped open with a vessel on weighs only what that vessel comes back with,
  not what it holds at the tap (the beans).
- The grind view: no ground weight and no retention until grounds are weighed; it asks for the
  bean cup back with the grounds, and has **Skip grind**. No retention from 0 g of grounds.
- Analysis: a grind phase whose vessel was on as it opened weighs what that vessel comes back
  with after a lift, not what it held then (version 12).

**Completed (2026-10-06, D-097):** `PhaseRouter.select('grind')` with a vessel on, the grind
open or not, holds what the vessel has in it at the next measure (`#held`) and weighs only what
goes in from there, until the vessel comes off; what a cup carried back from the grinder stays.
Session 4 tapped Grind twice with beans in the cup (41.5 s, and 137.6 s after the empty cup came
back while the grind was open and beans were poured in again). `GrindView`: grounds under 0.3 g
(`HOLDS_NOTHING_G`) are none: the readout shows 0.0 as the other live readouts do, no
retention, and a card (`grind-wait`) asks for the bean cup with the grounds ("Grind the beans,
then put the cup back with the grounds." with a vessel on) beside **Skip grind**
(`skip-grind`, opens the extraction; the grind is skipped when it weighed nothing). Analysis
12: a grind whose vessel at its open is the very placement the beans were last read on weighs
only what it comes back with after a lift (`measure` hands the beans' placement on); the bean
cup back empty is a new placement, so grounds tipped into it count as before. The spans: a
phase's done logged with another phase's open by a container (the router logs both at once) is
ended by that open, so the cup back with its grounds is the grind's and the beans no longer
read the grounds (brew-flow's simulated brew: 17.2 g, was 16.9 g; D-082's rule never applied to
a real log). The fixtures: session 4's first grind is now null (was the beans, 17.1 g), and
session 3's first (9.6 g); the shots keep their beans and grounds. Tests: the router (the tap,
the tap on the open grind, ground on the scale, Skip grind), the analysis (the router's log
shape, tapped then skipped, tapped then back with the grounds, the cup back empty), session 4
replayed live and analysed, brew-flow's beans to 0.05 g, and e2e-phases (the card, Skip grind).
Not done: the milk tapped open with the shot cup on would count the espresso (not seen: the
milk goes into a jug).

### T2.22 — The grind tares its grounds away

**Status:** verify (P19) · **Depends:** T2.21 · **Read:** `docs/hardware-tests.md` "Session 5"; D-096, D-098

The user (session 5): "the grind phase tares unexpectedly and continued doing so which makes it
unusable". Grind was tapped with the bean cup at the grinder; it came back with 14.6 g of
grounds from 17.8 g of beans, outside the 2 g the router allowed, so the grind held nothing and
the cup's own tare went out, at that put-down and each one after.

- With the grind open, a bean or grind cup back carrying up to the beans (any retention) is the
  grounds; with no beans weighed, whatever it carries.
- The flow's guard then drops the cup's tare: the scale shows the grounds.

**Completed (2026-10-07, D-098):** `PhaseRouter.#carriedBack`: with the grind open, the upper
bound is the beans (or what the grind holds, if more) plus `carriedExtraG`, or none without
beans; the lower is `minResultG`. The 2 g `retentionMaxG` window only decides whether a cup
back opens the grind from the beans. The session's recording is a fixture
(`fixtures/real/2026-10-06_evening-grind.json`); `replayPhases` now takes a scale accessory into
the platform as the live vessel does. Tests: the router (3.2 g short, past the beans, no beans),
the flow on the simulator (no tare at the put-down nor after a lift; the scale shows 14.6 g),
and the recording replayed (the grind holds 14.6 g as the cup's tare comes, at 135 s); each fails
without the fix. The analysis had the grounds right (14.6 g).

### T2.23 — The beans put straight back aren't grounds

**Status:** verify (P20) · **Depends:** T2.22 · **Read:** `docs/hardware-tests.md` "Session 6"; D-098, D-099

Session 6: Grind tapped with the beans in the cup; the cup lifted and back 4.7 s later with the
beans, which T2.22's rule took for 17 g of grounds; and Ground showed the hand's 1 g push while
the cup was off. The user gave up that try with ✕.

**Completed (2026-10-07, D-099):** `PhaseRouter.#carriedBack` takes a cup back to the open grind
for its grounds only after `grindMinMs` off (8 s); back sooner it carries what it held, the
grind's. `PhaseRouter.carries(vessel)`: in the beans or the grind, a bean or grind cup carrying
from `minResultG` up to the beans (or `doseMaxG`, 30 g) and `carriedExtraG`; `BrewFlow` never
sends the cup's tare for one. `vesselOff` drops a grind under `liftNoiseG` (2 g, provisional,
P20) when the cup comes off with what Grind's tap held back. The session's brew is a fixture
(`fixtures/real/2026-10-07_morning-brew.json`). Tests: the router (back too soon, the lift's
push, `carries`), the flow on the simulator (no tare, Ground 0, the scale shows the beans), and
the recording replayed (no grounds at 68–80 s; the second try's 17.1 g; the shot 34.3 g and the
milk 217 g); each new one fails without the fix.

### T2.24 — The phases by the cups, no tap

**Status:** verify (P21) · **Depends:** T2.23 · **Read:** D-100

The user's rule (2026-10-07): no tap between the beans, the grind and the extraction. The beans'
cup lifted with the beans opens the grind; whatever that cup brings back is the grounds (no time
limit, no window around the beans); the coffee cup ends the grind with its last weight.

**Completed (2026-10-07, D-100):** `PhaseRouter`: `#beansCup` (the cup the beans are weighed
in, and its empty weight: the container's, or what it weighed as the beans went in);
`vesselOff` returns the changes, and opens the grind for that cup lifted with 0.3 g or more of
beans (`BrewFlow` logs them); `#isGrindCup`/`#grindCupBack`: with the grind open, that cup
back (no lighter than empty, up to `doseMaxG` 30 g more) carries the grounds; back empty, the
last weight stands (`#keepLast`). `retentionMaxG` and the 8 s rule for the grounds are gone
(`grindMinMs` still lets the bean cup back after a tap to Beans open the grind). `carries` uses
the beans' cup. Analysis 13: the grind's vessel is the beans' with up to a dose; put back empty,
the last grounds stand; no fixture changes. The grind view's note says the bean cup's empty
weight is taken off. T3.1 is the pump only (no steamer, no grinder). Tests: the router (the lift,
a lift with nothing weighed, whatever comes back, the empty return, past a dose), the flow on the
simulator (beans → grind → extraction with no tap, one tare, for the coffee cup), the analysis
(the grind from the lift, more than the beans, the last grounds kept); the T2.22/T2.23 tests
updated to the rule (beans put straight back are the grind's now, as the user said).

### T3.1 — Audio pump detection

**Status:** todo · **Depends:** T1.24, U1.1 (B8) · **Read:** spec "Audio viability, if pursued"

1. Check feasibility in the chosen runtime (D-016): `getUserMedia` needs HTTPS and a gesture.
   beacio runs only in a Safari tab (B9), and the spec says Safari re-prompts every session for
   sites that aren't installed, so expect a permission tap per session (B8 confirms). Bluefy's
   behaviour is unknown.
2. If it's viable, a detector of the pump from the sound levels (the 40–70 Hz band, see below).
   It drives `pump_on` and `pump_off`. Not the grinder (voices imitate it) nor the milk steamer
   (it only bears on the milk's volume): D-100. The phases move by the cups (T2.24).

Ask the user how audio should be recorded: raw audio is heavy, so per-band energies stored as
another raw stream may be enough.

**The sound so far (2026-10-07, three recordings with levels: sessions 4–6, all fixtures).** A
pump rule of the 40–70 Hz band above −80 dB and 5 dB over the 70–130 Hz band finds both shots:
session 6 from 260.6 s (the tap 260.36 s) to 292.4 s (the weights' pump_off 292.33 s); session 4
from 270.3 s (the tap 267.5 s; at −85 dB the run starts at the tap) to 301.6 s (pump_off
301.61 s); about −66 to −69 dB. It also finds session 6's temperature-surfing flushes (230.2–231.6
s, 237.0–240.6 s, the cup on and no liquid): real pump runs, so a shot needs the weight too, as
the live monitor's lapse does. No pump false positive in session 5's 9 minutes of conversation.
The grinder is broadband (70 Hz–4 kHz, the 40–70 Hz band near −95 dB): a rule of 70–130 Hz above
−80 dB and 15 dB over 40–70 Hz finds it (session 4: 155–177 s; session 6: 124–148 s), but voices
fire it all through session 5: the grinder needs a steadier signature (several bands at once,
held). No milk steaming has been recorded yet.

From U1.1 session 1 (D-037): in Safari with beacio, every `getUserMedia` call held the scale's
notifications back for 0.5–0.7 s. They then arrived together, none lost. So open the microphone
once, before the shot, and keep it open. Each of the seven tries was `granted`. Whether a prompt
appeared each time wasn't noted (B8).

**(v2, D-041)** The brew flow assumes the microphone starts the live view at pump start, can be
switched off in Setup, and always keeps the manual start. Its listening state shows on the
waiting screen (board `Brew-Ready`).

From U1.1 session 2 (D-048): the scale can't see the pump (A2), so the microphone is the only
automatic `pump_on` there will be. Until it works, the user taps. Two more `getUserMedia` tries
were granted, and each held the scale's notifications back again.

From D-049: T1.24 records the microphone's sound levels as raw data, so T3.1 can design and
tune the detector on real shots. The shot's `pump_on` is the start of the pump run its first
drip falls into, and a run with no liquid after it (the user's surf) never counts. Post-hoc,
that is a rule on the recording. Live, a run that ends without liquid resets the view. There is
no "ready" tap.

**(D-052)** The brew flow also uses the sound to tell grinding from brewing (the end of the
beans phase, the grind phase). Add a calibration in Setup that records the user's grinder and
pump once, as references for the detector.

From T1.17 (D-065): `ShotMonitor` takes the pump start only from the log (`isManualStart`). Add
the microphone's start as another input, with D-049's reset when its run ends without liquid. A
tap with no liquid within 15 s already lapses that way (`maxPreInfusionMs`).

From T1.18 (D-067): the extraction screen shows the board's "manual" variant ("Pump detection is
off", a full Start button) in `src/ui/brew/ReadyView.tsx`. With the microphone, switch to the
board's "microphone" variant (listening, its level, "Start manually" as the secondary button).

From session 4 (T1.27, `fixtures/real/2026-10-06_second-brew.json`): the first shot with sound
levels. The pump is the 40–70 Hz band at about −68 dB, steady from the Start tap to the pump's
stop (pump_off by the weights within 0.03 s); the grinder is broadband (70 Hz–4 kHz, −63 to −70
dB) with the 40–70 Hz band near −90 dB; quiet is about −99 dB. The "50 Hz harmonics" measure
rises for both, so it doesn't tell them apart. One shot: more with T2.18's levels before tuning.

### T3.2 — Keep-alive via `0x25`

**Status:** blocked (U1.1: A6) · **Depends:** T1.6

If the Mini honours `25`, send it periodically while connected, well before the auto-off
deadline. Send it with `recorder.sendCommand(keepAlive(), 'keep-alive')` (T1.6), so each one is
logged.

From U1.1 session 1 (D-037): the standby bytes hold the auto-off setting (15.0 min) and don't
count down, so A6 now watches whether the scale switches off while connected
(`docs/hardware-tests.md`).

### T3.3 — Richer charts and history analysis

**Status:** verify (F1–F3) · **Depends:** T1.19

- Filters: bean, days off roast, burr epoch, tags (for example the warm-up tag).
- Trends, such as first-drip time against grind setting within an epoch.
- A chart library, if it's worth the weight.

From T1.19 (D-070): the charts draw `SegmentAnalysis.curve` from the derived cache
(`src/ui/history/plot.ts` and `HistoryChart.tsx`); a richer chart can use it without raw.

**Completed (2026-10-05, D-085):** `filters.ts` (`applyFilter`, `filterOptions`,
`filterSummary`) filters the history's entries by their snapshot: the pack, days off roast then,
the grinder and "since its care" (the burr epoch's stand-in), tags, taste. `trends.ts` (`trend`,
`trendChart`, `slopeText`) draws a figure against the grind, the days off roast or the day, with
a least-squares line. History's Filter panel (`HistoryFilters.tsx`) and, once filtered, the
`TrendCard` above the list; both kept while the app runs. No chart library: a small SVG. No
board draws either (Q29). Tests: the filters, the trend's points, fit, geometry and words, and
`scripts/e2e-trends.mjs` (simulated shots at five grind settings, imported; in `npm run e2e`).

### T3.4 — Capacitor wrapper

**Status:** todo · **Depends:** the T1.21 outcome · **Read:** spec "Scope and platform"

- A native shell with `@capacitor-community/bluetooth-le`, implementing `ScaleTransport`.
- Background BLE.
- Xcode and signing (the user).

Only if the shim browser's re-pairing friction proves annoying in daily use.

From the user's question (2026-10-05, T1.21): only a native app can react to the scale switching
on. With a pending CoreBluetooth connection to the known scale (or a background scan, if the scale
advertises its service: A14), iOS wakes the app when it connects, and the app can post a
notification. It still can't bring itself to the front.

### T3.5 — UI polish

**Status:** verify (V1–V2) · **Depends:** M3

- The Instrument look is already applied by the first UI task (D-045). This is the remaining
  design pass against the mockups, accessibility, and the large-number live display.
- Upgrade Preact to 11 once `@preact/preset-vite` supports it (D-001).
- From T1.25 (D-073): the mode warning has no board. It is a caution line across the foot of
  Home's scale card (`.scale-caution`, after board Brew-Milk's caution line) and a caution
  notice on the brew screen; design both with the rest.

**Completed (2026-10-05, D-086):** every main screen compared with its board, side by side: they
follow them; fixed the live view's recipe row (coffee ratio only), the milk's target note
(under the readout) and the card's milk line (14 px). `scripts/e2e-a11y.mjs` (in `npm run e2e`)
audits every screen with axe-core, WCAG 2.2 A and AA and best practices, in both modes: clean
after adding the brew views' screen-reader heading, the automatic export's `h1` and the
recordings table's header. A focus ring in the accent; the toggle respects reduced motion. The
large-number live display was already the boards'. Left as they are: the card's extraction row
has no link to Brew-Shot (the board draws one), the mode warning keeps its caution styling, and
Preact stays on 10 (the preset still pins prefresh 2.4). Next agent: rerun the audit after any
UI change (`node scripts/e2e-a11y.mjs` after `npm run build`).

---

## Progress log

One line per finished task, newest last: `date · task · what changed`. The details are in the
commit, found with `git log --grep='(T#.#)'`.

- 2026-10-03 · T0.1 · Spec committed; plan, agent manual, architecture, decisions, protocol
  notes and hardware tests written.
- 2026-10-03 · T0.2 · Toolchain scaffold: Vite + Preact + TS + Vitest + ESLint (boundary rules)
  + Prettier; capability-table home page.
- 2026-10-03 · T0.3 · CI (check + build on every push) with GitHub Pages deploy from `main`;
  SessionStart hook installs dependencies in cloud sessions.
- 2026-10-03 · T1.1 · Protocol codec in `src/core/protocol/`: UUIDs, checksum, command
  whitelist with a runtime check, frame decoder and weight-frame encoder, hex, failure counter.
- 2026-10-03 · U0.1 · Pages live; Bluefy and beacio both expose all eight APIs the app checks
  for (B1); the user prefers beacio (D-016), which works only in a Safari tab, not from a
  home-screen icon (B9). M0 is complete.
- 2026-10-03 · T1.2 · Core data model in `src/core/model/`: UUIDv7 ids, runtime schemas and
  normalisers, `Recording`, `RawFrame`, `AppEvent`, `Shot`, and one `seq` shared by frames and
  events.
- 2026-10-03 · T1.3 · `ScaleTransport` contract, shared command queue and `MockTransport` in
  `src/transport/`; deterministic scale and BLE simulator with ground truth in `src/core/sim/`.
- 2026-10-03 · T1.4 · `WebBluetoothTransport` (verify: B2 on the phone), with
  `reconnectKnownDevice` via `getDevices()`, tested against a fake `navigator.bluetooth`; status
  listeners see statuses in order.
- 2026-10-03 · T1.5 · IndexedDB storage in `src/storage/`: add-only raw (one chunk per append,
  a seq check), recordings, shots, derived and kv repositories, the `RecordingWriter` batcher,
  a connection that reopens itself, and `requestPersistence()`.
- 2026-10-03 · T1.6 · Recorder service in `src/app/`: every notification stored from connect
  to disconnect, app events on the same timeline, the smoothing check with one retry, live
  stats and warnings, and unclean recovery guarded by Web Locks.
- 2026-10-04 · T1.7 · Export format v1 (`docs/export-format.md`) in `src/core/export/`, export
  and idempotent import in `src/app/export.ts`, whole-recording import in one transaction, and
  an export and import panel on the home page (download, share sheet).
- 2026-10-04 · T1.8 · Probe screen on `#/probe` (verify: U1.1): startup wiring with persistence
  and unclean recovery, one transport and recorder per kind, live diagnostics, commands,
  annotations, the microphone, the wake lock, and export; `npm run e2e` drives it with the
  mock.
- 2026-10-04 · T1.20 · Automatic export to a private GitHub repo when set up on the phone
  (verify: U1.2): a queue with a ledger in a new device-local store, a narrow sink with a
  GitHub implementation, compare before replacing, retries and stops, and a settings and
  status panel on the probe.
- 2026-10-04 · T1.20 · The user sets up automatic export later (U1.2, D-031); until it runs, a
  reminder at the top of the probe says the recordings aren't backed up.
- 2026-10-04 · T1.9 · Timebase in `src/core/timebase/`: device runs mapped onto the arrival
  clock with one robust least-squares rate per recording and each run's least offset, arrival
  time elsewhere, simulator ground-truth tests (D-032).
- 2026-10-04 · T1.10 · Signal toolkit in `src/core/signal/`: resampling, Savitzky–Golay by least
  squares with fitted ends, O(n) rolling statistics, CUSUM with a retrospective change point,
  weighted line fits, robust statistics and step helpers (D-033).
- 2026-10-04 · T1.11 · Segmentation in `src/core/analysis/`: steps on the samples (tares from
  the log or a single jump to 0, vessels, other), zero-tracking, stable stretches on the backed
  grid with a q/√12 floor on σ, and shot windows with baselines from a stable second;
  simulator ground-truth tests (D-034).
- 2026-10-04 · T1.12 · Liquid markers in `src/core/analysis/`: first_drip (CUSUM, then a
  millisecond rise fit), w(pump_off), the tail fit (τ, w_final), settled (measured or
  extrapolated) and cup_removed with the honest yield, given pump_off; the user chose a
  statistical first_drip acceptance (D-035).
- 2026-10-04 · T1.13 · Pump markers in `src/core/analysis/`: pump_on from a split of the
  pre-drip noise (vibration shown, mean stationary, knocks out), pump_off from a knee fit (the
  variance step when the vibration shows, else the regime change, flagged), and `shotMarkers`
  for all markers of a window. The user chose a statistical pump_on acceptance (D-036).
- 2026-10-04 · U1.1 · Hardware session 1 recorded, without a shot. Weights come in 0.1 g steps
  and hold still at rest. Samples come at 9.93 Hz; the timer counts 100 ms ticks on a clock 0.7%
  slow, and the scale sometimes ignores timer and tare commands. The weight is net, and FF12
  sends `03 0D` events. The recording is the first real fixture, with tests. T1.4 done, T1.22
  added (D-037).
- 2026-10-04 · U1.1 · The user's account of session 1: the scale went from its automatic mode to
  flow rate to timer, and the commands it ignored were outside the timer mode. The app runs the
  scale in its timer mode (D-038).
- 2026-10-04 · UX · Spec v2 (`docs/spec-v2.md`) folds in the UI/UX exploration (D-039–D-044):
  Home, Brew, History and Setup, the Instrument look, configurable phases, new grading, the
  shot reading, pointers and the learned bag model. UI and Phase 2 tasks reworked; T1.23 and
  T2.9–T2.13 added; Q2, Q3 and Q5 answered; Q6 and Q7 opened.
- 2026-10-04 · UX · Q6 and Q7 answered (D-045): "Channelled" is a default-off tag; the first
  UI task applies the Instrument look, and hard rule 9 now says so.
- 2026-10-04 · UX · Merged `ui-style-exploration` into main. Its decisions are now D-039 to
  D-045 and its Home task T1.23 (main had taken D-037, D-038 and T1.22). The Phase 0 answers
  moved to spec v2's unknowns table, and `docs/spec.md` is verbatim again. Notes on fitting the
  UI direction to the hardware answers went into T1.14, T1.18, T1.21, T2.4, T2.7 and T2.12.
- 2026-10-04 · T1.22 · The simulator follows session 1: 0.1 g, still at rest, 100.7 ms on a slow
  clock, a tick timer, commands a frame apart, the timer, automatic and flow-rate modes, and a
  link with retransmissions. A test holds it against the fixture and replays its timer
  commands. The agreed targets' tests pin 0.01 g (D-046); D-037 has the numbers at 0.1 g.
- 2026-10-05 · T1.14 · `analyzeRaw` runs the whole analysis into a JSON result stamped with
  `ANALYSIS_VERSION` 1 and every parameter, with the spec's metrics from the markers.
  `matchShots` matches shots to their segments and wants post-hoc shots for espresso only
  (D-047). `AnalysisRunner` caches ended recordings' results, adds post-hoc shots in one
  transaction, and re-runs history (`reanalyzeAll`). Simulated metrics are within the agreed
  targets at 0.01 g, and D-037's limits apply at 0.1 g.
- 2026-10-05 · T1.14 · A review found that post-hoc shots piled up when two shots poured into
  one cup and the first one's settled came out inside the second. Shot spans no longer overlap,
  near ties go to the later segment, and a post-hoc shot is asked for only where it would claim
  its segment. Also: the cache checks `lastSeq` against late records, the timeline's parameters
  are validated, and `SegmentFlag` is built from the flag lists (D-047 revised).
- 2026-10-05 · U1.1 · Hardware session 2 (D-048): beans, grounds and two real shots. A2: the
  pump's vibration doesn't show, and the user chose the Tare + start tap as `pump_on` (Q4). In
  the timer mode `07` also tares. The drip stops within a second of pump off, and some tenths
  come a hundredth short at rest. The fixture has its serial number masked, and its tests include
  three `it.fails` for T1.16. T1.16 is unblocked.
- 2026-10-05 · U1.1 · D-049, the user's decisions. The probe will record the microphone's sound
  levels (T1.24, the next task), because the session 2 tries were only access checks. With the
  microphone, the shot's `pump_on` is the start of the pump run its first drip falls into, so the
  surf before each shot never counts.
- 2026-10-05 · U1.1 · The user confirmed the modes (D-038). The mode is set on the scale, not by
  command. The flow-rate mode has no timer, which answers A4, and the automatic mode decides for
  itself. The timer mode is the one the app controls, and the only one whose timer stays in step
  with the app.
- 2026-10-05 · T1.24 · verify. The probe records the microphone's sound levels with **Record
  sound**: 12 levels in dB, 20 times a second, as `mic` frames on the recording's timeline, with
  the events `sound-started`, `sound-input` and `sound-stopped`. One meter serves the app and
  stays on across recordings (D-050). The export format is now version 2, and version 1 files
  still import. The analysis ignores the levels until T3.1. The user checks it on the phone.
- 2026-10-05 · T1.15 · `npm run analyze`, for agents to look at real recordings. It prints the
  analysis of every recording in export files as JSON, with the pump detectors' diagnostics, the
  shot matching and, for a simulated session, the error against its truth. It draws an SVG or PNG
  chart per recording and per shot window. Node runs `src/` as it is, with no build step and no
  dependency (D-051). The charts found that zero-tracking keeps a tare-button press's load (a
  note for T1.16).
- 2026-10-05 · UX · Round 4 (D-052–D-054): the brew flow with ambient context, live progress and the
  shot card; machine and baskets, recipes, packs without stock, maintenance dates and a per-shot
  snapshot; grading back to taste, channelling and tags with one nudge; learning dropped for now.
  T2.8 and T2.13 dropped; T1.18, T1.19, T1.23 and T2.1–T2.12 rewritten.
- 2026-10-05 · UX · Canvas redrawn to round 4: every board on "Screens v2" matches spec v2;
  `Setup-Shot` → `Setup-Recipes`, `Setup-Brew` → `Setup-Microphone`, `Setup-Milk` removed;
  `design/ui-exploration/brief.md` lists what each board shows.
- 2026-10-05 · UX · Crema dropped (D-055): the mockups keep only the Instrument look; the Crema
  copies and the round-1 Crema, Native and Signal boards are removed from the canvas and the repo.
- 2026-10-05 · UX · Context is internal (D-056): the shot card, shot detail and compare no longer
  show it. The user's scale-mode check is T1.25 (D-057). T1.21 notes the user's auto-connect ask,
  the beacio reload and how to launch the app on iOS.
- 2026-10-05 · UX · Merged `ui-style-exploration` into main (a fast-forward: main hadn't moved).
- 2026-10-05 · T1.16 · Part 1 (D-058, analysis version 2): readings snapped to the scale's 0.1 g
  grid (a float32 truncated to hundredths), anchors from firm stretches 2 s together, steps of
  several jumps inside a pour kept in it, transients left out, and pump_on from the Tare + start
  tap. Session 2 now reads shot A 47.3 g and the beans 17.7 g, and both shots are espresso,
  timed from the tap. Items 5–8 and the targets are next.
- 2026-10-05 · T1.16 · Part 2 (D-059, analysis version 3): the yields measured from the stable
  level before the pump (shot B 35.1 g, its dip no longer counted), a tare must bring the
  reading nearer 0, a hand's press joins the lift, first_drip with `dropG` 0.2 g and `riseFitG`
  1 g, and a fast drain's w(pump_off) and tail from the pump_off knee (τ 0.18 and 0.28 s). The
  simulator follows session 2: no vibration, τ 0.2 s, a 0.2 g first lump, the float32
  truncation, the tap. Re-agreeing the targets is next.
- 2026-10-05 · T1.16 · The user re-agreed the accuracy targets for the real scale, with headroom
  (Q8, D-060): first_drip and pump_off median 0.05 s, 90% 0.1 s, worst 0.15 and 0.2 s; yields
  0.05 and 0.1 g; w(pump_off) 0.25 g; flow 2%; none for τ or pump_on. `targets.test.ts` checks
  them on 100 simulated shots; the old targets' tests stay as regressions.
- 2026-10-05 · T1.16 · The tare button's press (D-061, analysis version 4): a jump to 0 just
  after a one-jump step up is the press let go with its tare, measured from before the press.
  Session 1's zero-tracked levels now hold (the item 9.6 g, not 22.9 g). Lead-ins are found
  after the run before has settled, the way the first jump goes. The simulator can press the
  button with a weight.
- 2026-10-05 · T1.16 · A knock at a tare (D-062, analysis version 5): no shot window is lost now
  for a knock from the tare to a second after it (before: nearly every one in the first 0.3 s).
  Samples faster than liquid join a run, touching runs merge, a logged tare takes a run with a
  knock in it, and every tare applies from its own jump.
- 2026-10-05 · T1.16 · The sample grid (D-063, analysis version 6): frames between the timer's
  runs are timed on the scale's 100.7 ms grid, within 3.5 ms of their samples on the simulated
  link (arrivals: 100 ms), where they took their arrival time. Checked: two shots into one cup
  no longer settle late, and "shot done" can come 1–3 s after the pump stops.
- 2026-10-05 · T1.16 · done. The D-029 pass (D-064, analysis version 7): the rate is fitted from
  3 s of timer runs (the Mini drifts 0.69%), and the values the sessions settled lose their
  PROVISIONAL marker; D-064 lists the rest. T1.8 is done, run on the phone twice. Next: T1.17.
- 2026-10-05 · T1.17 · done. The live pipeline (D-065). `LiveWeight` makes each reading fit to
  show; `ShotMonitor` runs the display states (idle, ready, running, tail, done) with the arm-once
  tare, remaining-to-target, the first drip, the live pump_off, the graph's series and "shot
  done". Only the tap starts a shot: liquid alone read session 2's beans and grounds as shots.
  Streamed on the simulator (one tare per shot; remaining within 0.25 g at the target) and on
  both real sessions. Lint keeps live and analysis apart both ways. Q9 (the auto-tare's command,
  and the scale's timer) is open for T1.18. Next: T1.18.
- 2026-10-05 · T1.17 · Q9 answered by the user (D-066): the cup's tare is a plain tare. The app
  stops the scale's timer at "shot done" and zeroes it with the next cup's tare, or after a tap
  that lapsed (a new `pump-lapsed` event). `scaleCommandsFor` holds the commands, and the
  simulator shows the timer running from each tap to its "shot done". Next: T1.18.
- 2026-10-05 · T1.18 · verify. The brew flow at `#/brew` in the Instrument look (D-069): the
  extraction screen with the recipe and the dose (Q10) and the Tare + start tap, the live view
  with remaining-to-target, and the shot card with the analysis's results, taste, channelling and
  tags (Q11), and Save (D-067). The flow tares the cup and times the scale (D-066) only while its
  screen is shown. Shots gain their snapshot in export format version 3 (D-068). `npm run e2e`
  pulls a shot on the mock from connect to Save. The user checks D1–D7 on the phone. Next: T1.19.
- 2026-10-05 · T1.19 · done. History at `#/history` (rows with a small graph of the real curve,
  Compare mode), a shot's page (large chart, every metric, phases, grades saved as tapped) and
  Compare (overlay aligned at the first drip or pump on, "A Δ B"), in the Instrument look
  (D-070). Each segment's curve is in the derived cache (`ANALYSIS_VERSION` 8); History runs
  `reanalyzeAll` once per version, and a recording that ends gets its post-hoc shots before its
  upload. Next: T1.21.
- 2026-10-05 · T1.21 · verify. The app remembers the scale on the phone and reconnects without
  the chooser (`ScaleConnector`, D-071): on load, after a drop, retrying while the scale is off;
  Stop, Choose scale, and "No Bluetooth" with Reload when beacio doesn't inject. The wake lock
  follows a connection or a tap; every tap retries it. `npm run e2e` drives it on a fake Web
  Bluetooth. The user checks R1–R7 (B3). Next: T1.23.
- 2026-10-05 · T1.23 · verify. Home at `#/` (the scale with its weight and Tare, the last shot,
  the last 7 days) and the tab bar on Home, History, a shot, Compare and the probe, which is
  the Setup tab until T2.9 (Q12, D-072). The brew flow stays in focus mode; its ✕ goes Home.
  `npm run e2e` drives Home with no shots, one and three. The user checks H1–H5. Next: T1.25.
- 2026-10-05 · T1.25 · verify. The scale-mode check (D-073): on connect, with the scale idle, a
  `04`; its start shows the timer mode (then `05`, `06`), its absence the warning on Home's
  scale card, the brew screen and the probe, checked again every 5 s while idle (Q13). Besides,
  only the automatic mode's `03 0D` frames warn, since the scale has a timer key (Q14). The
  mock takes `&mode=`. The user checks M1–M5. Next: T2.1.
- 2026-10-05 · T2.1 · done. The entities (D-074): six stores (database version 3) with fixed-id
  seeds (the spec's Gaggia and LM 17 g basket, the ORO and the C40, seven recipes, T1.18's tags,
  its added tags and last recipe carried over), tombstones instead of deletes, maintenance on
  the machine and grinders, the last used as the default. Export format version 4 (D-075), an
  untouched seed replaced on import, `<folder>entities.json` in the backup (D-076), and every
  live shot's snapshot from them. Next: T2.2.
- 2026-10-05 · T2.9 · verify. Setup (D-077): `#/setup` with a screen per board (the machine
  and its baskets, grinders, recipes, coffee packs and a pack's page, containers weighed on the
  scale with their clashes, tags, the microphone not ready yet, the automatic export) and
  Export all; the Setup tab opens it and the probe is a row. Changes are stored as they are
  made. Remove and a few other controls the boards don't draw are provisional (Q15–Q19). The
  user checks S1–S8. Phase 2 re-sequenced. Next: T2.4.
- 2026-10-05 · T2.4 · verify. Containers recognised (D-078): a live vessel monitor weighs what
  is put on, one matcher in the model serves the live display and the analysis, Home's scale
  card names the container on it (or asks which, or says it isn't known), a live shot records
  its cup's container, and a known bean cup, grind cup or milk jug gets no post-hoc shot; the
  labels are worked out after the cache, so no version bump. Hardware session 2's vessels weigh
  the same live and post-hoc. The user checks K1–K6. Next: T2.5.
- 2026-10-05 · T2.5 · verify. The brew's phases (D-079): the stepper; learned containers open
  their phase (the cup back with its grounds the grind), the pump the extraction, a tap any; the
  beans, grounds and milk live against their targets, the target from the ground weight (the
  dose stepper gone). The flow is logged in raw, the analysis measures the phases (version 9),
  the card and History show its weights, the shot stores done or skipped. The user checks P1–P7.
  Next: T2.6.
- 2026-10-05 · T2.6, T2.2 · verify. The beans phase's equipment in place (D-080): the machine,
  the basket (the beans' target) and the pack, each the last used and picked from a grid; an
  unopened pack picked is opened today, and the pack in use can be finished there. Days off
  roast and open derived per shot (`packAgeAt`). The user checks P8–P9. Next: T2.7.
- 2026-10-05 · T2.7, T2.3 · verify. The grind phase's grinder and setting in place (D-081): a
  step is the grinder's setting, the default next time; the retention, and the grinder's last
  five from the analysis's weights. The user checks P10. Next: T2.11.
- 2026-10-05 · T2.11 · verify. The milk phase's ratio in place (D-082): the milk drinks to pick
  from, the open card's shot taking the drink; the jug's card warns of a container within 3 g
  and picks it in place; whole grams; the milk read until the jug is lifted (analysis 10). The
  user checks P5 and P11. Next: T2.10.
- 2026-10-05 · T2.10 · verify. The maintenance dates (D-083): descale and backflush on the
  machine, care on each grinder; "Done today", the last date and the reminder set in place; the
  reminders due on Home, due or coming up in Setup. The user checks N1–N4. Next: T2.12.
- 2026-10-05 · T2.12 · verify. The taste nudge (D-084): the newest shot with the same machine,
  grinder and pack, sour or bitter, says at the beans and the grind which way to grind; ✕
  dismisses it on this device. The user checks P12. Next: T3.3.
- 2026-10-05 · T3.3 · verify. History's filter and trend (D-085): filter by coffee, days off
  roast, grinder and since its care, tags, taste; a filtered list draws a figure against the
  grind, the days off roast or the day, with a fitted line. The user checks F1–F3 and answers
  Q29. Next: T3.5.
- 2026-10-05 · T3.5 · verify. The design pass (D-086): the screens follow their boards, three
  small fixes; an axe-core audit of every screen in both modes is clean; a focus ring, reduced
  motion. The user checks V1–V2. Next: the user's checks and answers.
- 2026-10-06 · T1.26 · done. Session 3, the first brew with the app: its shot's pump_off is found
  where the flow stops, not at the climb after its first-drip gush (analysis 11, D-087); the
  day's export is a fixture. The user's answers on the mat, Home and sound (Q30–Q32, D-088) make
  T2.16–T2.18; T2.14–T2.15 fix what the session showed. Next: T2.14.
- 2026-10-06 · T2.14 · verify. The empty bean cup back from the grinder keeps the beans
  weighed and opens the grind, whether or not it is a grind cup; once done, the beans open again
  only by a tap (D-089). Session 3's sequences replayed from the fixture. The user checks P13.
  Next: T2.15.
- 2026-10-06 · T2.15 · verify. ✕ ends the brew: the scale's timer stopped and zeroed and a tare
  (`end-session`), the open phase ended in the log, the live shot started over, new phases; an
  open card stays. A shot gets no weight for a phase it skipped (D-090). The user checks P14.
  Next: T2.16.
- 2026-10-06 · T2.16 · verify. A known container put down while Home shows, or picked there,
  opens the brew on its phase; the one on as Home opened doesn't, so ✕ with the cup on stays
  Home (D-091). The user checks K2–K4, rewritten for it. Next: T2.17.
- 2026-10-06 · T2.17 · verify. A container can be a scale accessory, like the mat: recognised as
  it goes on, it is part of the platform, and containers on it are recognised and weighed as
  usual; it opens no phase and gets no shot. Export format 5 (D-092). The user checks K7.
  Next: T2.18.
- 2026-10-06 · T2.18 · verify. Every brew records the microphone's sound levels, from the brew
  screen's first tap but Start, unless Setup › Microphone's switch is off (D-093); Q34 asks
  about the tap when the scale connected by itself. The user checks P15. Next: the user's checks
  and answers.
- 2026-10-06 · T1.27 · done. Session 4, the second brew with the app and the first with sound,
  is a fixture (trimmed to its recordings): the shot, its phases and the pump heard in the 40–70
  Hz band from the tap to pump_off. The user answered Q33 (D-094); what the session showed is
  T2.19–T2.21. Next: T2.19.
- 2026-10-06 · T2.19 · verify. The app's own tares are expected from when they are sent, and
  Start's `07` from its tap, so a tare whose reading arrives before its log isn't the cup's
  weight gone (session 4's "130 g to go", D-095). The user checks P16. Next: T2.20.
- 2026-10-06 · T2.20 · verify. The user's tares (Q33, D-096): an empty scale that doesn't read 0,
  or an empty cup reading its weight, is tared at a phase's start and as the brew opens; a cup
  swapped in fast is tared; the bean cup back with its grounds isn't; Setup tares an empty
  scale. The user checks P17. Next: T2.21.
- 2026-10-06 · T2.21 · verify. The grind tapped with the beans in the cup weighs only what goes
  in from the tap, and what the cup comes back with; with no grounds the grind view reads 0.0,
  no retention, and asks for the cup with the grounds, or Skip grind; analysis 12 (D-097). The
  user checks P18. Next: the user's checks and answers.
- 2026-10-07 · T2.22 · verify. Session 5's grind tared its grounds away: they came back 3.2 g
  short of the beans, outside the router's window. With the grind open, the cup back with up to
  the beans is the grounds, and isn't tared (D-098). The user checks P19. Next: the user's
  checks and answers.
- 2026-10-07 · T2.23 · verify. Session 6: beans put straight back after Grind's tap were taken
  for grounds (T2.22's rule). The cup back counts as from the grinder only after 8 s off; a
  bean cup carrying anything is never tared; a lift's push isn't grounds (D-099). The user
  checks P20. Next: the user's checks and answers.
- 2026-10-07 · T2.24 · verify. The user's rule (D-100): no tap between the phases. The beans'
  cup lifted with the beans opens the grind; whatever it brings back is the grounds; the coffee
  cup ends the grind with its last weight. Analysis 13. T3.1 is the pump only. The user checks
  P21. Next: the user's checks and answers.
