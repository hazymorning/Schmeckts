#!/usr/bin/env bash
# Style and the usual mistakes, in every language the project uses. The CI job `lint` runs exactly this.
# JavaScript and CSS: ESLint and Prettier from app/node_modules. Go: gofmt, go vet, staticcheck.
# Python: ruff. Shell: shellcheck. Nothing is rewritten here; --write and --fix are for a person to run.
# Every check runs even when an earlier one fails, so one run shows everything that is wrong.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

STATICCHECK_VERSION=2026.2.1   # pinned, raised by hand
failed=()

run() { # run <name> <command …>
  local name=$1
  shift
  if "$@"; then
    echo "  ok   $name"
  else
    echo "  FAIL $name"
    failed+=("$name")
  fi
}
note_failure() {
  echo "  FAIL $1"
  failed+=("$1")
}

# JavaScript and CSS. npm ci as in prepare.py: the packages are not kept in the repository.
[ -x app/node_modules/.bin/eslint ] || (cd app && npm ci --no-audit --no-fund >/dev/null)
run 'eslint' app/node_modules/.bin/eslint --config app/eslint.config.mjs --max-warnings 0 app/www/js tests
run 'prettier' app/node_modules/.bin/prettier --config app/.prettierrc.json --check --log-level warn \
  'app/www/**/*.js' 'app/www/**/*.css' 'tests/*.test.js'

# Go. The toolchain is not always on the PATH (scripts/setup-build-env.sh puts it in /usr/local/go).
GO="$(command -v go || { [ -x /usr/local/go/bin/go ] && echo /usr/local/go/bin/go; } || true)"
if [ -z "$GO" ]; then
  note_failure 'go (missing, scripts/setup-build-env.sh installs it)'
else
  GOBIN="$("$GO" env GOPATH)/bin"
  # staticcheck needs a newer Go to build than the server is written for. The linter is not shipped with the
  # server, so the server's Go version stays where it is. GOTOOLCHAIN=auto lets `go install` fetch the toolchain
  # it asks for, whatever the environment has set. actions/setup-go 7 pins it to `local` and the install fails.
  [ -x "$GOBIN/staticcheck" ] || GOTOOLCHAIN=auto "$GO" install "honnef.co/go/tools/cmd/staticcheck@$STATICCHECK_VERSION"
  unformatted="$("$(dirname "$GO")/gofmt" -l server)"
  if [ -n "$unformatted" ]; then
    echo "$unformatted"
    note_failure 'gofmt'
  else
    echo '  ok   gofmt'
  fi
  cd server || exit 1
  run 'go vet' "$GO" vet ./...
  run 'staticcheck' "$GOBIN/staticcheck" ./...
  cd "$ROOT" || exit 1
fi

# Python
run 'ruff check' ruff check --quiet tests scripts design
run 'ruff format' ruff format --quiet --check tests scripts design

# The texts themselves: no long dashes, no emoji, no trailers under a commit. See scripts/text-style.py.
run 'text style' python3 scripts/text-style.py

# Shell
run 'shellcheck' shellcheck scripts/*.sh server/build-deb.sh

# Pinned versions that have to agree. The suites that open the app run in Playwright's own container image, and
# its tag has to be the version pinned in tests/requirements.txt: the image brings the matching Chromium, while
# the pinned list is installed over the image's own Playwright. If the two disagree, the browser is missing.
# That shows up only once a test opens a page, in three jobs at once.
playwright_pin() {
  local pin tag
  pin=$(sed -n 's/^playwright==\(.*\)$/\1/p' tests/requirements.txt)
  tag=$(sed -n 's|.*image: mcr\.microsoft\.com/playwright/python:v\([^-]*\)-.*|\1|p' .github/workflows/tests.yml | sort -u)
  if [ -z "$pin" ]; then
    echo 'tests/requirements.txt pins no playwright version' >&2
    return 1
  fi
  if [ "$tag" != "$pin" ]; then
    echo "playwright is pinned to $pin, the container image in .github/workflows/tests.yml is v$tag" >&2
    return 1
  fi
}
run 'playwright pin' playwright_pin

if [ ${#failed[@]} -gt 0 ]; then
  echo "Failed: ${failed[*]}" >&2
  exit 1
fi
echo 'Everything clean.'
