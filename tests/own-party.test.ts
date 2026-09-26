import assert from "node:assert/strict";
import test from "node:test";
import { dashboardState, fullEventFeed } from "../src/dashboard/view-model.ts";
import { round } from "../src/sim/state.ts";
import { acknowledgeBriefingItem } from "../src/sim/briefing.ts";
import { submitCommand } from "../src/sim/commands.ts";
import {
  provisionDemand,
  provisionResupplyTarget,
  provisionRunway,
  runTick,
} from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import type { Character, WorldState } from "../src/sim/types.ts";

interface BriefingItem {
  id: string;
  severity: string;
  actionRequired: boolean;
  title: string;
  summary: string;
  action?: string;
  settlementId?: string | null;
  aboard?: boolean;
  acknowledgeable?: boolean;
  count?: number;
  throughSequence?: number;
}

interface BriefingView {
  attentionCount: number;
  omittedInfoCount: number;
  items: BriefingItem[];
}

function commanderOf(world: WorldState): Character {
  const player = Object.values(world.players)[0];
  return world.characters[player.characterId];
}

function briefing(world: WorldState, events: ReturnType<typeof runTick>["events"]): BriefingView {
  return (dashboardState(world, events, fullEventFeed(events)) as { briefing: BriefingView }).briefing;
}

/**
 * Ticks a world until the commander reports a shortage, returning how many ticks
 * passed with the hold still fed. Keeps to the public interface: the world is only
 * ever advanced, never poked mid-run.
 */
function ticksUntilStarving(world: WorldState, commander: Character, limit: number): number {
  let fed = 0;
  for (let i = 0; i < limit; i++) {
    const result = runTick(world);
    const upkeep = result.events.find(
      (event) => event.type === "character-upkeep" && event.actorId === commander.id,
    );
    assert.ok(upkeep, "the commander should pay upkeep every tick it is not captive or fighting");
    if ((upkeep.data.shortage as number) > 0) return fed;
    fed++;
  }
  throw new Error(`the party never starved within ${limit} ticks`);
}

test("the quoted runway is the number of ticks the party actually survives", () => {
  const world = createPrototypeWorld(1847);
  const commander = commanderOf(world);
  commander.cargo.provisions = 6;

  const runway = provisionRunway(world, commander);
  assert.equal(runway.demand, provisionDemand(commander));
  assert.ok(runway.runwayTicks > 0, "six provisions should buy more than zero ticks");

  // The gate exists to make a quoted estimate equal the charge that lands. A party
  // that was told it had ten ticks and got eight has been misled by the panel.
  assert.equal(ticksUntilStarving(world, commander, 60), runway.runwayTicks);
});

test("the runway shrinks by exactly one per tick and reports its own consequence", () => {
  const world = createPrototypeWorld(2718);
  const commander = commanderOf(world);
  commander.cargo.provisions = 20;
  const first = provisionRunway(world, commander);

  runTick(world);
  const second = provisionRunway(world, commander);

  assert.equal(first.runwayTicks - second.runwayTicks, 1);
  assert.equal(second.shortage, 0, "a fed party has no shortfall");
  assert.equal(second.shortageHealthPerTick, 0);
  assert.equal(second.shortageTroopLossPerTick, 0);
});

test("a starving party is told what it is losing and is never silenced", () => {
  const world = createPrototypeWorld(4096);
  const commander = commanderOf(world);
  commander.cargo.provisions = 2;
  commander.morale = 40;
  ticksUntilStarving(world, commander, 40);

  const view = briefing(world, []);
  const starving = view.items.find((item) => item.id === "provision:critical");
  assert.ok(starving, "a party with an empty hold must be told");
  assert.equal(starving.actionRequired, true);
  assert.equal(starving.action, "review-provisions");
  assert.match(starving.summary, /morale/);
  assert.match(starving.summary, /will not recover on its own/);

  // The runway numbers and the panel must agree about how bad this is.
  const runway = provisionRunway(world, commander);
  assert.ok(runway.shortageMoralePerTick > 0);
  assert.match(starving.summary, new RegExp(String(runway.shortageMoralePerTick)));

  // And it is a decision, not a notification: it cannot be dismissed while true.
  const attempt = acknowledgeBriefingItem(world, {
    playerId: Object.values(world.players)[0].id,
    itemId: "provision:critical",
  });
  assert.equal(attempt.ok, true, "the endpoint records it, but the item is not acknowledgeable");
  assert.ok(
    briefing(world, []).items.some((item) => item.id === "provision:critical"),
    "an action-required item stays on the panel regardless of acknowledgement",
  );
});

test("provisions are flagged before they run out, and the party is told where food is", () => {
  const world = createPrototypeWorld(2718);
  const commander = commanderOf(world);
  commander.cargo.provisions = 3;

  const view = briefing(world, []);
  const low = view.items.find((item) => item.id === "provision:low");
  assert.ok(low, "a nearly empty hold should be flagged before it empties");
  assert.equal(low.actionRequired, false);
  assert.equal(low.acknowledgeable, true);
  assert.match(low.summary, /ticks/);
  assert.ok(
    !view.items.some((item) => item.id === "provision:critical"),
    "a warned party is not yet a starving one",
  );

  // A warning is a heads-up, so it can be dismissed once understood.
  const attempt = acknowledgeBriefingItem(world, {
    playerId: Object.values(world.players)[0].id,
    itemId: "provision:low",
  });
  assert.equal(attempt.ok, true);
  assert.ok(!briefing(world, []).items.some((item) => item.id === "provision:low"));
});

test("a comfortable hold at a market raises nothing", () => {
  const world = createPrototypeWorld(2718);
  const commander = commanderOf(world);
  commander.cargo.provisions = 400;

  const view = briefing(world, []);
  assert.ok(
    !view.items.some((item) => item.id.startsWith("provision:")),
    "a provisioned party should not be nagged",
  );
});

test("the warning gives days of notice rather than firing once the fire is lit", () => {
  const world = createPrototypeWorld(2718);
  const commander = commanderOf(world);
  const demand = provisionDemand(commander);

  // The first playtest found this alarm sounding at one day of food. A party with
  // roughly four days left is now inside the reserve and should be told; one with
  // more than the reserve plus the voyage home is not yet news.
  commander.cargo.provisions = Math.round(demand * 24);
  assert.equal(provisionRunway(world, commander).runwayTicks, 24);
  assert.ok(
    briefing(world, []).items.some((item) => item.id === "provision:low"),
    "four days of food is inside the reserve",
  );

  commander.cargo.provisions = Math.ceil(demand * 30);
  assert.ok(provisionRunway(world, commander).runwayTicks > 24);
  assert.ok(
    !briefing(world, []).items.some((item) => item.id === "provision:low"),
    "ten days of food is not a warning",
  );
});

test("a one-tick runway is described in the singular", () => {
  const world = createPrototypeWorld(2718);
  const commander = commanderOf(world);
  commander.cargo.provisions = provisionDemand(commander);

  const low = briefing(world, []).items.find((item) => item.id === "provision:low");
  assert.ok(low);
  assert.match(low.summary, /About 1 tick \(/);
  assert.doesNotMatch(low.summary, /1 ticks/);
});

test("the quoted top-up is the amount buy-provisions actually buys", () => {
  const world = createPrototypeWorld(1847);
  const commander = commanderOf(world);
  commander.cargo.provisions = 0;
  commander.money = 10_000;

  // The ceiling was invisible to the first playtest: the hold filled to a number
  // the player was never shown, and buys at the cap silently debited fractions.
  // Quoting it is only honest if it is the same number the command charges against.
  const quoted = provisionRunway(world, commander).resupplyTarget;
  assert.equal(quoted, provisionResupplyTarget(commander));

  submitCommand(world, { playerId: "prototype-player", type: "character-action", action: "buy-provisions" });
  const purchase = runTick(world).events.find((event) => event.type === "market-trade");
  assert.ok(purchase);
  assert.equal(purchase.data.quantity, quoted, "the market sells exactly the quoted ceiling");
  // The hold then reads one tick lower, because upkeep for the same tick lands
  // after the purchase. The first playtest mistook that for a capacity limit.
  assert.equal(commander.cargo.provisions, round(quoted - provisionDemand(commander), 3));
});

test("a voyage that cannot be finished is flagged even with a full hold", () => {
  const world = createPrototypeWorld(2718);
  const commander = commanderOf(world);
  const destinationId = Object.keys(world.settlements).find((id) => id !== commander.locationId)!;

  // Mid-voyage, far from port, with a hold that will not last the crossing. This
  // is the shape of the failure the paged-history session actually hit: not an
  // empty hold, but one that was never going to be enough.
  commander.cargo.provisions = 20;
  commander.locationId = null;
  commander.travel = { fromId: "open-sea", toId: destinationId, totalTicks: 60, remainingTicks: 50 };

  const view = briefing(world, []);
  const flagged = view.items.find((item) => item.id.startsWith("provision:"));
  assert.ok(flagged, "the crossing should be called out before the hold empties");
  assert.match(flagged.summary, /out of reach|short by/);
});

test("attentionCount always equals the items returned", () => {
  const world = createPrototypeWorld(1847);
  const result = runTick(world);
  const view = briefing(world, result.events);

  assert.equal(view.attentionCount, view.items.filter((item) => item.actionRequired || item.severity === "warning").length);
  assert.equal(view.items.length - view.omittedInfoCount <= 10, true);
});

test("no action-required item is dropped when background reports flood the panel", () => {
  const world = createPrototypeWorld(1847);
  const commander = commanderOf(world);
  const settlementId = Object.keys(world.settlements)[0];

  // A starvation decision plus twelve distinct background reports, all competing
  // for one panel. The decision must survive the budget; the background is what
  // should be held back, and it must say so rather than vanish silently.
  commander.cargo.provisions = 0;
  const actors = Object.keys(world.characters).slice(0, 12);
  const flood = actors.map((actorId, index) => ({
    sequence: 9000 + index,
    tick: world.tick,
    type: "scattered-troops-returned",
    actorId,
    data: { returning: 1 },
  }));

  const view = briefing(world, flood as ReturnType<typeof runTick>["events"]);
  assert.ok(
    view.items.some((item) => item.id === "provision:critical"),
    "the decision survives even though the panel is full",
  );
  assert.equal(
    view.attentionCount,
    view.items.filter((item) => item.actionRequired || item.severity === "warning").length,
    "the count describes the list it is attached to",
  );
  assert.ok(view.omittedInfoCount > 0, "held-back background is reported rather than dropped");
  assert.ok(
    view.items.filter((item) => item.actionRequired).every((item) => !item.acknowledgeable),
    "decisions are not acknowledgeable, so a full panel cannot hide them",
  );
});

test("repeated reports about one subject collapse into a single counted item", () => {
  const world = createPrototypeWorld(1847);
  const commander = commanderOf(world);
  const reports = [1, 2, 3, 4, 5].map((index) => ({
    sequence: 5000 + index,
    tick: index,
    type: "scattered-troops-returned",
    actorId: commander.id,
    data: { returning: index },
  }));

  const view = briefing(world, reports as ReturnType<typeof runTick>["events"]);
  const arrived = view.items.filter((item) => item.title.startsWith("scattered troops returned"));
  assert.equal(arrived.length, 1, "five identical reports are one piece of news");
  assert.equal(arrived[0].count, 5);
  assert.equal(arrived[0].throughSequence, 5005);
  assert.match(arrived[0].title, /×5/);
});
