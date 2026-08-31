# Entrega — VSL "Terapia com Alma" (Aula 1)

29m16s · 1920x1080 · 30fps · voz original do professor do início ao fim.

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

- **Cortes**: 327 pausas removidas do bruto — 33m32 → 29m16.
- **Abertura**: 6s com filtro de câmera (P&B + HUD de gravação), depois corta para cor.
- **~45 cartelas de texto** em tela preta, itálico serifado — frases ditas por ele.
- **7 cartelas de versículo** (Hb 2:18, Hb 4:15, Jo 10:10, 2Tm 2:24, Jo 15:5, 2Tm 2:15, Jo 6:44).
- **~28 aparições das 17 fotos** do cliente, ~1 por minuto.
- **2 cortes gráficos**: os 5 pilares e a comparação chamado × preparo.
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

## Cortar em partes: nunca com o muxer `segment`

O limite de 30 MB por arquivo do canal obriga a entregar em 8 partes, que o
cliente junta no CapCut. O jeito óbvio — `-f segment -segment_time N -c copy` —
**introduz atraso**: cada parte sai com timestamp de início próprio. Medido:
vídeo começando em 0.066s e áudio em 0.045s, ou seja 66ms de deslocamento e
21ms de descasamento A/V *dentro* do arquivo. Junte 8 assim e reaparece como
atraso, depois de todo o trabalho de sincronizar o master.

`build`/entrega encoda cada parte separada a partir do master, cortando em
quadro exato (6588 quadros nas 7 primeiras, 6582 na última — 7×6588+6582 =
52698, o total do master) com `-avoid_negative_ts make_zero -muxdelay 0
-muxpreload 0`. Confira sempre: `start_time` dos dois streams tem que ser
`0.000000` em toda parte.

Sobre o encode: ABR de um passe com teto, porque o tamanho tem que ser
previsível quando o limite é por arquivo. 2 passes foi tentado e não vale — o
passe 1 com `-f null` fecha com menos frames que o passe 2, o x264 descarta as
estatísticas e cai em QP constante, e ainda por cima duas partes passaram de
30 MB. O ganho de imagem vem do `preset slow` (a entrega anterior estava em
`veryfast`), e aparece primeiro nas bordas do texto branco serifado sobre
preto.

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

Se os cortes mudarem (`KEEP_PAUSE` em `build/generate.mjs`), refaça a base antes:
`node build/make-select.mjs && bash build/encode-base.sh`.
