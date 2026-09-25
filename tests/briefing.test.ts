import assert from "node:assert/strict";
import test from "node:test";
import { dashboardState, fullEventFeed } from "../src/dashboard/view-model.ts";
import { acknowledgeBriefingItem, assignReportingOfficer } from "../src/sim/briefing.ts";
import { runTick } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";

interface BriefingView {
  reportingOfficer: { id: string; name: string } | null;
  items: Array<{
    id: string;
    severity: string;
    actionRequired: boolean;
    action?: string;
    routed?: boolean;
    throughSequence?: number;
  }>;
}

function briefing(world: ReturnType<typeof createPrototypeWorld>, events: ReturnType<typeof runTick>["events"]): BriefingView {
  return (dashboardState(world, events, fullEventFeed(events)) as { briefing: BriefingView }).briefing;
}

test("a reporting officer bundles routine updates without absorbing decisions", () => {
  const world = createPrototypeWorld(1847);
  const result = runTick(world);
  const view = briefing(world, result.events);
  const digest = view.items.find((item) => item.routed);
  const completion = view.items.find((item) => item.action === "confirm-order");

  assert.equal(view.reportingOfficer?.id, "character-05");
  assert.ok(digest);
  assert.ok(digest.throughSequence);
  assert.ok(completion?.actionRequired);
  assert.equal(completion?.routed, undefined);

  const acknowledged = acknowledgeBriefingItem(world, {
    playerId: "prototype-player",
    itemId: digest.id,
    routineThroughSequence: digest.throughSequence,
  });
  assert.equal(acknowledged.ok, true);
  assert.ok(!briefing(world, result.events).items.some((item) => item.routed));

  const blocked = acknowledgeBriefingItem(world, {
    playerId: "prototype-player",
    itemId: completion!.id,
  });
  assert.deepEqual(blocked, {
    ok: false,
    code: "action-required",
    error: "Unresolved decisions cannot be acknowledged away",
  });
  assert.ok(briefing(world, result.events).items.some((item) => item.id === completion!.id));
});

test("acknowledged informational exceptions leave the active briefing", () => {
  const world = createPrototypeWorld(1847);
  const result = runTick(world);
  const before = briefing(world, result.events);
  const informational = before.items.find((item) => !item.actionRequired && !item.routed);
  assert.ok(informational);

  const acknowledgement = acknowledgeBriefingItem(world, {
    playerId: "prototype-player",
    itemId: informational.id,
  });
  assert.equal(acknowledgement.ok, true);
  assert.ok(!briefing(world, result.events).items.some((item) => item.id === informational.id));
});

test("the player may appoint an eligible reporting officer but not an enemy", () => {
  const world = createPrototypeWorld(1847);
  const assignment = assignReportingOfficer(world, {
    playerId: "prototype-player",
    characterId: "character-10",
  });
  assert.equal(assignment.ok, true);
  assert.equal(world.players["prototype-player"].reportingOfficerId, "character-10");

  assert.deepEqual(assignReportingOfficer(world, {
    playerId: "prototype-player",
    characterId: "character-14",
  }), {
    ok: false,
    code: "ineligible-officer",
    error: "A reporting officer must be an autonomous subordinate in the commander's faction",
  });
});
