import assert from "node:assert/strict";
import test from "node:test";
import { projectEventFeed } from "../src/dashboard/view-model.ts";
import { characterName, publicRefusalReason } from "../src/dashboard/wording.ts";
import { runTick } from "./helpers/exile-off.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { stateHash } from "../src/sim/state.ts";
import type { SimEvent } from "../src/sim/types.ts";

// Port balance (home starts): the seed-1847 tick 144-168 contract stories (Iris carrying for Bram
// to Crown Harbor) no longer happen. The same shapes now run between the same two captains to
// Glassport: Iris offers Bram three identical contracts on the tick 360-384 page, and Bram's offers
// to Iris on the tick 288-312 page read differently to Mara.
function livePage(from: number, to: number) {
  const world = createPrototypeWorld(1847);
  const events: SimEvent[] = [];
  while (world.tick < to) events.push(...runTick(world, { liveSession: true }).events);
  return { world, page: events.filter((event) => event.tick >= from) };
}

type Row = { sequence: number; summary: string; payloadWithheld: boolean; foldedSequences?: number[]; count?: number; data: unknown };

test("Iris Stone's page folds her three identical offers to Bram Quill into one line", () => {
  const { world, page } = livePage(360, 384);
  const before = stateHash(world);
  const rows = projectEventFeed(world, "character-06", page) as Row[];
  const folded = rows.find((row) => row.sequence === 44067);
  assert.equal(folded?.summary, "Iris Stone offered Bram Quill a contract to carry 10 provisions to Glassport (3 times since tick 360). The price is 56.25.");
  assert.equal(folded?.count, 3);
  assert.deepEqual(folded?.foldedSequences, [42502, 43280]);
  assert.equal(rows.some((row) => row.sequence === 42502 || row.sequence === 43280), false);
  // The tick-377 offer was accepted, a different ending, so it stays its own line.
  assert.equal(rows.find((row) => row.sequence === 44726)?.summary, "Iris Stone offered Bram Quill a contract to carry 10 provisions to Glassport. The price is 56.25.");
  assert.equal(stateHash(world), before);
});

test("an offer line that differs for the viewer does not fold", () => {
  const { world, page } = livePage(288, 312);
  // Iris (a party) folds Bram's two offers; Mara reads a different treasury draw on each, so they differ.
  const iris = projectEventFeed(world, "character-06", page) as Row[];
  assert.equal(iris.find((row) => row.sequence === 35283)?.count, 2);
  assert.deepEqual(iris.find((row) => row.sequence === 35283)?.foldedSequences, [34035]);
  const rows = projectEventFeed(world, "character-01", page) as Row[];
  for (const sequence of [34035, 35283]) {
    const row = rows.find((item) => item.sequence === sequence);
    assert.ok(row);
    assert.equal(row.count, undefined);
    assert.equal(row.payloadWithheld, true);
  }
});

test("the acceptance and its order on the same tick are one line, in each viewer's words", () => {
  const { world, page } = livePage(360, 384);
  const mara = projectEventFeed(world, "character-01", page) as Row[];
  const bram = projectEventFeed(world, "character-02", page) as Row[];
  const iris = projectEventFeed(world, "character-06", page) as Row[];
  const rival = mara.find((row) => row.sequence === 44854);
  assert.equal(rival?.summary, "Bram Quill accepted the contract and took the order to carry 10 provisions to Glassport.");
  assert.equal(rival?.payloadWithheld, true);
  assert.equal(rival?.data, null);
  assert.deepEqual(rival?.foldedSequences, [44855]);
  assert.equal(mara.some((row) => row.sequence === 44855), false);
  const own = bram.find((row) => row.sequence === 44854);
  assert.equal(own?.summary, "Bram Quill accepted the provisions contract and took the order to carry 10 provisions to Glassport by tick 382.");
  assert.equal(own?.payloadWithheld, false);
  // As buyer Iris cannot read Bram's deadline, so the order half stays public.
  assert.equal(iris.find((row) => row.sequence === 44854)?.summary, "Bram Quill accepted the provisions contract and took the order to carry 10 provisions to Glassport.");
});

test("a refusal gives the stored reason to the parties and a figure-free reason to others", () => {
  const { world, page } = livePage(360, 384);
  const mara = projectEventFeed(world, "character-01", page) as Row[];
  const iris = projectEventFeed(world, "character-06", page) as Row[];
  assert.equal(mara.find((row) => row.sequence === 42626)?.summary, "Bram Quill refused a contract: they could not make the voyage.");
  assert.equal(iris.find((row) => row.sequence === 42626)?.summary, "Bram Quill refused the provisions contract. The carrier is already at sea.");
});

test("each refusal gate has a public reason without figures", () => {
  const base = { sequence: 1, tick: 1, type: "contract-refused" };
  assert.equal(publicRefusalReason({ ...base, data: { gate: "travel" } }), "they could not make the voyage");
  assert.equal(publicRefusalReason({ ...base, data: { gate: "purse" } }), "their purse could not cover the cargo");
  assert.equal(publicRefusalReason({ ...base, data: { gate: "score" } }), "the terms did not suit them");
  assert.equal(publicRefusalReason({ ...base, data: {} }), null);
});

// Port balance: Iris's two offers to Toma Reef on Mara's tick 192-216 page no longer happen; Mara's
// tick 312-336 page folds Bram Quill's two offers to Iris Stone the same way.
test("Mara's tick-336 page folds Bram Quill's two offers to Iris Stone, and the acceptance folds its order", () => {
  const { world, page } = livePage(312, 336);
  const rows = projectEventFeed(world, "character-01", page) as Row[];
  const folded = rows.find((row) => row.sequence === 39068);
  assert.equal(folded?.summary, "Bram Quill offered Iris Stone a contract to carry 10 provisions to Glassport (2 times since tick 326). Bram Quill drew 12 from the treasury and paid 44.25 from the purse.");
  assert.deepEqual(folded?.foldedSequences, [38010]);
  assert.equal(rows.find((row) => row.sequence === 39205)?.summary, "Iris Stone accepted the contract and took the order to carry 10 provisions to Glassport.");
  assert.equal(rows.some((row) => row.sequence === 39206), false);
});

// Fixture (no sim change): port balance removed the seed-1847 story in which Iris Stone offered
// Toma Reef the same contract twice. This rebuilds it on the opening 1847 world with hand-made events
// so the original assertion keeps full strength: the projector names Toma Reef with a faction tag
// ("Toma Reef (World Government)", because Toma Hale shares the first name), a stored summary can
// carry the tag or not, and the feed shows one untagged name everywhere, so the offers fold and the
// acceptance folds its order.
test("an untagged Toma Reef merges, and a fixture page folds Iris Stone's two offers to Toma Reef", () => {
  const world = createPrototypeWorld(1847);
  world.tick = 216;
  const before = stateHash(world);
  const iris = "character-06";
  const toma = "character-07";
  assert.equal(world.characters[iris].name, "Iris Stone");
  assert.equal(world.characters[toma].name, "Toma Reef");
  assert.equal(characterName(world, toma, "Toma Reef"), "Toma Reef (World Government)");
  const contract = (tick: number, status: string) => ({
    id: `supply-crown-harbor-${tick}`, buyerId: iris, carrierId: toma, good: "provisions", quantity: 10,
    destinationId: "crown-harbor", price: 56.25, escrow: 56.25, escrowFromTreasury: 0, escrowFromPurse: 56.25,
    settled: false, deadlineTick: tick + 2, issuedTick: tick, acceptedTick: status === "accepted" ? tick + 1 : null,
    status, revision: 1, observedTick: tick,
  });
  const offer = (sequence: number, tick: number): SimEvent => ({
    sequence, tick, type: "contract-offered", actorId: iris, targetId: toma,
    data: {
      contract: contract(tick, "offered"), buyerId: iris, carrierId: toma, buyerMoney: 200, carrierMoney: 100,
      escrow: 56.25, price: 56.25, quantity: 10, destinationId: "crown-harbor",
      treasuryDrawn: 0, purseDrawn: 56.25, factionTreasury: 1000, allowanceRemaining: 0, characterMoney: 200,
    },
  } as unknown as SimEvent);
  // Seed 1847 sequence 43 is Toma Reef's stored, untagged order acceptance; the copy carries the tag.
  const opening = runTick(createPrototypeWorld(1847), { liveSession: true }).events.find((event) => event.sequence === 43);
  assert.ok(opening);
  assert.equal((opening.data as { summary: string }).summary, "Toma Reef accepted the trade supplies order.");
  const stored = (sequence: number, tick: number, summary: string): SimEvent => ({
    ...opening, sequence, tick, data: { ...opening.data, summary },
  });
  const page: SimEvent[] = [
    offer(22795, 194),
    stored(23000, 196, "Toma Reef accepted the trade supplies order."),
    stored(23001, 197, "Toma Reef (World Government) accepted the trade supplies order."),
    offer(24468, 212),
    {
      sequence: 24591, tick: 213, type: "contract-accepted", actorId: toma, targetId: iris,
      data: { contract: { ...contract(212, "accepted"), order: { score: 0.65, destinationId: "crown-harbor", quantity: 10, deadlineTick: 214 } },
        buyerId: iris, carrierId: toma, buyerMoney: 150, carrierMoney: 100, escrow: 56.25, price: 56.25, quantity: 10,
        destinationId: "crown-harbor", score: 0.65, threshold: 0.56, travelTicks: 0, ticksLeft: 1, costBasis: 45 },
    } as unknown as SimEvent,
    {
      sequence: 24592, tick: 213, type: "contract-order-issued", actorId: toma, targetId: iris,
      data: { contractId: "supply-crown-harbor-212", score: 0.65, threshold: 0.56, destinationId: "crown-harbor", quantity: 10, deadlineTick: 214 },
    } as unknown as SimEvent,
  ];
  const rows = projectEventFeed(world, "character-01", page) as Row[];
  const folded = rows.find((row) => row.sequence === 24468);
  assert.equal(folded?.summary, "Iris Stone offered Toma Reef a contract to carry 10 provisions to Crown Harbor (2 times since tick 194).");
  assert.deepEqual(folded?.foldedSequences, [22795]);
  assert.equal(rows.find((row) => row.sequence === 24591)?.summary, "Toma Reef accepted the contract and took the order to carry 10 provisions to Crown Harbor.");
  assert.equal(rows.some((row) => row.sequence === 24592), false);
  // The stored tagged and untagged summaries read as the same name.
  assert.equal(rows.find((row) => row.sequence === 23000)?.summary, "Toma Reef accepted the trade supplies order.");
  assert.equal(rows.find((row) => row.sequence === 23001)?.summary, "Toma Reef accepted the trade supplies order.");
  for (const row of rows) assert.equal(String(row.summary).includes("Toma Reef ("), false);
  assert.equal(stateHash(world), before);
});
