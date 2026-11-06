import { runTick } from "/tmp/sa/src/sim/engine.ts";
import { createPrototypeWorld } from "/tmp/sa/src/sim/scenario.ts";
import { surplus, threatTo, patrons, earnedGrievance } from "/tmp/sa/src/sim/secession-aftermath.ts";
const out: any[] = [];
for (const seed of [4096, 7000, 8000, 9000, 10000, 2000, 6000]) {
  const w = createPrototypeWorld(seed);
  for (let i = 0; i < 1200; i++) {
    const evs = runTick(w, { secessionAftermath: true } as never).events;
    for (const r of (w as any).secessionAftermath?.records ?? []) if (w.tick - r.declaredTick === 22 && w.settlements[r.settlementId].factionId === r.factionId) { const t = threatTo(w, r.factionId, r.settlementId); out.push({ seed, f: r.factionId, surplus: surplus(w, r.factionId), treasury: w.factions[r.factionId].treasury, g: earnedGrievance(w, r.ownerId, r.oldFactionId), threat: t?.cause ?? null, patrons: t ? patrons(w, r, t.factionId).map((p) => p.factionId) : [] }); }
    for (const e of evs) if (e.type === "alliance-formed" && e.data.aftermath) out.push({ seed, causes: (e.data.alliance as any).causes });
  }
}
console.log(JSON.stringify(out, null, 0));
