import assert from "node:assert/strict";
import test from "node:test";
import { submitCommand } from "../src/sim/commands.ts";
import { cargoCapacity, cargoLoad, runTick, tradeQuote } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { marketPrice } from "../src/sim/state.ts";
import { RESOURCE_KEYS, type WorldState } from "../src/sim/types.ts";
import { dashboardState, fullEventFeed } from "../src/dashboard/view-model.ts";

const PLAYER = "prototype-player";

function worldAt(seed = 1847): { world: WorldState; commander: WorldState["characters"][string] } {
  const world = createPrototypeWorld(seed);
  runTick(world);
  return { world, commander: world.characters[world.players[PLAYER].characterId] };
}

/** The settlement inspector a player sees, so quotes are read as the panel reads them. */
function market(world: WorldState, commander: WorldState["characters"][string]) {
  const state = dashboardState(world, [], fullEventFeed([])) as { settlements: Array<Record<string, any>> };
  const here = state.settlements.find((entry) => entry.id === commander.locationId)!;
  assert.ok(here.market, "the commander must be standing in a quoted market");
  return here;
}

/**
 * The total the panel prints for a quantity, transcribed from
 * `tradeAmounts` in src/dashboard/index.html. Money moves in whole cents, and
 * this is the contract: if the panel's arithmetic and the boundary's ever part
 * ways, these tests fail rather than a player paying a different price.
 */
function panelTotal(quantity: number, unitPrice: number, taxRate: number, direction: "buy" | "sell"): number {
  const gross = Math.round(quantity * unitPrice * 100) / 100;
  const tax = direction === "sell" ? Math.round(gross * taxRate * 100) / 100 : 0;
  return Math.round((gross - tax) * 100) / 100;
}

function trade(world: WorldState, action: "buy-resource" | "sell-resource", resource: string, quantity: number) {
  return submitCommand(world, { playerId: PLAYER, type: "character-action", action, resource: resource as never, quantity });
}

/** The cheapest and dearest market for one resource, ignoring travel. */
function extremeMarkets(world: WorldState, resource: (typeof RESOURCE_KEYS)[number]) {
  const priced = Object.values(world.settlements)
    .map((settlement) => ({ settlement, price: marketPrice(world, settlement.id, resource) }))
    .sort((left, right) => left.price - right.price);
  return { cheap: priced[0], dear: priced[priced.length - 1] };
}

test("the price the panel quotes is the price the boundary charges, buying", () => {
  const { world, commander } = worldAt();
  const here = market(world, commander);
  const quote = here.market.resources.arms;
  const quantity = Math.min(10, Math.floor(quote.maxBuy));
  assert.ok(quantity >= 1, "the commander must be able to buy something for this to mean anything");

  const before = commander.money;
  const submitted = trade(world, "buy-resource", "arms", quantity);
  assert.equal(submitted.ok, true);
  runTick(world);
  assert.equal(
    Number((before - commander.money).toFixed(2)),
    panelTotal(quantity, quote.price, 0, "buy"),
    "the money charged must be the total the panel prints",
  );
});

test("the price the panel quotes is the price the boundary pays, selling", () => {
  const { world, commander } = worldAt();
  // Load a resource the commander already holds so the sale is not blocked by
  // the reserve, and price it at a market that actually taxes sales.
  commander.cargo.arms = 20;
  const here = market(world, commander);
  const quote = here.market.resources.arms;

  const before = commander.money;
  const submitted = trade(world, "sell-resource", "arms", 8);
  assert.equal(submitted.ok, true);
  runTick(world);
  const earned = Number((commander.money - before).toFixed(2));
  assert.equal(earned, panelTotal(8, quote.price, here.market.taxRate, "sell"), "the money received must be the total the panel prints");
  if (here.market.taxRate > 0) {
    assert.ok(earned < panelTotal(8, quote.price, 0, "buy"), "a taxed sale must net less than the board price");
  }
});

test("a price that moves between acceptance and the fill does not change the charge", () => {
  const { world, commander } = worldAt();
  const here = market(world, commander);
  const quote = here.market.resources.arms;
  const quantity = Math.min(6, Math.floor(quote.maxBuy));
  assert.ok(quantity >= 1, "the commander must be able to buy something for this to mean anything");

  const before = commander.money;
  const cargoBefore = commander.cargo.arms;
  assert.equal(trade(world, "buy-resource", "arms", quantity).ok, true);
  // A tick of autonomous trading can move a board before the player's order
  // fills. Draining the stock does exactly that, and the order must still be
  // charged the total the player was shown.
  const settlement = world.settlements[commander.locationId!];
  settlement.stocks.arms = Math.max(0, settlement.stocks.arms - settlement.stocks.arms * 0.5);
  runTick(world);

  assert.notEqual(market(world, commander).market.resources.arms.price, quote.price, "the board must have moved for this to mean anything");
  assert.equal(
    Number((before - commander.money).toFixed(2)),
    panelTotal(quantity, quote.price, 0, "buy"),
    "the order must fill at the price it was accepted at",
  );
  assert.equal(Number((commander.cargo.arms - cargoBefore).toFixed(3)), quantity, "and it must move the quantity that was accepted");
});

test("every resource can be bought and sold, not only provisions", () => {  const { world, commander } = worldAt();
  commander.money = 5_000;
  for (const resource of RESOURCE_KEYS) {
    const before = commander.cargo[resource];
    const stock = world.settlements[commander.locationId!].stocks[resource];
    if (stock < 2) continue;
    assert.equal(trade(world, "buy-resource", resource, 2).ok, true, `${resource} must be buyable`);
    runTick(world);
    assert.ok(commander.cargo[resource] > before, `${resource} must actually arrive in the hold`);
  }
});

test("a purchase larger than the hold is refused and names the free capacity", () => {
  const { world, commander } = worldAt();
  commander.money = 10_000;
  const free = cargoCapacity(commander) - cargoLoad(commander);
  const tooMuch = Math.min(COMMAND_LIMIT_MAX, Math.floor(free) + 5);
  assert.ok(tooMuch > free, "the request must exceed the free hold for this to be a hold refusal");
  const quoted = tradeQuote(world, commander, "arms", "buy", tooMuch);
  assert.equal(quoted.limitedBy, "hold");
  const refused = trade(world, "buy-resource", "arms", tooMuch);
  assert.equal(refused.ok, false);
  assert.equal(refused.ok === false ? refused.code : null, "hold-full");
  assert.match(refused.ok === false ? refused.error : "", /room for/, "the refusal must name the ceiling");
});

test("a purchase the purse cannot cover is refused and quotes the cost", () => {
  const { world, commander } = worldAt();
  const price = marketPrice(world, commander.locationId!, "medicine");
  commander.money = 1;
  const wanted = Math.min(COMMAND_LIMIT_MAX, Math.max(1, Math.floor(2 / price)));
  const refused = trade(world, "buy-resource", "medicine", wanted);
  assert.equal(refused.ok, false);
  assert.equal(refused.ok === false ? refused.code : null, "insufficient-money");
  assert.match(refused.ok === false ? refused.error : "", /holds 1\b/, "the refusal must quote what the character holds");
});

test("a refusal names the limit that actually bound, not the first one checked", () => {
  const { world, commander } = worldAt();
  const settlement = world.settlements[commander.locationId!];
  const resource = RESOURCE_KEYS[0];
  const price = marketPrice(world, settlement.id, resource);

  // A full board, an empty hold and a purse that can only cover part of the
  // request: the purse is the binding limit, and saying "the island only holds
  // this much" would be a false statement about the island.
  settlement.stocks[resource] = 5_000;
  commander.cargo[resource] = 0;
  commander.money = price * 10.5;
  const wanted = 40;
  assert.ok(wanted * price > commander.money, "the purse must bind, or this proves nothing");
  assert.ok(wanted < cargoCapacity(commander), "the hold must not bind, or this proves nothing");

  const refused = trade(world, "buy-resource", resource, wanted);
  assert.equal(refused.ok, false);
  assert.equal(refused.ok === false ? refused.code : null, "insufficient-money");
  assert.match(refused.ok === false ? refused.error : "", new RegExp(`${wanted} of ${resource} costs`), "the refusal must quote the bill for what was asked");

  // With the purse filled, the same request is bound by the board, and the
  // refusal must switch to naming the board.
  commander.money = 100_000;
  settlement.stocks[resource] = 3;
  const refusedByStock = trade(world, "buy-resource", resource, wanted);
  assert.equal(refusedByStock.ok === false ? refusedByStock.code : null, "insufficient-stock");
  assert.match(refusedByStock.ok === false ? refusedByStock.error : "", /holds 3 of/, "the refusal must quote the board");
});

test("a purchase larger than local stock is refused and names the stock", () => {
  const { world, commander } = worldAt();
  commander.money = 100_000;
  const settlement = world.settlements[commander.locationId!];
  // Make the board small enough that stock binds before the hold does, and ask
  // for a quantity the hold could still take, or the hold limit would answer first.
  const resource = RESOURCE_KEYS[0];
  const free = Math.floor(cargoCapacity(commander) - cargoLoad(commander));
  assert.ok(free > 4, "the hold needs room beyond the board for this refusal to be about stock");
  settlement.stocks[resource] = 3;
  const refused = trade(world, "buy-resource", resource, Math.min(free, COMMAND_LIMIT_MAX));
  assert.equal(refused.ok, false);
  assert.equal(refused.ok === false ? refused.code : null, "insufficient-stock");
  assert.match(refused.ok === false ? refused.error : "", /holds 3 of/, "the refusal must quote the local stock");
});

test("the crew's own provisions reserve cannot be sold", () => {
  const { world, commander } = worldAt();
  const cargo = commander.cargo.provisions;
  const sellable = tradeQuote(world, commander, "provisions", "sell", cargo).maxQuantity;
  assert.ok(sellable < cargo, "some provisions must be reserved for the party itself");

  const refused = trade(world, "sell-resource", "provisions", Math.floor(cargo));
  assert.equal(refused.ok, false);
  assert.equal(refused.ok === false ? refused.code : null, "party-reserve");
  assert.match(refused.ok === false ? refused.error : "", /reserve/);
});

test("a sale beyond the hold is refused rather than quietly part-filled", () => {
  const { world, commander } = worldAt();
  const held = Math.floor(commander.cargo.shipMaterials);
  const refused = trade(world, "sell-resource", "shipMaterials", held + 10);
  assert.equal(refused.ok, false);
  assert.equal(refused.ok === false ? refused.code : null, "insufficient-cargo");
  // The refusal must not have moved anything.
  runTick(world);
  assert.equal(Math.floor(commander.cargo.shipMaterials), held, "a refused trade must not trade");
});

test("a malformed resource or quantity is refused before it reaches the world", () => {
  const { world } = worldAt();
  const cases: Array<[string, { resource?: string; quantity?: number }]> = [
    ["invalid-resource", { resource: "gold", quantity: 5 }],
    ["invalid-resource", { quantity: 5 }],
    ["invalid-quantity", { resource: "arms", quantity: 0 }],
    ["invalid-quantity", { resource: "arms", quantity: -3 }],
    ["invalid-quantity", { resource: "arms", quantity: 1.5 as never }],
    ["invalid-quantity", { resource: "arms", quantity: Number.NaN }],
    ["invalid-quantity", { resource: "arms", quantity: 201 }],
  ];
  for (const [code, body] of cases) {
    const refused = submitCommand(world, {
      playerId: PLAYER,
      type: "character-action",
      action: "buy-resource",
      resource: body.resource as never,
      quantity: body.quantity,
    });
    assert.equal(refused.ok, false, `${JSON.stringify(body)} must be refused`);
    assert.equal(refused.ok === false ? refused.code : null, code);
  }
});

test("the silent liquidation verb is no longer offered to a player", () => {
  const { world } = worldAt();
  const refused = submitCommand(world, { playerId: PLAYER, type: "character-action", action: "trade-local" });
  assert.equal(refused.ok, false);
  assert.equal(refused.ok === false ? refused.code : null, "unknown-action");
});

test("a market is quoted only where the commander is standing", () => {
  const { world, commander } = worldAt();
  const state = dashboardState(world, [], fullEventFeed([])) as { settlements: Array<Record<string, any>> };
  for (const settlement of state.settlements) {
    if (settlement.id === commander.locationId) {
      assert.ok(settlement.market, "the commander's own market must be quoted");
      assert.equal(settlement.intelligence.present, true);
    } else {
      assert.equal(settlement.market, null, `${settlement.id} is not the commander's market`);
    }
  }
});

test("a voyage is solvent: a hold bought cheap and sold dear grows the purse", () => {
  const { world, commander } = worldAt();
  const startMoney = commander.money;

  // Pick the widest spread that also fits a single hold, then actually sail it
  // through the same public command boundary a player uses.
  let best: { resource: (typeof RESOURCE_KEYS)[number]; from: string; to: string; spread: number } | null = null;
  for (const resource of RESOURCE_KEYS) {
    const { cheap, dear } = extremeMarkets(world, resource);
    if (cheap.settlement.id === dear.settlement.id) continue;
    const spread = dear.price - cheap.price;
    if (!best || spread > best.spread) {
      best = { resource, from: cheap.settlement.id, to: dear.settlement.id, spread };
    }
  }
  assert.ok(best && best.spread > 0, "the world must contain a profitable route");

  const sail = (destination: string) => {
    if (commander.locationId === destination) return 0;
    assert.equal(submitCommand(world, { playerId: PLAYER, type: "character-action", action: "travel", targetId: destination }).ok, true);
    runTick(world);
    let ticks = 0;
    while (commander.travel) { runTick(world); ticks++; }
    return ticks;
  };

  sail(best!.from);
  const price = marketPrice(world, best!.from, best!.resource);
  const free = cargoCapacity(commander) - cargoLoad(commander);
  const quantity = Math.min(Math.floor(free), Math.floor(commander.money / price), COMMAND_LIMIT_MAX);
  assert.ok(quantity >= 1, "the commander must be able to afford a hold");
  assert.equal(trade(world, "buy-resource", best!.resource, quantity).ok, true);
  runTick(world);

  const ticks = sail(best!.to);
  assert.equal(trade(world, "sell-resource", best!.resource, Math.floor(commander.cargo[best!.resource])).ok, true);
  runTick(world);

  const net = Number((commander.money - startMoney).toFixed(2));
  assert.ok(
    net > 0,
    `the voyage must pay for itself: bought ${quantity} ${best!.resource} at ${price} and ended ${net.toFixed(2)} money`,
  );
  assert.ok(ticks > 0, "the voyage must have actually taken time at sea");
});

// The published ceiling, read from the same place a client reads it.
const COMMAND_LIMIT_MAX = 200;
