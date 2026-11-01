import assert from "node:assert/strict";
import test from "node:test";
import { projectEventFeed } from "../src/dashboard/view-model.ts";
import { projectFactions } from "../src/dashboard/visibility.ts";
import { runTick } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { stateHash } from "../src/sim/state.ts";
import type { SimEvent } from "../src/sim/types.ts";

// Re-pinned for the raise shock (low-tax-cost.md): Corin Hale now founds Free Cinder Key at tick 870 (was 1088).
const FREE_CINDER_KEY = "secession-character-16-cinder-key-870";
const FREE_CROWN_HARBOR = "secession-character-22-crown-harbor-871";

function live4096(through: number) {
  const world = createPrototypeWorld(4096);
  const events: SimEvent[] = [];
  while (world.tick < through) events.push(...runTick(world, { liveSession: true }).events);
  return { world, events };
}

type Row = { summary: string; payloadWithheld: boolean };

test("seed 4096 names Corin Hale as the founder who sets Free Cinder Key's tax", () => {
  const { world, events } = live4096(900);
  const before = stateHash(world);
  const declared = events.find((event) => event.sequence === 115901);
  assert.equal(declared?.type, "secession-declared");
  const line = "Corin Hale declared Cinder Key separate from Free Tide Compact. Free Cinder Key starts with an empty treasury, founded by Corin Hale, who sets its tax until a leader gives orders.";
  for (const reader of ["character-01", "character-16"]) {
    const [row] = projectEventFeed(world, reader, [declared!], events) as Row[];
    assert.equal(row.summary, line, reader);
  }
  assert.equal((projectEventFeed(world, "character-01", [declared!], events)[0] as Row).payloadWithheld, true);
  assert.equal(stateHash(world), before);
  // Its first tax step: a raise, which now carries the shock at its one port.
  const first = events.find((event) => event.type === "tax-rate-set" && event.data.factionId === FREE_CINDER_KEY);
  assert.equal(first?.tick, 888);
  assert.equal((projectEventFeed(world, "character-01", [first!], events)[0] as Row).summary,
    "Corin Hale raised the Free Cinder Key tax from 8% to 9% (treasury short). The raise cost stability at Cinder Key 55.54 to 54.54.");
});

test("the tick-936 cut names Glassport, the only port Free Crown Harbor held then", () => {
  // Re-pinned for the raise shock: was Free Cinder Key's tick-1104 cut at Glassport. Now Bram Tern's breakaway
  // lost Crown Harbor and took Glassport on tick 934, then cut on tick 936.
  const { world, events } = live4096(937);
  const step = events.find((event) => event.sequence === 124485);
  assert.equal(step?.type, "tax-rate-set");
  assert.equal(step?.data.factionId, FREE_CROWN_HARBOR);
  assert.deepEqual(Object.values(world.settlements).filter((port) => port.factionId === FREE_CROWN_HARBOR).map((port) => port.id), ["glassport"]);
  const [row] = projectEventFeed(world, "character-01", [step!], events) as Row[];
  assert.equal(row.summary, "Bram Tern lowered the Free Crown Harbor tax from 8% to 7% (unrest at Glassport).");
});

test("a breakaway's treasury shows to its own members and to nobody else, like any faction's", () => {
  const { world } = live4096(1124);
  const own = projectFactions(world, world.characters["character-16"]).find((row) => row.id === FREE_CINDER_KEY);
  assert.equal(own?.treasury, world.factions[FREE_CINDER_KEY].treasury);
  assert.equal(own?.treasuryNote, null);
  const rival = projectFactions(world, world.characters["character-01"]).find((row) => row.id === FREE_CINDER_KEY);
  assert.equal(rival?.treasury, null);
  assert.equal(rival?.treasuryNote, "not visible to you");
});
