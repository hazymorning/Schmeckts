#!/usr/bin/env bash
# Style and the usual mistakes, in every language the project uses. The CI job `lint` runs exactly this.
# JavaScript and CSS: ESLint and Prettier from app/node_modules. Go: gofmt, go vet, staticcheck.
# Python: ruff. Shell: shellcheck. Nothing is rewritten here; --write and --fix are for a person to run.
# Every check runs, so one command shows everything that is wrong at once.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

STATICCHECK_VERSION=2026.2.1   # pinned, like every other tool version
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
  [ -x "$GOBIN/staticcheck" ] || "$GO" install "honnef.co/go/tools/cmd/staticcheck@$STATICCHECK_VERSION"
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

# Shell
run 'shellcheck' shellcheck scripts/*.sh server/build-deb.sh .claude/hooks/*.sh

if [ ${#failed[@]} -gt 0 ]; then
  echo "Failed: ${failed[*]}" >&2
  exit 1
fi
echo 'Everything clean.'
