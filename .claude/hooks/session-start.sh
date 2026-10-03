#!/bin/bash
# SessionStart hook: installs npm dependencies in Claude Code cloud sessions so a fresh agent
# can run `npm run check` straight away (docs/PLAN.md T0.3).
#
# - Runs only in remote (cloud) sessions; local machines manage their own node_modules.
# - Synchronous on purpose, so dependencies are ready before the agent's first command.
# - `npm install` rather than `npm ci`: the container is cached after this hook, and install
#   reuses an existing node_modules where ci would wipe it. The lockfile still pins versions;
#   CI uses `npm ci` for the strict check.
# - npm output goes to stderr: SessionStart stdout is injected into the agent's context, so
#   only a one-line summary goes to stdout.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

npm install --no-audit --no-fund 1>&2

echo "smart-scale: npm dependencies installed. Start with docs/PLAN.md (Next task); run 'npm run check' before committing."
