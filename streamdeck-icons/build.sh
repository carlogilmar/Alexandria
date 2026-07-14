#!/usr/bin/env bash
# Regenerate the Stream Deck PNG icons. Edit gen.mjs (colours / labels /
# glyphs) then run ./build.sh. Uses macOS `qlmanage` to rasterize the SVGs —
# no extra tools needed.
set -e
cd "$(dirname "$0")"
node gen.mjs
for name in today note blueprint summary article; do
  qlmanage -t -s 288 -o . "$name.svg" >/dev/null 2>&1
  [ -f "$name.svg.png" ] && mv -f "$name.svg.png" "$name.png"
done
echo "Done — PNGs (288×288) in $(pwd)"
