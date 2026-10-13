// Gera index.html — versao 4: estilo da 2a referencia ("Como usar / Keyframe / para fazer")
// aplicado em quase toda frase, como pediu o cliente ("enfeitada, porem simples; mais
// palavras destacadas"). Cada frase: palavras pequenas (Montserrat) no tempo da fala +
// palavra-chave em caligrafia (Pinyon Script, marfim). Vermelho so num fio sob o "nao".
// Uso: node build/generate.mjs           (primeiros 19.5s, teste)
//      DUR=64.2 node build/generate.mjs  (video inteiro)
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const ROOT = new URL("..", import.meta.url).pathname;
const DUR = +(process.env.DUR || 19.5);
const words = JSON.parse(readFileSync(ROOT + "media/words.json", "utf8"));

// top: pequenas antes da caligrafia; script: caligrafia; bottom: pequenas depois.
// Os textos sao procurados na transcricao a partir de `from`, na ordem da fala.
const PLAN_ALL = [
  { from: 0.0, top: "hoje eu quero falar com", script: "você" },
  { from: 1.2, top: "que pensa em dizer", script: "não", accent: true },
  { from: 3.0, top: "mas na hora você diz", script: "sim" },
  { from: 5.0, top: "alguém te pede", script: "um favor" },
  { from: 6.3, top: "e você não queria", script: "fazer" },
  { from: 7.9, top: "só que você acaba dizendo", script: "sim" },
  { from: 9.3, top: "tá", script: "tudo bem", bottom: "eu faço" },
  { from: 10.5, top: "termina a", script: "ligação" },
  { from: 11.8, top: "morrendo de", script: "raiva" },
  { from: 13.0, top: "de quem pediu e de", script: "você mesmo" },
  { from: 14.5, top: "porque você sabe que você deveria ter dito", script: "não", accent: true },
  { from: 16.7, top: "mas quando chegou na hora, você", script: "não conseguiu" },
];
const PLAN = PLAN_ALL.filter((g) => g.from < DUR - 0.5);
const CUTS = [4.933, 14.6, 19.5, 25.533, 30.067, 40.633, 45.3, 55.1].filter((c) => c < DUR - 0.1);

const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
let cursor = 0;
function find(token, from) {
  for (let i = cursor; i < words.length; i++) {
    if (words[i].start < from - 0.01) continue;
    if (norm(words[i].text) === norm(token)) { cursor = i + 1; return words[i]; }
  }
  throw new Error(`palavra "${token}" nao encontrada depois de ${from}s`);
}
const timed = (text, from) => (text ? text.split(" ").map((t) => ({ text: t, at: find(t, from).start })) : []);

const groups = PLAN.map((g, gi) => {
  cursor = 0;
  const top = timed(g.top, g.from);
  const sw = timed(g.script, g.from);
  const bottom = timed(g.bottom, g.from);
  const at = sw[0].at;
  return { ...g, id: `g${gi}`, top, bottom, at, start: top.length ? top[0].at : at };
});
// caligrafia fica no ar pelo menos MIN_HOLD; se a proxima frase ja comecou, as
// primeiras palavras dela entram em cascata logo depois
const MIN_HOLD = 0.6;
groups.forEach((g, i) => {
  if (!i) return;
  const last = Math.max(groups[i - 1].at, ...groups[i - 1].bottom.map((w) => w.at));
  const earliest = +(last + MIN_HOLD).toFixed(3);
  if (g.start >= earliest) return;
  let k = 0;
  g.top.forEach((w) => { if (w.at < earliest) w.at = +(earliest + 0.05 * k++).toFixed(3); });
  g.start = earliest;
  if (g.at < earliest + 0.05 * k) g.at = +(earliest + 0.05 * k).toFixed(3);
});
groups.forEach((g, i) => (g.end = i + 1 < groups.length ? +(groups[i + 1].start - 0.03).toFixed(3) : DUR));

// ---- SFX: um sopro bem baixinho quando a caligrafia entra ----
const wavDur = (f) => +execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", ROOT + f]).toString();
const WH = wavDur("assets/sfx/whoosh.wav");
const sfxHtml = groups.map((g, i) => {
  const at = Math.max(0, +(g.at - 0.15).toFixed(3));
  return `    <audio id="sfx-${i}" src="assets/sfx/whoosh.wav" data-start="${at}" data-duration="${Math.min(WH, DUR - at).toFixed(3)}" data-track-index="${11 + (i % 2)}" data-volume="0.09"></audio>`;
}).join("\n");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const spans = (ws, id, part) => ws.map((w, i) => `<span class="w" id="${id}-${part}${i}">${esc(w.text)}</span>`).join(" ");
const lockHtml = groups.map((g) => `      <div class="lock" id="${g.id}">
        ${g.top.length ? `<div class="sm top" id="${g.id}-top">${spans(g.top, g.id, "t")}</div>` : ""}
        <div class="script" id="${g.id}-script">${esc(g.script)}</div>
        ${g.accent ? `<div class="fio" id="${g.id}-fio"></div>` : ""}
        ${g.bottom.length ? `<div class="sm bottom" id="${g.id}-bottom">${spans(g.bottom, g.id, "b")}</div>` : ""}
      </div>`).join("\n");

const timing = groups.map((g) => ({ id: g.id, start: g.start, at: g.at, end: g.end, accent: !!g.accent, len: g.script.length,
  top: g.top.map((w) => +w.at.toFixed(3)), bottom: g.bottom.map((w) => +w.at.toFixed(3)) }));

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
      #locks { position: absolute; left: 0; top: 0; width: 1080px; height: 1920px; }
      /* bloco centrado na altura da blusa (fundo escuro = leitura) */
      .lock { position: absolute; left: 90px; top: 1130px; width: 900px; display: flex; flex-direction: column; align-items: center;
        transform: translateY(-50%); opacity: 0; }
      .script { display: block; text-align: center; white-space: nowrap; font-family: "Pinyon Script", cursive; font-size: 220px; line-height: 1.05;
        color: #f6efe4; padding: 0 0.12em; text-shadow: 0 0 2px rgba(0, 0, 0, 0.45), 0 4px 22px rgba(0, 0, 0, 0.55); }
      .sm { display: block; max-width: 860px; font-family: Montserrat, sans-serif; font-weight: 600; font-size: 44px; line-height: 1.2; color: #fff;
        text-shadow: 0 0 2px rgba(0, 0, 0, 0.6), 0 2px 5px rgba(0, 0, 0, 0.45), 0 4px 18px rgba(0, 0, 0, 0.5); position: relative; z-index: 1; }
      .top { margin-bottom: -38px; text-align: center; }
      .bottom { margin-top: -34px; text-align: center; }
      .w { display: inline-block; opacity: 0; }
      .fio { display: block; height: 4px; border-radius: 2px; background: #c8102e; margin-top: -6px; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${DUR}" data-width="1080" data-height="1920">
      <div id="cam">
        <video id="footage" class="clip" src="assets/bruto.mp4" data-start="0" data-duration="${DUR}" data-track-index="0" muted playsinline></video>
      </div>
      <div id="locks">
${lockHtml}
      </div>
    </div>
    <audio id="voice" src="assets/bruto.mp4" data-start="0" data-duration="${DUR}" data-track-index="10" data-volume="1"></audio>
${sfxHtml}
    <script>
      const G = ${JSON.stringify(timing)};
      const CUTS = ${JSON.stringify(CUTS)};
      function build() {
        // encaixe estilo "Como usar / Keyframe / para fazer": pequenas curtas encostam na
        // borda direita (em cima) / esquerda (embaixo) da caligrafia; frase longa fica centrada
        const ctx = document.createElement("canvas").getContext("2d");
        G.forEach((g, i) => {
          const el = document.getElementById(g.id + "-script");
          ctx.font = "220px 'Pinyon Script'";
          let w = ctx.measureText(el.textContent).width, fs = 220;
          if (w > 820) { fs = Math.floor(220 * 820 / w); w = 820; el.style.fontSize = fs + "px"; }
          w = Math.max(w, 260);
          // pequenas centradas em cima; a de baixo levemente deslocada para a direita
          const bot = document.getElementById(g.id + "-bottom");
          if (bot) bot.style.marginLeft = Math.round(w * 0.25) + "px";
          const fio = document.getElementById(g.id + "-fio");
          if (fio) fio.style.width = Math.round(w * 0.55) + "px";
        });

        const tl = gsap.timeline({ paused: true });
        G.forEach((g) => {
          // escrita rapida o bastante para terminar com folga antes da saida
          const id = "#" + g.id, d = Math.max(0.25, Math.min(0.5, 0.2 + g.len * 0.03, g.end - g.at - 0.25));
          tl.set(id, { opacity: 1 }, g.start - 0.01);
          g.top.forEach((at, i) => tl.fromTo(id + "-t" + i, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.18, ease: "power2.out" }, at));
          // caligrafia "escrita" da esquerda para a direita
          tl.fromTo(id + "-script", { clipPath: "inset(-20% 100% -20% 0%)", opacity: 0.3 }, { clipPath: "inset(-20% 0% -20% 0%)", opacity: 1, duration: d, ease: "power1.inOut" }, g.at - 0.05);
          g.bottom.forEach((at, i) => tl.fromTo(id + "-b" + i, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.18, ease: "power2.out" }, at));
          if (g.accent) tl.fromTo(id + "-fio", { scaleX: 0, transformOrigin: "0% 50%" }, { scaleX: 1, duration: 0.45, ease: "power2.inOut" }, g.at + d * 0.6);
          if (g.end < ${DUR} - 0.05) tl.to(id, { opacity: 0, duration: 0.16, ease: "power1.in" }, g.end - 0.16);
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
        document.fonts.load("600 44px Montserrat"),
        document.fonts.load("220px 'Pinyon Script'"),
      ]).then(build);
    </script>
  </body>
</html>
`;
writeFileSync(ROOT + "index.html", html);
groups.forEach((g) => console.log(g.id, g.start.toFixed(2), "→", g.at.toFixed(2), "-", g.end.toFixed(2), g.top.map((w) => w.text).join(" "), "|", g.script, "|", g.bottom.map((w) => w.text).join(" ")));
