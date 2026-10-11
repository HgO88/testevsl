// Gera index.html: legenda cinetica no estilo do Reel de referencia sobre o bruto.
// Uso: node build/generate.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname;
const DUR = 19.5;
const words = JSON.parse(readFileSync(ROOT + "media/words-0-20s.json", "utf8"));

// Cada grupo: linha pequena (lead) + palavra-chave grande (big).
// lead/big sao procurados na transcricao a partir de `from`, na ordem.
// style: caps | ital | serif | type (letra a letra) ; bar: sim | nao
const PLAN = [
  { from: 0.0, lead: "hoje eu quero falar com", big: "você", style: "ital", sfx: "whoosh" },
  { from: 1.2, lead: "que pensa em dizer", big: "não", style: "caps", bar: "nao", sfx: "impacto", punch: 0.06 },
  { from: 3.0, lead: "mas na hora você diz", big: "sim", style: "caps", bar: "sim", sfx: "ding" },
  { from: 5.0, lead: "alguém te pede", big: "um favor", style: "serif", sfx: "glitter" },
  { from: 6.3, lead: "e você não queria", big: "fazer", style: "ital", sfx: "swish" },
  { from: 7.9, lead: "só que você acaba dizendo", big: "sim", style: "caps", bar: "sim", sfx: "ding", punch: 0.04 },
  { from: 9.3, lead: "", big: "tá tudo bem, eu faço.", style: "type", quote: true },
  { from: 10.5, lead: "termina a", big: "ligação", style: "ital", sfx: "whoosh-curto" },
  { from: 11.8, lead: "morrendo de", big: "raiva", style: "caps", sfx: "impacto", punch: 0.1, shake: true },
  { from: 13.0, lead: "de quem pediu e", big: "de você mesmo", style: "ital", sfx: "swish" },
  { from: 14.5, lead: "porque você sabe que você deveria ter dito", big: "não", style: "caps", bar: "nao", sfx: "impacto", punch: 0.07 },
  { from: 16.7, lead: "mas quando chegou na hora, você", big: "não conseguiu.", style: "serif", sfx: "glitter" },
];
// cortes de cena do bruto (ffmpeg scene > 0.25)
const CUTS = [4.933, 14.6];

const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
let cursor = 0;
function find(token, from) {
  for (let i = Math.max(cursor, 0); i < words.length; i++) {
    if (words[i].start < from - 0.01) continue;
    if (norm(words[i].text) === norm(token)) { cursor = i + 1; return words[i]; }
  }
  throw new Error(`palavra "${token}" nao encontrada depois de ${from}s`);
}

const groups = PLAN.map((g, gi) => {
  cursor = 0;
  const lead = g.lead ? g.lead.split(" ").map((t) => ({ text: t, at: find(t, g.from).start })) : [];
  const bigTokens = g.big.split(" ");
  const bigWords = bigTokens.map((t) => find(t, g.from));
  const at = bigWords[0].start;
  return { ...g, id: `g${gi}`, lead, at, bigEnd: bigWords.at(-1).end, start: lead.length ? lead[0].at : at };
});
groups.forEach((g, i) => (g.end = i + 1 < groups.length ? groups[i + 1].start - 0.03 : DUR));

// ---- SFX ----
const wavDur = (f) => +execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", ROOT + f]).toString();
const VOL = { pop: 0.3, whoosh: 0.5, "whoosh-curto": 0.5, swish: 0.5, ding: 0.4, glitter: 0.35, impacto: 0.55, shutter: 0.5, tecla: 0.3, riser: 0.35, click: 0.4 };
const sfx = [];
const addSfx = (name, at) => sfx.push({ name, at: Math.max(0, +at.toFixed(3)) });
for (const g of groups) {
  if (g.lead.length) addSfx("pop", g.lead[0].at - 0.03);
  if (g.sfx) addSfx(g.sfx, g.at - (g.sfx.startsWith("whoosh") || g.sfx === "swish" ? 0.15 : 0.02));
}
for (const c of CUTS) addSfx("shutter", c - 0.04);

// ---- typewriter: um tempo por letra, espalhado pelas palavras da fala ----
function typeChars(g) {
  cursor = 0;
  const toks = g.big.split(" ");
  const ws = toks.map((t) => find(t, g.from));
  const chars = [];
  toks.forEach((t, i) => {
    const t0 = ws[i].start, t1 = Math.min(ws[i].end, (ws[i + 1]?.start ?? ws[i].end));
    const step = Math.min(0.07, (t1 - t0) / t.length);
    [...t].forEach((ch, k) => chars.push({ ch, at: +(t0 + k * step).toFixed(3) }));
    if (i < toks.length - 1) chars.push({ ch: " ", at: +(t0 + t.length * step).toFixed(3) });
  });
  return chars;
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const capHtml = groups.map((g) => {
  const lead = g.lead.map((w, i) => `<span class="w" id="${g.id}-w${i}">${esc(w.text)}</span>`).join(" ");
  let big;
  if (g.style === "type") {
    g.chars = typeChars(g);
    big = g.chars.map((c, i) => `<span class="ch" id="${g.id}-c${i}">${c.ch === " " ? "&nbsp;" : esc(c.ch)}</span>`).join("");
    g.chars.filter((c, i) => c.ch !== " " && i % 2 === 0).forEach((c) => addSfx("tecla", c.at));
  } else big = esc(g.style === "caps" ? g.big.toUpperCase() : g.big);
  return `      <div class="grp" id="${g.id}">
        <div class="lead">${lead}</div>
        <div class="bigwrap ${g.bar ? "has-bar bar-" + g.bar : ""}" id="${g.id}-wrap">${g.bar ? `<div class="bar" id="${g.id}-bar"></div>` : ""}<div class="big s-${g.style}" id="${g.id}-big" data-text="${esc(g.big)}">${big}</div></div>
      </div>`;
}).join("\n");

sfx.sort((a, b) => a.at - b.at);
const laneEnd = [];
const sfxHtml = sfx.map((s, i) => {
  const d = Math.min(wavDur(`assets/sfx/${s.name}.wav`), DUR - s.at);
  let lane = laneEnd.findIndex((e) => e <= s.at);
  if (lane < 0) lane = laneEnd.push(0) - 1;
  laneEnd[lane] = s.at + d;
  return `    <audio id="sfx-${i}" src="assets/sfx/${s.name}.wav" data-start="${s.at}" data-duration="${d.toFixed(3)}" data-track-index="${11 + lane}" data-volume="${VOL[s.name]}"></audio>`;
}).join("\n");

const timing = groups.map(({ id, style, at, end, start, punch, shake, lead, chars, bar }) =>
  ({ id, style, at: +at.toFixed(3), end: +end.toFixed(3), start: +start.toFixed(3), punch, shake, bar: !!bar, lead: lead.map((w) => +w.at.toFixed(3)), chars: chars?.map((c) => c.at) }));

const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <!-- gerado por build/generate.mjs — edite o PLAN la, nao aqui -->
    <link rel="stylesheet" href="assets/fonts.css" />
    <script src="vendor/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1080px; height: 1920px; overflow: hidden; background: #000; }
      #root { position: relative; width: 1080px; height: 1920px; overflow: hidden; background: #000; }
      #cam { position: absolute; inset: 0; width: 1080px; height: 1920px; }
      #footage { position: absolute; inset: 0; width: 1080px; height: 1920px; object-fit: cover; }
      #caps { position: absolute; left: 0; top: 0; width: 1080px; height: 1920px; }
      .grp { position: absolute; left: 60px; top: 960px; width: 960px; display: flex; flex-direction: column; align-items: center; gap: 4px; color: #fff; text-align: center; opacity: 0; }
      .lead { font-family: Montserrat, sans-serif; font-weight: 500; font-size: 50px; line-height: 1.15; letter-spacing: -0.01em; max-width: 900px; min-height: 58px;
        text-shadow: 0 3px 14px rgba(0, 0, 0, 0.55), 0 1px 3px rgba(0, 0, 0, 0.45); }
      .w { display: inline-block; opacity: 0; }
      .bigwrap { position: relative; display: block; width: max-content; max-width: 960px; }
      .big { position: relative; display: block; opacity: 0; line-height: 0.95; white-space: nowrap;
        text-shadow: 0 8px 30px rgba(0, 0, 0, 0.5), 0 2px 6px rgba(0, 0, 0, 0.4); }
      .s-caps { font-family: Montserrat, sans-serif; font-weight: 900; letter-spacing: -0.03em; }
      .s-ital { font-family: Montserrat, sans-serif; font-weight: 900; font-style: italic; letter-spacing: -0.035em; }
      .s-serif, .s-type { font-family: "Playfair Display", serif; font-style: italic; font-weight: 400; letter-spacing: -0.01em; }
      .s-type { opacity: 1; }
      .ch { display: inline-block; opacity: 0; }
      .has-bar .big { padding: 0.06em 0.2em 0.02em; text-shadow: none; }
      .bar { position: absolute; left: 0; top: 0; width: 100%; height: 100%; border-radius: 6px; }
      .bar-sim .bar { background: #e8417a; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35); }
      .bar-nao .bar { background: #d7263d; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35); }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${DUR}" data-width="1080" data-height="1920">
      <div id="cam">
        <video id="footage" class="clip" src="assets/bruto-20s.mp4" data-start="0" data-duration="${DUR}" data-track-index="0" muted playsinline></video>
      </div>
      <div id="caps">
${capHtml}
      </div>
    </div>
    <audio id="voice" src="assets/bruto-20s.mp4" data-start="0" data-duration="${DUR}" data-track-index="10" data-volume="1"></audio>
${sfxHtml}
    <script>
      const G = ${JSON.stringify(timing)};
      const CUTS = ${JSON.stringify(CUTS)};
      const MAX = { caps: 230, ital: 175, serif: 165, type: 120 };
      const FIT = 940;
      function fontSpec(style, px) {
        if (style === "caps") return "900 " + px + "px Montserrat";
        if (style === "ital") return "italic 900 " + px + "px Montserrat";
        return "italic 400 " + px + "px 'Playfair Display'";
      }
      function build() {
        const ctx = document.createElement("canvas").getContext("2d");
        G.forEach((g) => {
          const el = document.getElementById(g.id + "-big");
          const text = g.style === "caps" ? el.dataset.text.toUpperCase() : el.dataset.text;
          ctx.font = fontSpec(g.style, 100);
          const pad = g.bar ? 0.4 : 0;
          const w = ctx.measureText(text).width / 100 + pad;
          el.style.fontSize = Math.floor(Math.min(MAX[g.style], FIT / w)) + "px";
        });

        const tl = gsap.timeline({ paused: true });
        const F = 1 / 30;
        G.forEach((g) => {
          const grp = "#" + g.id, big = grp + "-big";
          tl.set(grp, { opacity: 1 }, g.start - 0.01);
          // linha pequena: palavra a palavra, no tempo da fala
          g.lead.forEach((at, i) => {
            tl.set(grp + "-w" + i, { opacity: 1, y: 28 }, at);
            tl.to(grp + "-w" + i, { y: 0, duration: 0.14, ease: "power4.out" }, at);
          });
          // palavra-chave
          const t = g.at - 0.04;
          if (g.bar) {
            tl.fromTo(grp + "-bar", { scaleX: 0, transformOrigin: "0% 50%" }, { scaleX: 1, duration: 0.16, ease: "power4.out" }, t - 0.06);
          }
          if (g.style === "type") {
            g.chars.forEach((at, i) => {
              tl.set(grp + "-c" + i, { opacity: 1, y: 10 }, at);
              tl.to(grp + "-c" + i, { y: 0, duration: 0.1, ease: "power3.out" }, at);
            });
          } else if (g.style === "caps") {
            tl.set(big, { opacity: 1 }, t);
            tl.fromTo(big, { scale: 1.45, filter: "blur(12px)" }, { scale: 1, filter: "blur(0px)", duration: 0.2, ease: "expo.out" }, t);
          } else if (g.style === "ital") {
            tl.set(big, { opacity: 1 }, t);
            tl.fromTo(big, { scale: 0.6, y: 40, filter: "blur(14px)" }, { scale: 1, y: 0, filter: "blur(0px)", duration: 0.22, ease: "power4.out" }, t);
          } else {
            tl.fromTo(big, { opacity: 0, y: 24, filter: "blur(10px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.3, ease: "power3.out" }, t);
          }
          if (g.shake) {
            [10, -8, 6, -4, 0].forEach((x, i) => tl.to(grp + "-wrap", { x, duration: F, ease: "none" }, t + 0.2 + i * F));
          }
          // saida rapida
          if (g.end < ${DUR} - 0.05) {
            tl.to(grp, { opacity: 0, y: -26, filter: "blur(8px)", duration: 0.09, ease: "power2.in" }, g.end - 0.09);
          }
        });

        // camera: push lento + punch-in nas palavras de impacto + zoom no corte
        tl.fromTo("#cam", { scale: 1, transformOrigin: "50% 32%" }, { scale: 1.04, duration: CUTS[0], ease: "none" }, 0);
        let base = 1.04;
        G.filter((g) => g.punch && g.at < CUTS[0]).forEach((g) => {
          tl.to("#cam", { scale: base + g.punch, duration: 0.14, ease: "power4.out" }, g.at - 0.04);
          tl.to("#cam", { scale: base, duration: 0.6, ease: "power2.inOut" }, g.at + 0.5);
        });
        // corte 1: jump zoom
        tl.set("#cam", { scale: 1.16 }, CUTS[0]);
        tl.fromTo("#cam", { filter: "blur(10px)" }, { filter: "blur(0px)", duration: 0.12, ease: "power2.out", immediateRender: false }, CUTS[0]);
        tl.to("#cam", { scale: 1.1, duration: 0.5, ease: "power3.out" }, CUTS[0]);
        G.filter((g) => g.punch && g.at > CUTS[0] && g.at < CUTS[1]).forEach((g) => {
          tl.to("#cam", { scale: 1.1 + g.punch, duration: 0.14, ease: "power4.out" }, g.at - 0.04);
          tl.to("#cam", { scale: 1.1, duration: 0.6, ease: "power2.inOut" }, g.at + 0.6);
        });
        // corte 2: volta aberto, com blur rapido
        tl.set("#cam", { scale: 1.0 }, CUTS[1]);
        tl.fromTo("#cam", { filter: "blur(10px)" }, { filter: "blur(0px)", duration: 0.12, ease: "power2.out", immediateRender: false }, CUTS[1]);
        G.filter((g) => g.punch && g.at > CUTS[1]).forEach((g) => {
          tl.to("#cam", { scale: 1 + g.punch, duration: 0.14, ease: "power4.out" }, g.at - 0.04);
          tl.to("#cam", { scale: 1.02, duration: 0.8, ease: "power2.inOut" }, g.at + 0.6);
        });
        tl.to("#cam", { scale: 1.08, duration: ${DUR} - 17.4, ease: "none" }, 17.4);

        window.__timelines["main"] = tl;
        if (window.__hfForceTimelineRebind) window.__hfForceTimelineRebind();
      }
      Promise.all([
        document.fonts.load("900 100px Montserrat"),
        document.fonts.load("italic 900 100px Montserrat"),
        document.fonts.load("500 50px Montserrat"),
        document.fonts.load("italic 400 100px 'Playfair Display'"),
      ]).then(build);
    </script>
  </body>
</html>
`;
writeFileSync(ROOT + "index.html", html);
for (const g of groups) console.log(g.id, g.start.toFixed(2), "→", g.at.toFixed(2), "-", g.end.toFixed(2), g.style, JSON.stringify(g.big));
console.log(sfx.length, "sfx");
