#!/usr/bin/env node
// Confere o srcAt de cada cartela de texto contra onde a frase é REALMENTE
// dita, e imprime a correção sugerida.
//
// Por que existe: a transcrição é por parágrafo, não por palavra — alguns
// segmentos têm 80 segundos. Os srcAt foram estimados no olho a partir do
// início do segmento, então uma frase que cai no FIM de um parágrafo longo
// fica ancorada segundos cedo e a cartela entra antes da fala. Foi o que o
// cliente pegou em "Preciso Me Preparar Melhor" (srcAt 110, dita perto de
// 115) vendo o bloco 1.
//
// MÉTODO. Acha a frase da cartela dentro do parágrafo (normalizado, sem
// acento nem pontuação, pontuando por palavra em comum porque paráfrase é
// regra — "Preciso Me Preparar Melhor" vem de "percebo que preciso me
// preparar melhor"). Depois converte posição-em-caracteres para tempo
// distribuindo os caracteres sobre o tempo de FALA do parágrafo, não sobre o
// tempo de relógio: um parágrafo de 80s pode ter 15s de pausa, e interpolar
// linearmente sobre os 80 joga toda frase depois da primeira pausa para
// depois de onde ela é dita. As pausas vêm do mesmo silencedetect que
// alimenta o cutlist.
//
// LIMITES — leia antes de aplicar em massa:
//   - a distribuição assume ritmo de fala constante dentro do parágrafo, então
//     o resultado tem uns ±3s de erro. Serve para consertar quem está 10s
//     fora, não para afinar quem já está a 2s.
//   - linha de uma palavra só ("Serviço", "Dependência") não dá para localizar:
//     a palavra aparece em vários lugares. Essas saem como BAIXA CONFIANÇA e
//     ficam como estão.
//   - sugestão a mais de MAX_DELTA do srcAt original quase sempre é match
//     errado, não âncora errada. Também sai como BAIXA CONFIANÇA.
//
// Uso: node build/check-anchors.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(__dirname, "..");
const SILENCE_LOG = "/tmp/claude-0/-home-user-testevsl/61efbf79-bd66-5435-8ea3-4d74349a64b3/scratchpad/silencedetect_full.log";

const NEAR = 90; // só procura em parágrafos que encostam no srcAt original
const MAX_DELTA = 35; // acima disso é match errado, não âncora errada
const MIN_SCORE = 0.6;
const MIN_WORDS = 2; // palavras significativas na linha
// 1.2s e nao 2.5s: com CARD_LEAD a cartela cai EXATAMENTE em cima da fala,
// entao 1.7s de erro de ancora ja aparece — foi esse o tamanho do desvio em
// "Preciso Me Preparar Melhor", que o cliente pegou de primeira. E adiantada
// incomoda mais que atrasada: a cartela cita o que ele ESTA dizendo, e ler
// antes de ouvir estraga a frase.
const REPORT = 0.8;

const norm = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

const tr = JSON.parse(fs.readFileSync(path.join(PROJECT, "media", "transcript.json"), "utf8"));
const segs = (tr.segments ?? tr).map((s) => ({ start: s.start, end: s.end, norm: norm(s.text) }));

const log = fs.readFileSync(SILENCE_LOG, "utf8");
const sStart = [...log.matchAll(/silence_start:\s*([\d.]+)/g)].map((m) => parseFloat(m[1]));
const sEnd = [...log.matchAll(/silence_end:\s*([\d.]+)\s*\|/g)].map((m) => parseFloat(m[1]));
const silences = sEnd.map((e, i) => ({ start: sStart[i], end: e }));
const speechStarts = sEnd.slice(0, sStart.length); // fim de pausa = próxima frase começa

// Os intervalos de FALA dentro de [a,b] — o parágrafo menos suas pausas.
function speechIn(a, b) {
  const out = [];
  let cur = a;
  for (const s of silences) {
    if (s.end <= a || s.start >= b) continue;
    if (s.start > cur) out.push([cur, s.start]);
    cur = Math.max(cur, s.end);
  }
  if (cur < b) out.push([cur, b]);
  return out;
}

// Tempo em que a fala do parágrafo já percorreu a fração `frac` do seu texto.
function atSpeechFraction(seg, frac) {
  const sp = speechIn(seg.start, seg.end);
  const total = sp.reduce((n, [a, b]) => n + (b - a), 0);
  if (!total) return seg.start + frac * (seg.end - seg.start);
  let want = frac * total;
  for (const [a, b] of sp) {
    const d = b - a;
    if (want <= d) return a + want;
    want -= d;
  }
  return sp[sp.length - 1][1];
}

function locate(line, srcAt) {
  const words = norm(line).split(" ").filter((w) => w.length > 3);
  if (words.length < MIN_WORDS) return { few: true, words: words.length };
  let best = null;
  for (const seg of segs) {
    if (seg.end < srcAt - NEAR || seg.start > srcAt + NEAR) continue;
    const hay = seg.norm.split(" ");
    const win = Math.max(words.length, 6);
    for (let i = 0; i < hay.length; i++) {
      const slice = hay.slice(i, i + win);
      const score = words.filter((w) => slice.includes(w)).length / words.length;
      if (!best || score > best.score) {
        // A janela tem 6 palavras e pode COMECAR ate 5 palavras antes da frase.
        // Usar `i` como posicao dava um vies sistematico de ~1.5s para tras --
        // foi por isso que "Preciso Me Preparar Melhor" (1.7s cedo de verdade)
        // saiu como "dentro do limite". A posicao boa e a da primeira palavra
        // significativa que de fato casou.
        const off = slice.findIndex((w) => words.includes(w));
        const at0 = i + (off < 0 ? 0 : off);
        const frac = seg.norm.length ? hay.slice(0, at0).join(" ").length / seg.norm.length : 0;
        best = { score, at: atSpeechFraction(seg, frac) };
      }
    }
  }
  return best;
}

// Encosta na pausa mais próxima, para o srcAt cair no começo de uma frase e
// não no meio dela. Longe de qualquer pausa, mantém a estimativa.
function snap(t) {
  let best = t, d = Infinity;
  for (const s of speechStarts) {
    const dd = Math.abs(s - t);
    if (dd < d) { d = dd; best = s; }
  }
  return d <= 2.0 ? best : t;
}

const src = fs.readFileSync(path.join(__dirname, "generate.mjs"), "utf8");

// Os trechos que sairam do filme. Uma sugestao que cai aqui dentro nao serve:
// a cartela nao teria fala para acompanhar e reapareceria colada na emenda.
const DROPS = [...src.matchAll(/^\s*\[([\d.]+), ([\d.]+|SOURCE_DURATION)\],\s*$/gm)]
  .map((m) => [parseFloat(m[1]), m[2] === "SOURCE_DURATION" ? 1e9 : parseFloat(m[2])])
  .filter(([a, b]) => b > a && a > 100);
const inDrop = (t) => DROPS.some(([a, b]) => t >= a && t < b);
const beats = [];
for (const m of src.matchAll(/\{ id: "([^"]+)", kind: "caption", srcAt: ([\d.]+),[^}]*line: "([^"]+)"/g)) {
  beats.push({ id: m[1], srcAt: parseFloat(m[2]), line: m[3], kind: "beat" });
}
for (const m of src.matchAll(/^\s*\[(\d+), "([^"]+)"\],\s*$/gm)) {
  if (m[2].includes(" ")) beats.push({ id: `txt@${m[1]}`, srcAt: parseFloat(m[1]), line: m[2], kind: "txt" });
}

const fix = [], low = [];
for (const b of beats) {
  const hit = locate(b.line, b.srcAt);
  if (!hit || hit.few) { low.push({ ...b, why: `linha de ${hit?.words ?? 0} palavra(s) — não dá para localizar` }); continue; }
  if (hit.score < MIN_SCORE) { low.push({ ...b, why: `score ${hit.score.toFixed(2)}` }); continue; }
  const at = snap(hit.at);
  const delta = at - b.srcAt;
  if (Math.abs(delta) > MAX_DELTA) { low.push({ ...b, why: `sugeriu ${at.toFixed(1)} (${delta.toFixed(0)}s) — match errado` }); continue; }
  if (inDrop(at)) { low.push({ ...b, why: `sugeriu ${at.toFixed(1)}, que caiu num DROP_RANGE` }); continue; }
  if (Math.abs(delta) > REPORT) fix.push({ ...b, sugerido: at, delta });
}

console.log(`${beats.length} cartelas conferidas\n`);
console.log(`CORRIGIR (${fix.length}):`);
for (const b of fix.sort((a, c) => a.srcAt - c.srcAt)) {
  console.log(`  ${b.id.padEnd(20)} ${String(b.srcAt).padStart(7)} -> ${b.sugerido.toFixed(2).padStart(7)}  (${b.delta >= 0 ? "+" : ""}${b.delta.toFixed(1)}s)  "${b.line.slice(0, 46)}"`);
}
console.log(`\nBAIXA CONFIANÇA, deixar como está (${low.length}):`);
for (const b of low.sort((a, c) => a.srcAt - c.srcAt)) console.log(`  ${b.id.padEnd(20)} ${String(b.srcAt).padStart(7)}  ${b.why}`);
console.log(`\nOK, dentro de ${REPORT}s: ${beats.length - fix.length - low.length}`);

// --write reescreve os srcAt em generate.mjs. As de BAIXA CONFIANÇA ficam
// como estão de propósito: mover uma cartela por um match ruim é pior do que
// deixar a âncora antiga, que pelo menos foi posta olhando o parágrafo certo.
if (process.argv.includes("--write")) {
  let out = src;
  for (const b of fix) {
    const v = b.sugerido.toFixed(2);
    const before = out;
    out = b.kind === "beat"
      ? out.replace(new RegExp(`(\\{ id: "${b.id}", kind: "caption", srcAt: )[\\d.]+`), `$1${v}`)
      : out.replace(new RegExp(`(^\\s*\\[)${b.srcAt}(, ")`, "m"), `$1${v}$2`);
    if (out === before) { console.error(`FALHOU ao reescrever ${b.id}`); process.exit(1); }
  }
  fs.writeFileSync(path.join(__dirname, "generate.mjs"), out);
  console.log(`\n${fix.length} srcAt reescritos em build/generate.mjs`);
}
