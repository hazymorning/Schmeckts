#!/usr/bin/env bash
# Every test: server (Go), pure modules in Node, the app in Chromium, several phones syncing against the real server
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -d "$ROOT/server" ] || { echo "server/ is missing: incomplete working tree, please clone the repository afresh"; exit 1; }
python3 "$ROOT/scripts/prepare.py" --fonts-only
GO="$(command -v go || { [ -x /usr/local/go/bin/go ] && echo /usr/local/go/bin/go; } || true)"
if [ -n "$GO" ]; then
  (cd "$ROOT/server" && "$GO" vet ./... && "$GO" test -count=1 ./... 2>&1 | tail -1)
fi
node --test --test-reporter=dot "$ROOT"/tests/*.test.js
for t in storage design ui perf; do python3 "$ROOT/tests/${t}_test.py"; done
if [ -n "$GO" ]; then
  PATH="$PATH:$(dirname "$GO")" python3 "$ROOT/tests/sync_test.py"
else
  echo "Note: Go is missing, the tests against the server were skipped (scripts/setup-build-env.sh installs Go)."
fi
