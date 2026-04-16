#!/bin/bash
set -e
cd "$(dirname "$0")"
FILE=$1; FRAME=$2; OUT=$3
URL="file://$(pwd)/render.html?f=${FILE}&t=${FRAME}"
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --headless=new --disable-gpu --hide-scrollbars \
  --allow-file-access-from-files \
  --virtual-time-budget=5000 \
  --window-size=500,500 \
  --screenshot="shots/${OUT}.png" \
  "$URL" 2>/dev/null
echo "shots/${OUT}.png"
