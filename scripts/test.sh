#!/usr/bin/env bash
# Alle Tests: Server (Go), reine Module in Node, App in Chromium, Abgleich mehrerer Handys gegen den echten Server
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -d "$ROOT/server" ] || { echo "server/ fehlt: unvollständiger Arbeitsbaum, bitte das Repository frisch klonen"; exit 1; }
python3 "$ROOT/scripts/prepare.py" --nur-schriften
GO="$(command -v go || { [ -x /usr/local/go/bin/go ] && echo /usr/local/go/bin/go; } || true)"
if [ -n "$GO" ]; then
  (cd "$ROOT/server" && "$GO" vet ./... && "$GO" test -count=1 ./... 2>&1 | tail -1)
fi
node --test --test-reporter=dot "$ROOT"/tests/*.test.js
for t in storage design ui perf; do python3 "$ROOT/tests/${t}_test.py"; done
if [ -n "$GO" ]; then
  PATH="$PATH:$(dirname "$GO")" python3 "$ROOT/tests/sync_test.py"
else
  echo "Hinweis: Go fehlt, die Tests gegen den Server wurden übersprungen (scripts/setup-build-env.sh installiert Go)."
fi
