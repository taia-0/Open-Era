import { runTick } from "/tmp/ally-proto/src/sim/engine.ts";
import { createPrototypeWorld } from "/tmp/ally-proto/src/sim/scenario.ts";
import { stateHash } from "/tmp/ally-proto/src/sim/state.ts";
for (const s of [1847, 2718, 4096]) { const w = createPrototypeWorld(s); for (let i = 0; i < 72; i++) runTick(w); console.log(s, stateHash(w).slice(0, 8)); }
let docked = 0, armed = 0, minG = Infinity, maxG = 0, faction = 0;
for (const s of [1847, 2718, 4096, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000]) { const w = createPrototypeWorld(s); for (let i = 0; i < 1200; i++) { runTick(w); const vc = w.settlements["verdant-cay"]; minG = Math.min(minG, vc.garrison); maxG = Math.max(maxG, vc.garrison); if (vc.factionId) faction++; for (const c of Object.values(w.characters)) if (!c.dead && c.locationId === "verdant-cay" && !c.travel) { docked++; if (c.factionId && c.troops.count >= 25) armed++; } } }
console.log({ dockedCharTicks: docked, armedFactionCharTicks: armed, garrisonMin: minG, garrisonMax: maxG, ticksWithOwner: faction });
