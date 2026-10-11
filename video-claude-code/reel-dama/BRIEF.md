---
workflow: general-video
flow: automation
storyboard: no
message: "Dizer não para o outro é dizer sim para você mesma."
destination: Reel / Instagram (in-feed)
aspect: portrait (1080x1920)
language: pt-BR
length: teste de 19.5s (primeiros ~20s do bruto de 64s)
angle: talking-head vertical com legenda cinética no estilo do Reel de referência
---

## Intent

Aplicar ao vídeo bruto do cliente (talking-head vertical, 64s) o estilo completo
do Reel de referência enviado (CapCut, "Pediu, tomou!"): textos entrando na tela
junto com SFX, tipografia mista e transições. Pedido do cliente: "use todo o
estilo desse vídeo para a criação de um outro". Primeiro passo pedido: **só os
primeiros 20 segundos** (teste de estilo antes do vídeo inteiro).

## Fonte

- Bruto: `lv_0_20261011130851.mp4` (Drive do cliente, 1080x1920, 30fps, 64.2s) —
  fora do git. Trecho usado: 0–19.6s → `assets/bruto-20s.mp4` (corte natural:
  a fala fecha "...você não conseguiu." em 19.3s e há corte de cena em 19.5s).
- Transcrição palavra a palavra: `media/words-0-20s.json`, gerada localmente com
  sherpa-onnx + NVIDIA Parakeet TDT 0.6b v3 (modelo baixado de GitHub Releases;
  Hugging Face bloqueado pela rede). Script: `build/asr.py`.

## Customizations (estilo extraído da referência)

- Legenda em 2 níveis: linha pequena e fina com a fala (palavra a palavra, no
  tempo da fala) + palavra-chave GRANDE embaixo.
- Tipografia mista: caixa alta pesada (Montserrat 900), sans itálica gorda
  (Montserrat 900 italic) e serifa fina itálica de contraste (Playfair Display
  italic). Texto branco com sombra suave.
- Faixas de cor atrás da palavra-chave, como "kit aluna"/"NADA DE": sistema
  semântico — **SIM = faixa rosa**, **NÃO = faixa vermelha** (cores da referência;
  o cliente não escolheu outra paleta).
- Texto "escrevendo" letra a letra em serifa (como "Fim d…") para a fala citada
  "tá tudo bem, eu faço."
- SFX em cada entrada (kit próprio em `../sfx-kit`, já que o cliente não tem os
  arquivos): pop, whoosh, swish, ding, glitter, tecla, impacto, obturador.
- Transições: punch-in/zoom no corte e nas palavras de impacto, blur rápido no
  corte de cena.

## Notes

- Cliente dispensou as perguntas de revisão/modo/cor e pediu "primeiros 20
  segundos" — tratado como automation, sem storyboard, cores da referência.
