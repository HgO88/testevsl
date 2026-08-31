#!/usr/bin/env node
// Builds a single-pass ffmpeg filter script that keeps the segments in
// cutlist.json, for build/encode-base.sh.
//
// WHY NOT THE CONCAT DEMUXER (what this replaces): concat + inpoint/outpoint
// trims each segment's video and audio independently — video lands on a frame
// boundary, audio on an AAC packet boundary (1024 samples ≈ 21ms). One segment
// is imperceptible; 326 of them accumulate, and the baked base drifted ~1s
// against the cutlist, which desynced the lips AND every text card (all card
// positions come from cutlist times).
//
// select/aselect instead take both streams from the SAME decoded source
// timeline, so a frame and its samples are kept or dropped together and cannot
// drift apart. setpts/asetpts then renumber what survives into a continuous
// stream. It is one filter chain, not 326 parallel branches, so memory stays
// flat (the trim/concat fan-out is what OOM-killed the container earlier).
import fs from "node:fs";
import path from "node:path";

const cutlist = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "cutlist.json"), "utf8"));
const segs = cutlist.segments;

// No nudging of the range ends. A half-frame guard against between()'s
// inclusive bounds looks harmless but shifts every segment start forward, and
// 326 of those cost 5.4s of content AND put each segment progressively later
// than the map says — the exact drift this file exists to remove. It is also
// unnecessary: kept segments never touch, since what separates them is the
// removed pause.
const ranges = segs.map((s) => `between(t,${s.sourceStart.toFixed(4)},${s.sourceEnd.toFixed(4)})`).join("+");

const filter = [
  `[0:v]select='${ranges}',setpts=N/FRAME_RATE/TB[v]`,
  `[0:a]aselect='${ranges}',asetpts=N/SR/TB[a]`,
].join(";\n");

fs.writeFileSync(path.join(import.meta.dirname, "select-filter.txt"), filter);
console.log(`Wrote select-filter.txt for ${segs.length} segments (${(filter.length / 1024).toFixed(0)} KB expression)`);
console.log(`expected output duration: ${cutlist.newDuration.toFixed(3)}s`);
