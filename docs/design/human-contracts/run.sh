#!/usr/bin/env bash
# Rev 2 matrix. Runs on a tree with fix.patch AND variants.patch applied. Usage: run.sh <outdir>   (8 parallel workers, one seed per job)
# Arms (name:scenarios): last = the proposed rule; peer-walk / peer-argmax = the human ranked among NPC candidates by assessSupplyContract;
# last-noescrow = offered, escrow not held (isolates 'escrow locked'); last-noallow = derived buy-and-sail allowance forced to 0.
set -e
OUT=${1:-docs/design/human-contracts/results}; mkdir -p "$OUT/parts"
SEEDS_ALL="1847 2718 4096 1000 2000 3000 4000 5000 6000 7000 8000 9000 10000"
ATLS='{"alliances":true,"portTransfer":true,"lifecycle":true,"secessionAftermath":true}'
ARMS="last:idle,attentive,afirst,lazy peer-walk:idle,attentive peer-argmax:idle,attentive last-noescrow:idle,attentive last-noallow:afirst"
jobs=()
for cfg in default atls; do for arm in $ARMS; do for seed in $SEEDS_ALL; do jobs+=("$cfg ${arm%%:*} ${arm##*:} $seed"); done; done; done
printf '%s\n' "${jobs[@]}" | xargs -P 8 -L 1 bash -c '
  cfg=$0; arm=$1; scen=$2; seed=$3
  opts="{}"; [ "$cfg" = atls ] && opts='"'$ATLS'"'
  variant=last; esc=""; allow=""
  case $arm in peer-walk|peer-argmax) variant=$arm;; last-noescrow) esc=off;; last-noallow) allow=off;; esac
  OPEN_ERA_HC_VARIANT=$variant OPEN_ERA_HC_ESCROW=$esc OPEN_ERA_HC_ALLOWANCE=$allow SCENARIOS=$scen SEEDS=$seed \
    node --experimental-strip-types docs/design/human-contracts/measure.ts "$cfg-$arm" "$opts" > '"$OUT"'/parts/$cfg-$arm-$seed.jsonl
'
for cfg in default atls; do for arm in $ARMS; do a=${arm%%:*}; cat "$OUT"/parts/$cfg-$a-[0-9]*.jsonl > "$OUT/$cfg-$a.jsonl"; done; done
