// Compares results/sight-<a>-<cfg>.jsonl with sight-<b>-<cfg>.jsonl. No sim runs.
// Usage: node --experimental-strip-types docs/design/engine-hygiene/sight-compare.ts base win72
import { readFileSync } from "node:fs";
const [a, b] = process.argv.slice(2);
const load = (l: string, c: string): any[] => readFileSync(new URL(`./results/sight-${l}-${c}.jsonl`, import.meta.url), "utf8").trim().split("\n").map((x) => JSON.parse(x));
const q = (xs: number[], p: number) => { const s = [...xs].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
const sum = (xs: number[]) => xs.reduce((x, y) => x + y, 0);
for (const cfg of ["flag-off", "atls"]) {
  const A = load(a, cfg), B = load(b, cfg);
  const cols = ["claims", "portChanges", "battles", "captures", "secessions"] as const;
  const same = A.every((r, i) => r.eventDigest === B[i].eventDigest && r.h72 === B[i].h72 && r.h1200 === B[i].h1200 && r.events === B[i].events);
  console.log(`## ${cfg}: ${a} vs ${b}, 13 seeds x 1,200 ticks`);
  console.log(`sim stream identical (event digest incl. sequence, h72, h1200, event count) in ${A.filter((r, i) => r.eventDigest === B[i].eventDigest && r.h72 === B[i].h72 && r.h1200 === B[i].h1200).length}/${A.length} seeds`);
  console.log(`totals ${a}: ` + cols.map((c) => `${c} ${sum(A.map((r) => r[c]))}`).join(", ") + `; wipeouts ${A.flatMap((r) => r.wipeouts).length}; secession seeds ${A.filter((r) => r.secessions > 0).length}/13; min claims ${Math.min(...A.map((r) => r.claims))}, min port changes ${Math.min(...A.map((r) => r.portChanges))}`);
  console.log(`totals ${b}: ` + cols.map((c) => `${c} ${sum(B.map((r) => r[c]))}`).join(", ") + `; wipeouts ${B.flatMap((r) => r.wipeouts).length}; secession seeds ${B.filter((r) => r.secessions > 0).length}/13; min claims ${Math.min(...B.map((r) => r.claims))}, min port changes ${Math.min(...B.map((r) => r.portChanges))}`);
  console.log(`script (explore orders accepted/failed, confirms): ${sum(A.map((r) => r.script.explore))}/${sum(A.map((r) => r.script.exploreFail))}, ${sum(A.map((r) => r.script.confirm))}; sightings held at t1200 per seed: ${Math.min(...A.map((r) => r.sightingsHeld))}–${Math.max(...A.map((r) => r.sightingsHeld))}`);
  let n = 0, withSight = 0, withStale = 0, changedWin = 0, changedDef = 0, factorsChanged = 0;
  const dWinLow: number[] = [], dDef: number[] = [], dWinAbs: number[] = [];
  let flipOutlook = 0, firstStaleTick = Infinity;
  const outlook = (c: number) => (c >= 72 ? 4 : c >= 58 ? 3 : c >= 43 ? 2 : c >= 28 ? 1 : 0);
  for (let i = 0; i < A.length; i++) for (let j = 0; j < A[i].forecasts.length; j++) {
    const x = A[i].forecasts[j], y = B[i].forecasts[j];
    if (x[0] !== y[0] || x[1] !== y[1]) throw new Error("forecast rows misaligned");
    n++; if (x[6] > 0) withSight++; if (x[7] > 0) { withStale++; firstStaleTick = Math.min(firstStaleTick, x[0]); }
    if (x[2] !== y[2] || x[3] !== y[3]) { changedWin++; dWinLow.push(y[2] - x[2]); dWinAbs.push(Math.abs(y[2] - x[2])); }
    if (x[4] !== y[4] || x[5] !== y[5]) { changedDef++; dDef.push(y[4] - x[4]); }
    if (x[8] !== y[8]) factorsChanged++;
    if (outlook(x[2]) !== outlook(y[2])) flipOutlook++;
  }
  console.log(`forecasts read (every 12 ticks, every other port): ${n}; with any stored sighting at that port ${withSight}; with a sighting older than 72 ${withStale} (first at t${firstStaleTick})`);
  console.log(`forecasts changed by the window: win chance ${changedWin}, defender power ${changedDef}, revealed-factor count ${factorsChanged}, headline outlook band ${flipOutlook}`);
  if (dWinLow.length) console.log(`win chance low, windowed minus base (points): min ${Math.min(...dWinLow).toFixed(1)}, median ${q(dWinLow, .5).toFixed(1)}, p90 ${q(dWinLow, .9).toFixed(1)}, max ${Math.max(...dWinLow).toFixed(1)}; mean |d| ${(sum(dWinAbs) / dWinAbs.length).toFixed(1)}; defender power low d: median ${q(dDef, .5).toFixed(1)}, min ${Math.min(...dDef).toFixed(1)}`);
  console.log(same ? "ALL SEEDS: sim identical" : "SIM DIFFERS");
}
