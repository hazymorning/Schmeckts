#!/usr/bin/env bash
# Claude Code im Web: ergänzt, was der Sitzungsumgebung für scripts/test.sh fehlt. JDK, Node, Go und ein fertiges
# Chromium bringt sie mit, die beiden Python-Pakete nicht. Playwright muss zu diesem Chromium passen
# (PLAYWRIGHT_BROWSERS_PATH), nachladen lässt es sich dort nicht: Bei einem anderen Bau als 1194 nennt der
# Fehler der Tests den erwarteten, dazu gehört die passende Playwright-Version hierher.
set -euo pipefail
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
python3 -m pip install --quiet --disable-pip-version-check --root-user-action=ignore pillow 'playwright==1.56.*'   # chromium-1194
