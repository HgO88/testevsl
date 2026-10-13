// (versao 3 — substituida pela v4 em build/generate.mjs; guardada para comparacao. Uso: node build/generate-v3.mjs)
// Gera index.html — versao 3, no estilo da 2a referencia do cliente (Reel "Keyframe"):
// legenda corrida pequena (2-3 palavras por vez, Montserrat) e poucos "lockups":
// palavra grande em caligrafia (Pinyon Script) com palavras pequenas encaixadas.
// Paleta branco/marfim + preto; vermelho so num fio sob o ultimo destaque.
// Uso: node build/generate.mjs           (primeiros 19.5s, teste)
//      DUR=64.2 node build/generate.mjs  (video inteiro)
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname;
const DUR = +(process.env.DUR || 19.5);
const words = JSON.parse(readFileSync(ROOT + "media/words.json", "utf8"));

// Destaques ("lockups"). Durante a janela [t0, t1] a legenda corrida some.
// top: palavras pequenas acima (alinhadas a direita), script: caligrafia, bottom: pequenas abaixo (a esquerda)
const LOCKUPS_ALL = [
  { t0: 0.0, t1: 3.05, top: "para você que", script: "diz sim", bottom: "quando quer dizer não" },
  { t0: 11.88, t1: 13.0, top: "morrendo de", script: "raiva" },
  { t0: 18.28, t1: 19.5, top: "você", script: "não conseguiu", accent: true },
];
const LOCKUPS = LOCKUPS_ALL.filter((l) => l.t0 < DUR - 0.3).map((l) => ({ ...l, t1: Math.min(l.t1, DUR) }));
const CUTS = [4.933, 14.6, 19.5, 25.533, 30.067, 40.633, 45.3, 55.1].filter((c) => c < DUR - 0.1);

// palavras que a transcricao errou e que ficam de fora da legenda (inicio em s)
const SKIP = new Set([11.76]); // "você te morrendo" — o "te" e erro do reconhecimento de fala

// ---- legenda corrida: blocos de ate 3 palavras / 16 letras, quebrando em pontuacao e pausa ----
const inLockup = (t) => LOCKUPS.some((l) => t >= l.t0 - 0.05 && t < l.t1);
const chunks = [];
let cur = null;
for (const w of words) {
  if (w.start >= DUR - 0.2) break;
  if (inLockup(w.start)) { cur = null; continue; }
  if (SKIP.has(+w.start.toFixed(2))) continue;
  const text = w.text.replace(/[.,!?;:]+$/, "").toLowerCase();
  const gap = cur ? w.start - cur.lastEnd : 0;
  const len = cur ? cur.text.length + 1 + text.length : 0;
  if (!cur || cur.n >= 3 || len > 16 || cur.hardBreak || gap > 0.3) {
    cur = { text, start: w.start, lastEnd: w.end, n: 1 };
    chunks.push(cur);
  } else {
    cur.text += " " + text; cur.lastEnd = w.end; cur.n++;
  }
  cur.hardBreak = /[.,!?;:]$/.test(w.text);
}
chunks.forEach((c, i) => {
  const next = chunks[i + 1]?.start ?? DUR;
  const lock = LOCKUPS.find((l) => l.t0 > c.start)?.t0 ?? DUR;
  c.end = +Math.min(next - 0.02, c.lastEnd + 0.6, lock - 0.05, DUR).toFixed(3);
  c.start = +c.start.toFixed(3);
});

// ---- SFX: so um sopro bem baixo em cada destaque ----
const wavDur = (f) => +execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", ROOT + f]).toString();
const sfx = LOCKUPS.map((l) => ({ name: "whoosh", at: Math.max(0, +(l.t0 - 0.1).toFixed(3)), vol: 0.12 }));

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const capHtml = chunks.map((c, i) => `        <div class="cap" id="c${i}">${esc(c.text)}</div>`).join("\n");
const lockHtml = LOCKUPS.map((l, i) => `      <div class="lock" id="L${i}">
        ${l.top ? `<div class="sm sm-top" id="L${i}-top">${esc(l.top)}</div>` : ""}
        <div class="script" id="L${i}-script">${esc(l.script)}</div>
        ${l.accent ? `<div class="fio" id="L${i}-fio"></div>` : ""}
        ${l.bottom ? `<div class="sm sm-bottom" id="L${i}-bottom">${esc(l.bottom)}</div>` : ""}
      </div>`).join("\n");
const sfxHtml = sfx.map((s, i) => `    <audio id="sfx-${i}" src="assets/sfx/${s.name}.wav" data-start="${s.at}" data-duration="${Math.min(wavDur(`assets/sfx/${s.name}.wav`), DUR - s.at).toFixed(3)}" data-track-index="${11 + (i % 2)}" data-volume="${s.vol}"></audio>`).join("\n");

const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1080, height=1920" />
    <!-- gerado por build/generate.mjs — edite LOCKUPS / regras la, nao aqui -->
    <link rel="stylesheet" href="assets/fonts.css" />
    <script src="vendor/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1080px; height: 1920px; overflow: hidden; background: #000; }
      #root { position: relative; width: 1080px; height: 1920px; overflow: hidden; background: #000; }
      #cam { position: absolute; inset: 0; width: 1080px; height: 1920px; }
      #footage { position: absolute; inset: 0; width: 1080px; height: 1920px; object-fit: cover; }
      #caps, #locks { position: absolute; left: 0; top: 0; width: 1080px; height: 1920px; }
      .cap { position: absolute; left: 90px; top: 1075px; width: 900px; text-align: center; opacity: 0;
        font-family: Montserrat, sans-serif; font-weight: 600; font-size: 46px; line-height: 1.2; color: #fff; letter-spacing: 0.005em;
        text-shadow: 0 0 2px rgba(0, 0, 0, 0.6), 0 2px 5px rgba(0, 0, 0, 0.45), 0 4px 18px rgba(0, 0, 0, 0.5); }
      .lock { position: absolute; left: 90px; top: 930px; width: 900px; height: 360px; opacity: 0; }
      .script { position: absolute; left: 0; top: 70px; width: 900px; text-align: center; white-space: nowrap;
        font-family: "Pinyon Script", cursive; font-size: 230px; line-height: 1.1; color: #f6efe4;
        text-shadow: 0 0 2px rgba(0, 0, 0, 0.45), 0 4px 22px rgba(0, 0, 0, 0.55); }
      .sm { position: absolute; font-family: Montserrat, sans-serif; font-weight: 600; font-size: 44px; color: #fff; white-space: nowrap;
        text-shadow: 0 0 2px rgba(0, 0, 0, 0.6), 0 2px 5px rgba(0, 0, 0, 0.45), 0 4px 18px rgba(0, 0, 0, 0.5); }
      .sm-top { right: 90px; top: 55px; }
      .sm-bottom { left: 70px; top: 270px; }
      .fio { position: absolute; left: 250px; top: 335px; width: 400px; height: 4px; border-radius: 2px; background: #c8102e; }
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
      <div id="locks">
${lockHtml}
      </div>
    </div>
    <audio id="voice" src="assets/bruto.mp4" data-start="0" data-duration="${DUR}" data-track-index="10" data-volume="1"></audio>
${sfxHtml}
    <script>
      const C = ${JSON.stringify(chunks.map(({ start, end }) => ({ start, end })))};
      const L = ${JSON.stringify(LOCKUPS.map(({ t0, t1, top, bottom, accent, script }) => ({ t0, t1, top: !!top, bottom: !!bottom, accent: !!accent, len: script.length })))};
      const CUTS = ${JSON.stringify(CUTS)};
      function build() {
        // caligrafia longa encolhe para caber; as palavras pequenas e o fio vermelho
        // se encaixam nas bordas da palavra (como "Como usar / Keyframe / para fazer")
        const ctx = document.createElement("canvas").getContext("2d");
        ctx.font = "230px 'Pinyon Script'";
        L.forEach((l, i) => {
          const el = document.getElementById("L" + i + "-script");
          let w = ctx.measureText(el.textContent).width, fs = 230;
          if (w > 840) { fs = Math.floor(230 * 840 / w); w = 840; el.style.fontSize = fs + "px"; }
          const left = 450 - w / 2, right = 450 + w / 2;
          const top = document.getElementById("L" + i + "-top");
          if (top) top.style.right = Math.max(10, 900 - right + 0.04 * w) + "px";
          const bot = document.getElementById("L" + i + "-bottom");
          if (bot) bot.style.left = Math.max(10, left + 0.06 * w) + "px";
          const fio = document.getElementById("L" + i + "-fio");
          if (fio) { fio.style.left = (450 - w * 0.3) + "px"; fio.style.width = (w * 0.6) + "px"; }
        });

        const tl = gsap.timeline({ paused: true });
        // legenda corrida: aparece suave, some rapido
        C.forEach((c, i) => {
          tl.fromTo("#c" + i, { opacity: 0, y: 8, filter: "blur(4px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.18, ease: "power2.out" }, c.start);
          tl.to("#c" + i, { opacity: 0, duration: 0.1, ease: "power1.in" }, Math.max(c.start + 0.2, c.end - 0.1));
        });
        // destaques: caligrafia "escrita" da esquerda para a direita, palavras pequenas encaixam depois
        L.forEach((l, i) => {
          const id = "#L" + i, d = Math.min(0.9, 0.25 + l.len * 0.06);
          tl.set(id, { opacity: 1 }, l.t0);
          tl.fromTo(id + "-script", { clipPath: "inset(0% 100% 0% 0%)", opacity: 0.2 }, { clipPath: "inset(0% 0% 0% 0%)", opacity: 1, duration: d, ease: "power1.inOut" }, l.t0);
          if (l.top) tl.fromTo(id + "-top", { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" }, l.t0 + 0.15);
          if (l.bottom) tl.fromTo(id + "-bottom", { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3, ease: "power2.out" }, l.t0 + d * 0.7);
          if (l.accent) tl.fromTo(id + "-fio", { scaleX: 0, transformOrigin: "0% 50%" }, { scaleX: 1, duration: 0.5, ease: "power2.inOut" }, l.t0 + d * 0.8);
          if (l.t1 < ${DUR} - 0.05) tl.to(id, { opacity: 0, duration: 0.22, ease: "power1.in" }, l.t1 - 0.22);
        });
        // camera: aproximacao lenta e discreta em cada trecho entre cortes
        [0].concat(CUTS).forEach((s0, i, seg) => {
          const s1 = i + 1 < seg.length ? seg[i + 1] : ${DUR};
          tl.fromTo("#cam", { scale: 1, transformOrigin: "50% 32%" }, { scale: 1.03, duration: s1 - s0, ease: "none", immediateRender: i === 0 }, s0);
        });
        window.__timelines["main"] = tl;
        if (window.__hfForceTimelineRebind) window.__hfForceTimelineRebind();
      }
      Promise.all([
        document.fonts.load("600 46px Montserrat"),
        document.fonts.load("230px 'Pinyon Script'"),
      ]).then(build);
    </script>
  </body>
</html>
`;
writeFileSync(ROOT + "index.html", html);
chunks.forEach((c) => console.log(c.start.toFixed(2), "-", c.end.toFixed(2), c.text));
LOCKUPS.forEach((l) => console.log("LOCKUP", l.t0, "-", l.t1, l.top || "", "|", l.script, "|", l.bottom || ""));
