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
    `${inlineScript()}\n; return { settlementInspector, setWorld: function (next) { world = next; } };`,
  );
  const renderer = factory(document, windowStub, fetchStub, console) as Renderer;
  renderer.setWorld(state);
  return renderer;
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
    assert.match(html.slice(garrisonIndex, garrisonIndex + 120), /~/, `${settlement.id} must not present an estimated garrison as exact`);
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
  // Stock and price are the same kind of perception: the figures on the board in
  // front of the commander, not a decaying report about them.
  const section = stockSection(html);
  assert.doesNotMatch(section, /estimated/, "a market being stood in is not an estimate");
  assert.doesNotMatch(section, /~/, "direct observation must not be marked approximate");
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
  }
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
    stocks: { provisions: 0, arms: 0, medicine: 0, shipMaterials: 0 },
    prices: { provisions: 0, arms: 0, medicine: 0, shipMaterials: 0 },
  };
  const html = renderer.settlementInspector(unreported);
  const section = stockSection(html);
  assert.match(section, /No current report on this market\./);
  assert.doesNotMatch(section, /resource-row/, "an unreported market must not render stocks as fact");
  assert.doesNotMatch(html, /Trade here/, "a market the commander is not standing in must not offer a trade board");
});
