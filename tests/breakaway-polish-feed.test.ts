import assert from "node:assert/strict";
import test from "node:test";
import { projectEventFeed } from "../src/dashboard/view-model.ts";
import { publicBreachReason, unqualifiedFeedNames } from "../src/dashboard/wording.ts";
import { runTick } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import type { SimEvent } from "../src/sim/types.ts";

const world = createPrototypeWorld(1847);
const events: SimEvent[] = [];
while (world.tick < 216) events.push(...runTick(world, { liveSession: true }).events);
const page = (from: number, to: number) => events.filter((event) => event.tick >= from && event.tick < to);
type Row = { sequence: number; summary: string; payloadWithheld: boolean; firstTick?: number };
const rows = (viewer: string, from: number, to: number) => projectEventFeed(world, viewer, page(from, to)) as Row[];
const MARA = "character-01", BRAM = "character-02", IRIS = "character-06";

test("seed 1847 tick 196: Bram's breach reads its stored cause, figure-free for the public", () => {
  const breach = events.find((event) => event.sequence === 23032)!;
  assert.equal(breach.data.cause, "choice");
  assert.equal(breach.data.detail, "better-motive");
  assert.equal(rows(MARA, 192, 216).find((row) => row.sequence === 23032)?.summary, "Bram Quill missed a contract: the carrier chose other work.");
  for (const party of [BRAM, IRIS]) {
    assert.equal(rows(party, 192, 216).find((row) => row.sequence === 23032)?.summary, "Bram Quill missed the provisions deadline: the carrier chose other work. The escrow returned.");
  }
});

test("a breach with no stored cause keeps the bare sentence", () => {
  assert.equal(publicBreachReason({ type: "contract-breached", data: {} } as unknown as SimEvent), null);
  assert.equal(publicBreachReason({ type: "contract-breached", data: { cause: "capture" } } as unknown as SimEvent), "the carrier was taken captive");
});

test("seed 1847 tick 209: the folded row names its first tick", () => {
  const row = rows(MARA, 192, 216).find((r) => r.sequence === 24468)!;
  assert.equal(row.summary, "Iris Stone offered Toma Reef a contract to carry 10 provisions to Crown Harbor (2 times since tick 194).");
  assert.equal(row.firstTick, 194);
});

test("seed 1847 tick 151: Lio's cancellation names the buyer; the escrow stays party-only", () => {
  assert.equal(rows(MARA, 144, 168).find((r) => r.sequence === 17788)?.summary, "Lio Crow's contract for Iris Stone was cancelled because the port no longer needs it.");
  assert.equal(rows(IRIS, 144, 168).find((r) => r.sequence === 17788)?.summary, "Lio Crow's provisions contract for Iris Stone was cancelled: Crown Harbor already holds the quantity. The escrow returned.");
});

test("no feed row on the tick 144-216 pages carries a faction tag on a name", () => {
  for (const viewer of [MARA, BRAM, IRIS]) for (const row of rows(viewer, 144, 216)) {
    assert.doesNotMatch(row.summary, /Toma (Reef|Hale) \(/);
  }
  assert.equal(unqualifiedFeedNames(world, "Toma Hale (unaffiliated) sailed."), "Toma Hale sailed.");
});
