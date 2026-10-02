#!/usr/bin/env bash
# scripts/test.sh [suite …]: all suites, or only those named.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

ALL=(go node files storage design perf ui sync)
SUITES=("$@")
[ ${#SUITES[@]} -gt 0 ] || SUITES=("${ALL[@]}")
for suite in "${SUITES[@]}"; do
  [[ " ${ALL[*]} " == *" $suite "* ]] || { echo "unknown suite: $suite (possible: ${ALL[*]})" >&2; exit 1; }
done

GO="$(command -v go || echo /usr/local/go/bin/go)"

for suite in "${SUITES[@]}"; do
  case "$suite" in
    go) (cd "$ROOT/server" && "$GO" test -count=1 ./...) ;;
    node)
      node --test --test-reporter=dot --test-reporter-destination=stdout \
        --test-reporter="$ROOT/tests/notes.js" --test-reporter-destination=stdout "$ROOT"/tests/*.test.js
      ;;
    sync) PATH="$PATH:$(dirname "$GO")" python3 "$ROOT/tests/sync_test.py" ;;
    *) python3 "$ROOT/tests/${suite}_test.py" ;;
  esac
done
