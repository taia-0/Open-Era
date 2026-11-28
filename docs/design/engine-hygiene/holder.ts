// Item 4 harness: stored command holder. Headless runs (no player), one config, 13 seeds x 1,200 ticks.
// Every tick it compares commandHolderId(world, f) (stored on the patched tree, derived on main) with the legacy derivation
// copied below, for every faction. Prints the event digest (incl. sequence), pins, outcomes and every mismatch.
// Usage: node --experimental-strip-types docs/design/engine-hygiene/holder.ts <label> <flag-off|atls>
import { runTick } from "../../../src/sim/engine.ts";
import { createPrototypeWorld } from "../../../src/sim/scenario.ts";
import { commandHolderId, stateHash } from "../../../src/sim/state.ts";
import { replayWithSilentStarts } from "../../../src/sim/tick-start.ts";
import type { SimEvent, WorldState } from "../../../src/sim/types.ts";
import { CONFIGS, EventDigest, outcomes, SEEDS13 } from "./common.ts";

function legacy(world: WorldState, factionId: string): string | null {
  let holderId: string | null = null;
  for (const character of Object.values(world.characters)) {
    for (const order of character.standingOrders) {
      const issuer = world.characters[order.issuerId];
      if (issuer?.factionId !== factionId) continue;
      if (holderId === null) holderId = issuer.id;
      else if (holderId !== issuer.id) return null;
    }
  }
  return holderId;
}
const [label, cfg] = process.argv.slice(2);
const opts = CONFIGS[cfg];
const ticks = Number(process.env.TICKS ?? 1200);
const seeds = (process.env.SEEDS ?? SEEDS13).split(",").map(Number);
for (const seed of seeds) {
  const w = createPrototypeWorld(seed);
  const log: SimEvent[] = [];
  const dig = new EventDigest();
  const mismatches: Array<{ tick: number; faction: string; got: string | null; legacy: string | null }> = [];
  let mismatchTicks = 0, h72 = "", holderChanges = 0, nullTicks = 0;
  const prev: Record<string, string | null> = {};
  for (let i = 1; i <= ticks; i++) {
    for (const e of runTick(w, { ...opts }).events) { dig.add(e); log.push(e); }
    if (i === 72) h72 = stateHash(w).slice(0, 8);
    let bad = false;
    for (const f of Object.keys(w.factions)) {
      const got = commandHolderId(w, f), old = legacy(w, f);
      if (got !== old) { bad = true; if (mismatches.length < 8) mismatches.push({ tick: w.tick, faction: f, got, legacy: old }); }
      if (prev[f] !== undefined && prev[f] !== got) holderChanges++;
      prev[f] = got;
      if (got === null && (f === "world-government" || f === "free-tide")) nullTicks++;
    }
    if (bad) mismatchTicks++;
  }
  const rep = createPrototypeWorld(seed);
  replayWithSilentStarts(rep, log);
  console.log(JSON.stringify({ label, cfg, seed, h72, h1200: stateHash(w).slice(0, 8), events: dig.count, eventDigest: dig.hex(), typeDigest: dig.typesHex(), ...outcomes(w, log), mismatchTicks, mismatches, holderChanges, nullTicksMainFactions: nullTicks, replayExact: stateHash(rep) === stateHash(w) }));
}
