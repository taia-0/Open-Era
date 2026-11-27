#!/usr/bin/env bash
# All 32 subsets of {occupation, alliances, portTransfer, lifecycle, secessionAftermath} on main defaults
# (EXILE_RECOVERY on) into raw/subset-<letters>.jsonl. Letters: O occupation, A alliances, T portTransfer,
# L lifecycle, S secessionAftermath; "none" = (a). Offline, $0. 8 at a time.
set -euo pipefail
cd "$(dirname "$0")/../../.."
OUT=docs/design/defaults-on/raw; mkdir -p "$OUT"
M=docs/design/defaults-on/measure.ts
jobs=()
for i in $(seq 0 31); do
  L=""; J=""
  (( i & 1 )) && { L+=O; J+='"occupation":true,'; }
  (( i & 2 )) && { L+=A; J+='"alliances":true,'; }
  (( i & 4 )) && { L+=T; J+='"portTransfer":true,'; }
  (( i & 8 )) && { L+=L; J+='"lifecycle":true,'; }
  (( i & 16 )) && { L+=S; J+='"secessionAftermath":true,'; }
  [ -z "$L" ] && L=none
  node --experimental-strip-types "$M" "subset-$L" "{${J%,}}" > "$OUT/subset-$L.jsonl" &
  while [ "$(jobs -rp | wc -l)" -ge 8 ]; do sleep 1; done
done
wait
