# Agent operating manual

**smart-scale** is an espresso shot tracker for the BOOKOO Themis Mini scale. It's a web app
(Vite + Preact + TypeScript, deployed to GitHub Pages, used in the Bluefy browser on iOS) that
records every BLE packet from the scale and derives shot metrics afterwards. The spec is
`docs/spec.md`.

The user clears context between tasks, so everything a fresh agent needs lives in this repo.
Keep it that way.

## Start of every session

1. Run `git pull --ff-only origin main`. The SessionStart hook installs dependencies; if
   `node_modules/` is missing, run `npm ci`.
2. Open `docs/PLAN.md`. Read the **Next task** line, the board, and then only the detail
   section of your task.
3. Read the spec sections and docs that the task lists under **Read**. Skip the rest.
4. Run `git log --oneline -15` for recent context. `git log --grep='(T1.4)'` finds the commit
   that finished a given task.

When the user says "continue" or "next task", do the **Next task**:

- If a task is `in-progress`, someone handed it off part-way. Continue it from its
  **Handoff** note.
- If the next task is blocked or needs the user, say so, then take the first `todo` in board
  order whose dependencies are all `done`.

## While working

- **Stay inside the task's scope.** Put follow-ups into PLAN.md as new tasks or notes rather
  than doing them.
- **Ask the user (AskUserQuestion) before building when:**
  - the task depends on an open question (`Q#`) that has no answer yet;
  - you would deviate from `docs/spec.md`, or hardware results contradict it;
  - you would change the export format, or the stored schema of data that already exists;
  - you would send a new kind of command to the scale;
  - a UX choice isn't covered by the spec;
  - you would add a backend, a credential, or a runtime dependency over about 20 kB gzipped.

  Don't ask about internals (naming, structure, tests, initial parameter values). Decide, and
  record anything non-obvious in `docs/DECISIONS.md`. Record every user answer there too, and
  close the question in PLAN.md.
- **Test as you go.** Pure logic gets unit tests next to the code (`*.test.ts`). Algorithms also
  get simulator ground-truth tests, and real-fixture tests once `fixtures/real/` exists.
- **You can't reach the scale or the phone.** Use the mock transport and the simulator. When a
  task needs an on-device check, finish it as `verify` and tell the user exactly what to check.
- **Too big for one session?** Split it in PLAN.md, finish a coherent part, and hand off (below).

## Definition of done

1. The task's acceptance criteria are met.
2. `npm run check` passes (typecheck, lint, format check, tests) and `npm run build` succeeds.
3. `docs/PLAN.md` is updated **in the same commit**:
   - set the task to `done` (or `verify`), with a short **Completed** note under it saying what
     exists now and what the next agent must know;
   - update the **Next task** line;
   - add any new tasks or questions you found;
   - append one line to the progress log.
4. `docs/DECISIONS.md` has any non-obvious decision. `docs/ARCHITECTURE.md` is updated if the
   module layout, data model or boundaries changed.
5. Commit in the format below and push to `main`.
6. Tell the user what was done, anything they need to do, and what the next task is.

**Handing off unfinished work:**

1. Set the task to `in-progress`.
2. Add a **Handoff** note under it: what's done, what's left, any traps.
3. Commit with the `wip:` prefix and push.

## Commit messages

Future agents read commits to understand the code, so explain the why and the odd parts:

```
<area>: <imperative summary> (T1.4)

What:
- concrete changes: modules, files, behaviour

Why:
- the reason, citing the spec section, decision (D-###) or question (Q#)

Decisions and gotchas:
- anything non-obvious a future agent would otherwise have to rediscover
  (or "none")

Verification:
- npm run check (N tests), build, manual or Playwright checks

Plan: T1.4 → done. Next: T1.5.
```

Areas: `protocol`, `model`, `transport`, `storage`, `app`, `analysis`, `live`, `export`,
`ui`, `build`, `ci`, `docs`, `plan`.

Keep to one task per commit, and keep whatever attribution trailers your harness requires.
Work on `main` (D-002) and push with `git push -u origin main`, retrying with backoff if the
network fails. If your environment forces a session branch, push there and tell the user it
needs merging, because other agents only see what is on `main`.

## Hard rules

These come from the spec. Don't break them without the user's approval.

1. **Raw is sacred.** Raw recordings (frames, app events) are append-only. Nothing mutates,
   trims or summarises them in place, and raw stores have no update or delete API.
2. **Derived is disposable.** Every derived value is a pure function of raw plus metadata,
   stamped with `ANALYSIS_VERSION`. Bump the version whenever outputs change.
3. **Live never reaches analysis.** `src/core/live` (causal, display-only) and
   `src/core/analysis` (post-hoc) share no state, analysis never imports live, and live values
   are never stored.
4. **Only `src/transport/` touches `navigator.bluetooth`.** Everything above it uses the
   `ScaleTransport` interface.
5. **Never send `0x09` (calibration) or `0x15` (shutdown), and never probe undocumented
   sub-commands.** Commands come only from the whitelist in `src/core/protocol` (D-008).
6. **The schema is always complete.** Stored records carry every field; "not set" or "hidden"
   is `null`, never missing.
7. **The export format is the durable artifact.** Version every change, and keep old exports
   importable.
8. **The app never controls the machine.** "Auto stop" means stop recording or change the
   display.
9. **UI stays rudimentary until T3.5.** Make it functional and plain, with no design work.
   The backend comes first.

ESLint enforces rules 3 and 4, and keeps `src/core` free of DOM and framework imports (D-010).

## Map

| Path | What |
| --- | --- |
| `docs/spec.md` | The user's spec, verbatim. Edit it only to record Phase 0 answers, or with approval |
| `docs/PLAN.md` | Next task, board, task details, open questions, progress log |
| `docs/ARCHITECTURE.md` | Module boundaries, data model, timebase, storage, pipelines |
| `docs/DECISIONS.md` | Decision log (`D-###`) |
| `docs/protocol-notes.md` | BOOKOO protocol research: 0-based byte offsets, discrepancies with the spec |
| `docs/hardware-tests.md` | Tests only the user can run, and their results |
| `src/core/` | Pure TypeScript: protocol, model, timebase, signal, analysis, live, sim, export |
| `src/transport/` | `ScaleTransport`, Web Bluetooth and mock implementations |
| `src/storage/` | IndexedDB repositories |
| `src/app/` | Services: recorder, analysis runner, export |
| `src/platform/` | Capability detection, build info |
| `src/ui/` | Preact components |
| `fixtures/real/` | Real recordings exported by the probe, used in tests (from U1.1 on) |

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server. Web Bluetooth needs desktop Chrome or Bluefy; otherwise use the mock transport |
| `npm run check` | Typecheck, lint, format check and tests. Run it before every commit |
| `npm run format` | Apply Prettier (code only; Markdown is deliberately not formatted, D-011) |
| `npm test` / `npm run test:watch` | Vitest |
| `npm run build` / `npm run preview` | Production build into `dist/`, and a local preview of it |

Every push to `main` runs `.github/workflows/ci.yml` (check, build, then deploy to GitHub Pages
at <https://misch0n.github.io/smart-scale/>).
