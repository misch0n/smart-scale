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

## Development

Requires Node 22 (see `.nvmrc`).

```sh
npm ci
npm run dev      # local dev server; Web Bluetooth works in desktop Chrome, otherwise use the mock transport
npm run check    # typecheck, lint, format check, tests
npm run build    # production build into dist/
```

## Working with agents

The repo is set up so a fresh agent session only needs to be told:

> Scan the branch and continue with the next task.

[`CLAUDE.md`](CLAUDE.md) holds the protocol: how to pick the next task from `docs/PLAN.md`,
the definition of done, the commit message format, when to ask you, and the hard rules from the
spec. Every agent updates the plan in the same commit as its work.
