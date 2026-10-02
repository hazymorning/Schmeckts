#!/bin/bash
# Cloud sessions: what scripts/lint.sh and scripts/test.sh need.
set -euo pipefail
[ "${CLAUDE_CODE_REMOTE:-}" = true ] || exit 0
cd "$CLAUDE_PROJECT_DIR"
python3 -m pip install --quiet --root-user-action=ignore --requirement tests/requirements.txt
[ -d app/node_modules ] || (cd app && npm ci --no-audit --no-fund --silent)
command -v shellcheck >/dev/null || (apt-get update -q && apt-get install -y -q shellcheck) >/dev/null 2>&1 || true
