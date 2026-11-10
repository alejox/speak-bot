#!/bin/sh
# Regenerates the app and tray icons from the PWA icon. Requires macOS (uses sips).
# electron-builder derives the .icns and .ico files from build/icon.png.
set -eu
cd "$(dirname "$0")/.."
source_svg=../mobile/public/icon.svg
sips -s format png -z 1024 1024 "$source_svg" --out build/icon.png >/dev/null
sips -s format png -z 256 256 "$source_svg" --out assets/icon.png >/dev/null
sips -s format png -z 16 16 "$source_svg" --out assets/tray.png >/dev/null
sips -s format png -z 32 32 "$source_svg" --out assets/tray@2x.png >/dev/null
echo "Icons written to build/ and assets/."
