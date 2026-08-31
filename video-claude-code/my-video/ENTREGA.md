# Entrega — VSL "Terapia com Alma" (Aula 1)

29m16s · 1920x1080 · 30fps · voz original do professor do início ao fim.

## Arquivos (em `renders/`, fora do git)

| Arquivo | Tamanho | Para quê |
|---|---|---|
| `VSL-final-1080p.mp4` | ~1,76 GB | Master. Qualidade quase sem perdas, guarde para reedições. |
| `web/VSL-FullHD-web.mp4` | 675 MB | **É esta que se publica.** Full HD, bitrate de web, `faststart`. |
| `chunk-1..6.mp4` | ~300 MB cada | Os 6 blocos do master, já juntados nos arquivos acima. |
| `720p/` | 453 MB | Corte anterior em 720p, mantido como histórico. |

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
`node build/make-filter.mjs && bash build/encode-base.sh`.
