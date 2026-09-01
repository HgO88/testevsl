#!/usr/bin/env node
// Calcula o srcAt de cada cartela a partir do trecho exato em build/anchors.json.
//
// Substitui o casamento difuso que estava aqui antes. Aquele procurava as
// palavras da linha da cartela em qualquer ponto próximo da transcrição, e num
// vídeo que repete "chamado", "pessoas" e "preparo" o tempo todo isso erra
// feio: "Quem é Chamado, Permanece" foi parar 17.3s antes da fala porque as
// palavras casaram num trecho do parágrafo anterior. Remendei aquilo quatro
// vezes e a cada rodada ele errava de um jeito diferente. O trecho exato tira
// a adivinhação do caminho.
//
// A CONTA de tempo é a mesma de antes e essa está conferida: distribui os
// caracteres do parágrafo sobre o seu tempo de FALA (parágrafo menos as pausas
// do silencedetect), porque um parágrafo de 80s pode ter 10s de pausa e
// interpolar sobre o relógio erra sistematicamente. Batido à mão contra a taxa
// de fala em 5 cartelas, sempre dentro de 0.1s.
//
//   node build/anchor-times.mjs            confere e lista
//   node build/anchor-times.mjs --write    grava os srcAt em generate.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(__dirname, "..");
const SILENCE_LOG = "/tmp/claude-0/-home-user-testevsl/61efbf79-bd66-5435-8ea3-4d74349a64b3/scratchpad/silencedetect_full.log";

// Meio passo DEPOIS da fala. O cálculo tem ruído nos dois sentidos e os dois
// não custam igual: cartela meio segundo atrasada passa despercebida, meio
// segundo adiantada estraga a frase — o espectador lê antes de ouvir.
// (O deslocamento propriamente dito é aplicado em generate.mjs, via
// ANCHOR_BIAS; aqui o srcAt é o instante puro em que a fala começa.)

const norm = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

const tr = JSON.parse(fs.readFileSync(path.join(PROJECT, "media", "transcript.json"), "utf8"));
const segs = (tr.segments ?? tr).map((s) => ({ start: s.start, end: s.end, norm: norm(s.text) }));

const log = fs.readFileSync(SILENCE_LOG, "utf8");
const sStart = [...log.matchAll(/silence_start:\s*([\d.]+)/g)].map((m) => parseFloat(m[1]));
const sEnd = [...log.matchAll(/silence_end:\s*([\d.]+)\s*\|/g)].map((m) => parseFloat(m[1]));
const silences = sEnd.map((e, i) => ({ start: sStart[i], end: e }));

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

const anchors = JSON.parse(fs.readFileSync(path.join(__dirname, "anchors.json"), "utf8"));
const src = fs.readFileSync(path.join(__dirname, "generate.mjs"), "utf8");

const beats = [];
for (const m of src.matchAll(/\{ id: "([^"]+)", kind: "caption", srcAt: ([\d.]+),/g)) {
  beats.push({ id: m[1], srcAt: parseFloat(m[2]), raw: m[2], kind: "beat" });
}
for (const m of src.matchAll(/^\s*\[([\d.]+), "([^"]+)"\],\s*$/gm)) {
  // Chaveada pela LINHA, nao pelo srcAt: --write reescreve o srcAt e uma chave
  // derivada dele deixaria de casar na rodada seguinte.
  if (m[2].includes(" ")) beats.push({ id: m[2], srcAt: parseFloat(m[1]), raw: m[1], kind: "txt" });
}

let bad = 0;
const rows = [];
for (const b of beats) {
  const phrase = anchors[b.id];
  if (!phrase) { console.error(`SEM TRECHO em anchors.json: ${b.id} (srcAt ${b.srcAt})`); bad++; continue; }
  // Número em vez de trecho = valor apurado à mão, usa como está. A conta por
  // caractere assume ritmo de fala constante e há trechos onde ele desacelera
  // muito (ênfase, pausa dramática); ali a conta erra vários segundos e o
  // valor medido na estrutura de pausas ganha.
  if (typeof phrase === "number") {
    rows.push({ ...b, at: phrase, delta: phrase - b.srcAt, phrase: "(à mão)", seg: "-", dup: false });
    continue;
  }
  // Uma frase pode se repetir no vídeo ("você é cuidador de vida" aparece duas
  // vezes). Fica com a ocorrência mais próxima do srcAt atual: o srcAt sempre
  // esteve no parágrafo certo, o erro era de segundos dentro dele.
  const hits = segs.filter((s) => s.norm.includes(phrase));
  if (!hits.length) { console.error(`TRECHO NAO ENCONTRADO: ${b.id} -> "${phrase}"`); bad++; continue; }
  hits.sort((x, y) => Math.abs((x.start + x.end) / 2 - b.srcAt) - Math.abs((y.start + y.end) / 2 - b.srcAt));
  const seg = hits[0];
  const at = atSpeechFraction(seg, seg.norm.indexOf(phrase) / seg.norm.length);
  rows.push({ ...b, at, delta: at - b.srcAt, phrase, seg: `${seg.start}-${seg.end}`, dup: hits.length > 1 });
}
if (bad) { console.error(`\n${bad} cartela(s) sem trecho utilizável — corrija anchors.json`); process.exit(1); }

rows.sort((a, b) => a.at - b.at);
for (const r of rows) {
  const flag = Math.abs(r.delta) > 0.5 ? "  <==" : "";
  console.log(
    `  ${r.id.padEnd(20)} ${r.srcAt.toFixed(2).padStart(8)} -> ${r.at.toFixed(2).padStart(8)}  (${r.delta >= 0 ? "+" : ""}${r.delta.toFixed(1)}s)  [${r.seg}]${r.dup ? " (frase repetida no video)" : ""}${flag}`,
  );
}
const moved = rows.filter((r) => Math.abs(r.delta) > 0.5);
console.log(`\n${rows.length} cartelas, ${moved.length} fora de lugar por mais de 0.5s`);

if (process.argv.includes("--write")) {
  let out = src;
  for (const r of rows) {
    const v = r.at.toFixed(2);
    if (v === r.raw) continue; // já está no valor certo
    const before = out;
    // Casa pelo texto literal do arquivo (`raw`), não pelo número reconvertido:
    // 748.00 vira "748" ao passar por parseFloat e aí não casa com o arquivo.
    const esc = r.raw.replace(/\./g, "\\.");
    out = r.kind === "beat"
      ? out.replace(new RegExp(`(\\{ id: "${r.id}", kind: "caption", srcAt: )${esc}`), `$1${v}`)
      // Casa numero E linha. So pelo numero, duas cartelas que TROCAM de valor
      // entre si se atropelam: a primeira grava o valor da segunda, e a
      // segunda encontra esse mesmo numero na linha errada.
      : out.replace(
          new RegExp(`(^\\s*\\[)${esc}(, "${r.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}")`, "m"),
          `$1${v}$2`,
        );
    if (out === before) { console.error(`FALHOU ao reescrever ${r.id} (raw ${r.raw} -> ${v})`); process.exit(1); }
  }
  fs.writeFileSync(path.join(__dirname, "generate.mjs"), out);
  console.log(`${rows.length} srcAt gravados em build/generate.mjs`);
}
