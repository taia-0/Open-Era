// defaults-on.md measurement harness: one config × 13 seeds × 1,200 ticks, offline, no AI, $0.
// Usage: node --experimental-strip-types docs/design/defaults-on/measure.ts <label> '<TickOptions JSON>' [--ticks 1200]
// Prints one JSON row per seed (counts, hashes at t72/t1200, replay check, wipeouts, portless factions at the end).
import { runTick } from "../../../src/sim/engine.ts";
import { createPrototypeWorld } from "../../../src/sim/scenario.ts";
import { stateHash } from "../../../src/sim/state.ts";
import { replayWithSilentStarts } from "../../../src/sim/tick-start.ts";
import { dynamismReadout } from "../../../src/tools/dynamism.ts";
import type { SimEvent, WorldState } from "../../../src/sim/types.ts";

const [label, optsJson] = process.argv.slice(2);
const opts = JSON.parse(optsJson ?? "{}");
const ticks = Number(process.env.TICKS ?? 1200);
const seeds = (process.env.SEEDS ?? "1847,2718,4096,1000,2000,3000,4000,5000,6000,7000,8000,9000,10000").split(",").map(Number);
const portsOf = (w: WorldState, f: string) => Object.values(w.settlements).filter((s) => s.factionId === f).length;
const members = (w: WorldState, f: string) => Object.values(w.characters).filter((c) => !c.dead && c.factionId === f).length;

for (const seed of seeds) {
  const w = createPrototypeWorld(seed);
  const events: SimEvent[] = [];
  let hash72 = "";
  for (let i = 0; i < ticks; i++) {
    events.push(...runTick(w, { ...opts }).events);
    if (i === 71) hash72 = stateHash(w).slice(0, 8);
  }
  const replay = createPrototypeWorld(seed);
  replayWithSilentStarts(replay, events);
  const replayExact = stateHash(replay) === stateHash(w);
  const t = dynamismReadout(events).totals;
  const n = (type: string) => events.filter((e) => e.type === type).length;
  const factions = Object.keys(w.factions);
  const portless = factions.filter((f) => portsOf(w, f) === 0);
  const row = {
    label, seed, hash72, hash1200: stateHash(w).slice(0, 8), replayExact,
    claims: n("settlement-claimed"), portChanges: t.portOwnershipChanges, battles: n("battle-resolved"), captures: t.captures,
    secessions: t.secessions, peaces: n("faction-peace"), peaceBreaks: n("faction-peace-broken"), joins: n("secession-joined"),
    pacts: n("alliance-formed"), protectionPacts: events.filter((e) => e.type === "alliance-formed" && e.data.aftermath === "protection").length,
    pactBreaks: n("alliance-broken"), purchases: n("settlement-purchased"), promotions: n("character-promoted"),
    retirements: n("character-retired"), returns: n("character-returned"), integrations: n("occupation-integrated"),
    deaths: t.deaths, desertions: t.desertions,
    factions: factions.length, portless: portless.length, portlessWithMembers: portless.filter((f) => members(w, f) > 0).length,
    neutralAtEnd: Object.values(w.settlements).filter((s) => s.factionId === null).map((s) => s.id),
    wipeouts: ["world-government", "free-tide"].filter((f) => portsOf(w, f) === 0 && members(w, f) === 0),
  };
  console.log(JSON.stringify(row));
}
