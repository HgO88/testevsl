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

// ---- 3. The 5 approved beats (source-time anchors), plus 1 highlight effect -
// pessoas/vidas/cuidador = short keyword-caption overlays (talking head stays visible).
// pilares/chamado_preparo = full-screen graphic cutaways (voice keeps playing under them).
// camcorder = client-requested "recording HUD" filter (grayscale + REC/battery/
// 4K/HD viewfinder overlay) on top of the still-visible talking head, placed on
// his most personal/vulnerable line ("as maiores feridas da sua história podem
// se tornar o lugar onde Deus fará brotar o maior ministério de cuidado").
const BEATS = [
  // -- opening/hook reinforcement (client feedback: chunk-1 is the "chamada",
  // it needs more energy — more keyword captions + a 2nd camcorder moment) --
  { id: "b-intro-chamado", kind: "caption", srcAt: 3, holdBefore: 0.15, dur: 2.4, pre: "você foi", word: "CHAMADO?" },
  { id: "b-confesso", kind: "camcorder", srcAt: 98, holdBefore: 0.1, dur: 6.5 },
  { id: "b-preparo-intro", kind: "caption", srcAt: 163, holdBefore: 0.15, dur: 2.4, pre: "cuidar de vida exige", word: "PREPARO" },
  { id: "b-essencia", kind: "caption", srcAt: 258, holdBefore: 0.15, dur: 2.8, pre: "não podemos perder a", word: "ESSÊNCIA DO CHAMADO" },
  // -- original 5 approved beats --
  { id: "b-pilares", kind: "cutaway", srcAt: 323, holdBefore: 0.3, dur: 7.2 },
  // -- reinforcement pass 2 (client: same energy across the whole video, not
  // just the opening) — 2-3 more keyword captions per chunk that had little
  // or no caption of its own --
  { id: "b-transformacao-2", kind: "caption", srcAt: 368, holdBefore: 0.15, dur: 2.4, pre: "o segundo pilar é a", word: "TRANSFORMAÇÃO" },
  { id: "b-feridas", kind: "caption", srcAt: 600, holdBefore: 0.15, dur: 2.4, pre: "deus chama pessoas que já foram", word: "FERIDAS" },
  { id: "b-restauracao", kind: "caption", srcAt: 765, holdBefore: 0.15, dur: 2.6, pre: "deus usa pessoas para trazer", word: "RESTAURAÇÃO" },
  { id: "b-transforma-2", kind: "caption", srcAt: 905, holdBefore: 0.15, dur: 2.4, pre: "deus me consola, deus me", word: "TRANSFORMA" },
  { id: "b-pessoas", kind: "caption", srcAt: 1049, holdBefore: 0.15, dur: 2.4, pre: "ele trabalha com", word: "PESSOAS" },
  { id: "b-vidas", kind: "caption", srcAt: 1079, holdBefore: 0.15, dur: 2.6, pre: "você atende", word: "VIDAS" },
  { id: "b-acolhida", kind: "caption", srcAt: 1195, holdBefore: 0.15, dur: 2.6, pre: "jesus via vidas a serem", word: "ACOLHIDAS" },
  { id: "b-excelencia", kind: "caption", srcAt: 1580, holdBefore: 0.15, dur: 2.6, pre: "segunda perna:", word: "EXCELÊNCIA NO PREPARO" },
  { id: "b-dependencia-2", kind: "caption", srcAt: 1608, holdBefore: 0.15, dur: 2.4, pre: "o quarto pilar é a", word: "DEPENDÊNCIA" },
  { id: "b-servico-2", kind: "caption", srcAt: 1820, holdBefore: 0.15, dur: 2.4, pre: "o quinto pilar é o", word: "SERVIÇO" },
  { id: "b-carater", kind: "caption", srcAt: 1912, holdBefore: 0.15, dur: 2.6, pre: "a maior ferramenta é o seu", word: "CARÁTER" },
  { id: "b-chamado-preparo", kind: "cutaway", srcAt: 1490, holdBefore: 0.3, dur: 7.6 },
  { id: "b-cuidador", kind: "caption", srcAt: 1942, holdBefore: 0.15, dur: 3.0, pre: "você é", word: "CUIDADOR DE VIDA" },
  { id: "b-camcorder", kind: "camcorder", srcAt: 992, holdBefore: 0.2, dur: 7 },
  // -- reinforcement pass 3 (client: "gostaria também da adição de mais img")
  // -- one full-screen quote-card per chunk that had no photo cutaway yet,
  // using 5 of the 10 still-unused client photos (2 more stay unused: the
  // 2 with baked-in text/typography, unusable as a background under a
  // second text layer) --
  { id: "b-quote-abandono", kind: "quote", srcAt: 620, holdBefore: 0.2, dur: 6, img: "media/broll/papel-parede-jesus.jpg", text: "JESUS CONHECEU O ABANDONO, A REJEIÇÃO, A SOLIDÃO." },
  { id: "b-quote-consolacao", kind: "quote", srcAt: 865, holdBefore: 0.2, dur: 7, img: "media/broll/tua-graca-me-basta.jpg", kicker: "2 CORÍNTIOS 1:3-4", text: "DEUS DE TODA CONSOLAÇÃO, QUE NOS CONSOLA PARA CONSOLARMOS OS OUTROS." },
  { id: "b-quote-amor", kind: "quote", srcAt: 1280, holdBefore: 0.2, dur: 5, img: "media/broll/transferir-1.jpg", text: "SOMENTE O AMOR SUSTENTA O CHAMADO." },
  { id: "b-quote-honra", kind: "quote", srcAt: 1420, holdBefore: 0.2, dur: 6, img: "media/broll/dom-profetico.jpg", text: "O CHAMADO ABRE A PORTA. O PREPARO FAZ VOCÊ HONRAR A DEUS NELA." },
  { id: "b-quote-cuidado", kind: "quote", srcAt: 1920, holdBefore: 0.2, dur: 6, img: "media/broll/desse-jeito.jpg", text: "VÃO ESQUECER AS TÉCNICAS. NUNCA VÃO ESQUECER QUE FORAM CUIDADAS POR VOCÊ." },
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
// Real client-supplied photos (media/broll/, see BRIEF.md "Assets") slotted
// into the two full-screen cutaways — the only beats where the talking head
// steps aside for graphics. Keyword-caption beats keep the face on screen by
// design, so no background photo goes there.
const PILLARS = [
  { n: "01", label: "CHAMADO", img: "media/broll/maos-oracao-cruz.jpg" },
  { n: "02", label: "TRANSFORMAÇÃO", img: "media/broll/pessoa-ajoelhada-deus-respira.jpg" },
  { n: "03", label: "DEPENDÊNCIA", img: "media/broll/cruz-luz.jpg" },
  { n: "04", label: "PREPARO", img: "media/broll/josue-licoes.jpg" },
  { n: "05", label: "SERVIÇO", img: "media/broll/gloria-de-deus.jpg" },
];
const COMPARE_IMG_LEFT = "media/broll/sinais-espirito-santo.jpg"; // CHAMADO side
const COMPARE_IMG_RIGHT = "media/broll/espiritualidade-crista.jpg"; // PREPARO side

function pilaresHtml(b) {
  const bgLayers = PILLARS.map((p, i) => `        <img class="cutaway-bg" id="${b.id}-bgimg${i}" src="${p.img}" alt="" />`).join("\n");
  const items = PILLARS.map(
    (p, i) => `          <div class="pillar" id="${b.id}-p${i}">
            <span class="pillar-n">${p.n}</span>
            <span class="pillar-label">${p.label}</span>
          </div>`,
  ).join("\n");
  return `      <section id="${b.id}" class="clip cutaway" data-start="${num(b.newAt)}" data-duration="${b.dur}" data-track-index="${TRACK_OVERLAY}">
        <div class="cutaway-bgs">
${bgLayers}
        </div>
        <div class="cutaway-scrim"></div>
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
            <div class="compare-bg-wrap"><img class="compare-bg" id="${b.id}-bg-left" src="${COMPARE_IMG_LEFT}" alt="" /></div>
            <div class="compare-text">
              <p class="compare-line"><span class="hl">CHAMADO</span> sem <span class="hl">PREPARO</span></p>
              <p class="compare-result">gera insegurança</p>
            </div>
          </div>
          <div class="compare-plus" id="${b.id}-plus">+</div>
          <div class="compare-side" id="${b.id}-right">
            <div class="compare-bg-wrap"><img class="compare-bg" id="${b.id}-bg-right" src="${COMPARE_IMG_RIGHT}" alt="" /></div>
            <div class="compare-text">
              <p class="compare-line"><span class="hl">PREPARO</span> sem <span class="hl">CHAMADO</span></p>
              <p class="compare-result">gera só bom profissional</p>
            </div>
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

function camcorderHtml(b) {
  return `      <div id="${b.id}" class="clip camcorder-hud" data-start="${num(b.newAt)}" data-duration="${b.dur}" data-track-index="${TRACK_OVERLAY}">
        <span class="cam-corner tl"></span>
        <span class="cam-corner tr"></span>
        <span class="cam-corner bl"></span>
        <span class="cam-corner br"></span>
        <div class="cam-battery"><span class="cam-battery-icon"></span></div>
        <div class="cam-rec"><span class="cam-rec-dot" id="${b.id}-dot"></span>REC</div>
        <div class="cam-4k">4K 60FPS</div>
        <div class="cam-hd">HD</div>
      </div>`;
}

function quoteHtml(b) {
  const kicker = b.kicker ? `<p class="quote-kicker">${b.kicker}</p>` : "";
  return `      <section id="${b.id}" class="clip cutaway quote-cutaway" data-start="${num(b.newAt)}" data-duration="${b.dur}" data-track-index="${TRACK_OVERLAY}">
        <div class="cutaway-bgs"><img class="cutaway-bg" id="${b.id}-bg" src="${b.img}" alt="" /></div>
        <div class="cutaway-scrim"></div>
        <div class="quote-inner" id="${b.id}-inner">
          ${kicker}
          <p class="quote-text">${b.text}</p>
        </div>
      </section>`;
}

function beatHtml(b) {
  if (b.id === "b-pilares") return pilaresHtml(b);
  if (b.id === "b-chamado-preparo") return chamadoPreparoHtml(b);
  if (b.kind === "camcorder") return camcorderHtml(b);
  if (b.kind === "quote") return quoteHtml(b);
  return captionHtml(b);
}

const overlayClips = BEATS.map(beatHtml).join("\n\n");

// ---- 6. GSAP animation lines ------------------------------------------------
const animLines = [];
for (const b of BEATS) {
  if (b.id === "b-pilares") {
    animLines.push(`  tl.fromTo("#${b.id} .cutaway-bgs", { scale: 1 }, { scale: 1.12, duration: ${num(b.dur)}, ease: "none" }, ${num(b.newAt)});`);
    PILLARS.forEach((_, i) => {
      const at = num(b.newAt + 0.35 + i * 0.85);
      animLines.push(`  tl.fromTo("#${b.id}-p${i}", { autoAlpha: 0, y: 28 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: "back.out(1.5)" }, ${at});`);
      if (i === 0) {
        animLines.push(`  tl.fromTo("#${b.id}-bgimg0", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4 }, ${num(b.newAt)});`);
      } else {
        animLines.push(`  tl.set("#${b.id}-bgimg${i}", { autoAlpha: 0 }, ${num(b.newAt)});`);
        animLines.push(`  tl.fromTo("#${b.id}-bgimg${i - 1}", { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.6 }, ${at});`);
        animLines.push(`  tl.fromTo("#${b.id}-bgimg${i}", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6 }, ${at});`);
      }
    });
  } else if (b.id === "b-chamado-preparo") {
    animLines.push(`  tl.fromTo("#${b.id}-left", { autoAlpha: 0, xPercent: -14 }, { autoAlpha: 1, xPercent: 0, duration: 0.6, ease: "power3.out" }, ${num(b.newAt + 0.15)});`);
    animLines.push(`  tl.fromTo("#${b.id}-right", { autoAlpha: 0, xPercent: 14 }, { autoAlpha: 1, xPercent: 0, duration: 0.6, ease: "power3.out" }, ${num(b.newAt + 0.15)});`);
    animLines.push(`  tl.fromTo("#${b.id}-plus", { autoAlpha: 0, scale: 0.4 }, { autoAlpha: 1, scale: 1, duration: 0.4, ease: "back.out(1.6)" }, ${num(b.newAt + 0.7)});`);
    animLines.push(`  tl.fromTo("#${b.id}-bg-left", { scale: 1 }, { scale: 1.1, duration: ${num(b.dur - 0.2)}, ease: "none" }, ${num(b.newAt + 0.15)});`);
    animLines.push(`  tl.fromTo("#${b.id}-bg-right", { scale: 1 }, { scale: 1.1, duration: ${num(b.dur - 0.2)}, ease: "none" }, ${num(b.newAt + 0.15)});`);
  } else if (b.kind === "camcorder") {
    animLines.push(`  tl.fromTo("#base", { filter: "grayscale(0%)" }, { filter: "grayscale(100%)", duration: 0.5 }, ${num(b.newAt)});`);
    animLines.push(`  tl.fromTo("#base", { filter: "grayscale(100%)" }, { filter: "grayscale(0%)", duration: 0.5 }, ${num(b.newAt + b.dur - 0.5)});`);
    animLines.push(`  tl.fromTo("#${b.id}", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, ${num(b.newAt)});`);
    animLines.push(`  tl.to("#${b.id}", { autoAlpha: 0, duration: 0.3 }, ${num(b.newAt + b.dur - 0.3)});`);
    animLines.push(`  tl.to("#${b.id}-dot", { autoAlpha: 0.15, duration: 0.35, repeat: 16, yoyo: true }, ${num(b.newAt + 0.3)});`);
  } else if (b.kind === "quote") {
    animLines.push(`  tl.fromTo("#${b.id}-bg", { scale: 1 }, { scale: 1.1, duration: ${num(b.dur)}, ease: "none" }, ${num(b.newAt)});`);
    animLines.push(`  tl.fromTo("#${b.id}-inner", { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: "power3.out" }, ${num(b.newAt + 0.2)});`);
  } else {
    animLines.push(`  tl.fromTo("#${b.id}-word", { autoAlpha: 0, scale: 0.85 }, { autoAlpha: 1, scale: 1, duration: 0.45, ease: "back.out(1.6)" }, ${num(b.newAt + 0.1)});`);
    animLines.push(`  tl.fromTo("#${b.id} .caption-pre", { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.3, ease: "power2.out" }, ${num(b.newAt)});`);
  }
}

// Continuous camera-with-intent motion on the talking head (client feedback:
// the whole video read as static). The per-chunk files (section 8) repeat
// this once per ~5min chunk so every concatenation seam sits at scale 1; this
// single-file version just spans the whole timeline for parity.
animLines.push(`  tl.fromTo("#base", { scale: 1 }, { scale: 1.05, duration: ${num(NEW_DURATION / 2)}, ease: "sine.inOut" }, 0);`);
animLines.push(`  tl.fromTo("#base", { scale: 1.05 }, { scale: 1, duration: ${num(NEW_DURATION / 2)}, ease: "sine.inOut" }, ${num(NEW_DURATION / 2)});`);

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
      .cutaway { background: linear-gradient(160deg, #0b0e14 0%, #141a24 100%); display: grid; place-items: center; position: relative; overflow: hidden; }
      .cutaway-bgs { position: absolute; inset: 0; z-index: 0; }
      .cutaway-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
      .cutaway-scrim { position: absolute; inset: 0; z-index: 1; background: linear-gradient(180deg, rgba(11,14,20,.55) 0%, rgba(11,14,20,.8) 55%, rgba(11,14,20,.92) 100%); }
      .cutaway-inner { width: 1500px; position: relative; z-index: 2; }
      .cutaway-title { text-align: center; font-size: 40px; letter-spacing: 4px; color: var(--accent-2); margin: 0 0 56px; font-weight: 700; }
      .pillars { display: flex; flex-direction: column; gap: 22px; }
      .pillar { display: flex; align-items: center; gap: 28px; background: rgba(11,14,20,0.45); backdrop-filter: blur(2px); border-left: 6px solid var(--accent); border-radius: 8px; padding: 20px 36px; }
      .pillar-n { font-size: 44px; font-weight: 800; color: var(--accent); width: 90px; }
      .pillar-label { font-size: 44px; font-weight: 700; color: var(--ink); letter-spacing: 1px; }

      .compare { display: flex; align-items: center; justify-content: center; gap: 70px; width: 1700px; }
      .compare-side { flex: 1; position: relative; border-radius: 12px; padding: 56px 44px; text-align: center; overflow: hidden; isolation: isolate; }
      .compare-bg-wrap { position: absolute; inset: 0; z-index: 0; }
      .compare-bg { width: 100%; height: 100%; object-fit: cover; display: block; }
      .compare-bg-wrap::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(11,14,20,.55) 0%, rgba(11,14,20,.85) 100%); }
      .compare-text { position: relative; z-index: 1; }
      .compare-line { font-size: 40px; font-weight: 700; margin: 0 0 18px; color: var(--ink); }
      .compare-line .hl { color: var(--accent); }
      .compare-result { font-size: 30px; color: #c9c2b3; margin: 0; }
      .compare-plus { font-size: 64px; font-weight: 800; color: var(--accent-2); }

      /* Camcorder / recording-HUD highlight treatment (over the still-visible talking head) */
      .camcorder-hud { pointer-events: none; font-family: "Courier New", Courier, monospace; color: #fff; }
      .cam-corner { position: absolute; width: 34px; height: 34px; border-color: rgba(255,255,255,.85); border-style: solid; border-width: 0; }
      .cam-corner.tl { top: 40px; left: 40px; border-top-width: 3px; border-left-width: 3px; }
      .cam-corner.tr { top: 40px; right: 40px; border-top-width: 3px; border-right-width: 3px; }
      .cam-corner.bl { bottom: 40px; left: 40px; border-bottom-width: 3px; border-left-width: 3px; }
      .cam-corner.br { bottom: 40px; right: 40px; border-bottom-width: 3px; border-right-width: 3px; }
      .cam-battery { position: absolute; top: 48px; left: 84px; }
      .cam-battery-icon { display: inline-block; width: 34px; height: 16px; border: 2px solid #fff; border-radius: 3px; position: relative; }
      .cam-battery-icon::before { content: ""; position: absolute; inset: 2px; right: 8px; background: #fff; }
      .cam-battery-icon::after { content: ""; position: absolute; right: -6px; top: 4px; width: 4px; height: 8px; background: #fff; border-radius: 0 2px 2px 0; }
      .cam-rec { position: absolute; top: 48px; right: 84px; font-size: 22px; font-weight: 700; letter-spacing: 1px; display: flex; align-items: center; gap: 8px; }
      .cam-rec-dot { width: 14px; height: 14px; border-radius: 50%; background: #e5484d; display: inline-block; }
      .cam-4k { position: absolute; bottom: 48px; left: 84px; font-size: 20px; font-weight: 600; letter-spacing: 1px; }
      .cam-hd { position: absolute; bottom: 48px; right: 84px; font-size: 20px; font-weight: 600; letter-spacing: 1px; }

      /* Full-screen quote card (client photo + a strong line from the transcript).
         Client reference: italic serif, bottom-left, over a black gradient —
         not centered bold caps (that treatment stays for keyword captions). */
      .quote-cutaway.cutaway { display: flex; align-items: flex-end; justify-content: flex-start; padding: 0 0 110px 110px; }
      .quote-cutaway .cutaway-bg { position: absolute; inset: 0; }
      .quote-cutaway .cutaway-scrim { background: linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,.55) 45%, rgba(0,0,0,.88) 65%, rgba(0,0,0,.97) 100%); }
      .quote-inner { width: 1150px; text-align: left; }
      .quote-kicker { font-family: Georgia, "Times New Roman", serif; font-style: italic; font-size: 24px; letter-spacing: 2px; color: var(--accent-2); font-weight: 400; margin: 0 0 16px; text-shadow: 0 2px 10px rgba(0,0,0,.9); }
      .quote-text { font-family: Georgia, "Times New Roman", serif; font-style: italic; font-weight: 400; font-size: 52px; line-height: 1.35; color: var(--ink); text-align: left; margin: 0; text-shadow: 0 2px 6px rgba(0,0,0,.95), 0 0 24px rgba(0,0,0,.9); }
      .quote-text .hl { color: var(--accent); }
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

  const chunkOverlays = localBeats.map(beatHtml).join("\n\n");

  const chunkAnimLines = [];
  for (const b of localBeats) {
    if (b.id === "b-pilares") {
      chunkAnimLines.push(`  tl.fromTo("#${b.id} .cutaway-bgs", { scale: 1 }, { scale: 1.12, duration: ${num(b.dur)}, ease: "none" }, ${num(b.newAt)});`);
      PILLARS.forEach((_, i) => {
        const at = num(b.newAt + 0.35 + i * 0.85);
        chunkAnimLines.push(`  tl.fromTo("#${b.id}-p${i}", { autoAlpha: 0, y: 28 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: "back.out(1.5)" }, ${at});`);
        if (i === 0) {
          chunkAnimLines.push(`  tl.fromTo("#${b.id}-bgimg0", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4 }, ${num(b.newAt)});`);
        } else {
          chunkAnimLines.push(`  tl.set("#${b.id}-bgimg${i}", { autoAlpha: 0 }, ${num(b.newAt)});`);
          chunkAnimLines.push(`  tl.fromTo("#${b.id}-bgimg${i - 1}", { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.6 }, ${at});`);
          chunkAnimLines.push(`  tl.fromTo("#${b.id}-bgimg${i}", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.6 }, ${at});`);
        }
      });
    } else if (b.id === "b-chamado-preparo") {
      chunkAnimLines.push(`  tl.fromTo("#${b.id}-left", { autoAlpha: 0, xPercent: -14 }, { autoAlpha: 1, xPercent: 0, duration: 0.6, ease: "power3.out" }, ${num(b.newAt + 0.15)});`);
      chunkAnimLines.push(`  tl.fromTo("#${b.id}-right", { autoAlpha: 0, xPercent: 14 }, { autoAlpha: 1, xPercent: 0, duration: 0.6, ease: "power3.out" }, ${num(b.newAt + 0.15)});`);
      chunkAnimLines.push(`  tl.fromTo("#${b.id}-plus", { autoAlpha: 0, scale: 0.4 }, { autoAlpha: 1, scale: 1, duration: 0.4, ease: "back.out(1.6)" }, ${num(b.newAt + 0.7)});`);
      chunkAnimLines.push(`  tl.fromTo("#${b.id}-bg-left", { scale: 1 }, { scale: 1.1, duration: ${num(b.dur - 0.2)}, ease: "none" }, ${num(b.newAt + 0.15)});`);
      chunkAnimLines.push(`  tl.fromTo("#${b.id}-bg-right", { scale: 1 }, { scale: 1.1, duration: ${num(b.dur - 0.2)}, ease: "none" }, ${num(b.newAt + 0.15)});`);
    } else if (b.kind === "camcorder") {
      chunkAnimLines.push(`  tl.fromTo("#base", { filter: "grayscale(0%)" }, { filter: "grayscale(100%)", duration: 0.5 }, ${num(b.newAt)});`);
      chunkAnimLines.push(`  tl.fromTo("#base", { filter: "grayscale(100%)" }, { filter: "grayscale(0%)", duration: 0.5 }, ${num(b.newAt + b.dur - 0.5)});`);
      chunkAnimLines.push(`  tl.fromTo("#${b.id}", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, ${num(b.newAt)});`);
      chunkAnimLines.push(`  tl.to("#${b.id}", { autoAlpha: 0, duration: 0.3 }, ${num(b.newAt + b.dur - 0.3)});`);
      chunkAnimLines.push(`  tl.to("#${b.id}-dot", { autoAlpha: 0.15, duration: 0.35, repeat: 16, yoyo: true }, ${num(b.newAt + 0.3)});`);
    } else if (b.kind === "quote") {
      chunkAnimLines.push(`  tl.fromTo("#${b.id}-bg", { scale: 1 }, { scale: 1.1, duration: ${num(b.dur)}, ease: "none" }, ${num(b.newAt)});`);
      chunkAnimLines.push(`  tl.fromTo("#${b.id}-inner", { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: "power3.out" }, ${num(b.newAt + 0.2)});`);
    } else {
      chunkAnimLines.push(`  tl.fromTo("#${b.id}-word", { autoAlpha: 0, scale: 0.85 }, { autoAlpha: 1, scale: 1, duration: 0.45, ease: "back.out(1.6)" }, ${num(b.newAt + 0.1)});`);
      chunkAnimLines.push(`  tl.fromTo("#${b.id} .caption-pre", { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.3, ease: "power2.out" }, ${num(b.newAt)});`);
    }
  }

  const chunkMediaClip = `      <video id="base" class="clip talking-head" src="${BASE_VIDEO}" data-start="0" data-duration="${dur}" data-media-start="${num(chunk.start)}" data-has-audio="true" data-track-index="${TRACK_VIDEO}" playsinline></video>`;

  // Client feedback: the whole video read as too static (camera parada).
  // Subtle continuous camera-with-intent motion on the talking head, every
  // chunk — a slow symmetric push-in-then-back (ends back at scale 1 exactly
  // where it started) so concatenating chunk-N into chunk-(N+1) never pops:
  // both sides of every seam sit at scale 1. Safe to co-animate with the
  // camcorder beat's own filter tween (different CSS property: scale vs.
  // filter).
  chunkAnimLines.push(`  tl.fromTo("#base", { scale: 1 }, { scale: 1.05, duration: ${num(dur / 2)}, ease: "sine.inOut" }, 0);`);
  chunkAnimLines.push(`  tl.fromTo("#base", { scale: 1.05 }, { scale: 1, duration: ${num(dur / 2)}, ease: "sine.inOut" }, ${num(dur / 2)});`);

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
