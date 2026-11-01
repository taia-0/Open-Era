import assert from "node:assert/strict";
import test from "node:test";
import { projectEventFeed } from "../src/dashboard/view-model.ts";
import { publicBreachReason, unqualifiedFeedNames } from "../src/dashboard/wording.ts";
import { runTick } from "./helpers/exile-off.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import type { SimEvent } from "../src/sim/types.ts";

const world = createPrototypeWorld(1847);
const events: SimEvent[] = [];
// Port balance: run to 336 so the folded-row story (now on the 312-336 page) is in range; was 216.
while (world.tick < 336) events.push(...runTick(world, { liveSession: true }).events);
const page = (from: number, to: number) => events.filter((event) => event.tick >= from && event.tick < to);
type Row = { sequence: number; summary: string; payloadWithheld: boolean; firstTick?: number };
const rows = (viewer: string, from: number, to: number) => projectEventFeed(world, viewer, page(from, to)) as Row[];
const MARA = "character-01", BRAM = "character-02", IRIS = "character-06", NIKO = "character-03", TOMA = "character-07";

// Port balance: Bram's t196 breach for Iris no longer happens; Toma Reef's t203 breach for Niko Wren
// (sequence 23277) is the same choice / better-motive breach on the same page.
test("seed 1847 tick 203: Toma's breach reads its stored cause, figure-free for the public", () => {
  const breach = events.find((event) => event.sequence === 23277)!;
  assert.equal(breach.data.cause, "choice");
  assert.equal(breach.data.detail, "better-motive");
  assert.equal(rows(MARA, 192, 216).find((row) => row.sequence === 23277)?.summary, "Toma Reef missed a contract: the carrier chose other work.");
  for (const party of [TOMA, NIKO]) {
    assert.equal(rows(party, 192, 216).find((row) => row.sequence === 23277)?.summary, "Toma Reef missed the provisions deadline: the carrier chose other work. The escrow returned.");
  }
});

test("a breach with no stored cause keeps the bare sentence", () => {
  assert.equal(publicBreachReason({ type: "contract-breached", data: {} } as unknown as SimEvent), null);
  assert.equal(publicBreachReason({ type: "contract-breached", data: { cause: "capture" } } as unknown as SimEvent), "the carrier was taken captive");
});

// Port balance: Mara's 192-216 page has no folded row now; her 312-336 page folds Bram's two offers.
test("seed 1847 tick 334: the folded row names its first tick", () => {
  const row = rows(MARA, 312, 336).find((r) => r.sequence === 39068)!;
  assert.equal(row.summary, "Bram Quill offered Iris Stone a contract to carry 10 provisions to Glassport (2 times since tick 326). Bram Quill drew 12 from the treasury and paid 44.25 from the purse.");
  assert.equal(row.firstTick, 326);
});

// Port balance: Lio's t151 cancellation for Iris is now his t154 cancellation for Niko Wren (17655).
test("seed 1847 tick 154: Lio's cancellation names the buyer; the escrow stays party-only", () => {
  assert.equal(rows(MARA, 144, 168).find((r) => r.sequence === 17655)?.summary, "Lio Crow's contract for Niko Wren was cancelled because the port no longer needs it.");
  assert.equal(rows(NIKO, 144, 168).find((r) => r.sequence === 17655)?.summary, "Lio Crow's provisions contract for Niko Wren was cancelled: Crown Harbor already holds the quantity. The escrow returned.");
});

test("no feed row on the tick 144-216 pages carries a faction tag on a name", () => {
  for (const viewer of [MARA, BRAM, IRIS]) for (const row of rows(viewer, 144, 216)) {
    assert.doesNotMatch(row.summary, /Toma (Reef|Hale) \(/);
  }
  assert.equal(unqualifiedFeedNames(world, "Toma Hale (unaffiliated) sailed."), "Toma Hale sailed.");
});
