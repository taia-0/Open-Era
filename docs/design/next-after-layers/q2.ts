import { runTick } from "/tmp/nal/src/sim/engine.ts";
import { createPrototypeWorld } from "/tmp/nal/src/sim/scenario.ts";
let vcBattles = 0, vcClaims = 0, portless = 0, portlessMembers = 0, factions = 0;
for (const seed of [1847, 2718, 4096, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000]) {
  const w = createPrototypeWorld(seed);
  for (let i = 0; i < 1200; i++) for (const e of runTick(w).events) { if (e.settlementId === "verdant-cay" && e.type === "battle-started") vcBattles++; if (e.settlementId === "verdant-cay" && e.type === "settlement-claimed") vcClaims++; }
  for (const f of Object.values(w.factions)) { factions++; const p = Object.values(w.settlements).filter((s) => s.factionId === f.id).length; if (!p) { portless++; portlessMembers += Object.values(w.characters).filter((c) => !c.dead && c.factionId === f.id).length; } }
}
console.log({ vcBattles, vcClaims, factions, portless, portlessMembers });
