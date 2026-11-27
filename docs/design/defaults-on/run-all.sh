#!/usr/bin/env bash
# Runs every config of defaults-on.md into raw/<label>.jsonl (13 seeds × 1,200 ticks each). Offline, $0.
set -euo pipefail
cd "$(dirname "$0")/../../.."
OUT=docs/design/defaults-on/raw; mkdir -p "$OUT"
M=docs/design/defaults-on/measure.ts
run() { node --experimental-strip-types "$M" "$1" "$2" > "$OUT/$1.jsonl"; }
ALL='"occupation":true,"alliances":true,"portTransfer":true,"lifecycle":true,"secessionAftermath":true'
run a-main-defaults '{}' &
run b-all-five "{$ALL}" &
run a-exile-optout '{"exileRecovery":false}' &
run b-all-five-exile-optout "{$ALL,\"exileRecovery\":false}" &
for f in occupation alliances portTransfer lifecycle secessionAftermath; do
  run "only-$f" "{\"$f\":true}" &
  run "minus-$f" "{${ALL/\"$f\":true/\"$f\":false}}" &
done
wait
