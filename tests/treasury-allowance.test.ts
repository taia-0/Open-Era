import assert from "node:assert/strict";
import test from "node:test";
import { allowanceCap, drawQuotedBill, projectAllowance } from "../src/dashboard/allowance.ts";
import { projectCharacter, projectFactions } from "../src/dashboard/visibility.ts";
import { dashboardState, fullEventFeed, projectEventFeed } from "../src/dashboard/view-model.ts";
import { runTicks } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { stateHash } from "../src/sim/state.ts";
import type { Character, WorldState } from "../src/sim/types.ts";

function card(world: WorldState, reader: Character, character: Character) {
  return projectCharacter(world, reader, character) as {
    id: string;
    name: string;
    allowanceCap: number | null;
    allowanceRemaining?: number | null;
    allowanceUncapped: boolean | null;
    allowanceRole: string | null;
    allowanceOnDayBoundary: boolean | null;
    allowanceDayStart: number | null;
    allowanceResetsOnTick: number | null;
    allowanceNote: string | null;
    standingOrders: Array<{ lastReport: { summary: string } | null }>;
  };
}

test("seed 1847 shows a full allowance at the day boundary and mid-day, and omits the remainder", () => {
  const opened = createPrototypeWorld(1847);
  const before = stateHash(opened);
  assert.equal(opened.tick, 0);
  assert.equal(allowanceCap(opened), 18);
  const mara = opened.characters["character-01"];
  const bram = opened.characters["character-02"];
  const toma = opened.characters["character-07"];
  const pax = opened.characters["character-14"];
  const mina = opened.characters["character-15"];
  assert.equal(bram.name, "Bram Quill");
  assert.equal(toma.name, "Toma Reef");
  assert.equal(mina.name, "Mina Vale");

  const bramCard = card(opened, mara, bram);
  assert.equal(bramCard.allowanceCap, 18);
  assert.equal(bramCard.allowanceUncapped, false);
  assert.equal(bramCard.allowanceRole, "member");
  assert.equal(bramCard.allowanceOnDayBoundary, true);
  assert.equal(bramCard.allowanceDayStart, 0);
  assert.equal(bramCard.allowanceResetsOnTick, 6);
  assert.equal(bramCard.allowanceNote, null);
  assert.equal("allowanceRemaining" in bramCard, false);

  const holder = card(opened, mara, mara);
  assert.equal(holder.allowanceCap, null);
  assert.equal(holder.allowanceRemaining, null);
  assert.equal(holder.allowanceUncapped, true);
  assert.equal(holder.allowanceRole, "holder");
  assert.equal(holder.allowanceOnDayBoundary, null);
  assert.equal(holder.allowanceNote, null);

  const rivalMember = card(opened, mara, mina);
  assert.equal(rivalMember.allowanceCap, null);
  assert.equal(rivalMember.allowanceRemaining, null);
  assert.equal(rivalMember.allowanceUncapped, null);
  assert.equal(rivalMember.allowanceRole, null);
  const rivalHolder = card(opened, mara, pax);
  assert.equal(rivalHolder.allowanceUncapped, null);
  assert.equal(rivalHolder.allowanceRole, null);

  const factions = projectFactions(opened, mara) as Array<{ id: string; treasury: number | null; treasuryNote: string | null }>;
  assert.equal(factions.find((faction) => faction.id === "world-government")?.treasuryNote, null);
  assert.equal(typeof factions.find((faction) => faction.id === "world-government")?.treasury, "number");
  assert.equal(factions.find((faction) => faction.id === "free-tide")?.treasury, null);
  assert.equal(factions.find((faction) => faction.id === "free-tide")?.treasuryNote, "not visible to you");
  assert.equal(stateHash(opened), before);

  const midday = runTicks(opened, 3);
  assert.equal(midday.state.tick, 3);
  const mid = card(midday.state, midday.state.characters["character-01"], midday.state.characters["character-02"]);
  assert.equal(mid.allowanceCap, 18);
  assert.equal(mid.allowanceRole, "member");
  assert.equal(mid.allowanceUncapped, false);
  assert.equal(mid.allowanceOnDayBoundary, false);
  assert.equal(mid.allowanceDayStart, 0);
  assert.equal(mid.allowanceResetsOnTick, 6);
  assert.equal("allowanceRemaining" in mid, false);
  assert.equal(
    midday.events.some((event) =>
      "treasuryDrawn" in event.data || "purseDrawn" in event.data || "allowanceRemaining" in event.data
    ),
    false,
  );
});

test("a Free Tide reader sees none of World Government's allowance or balance", () => {
  const world = createPrototypeWorld(1847);
  const mara = world.characters["character-01"];
  const pax = world.characters["character-14"];
  const before = stateHash(world);
  const seen = card(world, pax, mara);
  assert.equal(seen.allowanceCap, null);
  assert.equal(seen.allowanceRemaining, null);
  assert.equal(seen.allowanceUncapped, null);
  assert.equal(seen.allowanceRole, null);
  assert.equal(seen.allowanceNote, null);
  const own = card(world, pax, pax);
  assert.equal(own.allowanceUncapped, true);
  assert.equal(own.allowanceRole, "holder");
  assert.equal(own.allowanceCap, null);
  const mate = card(world, pax, world.characters["character-15"]);
  assert.equal(mate.allowanceCap, 18);
  assert.equal(mate.allowanceRole, "member");
  assert.equal("allowanceRemaining" in mate, false);
  const factions = projectFactions(world, pax) as Array<{ id: string; treasury: number | null; treasuryNote: string | null }>;
  assert.equal(factions.find((faction) => faction.id === "world-government")?.treasury, null);
  assert.equal(factions.find((faction) => faction.id === "world-government")?.treasuryNote, "not visible to you");
  assert.equal(factions.find((faction) => faction.id === "free-tide")?.treasuryNote, null);
  assert.equal(stateHash(world), before);
});

test("seed 1847 tick 595 binds the acting commander and does not uncap the captive holder", () => {
  const run = runTicks(createPrototypeWorld(1847), 595);
  const world = run.state;
  assert.equal(world.tick, 595);
  const mara = world.characters["character-01"];
  const jun = world.characters["character-05"];
  assert.equal(jun.name, "Jun Marrow");
  assert.equal(world.factions["world-government"].actingCommanderId, "character-05");
  assert.ok(mara.captivity);
  const before = stateHash(world);
  const holder = card(world, mara, mara);
  assert.equal(holder.allowanceRole, "captive-holder");
  assert.equal(holder.allowanceUncapped, false);
  assert.equal(holder.allowanceCap, null);
  assert.equal(holder.allowanceRemaining, null);
  assert.equal(holder.allowanceNote, "Cannot spend while held.");
  const cover = card(world, mara, jun);
  assert.equal(cover.allowanceRole, "acting-commander");
  assert.equal(cover.allowanceUncapped, false);
  assert.equal(cover.allowanceCap, 18);
  assert.equal(cover.allowanceOnDayBoundary, false);
  assert.equal(cover.allowanceDayStart, 594);
  assert.equal(cover.allowanceResetsOnTick, 600);
  assert.equal("allowanceRemaining" in cover, false);
  assert.equal(cover.allowanceNote, null);
  const asPax = card(world, world.characters["character-14"], jun);
  assert.equal(asPax.allowanceRole, null);
  assert.equal(asPax.allowanceCap, null);
  assert.equal(stateHash(world), before);
});

test("seed 1847 sequence 43 qualifies Toma Reef on the order row Mara can read", () => {
  const run = runTicks(createPrototypeWorld(1847), 1);
  const stored = run.events.find((event) => event.sequence === 43);
  assert.ok(stored);
  assert.equal(stored.type, "standing-order-accepted");
  assert.equal(stored.data.summary, "Toma Reef accepted the trade supplies order.");
  const before = stateHash(run.state);
  const [row] = projectEventFeed(run.state, "character-01", [stored]);
  assert.equal(row?.payloadWithheld, false);
  assert.equal((row?.data as { summary: string }).summary, "Toma Reef accepted the trade supplies order.");
  assert.equal(row?.summary, "Toma Reef (World Government) accepted the trade supplies order.");
  const toma = card(run.state, run.state.characters["character-01"], run.state.characters["character-07"]);
  const report = toma.standingOrders.map((order) => order.lastReport?.summary).find((summary) => summary?.includes("Toma Reef"));
  assert.equal(report, "Toma Reef (World Government) reports the supply transaction at Cinder Key complete and requests confirmation.");
  const storedReport = run.state.characters["character-07"].standingOrders
    .map((order) => order.lastReport?.summary)
    .find((summary) => summary?.includes("Toma Reef"));
  assert.equal(storedReport, "Toma Reef reports the supply transaction at Cinder Key complete and requests confirmation.");
  assert.equal(run.state.characters["character-07"].name, "Toma Reef");
  const bare = /Toma Reef(?! \()|Toma Hale(?! \()/;
  for (const event of run.events) {
    if (!event.type.startsWith("standing-order-") && event.type !== "market-trade") continue;
    const [shown] = projectEventFeed(run.state, "character-01", [event]);
    assert.equal(bare.test(String(shown?.summary)), false, `${event.sequence} ${shown?.summary}`);
  }
  assert.equal(stateHash(run.state), before);
});

test("seed 1847 tick 119 hides the Free Tide balance and keeps the paid amount", () => {
  const run = runTicks(createPrototypeWorld(1847), 119);
  const world = run.state;
  assert.equal(world.tick, 119);
  const release = run.events.find((event) => event.sequence === 13680);
  assert.ok(release);
  const balance = (release.data.ransom as { factionTreasury: number }).factionTreasury;
  assert.equal(balance, 3626.58);
  const before = stateHash(world);
  const line = "Sable Morrow was released from Cinder Key. 13.4 was paid and 103.21 was recorded as debt. Loyalty fell. 13.4 went to the Free Tide Compact treasury. The balance is not visible to you. The ransom line covers only the ransom.";
  const [maraRow] = projectEventFeed(world, "character-01", [release]);
  assert.equal(maraRow?.payloadWithheld, true);
  assert.equal(maraRow?.data, null);
  assert.equal(maraRow?.summary, line);
  assert.equal(String(maraRow?.summary).includes(String(balance)), false);
  assert.equal(String(maraRow?.summary).includes("not visible to you"), true);
  const [paxRow] = projectEventFeed(world, "character-14", [release]);
  assert.equal(paxRow?.data, null);
  assert.equal(
    paxRow?.summary,
    "Sable Morrow was released from Cinder Key. 13.4 was paid and 103.21 was recorded as debt. Loyalty fell. 13.4 went to the Free Tide Compact treasury. The ransom line covers only the ransom.",
  );
  assert.equal(String(paxRow?.summary).includes(String(balance)), false);
  assert.equal(String(paxRow?.summary).includes("not visible to you"), false);
  const view = dashboardState(world, run.events, fullEventFeed(run.events)) as {
    factions: Array<{ id: string; treasury: number | null; treasuryNote: string | null }>;
    events: Array<{ sequence: number; summary: string; data: unknown }>;
  };
  const tide = view.factions.find((faction) => faction.id === "free-tide");
  assert.equal(tide?.treasury, null);
  assert.equal(tide?.treasuryNote, "not visible to you");
  assert.equal(view.events.find((event) => event.sequence === 13680)?.summary, line);
  assert.equal(view.events.find((event) => event.sequence === 13680)?.data, null);
  assert.equal(stateHash(world), before);
});

test("a quoted bill draws the allowance in whole cents, then the purse, or refuses", () => {
  assert.deepEqual(
    drawQuotedBill({ bill: 10.01, uncapped: false, allowanceRemaining: 18, purse: 0, treasury: 100 }),
    { ok: true, treasuryDrawn: 10.01, purseDrawn: 0, allowanceRemaining: 7.99 },
  );
  assert.deepEqual(
    drawQuotedBill({ bill: 20, uncapped: false, allowanceRemaining: 18, purse: 5, treasury: 100 }),
    { ok: true, treasuryDrawn: 18, purseDrawn: 2, allowanceRemaining: 0 },
  );
  assert.deepEqual(
    drawQuotedBill({ bill: 10, uncapped: false, allowanceRemaining: 18, purse: 6, treasury: 4 }),
    { ok: true, treasuryDrawn: 4, purseDrawn: 6, allowanceRemaining: 14 },
  );
  assert.deepEqual(
    drawQuotedBill({ bill: 10, uncapped: false, allowanceRemaining: 18, purse: 3, treasury: 0 }),
    { ok: false, reason: "shortfall" },
  );
  assert.deepEqual(
    drawQuotedBill({ bill: 30, uncapped: false, allowanceRemaining: 18, purse: 5, treasury: 1000 }),
    { ok: false, reason: "shortfall" },
  );
  assert.deepEqual(
    drawQuotedBill({ bill: 30, uncapped: true, allowanceRemaining: 18, purse: 0, treasury: 1000 }),
    { ok: true, treasuryDrawn: 30, purseDrawn: 0, allowanceRemaining: null },
  );
  assert.deepEqual(
    drawQuotedBill({ bill: 12, uncapped: true, allowanceRemaining: 18, purse: 100, treasury: 4 }),
    { ok: false, reason: "shortfall" },
  );
  const zero = drawQuotedBill({ bill: 0, uncapped: false, allowanceRemaining: 18, purse: 0, treasury: 100 });
  assert.deepEqual(zero, { ok: true, treasuryDrawn: 0, purseDrawn: 0, allowanceRemaining: 18 });
  const world = createPrototypeWorld(1847);
  const member = projectAllowance(world, world.characters["character-01"], world.characters["character-02"]);
  assert.equal(member.allowanceCap, 18);
  assert.equal("allowanceRemaining" in member, false);
  world.factions["world-government"].actingCommanderId = "character-05";
  const bound = projectAllowance(world, world.characters["character-01"], world.characters["character-05"]);
  assert.equal(bound.allowanceRole, "acting-commander");
  assert.equal(bound.allowanceUncapped, false);
  assert.equal(bound.allowanceCap, 18);
  delete world.factions["world-government"].actingCommanderId;
});
