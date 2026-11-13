#!/usr/bin/env bash
# scripts/test.sh [suite …]: all suites, or only those named.
#   go     the server
#   app    every Gradle test: pure modules in JUnit, views in Robolectric, phones against the real server
#   files  checks across files
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"

ALL=(go app files)
SUITES=("$@")
[ ${#SUITES[@]} -gt 0 ] || SUITES=("${ALL[@]}")
for suite in "${SUITES[@]}"; do
  [[ " ${ALL[*]} " == *" $suite "* ]] || { echo "unknown suite: $suite (possible: ${ALL[*]})" >&2; exit 1; }
done

GO="$(command -v go || echo /usr/local/go/bin/go)"

for suite in "${SUITES[@]}"; do
  case "$suite" in
    go) (cd "$ROOT/server" && "$GO" test -count=1 ./...) ;;
    app) (cd "$ROOT/app" && PATH="$PATH:$(dirname "$GO")" ./gradlew testDebugUnitTest --console=plain -q) ;;
    files) python3 "$ROOT/tests/files_test.py" ;;
  esac
done
