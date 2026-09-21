#!/usr/bin/env bash
# Builds the installation packages dist/schmeckts-server_<version>_<arch>.deb for amd64 (Intel/AMD) and arm64.
# The version number lives only in server/VERSION. No package without green tests.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"   # the repository, for dist/
GO="$(command -v go || echo /usr/local/go/bin/go)"
VERSION="$(tr -d '[:space:]' < "$HERE/VERSION")"

cd "$HERE"
"$GO" vet ./...
"$GO" test -count=1 ./...

mkdir -p "$ROOT/dist"
for ARCH in amd64 arm64; do
  PKG="$(mktemp -d)/schmeckts-server"
  CGO_ENABLED=0 GOOS=linux GOARCH="$ARCH" "$GO" build -trimpath -ldflags "-s -w -X main.version=$VERSION" \
    -o "$PKG/usr/bin/schmeckts-server" .
  install -D -m 0755 "$HERE/packaging/schmeckts-setup"              "$PKG/usr/bin/schmeckts-setup"
  install -D -m 0644 "$HERE/packaging/schmeckts.service"             "$PKG/usr/lib/systemd/system/schmeckts.service"
  install -D -m 0644 "$HERE/packaging/schmeckts-setup.desktop"      "$PKG/usr/share/applications/schmeckts-setup.desktop"
  install -D -m 0644 "$HERE/packaging/schmeckts.svg"                 "$PKG/usr/share/icons/hicolor/scalable/apps/schmeckts.svg"
  install -D -m 0644 "$HERE/packaging/de.schmeckts.server.policy"    "$PKG/usr/share/polkit-1/actions/de.schmeckts.server.policy"
  install -D -m 0644 "$HERE/packaging/de.schmeckts.server.metainfo.xml" "$PKG/usr/share/metainfo/de.schmeckts.server.metainfo.xml"
  install -D -m 0644 "$HERE/packaging/debian/copyright" "$PKG/usr/share/doc/schmeckts-server/copyright"
  gzip -9n -c "$HERE/packaging/debian/changelog" > "$PKG/usr/share/doc/schmeckts-server/changelog.gz"
  install -D -m 0644 "$HERE/packaging/debian/lintian-overrides" "$PKG/usr/share/lintian/overrides/schmeckts-server"
  install -d "$PKG/DEBIAN"
  install -m 0755 "$HERE/packaging/debian/postinst" "$HERE/packaging/debian/prerm" "$HERE/packaging/debian/postrm" "$PKG/DEBIAN/"
  SIZE="$(du -sk --exclude=DEBIAN "$PKG" | cut -f1)"
  sed -e "s/@VERSION@/$VERSION/" -e "s/@ARCH@/$ARCH/" -e "s/@SIZE@/$SIZE/" "$HERE/packaging/debian/control" > "$PKG/DEBIAN/control"
  OUT="$ROOT/dist/schmeckts-server_${VERSION}_${ARCH}.deb"
  dpkg-deb --root-owner-group -Zxz --build "$PKG" "$OUT" >/dev/null
  rm -rf "$(dirname "$PKG")"
  echo "Done: $OUT"
done
