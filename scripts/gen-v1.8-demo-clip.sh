#!/usr/bin/env bash
# Generate v1.8 Track.video demo clip · 5s · 720p · gradient + text + C-major scale audio.
# Produces demo/assets/v1.8-real-clip.mp4 (~340KB). Idempotent.
#
# Requires ffmpeg. Run from project root:
#   bash scripts/gen-v1.8-demo-clip.sh
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p demo/assets
ffmpeg -y \
  -f lavfi -i "gradients=s=1280x720:duration=5:c0=0x1e3a8a:c1=0x9333ea:c2=0xf97316:c3=0x0ea5e9:x0=0:y0=0:x1=1280:y1=720:speed=0.015" \
  -f lavfi -i "sine=f=261.63:d=1:sample_rate=48000" \
  -f lavfi -i "sine=f=329.63:d=1:sample_rate=48000" \
  -f lavfi -i "sine=f=392:d=1:sample_rate=48000" \
  -f lavfi -i "sine=f=523.25:d=1:sample_rate=48000" \
  -f lavfi -i "sine=f=659.25:d=1:sample_rate=48000" \
  -filter_complex "[1:a][2:a][3:a][4:a][5:a]concat=n=5:v=0:a=1,volume=0.4[aout];[0:v]drawtext=fontfile=/System/Library/Fonts/Helvetica.ttc:text='NextFrame':fontcolor=white:fontsize=140:x=(w-tw)/2:y=(h-th)/2-100:box=1:boxcolor=black@0.45:boxborderw=24,drawtext=fontfile=/System/Library/Fonts/Helvetica.ttc:text='v1.8 Track.video demo':fontcolor=0xa78bfa:fontsize=44:x=(w-tw)/2:y=(h-th)/2+60,drawtext=fontfile=/System/Library/Fonts/Menlo.ttc:text='t %{pts\\:hms}':fontcolor=yellow:fontsize=40:x=w-tw-40:y=40:box=1:boxcolor=black@0.5:boxborderw=10,drawtext=fontfile=/System/Library/Fonts/Helvetica.ttc:text='♪ C - E - G - C - E  ♪':fontcolor=0x34d399:fontsize=32:x=(w-tw)/2:y=h-80[vout]" \
  -map "[vout]" -map "[aout]" \
  -c:v libx264 -pix_fmt yuv420p -preset fast -crf 23 \
  -c:a aac -b:a 128k \
  demo/assets/v1.8-real-clip.mp4
echo "[gen-v1.8] done: $(ls -lh demo/assets/v1.8-real-clip.mp4 | awk '{print $5}')"
