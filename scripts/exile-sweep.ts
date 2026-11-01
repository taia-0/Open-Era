// Exile recovery sweep (next-dynamic-slice.md, revised slice A acceptance): 13 seeds × 1,200 ticks,
// EXILE_RECOVERY off vs on. Offline; no AI. Prints one JSON row per seed and mode, then a table.
//   node --experimental-strip-types scripts/exile-sweep.ts [--seeds 1847,2718,...] [--ticks 1200]
import { parseArgs } from "node:util";
import { runTick } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { stateHash } from "../src/sim/state.ts";
import { dynamismReadout } from "../src/tools/dynamism.ts";
import type { SimEvent } from "../src/sim/types.ts";

const { values } = parseArgs({ options: { seeds: { type: "string", default: "1847,2718,4096,1000,2000,3000,4000,5000,6000,7000,8000,9000,10000" }, ticks: { type: "string", default: "1200" } } });
const seeds = values.seeds!.split(",").map(Number);
const ticks = Number(values.ticks);

function run(seed: number, on: boolean) {
  const world = createPrototypeWorld(seed);
  const events: SimEvent[] = [];
  let portlessRaids = 0;
  for (let i = 0; i < ticks; i++) {
    const portless = (f: string) => !Object.values(world.settlements).some((s) => s.factionId === f);
    const wasPortless = new Set(Object.keys(world.factions).filter(portless));
    for (const e of runTick(world, on ? { exileRecovery: true } : {}).events) {
      events.push(e);
      if (e.type === "decision-made" && e.data.goal === "raid" && wasPortless.has(world.characters[e.actorId!]?.factionId ?? "")) portlessRaids++;
    }
  }
  const t = dynamismReadout(events).totals;
  const ports = (f: string) => Object.values(world.settlements).filter((s) => s.factionId === f).length;
  const members = (f: string) => Object.values(world.characters).filter((c) => !c.dead && c.factionId === f).length;
  return {
    seed, mode: on ? "on" : "off", hash: stateHash(world).slice(0, 8),
    claims: events.filter((e) => e.type === "settlement-claimed").length,
    secessions: t.secessions, portChanges: t.portOwnershipChanges, desertions: t.desertions,
    raids: events.filter((e) => e.type === "decision-made" && e.data.goal === "raid").length, portlessRaids,
    wgPortsEnd: ports("world-government"), ftPortsEnd: ports("free-tide"), wgMembersEnd: members("world-government"), ftMembersEnd: members("free-tide"),
  };
}

const rows = seeds.flatMap((seed) => [run(seed, false), run(seed, true)]);
for (const row of rows) console.log(JSON.stringify(row));
const sum = (mode: string, key: keyof ReturnType<typeof run>) => rows.filter((r) => r.mode === mode).reduce((a, r) => a + (r[key] as number), 0);
console.log("| Seed | Claims off/on | Secessions off/on | Port changes off/on | Desertions off/on | Portless raids off/on | WG ports t_end off/on | FT members t_end off/on |");
console.log("|---|---|---|---|---|---|---|---|");
for (const seed of seeds) {
  const [a, b] = [rows.find((r) => r.seed === seed && r.mode === "off")!, rows.find((r) => r.seed === seed && r.mode === "on")!];
  console.log(`| ${seed} | ${a.claims} / ${b.claims} | ${a.secessions} / ${b.secessions} | ${a.portChanges} / ${b.portChanges} | ${a.desertions} / ${b.desertions} | ${a.portlessRaids} / ${b.portlessRaids} | ${a.wgPortsEnd} / ${b.wgPortsEnd} | ${a.ftMembersEnd} / ${b.ftMembersEnd} |`);
}
console.log(`| total | ${sum("off", "claims")} / ${sum("on", "claims")} | ${sum("off", "secessions")} / ${sum("on", "secessions")} | ${sum("off", "portChanges")} / ${sum("on", "portChanges")} | ${sum("off", "desertions")} / ${sum("on", "desertions")} | ${sum("off", "portlessRaids")} / ${sum("on", "portlessRaids")} | | |`);
