// Gera index.html: legenda no estilo do Reel de referencia, versao elegante pedida
// pelo cliente (branco/vermelho/preto, Montserrat + Cormorant, SFX discretos).
// Uso: node build/generate.mjs          (primeiros 19.5s, teste)
//      DUR=64.2 node build/generate.mjs (video inteiro)
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname;
const DUR = +(process.env.DUR || 19.5);
const words = JSON.parse(readFileSync(ROOT + "media/words.json", "utf8"));

// Cada grupo: linha pequena (lead) + palavra-chave grande (big).
// lead/big sao procurados na transcricao a partir de `from`, na ordem.
// style: caps | ital | serif | type (letra a letra) ; bar: "nao" sublinha a palavra em vermelho
// (punch/shake/sim ficaram do estilo anterior e hoje sao ignorados)
const PLAN_ALL = [
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
  { from: 19.4, lead: "e isso não é sinal de que você é uma pessoa", big: "fraca", style: "ital", sfx: "swish" },
  { from: 21.6, lead: "simplesmente é um sinal de que você ainda está", big: "condicionada", style: "serif", sfx: "glitter" },
  { from: 25.3, lead: "porque você aprendeu que dizer", big: "não", style: "caps", bar: "nao", sfx: "impacto", punch: 0.07 },
  { from: 27.2, lead: "gerava", big: "consequências", style: "ital", sfx: "whoosh-curto" },
  { from: 28.6, lead: "", big: "conflitos", style: "ital", sfx: "whoosh-curto" },
  { from: 29.2, lead: "e", big: "rejeição", style: "caps", sfx: "impacto", punch: 0.08, shake: true },
  { from: 30.0, lead: "pra evitar isso, você foi se tornando", big: "a mulher", style: "serif", sfx: "glitter" },
  { from: 32.4, lead: "que diz", big: "sim", style: "caps", bar: "sim", sfx: "ding" },
  { from: 33.1, lead: "pra tudo e", big: "pra todos", style: "ital", sfx: "swish" },
  { from: 34.4, lead: "pra você não perder o", big: "amor", style: "serif", sfx: "glitter" },
  { from: 36.0, lead: "mesmo que isso", big: "custe", style: "ital", sfx: "whoosh-curto" },
  { from: 37.6, lead: "a sua", big: "paz", style: "caps", sfx: "impacto", punch: 0.07 },
  { from: 38.5, lead: "e qualquer outra coisa que é", big: "importante", style: "ital", sfx: "swish" },
  { from: 40.5, lead: "é por isso que eu não trabalho apenas a", big: "comunicação", style: "ital", sfx: "whoosh" },
  { from: 43.4, lead: "eu trabalho a", big: "identidade", style: "caps", sfx: "impacto", punch: 0.08 },
  { from: 45.3, lead: "porque os limites começam numa identidade", big: "bem ancorada", style: "serif", sfx: "glitter" },
  { from: 49.0, lead: "a mulher que sabe", big: "quem ela é", style: "ital", sfx: "swish" },
  { from: 50.8, lead: "e entende que dizer", big: "não", style: "caps", bar: "nao", sfx: "impacto", punch: 0.06 },
  { from: 52.7, lead: "para o outro é dizer", big: "sim", style: "caps", bar: "sim", sfx: "ding", punch: 0.06 },
  { from: 54.2, lead: "para", big: "ela mesma.", style: "type" },
  { from: 55.0, lead: "se essa conversa falou com você de alguma forma,", big: "comenta", style: "ital", sfx: "whoosh" },
  { from: 57.3, lead: "a palavra", big: "dama", style: "caps", bar: "sim", sfx: "impacto", punch: 0.1, shake: true },
  { from: 58.1, lead: "que eu quero te mostrar qual", big: "padrão emocional", style: "serif", sfx: "glitter" },
  { from: 60.3, lead: "está por trás dessa sua", big: "dificuldade", style: "ital", sfx: "swish" },
  { from: 62.4, lead: "de se colocar em", big: "primeiro lugar.", style: "ital", sfx: "whoosh", punch: 0.06 },
];
const PLAN = PLAN_ALL.filter((g) => g.from < DUR - 0.5);
// cortes de cena do bruto (ffmpeg scene > 0.25)
const CUTS = [4.933, 14.6, 19.5, 25.533, 30.067, 40.633, 45.3, 55.1].filter((c) => c < DUR - 0.1);

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
// palavra-chave fica no ar pelo menos MIN_HOLD; se a proxima fala ja comecou,
// as primeiras palavras dela entram juntas logo depois (em cascata curta)
const MIN_HOLD = 0.55;
groups.forEach((g, i) => {
  if (i === 0) return;
  const p = groups[i - 1];
  const earliest = +(p.at + MIN_HOLD).toFixed(3);
  if (g.start < earliest) {
    g.start = earliest;
    let k = 0;
    g.lead.forEach((w) => { if (w.at < earliest) w.at = +(earliest + 0.04 * k++).toFixed(3); });
    if (g.at < earliest + 0.04 * k) g.at = +(earliest + 0.04 * k).toFixed(3);
  }
});
groups.forEach((g, i) => (g.end = i + 1 < groups.length ? groups[i + 1].start - 0.03 : DUR));

// ---- SFX ----
const wavDur = (f) => +execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", ROOT + f]).toString();
// so dois sons, baixos: um sopro suave em cada destaque e um grave curto no NAO.
// (sem "ding", pop, tecla ou obturador — o cliente achou alto/extravagante)
const VOL = { whoosh: 0.14, impacto: 0.16 };
const sfx = [];
const addSfx = (name, at) => sfx.push({ name, at: Math.max(0, +at.toFixed(3)) });
for (const g of groups) {
  if (g.style === "type") continue;
  if (g.bar === "nao") addSfx("impacto", g.at - 0.02);
  else addSfx("whoosh", g.at - 0.2);
}

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
  } else big = esc(g.style === "caps" ? g.big.toUpperCase() : g.big);
  return `      <div class="grp" id="${g.id}">
        <div class="lead">${lead}</div>
        <div class="bigwrap" id="${g.id}-wrap"><div class="big s-${g.style}" id="${g.id}-big" data-text="${esc(g.big)}">${big}</div>${g.bar === "nao" ? `<div class="uline" id="${g.id}-uline"></div>` : ""}</div>
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
  ({ id, style, at: +at.toFixed(3), end: +end.toFixed(3), start: +start.toFixed(3), punch, shake, bar: bar === "nao", lead: lead.map((w) => +w.at.toFixed(3)), chars: chars?.map((c) => c.at) }));

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
        text-shadow: 0 0 2px rgba(0, 0, 0, 0.7), 0 2px 4px rgba(0, 0, 0, 0.55), 0 4px 18px rgba(0, 0, 0, 0.6); }
      .w { display: inline-block; opacity: 0; }
      .bigwrap { position: relative; display: block; width: max-content; max-width: 960px; }
      .big { position: relative; display: block; opacity: 0; line-height: 1; white-space: nowrap; font-family: "Cormorant Garamond", serif; color: #fff;
        text-shadow: 0 0 2px rgba(0, 0, 0, 0.55), 0 4px 22px rgba(0, 0, 0, 0.55); }
      .s-caps { font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; }
      .s-ital, .s-serif, .s-type { font-style: italic; font-weight: 500; letter-spacing: -0.005em; }
      .s-type { opacity: 1; }
      .ch { display: inline-block; opacity: 0; }
      .uline { position: absolute; left: 6%; bottom: -6px; width: 88%; height: 6px; border-radius: 3px; background: #c8102e; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4); }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${DUR}" data-width="1080" data-height="1920">
      <div id="cam">
        <video id="footage" class="clip" src="assets/bruto.mp4" data-start="0" data-duration="${DUR}" data-track-index="0" muted playsinline></video>
      </div>
      <div id="caps">
${capHtml}
      </div>
    </div>
    <audio id="voice" src="assets/bruto.mp4" data-start="0" data-duration="${DUR}" data-track-index="10" data-volume="1"></audio>
${sfxHtml}
    <script>
      const G = ${JSON.stringify(timing)};
      const CUTS = ${JSON.stringify(CUTS)};
      const MAX = { caps: 150, ital: 170, serif: 170, type: 105 };
      const FIT = 940;
      function fontSpec(style, px) {
        if (style === "caps") return "600 " + px + "px 'Cormorant Garamond'";
        return "italic 500 " + px + "px 'Cormorant Garamond'";
      }
      function build() {
        const ctx = document.createElement("canvas").getContext("2d");
        G.forEach((g) => {
          const el = document.getElementById(g.id + "-big");
          const text = g.style === "caps" ? el.dataset.text.toUpperCase() : el.dataset.text;
          ctx.font = fontSpec(g.style, 100);
          const spacing = g.style === "caps" ? 0.06 * text.length : 0;
          const w = ctx.measureText(text).width / 100 + spacing;
          el.style.fontSize = Math.floor(Math.min(MAX[g.style], FIT / w)) + "px";
        });

        const tl = gsap.timeline({ paused: true });
        const F = 1 / 30;
        G.forEach((g) => {
          const grp = "#" + g.id, big = grp + "-big";
          tl.set(grp, { opacity: 1 }, g.start - 0.01);
          // linha pequena: palavra a palavra, no tempo da fala (fade curto, sobe pouco)
          g.lead.forEach((at, i) => {
            tl.fromTo(grp + "-w" + i, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.18, ease: "power2.out" }, at);
          });
          // palavra-chave: entra suave, com leve desfoque que se resolve
          const t = g.at - 0.06;
          if (g.style === "type") {
            g.chars.forEach((at, i) => {
              tl.fromTo(grp + "-c" + i, { opacity: 0 }, { opacity: 1, duration: 0.12, ease: "none" }, at);
            });
          } else {
            tl.fromTo(big, { opacity: 0, y: 16, filter: "blur(6px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.38, ease: "power2.out" }, t);
          }
          if (g.bar) {
            tl.fromTo(grp + "-uline", { scaleX: 0, transformOrigin: "0% 50%" }, { scaleX: 1, duration: 0.4, ease: "power2.inOut" }, t + 0.2);
          }
          // saida: fade curto
          if (g.end < ${DUR} - 0.05) {
            tl.to(grp, { opacity: 0, duration: 0.14, ease: "power1.in" }, g.end - 0.14);
          }
        });

        // camera: so uma aproximacao lenta e discreta em cada trecho entre cortes
        const SEG = [0].concat(CUTS);
        SEG.forEach((s0, i) => {
          const s1 = i + 1 < SEG.length ? SEG[i + 1] : ${DUR};
          if (i === 0) tl.fromTo("#cam", { scale: 1, transformOrigin: "50% 32%" }, { scale: 1.03, duration: s1 - s0, ease: "none" }, s0);
          else tl.fromTo("#cam", { scale: 1 }, { scale: 1.03, duration: s1 - s0, ease: "none", immediateRender: false }, s0);
        });
        window.__timelines["main"] = tl;
        if (window.__hfForceTimelineRebind) window.__hfForceTimelineRebind();
      }
      Promise.all([
        document.fonts.load("500 50px Montserrat"),
        document.fonts.load("600 100px 'Cormorant Garamond'"),
        document.fonts.load("italic 500 100px 'Cormorant Garamond'"),
      ]).then(build);
    </script>
  </body>
</html>
`;
writeFileSync(ROOT + "index.html", html);
for (const g of groups) console.log(g.id, g.start.toFixed(2), "→", g.at.toFixed(2), "-", g.end.toFixed(2), g.style, JSON.stringify(g.big));
console.log(sfx.length, "sfx");
