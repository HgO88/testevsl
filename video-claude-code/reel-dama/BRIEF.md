---
workflow: general-video
flow: automation
storyboard: no
message: "Dizer não para o outro é dizer sim para você mesma."
destination: Reel / Instagram (in-feed)
aspect: portrait (1080x1920)
language: pt-BR
length: 64.2s (vídeo inteiro; os primeiros 20s foram aprovados como teste)
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
- Teste de 20s aprovado pelo cliente ("Dá teu show então") → vídeo inteiro de
  64.2s no mesmo estilo. Palavra-chave fica no ar no mínimo 0.55s
  (`MIN_HOLD`); as primeiras palavras da frase seguinte entram em cascata logo depois.
- CTA final: "comenta a palavra **DAMA**" com faixa rosa + punch-in, como destaque
  de CTA ("WHATSAPP" na referência).

## Revisão 1 — versão elegante (pedido do cliente)

"Acho que a gente deu uma exagerada" — a cliente final é detalhista e não curte
edição extravagante. Mudanças:

- Cores: só branco, vermelho e preto. Legenda branca; o vermelho aparece só como
  sublinhado fino que se desenha sob o "NÃO". Sem faixas coloridas, sem rosa.
- Tipografia: Montserrat nas palavras normais; Cormorant Garamond (o cliente
  disse "Comodoro" — interpretado como Cormorant) nos destaques.
- SFX bem mais baixos: só um sopro suave (whoosh 0.14) nos destaques e um grave
  curto (0.16) no NÃO. Sem o "tim" (ding), pop, tecla ou obturador.
- Animação: fades curtos com leve subida/desfoque; sem slam, tremida, punch-in
  ou jump zoom. Câmera só com aproximação lenta (1.00 → 1.03) por trecho.
- De volta ao teste de 20s (`node build/generate.mjs`; `DUR=64.2` para o inteiro).

## Revisão 2 — nova referência ("Keyframe", CapCut)

Cliente achou que dava para melhorar, escolheu "legenda mais refinada" e mandou
uma 2ª referência. Estilo extraído e aplicado (versão 3, `build/generate.mjs`;
a v2 ficou em `build/generate-v2.mjs`):

- Legenda corrida pequena: Montserrat 600, 46px, minúscula, 2–3 palavras por
  vez, fade curto, na altura da blusa.
- Poucos destaques ("lockups"): palavra grande em caligrafia (Pinyon Script,
  marfim) com palavras pequenas encaixadas acima/abaixo, como "Como usar /
  Keyframe / para fazer". Nos 20s: título "para você que / diz sim / quando quer
  dizer não", "morrendo de / raiva" e "você / não conseguiu".
- Caligrafia entra "escrita" da esquerda para a direita; vermelho só num fio
  fino sob o último destaque. SFX: só um sopro a 0.12 em cada destaque.
- O título de abertura é texto proposto (resume a fala), não dito por ela.

## Revisão 3 — mais destaques (v4)

"Tu colocou uma legenda... tem que ser uma coisa mais enfeitada, porém simples.
Usa mais palavras destacadas." Agora toda frase é um lockup: palavras pequenas
(Montserrat 600, palavra a palavra no tempo da fala) + palavra-chave em
caligrafia (Pinyon Script, marfim, "escrita" da esquerda para a direita em
0.25–0.5s). Fio vermelho só sob os dois "não". Sopro a 0.09 em cada caligrafia.
O título de abertura proposto na v3 saiu (as frases dela já abrem o vídeo).
A v3 fica em `build/generate-v3.mjs`.
