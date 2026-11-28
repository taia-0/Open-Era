#!/usr/bin/env bash
# directed-relationships.md runs (rev 2; rev 1 outputs kept in rev1/): 13 seeds × 1,200 ticks, offline, $0. Every flag explicit.
# Run on a tree with fix.patch + negotiated-transfer.patch + relationships-nt.patch applied to src (not committed).
# NT off is byte-identical (negotiated-transfer.md §5), so the non-NT sets equal a fix.patch + relationships.patch tree (checked in pins-crosscheck).
set -euo pipefail
cd "$(dirname "$0")/../../.."
D=docs/design/directed-relationships; OUT=$D/raw; P=$D/props-out; mkdir -p "$OUT" "$P"
OFF='"occupation":false,"alliances":false,"portTransfer":false,"lifecycle":false,"secessionAftermath":false,"negotiatedTransfer":false'
ATLS='"occupation":false,"alliances":true,"portTransfer":true,"lifecycle":true,"secessionAftermath":true,"negotiatedTransfer":false'
OCC='"occupation":true,"alliances":true,"portTransfer":true,"lifecycle":true,"secessionAftermath":true,"negotiatedTransfer":false'
NT='"occupation":false,"alliances":true,"portTransfer":true,"lifecycle":true,"secessionAftermath":true,"negotiatedTransfer":true'
r0='"relationships":false,"relationshipsChar":false'; r1='"relationships":true,"relationshipsChar":false'; r2='"relationships":true,"relationshipsChar":true'
declare -A C=(
  [main]="{$OFF,$r0}" [R]="{$OFF,$r1}" [R+Rc]="{$OFF,$r2}"
  [main-exile-off]="{$OFF,$r0,\"exileRecovery\":false}" [R-exile-off]="{$OFF,$r1,\"exileRecovery\":false}" [R+Rc-exile-off]="{$OFF,$r2,\"exileRecovery\":false}"
  [ATLS]="{$ATLS,$r0}" [ATLS+R]="{$ATLS,$r1}" [ATLS+R+Rc]="{$ATLS,$r2}"
  [ATLS-exile-off]="{$ATLS,$r0,\"exileRecovery\":false}" [ATLS+R-exile-off]="{$ATLS,$r1,\"exileRecovery\":false}" [ATLS+R+Rc-exile-off]="{$ATLS,$r2,\"exileRecovery\":false}"
  [ATLS-NT]="{$NT,$r0}" [ATLS-NT+R]="{$NT,$r1}" [ATLS-NT+R+Rc]="{$NT,$r2}"
  [ATLS-occ]="{$OCC,$r0}" [ATLS-occ+R+Rc]="{$OCC,$r2}" [ATLS-occ-exile-off]="{$OCC,$r0,\"exileRecovery\":false}" [ATLS-occ+R+Rc-exile-off]="{$OCC,$r2,\"exileRecovery\":false}"
  [ATLS-NT-exile-off]="{$NT,$r0,\"exileRecovery\":false}" [ATLS-NT+R+Rc-exile-off]="{$NT,$r2,\"exileRecovery\":false}"
)
printf '%s\n' "${!C[@]}" | sort > $OUT/sets.txt
for k in "${!C[@]}"; do echo "$k ${C[$k]}"; done | sort > $OUT/sets-json.txt
printf '%s\n' "${!C[@]}" | xargs -P 8 -I{} bash -c 'node --experimental-strip-types '"$D"'/measure.ts "$0" "$(grep "^$0 " '"$OUT"'/sets-json.txt | cut -d" " -f2-)" > '"$OUT"'/"$0".jsonl' {}
