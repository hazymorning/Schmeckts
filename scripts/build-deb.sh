#!/usr/bin/env bash
# Baut die Installationspakete dist/schmeckts-server_<version>_<arch>.deb für amd64 (Intel/AMD) und arm64.
# Die Versionsnummer steht nur in server/VERSION. Ohne grüne Tests kein Paket.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GO="$(command -v go || echo /usr/local/go/bin/go)"
VERSION="$(tr -d '[:space:]' < "$ROOT/server/VERSION")"

python3 "$ROOT/scripts/prepare.py" --nur-prompt   # server/recognize-prompt.txt aus shared/ erzeugen (//go:embed)
cd "$ROOT/server"
"$GO" vet ./...
"$GO" test -count=1 ./...

mkdir -p "$ROOT/dist"
for ARCH in amd64 arm64; do
  PKG="$(mktemp -d)/schmeckts-server"
  CGO_ENABLED=0 GOOS=linux GOARCH="$ARCH" "$GO" build -trimpath -ldflags "-s -w -X main.version=$VERSION" \
    -o "$PKG/usr/bin/schmeckts-server" .
  install -D -m 0755 "$ROOT/packaging/schmeckts-einrichten"          "$PKG/usr/bin/schmeckts-einrichten"
  install -D -m 0644 "$ROOT/packaging/schmeckts.service"             "$PKG/usr/lib/systemd/system/schmeckts.service"
  install -D -m 0644 "$ROOT/packaging/schmeckts-einrichten.desktop"  "$PKG/usr/share/applications/schmeckts-einrichten.desktop"
  install -D -m 0644 "$ROOT/packaging/schmeckts.svg"                 "$PKG/usr/share/icons/hicolor/scalable/apps/schmeckts.svg"
  install -D -m 0644 "$ROOT/packaging/de.schmeckts.server.policy"    "$PKG/usr/share/polkit-1/actions/de.schmeckts.server.policy"
  install -D -m 0644 "$ROOT/packaging/de.schmeckts.server.metainfo.xml" "$PKG/usr/share/metainfo/de.schmeckts.server.metainfo.xml"
  install -D -m 0644 "$ROOT/packaging/debian/copyright" "$PKG/usr/share/doc/schmeckts-server/copyright"
  gzip -9n -c "$ROOT/packaging/debian/changelog" > "$PKG/usr/share/doc/schmeckts-server/changelog.gz"
  install -D -m 0644 "$ROOT/packaging/debian/lintian-overrides" "$PKG/usr/share/lintian/overrides/schmeckts-server"
  install -d "$PKG/DEBIAN"
  install -m 0755 "$ROOT/packaging/debian/postinst" "$ROOT/packaging/debian/prerm" "$ROOT/packaging/debian/postrm" "$PKG/DEBIAN/"
  SIZE="$(du -sk --exclude=DEBIAN "$PKG" | cut -f1)"
  sed -e "s/@VERSION@/$VERSION/" -e "s/@ARCH@/$ARCH/" -e "s/@SIZE@/$SIZE/" "$ROOT/packaging/debian/control" > "$PKG/DEBIAN/control"
  OUT="$ROOT/dist/schmeckts-server_${VERSION}_${ARCH}.deb"
  dpkg-deb --root-owner-group -Zxz --build "$PKG" "$OUT" >/dev/null
  rm -rf "$(dirname "$PKG")"
  echo "Fertig: $OUT"
done
