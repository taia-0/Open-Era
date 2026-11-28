#!/usr/bin/env bash
# Every existing checker with R / R + R-char in the base (DEFAULTS_ON_BASE), same tree as run-all.sh. Offline, $0.
set -uo pipefail
cd "$(dirname "$0")/../../.."
D=docs/design/directed-relationships; P=$D/props-out; mkdir -p "$P"
ATLS='"occupation":false,"alliances":true,"portTransfer":true,"lifecycle":true,"secessionAftermath":true'
jobs=()
for nt in false true; do for ex in on off; do for r in R R+Rc; do
  [ $nt = true ] && [ $r = R ] && [ $ex = off ] && continue
  rf='"relationships":true,"relationshipsChar":false'; [ $r = R+Rc ] && rf='"relationships":true,"relationshipsChar":true'
  e=''; [ $ex = off ] && e=',"exileRecovery":false'
  name="ATLS$([ $nt = true ] && echo -NT)+$r$([ $ex = off ] && echo -exile-off)"
  B="{$ATLS,\"negotiatedTransfer\":$nt,$rf$e}"
  jobs+=("protection-pact-fix/props-alliances.ts|alliances|$name|$B" "defaults-on/props-secession-aftermath.ts|aftermath|$name|$B" "defaults-on/props-lifecycle.ts|lifecycle|$name|$B" "defaults-on/props-port-transfer.ts|port-transfer|$name|$B")
  if [ $nt = true ]; then jobs+=("NTMEASURE|nt|$name|$B"); fi
done; done; done
printf '%s\n' "${jobs[@]}" | xargs -d '\n' -P 8 -I{} bash -c '
  IFS="|" read -r script kind name base <<< "$0"
  if [ "$script" = NTMEASURE ]; then node --experimental-strip-types docs/design/negotiated-transfer/measure-nt.ts "$name" "$base" > '"$P"'/nt-$name.jsonl 2>&1
  else DEFAULTS_ON_BASE="$base" node --experimental-strip-types docs/design/$script > '"$P"'/$kind-$name.txt 2>&1; echo "exit=$?" >> '"$P"'/$kind-$name.txt; fi' {}
