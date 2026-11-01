// Respec measurement (reads state only): earned grievance per docked previous-faction member, and provisions after upkeep / demand, first 60 ticks of each flag-on occupation.
import { runTick } from "../../src/sim/engine.ts";
import { startingGrievance } from "../../src/sim/secession.ts";
import { createPrototypeWorld } from "../../src/sim/scenario.ts";
const seeds = (process.argv[2] ?? "1847,2718,4096,1000,2000,3000,4000,5000,6000,7000,8000,9000,10000").split(",").map(Number);
const occOn = process.argv[3] !== "off";
const earnedAll: number[] = [], rawAll: number[] = [], occMeanEarned: number[] = [], ratio: number[] = [], rises: number[] = []; let occN = 0, lowOcc: Record<string, number> = {};
const ks = [0.5, 1, 2, 3];
for (const seed of seeds) {
  const w = createPrototypeWorld(seed); const open = new Map<string, { tick: number; earned: number[]; ratios: number[] }>();
  const done = (o: { earned: number[]; ratios: number[] }) => { occN++; if (o.earned.length) occMeanEarned.push(o.earned.reduce((a, b) => a + b, 0) / o.earned.length); for (const k of ks) if (o.ratios.some((r) => r < k)) lowOcc[k] = (lowOcc[k] ?? 0) + 1; };
  for (let i = 0; i < 1200; i++) {
    for (const e of runTick(w, { exileRecovery: true, occupation: occOn }).events) {
      if (e.type === "settlement-claimed" || e.type === "secession-declared") { const o = open.get(e.settlementId!); if (o) done(o); open.delete(e.settlementId!); }
      if (e.type === "settlement-claimed") { open.set(e.settlementId!, { tick: e.tick, earned: [], ratios: [] });
        const fromRate = e.data.previousFactionId ? null : null; void fromRate; }
    }
    for (const [port, o] of open) {
      if (w.tick - o.tick > 60) { done(o); open.delete(port); continue; }
      const s = w.settlements[port]; const from = s.occupation?.fromFactionId ?? null;
      ratio.push(s.stocks.provisions / (s.population / 3600)); o.ratios.push(s.stocks.provisions / (s.population / 3600));
      if (!from || !s.ownerId) continue;
      for (const c of Object.values(w.characters)) if (!c.dead && c.factionId === from && c.locationId === port && !c.travel) {
        const g = c.relationships[s.ownerId]?.grievance ?? 0; const earned = Math.max(0, g - startingGrievance(w.seed, c.id, s.ownerId)); earnedAll.push(earned); rawAll.push(g); o.earned.push(earned);
      }
    }
  }
  for (const o of open.values()) done(o);
}
const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))] * 1e4) / 1e4 : null; };
const d = (xs: number[]) => ({ n: xs.length, nonZero: xs.filter((x) => x > 0).length, p50: q(xs, .5), p75: q(xs, .75), p90: q(xs, .9), p95: q(xs, .95), p99: q(xs, .99), max: q(xs, 1) });
const pos = earnedAll.filter((x) => x > 0);
console.log(JSON.stringify({ occupations: occN, earnedPerMemberTick: d(earnedAll), earnedPositives: d(pos), rawGrievance: d(rawAll), occMeanEarned: d(occMeanEarned), occMeanEarnedPositives: d(occMeanEarned.filter((x) => x > 0)), provisionsOverDemandPerTick: d(ratio), shareTicksBelow: Object.fromEntries(ks.map((k) => [k, Math.round(ratio.filter((r) => r < k).length / ratio.length * 1e4) / 1e4])), occupationsWithAnyTickBelow: lowOcc }, null, 1));
