// Along the fixed trajectory, per tick and per eligible secession (age ≥ 67, holds its port, no protection yet,
// in no pact, own surplus ≥ 0): would the pre-fix rule have formed protection, and which fixed rule stops it?
// Counts evaluations (faction-ticks), not pacts. Offline, no AI.
//   node --experimental-strip-types docs/design/protection-pact-fix/blocked-tally.ts '<TickOptions JSON>'
import { runTick } from "../../../src/sim/engine.ts";
import { createPrototypeWorld } from "../../../src/sim/scenario.ts";
import { alliancesOf } from "../../../src/sim/alliances.ts";
import { AFTERMATH_WINDOW, factionSurplus, pactBlocked, patronCandidates, threatTo } from "../../../src/sim/secession-aftermath.ts";
const opts = JSON.parse(process.argv[2] ?? "{}");
const seeds = [1847, 2718, 4096, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000];
const tally: Record<string, number> = {}; const seedsHit: Record<string, Set<number>> = {};
const hit = (k: string, s: number) => { tally[k] = (tally[k] ?? 0) + 1; (seedsHit[k] ??= new Set()).add(s); };
for (const seed of seeds) {
  const w = createPrototypeWorld(seed);
  for (let i = 0; i < 1200; i++) {
    for (const r of w.secessionAftermath?.records ?? []) {
      if (r.joinedTick !== undefined || r.protectionTick !== undefined) continue;
      if (w.settlements[r.settlementId]?.factionId !== r.factionId || w.tick - r.declaredTick < AFTERMATH_WINDOW) continue;
      if (alliancesOf(w).some((a) => a.factionIds.includes(r.factionId)) || factionSurplus(w, r.factionId) < 0) continue;
      const oldT = threatTo(w, r.factionId, r.settlementId); if (!oldT) continue;
      const oldP = patronCandidates(w, r, oldT.factionId)[0]; if (!oldP) continue;
      hit("pre-fix would form", seed);
      const newT = threatTo(w, r.factionId, r.settlementId, { portHolding: true });
      if (!newT) { hit("no port-holding threat", seed); continue; }
      if (newT.factionId !== oldT.factionId) hit("threat moved to a port holder", seed);
      const all = patronCandidates(w, r, newT.factionId);
      if (!all.length) { hit("no patron for the port-holding threat", seed); continue; }
      const ok = all.filter((c) => pactBlocked(w, r.factionId, c.factionId) === null);
      if (!ok.length) { for (const reason of new Set(all.map((c) => pactBlocked(w, r.factionId, c.factionId)))) hit(`every patron blocked; one by ${reason}`, seed); continue; }
      if (ok[0].factionId !== oldP.factionId) hit("patron moved to an eligible one", seed);
      hit("fixed rule forms", seed);
    }
    runTick(w, { ...opts });
  }
}
for (const [k, n] of Object.entries(tally)) console.log(`${k}: ${n} evaluations on ${seedsHit[k].size} seeds`);
