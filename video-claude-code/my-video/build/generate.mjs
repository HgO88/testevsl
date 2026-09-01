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
const KEEP_PAUSE = 0.10; // seconds of natural breathing room left in every trimmed gap (client: "cortes mais secos")
const LEAD_TRIM = silences.length && silences[0].start < 0.3 ? silences[0].end - 0.1 : 0; // drop dead air before the first word

// Trechos inteiros que saem do filme, em tempo da FONTE. Diferente das pausas
// acima: aqui sai fala, não silêncio. Cada borda foi escolhida numa pausa real
// medida com silencedetect a -32dB, para o corte cair entre frases e não no
// meio de uma.
//
// O cliente já tinha cortado o bloco dos 5 pilares na mão, no CapCut — dava
// para ver na correlação de áudio: 129,5s a menos, começando entre 315 e 320
// do master. Aqui ele entra no cutlist, então tudo que vem depois (cartelas,
// fotos, zooms, blocos de render) se reposiciona sozinho em vez de depender de
// uma remontagem manual.
const DROP_RANGES = [
  // "E é exatamente sobre isso que nós vamos conversar nessa nossa primeira
  // aula." — é uma VSL, não a aula 1 de um módulo.
  [311.85, 317.58],
  // A apresentação corrida dos 5 pilares ("Eu quero te apresentar os 5
  // pilares..." até "...ajudando pessoas."), mais o "Bem, agora eu vou começar
  // falando sobre o primeiro pilar. Nessa aula nós vamos falar desses 5
  // pilares..." e a frase órfã "O primeiro pilar é CHAMADO, não esqueça
  // disso." Ele enumera os cinco e logo em seguida desenvolve os mesmos cinco
  // — o bloco é redundante. Conferido na transcrição inteira: depois de 506.87
  // não sobra nenhuma menção a "pilar", então não fica referência pendurada.
  // Retoma em "O terapeuta cristão não nasce de uma profissão."
  [349.73, 506.87],
  // "Comente como foi essa aula, e eu te espero na nossa próxima aula." — CTA
  // de módulo de curso. O filme passa a fechar em "...para que assim ele use
  // você como testemunho."
  [2005.18, SOURCE_DURATION],
];

// Build the list of "cut out" ranges (the excess middle of each pause)
const cutRanges = [];
if (LEAD_TRIM > 0) cutRanges.push([0, Math.max(0, LEAD_TRIM)]);
for (const [a, b] of DROP_RANGES) cutRanges.push([a, b]);
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
// How far ahead of the spoken line a card starts its fade, so it lands fully
// visible ON the line instead of arriving after it. See the .map() at the end
// of BEATS for why this exists.
const CARD_LEAD = 0.35;

// Os srcAt vêm de uma transcrição por PARÁGRAFO, não por palavra —
// `build/anchor-times.mjs` calcula pelo trecho exato em anchors.json e interpola a posição da frase pelos caracteres e
// isso carrega uns ±3s de erro. Como a cartela agora cai EXATAMENTE em cima do
// srcAt, esse erro aparece na tela nos dois sentidos, e os dois não custam a
// mesma coisa: cartela meio segundo atrasada passa despercebida, meio segundo
// adiantada estraga a frase — o espectador lê antes de ouvir. O cliente pegou
// exatamente isso em "Preciso Me Preparar Melhor", que estava 1.6s cedo.
// Então: meio passo para depois, de graça, para o ruído do método cair sempre
// no lado que não incomoda.
const ANCHOR_BIAS = 0.4;

const BEATS = [
  // -- opening/hook reinforcement (client feedback: chunk-1 is the "chamada",
  // it needs more energy — more keyword captions + a 2nd camcorder moment) --
  // Client reference opens on the recording HUD for its first ~6s, then snaps
  // to full colour — so this is the film's cold open, not a mid-video accent.
  { id: "b-confesso", kind: "camcorder", srcAt: 1, holdBefore: 0, dur: 6 },
  // -- reinforcement pass 4 (client: "mais cartelas de texto") — 11 more
  // black-card lines pulled verbatim from the transcript, filling the long
  // stretches that had no card of their own (esp. the whole first minute) --
  { id: "b-despertando", kind: "caption", srcAt: 13.50, holdBefore: 0.15, dur: 3.0, line: "Deus Está Despertando Pessoas" },
  { id: "b-por-onde", kind: "caption", srcAt: 53.78, holdBefore: 0.15, dur: 3.2, line: "Mas Não Sei Por Onde Começar…" },
  { id: "b-preparar-melhor", kind: "caption", srcAt: 111.68, holdBefore: 0.15, dur: 3.0, line: "Preciso Me Preparar Melhor" },
  { id: "b-preparo-intro", kind: "caption", srcAt: 161.78, holdBefore: 0.15, dur: 3.0, line: "Cuidar de Vida Exige Preparo" },
  { id: "b-nasce-chamado", kind: "caption", srcAt: 511.50, holdBefore: 0.15, dur: 3.2, line: "O Terapeuta Cristão Nasce de um Chamado" },
  { id: "b-vocacao", kind: "caption", srcAt: 528.06, holdBefore: 0.15, dur: 3.0, line: "O Reino Começa pela Vocação" },
  { id: "b-compaixao", kind: "caption", srcAt: 1252.27, holdBefore: 0.15, dur: 3.0, line: "Não Foi a Técnica. Foi a Compaixão." },
  { id: "b-chama-prepara", kind: "caption", srcAt: 1332.20, holdBefore: 0.15, dur: 3.0, line: "Deus Chama e Depois Prepara" },
  { id: "b-presente-resp", kind: "caption", srcAt: 1412.20, holdBefore: 0.15, dur: 3.4, line: "Chamado é Presente. Preparo é Responsabilidade." },
  { id: "b-ja-preparando", kind: "caption", srcAt: 1628.97, holdBefore: 0.15, dur: 3.2, line: "Deus Já Está Preparando as Pessoas" },
  { id: "b-nao-corra", kind: "caption", srcAt: 1808.47, holdBefore: 0.15, dur: 3.2, line: "Não Corra Atrás. Esteja Preparado." },
  { id: "b-essencia", kind: "caption", srcAt: 253.29, holdBefore: 0.15, dur: 3.0, line: "A Essência do Chamado" },
  // -- original 5 approved beats --
  // b-pilares (o grafico de tela cheia listando os 5 pilares, srcAt 323) saiu
  // junto com DROP_RANGES: ele existia para ilustrar a enumeracao que agora
  // nao esta mais no filme. pilaresHtml() fica no arquivo caso o cliente peca
  // o bloco de volta.
  // -- reinforcement pass 2 (client: same energy across the whole video, not
  // just the opening) — 2-3 more keyword captions per chunk that had little
  // or no caption of its own --
  { id: "b-feridas", kind: "caption", srcAt: 585.89, holdBefore: 0.15, dur: 3.2, line: "Deus Chama Quem Já Foi Ferido" },
  { id: "b-restauracao", kind: "caption", srcAt: 766.55, holdBefore: 0.15, dur: 2.8, line: "Restauração" },
  { id: "b-transforma-2", kind: "caption", srcAt: 918.79, holdBefore: 0.15, dur: 3.2, line: "Deus Me Consola, Deus Me Transforma" },
  { id: "b-pessoas", kind: "caption", srcAt: 1059.31, holdBefore: 0.15, dur: 3.0, line: "Ele Trabalha com Pessoas" },
  { id: "b-vidas", kind: "caption", srcAt: 1075.24, holdBefore: 0.15, dur: 3.0, line: "Você Atende Vidas" },
  { id: "b-acolhida", kind: "caption", srcAt: 1164.52, holdBefore: 0.15, dur: 3.0, line: "Vidas a Serem Acolhidas" },
  { id: "b-excelencia", kind: "caption", srcAt: 1569.39, holdBefore: 0.15, dur: 3.0, line: "Excelência no Preparo" },
  { id: "b-dependencia-2", kind: "caption", srcAt: 1616.53, holdBefore: 0.15, dur: 2.8, line: "Dependência" },
  { id: "b-servico-2", kind: "caption", srcAt: 1827.90, holdBefore: 0.15, dur: 2.8, line: "Serviço" },
  { id: "b-carater", kind: "caption", srcAt: 1922.53, holdBefore: 0.15, dur: 3.2, line: "A Maior Ferramenta é o Seu Caráter" },
  { id: "b-chamado-preparo", kind: "cutaway", srcAt: 1490, holdBefore: 0.3, dur: 7.6 },
  { id: "b-cuidador", kind: "caption", srcAt: 1942.00, holdBefore: 0.15, dur: 3.2, line: "Você é Cuidador de Vida" },
  // b-camcorder (segundo momento com filtro de camera, srcAt 992) removido a
  // pedido do cliente: o P&B no meio do filme nao caiu bem. O da ABERTURA
  // (b-confesso) fica -- e a referencia que ele mandou e ja foi aprovada.
  // -- reinforcement pass 3 (client: "gostaria também da adição de mais img")
  // -- one full-screen quote-card per chunk that had no photo cutaway yet,
  // using 5 of the 10 still-unused client photos (2 more stay unused: the
  // 2 with baked-in text/typography, unusable as a background under a
  // second text layer) --
  { id: "b-quote-abandono", kind: "quote", srcAt: 668, holdBefore: 0.2, dur: 6, img: "media/broll/papel-parede-jesus.jpg", text: "JESUS CONHECEU O ABANDONO, A REJEIÇÃO, A SOLIDÃO." },
  { id: "b-quote-consolacao", kind: "quote", srcAt: 865, holdBefore: 0.2, dur: 7, img: "media/broll/tua-graca-me-basta.jpg", kicker: "2 CORÍNTIOS 1:3-4", text: "DEUS DE TODA CONSOLAÇÃO, QUE NOS CONSOLA PARA CONSOLARMOS OS OUTROS." },
  { id: "b-quote-amor", kind: "quote", srcAt: 1280, holdBefore: 0.2, dur: 5, img: "media/broll/transferir-1.jpg", text: "SOMENTE O AMOR SUSTENTA O CHAMADO." },
  { id: "b-quote-honra", kind: "quote", srcAt: 1420, holdBefore: 0.2, dur: 6, img: "media/broll/dom-profetico.jpg", text: "O CHAMADO ABRE A PORTA. O PREPARO FAZ VOCÊ HONRAR A DEUS NELA." },
  { id: "b-quote-cuidado", kind: "quote", srcAt: 1905, holdBefore: 0.2, dur: 6, img: "media/broll/desse-jeito.jpg", text: "VÃO ESQUECER AS TÉCNICAS. NUNCA VÃO ESQUECER QUE FORAM CUIDADAS POR VOCÊ." },
  // -- 3 more b-roll-only breathers (client: "usar mais imgs de broll"),
  // using the last 3 clean (no baked-in text) client photos, no quote text —
  // just the photo breathing with its own Ken-Burns zoom --
  { id: "b-broll-2", kind: "broll", srcAt: 1235, holdBefore: 0.15, dur: 3, img: "media/broll/transferir-3.jpg" },
  { id: "b-broll-3", kind: "broll", srcAt: 1752, holdBefore: 0.15, dur: 3, img: "media/broll/transferir-4.jpg" },
  // -- reinforcement pass 5 (client: "bastante texto nas frases e tbm nos
  // versiculos quando ele ler") — a card for each scripture he reads aloud,
  // reference on top, verse below; plus 4 more b-roll breathers, which uses
  // up the last 2 photos (the ones with baked-in type, fine with no overlay) --
  { id: "b-v-heb218", kind: "caption", srcAt: 614.55, holdBefore: 0.15, dur: 4.4, ref: "HEBREUS 2:18", line: "Ele mesmo sofreu quando foi tentado, e é poderoso para socorrer os que são tentados." },
  { id: "b-v-heb415", kind: "caption", srcAt: 627.57, holdBefore: 0.15, dur: 4.6, ref: "HEBREUS 4:15", line: "Temos um sumo sacerdote que, como nós, em tudo foi tentado — mas sem pecado." },
  { id: "b-v-jo1010", kind: "caption", srcAt: 1199.19, holdBefore: 0.15, dur: 3.6, ref: "JOÃO 10:10", line: "Vim para que tenham vida, e a tenham em abundância." },
  { id: "b-v-2tm224", kind: "caption", srcAt: 1368.35, holdBefore: 0.15, dur: 4.4, ref: "2 TIMÓTEO 2:24", line: "O servo do Senhor deve ser amável para com todos, e apto para ensinar." },
  { id: "b-v-jo155", kind: "caption", srcAt: 1556.45, holdBefore: 0.15, dur: 3.4, ref: "JOÃO 15:5", line: "Sem mim, nada podeis fazer." },
  { id: "b-v-2tm215", kind: "caption", srcAt: 1578.95, holdBefore: 0.15, dur: 3.6, ref: "2 TIMÓTEO 2:15", line: "Procura apresentar-te a Deus como aprovado." },
  { id: "b-v-jo644", kind: "caption", srcAt: 1662.48, holdBefore: 0.15, dur: 4.0, ref: "JOÃO 6:44", line: "Ninguém vem a mim se o Pai que me enviou não o trouxer." },
  { id: "b-broll-4", kind: "broll", srcAt: 285, holdBefore: 0.15, dur: 3, img: "media/broll/transferir-0.jpg" },
  { id: "b-broll-5", kind: "broll", srcAt: 800, holdBefore: 0.15, dur: 3, img: "media/broll/cantata-pascoa-sacrificio.jpg" },
  { id: "b-broll-6", kind: "broll", srcAt: 1100, holdBefore: 0.15, dur: 3, img: "media/broll/gloria-de-deus.jpg" },
  { id: "b-broll-7", kind: "broll", srcAt: 1520, holdBefore: 0.15, dur: 3, img: "media/broll/maos-oracao-cruz.jpg" },
  // -- reinforcement pass 7 (client: "e bastante texto") — 16 more black
  // cards, each a line he actually says, placed in the gaps the earlier
  // passes left. With these the film carries ~45 text cards over 29 minutes. --
  ...[
    [221.06, "O Que Move o Seu Coração?"],
    [291.51, "Quem é Chamado, Permanece"],
    [304.03, "Participar da Obra de Restauração"],
    [542.71, "Jesus Não Chama Profissionais. Chama Servos."],
    [574.28, "Um Coração Que Responde ao Chamado"],
    [736.07, "É Preciso Ser Humano Para Ajudar Outro Humano"],
    [748.00, "Deus Não Desperdiça as Feridas de Quem Ele Chama"],
    [826.95, "Paulo Sofreu Antes de Consolar a Igreja"],
    [969.19, "Feridas Tratadas Por Deus Te Qualificam"],
    [1043.88, "O Terapeuta Cristão Não Trabalha com Problemas"],
    [1272.13, "Somente o Amor Sustenta o Chamado"],
    [1303.07, "O Chamado Não Dispensa o Preparo"],
    [1455.30, "Deus Te Deu o Dom. Agora Afie as Ferramentas."],
    [1745.15, "Você Não Precisa Salvar Todo Mundo"],
    [1874.24, "Como Glorificar a Deus Cuidando de Pessoas"],
  ].map(([srcAt, line], i) => ({
    id: `b-txt-${i}`, kind: "caption", srcAt, holdBefore: 0.15,
    dur: line.length > 34 ? 3.4 : 3.0, line,
  })),
  // -- reinforcement pass 6 (client: "lembra de adicionar bastante img") --
  // 14 more b-roll breathers dropped into every remaining gap wide enough to
  // hold one clear of the surrounding beats. Photos repeat across the film,
  // which is fine: the reuses are minutes apart. Together with the quote
  // cards, the two graphic cutaways and the earlier brolls this puts a photo
  // on screen roughly once a minute across the whole 29 minutes.
  ...[
    [78, "tua-graca-me-basta"], [140, "pessoa-ajoelhada-deus-respira"],
    // 230 would have run until 209.8 on the new timeline, right over b-txt-0
    // ("O Que Move o Seu Coração?", 208.6): the caption faded in on schedule
    // but sat HIDDEN behind this photo, and only appeared when the photo
    // fade-out uncovered it — 0.86s late. Measured on the render, not guessed.
    // Backed off to 225 so the photo is gone well before the card. The
    // no-overlap assert after BEATS is what stops this recurring.
    [229, "cruz-luz"],
    // 350 ("sinais-espirito-santo") e 410 ("espiritualidade-crista") caíam
    // dentro do bloco dos 5 pilares e saíram com ele. As duas fotos seguem em
    // uso como fundo dos painéis de b-chamado-preparo.
    [580, "josue-licoes"],
    [710, "papel-parede-jesus"], [840, "dom-profetico"],
    [950, "transferir-1"], [1025, "gloria-de-deus"],
    [1155, "desse-jeito"], [1350, "transferir-2"],
    [1640, "cruz-luz"], [1870, "transferir-3"],
  ].map(([srcAt, img], i) => ({
    id: `b-broll-x${i}`, kind: "broll", srcAt, holdBefore: 0.15, dur: 2.8,
    img: `media/broll/${img}.jpg`,
  })),
// Client: "senti uns atrasos ainda em relação a entrada dos quadros com as
// frases ou até mesmo na img."
//
// The MAP was already right — card positions measured within 72ms of the
// cutlist after the select/aselect fix. What was late was the ENVELOPE. A
// card's data-start WAS the spoken word, and only then did it start fading
// in (0.35s) with its text fading in on top (0.6s, itself starting 0.2s
// later), on top of a deliberate holdBefore of 0.15-0.3s. So the card only
// read as "there" 0.7-1.15s after the phrase began. Perfectly on the map,
// visibly late on screen.
//
// Fix, two parts:
//   1. drop holdBefore from the formula (kept in the data as the record of
//      what it used to be) — srcAt already IS the moment he says the line;
//   2. give every card a LEAD so the fade STARTS before the word and lands
//      ON it, instead of starting on it.
// The transition itself is untouched — still a 0.35s cross-fade, client
// asked for "transições suaves". Only where the smooth part sits relative
// to the speech changed. dur is extended by the same lead so the card's
// exit stays exactly where it was; only the entrance moves earlier.
].map((b) => ({
  ...b,
  dur: b.dur + CARD_LEAD,
  newAt: Math.max(0, sourceToNewTime(b.srcAt) + ANCHOR_BIAS - CARD_LEAD),
}));

console.log("beat positions (source -> new timeline):");
for (const b of BEATS) console.log(`  ${b.id}: src ${b.srcAt}s -> new ${b.newAt.toFixed(2)}s (+${b.dur}s)`);

// Uma cartela ancorada num srcAt que caiu dentro de um DROP_RANGE não some
// junto: sourceToNewTime() cai no fallback "segmento mais próximo" e ela
// reaparece colada na emenda, citando uma frase que ninguém mais fala. Sem
// aviso nenhum. Falhe o build.
{
  const orphans = BEATS.filter((b) => DROP_RANGES.some(([a, z]) => b.srcAt >= a && b.srcAt < z));
  if (orphans.length) {
    console.error("\ncartelas ancoradas em fala que foi cortada (DROP_RANGES):");
    for (const b of orphans) console.error(`  ${b.id} (srcAt ${b.srcAt}s)`);
    process.exit(1);
  }
}

// Two full-frame cards on the same seconds do not blend — the later one in the
// DOM simply covers the earlier one, and the covered card looks LATE: it fades
// in invisibly and only shows up when the card on top fades out. That is what
// the b-broll-x2/b-txt-0 pair did (0.86s of a caption hidden behind a photo).
// The beats were placed in seven separate reinforcement passes against source
// timestamps, so a new collision is one careless srcAt away. Fail the build
// instead of shipping it.
{
  const sorted = [...BEATS].sort((a, b) => a.newAt - b.newAt);
  const clashes = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].newAt >= sorted[i].newAt + sorted[i].dur) break;
      const ov = Math.min(sorted[i].newAt + sorted[i].dur, sorted[j].newAt + sorted[j].dur) - sorted[j].newAt;
      if (ov > 0.02) clashes.push(`${sorted[i].id} e ${sorted[j].id} se sobrepõem por ${ov.toFixed(2)}s em ${sorted[j].newAt.toFixed(2)}s`);
    }
  }
  if (clashes.length) {
    console.error("\ncartelas sobrepostas (a de baixo fica escondida e parece atrasada):");
    for (const c of clashes) console.error(`  ${c}`);
    process.exit(1);
  }
  console.log(`sem sobreposições entre as ${BEATS.length} cartelas`);
}

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

// Client feedback: "zoom in e zoom out depois de algumas frases" — punchy
// snap zooms on the talking head at intervals, instead of one slow
// continuous drift (which fights the punches for the same CSS property).
// Skips any window already claimed by another beat (cutaway/camcorder/quote/
// caption), so it never double-animates #base at the same instant.

// Client: "cortes secos, transicoes suaves" — the speech cuts stay hard, but
// every full-frame card slides in and out on a short cross-fade instead of
// popping. 0.35s each way, clamped so it never eats more than a third of a
// short card.
function fadeCard(id, at, dur) {
  const f = Math.min(0.35, dur / 3);
  // The leading and trailing tl.set() are what lint's gsap_exit_missing_hard_kill
  // and gsap_fullscreen_overlay_starts_visible rules require: a full-frame
  // overlay must be explicitly hidden before its first fade and hard-killed on
  // its clip boundary, or a non-linear seek can land on a stale visible frame.
  return [
    `  tl.set("#${id}", { autoAlpha: 0 }, 0);`,
    `  tl.fromTo("#${id}", { autoAlpha: 0 }, { autoAlpha: 1, duration: ${num(f)}, ease: "power1.out" }, ${num(at)});`,
    `  tl.to("#${id}", { autoAlpha: 0, duration: ${num(f)}, ease: "power1.in" }, ${num(at + dur - f)});`,
    `  tl.set("#${id}", { autoAlpha: 0 }, ${num(at + dur)});`,
  ];
}

const PUNCH_INTERVAL = 26; // seconds between snap zooms
const PUNCH_MARGIN = 1.5; // stay clear of other beats by this much
const ZOOM_HOLD = 5.7; // in(1.2s) + hold(4.5s) before easing back out
function punchZoomLines(rangeStart, rangeEnd, beatsInRange, offset) {
  const lines = [];
  for (let t = rangeStart + PUNCH_INTERVAL * 0.6; t < rangeEnd - 2; t += PUNCH_INTERVAL) {
    const clashes = beatsInRange.some((b) => t > b.newAt - PUNCH_MARGIN && t < b.newAt + b.dur + PUNCH_MARGIN);
    if (clashes) continue;
    const at = num(t - offset);
    // Client: "o efeito de zoom nao precisa ser tao rapido / pode aproximar e
    // quando ele acabar a frase retorna ao tamanho original" — so: ease IN over
    // ~1.2s, HOLD through the sentence (~4.5s), then ease back out over ~1.2s.
    lines.push(`  tl.fromTo("#base", { scale: 1 }, { scale: 1.09, duration: 1.2, ease: "power2.inOut" }, ${at});`);
    lines.push(`  tl.to("#base", { scale: 1, duration: 1.2, ease: "power2.inOut" }, ${num(at + ZOOM_HOLD)});`);
  }
  return lines;
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
  const ref = b.ref ? `<p class="caption-ref">${b.ref}</p>\n        ` : "";
  return `      <div id="${b.id}" class="clip caption-card" data-start="${num(b.newAt)}" data-duration="${b.dur}" data-track-index="${TRACK_OVERLAY}">
        <div class="caption-inner" id="${b.id}-word">
        ${ref}<p class="caption-line${b.ref ? " is-verse" : ""}">${b.line}</p>
        </div>
      </div>`;
}

function camcorderHtml(b) {
  return `      <div id="${b.id}" class="clip camcorder-hud" data-start="${num(b.newAt)}" data-duration="${b.dur}" data-track-index="${TRACK_OVERLAY}">
        <span class="cam-corner tl"></span>
        <span class="cam-corner tr"></span>
        <span class="cam-corner bl"></span>
        <span class="cam-corner br"></span>
        <div class="cam-focus">
          <span class="f-tl"></span><span class="f-tr"></span><span class="f-bl"></span><span class="f-br"></span>
        </div>
        <div class="cam-battery"><span class="cam-battery-icon"></span></div>
        <div class="cam-rec"><span class="cam-rec-dot" id="${b.id}-dot"></span>REC</div>
        <div class="cam-4k">4K 60FPS</div>
        <div class="cam-hd">HD</div>
      </div>`;
}

// Client reference: b-roll photo plays alone first (no text, let it breathe),
// THEN a hard cut to a solid-black card carrying the italic quote — not one
// card with both layered together. Two separate .clip elements, back to back.
function quotePhotoDur(b) {
  return Math.min(2.2, num(b.dur * 0.4));
}

function quoteHtml(b) {
  const photoDur = quotePhotoDur(b);
  const textDur = num(b.dur - photoDur);
  const kicker = b.kicker ? `<p class="quote-kicker">${b.kicker}</p>` : "";
  return `      <section id="${b.id}-photo" class="clip cutaway quote-photo" data-start="${num(b.newAt)}" data-duration="${photoDur}" data-track-index="${TRACK_OVERLAY}">
        <div class="cutaway-bgs"><img class="cutaway-bg" id="${b.id}-bg" src="${b.img}" alt="" /></div>
      </section>
      <section id="${b.id}-text" class="clip cutaway quote-black" data-start="${num(b.newAt + photoDur)}" data-duration="${textDur}" data-track-index="${TRACK_OVERLAY}">
        <div class="quote-inner" id="${b.id}-inner">
          ${kicker}
          <p class="quote-text">${b.text}</p>
        </div>
      </section>`;
}

function brollHtml(b) {
  return `      <section id="${b.id}" class="clip cutaway quote-photo" data-start="${num(b.newAt)}" data-duration="${b.dur}" data-track-index="${TRACK_OVERLAY}">
        <div class="cutaway-bgs"><img class="cutaway-bg" id="${b.id}-bg" src="${b.img}" alt="" /></div>
      </section>`;
}

function beatHtml(b) {
  if (b.id === "b-pilares") return pilaresHtml(b);
  if (b.id === "b-chamado-preparo") return chamadoPreparoHtml(b);
  if (b.kind === "camcorder") return camcorderHtml(b);
  if (b.kind === "quote") return quoteHtml(b);
  if (b.kind === "broll") return brollHtml(b);
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
    animLines.push(`  tl.fromTo("#${b.id}-left", { autoAlpha: 0, xPercent: -14 }, { autoAlpha: 1, xPercent: 0, duration: 0.45, ease: "power3.out" }, ${num(b.newAt)});`);
    animLines.push(`  tl.fromTo("#${b.id}-right", { autoAlpha: 0, xPercent: 14 }, { autoAlpha: 1, xPercent: 0, duration: 0.45, ease: "power3.out" }, ${num(b.newAt)});`);
    animLines.push(`  tl.fromTo("#${b.id}-plus", { autoAlpha: 0, scale: 0.4 }, { autoAlpha: 1, scale: 1, duration: 0.4, ease: "back.out(1.6)" }, ${num(b.newAt + 0.5)});`);
    animLines.push(`  tl.fromTo("#${b.id}-bg-left", { scale: 1 }, { scale: 1.1, duration: ${num(b.dur - 0.2)}, ease: "none" }, ${num(b.newAt + 0.15)});`);
    animLines.push(`  tl.fromTo("#${b.id}-bg-right", { scale: 1 }, { scale: 1.1, duration: ${num(b.dur - 0.2)}, ease: "none" }, ${num(b.newAt + 0.15)});`);
  } else if (b.kind === "camcorder") {
    animLines.push(`  tl.fromTo("#base", { filter: "grayscale(0%)" }, { filter: "grayscale(100%)", duration: 0.5 }, ${num(b.newAt)});`);
    animLines.push(`  tl.fromTo("#base", { filter: "grayscale(100%)" }, { filter: "grayscale(0%)", duration: 0.5 }, ${num(b.newAt + b.dur - 0.5)});`);
    animLines.push(`  tl.fromTo("#${b.id}", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, ${num(b.newAt)});`);
    animLines.push(`  tl.to("#${b.id}", { autoAlpha: 0, duration: 0.3 }, ${num(b.newAt + b.dur - 0.3)});`);
    animLines.push(`  tl.to("#${b.id}-dot", { autoAlpha: 0.15, duration: 0.35, repeat: ${Math.max(3, Math.floor((b.dur - 0.6) / 0.35) - 1)}, yoyo: true }, ${num(b.newAt + 0.3)});`);
  } else if (b.kind === "quote") {
    const photoDur = quotePhotoDur(b);
    animLines.push(`  tl.fromTo("#${b.id}-bg", { scale: 1 }, { scale: 1.08, duration: ${photoDur}, ease: "none" }, ${num(b.newAt)});`);
    animLines.push(`  tl.fromTo("#${b.id}-inner", { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: "power3.out" }, ${num(b.newAt + photoDur)});`);
    animLines.push(...fadeCard(`${b.id}-photo`, b.newAt, photoDur));
    animLines.push(...fadeCard(`${b.id}-text`, b.newAt + photoDur, b.dur - photoDur));
  } else if (b.kind === "broll") {
    animLines.push(`  tl.fromTo("#${b.id}-bg", { scale: 1 }, { scale: 1.1, duration: ${b.dur}, ease: "none" }, ${num(b.newAt)});`);
    animLines.push(...fadeCard(b.id, b.newAt, b.dur));
  } else {
    // Reference style: a quiet fade + a hair of scale, never a bouncy pop.
    animLines.push(`  tl.fromTo("#${b.id}-word", { autoAlpha: 0, scale: 1.03 }, { autoAlpha: 1, scale: 1, duration: 0.35, ease: "power2.out" }, ${num(b.newAt)});`);
    animLines.push(`  tl.to("#${b.id}-word", { autoAlpha: 0, duration: 0.4, ease: "power1.in" }, ${num(b.newAt + b.dur - 0.55)});`);
    animLines.push(...fadeCard(b.id, b.newAt, b.dur));
  }
}

// Punchy snap zooms on the talking head at intervals (client feedback: zoom
// in/out after some sentences), skipping windows other beats already own.
animLines.push(...punchZoomLines(0, NEW_DURATION, BEATS, 0));

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

      /* Highlight card — client-supplied reference: pure black frame, one line
         of large white italic serif, centered. Replaces the earlier gold
         bold-caps lower-third. */
      .caption-card {
        background: #000;
        display: flex; align-items: center; justify-content: center;
        padding: 0 140px; text-align: center; pointer-events: none;
      }
      .caption-inner { max-width: 1560px; }
      .caption-line {
        margin: 0; font-family: Georgia, "Times New Roman", serif; font-style: italic;
        font-weight: 400; font-size: 104px; line-height: 1.2; letter-spacing: 0.5px;
        color: #fff;
      }
      /* Scripture cards carry more words, so they set smaller under a reference */
      .caption-ref {
        margin: 0 0 34px; font-family: Arial, Helvetica, sans-serif; font-style: normal;
        font-weight: 700; font-size: 30px; letter-spacing: 6px; color: var(--accent);
      }
      .caption-line.is-verse { font-size: 66px; line-height: 1.32; }

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
      /* Sizes are the client reference's (854x480) scaled x2.25 to 1080p — at
         the original px values the HUD was invisibly small on a 1080p frame. */
      .cam-corner { position: absolute; width: 84px; height: 84px; border-color: rgba(255,255,255,.95); border-style: solid; border-width: 0; }
      .cam-corner.tl { top: 46px; left: 46px; border-top-width: 6px; border-left-width: 6px; }
      .cam-corner.tr { top: 46px; right: 46px; border-top-width: 6px; border-right-width: 6px; }
      .cam-corner.bl { bottom: 46px; left: 46px; border-bottom-width: 6px; border-left-width: 6px; }
      .cam-corner.br { bottom: 46px; right: 46px; border-bottom-width: 6px; border-right-width: 6px; }
      /* Center focus reticle, as in the reference */
      .cam-focus { position: absolute; left: 50%; top: 47%; transform: translate(-50%, -50%); width: 400px; height: 260px; }
      .cam-focus span { position: absolute; width: 52px; height: 52px; border-color: rgba(255,255,255,.9); border-style: solid; border-width: 0; }
      .cam-focus .f-tl { top: 0; left: 0; border-top-width: 5px; border-left-width: 5px; }
      .cam-focus .f-tr { top: 0; right: 0; border-top-width: 5px; border-right-width: 5px; }
      .cam-focus .f-bl { bottom: 0; left: 0; border-bottom-width: 5px; border-left-width: 5px; }
      .cam-focus .f-br { bottom: 0; right: 0; border-bottom-width: 5px; border-right-width: 5px; }
      .cam-battery { position: absolute; top: 58px; left: 156px; }
      .cam-battery-icon { display: inline-block; width: 62px; height: 30px; border: 4px solid #fff; border-radius: 5px; position: relative; }
      .cam-battery-icon::before { content: ""; position: absolute; inset: 4px; right: 15px; background: #fff; }
      .cam-battery-icon::after { content: ""; position: absolute; right: -11px; top: 7px; width: 8px; height: 14px; background: #fff; border-radius: 0 3px 3px 0; }
      .cam-rec { position: absolute; top: 58px; right: 156px; font-size: 38px; font-weight: 700; letter-spacing: 2px; display: flex; align-items: center; gap: 14px; text-shadow: 0 2px 10px rgba(0,0,0,.6); }
      .cam-rec-dot { width: 24px; height: 24px; border-radius: 50%; background: #e5484d; display: inline-block; }
      .cam-4k { position: absolute; bottom: 58px; left: 156px; font-size: 30px; font-weight: 600; letter-spacing: 2px; text-shadow: 0 2px 10px rgba(0,0,0,.6); }
      .cam-hd { position: absolute; bottom: 58px; right: 156px; font-size: 30px; font-weight: 600; letter-spacing: 2px; text-shadow: 0 2px 10px rgba(0,0,0,.6); }

      /* Photo-then-black-card quote pair (client reference: b-roll photo plays
         alone, THEN a hard cut to a solid-black card with the italic quote —
         not layered together, and not centered bold caps — that treatment
         stays for keyword captions). */
      .quote-photo .cutaway-bg { position: absolute; inset: 0; }
      .quote-black { background: #000; display: flex; align-items: flex-end; justify-content: flex-start; padding: 0 0 110px 110px; }
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
  // SEM_FRASES=1 tira as cartelas de texto e deixa só ele falando, com as
  // fotos e o zoom. Serve para comparar um trecho com e sem legenda quando o
  // cliente acha que elas estão atrapalhando mais do que ajudando.
  //
  // O filtro é DEPOIS de BEATS, de propósito: as fronteiras dos 6 blocos são
  // calculadas para não cair em cima de uma cartela, então tirar cartelas de
  // BEATS moveria as fronteiras e o bloco deixaria de casar com os outros
  // cinco na hora de juntar. Aqui só a emissão muda; a divisão fica igual.
  //
  // Sobram só as FOTOS de b-roll (e o HUD de câmera, que é tratamento da
  // imagem dele, não um cartão por cima). Saem cartelas de texto, versículos,
  // cartão de citação e corte gráfico — tudo que põe texto na tela. Chegamos
  // aqui em três passos, cada um pedido pelo cliente: primeiro as cartelas de
  // apoio, depois os versículos, depois a citação.
  const SEM_FRASES = process.env.SEM_FRASES === "1";
  const localBeats = BEATS.filter(
    (b) =>
      b.newAt >= chunk.start - 0.01 &&
      b.newAt < chunk.end - 0.01 &&
      !(SEM_FRASES && ["caption", "quote", "cutaway"].includes(b.kind)),
  ).map((b) => ({
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
      chunkAnimLines.push(`  tl.fromTo("#${b.id}-left", { autoAlpha: 0, xPercent: -14 }, { autoAlpha: 1, xPercent: 0, duration: 0.45, ease: "power3.out" }, ${num(b.newAt)});`);
      chunkAnimLines.push(`  tl.fromTo("#${b.id}-right", { autoAlpha: 0, xPercent: 14 }, { autoAlpha: 1, xPercent: 0, duration: 0.45, ease: "power3.out" }, ${num(b.newAt)});`);
      chunkAnimLines.push(`  tl.fromTo("#${b.id}-plus", { autoAlpha: 0, scale: 0.4 }, { autoAlpha: 1, scale: 1, duration: 0.4, ease: "back.out(1.6)" }, ${num(b.newAt + 0.5)});`);
      chunkAnimLines.push(`  tl.fromTo("#${b.id}-bg-left", { scale: 1 }, { scale: 1.1, duration: ${num(b.dur - 0.2)}, ease: "none" }, ${num(b.newAt + 0.15)});`);
      chunkAnimLines.push(`  tl.fromTo("#${b.id}-bg-right", { scale: 1 }, { scale: 1.1, duration: ${num(b.dur - 0.2)}, ease: "none" }, ${num(b.newAt + 0.15)});`);
    } else if (b.kind === "camcorder") {
      chunkAnimLines.push(`  tl.fromTo("#base", { filter: "grayscale(0%)" }, { filter: "grayscale(100%)", duration: 0.5 }, ${num(b.newAt)});`);
      chunkAnimLines.push(`  tl.fromTo("#base", { filter: "grayscale(100%)" }, { filter: "grayscale(0%)", duration: 0.5 }, ${num(b.newAt + b.dur - 0.5)});`);
      chunkAnimLines.push(`  tl.fromTo("#${b.id}", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, ${num(b.newAt)});`);
      chunkAnimLines.push(`  tl.to("#${b.id}", { autoAlpha: 0, duration: 0.3 }, ${num(b.newAt + b.dur - 0.3)});`);
      chunkAnimLines.push(`  tl.to("#${b.id}-dot", { autoAlpha: 0.15, duration: 0.35, repeat: ${Math.max(3, Math.floor((b.dur - 0.6) / 0.35) - 1)}, yoyo: true }, ${num(b.newAt + 0.3)});`);
    } else if (b.kind === "quote") {
      const photoDur = quotePhotoDur(b);
      chunkAnimLines.push(`  tl.fromTo("#${b.id}-bg", { scale: 1 }, { scale: 1.08, duration: ${photoDur}, ease: "none" }, ${num(b.newAt)});`);
      chunkAnimLines.push(`  tl.fromTo("#${b.id}-inner", { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: "power3.out" }, ${num(b.newAt + photoDur)});`);
      chunkAnimLines.push(...fadeCard(`${b.id}-photo`, b.newAt, photoDur));
      chunkAnimLines.push(...fadeCard(`${b.id}-text`, b.newAt + photoDur, b.dur - photoDur));
    } else if (b.kind === "broll") {
      chunkAnimLines.push(`  tl.fromTo("#${b.id}-bg", { scale: 1 }, { scale: 1.1, duration: ${b.dur}, ease: "none" }, ${num(b.newAt)});`);
      chunkAnimLines.push(...fadeCard(b.id, b.newAt, b.dur));
    } else {
      chunkAnimLines.push(`  tl.fromTo("#${b.id}-word", { autoAlpha: 0, scale: 1.03 }, { autoAlpha: 1, scale: 1, duration: 0.35, ease: "power2.out" }, ${num(b.newAt)});`);
      chunkAnimLines.push(`  tl.to("#${b.id}-word", { autoAlpha: 0, duration: 0.4, ease: "power1.in" }, ${num(b.newAt + b.dur - 0.55)});`);
      chunkAnimLines.push(...fadeCard(b.id, b.newAt, b.dur));
    }
  }

  const chunkMediaClip = `      <video id="base" class="clip talking-head" src="${BASE_VIDEO}" data-start="0" data-duration="${dur}" data-media-start="${num(chunk.start)}" data-has-audio="true" data-track-index="${TRACK_VIDEO}" playsinline></video>`;

  // Punchy snap zooms on the talking head at intervals (client feedback: zoom
  // in/out after some sentences), skipping windows other beats already own.
  chunkAnimLines.push(...punchZoomLines(0, dur, localBeats, 0));

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
