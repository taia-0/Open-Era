// Respec measurement: provisions left after upkeep (event data.stocks.provisions) / demand, on occupied ports' first 60 ticks, flag on, exile on.
import { runTick } from "../../src/sim/engine.ts";
import { createPrototypeWorld } from "../../src/sim/scenario.ts";
const seeds = "1847,2718,4096,1000,2000,3000,4000,5000,6000,7000,8000,9000,10000".split(",").map(Number);
const all: number[] = []; const byPort: Record<string, number[]> = {}; const occAnyLow: Record<string, number> = {}; const occShare: Record<string, number[]> = {}; let occN = 0;
const ks = [0.25, 0.5, 1, 2];
for (const seed of seeds) {
  const w = createPrototypeWorld(seed); const open = new Map<string, { tick: number; r: number[] }>();
  const done = (o: { r: number[] }) => { occN++; for (const k of ks) { const low = o.r.filter((x) => x < k).length; if (low) occAnyLow[k] = (occAnyLow[k] ?? 0) + 1; (occShare[k] ??= []).push(o.r.length ? low / o.r.length : 0); } };
  for (let i = 0; i < 1200; i++) for (const e of runTick(w, { exileRecovery: true, occupation: true }).events) {
    const p = e.settlementId!;
    if (e.type === "settlement-claimed" || e.type === "secession-declared") { const o = open.get(p); if (o) done(o); open.delete(p); }
    if (e.type === "settlement-claimed") open.set(p, { tick: e.tick, r: [] });
    if ((e.type === "settlement-upkeep" || e.type === "settlement-shortage") && open.has(p)) {
      const o = open.get(p)!; if (e.tick - o.tick > 60) { done(o); open.delete(p); continue; }
      const r = (e.data.stocks as { provisions: number }).provisions / Number(e.data.demand); all.push(r); o.r.push(r); (byPort[p] ??= []).push(r);
    }
  }
  for (const o of open.values()) done(o);
}
const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))] * 1e4) / 1e4 : null; };
const d = (xs: number[]) => ({ n: xs.length, p10: q(xs, .1), p25: q(xs, .25), p50: q(xs, .5), p75: q(xs, .75), p90: q(xs, .9), max: q(xs, 1) });
console.log(JSON.stringify({ occupations: occN, all: d(all), byPort: Object.fromEntries(Object.entries(byPort).map(([k, v]) => [k, d(v)])), shareUpkeepsBelow: Object.fromEntries(ks.map((k) => [k, Math.round(all.filter((x) => x < k).length / all.length * 1e4) / 1e4])), occupationsAnyUpkeepBelow: occAnyLow, perOccShareBelow: Object.fromEntries(ks.map((k) => [k, d(occShare[k])])) }, null, 1));
