#!/usr/bin/env bash
# Baut die signierte APK nach dist/schmeckts-<version>.apk
# Aufruf: scripts/build-apk.sh <schmeckts-signatur.txt>
# Die Versionsnummer steht nur an einer Stelle: app/package.json
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SIGNATUR="$(realpath "${1:?Pfad zu schmeckts-signatur.txt fehlt}")"
export ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
BUILD_TOOLS="$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)"

"$ROOT/scripts/test.sh"   # getestet ausliefern: ohne grüne Tests keine APK
python3 "$ROOT/scripts/prepare.py"
cd "$ROOT/app"
VERSION="$(node -p "require('./package.json').version")"
npx cap sync android
(cd android && ./gradlew assembleRelease --no-daemon --console=plain -q)

# Schlüssel nur für die Dauer des Signierens als Datei, danach wieder gelöscht
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
export SCHMECKTS_PW="$(python3 "$ROOT/scripts/signatur.py" lesen "$SIGNATUR" "$TMP/key.jks")"
mkdir -p "$ROOT/dist"
OUT="$ROOT/dist/schmeckts-$VERSION.apk"
"$BUILD_TOOLS/apksigner" sign --ks "$TMP/key.jks" --ks-key-alias schmeckts \
  --ks-pass env:SCHMECKTS_PW --key-pass env:SCHMECKTS_PW --v4-signing-enabled false \
  --out "$OUT" android/app/build/outputs/apk/release/app-release-unsigned.apk
"$BUILD_TOOLS/apksigner" verify "$OUT"

# Das fertige Manifest prüfen: Kamerarecht vorhanden (eigene Kamera für Packungsfotos) und Googles
# Scanner-Modul angemeldet (barcode_ui, wird mit der App installiert)
MANIFEST="$("$BUILD_TOOLS/aapt2" dump xmltree --file AndroidManifest.xml "$OUT")"
grep -q '"android.permission.CAMERA"' <<<"$MANIFEST" || { echo "Fehler: Im Manifest fehlt das Kamerarecht (android.permission.CAMERA), die eigene Kamera ginge nicht." >&2; rm -f "$OUT"; exit 1; }
# Erinnerung zum Bewerten: Benachrichtigungen ja, exakte Alarme nein (ungefähre Zeit genügt)
if grep -Eq '"android.permission.(SCHEDULE|USE)_EXACT_ALARM"' <<<"$MANIFEST"; then
  echo "Fehler: Die APK verlangt das Recht für exakte Alarme." >&2; rm -f "$OUT"; exit 1
fi
grep -q '"android.permission.POST_NOTIFICATIONS"' <<<"$MANIFEST" || { echo "Fehler: Im Manifest fehlt das Recht für Benachrichtigungen." >&2; rm -f "$OUT"; exit 1; }
grep -q '"barcode_ui"' <<<"$MANIFEST" || { echo "Fehler: Im Manifest fehlt das Scanner-Modul (barcode_ui)." >&2; rm -f "$OUT"; exit 1; }
# Datenschutz: Regeln gegen die Cloud-Sicherung angemeldet und in der APK
grep -q 'dataExtractionRules' <<<"$MANIFEST" && grep -q 'fullBackupContent' <<<"$MANIFEST" || { echo "Fehler: Im Manifest fehlen die Regeln gegen die Cloud-Sicherung." >&2; rm -f "$OUT"; exit 1; }
RULES="$("$BUILD_TOOLS/aapt2" dump resources "$OUT" | grep -A1 'xml/data_extraction_rules$' | grep -o 'res/[^ ]*')"  # der Build kürzt die Pfade
"$BUILD_TOOLS/aapt2" dump xmltree --file "$RULES" "$OUT" | grep -q 'cloud-backup' || { echo "Fehler: data_extraction_rules.xml fehlt in der APK." >&2; rm -f "$OUT"; exit 1; }
"$BUILD_TOOLS/aapt2" dump permissions "$OUT" | grep '^uses-permission' | sed 's/^/Recht: /'
echo "Fertig: $OUT"
