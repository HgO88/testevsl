#!/usr/bin/env node
// Generates index.html for the therapist-training VSL edit.
// Reads the raw ffmpeg silencedetect log + the transcript, builds a trimmed
// cutlist (jump cuts on long pauses), then emits video+audio clip pairs plus
// the 5 approved beat overlays (3 keyword captions + 2 full-screen graphic
// cutaways) on top, at their correctly time-shifted positions.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(__dirname, "..");
const SRC_VIDEO = "InShot_20260805_133820551.mp4";
const SILENCE_LOG = "/tmp/claude-0/-home-user-testevsl/61efbf79-bd66-5435-8ea3-4d74349a64b3/scratchpad/silencedetect_full.log";

// ---- 1. Parse silence intervals from the ffmpeg log ----------------------
const log = fs.readFileSync(SILENCE_LOG, "utf8");
const starts = [...log.matchAll(/silence_start:\s*([\d.]+)/g)].map((m) => parseFloat(m[1]));
const ends = [...log.matchAll(/silence_end:\s*([\d.]+)\s*\|/g)].map((m) => parseFloat(m[1]));
// Pair them up (ffmpeg always emits start before its matching end; a trailing
// unmatched start with no end means silence ran to EOF — drop it, we keep the
// last spoken frame instead).
const silences = [];
for (let i = 0; i < ends.length; i++) {
  silences.push({ start: starts[i], end: ends[i] });
}

const SOURCE_DURATION = 2012.077782; // from ffprobe, § conversation record
const KEEP_PAUSE = 0.22; // seconds of natural breathing room left in every trimmed gap
const LEAD_TRIM = silences.length && silences[0].start < 0.3 ? silences[0].end - 0.1 : 0; // drop dead air before the first word

// Build the list of "cut out" ranges (the excess middle of each pause)
const cutRanges = [];
if (LEAD_TRIM > 0) cutRanges.push([0, Math.max(0, LEAD_TRIM)]);
for (const s of silences) {
  const dur = s.end - s.start;
  if (dur <= KEEP_PAUSE) continue; // too short to bother trimming
  const mid = (s.start + s.end) / 2;
  const cutFrom = mid - (dur - KEEP_PAUSE) / 2;
  const cutTo = mid + (dur - KEEP_PAUSE) / 2;
  cutRanges.push([Math.max(0, cutFrom), Math.min(SOURCE_DURATION, cutTo)]);
}
cutRanges.sort((a, b) => a[0] - b[0]);

// Merge overlapping/adjacent cut ranges
const merged = [];
for (const r of cutRanges) {
  if (merged.length && r[0] <= merged[merged.length - 1][1] + 0.01) {
    merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], r[1]);
  } else {
    merged.push([...r]);
  }
}

// Invert to get KEPT source ranges
const kept = [];
let cursor = 0;
for (const [cs, ce] of merged) {
  if (cs > cursor) kept.push([cursor, cs]);
  cursor = Math.max(cursor, ce);
}
if (cursor < SOURCE_DURATION) kept.push([cursor, SOURCE_DURATION]);
// Drop degenerate/near-zero segments
const MIN_SEG = 0.12;
const keptClean = kept.filter(([a, b]) => b - a > MIN_SEG);

// ---- 2. Build the timeline: cumulative new-timeline positions -------------
let t = 0;
const segments = keptClean.map(([srcStart, srcEnd], i) => {
  const dur = srcEnd - srcStart;
  const seg = { id: `s${i}`, sourceStart: srcStart, sourceEnd: srcEnd, newStart: t, duration: dur };
  t += dur;
  return seg;
});
const NEW_DURATION = t;

function sourceToNewTime(sourceT) {
  for (const seg of segments) {
    if (sourceT >= seg.sourceStart && sourceT <= seg.sourceEnd) {
      return seg.newStart + (sourceT - seg.sourceStart);
    }
  }
  // fallback: nearest segment
  let best = segments[0];
  let bestDist = Infinity;
  for (const seg of segments) {
    const d = Math.min(Math.abs(sourceT - seg.sourceStart), Math.abs(sourceT - seg.sourceEnd));
    if (d < bestDist) {
      bestDist = d;
      best = seg;
    }
  }
  return sourceT < best.sourceStart ? best.newStart : best.newStart + best.duration;
}

fs.writeFileSync(
  path.join(PROJECT, "build", "cutlist.json"),
  JSON.stringify({ sourceDuration: SOURCE_DURATION, newDuration: NEW_DURATION, segmentCount: segments.length, cutRangeCount: merged.length, segments }, null, 2),
);

console.log(`source: ${SOURCE_DURATION.toFixed(1)}s -> new timeline: ${NEW_DURATION.toFixed(1)}s (${segments.length} segments, ${merged.length} cuts removed, saved ${(SOURCE_DURATION - NEW_DURATION).toFixed(1)}s)`);

// ---- 3. The 5 approved beats (source-time anchors) ------------------------
// pessoas/vidas/cuidador = short keyword-caption overlays (talking head stays visible).
// pilares/chamado_preparo = full-screen graphic cutaways (voice keeps playing under them).
const BEATS = [
  { id: "b-pilares", kind: "cutaway", srcAt: 323, holdBefore: 0.3, dur: 7.2 },
  { id: "b-pessoas", kind: "caption", srcAt: 1049, holdBefore: 0.15, dur: 2.4, pre: "ele trabalha com", word: "PESSOAS" },
  { id: "b-vidas", kind: "caption", srcAt: 1079, holdBefore: 0.15, dur: 2.6, pre: "você atende", word: "VIDAS" },
  { id: "b-chamado-preparo", kind: "cutaway", srcAt: 1490, holdBefore: 0.3, dur: 7.6 },
  { id: "b-cuidador", kind: "caption", srcAt: 1942, holdBefore: 0.15, dur: 3.0, pre: "você é", word: "CUIDADOR DE VIDA" },
].map((b) => ({ ...b, newAt: sourceToNewTime(b.srcAt) + b.holdBefore }));

console.log("beat positions (source -> new timeline):");
for (const b of BEATS) console.log(`  ${b.id}: src ${b.srcAt}s -> new ${b.newAt.toFixed(2)}s (+${b.dur}s)`);

// ---- 4. Emit the single base clip (cuts already baked by ffmpeg concat) ----
// 327 hard cuts were baked into edited-base.mp4 via build/make-filter.mjs +
// an ffmpeg concat pass — placing 654 <video>/<audio> elements pointing at
// the same 3.58GB source overloaded the browser-based check/render (protocol
// timeout). One continuous, already-cut base file keeps the composition
// light; the beat overlays below still land at the correct sourceToNewTime()
// positions because edited-base.mp4's timeline *is* that mapped timeline.
const BASE_VIDEO = "edited-base.mp4";
const TRACK_VIDEO = 0;
const TRACK_OVERLAY = 5;

function num(n) {
  return Number(n.toFixed(3));
}

const mediaClips = `      <video id="base" class="clip talking-head" src="${BASE_VIDEO}" data-start="0" data-duration="${num(NEW_DURATION)}" data-has-audio="true" data-track-index="${TRACK_VIDEO}" playsinline></video>`;

// ---- 5. Emit the 5 beat overlay clips --------------------------------------
const PILLARS = [
  { n: "01", label: "CHAMADO" },
  { n: "02", label: "TRANSFORMAÇÃO" },
  { n: "03", label: "DEPENDÊNCIA" },
  { n: "04", label: "PREPARO" },
  { n: "05", label: "SERVIÇO" },
];

function pilaresHtml(b) {
  const items = PILLARS.map(
    (p, i) => `          <div class="pillar" id="${b.id}-p${i}">
            <span class="pillar-n">${p.n}</span>
            <span class="pillar-label">${p.label}</span>
          </div>`,
  ).join("\n");
  return `      <section id="${b.id}" class="clip cutaway" data-start="${num(b.newAt)}" data-duration="${b.dur}" data-track-index="${TRACK_OVERLAY}">
        <div class="cutaway-inner">
          <h2 class="cutaway-title">OS 5 PILARES DA FORMAÇÃO</h2>
          <div class="pillars" id="${b.id}-list">
${items}
          </div>
        </div>
      </section>`;
}

function chamadoPreparoHtml(b) {
  return `      <section id="${b.id}" class="clip cutaway" data-start="${num(b.newAt)}" data-duration="${b.dur}" data-track-index="${TRACK_OVERLAY}">
        <div class="cutaway-inner compare">
          <div class="compare-side" id="${b.id}-left">
            <p class="compare-line"><span class="hl">CHAMADO</span> sem <span class="hl">PREPARO</span></p>
            <p class="compare-result">gera insegurança</p>
          </div>
          <div class="compare-plus" id="${b.id}-plus">+</div>
          <div class="compare-side" id="${b.id}-right">
            <p class="compare-line"><span class="hl">PREPARO</span> sem <span class="hl">CHAMADO</span></p>
            <p class="compare-result">gera só bom profissional</p>
          </div>
        </div>
      </section>`;
}

function captionHtml(b) {
  return `      <div id="${b.id}" class="clip caption-card" data-start="${num(b.newAt)}" data-duration="${b.dur}" data-track-index="${TRACK_OVERLAY}">
        <p class="caption-pre">${b.pre}</p>
        <p class="caption-word" id="${b.id}-word">${b.word}</p>
      </div>`;
}

const overlayClips = BEATS.map((b) => {
  if (b.id === "b-pilares") return pilaresHtml(b);
  if (b.id === "b-chamado-preparo") return chamadoPreparoHtml(b);
  return captionHtml(b);
}).join("\n\n");

// ---- 6. GSAP animation lines ------------------------------------------------
const animLines = [];
for (const b of BEATS) {
  if (b.id === "b-pilares") {
    PILLARS.forEach((_, i) => {
      const at = num(b.newAt + 0.35 + i * 0.85);
      animLines.push(`  tl.fromTo("#${b.id}-p${i}", { autoAlpha: 0, y: 28 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: "back.out(1.5)" }, ${at});`);
    });
  } else if (b.id === "b-chamado-preparo") {
    animLines.push(`  tl.fromTo("#${b.id}-left", { autoAlpha: 0, xPercent: -14 }, { autoAlpha: 1, xPercent: 0, duration: 0.6, ease: "power3.out" }, ${num(b.newAt + 0.15)});`);
    animLines.push(`  tl.fromTo("#${b.id}-right", { autoAlpha: 0, xPercent: 14 }, { autoAlpha: 1, xPercent: 0, duration: 0.6, ease: "power3.out" }, ${num(b.newAt + 0.15)});`);
    animLines.push(`  tl.fromTo("#${b.id}-plus", { autoAlpha: 0, scale: 0.4 }, { autoAlpha: 1, scale: 1, duration: 0.4, ease: "back.out(1.6)" }, ${num(b.newAt + 0.7)});`);
  } else {
    animLines.push(`  tl.fromTo("#${b.id}-word", { autoAlpha: 0, scale: 0.85 }, { autoAlpha: 1, scale: 1, duration: 0.45, ease: "back.out(1.6)" }, ${num(b.newAt + 0.1)});`);
    animLines.push(`  tl.fromTo("#${b.id} .caption-pre", { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.3, ease: "power2.out" }, ${num(b.newAt)});`);
  }
}

// ---- 7. Assemble index.html -------------------------------------------------
const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <title>Terapia com Alma — Aula 1 (VSL)</title>
    <script src="vendor/gsap.min.js"></script>
    <style>
      :root {
        --bg: #0b0e14;
        --ink: #f5f1e8;
        --accent: #d4a24e;
        --accent-2: #7c9885;
      }
      body { margin: 0; background: var(--bg); color: var(--ink); font-family: Arial, Helvetica, sans-serif; }
      #root { position: relative; width: 1920px; height: 1080px; overflow: hidden; background: #000; }
      .clip { position: absolute; inset: 0; }
      .talking-head { width: 100%; height: 100%; object-fit: cover; }

      /* Keyword caption card: lower-third center, never over the face */
      .caption-card {
        display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
        padding-bottom: 90px; text-align: center; pointer-events: none;
      }
      .caption-pre {
        margin: 0 0 6px; font-size: 34px; font-weight: 400; color: var(--ink);
        text-shadow: 0 2px 12px rgba(0,0,0,.65);
      }
      .caption-word {
        margin: 0; font-size: 76px; font-weight: 800; letter-spacing: 0.5px;
        color: var(--accent); text-shadow: 0 4px 18px rgba(0,0,0,.7);
      }

      /* Full-screen cutaway graphics */
      .cutaway { background: linear-gradient(160deg, #0b0e14 0%, #141a24 100%); display: grid; place-items: center; }
      .cutaway-inner { width: 1500px; }
      .cutaway-title { text-align: center; font-size: 40px; letter-spacing: 4px; color: var(--accent-2); margin: 0 0 56px; font-weight: 700; }
      .pillars { display: flex; flex-direction: column; gap: 22px; }
      .pillar { display: flex; align-items: center; gap: 28px; background: rgba(255,255,255,0.04); border-left: 6px solid var(--accent); border-radius: 8px; padding: 20px 36px; }
      .pillar-n { font-size: 44px; font-weight: 800; color: var(--accent); width: 90px; }
      .pillar-label { font-size: 44px; font-weight: 700; color: var(--ink); letter-spacing: 1px; }

      .compare { display: flex; align-items: center; justify-content: center; gap: 70px; width: 1700px; }
      .compare-side { flex: 1; background: rgba(255,255,255,0.04); border-radius: 12px; padding: 56px 44px; text-align: center; }
      .compare-line { font-size: 40px; font-weight: 700; margin: 0 0 18px; color: var(--ink); }
      .compare-line .hl { color: var(--accent); }
      .compare-result { font-size: 30px; color: #c9c2b3; margin: 0; }
      .compare-plus { font-size: 64px; font-weight: 800; color: var(--accent-2); }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-width="1920" data-height="1080" data-duration="${num(NEW_DURATION)}">
${mediaClips}

${overlayClips}
    </div>
    <script>
      const tl = gsap.timeline({ paused: true });
${animLines.join("\n")}
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;

fs.writeFileSync(path.join(PROJECT, "index.html"), html);
console.log(`\nWrote index.html (${(html.length / 1024).toFixed(0)} KB), duration ${num(NEW_DURATION)}s`);

// ---- 8. Split into 6 independently-renderable chunks -----------------------
// A single 30min/54k-frame render exhausted disk (a persistent 21GB frame
// cache) and blew past the CLI's internal ffmpeg-extraction timeout. Six
// ~5min chunks (~9k frames each) render individually, then get stitched back
// with a cheap `-c copy` concat — same fix shape as the base-video cuts, one
// level up.
const N_CHUNKS = 6;
const MARGIN = 0.5;

function chunkBoundaries(nChunks, totalDuration, beats) {
  const raw = Array.from({ length: nChunks - 1 }, (_, i) => (totalDuration * (i + 1)) / nChunks);
  return raw.map((b) => {
    const hit = beats.find((beat) => b > beat.newAt - MARGIN && b < beat.newAt + beat.dur + MARGIN);
    if (!hit) return b;
    // Prefer pushing the boundary just past the beat; fall back to just before it.
    const after = hit.newAt + hit.dur + MARGIN;
    const before = hit.newAt - MARGIN;
    return after <= totalDuration ? after : before;
  });
}

const cuts = [0, ...chunkBoundaries(N_CHUNKS, NEW_DURATION, BEATS), NEW_DURATION];
// 1-indexed (chunk-1.html .. chunk-6.html) so they read naturally when joining them later.
const chunks = cuts.slice(0, -1).map((start, i) => ({ index: i + 1, start, end: cuts[i + 1] }));

fs.writeFileSync(path.join(PROJECT, "build", "chunks.json"), JSON.stringify(chunks, null, 2));

function chunkHtml(chunk) {
  const compId = `chunk${chunk.index}`;
  const dur = num(chunk.end - chunk.start);
  const localBeats = BEATS.filter((b) => b.newAt >= chunk.start - 0.01 && b.newAt < chunk.end - 0.01).map((b) => ({
    ...b,
    newAt: num(b.newAt - chunk.start),
  }));

  const chunkOverlays = localBeats
    .map((b) => {
      if (b.id === "b-pilares") return pilaresHtml(b);
      if (b.id === "b-chamado-preparo") return chamadoPreparoHtml(b);
      return captionHtml(b);
    })
    .join("\n\n");

  const chunkAnimLines = [];
  for (const b of localBeats) {
    if (b.id === "b-pilares") {
      PILLARS.forEach((_, i) => {
        const at = num(b.newAt + 0.35 + i * 0.85);
        chunkAnimLines.push(`  tl.fromTo("#${b.id}-p${i}", { autoAlpha: 0, y: 28 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: "back.out(1.5)" }, ${at});`);
      });
    } else if (b.id === "b-chamado-preparo") {
      chunkAnimLines.push(`  tl.fromTo("#${b.id}-left", { autoAlpha: 0, xPercent: -14 }, { autoAlpha: 1, xPercent: 0, duration: 0.6, ease: "power3.out" }, ${num(b.newAt + 0.15)});`);
      chunkAnimLines.push(`  tl.fromTo("#${b.id}-right", { autoAlpha: 0, xPercent: 14 }, { autoAlpha: 1, xPercent: 0, duration: 0.6, ease: "power3.out" }, ${num(b.newAt + 0.15)});`);
      chunkAnimLines.push(`  tl.fromTo("#${b.id}-plus", { autoAlpha: 0, scale: 0.4 }, { autoAlpha: 1, scale: 1, duration: 0.4, ease: "back.out(1.6)" }, ${num(b.newAt + 0.7)});`);
    } else {
      chunkAnimLines.push(`  tl.fromTo("#${b.id}-word", { autoAlpha: 0, scale: 0.85 }, { autoAlpha: 1, scale: 1, duration: 0.45, ease: "back.out(1.6)" }, ${num(b.newAt + 0.1)});`);
      chunkAnimLines.push(`  tl.fromTo("#${b.id} .caption-pre", { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.3, ease: "power2.out" }, ${num(b.newAt)});`);
    }
  }

  const chunkMediaClip = `      <video id="base" class="clip talking-head" src="${BASE_VIDEO}" data-start="0" data-duration="${dur}" data-media-start="${num(chunk.start)}" data-has-audio="true" data-track-index="${TRACK_VIDEO}" playsinline></video>`;

  return html
    .replace(/data-composition-id="main"/, `data-composition-id="${compId}"`)
    .replace(`data-duration="${num(NEW_DURATION)}"`, `data-duration="${dur}"`)
    .replace(mediaClips, chunkMediaClip)
    .replace(overlayClips, chunkOverlays || "      <!-- no beats in this chunk -->")
    .replace(animLines.join("\n"), chunkAnimLines.join("\n"))
    .replace('window.__timelines["main"]', `window.__timelines["${compId}"]`)
    .replace("<title>Terapia com Alma — Aula 1 (VSL)</title>", `<title>Terapia com Alma — chunk ${chunk.index}</title>`);
}

for (const chunk of chunks) {
  fs.writeFileSync(path.join(PROJECT, `chunk-${chunk.index}.html`), chunkHtml(chunk));
}

console.log(`\nWrote ${chunks.length} chunk files:`);
for (const c of chunks) {
  const beatsIn = BEATS.filter((b) => b.newAt >= c.start - 0.01 && b.newAt < c.end - 0.01).map((b) => b.id);
  console.log(`  chunk-${c.index}.html: [${c.start.toFixed(1)}s, ${c.end.toFixed(1)}s) dur=${(c.end - c.start).toFixed(1)}s beats=[${beatsIn.join(", ") || "none"}]`);
}
