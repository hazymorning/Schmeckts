#!/usr/bin/env bash
# Every style and mistake check, as the CI job `lint` runs it. Nothing is rewritten; all checks run so one pass
# shows everything. To fix formatting: ./gradlew ktlintFormat in app, ruff format, gofmt -w.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1
export ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
failed=()

run() {
  local name=$1
  shift
  if "$@"; then echo "  ok   $name"; else
    echo "  FAIL $name"
    failed+=("$name")
  fi
}

gradle() {
  (cd app && ./gradlew --console=plain -q "$@")
}
run ktlint gradle ktlintCheck
run 'android lint' gradle lintDebug

GO="$(command -v go || echo /usr/local/go/bin/go)"
gofmt_clean() {
  local out
  out="$("$(dirname "$GO")/gofmt" -l server)" || return 1
  [ -z "$out" ] || { echo "$out"; return 1; }
}
run gofmt gofmt_clean
run 'go vet' bash -c "cd server && '$GO' vet ./..."

run 'ruff check' ruff check --quiet tests scripts design
run 'ruff format' ruff format --quiet --check tests scripts design
run shellcheck shellcheck scripts/*.sh server/build-deb.sh server/packaging/schmeckts-setup \
  server/packaging/debian/postinst server/packaging/debian/prerm server/packaging/debian/postrm .claude/hooks/*.sh
run 'text style' python3 scripts/text-style.py

[ ${#failed[@]} -eq 0 ] || { echo "Failed: ${failed[*]}" >&2; exit 1; }
