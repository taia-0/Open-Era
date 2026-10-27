import assert from "node:assert/strict";
import test from "node:test";
import { projectEventFeed } from "../src/dashboard/view-model.ts";
import { publicRefusalReason } from "../src/dashboard/wording.ts";
import { runTick } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { stateHash } from "../src/sim/state.ts";
import type { SimEvent } from "../src/sim/types.ts";

function live168() {
  const world = createPrototypeWorld(1847);
  const events: SimEvent[] = [];
  while (world.tick < 168) events.push(...runTick(world, { liveSession: true }).events);
  return { world, page: events.filter((event) => event.tick >= 144) };
}

type Row = { sequence: number; summary: string; payloadWithheld: boolean; foldedSequences?: number[]; count?: number; data: unknown };

test("Iris Stone's page folds her three identical landed offers to Bram Quill into one line", () => {
  const { world, page } = live168();
  const before = stateHash(world);
  const rows = projectEventFeed(world, "character-06", page) as Row[];
  const folded = rows.find((row) => row.sequence === 18624);
  assert.equal(folded?.summary, "Iris Stone offered Bram Quill a contract to carry 10 provisions to Crown Harbor (3 times). The price is 56.25.");
  assert.equal(folded?.count, 3);
  assert.deepEqual(folded?.foldedSequences, [18148, 18376]);
  assert.equal(rows.some((row) => row.sequence === 18148 || row.sequence === 18376), false);
  // The tick-160 offer was refused, a different ending, so it stays its own line.
  assert.equal(rows.find((row) => row.sequence === 18876)?.summary, "Iris Stone offered Bram Quill a contract to carry 10 provisions to Crown Harbor. The price is 56.25.");
  assert.equal(stateHash(world), before);
});

test("an offer line that differs for the viewer does not fold", () => {
  const { world, page } = live168();
  const rows = projectEventFeed(world, "character-01", page) as Row[];
  // Mara reads a treasury draw on the tick-156 offer only, so the three lines differ.
  for (const sequence of [18148, 18376, 18624]) {
    const row = rows.find((item) => item.sequence === sequence);
    assert.ok(row);
    assert.equal(row.count, undefined);
    assert.equal(row.payloadWithheld, true);
  }
});

test("the acceptance and its order on the same tick are one line, in each viewer's words", () => {
  const { world, page } = live168();
  const mara = projectEventFeed(world, "character-01", page) as Row[];
  const iris = projectEventFeed(world, "character-06", page) as Row[];
  const rival = mara.find((row) => row.sequence === 17666);
  assert.equal(rival?.summary, "Iris Stone accepted the contract and took the order to carry 10 provisions to Crown Harbor.");
  assert.equal(rival?.payloadWithheld, true);
  assert.equal(rival?.data, null);
  assert.deepEqual(rival?.foldedSequences, [17667]);
  assert.equal(mara.some((row) => row.sequence === 17667), false);
  const own = iris.find((row) => row.sequence === 17666);
  assert.equal(own?.summary, "Iris Stone accepted the provisions contract and took the order to carry 10 provisions to Crown Harbor by tick 151.");
  assert.equal(own?.payloadWithheld, false);
  // As buyer she cannot read Bram's deadline, so the order half stays public.
  assert.equal(iris.find((row) => row.sequence === 18264)?.summary, "Bram Quill accepted the provisions contract and took the order to carry 10 provisions to Crown Harbor.");
});

test("a refusal gives the stored reason to the parties and a figure-free reason to others", () => {
  const { world, page } = live168();
  const mara = projectEventFeed(world, "character-01", page) as Row[];
  const iris = projectEventFeed(world, "character-06", page) as Row[];
  assert.equal(mara.find((row) => row.sequence === 18994)?.summary, "Bram Quill refused a contract: they could not make the voyage.");
  assert.equal(iris.find((row) => row.sequence === 18994)?.summary, "Bram Quill refused the provisions contract. The carrier is already at sea.");
});

test("each refusal gate has a public reason without figures", () => {
  const base = { sequence: 1, tick: 1, type: "contract-refused" };
  assert.equal(publicRefusalReason({ ...base, data: { gate: "travel" } }), "they could not make the voyage");
  assert.equal(publicRefusalReason({ ...base, data: { gate: "purse" } }), "their purse could not cover the cargo");
  assert.equal(publicRefusalReason({ ...base, data: { gate: "score" } }), "the terms did not suit them");
  assert.equal(publicRefusalReason({ ...base, data: {} }), null);
});
