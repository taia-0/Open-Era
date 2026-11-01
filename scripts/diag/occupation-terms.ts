// Diagnosis only: per-term distributions of occupation harshness over every flag-on occupation's first
// 60 ticks, 13 seeds × 1,200 ticks, exile on. Raw inputs are recomputed from world state after each tick
// with the same rules as src/sim/occupation.ts; the terms are read from the upkeep events. Reads state only.
import { runTick } from "../../src/sim/engine.ts";
import { OCCUPATION_WEIGHTS } from "../../src/sim/occupation.ts";
import { startingGrievance } from "../../src/sim/secession.ts";
import { createPrototypeWorld } from "../../src/sim/scenario.ts";

const seeds = (process.argv[2] ?? "1847,2718,4096,1000,2000,3000,4000,5000,6000,7000,8000,9000,10000").split(",").map(Number);
type Acc = { taxRaw: number[]; breaches: number[]; docked: number[]; earned: number[]; tax: number[]; food: number[]; conduct: number[]; residents: number[]; h: number[] };
const occs: Array<{ seed: number; port: string; tick: number } & Acc> = [];
for (const seed of seeds) {
  const w = createPrototypeWorld(seed); const open = new Map<string, (typeof occs)[number]>();
  for (let i = 0; i < 1200; i++) {
    for (const e of runTick(w, { exileRecovery: true, occupation: true }).events) {
      if (e.type === "settlement-claimed" || e.type === "secession-declared" || e.type === "occupation-integrated") open.delete(e.settlementId!);
      if (e.type === "settlement-claimed") { const o = { seed, port: e.settlementId!, tick: e.tick, taxRaw: [], breaches: [], docked: [], earned: [], tax: [], food: [], conduct: [], residents: [], h: [] }; occs.push(o); open.set(e.settlementId!, o); }
      if ((e.type === "settlement-upkeep" || e.type === "settlement-shortage") && e.data.occupationTerms && open.has(e.settlementId!)) {
        const o = open.get(e.settlementId!)!; if (e.tick - o.tick > 60) continue;
        const t = e.data.occupationTerms as { tax: number; food: number; conduct: number; residents: number };
        o.tax.push(t.tax); o.food.push(t.food); o.conduct.push(t.conduct); o.residents.push(t.residents); o.h.push((e.data.occupation as { harshness: number }).harshness);
      }
    }
    for (const [port, o] of open) {
      if (w.tick - o.tick > 60) continue;
      const s = w.settlements[port]; const occ = s.occupation; if (!occ) continue;
      o.taxRaw.push((s.factionId ? w.factions[s.factionId]?.taxRate ?? 0 : 0) - occ.fromRate);
      o.breaches.push(Object.values(w.contracts ?? {}).filter((c) => c.status === "breached" && c.destinationId === port && (c.observedTick ?? -Infinity) > w.tick - 240).length);
      const docked = occ.fromFactionId ? Object.values(w.characters).filter((c) => !c.dead && c.factionId === occ.fromFactionId && c.locationId === port && !c.travel) : [];
      o.docked.push(docked.length);
      if (docked.length && s.ownerId) o.earned.push(docked.reduce((a, c) => a + Math.max(0, (c.relationships[s.ownerId!]?.grievance ?? 0) - startingGrievance(w.seed, c.id, s.ownerId!)), 0) / docked.length);
    }
  }
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const q = (xs: number[], p: number) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return Math.round(s[Math.min(s.length - 1, Math.floor(p * s.length))] * 1e4) / 1e4; };
const dist = (xs: number[]) => ({ median: q(xs, 0.5), p90: q(xs, 0.9), max: q(xs, 1), nonZeroShare: xs.length ? Math.round((xs.filter((x) => x > 0).length / xs.length) * 1e4) / 1e4 : null });
const per = (k: keyof Acc) => occs.map((o) => mean(o[k]));
const W = OCCUPATION_WEIGHTS;
const out = {
  occupations: occs.length, withUpkeeps: occs.filter((o) => o.h.length).length,
  raw: { taxRateMinusFromRate: dist(per("taxRaw")), breachesIn240: dist(per("breaches")), previousFactionDocked: dist(per("docked")), earnedGrievanceAtOwner: dist(occs.filter((o) => o.earned.length).map((o) => mean(o.earned))), taxSign: { negative: per("taxRaw").filter((x) => x < 0).length, zero: per("taxRaw").filter((x) => x === 0).length, positive: per("taxRaw").filter((x) => x > 0).length } },
  term: { tax: dist(per("tax")), food: dist(per("food")), conduct: dist(per("conduct")), residents: dist(per("residents")) },
  weighted: { tax: dist(per("tax").map((x) => W.tax * x)), food: dist(per("food").map((x) => W.food * x)), conduct: dist(per("conduct").map((x) => W.conduct * x)), residents: dist(per("residents").map((x) => W.residents * x)) },
  everNonZero: Object.fromEntries((["tax", "food", "conduct", "residents"] as const).map((k) => [k, Math.round((occs.filter((o) => o[k].some((x) => x > 0)).length / occs.length) * 1e4) / 1e4])),
  meanH: dist(per("h")), maxUpkeepH: q(occs.flatMap((o) => o.h), 1),
  ceilingWithoutFood: 1 - W.food,
};
console.log(JSON.stringify(out, null, 1));
