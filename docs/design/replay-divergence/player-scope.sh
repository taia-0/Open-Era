#!/usr/bin/env bash
# Player-command scope: player-bisect.ts (npc-threads attentive script, hook off)
# on 13 seeds x {default, ATLS} x 1,200 ticks, 8 in parallel.
# Usage (from a worktree root): bash docs/design/replay-divergence/player-scope.sh <outdir>
set -u
out=${1:?outdir}; mkdir -p "$out"; export OUT="$out"
STD="1847 2718 4096 1000 2000 3000 4000 5000 6000 7000 8000 9000 10000"
ATLS='{"alliances":true,"lifecycle":true,"portTransfer":true,"secessionAftermath":true}'
jobs=()
for s in $STD; do jobs+=("player-default|{}|$s"); jobs+=("player-atls|$ATLS|$s"); done
printf '%s\n' "${jobs[@]}" | xargs -d '\n' -P 8 -n 1 bash -c '
  IFS="|" read -r label opts seed <<< "$1"
  SEEDS=$seed TICKS=1200 node --experimental-strip-types docs/design/replay-divergence/player-bisect.ts "$opts" 2>&1 | cut -c1-2000 | sed "s/^/$label /" >> "$OUT/$label.log"' _
