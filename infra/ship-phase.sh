#!/usr/bin/env bash
# Commits and pushes only when typecheck and tests pass.
#   scripts/ship-phase.sh "Phase N: ..." [branch]
set -euo pipefail
msg="$1"
branch="${2:-$(git rev-parse --abbrev-ref HEAD)}"
bun run check
git add -A
git commit -q -m "$msg"
git pull -q --rebase origin "$branch"
bun run check >/dev/null
git push -q origin "$branch"
git log --oneline -1
