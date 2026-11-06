// Default vs all slice flags ON (occupation, alliances, portTransfer, lifecycle). Offline, no AI. One seed per process.
import { runTick } from "../../src/sim/engine.ts";
import { createPrototypeWorld } from "../../src/sim/scenario.ts";
import { dynamismReadout } from "../../src/tools/dynamism.ts";
import type { SimEvent } from "../../src/sim/types.ts";
const seed = Number(process.argv[2]); const on = process.argv[3] === "on";
const w = createPrototypeWorld(seed); const ev: SimEvent[] = [];
const opts = on ? { occupation: true, alliances: true, portTransfer: true, lifecycle: true } : {};
for (let i = 0; i < 1200; i++) ev.push(...runTick(w, opts).events);
const n = (t: string) => ev.filter((e) => e.type === t).length;
const win = (t: string) => [0, 1, 2].map((k) => ev.filter((e) => e.type === t && e.tick > k * 400 && e.tick <= (k + 1) * 400).length);
const t = dynamismReadout(ev).totals;
const ports = (f: string) => Object.values(w.settlements).filter((s) => s.factionId === f).length;
const members = (f: string) => Object.values(w.characters).filter((c) => !c.dead && c.factionId === f).length;
const factions = Object.keys(w.factions); const portless = factions.filter((f) => ports(f) === 0).length;
const types: Record<string, number> = {}; for (const e of ev) types[e.type] = (types[e.type] ?? 0) + 1;
const neutral = Object.values(w.settlements).filter((s) => !s.factionId).map((s) => s.id);
console.log(JSON.stringify({ seed, on, claims: n("settlement-claimed"), portChanges: t.portOwnershipChanges, secessions: t.secessions, battles: n("battle-resolved"), battlesByThird: win("battle-resolved"), claimsByThird: win("settlement-claimed"), secByThird: [0,1,2].map((k)=>ev.filter((e)=>e.type.includes("secession-declared")&&e.tick>k*400&&e.tick<=(k+1)*400).length), captures: t.captures, deaths: t.deaths, desertions: t.desertions, alliancesFormed: n("alliance-formed"), alliancesBroken: n("alliance-broken"), purchases: n("settlement-purchased"), promotions: n("character-promoted"), retirements: n("character-retired"), returns: n("character-returned"), factions: factions.length, portless, neutralAtEnd: neutral, wipeouts: ["world-government", "free-tide"].filter((f) => ports(f) === 0 && members(f) === 0), eventTypes: Object.keys(types).length, contracts: Object.entries(types).filter(([k]) => k.startsWith("contract")).reduce((a, [, v]) => a + v, 0), news: Object.entries(types).filter(([k]) => k.startsWith("news")).reduce((a, [, v]) => a + v, 0), trades: Object.entries(types).filter(([k]) => /trade|sale|sold|bought/.test(k)).reduce((a, [, v]) => a + v, 0) }));
