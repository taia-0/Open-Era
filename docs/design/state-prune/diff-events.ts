import { runTick } from "../../../src/sim/engine.ts";
import { createPrototypeWorld } from "../../../src/sim/scenario.ts";
import { stateHash } from "../../../src/sim/state.ts";
import { pruneWorld } from "./prune.ts";
import type { SimEvent } from "../../../src/sim/types.ts";

const mode = process.argv[2] ?? "all"; // all | none | contracts | news | orders | raids
const ticks = Number(process.env.TICKS ?? 1200);
const seed = Number(process.env.SEED ?? 1847);
const opts = JSON.parse(process.env.OPTS ?? "{}");

// Monkey-patch prune to a subset by wrapping: import full prune and temporarily
// copy world slices we want to keep. Simpler: call pruneWorld then restore skipped fields.
import type { WorldState } from "../../../src/sim/types.ts";

function applyMode(world: WorldState, snapshot: WorldState): void {
  if (mode === "all") return;
  if (mode !== "news") {
    for (const id of Object.keys(world.settlements)) world.settlements[id].news = snapshot.settlements[id].news;
    for (const id of Object.keys(world.characters)) world.characters[id].carriedNews = snapshot.characters[id].carriedNews;
  }
  if (mode !== "contracts") world.contracts = snapshot.contracts;
  if (mode !== "orders") {
    for (const id of Object.keys(world.characters)) world.characters[id].standingOrders = snapshot.characters[id].standingOrders;
  }
  if (mode !== "raids") world.allianceRaids = snapshot.allianceRaids;
  if (mode !== "replies") world.scheduledReplies = snapshot.scheduledReplies;
}

function types(events: SimEvent[]): Record<string, number> {
  const o: Record<string, number> = {};
  for (const e of events) o[e.type] = (o[e.type] ?? 0) + 1;
  return o;
}

const pruned = createPrototypeWorld(seed);
const control = createPrototypeWorld(seed);
const pe: SimEvent[] = [], ce: SimEvent[] = [];
for (let i = 0; i < ticks; i++) {
  pe.push(...runTick(pruned, { ...opts }).events);
  const before = structuredClone(pruned);
  pruneWorld(pruned);
  if (mode !== "all") applyMode(pruned, before);
  ce.push(...runTick(control, { ...opts }).events);
}
const pt = types(pe), ct = types(ce);
const keys = [...new Set([...Object.keys(pt), ...Object.keys(ct)])].sort();
const diff = keys.map((k) => ({ type: k, pruned: pt[k] ?? 0, control: ct[k] ?? 0, d: (pt[k] ?? 0) - (ct[k] ?? 0) })).filter((x) => x.d !== 0);
console.log(JSON.stringify({
  mode, seed, ticks,
  hashP: stateHash(pruned).slice(0, 8), hashC: stateHash(control).slice(0, 8),
  nP: pe.length, nC: ce.length,
  diff,
}, null, 2));
