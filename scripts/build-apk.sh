#!/usr/bin/env bash
# Builds the signed APK to dist/schmeckts-<version>.apk
# Usage: scripts/build-apk.sh <schmeckts-signing-key.txt>
# The version number lives in exactly one place: app/package.json
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SIGNING_KEY="$(realpath "${1:?path to schmeckts-signing-key.txt missing}")"
export ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
BUILD_TOOLS="$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)"

"$ROOT/scripts/test.sh"   # ship tested: no APK without green tests
python3 "$ROOT/scripts/prepare.py"
cd "$ROOT/app"
VERSION="$(node -p "require('./package.json').version")"
npx cap sync android
(cd android && ./gradlew assembleRelease --no-daemon --console=plain -q)

# The key exists as a file only for as long as signing takes, and is deleted afterwards
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
export SCHMECKTS_PW="$(python3 "$ROOT/scripts/signing-key.py" read "$SIGNING_KEY" "$TMP/key.jks")"
mkdir -p "$ROOT/dist"
OUT="$ROOT/dist/schmeckts-$VERSION.apk"
"$BUILD_TOOLS/apksigner" sign --ks "$TMP/key.jks" --ks-key-alias schmeckts \
  --ks-pass env:SCHMECKTS_PW --key-pass env:SCHMECKTS_PW --v4-signing-enabled false \
  --out "$OUT" android/app/build/outputs/apk/release/app-release-unsigned.apk
"$BUILD_TOOLS/apksigner" verify "$OUT"

# Check the finished manifest: the camera permission is there (our own camera for packaging photos) and Google's
# scanner module is declared (barcode_ui, installed along with the app)
MANIFEST="$("$BUILD_TOOLS/aapt2" dump xmltree --file AndroidManifest.xml "$OUT")"
grep -q '"android.permission.CAMERA"' <<<"$MANIFEST" || { echo "Error: the manifest is missing the camera permission (android.permission.CAMERA); our own camera would not work." >&2; rm -f "$OUT"; exit 1; }
# Rating reminder: notifications yes, exact alarms no (an approximate time is enough)
if grep -Eq '"android.permission.(SCHEDULE|USE)_EXACT_ALARM"' <<<"$MANIFEST"; then
  echo "Error: the APK asks for the exact-alarm permission." >&2; rm -f "$OUT"; exit 1
fi
grep -q '"android.permission.POST_NOTIFICATIONS"' <<<"$MANIFEST" || { echo "Error: the manifest is missing the notification permission." >&2; rm -f "$OUT"; exit 1; }
grep -q '"barcode_ui"' <<<"$MANIFEST" || { echo "Error: the manifest is missing the scanner module (barcode_ui)." >&2; rm -f "$OUT"; exit 1; }
# Privacy: the rules against cloud backup are declared and present in the APK
grep -q 'dataExtractionRules' <<<"$MANIFEST" && grep -q 'fullBackupContent' <<<"$MANIFEST" || { echo "Error: the manifest is missing the rules against cloud backup." >&2; rm -f "$OUT"; exit 1; }
RULES="$("$BUILD_TOOLS/aapt2" dump resources "$OUT" | grep -A1 'xml/data_extraction_rules$' | grep -o 'res/[^ ]*')"  # the build shortens the paths
"$BUILD_TOOLS/aapt2" dump xmltree --file "$RULES" "$OUT" | grep -q 'cloud-backup' || { echo "Error: data_extraction_rules.xml is missing from the APK." >&2; rm -f "$OUT"; exit 1; }
# Phones only: no x86 libraries in the APK (text recognition ships one per processor family)
if "$BUILD_TOOLS/aapt2" dump badging "$OUT" | grep -q "native-code:.*x86"; then
  echo "Error: the APK contains x86 libraries; it is meant for phones only." >&2; rm -f "$OUT"; exit 1
fi
"$BUILD_TOOLS/aapt2" dump badging "$OUT" | grep -o 'native-code:.*' | sed 's/^/Processors: /'
"$BUILD_TOOLS/aapt2" dump permissions "$OUT" | grep '^uses-permission' | sed 's/^/Permission: /'
echo "Done: $OUT"
