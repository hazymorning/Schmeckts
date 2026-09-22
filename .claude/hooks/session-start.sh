#!/usr/bin/env bash
# Claude Code on the web: adds what the session environment is missing for scripts/test.sh and scripts/lint.sh.
# It ships with JDK, Node, Go and a ready-made Chromium, but not the Python packages. They are pinned once in
# tests/requirements.txt, which the CI and a release build use too, so every run has the same versions.
# Playwright has to match that Chromium (PLAYWRIGHT_BROWSERS_PATH) and cannot download another one there: for a
# build other than 1194 the test error names the expected one, and the matching Playwright version belongs there.
set -euo pipefail
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
HERE="$(cd "$(dirname "$0")" && pwd)"
python3 -m pip install --quiet --disable-pip-version-check --root-user-action=ignore \
  --requirement "$HERE/../../tests/requirements.txt"   # playwright 1.56 = chromium-1194
