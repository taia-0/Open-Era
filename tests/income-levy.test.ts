import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { projectEventFeed } from "../src/dashboard/view-model.ts";
import { drawQuotedBill } from "../src/sim/allowance.ts";
import { submitCommand } from "../src/sim/commands.ts";
import { runTick, runTicks, tradeAmounts, workGross } from "../src/sim/engine.ts";
import { GOVERNOR_LEVY_RATE, governorId, syncGovernorSeats } from "../src/sim/governor.ts";
import { WorldStore } from "../src/sim/persistence.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { round, stateHash } from "../src/sim/state.ts";
import type { WorldState } from "../src/sim/types.ts";

const PLAYER = "prototype-player";

function mara(world: WorldState) {
  return world.characters[world.players[PLAYER].characterId];
}

function taxed(gross: number, rate: number, levy = 0): number {
  return round(round(gross * rate, 2) + round(gross * levy, 2), 2);
}

function clearSeat(world: WorldState, settlementId: string): void {
  const settlement = world.settlements[settlementId];
  const factionId = settlement.factionId;
  const holderId = world.players[PLAYER].characterId;
  assert.ok(factionId);
  for (const character of Object.values(world.characters)) {
    if (character.factionId !== factionId || character.id === holderId) continue;
    if (character.locationId === settlementId) character.locationId = "verdant-cay";
  }
  const seated = governorId(world, settlementId);
  if (seated) world.characters[seated].factionId = null;
  syncGovernorSeats(world);
  assert.equal(governorId(world, settlementId), null);
}

test("opening seats match the offices table and stay off the world", () => {
  const world = createPrototypeWorld(1847);
  assert.equal(world.characters[governorId(world, "crown-harbor")!].name, "Jun Marrow");
  // Port balance (home starts), matching offices.test.ts: was Esme Dusk / Lio Crow.
  assert.equal(world.characters[governorId(world, "cinder-key")!].name, "Dax Pike");
  assert.equal(world.characters[governorId(world, "glassport")!].name, "Bram Quill");
  assert.equal(governorId(world, "verdant-cay"), null);
  for (const settlement of Object.values(world.settlements)) {
    assert.equal(Object.hasOwn(settlement, "governorId"), false);
  }
  const seated = governorId(world, "crown-harbor")!;
  world.characters[seated].travel = {
    fromId: "crown-harbor",
    toId: "glassport",
    totalTicks: 4,
    remainingTicks: 4,
  };
  world.characters[seated].locationId = null;
  assert.equal(governorId(world, "crown-harbor"), seated, "sailing does not clear the seat");
  world.characters[seated].captivity = {
    captorFactionId: "free-tide",
    settlementId: "crown-harbor",
    capturedTick: 0,
    mandatoryReleaseTick: 84,
    cause: "major-defeat",
    displayedRisk: "high",
    scatteredTroops: { ...world.characters[seated].troops },
    releaseDestinationId: null,
  };
  assert.equal(governorId(world, "crown-harbor"), seated, "captivity does not clear the seat");
});

test("work and a sale pay the faction tax plus the levy while a governor is seated", () => {
  const world = createPrototypeWorld(1847);
  const commander = mara(world);
  assert.equal(world.characters[governorId(world, commander.locationId!)!].name, "Jun Marrow");
  const gross = workGross(commander);
  const rate = world.factions["world-government"].taxRate;
  const treasuryBefore = world.factions["world-government"].treasury;
  const purseBefore = commander.money;
  assert.equal(submitCommand(world, { playerId: PLAYER, type: "character-action", action: "work" }).ok, true);
  const workedTick = runTick(world);
  const worked = workedTick.events.find((event) => event.type === "worked" && event.actorId === commander.id);
  assert.ok(worked);
  const levy = round(gross * GOVERNOR_LEVY_RATE, 2);
  const rateTax = round(gross * rate, 2);
  assert.ok(levy > 0 && rateTax > 0);
  assert.equal(worked.data.gross, gross);
  assert.equal(worked.data.tax, taxed(gross, rate, GOVERNOR_LEVY_RATE));
  assert.notEqual(worked.data.tax, rateTax);
  assert.notEqual(worked.data.tax, levy);
  assert.equal(worked.data.characterMoney, round(purseBefore + gross - taxed(gross, rate, GOVERNOR_LEVY_RATE), 2));
  // Two World Government seats draw 18 each before the work tax is credited.
  assert.equal(worked.data.factionTreasury, round(treasuryBefore - 36 + taxed(gross, rate, GOVERNOR_LEVY_RATE), 2));
  assert.equal(Object.hasOwn(worked.data, "treasuryDrawn"), false);
  const [row] = projectEventFeed(world, commander.id, [worked]);
  assert.equal(row.summary, `Mara Vane worked at Crown Harbor. Tax of ${worked.data.tax} went to the treasury.`);

  const saleWorld = createPrototypeWorld(1847);
  const seller = mara(saleWorld);
  seller.cargo.arms = 20;
  const quantity = 2;
  assert.equal(submitCommand(saleWorld, {
    playerId: PLAYER,
    type: "character-action",
    action: "sell-resource",
    resource: "arms",
    quantity,
  }).ok, true);
  const soldTick = runTick(saleWorld);
  const sold = soldTick.events.find((event) => event.type === "market-trade" && event.actorId === seller.id);
  assert.ok(sold);
  assert.equal(sold.data.direction, "sold");
  const saleGross = sold.data.gross as number;
  const saleRate = saleWorld.factions["world-government"].taxRate;
  assert.equal(sold.data.tax, taxed(saleGross, saleRate, GOVERNOR_LEVY_RATE));
  assert.equal(
    sold.data.tax,
    tradeAmounts(quantity, sold.data.unitPrice as number, saleRate, "sell", GOVERNOR_LEVY_RATE).tax,
  );
  assert.equal(Object.hasOwn(sold.data, "treasuryDrawn"), false);
  const [saleRow] = projectEventFeed(saleWorld, seller.id, [sold]);
  assert.match(String(saleRow.summary), /^Mara Vane sold 2 arms at Crown Harbor/);
  assert.match(String(saleRow.summary), /Tax of .+ went to the treasury\.$/);
});

test("an empty seat charges the faction tax and no levy", () => {
  const world = createPrototypeWorld(1847);
  const commander = mara(world);
  clearSeat(world, "crown-harbor");
  const gross = workGross(commander);
  const rate = 0.14;
  assert.equal(submitCommand(world, { playerId: PLAYER, type: "character-action", action: "work" }).ok, true);
  const tick = runTick(world);
  const worked = tick.events.find((event) => event.type === "worked" && event.actorId === commander.id);
  assert.ok(worked);
  assert.equal(worked.data.tax, taxed(gross, rate, 0));
  assert.equal(governorId(world, "crown-harbor"), null);

  const neutral = createPrototypeWorld(1847);
  const traveler = mara(neutral);
  traveler.locationId = "verdant-cay";
  assert.equal(governorId(neutral, "verdant-cay"), null);
  assert.equal(submitCommand(neutral, { playerId: PLAYER, type: "character-action", action: "work" }).ok, true);
  const neutralTick = runTick(neutral);
  const neutralWork = neutralTick.events.find((event) => event.type === "worked" && event.actorId === traveler.id);
  assert.ok(neutralWork);
  assert.equal(neutralWork.data.tax, 0);
});

test("a buy still draws the uncapped holder bill from the treasury and pays no levy", () => {
  const bill = drawQuotedBill({
    bill: 17.64,
    uncapped: true,
    allowanceRemaining: 0,
    purse: 40,
    treasury: 100,
  });
  assert.equal(bill.ok, true);
  if (!bill.ok) return;
  assert.equal(bill.treasuryDrawn, 17.64);
  assert.equal(bill.purseDrawn, 0);

  const world = createPrototypeWorld(1847);
  const commander = mara(world);
  const purseBefore = commander.money;
  const settlement = world.settlements[commander.locationId!];
  const quantity = 2;
  assert.equal(submitCommand(world, {
    playerId: PLAYER,
    type: "character-action",
    action: "buy-resource",
    resource: "arms",
    quantity,
  }).ok, true);
  const tick = runTick(world);
  const bought = tick.events.find((event) => event.type === "market-trade" && event.actorId === commander.id);
  assert.ok(bought);
  assert.equal(bought.data.direction, "bought");
  assert.equal(bought.data.tax, 0);
  assert.equal(bought.data.treasuryDrawn, bought.data.gross);
  assert.equal(bought.data.purseDrawn, 0);
  assert.equal(bought.data.characterMoney, purseBefore);
  assert.equal(commander.money, purseBefore);
  assert.equal(settlement.factionId, "world-government");
});

test("recovery keeps the sticky seat and the levy", () => {
  const ticks = 12;
  const splitAt = 5;
  const continuous = runTicks(createPrototypeWorld(1847), ticks);
  const directory = mkdtempSync(join(tmpdir(), "open-era-levy-recovery-"));
  try {
    const databasePath = join(directory, "world.sqlite");
    const store = new WorldStore(databasePath);
    const world = createPrototypeWorld(1847);
    store.initialize(world);
    for (let index = 0; index < splitAt; index += 1) {
      const result = runTick(world);
      store.appendTick(result.events, world);
    }
    store.close();

    const reopened = new WorldStore(databasePath);
    const recovered = reopened.recover();
    assert.ok(recovered.replayedEvents > 0);
    assert.equal(governorId(recovered.state, "crown-harbor"), governorId(runTicks(createPrototypeWorld(1847), splitAt).state, "crown-harbor"));
    for (let index = splitAt; index < ticks; index += 1) runTick(recovered.state);
    reopened.close();
    assert.equal(stateHash(recovered.state), stateHash(continuous.state));
    assert.equal(governorId(recovered.state, "cinder-key"), governorId(continuous.state, "cinder-key"));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
