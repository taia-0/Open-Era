#!/usr/bin/env bash
# Flag-off pins (main, ATL, ATLS + fix; exile on and off) on both prototype trees, and ATLS + R / ATLS + R + R-char on the
# fix.patch + relationships.patch tree (to match the NT-stacked tree). 3 seeds, offline, $0. Prints one line per config.
# Usage: pins-crosscheck.sh <tree-label>
set -euo pipefail
cd "$(dirname "$0")/../../.."
D=docs/design/directed-relationships; OUT=$D/raw; mkdir -p $OUT; T=$1
declare -A C=(
  [main]='{}' [main-exile-off]='{"exileRecovery":false}'
  [ATL]='{"alliances":true,"portTransfer":true,"lifecycle":true}' [ATL-exile-off]='{"alliances":true,"portTransfer":true,"lifecycle":true,"exileRecovery":false}'
  [ATLS]='{"alliances":true,"portTransfer":true,"lifecycle":true,"secessionAftermath":true}' [ATLS-exile-off]='{"alliances":true,"portTransfer":true,"lifecycle":true,"secessionAftermath":true,"exileRecovery":false}'
  [ATLS+R]='{"alliances":true,"portTransfer":true,"lifecycle":true,"secessionAftermath":true,"relationships":true}'
  [ATLS+R+Rc]='{"alliances":true,"portTransfer":true,"lifecycle":true,"secessionAftermath":true,"relationships":true,"relationshipsChar":true}'
)
mkdir -p $OUT/pins-$T
for k in "${!C[@]}"; do echo "$k|${C[$k]}"; done | sort | xargs -d '\n' -P 4 -I{} bash -c 'IFS="|" read -r k j <<< "$0"; SEEDS=1847,2718,4096 node --experimental-strip-types docs/design/defaults-on/measure.ts "$k" "$j" > '"$OUT"'/pins-'"$T"'/"$k".jsonl' {}
python3 -c "
import json,glob,os
for f in sorted(glob.glob('$OUT/pins-$T/*.jsonl')):
    rows=[json.loads(x) for x in open(f)]
    print(os.path.basename(f)[:-6]+': '+'; '.join(f\"{r['seed']} {r['hash72']}/{r['hash1200']}\"+('' if r['replayExact'] else ' REPLAY-FAIL') for r in rows))
" | tee $OUT/pins-crosscheck-$T.txt
