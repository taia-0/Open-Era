// human-contracts.md: the noise floor. Flag-off runs with the commander's purse nudged by 1, 2, 3 coins: no rule changes, so any spread in the
// economy totals is chaos from a byte-different run, not an effect. Usage: node --experimental-strip-types noise.ts '<TickOptions JSON>'
import { runTick } from "../../../src/sim/engine.ts";
import { createPrototypeWorld } from "../../../src/sim/scenario.ts";
const opts = JSON.parse(process.argv[2] ?? "{}");
const seeds = [1847, 2718, 4096, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000];
const TYPES = ["contract-offered", "contract-fulfilled", "contract-breached", "settlement-claimed", "character-captured"];
for (const nudge of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
  const perSeed: Record<number, { offered: number; fulfilled: number; treasury: number }> = {};
  const tot: Record<string, number> = Object.fromEntries(TYPES.map((t) => [t, 0])); let treasury = 0, ports = 0, shortage = 0;
  for (const seed of seeds) {
    const w = createPrototypeWorld(seed); const cmd = Object.values(w.players)[0].characterId; w.characters[cmd].money += nudge;
    let prev = Object.fromEntries(Object.values(w.settlements).map((s) => [s.id, s.factionId]));
    const mine: Record<string, number> = { "contract-offered": 0, "contract-fulfilled": 0 };
    for (let i = 0; i < 1200; i++) {
      const r = runTick(w, { ...opts });
      for (const e of r.events) if (e.type in tot) { tot[e.type]++; if (e.type in mine) mine[e.type]++; }
      if (Object.values(w.settlements).some((s) => s.factionId && s.stocks.provisions < 1)) shortage++;
      for (const s of Object.values(w.settlements)) { if (prev[s.id] !== s.factionId) ports++; prev[s.id] = s.factionId; }
    }
    const tr = Object.values(w.factions).reduce((n, f) => n + f.treasury, 0);
    treasury += tr; perSeed[seed] = { offered: mine["contract-offered"], fulfilled: mine["contract-fulfilled"], treasury: Math.round(tr * 100) / 100 };
  }
  console.log(JSON.stringify({ nudge, ...tot, treasury: Math.round(treasury * 100) / 100, portChanges: ports, shortageTicks: shortage, perSeed }));
}
