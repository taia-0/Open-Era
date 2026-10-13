import assert from "node:assert/strict";
import test from "node:test";
import { projectEventFeed } from "../src/dashboard/view-model.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { commandHolderId } from "../src/sim/state.ts";
import type { Character, SimEvent, WorldState } from "../src/sim/types.ts";

function named(world: WorldState, name: string): Character {
  const found = Object.values(world.characters).find((character) => character.name === name);
  assert.ok(found, name);
  return found;
}

test("a desertion sentence drops the roll and the stored event keeps it", () => {
  const world = createPrototypeWorld(1847);
  const finn = named(world, "Finn Frost");
  const mara = named(world, "Mara Vane");
  const event: SimEvent = {
    sequence: 20820,
    tick: 174,
    type: "character-deserted",
    actorId: finn.id,
    targetId: "free-tide",
    data: { roll: 0.245, factionId: null, previousFactionId: "free-tide" },
  };
  const [row] = projectEventFeed(world, mara.id, [event]);
  assert.equal(row.summary, "Finn Frost left Free Tide Compact.");
  assert.equal(String(row.summary).includes("0.245"), false);
  assert.equal(String(row.summary).includes("roll"), false);
  assert.equal(row.data, null);
  assert.equal(event.data.roll, 0.245);
  const [own] = projectEventFeed(world, finn.id, [event]);
  assert.equal(own.summary, "Finn Frost left Free Tide Compact.");
  assert.equal((own.data as { roll?: number } | null)?.roll, 0.245);
});

test("a debt amount is visible to the debtor and the creditor faction, and hidden from everyone else", () => {
  const world = createPrototypeWorld(1847);
  const mara = named(world, "Mara Vane");
  const bram = named(world, "Bram Quill");
  const pax = named(world, "Pax Ash");
  const corin = named(world, "Corin Hale");
  const niko = named(world, "Niko Crow");
  assert.equal(mara.factionId, "world-government");
  assert.equal(bram.factionId, "world-government");
  assert.equal(commandHolderId(world, "world-government"), mara.id);
  assert.equal(bram.id === mara.id, false);
  assert.equal(pax.factionId, "free-tide");
  assert.equal(corin.factionId, "free-tide");
  assert.equal(niko.factionId, null);

  const paid = 20.15;
  const event: SimEvent = {
    sequence: 40,
    tick: 12,
    type: "debt-repaid",
    actorId: mara.id,
    targetId: "free-tide",
    data: {
      debtId: "debt-polish",
      paid,
      remainingValue: 104.22,
      originalValue: 124.37,
      characterMoney: 0,
      factionTreasury: 900,
      closed: false,
    },
  };

  const sentence = (viewerId: string) => {
    const [row] = projectEventFeed(world, viewerId, [event]);
    return row;
  };

  const debtor = sentence(mara.id);
  assert.equal(debtor.payloadWithheld, false);
  assert.equal(debtor.summary, "Mara Vane paid 20.15 toward a debt to Free Tide Compact.");
  assert.equal((debtor.data as { paid?: number } | null)?.paid, paid);

  const creditor = sentence(pax.id);
  assert.equal(creditor.payloadWithheld, false);
  assert.equal(creditor.summary, "Mara Vane paid 20.15 toward a debt to Free Tide Compact.");
  assert.equal((creditor.data as { paid?: number } | null)?.paid, paid);

  const creditorMate = sentence(corin.id);
  assert.equal(creditorMate.payloadWithheld, false);
  assert.equal(creditorMate.summary, "Mara Vane paid 20.15 toward a debt to Free Tide Compact.");

  const debtorMate = sentence(bram.id);
  assert.equal(debtorMate.payloadWithheld, true);
  assert.equal(debtorMate.data, null);
  assert.equal(debtorMate.summary, "Mara Vane paid toward a debt to Free Tide Compact.");
  assert.equal(String(debtorMate.summary).includes("20.15"), false);
  assert.equal(String(debtorMate.summary).includes("104.22"), false);

  const outsider = sentence(niko.id);
  assert.equal(outsider.payloadWithheld, true);
  assert.equal(outsider.data, null);
  assert.equal(outsider.summary, "Mara Vane paid toward a debt to Free Tide Compact.");
  assert.equal(String(outsider.summary).includes(String(paid)), false);
});

test("the short-pay line is on the member's upkeep and the holder's, and off everyone else's", () => {
  const world = createPrototypeWorld(1847);
  const mina = named(world, "Mina Vale");
  const mara = named(world, "Mara Vane");
  const pax = named(world, "Pax Ash");
  const corin = named(world, "Corin Hale");
  const bram = named(world, "Bram Quill");
  assert.equal(commandHolderId(world, "free-tide"), pax.id);
  assert.equal(mina.factionId, "free-tide");
  assert.equal(corin.factionId, "free-tide");
  assert.equal(corin.id === mina.id, false);
  assert.equal(corin.id === pax.id, false);

  const event: SimEvent = {
    sequence: 13380,
    tick: 114,
    type: "character-upkeep",
    actorId: mina.id,
    data: { morale: 57.6, shortPay: true, demand: 1, consumed: 1, shortage: 0 },
  };
  const line = "Pay was short, so morale fell by 0.5.";
  const sentence = (viewerId: string) => {
    const [row] = projectEventFeed(world, viewerId, [event]);
    return row;
  };

  const member = sentence(mina.id);
  assert.equal(member.payloadWithheld, false);
  assert.equal(member.summary, `Mina Vale's upkeep was recorded. ${line}`);

  const holder = sentence(pax.id);
  assert.equal(holder.payloadWithheld, true);
  assert.equal(holder.data, null);
  assert.equal(holder.summary, `Mina Vale's upkeep was recorded. ${line}`);

  const mate = sentence(corin.id);
  assert.equal(mate.payloadWithheld, true);
  assert.equal(mate.summary, "Mina Vale's upkeep was recorded.");
  assert.equal(String(mate.summary).includes("0.5"), false);

  const rivalHolder = sentence(mara.id);
  assert.equal(rivalHolder.payloadWithheld, true);
  assert.equal(rivalHolder.summary, "Mina Vale's upkeep was recorded.");
  assert.equal(String(rivalHolder.summary).includes("Pay was short"), false);

  const rivalMate = sentence(bram.id);
  assert.equal(rivalMate.summary, "Mina Vale's upkeep was recorded.");
  assert.equal(String(rivalMate.summary).includes("0.5"), false);
});
