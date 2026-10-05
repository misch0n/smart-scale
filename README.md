# smart-scale — espresso tracker

A web app that reads a **BOOKOO Themis Mini** scale over Web Bluetooth, records every packet,
and derives shot metrics afterwards rather than live. The metrics are first-drip time,
pre-infusion, extraction time, average flow, yield, honest yield and tail mass. It's built for a
dialing loop on a Gaggia Classic Pro. On iOS it runs in Safari with the beacio extension, or in
the Bluefy browser, because Safari has no Web Bluetooth of its own.

- **App:** <https://misch0n.github.io/smart-scale/> (deployed from `main` by GitHub Actions)
- **Spec:** [`docs/spec.md`](docs/spec.md)
- **Plan and status:** [`docs/PLAN.md`](docs/PLAN.md)
- **Architecture:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · **Decisions:**
  [`docs/DECISIONS.md`](docs/DECISIONS.md)
- **Tests that need the real scale or phone:** [`docs/hardware-tests.md`](docs/hardware-tests.md)
- **Export file format** (the durable copy of your data): [`docs/export-format.md`](docs/export-format.md)

## Development

Requires Node 22 (see `.nvmrc`), 22.18 or later for `npm run analyze`.

```sh
npm ci
npm run dev      # local dev server; Web Bluetooth works in desktop Chrome, or open #/probe?mock for a simulated scale
npm run check    # typecheck, lint, format check, tests
npm run build    # production build into dist/
npm run e2e      # build, then drive the probe with the simulated scale in headless Chromium (needs Playwright)
npm run analyze -- <export.json>   # analyse an export's recordings: markers and metrics as JSON
```

## Inspecting recordings

`npm run analyze` runs the app's analysis on export files, as the app does on the phone, and
prints every recording's markers, metrics and detector diagnostics as JSON. With `--out`, it also
draws a chart per recording and per shot window, as SVG, and as PNG with `--png`.

```sh
npm run analyze -- fixtures/real/2026-10-05_two-shots_0a69da56.json --summary
npm run analyze -- fixtures/real/*.json --out /tmp/charts --png
npm run analyze -- --simulate espresso --seed 2 --out /tmp/sim --summary
npm run analyze -- my-export.json --param liquid.sgWindowS=0.7 --summary
```

- `--summary` prints a few lines per shot window instead of the JSON.
- `--simulate espresso|demo` analyses a simulated session too. Its report adds the simulator's
  truth and the analysis's error against it, and `--out` saves its export.
- `--param <stage>.<name>=<value>` changes an analysis parameter from its default
  (`src/core/analysis/params.ts`).
- `--png` needs Playwright and Chromium, which the agent environment has.

A shot window's chart has the liquid, the derived flow (with the scale's own flow figure), the
detrended variance (with the pump detectors' noise levels), and the microphone's sound levels
when they were recorded. The markers and the app events (commands, annotations) are vertical
lines. The recording's chart has the reading as it arrived and zero-tracked, with the steps and
the shot windows. `npm run analyze -- --help` lists every option.

## Working with agents

The repo is set up so a fresh agent session only needs to be told:

> Scan the branch and continue with the next task.

[`CLAUDE.md`](CLAUDE.md) holds the protocol: how to pick the next task from `docs/PLAN.md`,
the definition of done, the commit message format, when to ask you, and the hard rules from the
spec. Every agent updates the plan in the same commit as its work.
