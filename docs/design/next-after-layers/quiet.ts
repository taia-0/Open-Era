import { runTick } from "/tmp/nal/src/sim/engine.ts";
import { createPrototypeWorld } from "/tmp/nal/src/sim/scenario.ts";
const seeds = [1847, 2718, 4096, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000];
const types = ["battle-started", "settlement-claimed", "secession-declared", "character-captured", "character-died", "character-deserted", "tax-rate-set", "contract-breached", "alliance-formed"];
const bins = 6; const agg: Record<string, number[]> = {}; const total = Array(bins).fill(0); const typeSeen = new Set<string>();
const end: string[] = [];
for (const seed of seeds) {
  const w = createPrototypeWorld(seed);
  for (let i = 0; i < 1200; i++) for (const e of runTick(w).events) { const b = Math.min(bins - 1, Math.floor(e.tick / 200)); total[b]++; typeSeen.add(e.type); (agg[e.type] ??= Array(bins).fill(0))[b]++; }
  const fac = Object.values(w.factions); const ports: Record<string, number> = {};
  for (const s of Object.values(w.settlements)) ports[s.factionId ?? "none"] = (ports[s.factionId ?? "none"] ?? 0) + 1;
  end.push(`${seed}: factions ${fac.length}, alive ${Object.values(w.characters).filter((c) => !c.dead).length}/${Object.keys(w.characters).length}, ports ${JSON.stringify(ports)}`);
}
console.log("total events per 200-tick bin (13 seeds):", total.join(" / "));
for (const t of [...typeSeen].sort()) if (types.includes(t) || /battle-resolved|raid|surrender|claim|secess|alliance|war|captur|died|desert|occupation/.test(t)) console.log(t.padEnd(32), agg[t].join(" / "));
console.log(end.join("\n"));
