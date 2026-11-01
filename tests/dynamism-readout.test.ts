import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runTick } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { stateHash } from "../src/sim/state.ts";
import type { SimEvent } from "../src/sim/types.ts";
import { compareReadouts, dynamismReadout, entropyBits, firstDivergentTick, readoutTable } from "../src/tools/dynamism.ts";

let sequence = 0;
const ev = (tick: number, type: string, extra: Partial<SimEvent> = {}): SimEvent => ({ sequence: ++sequence, tick, type, data: {}, ...extra });

test("entropy: zero for one kind, one bit for two equal kinds, log2(4) for four", () => {
  assert.equal(entropyBits([5]), 0);
  assert.equal(entropyBits([]), 0);
  assert.equal(entropyBits([3, 3]), 1);
  assert.equal(entropyBits([1, 1, 1, 1]), 2);
});

test("counts each metric by its definition", () => {
  const events = [
    ev(1, "settlement-claimed", { settlementId: "a", data: { factionId: "x", previousFactionId: null } }),
    ev(2, "settlement-claimed", { settlementId: "a", data: { factionId: "x", previousFactionId: "x" } }),
    ev(3, "secession-declared", { settlementId: "b", data: {} }),
    ev(4, "character-deserted"), ev(5, "character-captured"), ev(6, "captivity-released"), ev(7, "character-died"),
    ev(24, "tax-rate-set", { targetId: "f", data: { factionId: "f", taxRate: 0.09, previousTaxRate: 0.08 } }),
    ev(48, "tax-rate-set", { targetId: "f", data: { factionId: "f", taxRate: 0.08, previousTaxRate: 0.09 } }),
    ev(72, "tax-rate-set", { targetId: "g", data: { factionId: "g", taxRate: 0.1, previousTaxRate: 0.1 } }),
  ];
  const { totals, rateChangesByFaction } = dynamismReadout(events);
  assert.deepEqual(totals, { portOwnershipChanges: 2, portsChangedHands: 2, secessions: 1, desertions: 1, captures: 1, releases: 1, deaths: 1, rateChanges: 2, rateRaises: 1, rateCuts: 1, decisions: 0 });
  assert.deepEqual(rateChangesByFaction, { f: 2 });
});

test("action variety: per-actor entropy over decision kinds, below the minimum left out", () => {
  const events = [
    ...Array.from({ length: 10 }, (_, i) => ev(i, "decision-made", { actorId: "p", data: { goal: i % 2 ? "work" : "rest" } })),
    ...Array.from({ length: 10 }, (_, i) => ev(i, "decision-made", { actorId: "q", data: { goal: "work" } })),
    ev(1, "decision-made", { actorId: "r", data: { goal: "travel" } }),
  ];
  const variety = dynamismReadout(events, { minDecisions: 10 }).actionVariety;
  assert.equal(variety.actorsMeasured, 2);
  assert.deepEqual(variety.actors.map((a) => [a.actorId, a.entropyBits, a.normalized]), [["p", 1, 1], ["q", 0, 0]]);
  assert.equal(variety.meanEntropyBits, 0.5);
  assert.equal(variety.globalKinds, 3);
});

test("windows: (0, W], (W, 2W], ... and they sum to the totals", () => {
  const events = [ev(0, "character-died"), ev(240, "character-died"), ev(241, "character-died"), ev(480, "character-deserted")];
  const readout = dynamismReadout(events, { windowTicks: 240 });
  assert.deepEqual(readout.windows.map((w) => [w.fromTick, w.toTick, w.deaths, w.desertions]), [[0, 240, 2, 0], [241, 480, 1, 1]]);
  assert.match(readoutTable(readout), /\| \*\*all\*\* \|/);
});

test("comparison and divergence against a baseline", () => {
  const base = [ev(1, "worked", { actorId: "a" }), ev(2, "character-died", { actorId: "b" })];
  const run = [ev(1, "worked", { actorId: "a" }), ev(2, "character-died", { actorId: "c" }), ev(3, "character-died")];
  assert.equal(firstDivergentTick(base, base), null);
  assert.equal(firstDivergentTick(run, base), 2);
  const comparison = compareReadouts(dynamismReadout(run), dynamismReadout(base), firstDivergentTick(run, base));
  assert.deepEqual(comparison.totals.deaths, { run: 2, baseline: 1, delta: 1 });
});

test("the readout is pure: no engine import, and reading a real log leaves the world hash alone", () => {
  const source = readFileSync(new URL("../src/tools/dynamism.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /from "\.\.\/sim\/(engine|state|scenario|rng)\.ts"/);
  const world = createPrototypeWorld(1847);
  const events: SimEvent[] = [];
  for (let tick = 0; tick < 72; tick += 1) events.push(...runTick(world).events);
  const before = stateHash(world);
  const readout = dynamismReadout(events);
  assert.equal(stateHash(world), before);
  assert.equal(readout.events, events.length);
  assert.equal(readout.totals.decisions, events.filter((event) => event.type === "decision-made").length);
  assert.deepEqual(dynamismReadout(events), readout);
});
