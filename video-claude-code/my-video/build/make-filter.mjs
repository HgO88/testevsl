#!/usr/bin/env node
// Builds an ffmpeg concat-demuxer list that trims+concats the 327 kept
// segments from cutlist.json into one continuous base video.
//
// NOTE: an earlier version used one giant -filter_complex with 327 parallel
// trim/atrim chains fanned into a single concat filter. That OOM-killed
// ffmpeg (~14GB RSS in a 15GB container) because the filtergraph buffers
// frames from every branch. The concat DEMUXER instead processes segments
// one at a time (inpoint/outpoint per entry, same source file repeated),
// so memory stays flat regardless of segment count.
import fs from "node:fs";
import path from "node:path";

const cutlist = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "cutlist.json"), "utf8"));
const segs = cutlist.segments;
// Absolute path: the concat demuxer resolves relative `file` entries against
// the list file's own directory, not cwd — absolute avoids that footgun
// regardless of where concat-list.txt or the ffmpeg invocation live.
const SRC_VIDEO = path.resolve(import.meta.dirname, "..", "InShot_20260805_133820551.mp4");

const lines = [];
for (const s of segs) {
  lines.push(`file '${SRC_VIDEO}'`);
  lines.push(`inpoint ${s.sourceStart}`);
  lines.push(`outpoint ${s.sourceEnd}`);
}

fs.writeFileSync(path.join(import.meta.dirname, "concat-list.txt"), lines.join("\n") + "\n");
console.log(`Wrote concat-list.txt with ${segs.length} segments`);
