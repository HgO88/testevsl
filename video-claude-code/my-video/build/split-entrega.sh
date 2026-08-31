#!/usr/bin/env bash
# Master 1080p -> 8 partes de <=30MB (limite do canal de entrega).
#
# NAO use o muxer "segment" para isso. Ele deixa cada parte com timestamp de
# inicio proprio -- medido na v1: video comecando em 0.066s e audio em 0.045s,
# ou seja 66ms de deslocamento E 21ms de descasamento A/V DENTRO do arquivo.
# Colando 8 partes assim no CapCut, isso acumula e reaparece como atraso.
#
# Cada parte e encodada separada a partir do master, cortada em quadro exato
# (6588 quadros = 219.6s nas 7 primeiras, 6582 na ultima: 7*6588+6582 = 52698,
# o total do master) e com os dois streams comecando em zero.
#
# ABR de um passe com teto: o tamanho e previsivel, que e o que importa quando
# o limite e por arquivo. 2 passes foi tentado e nao vale -- o passe 1 com
# "-f null" fecha com menos frames que o passe 2, o x264 descarta as
# estatisticas e cai em QP constante. O ganho de imagem vem do preset slow
# (a entrega anterior estava em veryfast), e e nas bordas do texto branco
# serifado sobre preto que isso aparece primeiro.
set -euo pipefail
M=/home/user/testevsl/video-claude-code/my-video/renders/VSL-final-1080p.mp4
OUT=/tmp/vsl-fhd-v2
rm -rf "$OUT" && mkdir -p "$OUT"

PART=219.6   # 6588 quadros a 30fps
for i in 0 1 2 3 4 5 6 7; do
  n=$((i + 1))
  start=$(echo "$i * $PART" | bc)
  if [ "$i" -lt 7 ]; then LEN=(-t "$PART"); else LEN=(); fi
  echo "== parte $n (a partir de ${start}s) =="
  ffmpeg -y -v error -ss "$start" -i "$M" "${LEN[@]}" \
    -c:v libx264 -preset slow -b:v 880k -maxrate 1000k -bufsize 2000k \
    -g 60 -pix_fmt yuv420p \
    -c:a aac -b:a 96k \
    -avoid_negative_ts make_zero -muxdelay 0 -muxpreload 0 \
    -movflags +faststart "$OUT/VSL-$n-de-8.mp4"
done

cd "$OUT"
echo "== conferencia: tamanho / inicio dos streams / duracao =="
total=0
for n in 1 2 3 4 5 6 7 8; do
  f="VSL-$n-de-8.mp4"
  sz=$(stat -c %s "$f")
  vs=$(ffprobe -v error -select_streams v:0 -show_entries stream=start_time -of csv=p=0 "$f")
  as=$(ffprobe -v error -select_streams a:0 -show_entries stream=start_time -of csv=p=0 "$f")
  nf=$(ffprobe -v error -select_streams v:0 -show_entries stream=nb_frames -of csv=p=0 "$f")
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")
  total=$(echo "$total + $d" | bc)
  printf "parte %s  %6.2f MB  video@%s  audio@%s  %s quadros  %ss\n" "$n" "$(echo "$sz/1048576" | bc -l)" "$vs" "$as" "$nf" "$d"
done
echo "soma das duracoes: ${total}s  (master: 1756.62s)"
echo "maior arquivo: $(ls -l VSL-*-de-8.mp4 | awk '{print $5}' | sort -n | tail -1) bytes (teto: 30MB)"
