#!/usr/bin/env bash
# Every test: server (Go), pure modules in Node, the app in Chromium, several phones syncing against the real server.
# Without arguments all of them, otherwise only the suites named, which is how the CI splits them across jobs:
#   scripts/test.sh                      everything
#   scripts/test.sh node storage design perf
#   scripts/test.sh ui
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -d "$ROOT/server" ] || { echo "server/ is missing: incomplete working tree, please clone the repository afresh"; exit 1; }

ALL=(go node storage design perf ui sync)
SUITES=("$@")
[ ${#SUITES[@]} -gt 0 ] || SUITES=("${ALL[@]}")
for suite in "${SUITES[@]}"; do
  [[ " ${ALL[*]} " == *" $suite "* ]] || { echo "unknown suite: $suite (possible: ${ALL[*]})" >&2; exit 1; }
done

GO="$(command -v go || { [ -x /usr/local/go/bin/go ] && echo /usr/local/go/bin/go; } || true)"
# The fonts belong to the app, so every suite that opens it in Chromium needs them
case " ${SUITES[*]} " in
  *" storage "*|*" design "*|*" perf "*|*" ui "*|*" sync "*) python3 "$ROOT/scripts/prepare.py" --fonts-only ;;
esac

for suite in "${SUITES[@]}"; do
  case "$suite" in
    go)
      if [ -n "$GO" ]; then
        (cd "$ROOT/server" && "$GO" vet ./... && "$GO" test -count=1 ./... 2>&1 | tail -1)
      else
        echo "Note: Go is missing, the server tests were skipped (scripts/setup-build-env.sh installs Go)."
      fi
      ;;
    node)
      # dots, and what the tests have to say about themselves (the hit rate of the text recognition, tests/notes.js)
      node --test --test-reporter=dot --test-reporter-destination=stdout \
        --test-reporter="$ROOT/tests/notes.js" --test-reporter-destination=stdout "$ROOT"/tests/*.test.js
      ;;
    sync)
      if [ -n "$GO" ]; then
        PATH="$PATH:$(dirname "$GO")" python3 "$ROOT/tests/sync_test.py"
      else
        echo "Note: Go is missing, the tests against the server were skipped (scripts/setup-build-env.sh installs Go)."
      fi
      ;;
    *) python3 "$ROOT/tests/${suite}_test.py" ;;
  esac
done
