#!/bin/sh
# Regenerates every icon from the SVG sources. Requires macOS (uses sips).
# - build/icon.svg: the app icon; electron-builder derives the .icns and .ico files from build/icon.png.
#   It is also copied to the phone app as its icon and favicon.
# - assets/tray.svg: the Windows and Linux tray icon, simplified for 16 and 32 px.
# - assets/tray-template.svg: the macOS menu bar icon, black on transparent (a template image).
# The maskable phone icon (apps/mobile/public/icon-maskable.svg) is edited by hand to match.
set -eu
cd "$(dirname "$0")/.."
sips -s format png -z 1024 1024 build/icon.svg --out build/icon.png >/dev/null
sips -s format png -z 256 256 build/icon.svg --out assets/icon.png >/dev/null
cp build/icon.svg ../mobile/public/icon.svg
sips -s format png -z 16 16 assets/tray.svg --out assets/tray.png >/dev/null
sips -s format png -z 32 32 assets/tray.svg --out assets/tray@2x.png >/dev/null
sips -s format png -z 18 18 assets/tray-template.svg --out assets/trayTemplate.png >/dev/null
sips -s format png -z 36 36 assets/tray-template.svg --out assets/trayTemplate@2x.png >/dev/null
echo "Icons written to build/, assets/ and ../mobile/public/."
