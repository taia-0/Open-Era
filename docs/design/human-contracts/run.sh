#!/usr/bin/env bash
# Rev 3 matrix. Runs on a tree with fix.patch applied (no variants.patch: the peer and no-escrow arms were rev 2).
# Usage: run.sh <outdir>   (8 parallel workers, one seed per job)
set -e
OUT=${1:-docs/design/human-contracts/results/rev3}; mkdir -p "$OUT/parts"
SEEDS_ALL="1847 2718 4096 1000 2000 3000 4000 5000 6000 7000 8000 9000 10000"
ATLS='{"alliances":true,"portTransfer":true,"lifecycle":true,"secessionAftermath":true}'
jobs=()
for cfg in default atls; do for seed in $SEEDS_ALL; do jobs+=("$cfg $seed"); done; done
printf '%s\n' "${jobs[@]}" | xargs -P 8 -L 1 bash -c '
  cfg=$0; seed=$1
  opts="{}"; [ "$cfg" = atls ] && opts='"'$ATLS'"'
  SCENARIOS=idle,attentive,late,afirst,lazy SEEDS=$seed node --experimental-strip-types docs/design/human-contracts/measure.ts "$cfg-last" "$opts" > '"$OUT"'/parts/$cfg-last-$seed.jsonl
'
for cfg in default atls; do cat "$OUT"/parts/$cfg-last-[0-9]*.jsonl > "$OUT/$cfg-last.jsonl"; done
