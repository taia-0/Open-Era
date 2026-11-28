#!/usr/bin/env bash
# Scope sweep: one bisect.ts process per (config, seed), 8 in parallel.
# Usage (from a worktree root): bash docs/design/replay-divergence/scope.sh <outdir>
# Compares hashes every 100 ticks (EVERY=100), so a reported firstMiss is the
# first 100-tick checkpoint that differs, not the exact tick.
set -u
out=${1:?outdir}; mkdir -p "$out"
STD="1847 2718 4096 1000 2000 3000 4000 5000 6000 7000 8000 9000 10000"
EXT="11000 12000 13000 14000 15000 16000 17000 18000 19000 20000"
ATLS='{"alliances":true,"lifecycle":true,"portTransfer":true,"secessionAftermath":true}'
jobs=()
for s in $STD; do jobs+=("flagoff-t10000|{}|10000|$s"); done
for s in $STD; do jobs+=("atls-t5000|$ATLS|5000|$s"); done
for s in $EXT; do jobs+=("atls-ext-t5000|$ATLS|5000|$s"); done
for L in alliances lifecycle portTransfer secessionAftermath occupation; do
  for s in $STD; do jobs+=("$L-t5000|{\"$L\":true}|5000|$s"); done
done
export OUT="$out"
printf '%s\n' "${jobs[@]}" | xargs -d '\n' -P 8 -n 1 bash -c '
  IFS="|" read -r label opts ticks seed <<< "$1"
  DETAIL=0 EVERY=100 SEEDS=$seed TICKS=$ticks node --experimental-strip-types docs/design/replay-divergence/bisect.ts "$opts" 2>&1 | cut -c1-2000 | sed "s/^/$label /" >> "$OUT/$label.log"' _
