---
workflow: general-video
flow: automation
storyboard: no
message: "Formar-se como terapeuta cristão não é sobre técnica, é sobre chamado + preparo + dependência de Deus + serviço — e você é chamado a cuidar de VIDAS, não de casos."
destination: VSL / página de vendas do curso "Terapia com Alma"
aspect: landscape (1920x1080)
language: pt-BR
audience: pessoas sentindo um chamado para cuidar de outras pessoas (terapeutas, psicólogos, pastores, líderes de igreja) avaliando se devem se inscrever na formação
length: ~33.5min (mantém o material bruto quase integral; dinamismo vem de b-roll, cortes ritmados e destaques, não de corte drástico de conteúdo)
angle: aula de abertura do curso, com o professor/pastor em talking-head horizontal
---

## Intent

Edição de um talking-head horizontal (33.5min, 1080p) — aula de abertura do curso
de formação de terapeuta cristão "Terapia com Alma". O objetivo é transformar o
material bruto num vídeo de vendas dinâmico, sem perder a voz e a mensagem
originais do professor.

## Fonte

- **Vídeo bruto:** `InShot_20260805_133820551.mp4` (H.264 1920x1080, AAC 44.1kHz
  estéreo, 2012.1s ≈ 33min32s) — fora do git, mantido em
  `video-claude-code/my-video/`.
- **Transcrição:** `media/transcript.json` (44 segmentos com timestamp,
  importada de um PDF de transcrição fornecido pelo cliente via
  `hyperframes transcribe`). Timestamps em nível de parágrafo/frase (não
  palavra-a-palavra) — suficiente para localizar os beats e ancorar cortes,
  mas o encaixe fino de cada palavra-chave é feito manualmente na composição.

## Correção de rota (importante)

O briefing original trazia 5 beats sobre "Claude Code" / "MCP da Kairogen" que
**não existem na fala deste vídeo** — eram de outro contexto. Confirmado com o
cliente: o vídeo bruto está correto (aula de terapeuta cristão), e os 5 beats
foram **substituídos por trechos reais da fala**, aprovados pelo cliente:

1. **00:05:23** — "5 pilares" (chamado, transformação, dependência, preparo,
   serviço) → mini montagem listando os 5, um a um, em cortes rápidos.
2. **00:17:29** — "não trabalha com problemas, trabalha com **PESSOAS**" →
   destaque em "PESSOAS".
3. **00:17:59** — "você não atende casos, você atende **VIDAS**" → destaque em
   "VIDAS", visual de acolhimento.
4. **00:24:50** — "**CHAMADO** sem **PREPARO** gera insegurança. **PREPARO**
   sem **CHAMADO** gera só bom profissional" → destaque nas duas palavras,
   gráfico de balança/comparação.
5. **00:32:22** — "Você é **CUIDADOR DE VIDA**" → fechamento, destaque na
   frase, visual de mãos estendidas/acolhimento.

## Customizations

- **Formato:** saída 1920x1080 (16:9), MP4 final.
- **Pacing:** edição dinâmica, cortes limpos e ritmados ao longo de todo o
  material (não só nos 5 beats) — remover pausas/repetições/hesitações do
  talking-head, mantendo o sentido de cada trecho.
- **Áudio:** a voz original do professor é a trilha principal do início ao
  fim, sem cortes na inteligibilidade da fala.
- **Legendas:** só palavras-chave em destaque (cor de marca + leve scale),
  fonte grande e legível, faixa inferior central, sem cobrir o rosto — nunca
  legenda verbatim contínua.
- **B-roll:** **motion design nativo (HTML+CSS+SVG+GSAP)**, sem fotos/imagens
  geradas — decisão tomada com o cliente depois que os 3 caminhos de mídia
  externa se mostraram bloqueados pela rede deste ambiente (ver Notes).
  Tipografia grande, ícones desenhados em SVG, listas/contadores animados,
  formas geométricas com movimento sutil (não estático) para contextualizar
  cada beat.
- **Design:** paleta e tipografia a definir na etapa de composição (preset
  sóbrio/acolhedor, compatível com conteúdo de fé — evitar tom corporativo
  frio).

## Assets

- Vídeo de referência de estilo enviado pelo cliente (WhatsApp, mp4 menor) —
  ritmo/energia de edição a espelhar.
- Vídeo bruto de 3.58GB (Google Drive, InShot) — baixado e validado.
- Transcrição em PDF (fornecida pelo cliente) — convertida em SRT/JSON.

## Notes

- `flow: automation` e `storyboard: no` — sinalizados pelo próprio pedido do
  cliente ("rode o preview e o check, corrija os erros e só então renderize o
  MP4 final"), sem pedido de revisão por etapas.
- Transcrição automática via whisper.cpp falhou (download do modelo bloqueado
  por política de rede — `huggingface.co` inacessível). Contornado com a
  transcrição em PDF fornecida pelo cliente.
- B-roll fotográfico/gerado por IA não foi possível: Kairogen MCP
  desconectado (não reconectou), e os dois fallbacks também bloqueados pela
  política de rede — `huggingface.co`/mirrors para modelos locais, e o
  domínio `heygen.com` inteiro (catálogo de fotos do `/media-use`). Decisão
  confirmada com o cliente: seguir com motion design nativo em vez de
  esperar/depender de mídia externa.
- Mídia bruta e renders ficam fora do git (`.gitignore` na raiz do repo) —
  só o código da composição é versionado.
