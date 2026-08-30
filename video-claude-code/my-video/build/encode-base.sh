#!/usr/bin/env bash
# Bakes the 327 cuts (build/concat-list.txt, from build/make-filter.mjs) into
# one continuous edited-base.mp4.
#
# -g 30 -keyint_min 30 (1s GOP at 30fps) is required, not cosmetic: without it
# HyperFrames' render-time frame extraction hit sparse-keyframe seek failures
# and timed out entirely (edited-base.mp4 defaulted to x264's keyint=250 ≈
# 8.33s max interval). Re-run this whenever concat-list.txt changes.
set -euo pipefail
cd "$(dirname "$0")/.."

ffmpeg -y -f concat -safe 0 -i build/concat-list.txt \
  -c:v libx264 -preset veryfast -crf 20 -g 30 -keyint_min 30 -pix_fmt yuv420p \
  -c:a aac -b:a 192k \
  -movflags +faststart \
  edited-base.mp4
