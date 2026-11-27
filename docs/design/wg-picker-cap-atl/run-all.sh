#!/usr/bin/env bash
# Runs every config in both modes; raw JSONL to docs/design/wg-picker-cap-atl/raw/. Offline, $0.
set -euo pipefail
cd "$(dirname "$0")/../../.."
D=docs/design/wg-picker-cap-atl
declare -A C=(
  [off]='{}'
  [A]='{"alliances":true}' [T]='{"portTransfer":true}' [L]='{"lifecycle":true}'
  [AL]='{"alliances":true,"lifecycle":true}' [AT]='{"alliances":true,"portTransfer":true}' [TL]='{"portTransfer":true,"lifecycle":true}'
  [ATL]='{"alliances":true,"portTransfer":true,"lifecycle":true}'
  [ATLS]='{"alliances":true,"portTransfer":true,"lifecycle":true,"secessionAftermath":true}'
)
for k in "${!C[@]}"; do
  node --experimental-strip-types $D/count.ts "$k" "${C[$k]}" > $D/raw/readonly-$k.jsonl &
  node --experimental-strip-types $D/count.ts "$k" "${C[$k]}" --stub > $D/raw/stub-$k.jsonl &
done
wait
