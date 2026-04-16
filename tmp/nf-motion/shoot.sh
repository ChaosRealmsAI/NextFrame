#!/bin/bash
# usage: ./shoot.sh <t-seconds> <out-name>
set -e
cd "$(dirname "$0")"
T=$1; OUT=$2
URL="http://localhost:8765/shoot.html?t=${T}&cb=$(date +%s%N)"
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --headless=new --disable-gpu --hide-scrollbars \
  --disk-cache-size=1 --media-cache-size=1 \
  --virtual-time-budget=3000 \
  --window-size=500,500 \
  --screenshot="shots/${OUT}.png" \
  "$URL" 2>/dev/null
echo "shots/${OUT}.png"
