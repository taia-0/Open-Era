#!/usr/bin/env bash
# offices-docked-governor.md: every (tree, config, mode) run. Scratch trees are e7ec840 worktrees with patches applied:
#   base = hook; fix = hook + ../protection-pact-fix/fix.patch; docked = hook + docked.patch; fixdocked = all three.
# Each tree has this count.ts copied to docs/design/odg/. Output: raw/<tree>-<mode>-<config>.jsonl. Offline, $0.
set -euo pipefail
OUT="$(cd "$(dirname "$0")" && pwd)/raw"
OFF='{}'; ATL='{"alliances":true,"portTransfer":true,"lifecycle":true}'; ATLS='{"alliances":true,"portTransfer":true,"lifecycle":true,"secessionAftermath":true}'
jobs=()
for tree in base fix docked fixdocked; do
  for cfg in off ATL ATLS; do
    case $tree in fix|fixdocked) [ $cfg = off ] && continue;; esac
    for mode in readonly stub; do jobs+=("$tree $cfg $mode"); done
  done
done
printf '%s\n' "${jobs[@]}" | xargs -P "${PAR:-7}" -L1 bash -c '
  tree=$0 cfg=$1 mode=$2
  case $cfg in off) o='"'"$OFF"'"';; ATL) o='"'"$ATL"'"';; ATLS) o='"'"$ATLS"'"';; esac
  flag=""; [ $mode = stub ] && flag=--stub
  cd /workspace/odg-scratch-$tree && node --experimental-strip-types docs/design/odg/count.ts $cfg "$o" $flag > '"$OUT"'/$tree-$mode-$cfg.jsonl'
