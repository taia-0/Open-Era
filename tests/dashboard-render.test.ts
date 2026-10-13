import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dashboardState, fullEventFeed } from "../src/dashboard/view-model.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";

/**
 * The dashboard panel is built in the browser, so `tsc` never sees this markup
 * and the view-model tests never execute it. These tests run the shipped inline
 * script against a real projection, which is the only way to catch a
 * presentation regression such as an estimate drawn in the same style as an
 * owned record.
 */
function inlineScript(): string {
  const html = readFileSync(new URL("../src/dashboard/index.html", import.meta.url), "utf8");
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match, "the dashboard must ship one inline script");
  return match[1];
}

function stubElement() {
  return {
    innerHTML: "",
    textContent: "",
    hidden: false,
    className: "",
    value: "",
    scrollTop: 0,
    scrollHeight: 0,
    selectedOptions: [] as Array<{ value: string }>,
    options: [] as Array<{ value: string }>,
    classList: { add() {}, remove() {}, toggle() {} },
    querySelectorAll: () => [],
    addEventListener() {},
  };
}

type Renderer = {
  setWorld: (world: Record<string, unknown>) => void;
  settlementInspector: (settlement: Record<string, unknown>) => string;
  characterInspector: (character: Record<string, unknown>) => string;
  renderHeader: () => void;
  headerHtml: () => string;
  briefTitle: () => string;
};

function rendererFor(state: Record<string, unknown>): Renderer {
  const elements = new Map<string, ReturnType<typeof stubElement>>();
  const document = {
    getElementById: (id: string) => {
      if (!elements.has(id)) elements.set(id, stubElement());
      return elements.get(id)!;
    },
    querySelectorAll: () => [],
    addEventListener() {},
  };
  const windowStub = { setTimeout, clearTimeout, addEventListener() {} };
  const fetchStub = async () => ({ ok: true, json: async () => state });
  const factory = new Function(
    "document",
    "window",
    "fetch",
    "console",
    `${inlineScript()}\n; return { settlementInspector, characterInspector, renderHeader, renderFooter, setWorld: function (next) { world = next; } };`,
  );
  const renderer = factory(document, windowStub, fetchStub, console) as Omit<Renderer, "headerHtml" | "briefTitle"> & {
    renderFooter: () => void;
  };
  renderer.setWorld(state);
  return {
    ...renderer,
    headerHtml: () => elements.get("header-stats")?.innerHTML ?? "",
    briefTitle: () => {
      renderer.renderFooter();
      return elements.get("brief-title")?.textContent ?? "";
    },
  };
}

function projectedState(): Record<string, unknown> {
  const world = createPrototypeWorld(1847);
  // Events live in the SQLite store, not the world, and this panel does not
  // read them. An empty feed is enough to reach the settlement projection.
  return dashboardState(world, [], fullEventFeed([]));
}

/** The same projection, but with the commander standing on a given island. */
function projectedStateAt(settlementId: string): Record<string, unknown> {
  const world = createPrototypeWorld(1847);
  const commander = world.characters[world.players["prototype-player"].characterId];
  commander.locationId = settlementId;
  commander.travel = null;
  return dashboardState(world, [], fullEventFeed([]));
}

function stockSection(html: string): string {
  const start = html.indexOf("<h3>Stocks and prices");
  const end = html.indexOf("<h3>Parties present");
  assert.ok(start >= 0 && end > start, "the inspector must render a market section");
  return html.slice(start, end);
}

test("an estimated market is labelled with its age and approximate values", () => {
  const state = projectedState();
  const renderer = rendererFor(state);
  const settlements = state.settlements as Array<Record<string, any>>;
  const estimated = settlements.filter((entry) => entry.intelligence && !entry.intelligence.exact);
  assert.ok(estimated.length > 0, "the scenario must contain a market the commander does not own");

  for (const settlement of estimated) {
    const html = renderer.settlementInspector(settlement);
    const section = stockSection(html);
    assert.match(section, /estimated/, `${settlement.id} must label its rows as an estimate`);
    assert.match(section, /~/, `${settlement.id} must mark estimated values as approximate`);
    const age = settlement.intelligence.ageTicks;
    if (age == null) {
      assert.match(section, /age unknown/, `${settlement.id} must admit an unknown report age`);
    } else {
      assert.match(section, new RegExp(`${age} ticks old`), `${settlement.id} must state how old the report is`);
    }
    // The statistics that come from a report rather than the ground follow the same rule.
    const garrisonIndex = html.indexOf("<span>Garrison</span>");
    const garrison = html.slice(garrisonIndex, garrisonIndex + 180);
    assert.match(garrison, /~/, `${settlement.id} must not present an estimated garrison as exact`);
    const garrisonAge = settlement.garrisonIntelligence.ageTicks;
    assert.equal(garrisonAge, age, `${settlement.id} garrison age must match the report age`);
    assert.match(garrison, new RegExp(`${garrisonAge} ticks old`), `${settlement.id} must say how old the garrison estimate is`);
  }
});

test("standing on a foreign island shows its garrison and its market as direct observation", () => {
  const state = projectedStateAt("cinder-key");
  const renderer = rendererFor(state);
  const settlement = (state.settlements as Array<Record<string, any>>).find((entry) => entry.id === "cinder-key")!;
  assert.equal(settlement.intelligence.exact, false, "an island the commander does not own is not an owned record");
  assert.equal(settlement.intelligence.present, true, "standing on the island is direct observation");

  const html = renderer.settlementInspector(settlement);
  assert.match(html, /Direct observation of this island/, "the commander must be told the figures are what they can see");
  const garrisonIndex = html.indexOf("<span>Garrison</span>");
  const garrison = html.slice(garrisonIndex, garrisonIndex + 120);
  // A garrison read off the ground is exact; marking it approximate would be the
  // same defect as marking an estimate exact, pointing the other way.
  assert.doesNotMatch(garrison, /~/, "a garrison read from the ground must not be marked approximate");
  assert.doesNotMatch(garrison, /unknown/, "standing on the island must reveal its garrison");
  assert.doesNotMatch(garrison, /ticks old/, "a garrison read from the ground is present, not a dated estimate");
  // Stock and price are the same kind of perception: the figures on the board in
  // front of the commander, not a decaying report about them.
  const section = stockSection(html);
  assert.doesNotMatch(section, /estimated/, "a market being stood in is not an estimate");
  assert.doesNotMatch(section, /~/, "direct observation must not be marked approximate");
});

test("the settlement panel states the secession readout when the row has one", () => {
  const state = projectedState();
  const renderer = rendererFor(state);
  const settlements = state.settlements as Array<Record<string, any>>;
  const owned = settlements.find((entry) => entry.id === "crown-harbor")!;
  const foreign = settlements.find((entry) => entry.id === "cinder-key")!;
  assert.ok(owned.secession);
  assert.equal(foreign.secession, null);
  const ownedHtml = renderer.settlementInspector(owned);
  assert.match(ownedHtml, /<h3>Secession<\/h3>/);
  assert.match(ownedHtml, /The owner gate does not pass\./);
  assert.match(ownedHtml, /0 would follow\./);
  assert.match(ownedHtml, /The garrison would not follow\./);
  assert.match(ownedHtml, /With the tax line open, \d+ would follow\./);
  assert.match(ownedHtml, /The garrison would follow\./);
  const foreignHtml = renderer.settlementInspector(foreign);
  assert.doesNotMatch(foreignHtml, /<h3>Secession<\/h3>/);

  const beside = projectedStateAt("cinder-key");
  const besideRenderer = rendererFor(beside);
  const cinder = (beside.settlements as Array<Record<string, any>>).find((entry) => entry.id === "cinder-key")!;
  const besideHtml = besideRenderer.settlementInspector(cinder);
  assert.match(besideHtml, /Who would follow is not on this report\./);
  assert.match(besideHtml, /who would follow is not on this report\./);
});

test("an owned market is never marked approximate", () => {  const state = projectedState();
  const renderer = rendererFor(state);
  const settlements = state.settlements as Array<Record<string, any>>;
  const owned = settlements.filter((entry) => entry.intelligence?.exact);
  assert.ok(owned.length > 0, "the commander must own at least one market");

  for (const settlement of owned) {
    const section = stockSection(renderer.settlementInspector(settlement));
    assert.doesNotMatch(section, /~/, `${settlement.id} is an owned record and must not be marked approximate`);
    assert.doesNotMatch(section, /estimated/, `${settlement.id} is an owned record and must not be labelled estimated`);
    assert.match(section, /own use/, `${settlement.id} must show the live board's own-use drift`);
    assert.match(section, /if no one trades/, `${settlement.id} must say the drift is not the next quote`);
  }
});

test("a sea count uses the row's kind and the check-in title names background lines", () => {
  const state = projectedState();
  const briefing = state.briefing as { attentionLabel: string };
  const renderer = rendererFor(state);
  assert.equal(renderer.briefTitle(), briefing.attentionLabel);

  const characters = state.characters as Array<Record<string, any>>;
  const [template] = characters;
  const card = {
    ...template,
    id: "sea-card",
    name: "Sable Morrow",
    troops: null,
    skills: null,
    partySighting: { troops: 21, ageTicks: 2 },
    seaSighting: { kind: "sharing", troops: 19, ageTicks: 0 },
    standingOrders: [],
    activeOrderAssessment: null,
    relationship: null,
    activeGoal: null,
    plan: null,
    controller: { kind: "autonomous" },
    locationId: null,
    travel: { remainingTicks: 1 },
    factionId: null,
  };
  const html = renderer.characterInspector(card);
  assert.match(html, /Sighted troops/);
  assert.match(html, /21/);
  assert.match(html, />sharing</);
  assert.match(html, /19/);
  assert.equal((html.match(/Sighted troops/g) ?? []).length, 1);
});

test("a held card names the captor beside live troops 0 and an empty port list", () => {
  const state = projectedState();
  const renderer = rendererFor(state);
  const characters = state.characters as Array<Record<string, any>>;
  const [template] = characters;
  const card = {
    ...template,
    id: "mina-card",
    name: "Mina Vale",
    troops: { count: 0, experience: 1, discipline: 1 },
    troopsNote: "0 with Mina Vale; 12 held by World Government. The experience and discipline are the troops now held by World Government.",
    partySighting: null,
    seaSighting: null,
    skills: null,
    captiveIntel: {
      troops: 12,
      ageTicks: 1,
      observedTick: 71,
      partyPower: 60.244,
      leadership: 25,
      ports: [],
      portsNote: "Mina Vale named no ports. The list may be incomplete.",
    },
    standingOrders: [],
    activeOrderAssessment: null,
    relationship: null,
    activeGoal: null,
    plan: null,
    releaseSighting: null,
    controller: { kind: "autonomous" },
  };
  const html = renderer.characterInspector(card);
  assert.match(html, /0 with Mina Vale; 12 held by World Government\. The experience and discipline are the troops now held by World Government\./);
  assert.match(html, /Mina Vale named no ports\. The list may be incomplete\./);
  assert.doesNotMatch(html, /No port report from this prisoner/);
});

test("the header runway reads the party's runwayTicks", () => {
  const state = projectedState();
  const party = state.party as { runwayTicks: number; runwayDays: number };
  const renderer = rendererFor(state);
  renderer.renderHeader();
  const header = renderer.headerHtml();
  assert.match(header, new RegExp(`Lasts <strong>${party.runwayTicks} ticks`));
  assert.doesNotMatch(header, /unknown/, "a known runway must not render as unknown");
});

test("a market with no report says so instead of drawing zero stocks as fact", () => {
  const state = projectedState();
  const renderer = rendererFor(state);
  const [template] = state.settlements as Array<Record<string, unknown>>;
  // A settlement the commander neither owns nor stands in: no report, and so no
  // trade board either. Trading needs a market they are physically at.
  const unreported = {
    ...template,
    id: "unreported",
    intelligence: null,
    garrison: null,
    market: null,
    stocks: null,
    prices: null,
    priceDrift: null,
  };
  const html = renderer.settlementInspector(unreported);
  const section = stockSection(html);
  assert.match(section, /No current report on this market\./);
  assert.doesNotMatch(section, /resource-row/, "an unreported market must not render stocks as fact");
  assert.doesNotMatch(html, /Trade here/, "a market the commander is not standing in must not offer a trade board");
});
