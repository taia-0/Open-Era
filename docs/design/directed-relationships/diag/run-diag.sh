#!/usr/bin/env bash
# DIAGNOSIS ONLY (directed-relationships.md §6): leave-one-writer-in for R-char via RELCHAR_ONLY in a scratch copy of
# relationships.ts (not in the patch), plus contract and home-claim counts and reader-2 list shapes. Offline, $0.
set -euo pipefail
cd "$(dirname "$0")/../../.."
D=docs/design/directed-relationships; OUT=$D/diag; mkdir -p $OUT
OFF='"occupation":false,"alliances":false,"portTransfer":false,"lifecycle":false,"secessionAftermath":false,"negotiatedTransfer":false'
ATLS='"occupation":false,"alliances":true,"portTransfer":true,"lifecycle":true,"secessionAftermath":true,"negotiatedTransfer":false'
NT='"occupation":false,"alliances":true,"portTransfer":true,"lifecycle":true,"secessionAftermath":true,"negotiatedTransfer":true'
r0='"relationships":false,"relationshipsChar":false'; r1='"relationships":true,"relationshipsChar":false'; r2='"relationships":true,"relationshipsChar":true'
{
echo "main||{$OFF,$r0}"; echo "R+Rc||{$OFF,$r2}"
for k in raid capture ransom; do echo "R+Rc-only-$k|$k|{$OFF,$r2}"; done
echo "ATLS||{$ATLS,$r0}"; echo "ATLS+R+Rc||{$ATLS,$r2}"
for k in raid capture ransom; do echo "ATLS+R+Rc-only-$k|$k|{$ATLS,$r2}"; done
echo "ATLS-NT+R||{$NT,$r1}"; echo "ATLS-NT+R+Rc||{$NT,$r2}"
} > $OUT/jobs.txt
xargs -d '\n' -P 5 -I{} bash -c 'IFS="|" read -r name only base <<< "$0"; RELCHAR_ONLY="$only" node --experimental-strip-types '"$D"'/measure.ts "$name" "$base" > '"$OUT"'/"$name".jsonl' {} < $OUT/jobs.txt
