#!/usr/bin/env bash
# Every style and mistake check, as the CI job `lint` runs it. Nothing is rewritten; all checks run so one pass
# shows everything. To fix formatting: prettier --write, ruff format, gofmt -w.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1
failed=()

run() {
  local name=$1
  shift
  if "$@"; then echo "  ok   $name"; else
    echo "  FAIL $name"
    failed+=("$name")
  fi
}

[ -x app/node_modules/.bin/eslint ] || (cd app && npm ci --no-audit --no-fund >/dev/null)
run eslint app/node_modules/.bin/eslint --config app/eslint.config.mjs --max-warnings 0 app/www/js tests
# vocab.js stays as scripts/vocab.py writes it
run prettier app/node_modules/.bin/prettier --config app/.prettierrc.json --check --log-level warn \
  'app/www/**/*.js' '!app/www/js/vocab.js' 'app/www/**/*.css' 'tests/*.test.js' 'tests/notes.js'

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

# The browser suites run in Playwright's image; its tag has to be the playwright version tests run with.
playwright_pin() {
  local pin tag
  pin=$(sed -n 's/^playwright==//p' tests/requirements.txt)
  tag=$(sed -n 's|.*playwright/python:v\([^-]*\)-.*|\1|p' .github/workflows/tests.yml | sort -u)
  if [ -z "$pin" ] || [ "$tag" != "$pin" ]; then
    echo "playwright $pin, image tag $tag" >&2
    return 1
  fi
}
run 'playwright pin' playwright_pin

[ ${#failed[@]} -eq 0 ] || { echo "Failed: ${failed[*]}" >&2; exit 1; }
