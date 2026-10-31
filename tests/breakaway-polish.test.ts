import assert from "node:assert/strict";
import test from "node:test";
import { projectEventFeed } from "../src/dashboard/view-model.ts";
import { projectFactions } from "../src/dashboard/visibility.ts";
import { runTick } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { stateHash } from "../src/sim/state.ts";
import type { SimEvent } from "../src/sim/types.ts";

const FREE_CINDER_KEY = "secession-character-16-cinder-key-1088";

function live4096(through: number) {
  const world = createPrototypeWorld(4096);
  const events: SimEvent[] = [];
  while (world.tick < through) events.push(...runTick(world, { liveSession: true }).events);
  return { world, events };
}

type Row = { summary: string; payloadWithheld: boolean };

test("seed 4096 names Corin Hale as the founder who sets Free Cinder Key's tax", () => {
  const { world, events } = live4096(1100);
  const before = stateHash(world);
  const declared = events.find((event) => event.sequence === 147966);
  assert.equal(declared?.type, "secession-declared");
  const line = "Corin Hale declared Cinder Key separate from Free Tide Compact. Free Cinder Key starts with an empty treasury, founded by Corin Hale, who sets its tax until a leader gives orders.";
  for (const reader of ["character-01", "character-16"]) {
    const [row] = projectEventFeed(world, reader, [declared!], events) as Row[];
    assert.equal(row.summary, line, reader);
  }
  assert.equal((projectEventFeed(world, "character-01", [declared!], events)[0] as Row).payloadWithheld, true);
  assert.equal(stateHash(world), before);
});

test("the tick-1104 cut names Glassport, the only port Free Cinder Key held then", () => {
  // World Government claimed Cinder Key on the declaration tick; the breakaway took Glassport on tick 1094.
  const { world, events } = live4096(1124);
  const step = events.find((event) => event.sequence === 150201);
  assert.equal(step?.type, "tax-rate-set");
  assert.equal(step?.data.factionId, FREE_CINDER_KEY);
  const [row] = projectEventFeed(world, "character-01", [step!], events) as Row[];
  assert.equal(row.summary, "Corin Hale lowered the Free Cinder Key tax from 8% to 7% (unrest at Glassport).");
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
