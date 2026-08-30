#!/usr/bin/env node
// Builds an ffmpeg filter_complex script that trims+concats the 327 kept
// segments from cutlist.json into one continuous base video (real cuts,
// not 654 HyperFrames media elements).
import fs from "node:fs";
import path from "node:path";

const cutlist = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "cutlist.json"), "utf8"));
const segs = cutlist.segments;

const lines = [];
segs.forEach((s, i) => {
  lines.push(`[0:v]trim=start=${s.sourceStart}:end=${s.sourceEnd},setpts=PTS-STARTPTS[v${i}];`);
  lines.push(`[0:a]atrim=start=${s.sourceStart}:end=${s.sourceEnd},asetpts=PTS-STARTPTS[a${i}];`);
});
const concatInputs = segs.map((_, i) => `[v${i}][a${i}]`).join("");
lines.push(`${concatInputs}concat=n=${segs.length}:v=1:a=1[outv][outa]`);

fs.writeFileSync(path.join(import.meta.dirname, "filter.txt"), lines.join("\n"));
console.log(`Wrote filter.txt with ${segs.length} segments`);
