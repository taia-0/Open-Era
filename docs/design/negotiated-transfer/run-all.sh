#!/usr/bin/env bash
# negotiated-transfer.md runs: 13 seeds × 1,200 ticks, offline, $0. Needs fix.patch and patch.diff applied to src (not committed).
set -euo pipefail
cd "$(dirname "$0")/../../.."
D=docs/design/negotiated-transfer; OUT=$D/raw; P=$D/props-out; mkdir -p "$OUT" "$P"
ATLS='"occupation":false,"alliances":true,"portTransfer":true,"lifecycle":true,"secessionAftermath":true'
m() { node --experimental-strip-types $D/measure-nt.ts "$1" "$2" > "$OUT/$1.jsonl"; }
[ "${SKIP_BASE:-}" ] || m ATLS "{$ATLS,\"negotiatedTransfer\":false}" &
m ATLS-NT "{$ATLS,\"negotiatedTransfer\":true}" &
[ "${SKIP_BASE:-}" ] || m ATLS-exile-off "{$ATLS,\"exileRecovery\":false,\"negotiatedTransfer\":false}" &
m ATLS-NT-exile-off "{$ATLS,\"exileRecovery\":false,\"negotiatedTransfer\":true}" &
[ "${SKIP_BASE:-}" ] && { wait; } || true
# Pins: flag off, three seeds (defaults-on/measure.ts).
pin() { [ "${SKIP_BASE:-}" ] && return 0; SEEDS=1847,2718,4096 node --experimental-strip-types docs/design/defaults-on/measure.ts "$1" "$2" > "$OUT/pins-$1.jsonl"; }
pin main '{}' &
pin main-exile-off '{"exileRecovery":false}' &
pin ATL '{"alliances":true,"portTransfer":true,"lifecycle":true}' &
pin ATL-exile-off '{"alliances":true,"portTransfer":true,"lifecycle":true,"exileRecovery":false}' &
pin ATLS "{$ATLS}" &
pin ATLS-exile-off "{$ATLS,\"exileRecovery\":false}" &
pin S-alone '{"secessionAftermath":true}' &
pin S-alone-exile-off '{"secessionAftermath":true,"exileRecovery":false}' &
pin AS '{"alliances":true,"secessionAftermath":true}' &
wait
# Every existing checker with the new flag on in the base (and the same base exile off).
for base in ATLS-NT ATLS-NT-exile-off; do
  if [ $base = ATLS-NT ]; then B="{$ATLS,\"negotiatedTransfer\":true}"; else B="{$ATLS,\"exileRecovery\":false,\"negotiatedTransfer\":true}"; fi
  DEFAULTS_ON_BASE="$B" node --experimental-strip-types docs/design/protection-pact-fix/props-alliances.ts > "$P/alliances-$base.txt" 2>&1 &
  DEFAULTS_ON_BASE="$B" node --experimental-strip-types docs/design/defaults-on/props-secession-aftermath.ts > "$P/aftermath-$base.txt" 2>&1 &
  DEFAULTS_ON_BASE="$B" node --experimental-strip-types docs/design/defaults-on/props-lifecycle.ts > "$P/lifecycle-$base.txt" 2>&1 &
  DEFAULTS_ON_BASE="$B" node --experimental-strip-types docs/design/defaults-on/props-port-transfer.ts > "$P/port-transfer-$base.txt" 2>&1 &
done
wait
