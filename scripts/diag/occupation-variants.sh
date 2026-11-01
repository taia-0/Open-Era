#!/usr/bin/env bash
# Diagnosis only (occupation diagnosis, 2026-11-01): build patched copies of src/ under $1 with one
# occupation sub-mechanism disabled each. The repository's src/ is never modified.
set -euo pipefail
root="${1:-/tmp/occ-variants}"; rm -rf "$root"; mkdir -p "$root"
mk() { local name="$1"; shift; mkdir -p "$root/$name"; cp -r src "$root/$name/src"; for s in "$@"; do eval "$s"; done; }
O='src/sim/occupation.ts'; E='src/sim/engine.ts'
mk full
mk noRecruitStop "sed -i 's/^export const OCCUPATION_REGROWTH_STOP = 0.5;/export const OCCUPATION_REGROWTH_STOP = 2;/' $root/noRecruitStop/$O"
mk noDrift "sed -i 's/^export const OCCUPATION_DRIFT = 0.10;/export const OCCUPATION_DRIFT = 0;/' $root/noDrift/$O"
mk noDefection "sed -i 's/  return Math.floor((settlement.garrison \* occupation.harshness) \/ 2);/  return 0 * Math.floor((settlement.garrison * occupation.harshness) \/ 2);/' $root/noDefection/$O"
mk noEffects "sed -i 's/^export const OCCUPATION_REGROWTH_STOP = 0.5;/export const OCCUPATION_REGROWTH_STOP = 2;/; s/^export const OCCUPATION_DRIFT = 0.10;/export const OCCUPATION_DRIFT = 0;/; s/  return Math.floor((settlement.garrison \* occupation.harshness) \/ 2);/  return 0;/' $root/noEffects/$O"
mk driftOnly "sed -i 's/^export const OCCUPATION_REGROWTH_STOP = 0.5;/export const OCCUPATION_REGROWTH_STOP = 2;/; s/  return Math.floor((settlement.garrison \* occupation.harshness) \/ 2);/  return 0;/' $root/driftOnly/$O"
mk defectionOnly "sed -i 's/^export const OCCUPATION_REGROWTH_STOP = 0.5;/export const OCCUPATION_REGROWTH_STOP = 2;/; s/^export const OCCUPATION_DRIFT = 0.10;/export const OCCUPATION_DRIFT = 0;/' $root/defectionOnly/$O"
# Perturbation controls: the same channel at 1/100 strength, and twice the strength.
mk tinyDrift "sed -i 's/^export const OCCUPATION_DRIFT = 0.10;/export const OCCUPATION_DRIFT = 0.001;/; s/^export const OCCUPATION_REGROWTH_STOP = 0.5;/export const OCCUPATION_REGROWTH_STOP = 2;/; s/  return Math.floor((settlement.garrison \* occupation.harshness) \/ 2);/  return 0;/' $root/tinyDrift/$O"
mk doubleDrift "sed -i 's/^export const OCCUPATION_DRIFT = 0.10;/export const OCCUPATION_DRIFT = 0.20;/; s/^export const OCCUPATION_REGROWTH_STOP = 0.5;/export const OCCUPATION_REGROWTH_STOP = 2;/; s/  return Math.floor((settlement.garrison \* occupation.harshness) \/ 2);/  return 0;/' $root/doubleDrift/$O"
# Forecast fix: the starting forecast reads the post-defection garrison.
mk forecastFix "python3 - '$root/forecastFix/$E' <<'PY'
import sys; p=sys.argv[1]; s=open(p).read()
a='    startingForecast: combatForecast(world, character.id, settlement.id, { observedLocally: true }),'
assert s.count(a)==1
s=s.replace(a,'    startingForecast: (() => { if (defectors > 0) actual.garrison -= defectors; try { return combatForecast(world, character.id, settlement.id, { observedLocally: true }); } finally { if (defectors > 0) actual.garrison += defectors; } })(),')
open(p,'w').write(s)
PY"
# No new event fields with all effects off: isolates the record/event payload itself.
mk noEffectsNoFields "cp $root/noEffects/$O $root/noEffectsNoFields/$O; python3 - '$root/noEffectsNoFields/$E' <<'PY'
import sys; p=sys.argv[1]; s=open(p).read()
a='data: { battle, ...(occupationOn ? { attackerFactionId: character.factionId } : {}), ...(defectors > 0 ? { occupationDefectors: defectors } : {}) },'
assert s.count(a)==1; s=s.replace(a,'data: { battle },')
open(p,'w').write(s)
PY"
for d in "$root"/*/; do grep -c "" "$d/src/sim/occupation.ts" >/dev/null; done
echo "$root"
