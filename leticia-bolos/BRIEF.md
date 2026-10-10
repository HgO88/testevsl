---
workflow: general-video
flow: automation
storyboard: yes
message: "É hoje! Festival de Fatias da Letícia's Bolos na Praça do Engenho do Meio, às 14:30h."
destination: Reels / Stories / Status (Instagram, WhatsApp)
aspect: portrait (1080x1920)
language: pt-BR
length: ~14.2s (duração do áudio original)
angle: remix do anúncio original — mesmo áudio, mesma tipografia e textos, imagens novas
---

## Intent

Refazer o anúncio "É HOJE! Festival de Fatias" da Letícia's Bolos. Do vídeo
original aproveitamos **o áudio inteiro** (voz + batida) e **a tipografia e os
textos** ("É HOJE!", "Festival de Fatias", "Praça do Eng do meio", "Às
14:30h"). Todo o visual é trocado pelos clipes novos enviados pelo cliente,
com montagem no ritmo da batida e efeitos ("coloca alguns efeitos para ficar
muito legal").

## Fonte

- `media/original.mp4` — 14.19s, 720x1280, 30fps. Só o áudio é usado
  (`media/audio.m4a`, cópia do stream AAC).
- `media/clips/` — 19 clipes do cliente (WhatsApp, 720x1280, sem áudio).
- Batida medida por fluxo espectral: período 0.3093s (~97 BPM em meio-tempo),
  fase 0.09s. Cortes caem nessa grade.
- Transcrição automática indisponível (huggingface.co bloqueado); os tempos
  dos textos foram copiados do vídeo original, frame a frame.

## Customizations

- Tipografia replicada: Lilita One amarela com contorno escuro + contorno
  branco (títulos), Pangolin branca (letra de mão), Poppins 800 no selo
  amarelo do horário. Rabiscos (brilhos e seta) como no original.
- Textos entram letra a letra nos mesmos instantes do original.
- Efeitos: punch-in de impacto em cada corte, flash branco e whip em cortes
  escolhidos, tremida nas batidas fortes, selo de horário pulsando.
- Fechamento: "Letícia's Bolos" sobre a Letícia acenando na tenda (escolha
  do cliente).

## Assets

- Usados: WA0063, WA0070, WA0077, WA0076, WA0023, WA0067, WA0074, WA0073,
  WA0072, VID_20260829_171048 (convertido para `leticia-acenando.mp4`, sem
  metadado de rotação).
- Excluídos: WA0069 (já é um anúncio editado, com texto queimado) e WA0078
  (marca d'água @RAPHABLOS de outro perfil).

## Notes

- Cliente pediu ver um rascunho antes do vídeo final (`storyboard: yes`):
  enviar frames-chave para aprovação antes do render.
- GSAP vendorizado em `vendor/` (cdn.jsdelivr.net bloqueado pela rede);
  fontes em `assets/fonts/`.
