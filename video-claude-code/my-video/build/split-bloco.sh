#!/usr/bin/env bash
# Um bloco renderizado -> 2 arquivos de entrega de <=30MB.
#
# Uso: bash build/split-bloco.sh <n>       (n = 1..6)
#
# Por que 2 e nao 8 partes do filme inteiro: o limite de 30MB e POR ARQUIVO.
# Espremer os 26min em 8 arquivos trava tudo em ~1.0 Mbps. Entregando bloco a
# bloco a conta e local -- 267s em 2 arquivos da ~1.7 Mbps, 70% a mais, e e
# nessa faixa que a borda do texto branco serifado sobre preto para de sujar.
#
# Cada metade e encodada separada a partir do bloco, cortada em quadro exato.
# ABR de um passe com teto porque o tamanho tem que ser previsivel quando o
# limite e por arquivo; a qualidade vem do preset slow.
#
# Nao confira o corte pelo start_time: os 0.066s/0.045s que aparecem em toda
# parte sao atraso de B-frames do x264, nao erro de emenda. A verificacao boa
# e somar os quadros das metades contra o nb_frames do bloco.
set -euo pipefail
cd "$(dirname "$0")/.."

N="${1:?uso: bash build/split-bloco.sh <n>}"
SRC="renders/chunk-$N.mp4"
OUT="/tmp/vsl-blocos"
mkdir -p "$OUT"
rm -f "$OUT/BLOCO-$N-parte-"*.mp4

FRAMES=$(ffprobe -v error -select_streams v:0 -show_entries stream=nb_frames -of csv=p=0 "$SRC")
FPS=30
HALF=$(( FRAMES / 2 ))                      # quadros na primeira metade
CUT=$(echo "scale=4; $HALF / $FPS" | bc)    # segundos, em borda de quadro

echo "bloco $N: $FRAMES quadros -> $HALF + $(( FRAMES - HALF )), emenda em ${CUT}s"

for p in 1 2; do
  if [ "$p" = 1 ]; then LEN=(-t "$CUT"); SS=0; else LEN=(); SS="$CUT"; fi
  ffmpeg -y -v error -ss "$SS" -i "$SRC" "${LEN[@]}" \
    -c:v libx264 -preset slow -b:v 1500k -maxrate 1700k -bufsize 3400k \
    -g 60 -pix_fmt yuv420p \
    -c:a aac -b:a 96k \
    -avoid_negative_ts make_zero -muxdelay 0 -muxpreload 0 \
    -movflags +faststart "$OUT/BLOCO-$N-parte-$p.mp4"
done

total=0
for p in 1 2; do
  f="$OUT/BLOCO-$N-parte-$p.mp4"
  sz=$(stat -c %s "$f")
  nf=$(ffprobe -v error -select_streams v:0 -show_entries stream=nb_frames -of csv=p=0 "$f")
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")
  br=$(ffprobe -v error -show_entries format=bit_rate -of csv=p=0 "$f")
  total=$(( total + nf ))
  printf "  parte %s  %6.2f MB  %s quadros  %ss  %s bps\n" \
    "$p" "$(echo "$sz/1048576" | bc -l)" "$nf" "$d" "$br"
  [ "$sz" -lt 31457280 ] || { echo "ERRO: parte $p passou de 30MB"; exit 1; }
done
[ "$total" = "$FRAMES" ] || { echo "ERRO: quadros $total != $FRAMES do bloco"; exit 1; }
echo "  quadros conferem: $total = $FRAMES"
