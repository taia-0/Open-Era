#!/usr/bin/env bash
# Runs the matrix on a tree with fix.patch applied. Usage: run.sh <outdir>   (8 parallel workers, one seed per job)
set -e
OUT=${1:-docs/design/human-contracts/results}; mkdir -p "$OUT/parts"
SEEDS_ALL="1847 2718 4096 1000 2000 3000 4000 5000 6000 7000 8000 9000 10000"
ATLS='{"alliances":true,"portTransfer":true,"lifecycle":true,"secessionAftermath":true}'
jobs=()
for cfg in default atls; do
  for ord in last first; do for skip in strict relaxed; do
    for seed in $SEEDS_ALL; do
      jobs+=("$cfg $ord $skip $seed")
    done
  done; done
done
printf '%s\n' "${jobs[@]}" | xargs -P 8 -L 1 bash -c '
  cfg=$0; ord=$1; skip=$2; seed=$3
  opts="{}"; [ "$cfg" = atls ] && opts='"'$ATLS'"'
  OPEN_ERA_HUMAN_OFFER=$ord OPEN_ERA_HUMAN_SKIP=$skip SEEDS=$seed node --experimental-strip-types docs/design/human-contracts/measure.ts "$cfg-$ord-$skip" "$opts" > '"$OUT"'/parts/$cfg-$ord-$skip-$seed.jsonl
'
for cfg in default atls; do for ord in last first; do for skip in strict relaxed; do
  cat "$OUT"/parts/$cfg-$ord-$skip-*.jsonl > "$OUT/$cfg-$ord-$skip.jsonl"
done; done; done
