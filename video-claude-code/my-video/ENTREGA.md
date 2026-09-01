# Entrega — VSL "Terapia com Alma" (Aula 1)

26m43s · 1920x1080 · 30fps · voz original do professor do início ao fim.

## Arquivos (em `renders/`, fora do git)

| Arquivo | Tamanho | Para quê |
|---|---|---|
| `VSL-final-1080p.mp4` | ~1,76 GB | Master. Qualidade quase sem perdas, guarde para reedições. |
| `web/VSL-FullHD-web.mp4` | 675 MB | **É esta que se publica.** Full HD, bitrate de web, `faststart`. |
| `chunk-1..6.mp4` | ~300 MB cada | Os 6 blocos do master, já juntados nos arquivos acima. |
| `/tmp/vsl-fhd-v2/VSL-1..8-de-8.mp4` | ~27 MB cada | As 8 partes de entrega (o canal limita 30 MB por arquivo). |

Os blocos são apenas uma divisão técnica de render (o render de 29min de uma
vez estourava memória e disco); o vídeo entregue é contínuo.

## O que tem no vídeo

- **Cortes**: 307 cortes removidos do bruto — 33m32 → 26m43. Além das pausas,
  três trechos de fala inteiros saíram (ver `DROP_RANGES` em `build/generate.mjs`):
  a frase "nessa nossa primeira aula", a apresentação corrida dos 5 pilares, e o
  "comente como foi essa aula, te espero na próxima" do final — é uma VSL, não a
  aula 1 de um módulo.
- **Abertura**: 6s com filtro de câmera (P&B + HUD de gravação), depois corta para cor.
- **~40 cartelas de texto** em tela preta, itálico serifado — frases ditas por ele.
- **7 cartelas de versículo** (Hb 2:18, Hb 4:15, Jo 10:10, 2Tm 2:24, Jo 15:5, 2Tm 2:15, Jo 6:44).
- **~28 aparições das 17 fotos** do cliente, ~1 por minuto.
- **1 corte gráfico**: a comparação chamado × preparo. (O gráfico dos 5 pilares
  saiu junto com a fala que ele ilustrava; `pilaresHtml()` continua no código.)
- Zoom lento que aproxima, segura durante a frase e volta.

## Sincronia — o que deu errado e como verificar

A primeira entrega saiu com os lábios ~2.8s fora e as cartelas até 1.8s
adiantadas. Causa: o `concat` do ffmpeg com `inpoint`/`outpoint` cortava o
vídeo numa borda de frame e o áudio numa borda de pacote AAC (~21ms). Um corte
é imperceptível; 326 acumulam. E os timestamps irregulares que isso gerava
faziam o HyperFrames extrair os frames fora de lugar em relação ao áudio.

Corrigido em `build/make-select.mjs`: filtros `select`/`aselect` tiram os dois
streams da MESMA linha de tempo decodificada, então um frame e suas amostras
são mantidos ou descartados juntos.

**Sempre meça antes de entregar.** Duas medições diferentes, não confunda:

- **Lábios** — áudio do chunk renderizado vs áudio de `edited-base.mp4` no
  mesmo instante. Tem que dar ~0ms. É o que quebrava.
- **Cartela vs fala** — áudio da fonte vs áudio do chunk na posição que o
  cutlist prevê. Até ~150ms passa despercebido.

Método: correlação de envelope de energia (janelas de 2ms). O trecho de
referência precisa caber DENTRO de um segmento contínuo do cutlist — um trecho
que atravessa corte tem envelope diferente e a correlação trava num pico falso
(foi assim que uma medição acusou +4.5s onde o real era +32ms).

## Entrada das cartelas — mapa certo, envelope errado

Depois do `select`/`aselect` o mapa estava certo (cartela dentro de 72ms do
cutlist) e o cliente ainda sentia atraso. Não era o mapa, era o **envelope**:

- `data-start` da cartela = o instante da fala, e só ali começava o fade-in;
- `holdBefore` de 0.15–0.3s empurrava tudo mais para a frente;
- o texto interno tinha um fade próprio de 0.6s começando 0.2s depois.

Somando: a frase começava a ser dita e a cartela só ficava legível 0.7–1.15s
depois. No papel, em cima; na tela, atrasada.

Corrigido em `build/generate.mjs` com `CARD_LEAD = 0.35`: o `holdBefore` saiu
da conta (o `srcAt` já É o instante da fala) e toda cartela começa o fade
0.35s ANTES, terminando exatamente em cima da frase. `dur` cresce o mesmo
tanto, então a saída fica onde estava — só a entrada andou para trás. A
transição continua suave, com os mesmos 0.35s; o que mudou foi onde ela cai.

Conferência rápida, sem renderizar: para a cartela X em `chunk-N.html`, o
`fromTo(... autoAlpha: 1 ...)` mais o `duration` têm que dar o
`sourceToNewTime(srcAt)` impresso por `node build/generate.mjs`.

## Cortar em partes

O limite de 30 MB por arquivo do canal obriga a entregar em 8 partes, que o
cliente junta no CapCut. `build/split-entrega.sh` encoda cada parte separada a
partir do master, em quadro exato (as 7 primeiras iguais, o resto na última),
com `-avoid_negative_ts make_zero -muxdelay 0 -muxpreload 0`.

Confira sempre a soma dos quadros das partes contra `nb_frames` do master —
essa é a verificação que pega quadro perdido ou duplicado nas emendas. NÃO use
o `start_time` para isso: os 0.066s no vídeo e 0.045s no áudio que aparecem em
toda parte são o atraso de B-frames do próprio x264, não um erro de corte.
Isso foi diagnosticado errado uma vez — culpei o muxer `segment`, refiz tudo
encodando parte a parte, e o `start_time` continuou igual. São sub-quadro
(0.021s entre os dois streams, 0.6 de um quadro a 30fps) e não acumulam entre
arquivos.

Sobre o encode: ABR de um passe com teto, porque o tamanho tem que ser
previsível quando o limite é por arquivo. 2 passes foi tentado e não vale — o
passe 1 com `-f null` fecha com menos frames que o passe 2, o x264 descarta as
estatísticas e cai em QP constante, e ainda por cima duas partes passaram de
30 MB. O ganho de imagem vem do `preset slow` (uma entrega anterior estava em
`veryfast`), e aparece primeiro nas bordas do texto branco serifado sobre
preto.

## Ancoragem das cartelas — onde está o teto

`build/anchors.json` guarda, para cada cartela, o trecho exato da transcrição
onde a frase começa; `build/anchor-times.mjs` converte isso em `srcAt`
distribuindo os caracteres do parágrafo sobre o seu tempo de FALA (parágrafo
menos as pausas do silencedetect).

**O teto de precisão é ~2s e vem do dado de entrada, não do cálculo.** A
transcrição é por parágrafo e os timestamps estão arredondados no segundo.
Medindo cada início de parágrafo contra a pausa real mais próxima do áudio: erro
médio 1.88s, máximo 7.24s (o parágrafo que "começa" em 780 começa de fato em
787.24). Toda âncora herda o erro do parágrafo em que cai — por isso acertar uma
cartela pode desencaixar as vizinhas.

Dois caminhos foram tentados e **não** funcionam neste ambiente:

- **ASR palavra a palavra.** `hyperframes transcribe` baixa modelo do
  HuggingFace e o do whisper original vem do Azure; a política de rede devolve
  403 nos dois. Sem isso não há timestamp por palavra.
- **Alinhar as 236 frases às 327 pausas por programação dinâmica**, ignorando
  os timestamps da transcrição. Parece a solução certa e não é: validado contra
  6 cartelas já aprovadas pelo cliente, o alinhamento movia todas, de 16s a
  108s, com erro crescendo monotonicamente. Descartado.

Então o conserto de uma cartela fora do lugar é manual e pontual: o cliente diz
qual e para que lado, e a entrada em `anchors.json` vira um número fixo (como
`b-nasce-chamado` já é). Guarde as aprovações do cliente — foram elas que
pegaram o alinhamento global antes de ele ser entregue.

## Como reproduzir

```bash
cd video-claude-code/my-video
node build/generate.mjs      # regenera index.html + chunk-1..6.html
npm run check                # lint/runtime/layout/motion
FFMPEG_PROCESS_TIMEOUT_MS=3600000 HYPERFRAMES_EXTRACT_CACHE_DIR=off \
  npx hyperframes@0.8.20 render -c chunk-N.html -o renders/chunk-N.mp4 \
  --protocol-timeout 3600000 -w 3
```

`-w 3` é ~3x mais rápido que o padrão de 1 worker. Renderize um bloco por vez:
dois em paralelo estouram a memória do container.

Se os cortes mudarem — `KEEP_PAUSE` ou `DROP_RANGES` em `build/generate.mjs` —
refaça a base ANTES de renderizar:
`node build/make-select.mjs && bash build/encode-base.sh`.

`generate.mjs` falha o build em dois casos que antes passavam calados: cartela
ancorada em fala que caiu num `DROP_RANGE` (ela reapareceria colada na emenda,
citando frase que ninguém fala) e duas cartelas de tela cheia sobrepostas (a de
baixo fica escondida e parece atrasada).
