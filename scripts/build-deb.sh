#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${1:-$ROOT_DIR/target/deb}"
PKG_NAME="${NEXTFRAME_DEB_NAME:-nextframe}"
PKG_VERSION="${NEXTFRAME_DEB_VERSION:-1.60.0}"
PKG_ARCH="${NEXTFRAME_DEB_ARCH:-amd64}"
BIN_PATH="${NEXTFRAME_DEB_BIN:-$ROOT_DIR/target/release/nf-shell}"
STAGE_DIR="$OUT_DIR/${PKG_NAME}_${PKG_VERSION}_${PKG_ARCH}"

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "build-deb.sh must run on Linux" >&2
  exit 1
fi

if ! command -v dpkg-deb >/dev/null 2>&1; then
  echo "dpkg-deb is required to build a .deb package" >&2
  exit 1
fi

if [[ ! -x "$BIN_PATH" ]]; then
  cargo build -p nf-shell --release
fi

rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR/DEBIAN" "$STAGE_DIR/usr/bin"

cp "$BIN_PATH" "$STAGE_DIR/usr/bin/nf-shell"
chmod 755 "$STAGE_DIR/usr/bin/nf-shell"

cat >"$STAGE_DIR/DEBIAN/control" <<EOF
Package: ${PKG_NAME}
Version: ${PKG_VERSION}
Section: graphics
Priority: optional
Architecture: ${PKG_ARCH}
Maintainer: NextFrame
Description: NextFrame Linux preview-only shell (webkit2gtk)
EOF

dpkg-deb --build --root-owner-group "$STAGE_DIR" >/dev/null
echo "${STAGE_DIR}.deb"
