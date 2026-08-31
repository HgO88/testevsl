#!/usr/bin/env bash
# Bakes the cuts in build/cutlist.json into one continuous edited-base.mp4.
#
# Uses the select/aselect filter script from build/make-select.mjs. The earlier
# concat-demuxer version drifted: it trimmed each segment's video on a frame
# boundary and its audio on an AAC packet boundary, and over 326 segments that
# accumulated to ~1.8s by the 20-minute mark — lips out of sync, and every text
# card landing late because card positions are computed from cutlist times.
# select/aselect take both streams off the same decoded timeline, so they
# cannot drift apart.
#
# -g 30 -keyint_min 30 (1s GOP at 30fps) is required, not cosmetic: without it
# HyperFrames' render-time frame extraction hit sparse-keyframe seek failures
# and timed out entirely.
#
# Re-run after any change to cutlist.json:
#   node build/make-select.mjs && bash build/encode-base.sh
set -euo pipefail
cd "$(dirname "$0")/.."

ffmpeg -y -i InShot_20260805_133820551.mp4 \
  -filter_complex_script build/select-filter.txt \
  -map '[v]' -map '[a]' \
  -c:v libx264 -preset veryfast -crf 20 -g 30 -keyint_min 30 -pix_fmt yuv420p \
  -c:a aac -b:a 192k \
  -movflags +faststart \
  edited-base.mp4
