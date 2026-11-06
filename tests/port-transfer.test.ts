import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolvePortTransfer } from "../src/cli/port-transfer-flag.ts";
import { runTick, type TickOptions } from "../src/sim/engine.ts";
import { WorldStore } from "../src/sim/persistence.ts";
import { PORT_TRANSFER_DEFAULT, portPurchases, purchaseTerms } from "../src/sim/port-transfer.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { stateHash } from "../src/sim/state.ts";
import { dynamismReadout } from "../src/tools/dynamism.ts";
import type { SimEvent, WorldState } from "../src/sim/types.ts";

const VC = "verdant-cay";
function run(seed: number, ticks: number, options: TickOptions = {}) {
  const world = createPrototypeWorld(seed); const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...runTick(world, options).events);
  return { world, events };
}
type Draft = { type: string; actorId?: string; settlementId?: string; targetId?: string; data: Record<string, any> };
function purchasesAt(world: WorldState): Draft[] { const out: Draft[] = []; world.tick = 24; portPurchases(world, (d) => out.push(d as Draft)); return out; }

/** Fixture: Free Tide made landless (Cinder Key handed to WG), so both factions have a cause at Verdant Cay; members docked there. */
function contested(wgSurplus: number, ftSurplus: number) {
  const world = createPrototypeWorld(1847);
  world.settlements["cinder-key"].factionId = "world-government";
  for (const id of ["character-02", "character-15", "character-16"]) world.characters[id].locationId = VC;
  for (const [f, surplus] of [["world-government", wgSurplus], ["free-tide", ftSurplus]] as const) {
    world.factions[f].treasury = 0;
    const t = purchaseTerms(world, VC, f);
    world.factions[f].treasury = t.reserve + surplus;
  }
  assert.match(purchaseTerms(world, VC, "world-government").cause!, /^adjacent: /);
  assert.match(purchaseTerms(world, VC, "free-tide").cause!, /^landless: /);
  return world;
}

test("PORT_TRANSFER is off by default; off and explicit false match the 72-tick pins with no purchase", () => {
  assert.equal(PORT_TRANSFER_DEFAULT, false);
  for (const [seed, pin] of [[1847, "7f76e474"], [2718, "976c40bd"], [4096, "08943ea5"]] as const) {
    const a = run(seed, 72); const b = run(seed, 72, { portTransfer: false });
    assert.equal(stateHash(a.world).slice(0, 8), pin);
    assert.equal(stateHash(b.world), stateHash(a.world));
    assert.ok(!a.events.some((e) => e.type === "settlement-purchased"));
  }
});

test("CLI flag: --port-transfer or PORT_TRANSFER=1 turns it on; otherwise off", () => {
  assert.equal(resolvePortTransfer({}, {}), false);
  assert.equal(resolvePortTransfer({ "port-transfer": true }, {}), true);
  assert.equal(resolvePortTransfer({}, { PORT_TRANSFER: "1" }), true);
});

test("Lead ruling 1: several qualify — the largest treasury surplus over reserve buys, regardless of id order", () => {
  const price = 12 * 70;
  for (const [wg, ft, buyer] of [[price + 5000, price + 100, "world-government"], [price + 100, price + 5000, "free-tide"]] as const) {
    const [p] = purchasesAt(contested(wg, ft));
    assert.equal(p.data.factionId, buyer);
    assert.equal(p.data.payerFactionId, buyer);
    assert.deepEqual(p.data.candidates.map((c: { factionId: string }) => c.factionId), buyer === "free-tide" ? ["free-tide", "world-government"] : ["world-government", "free-tide"]);
  }
});

test("Lead ruling 1: a surplus tie goes to the lower faction id", () => {
  const [p] = purchasesAt(contested(2000, 2000));
  assert.equal(p.data.factionId, "free-tide");
  assert.equal(p.data.candidates[0].surplus, p.data.candidates[1].surplus);
});

test("a faction whose treasury does not cover price + reserve does not qualify", () => {
  const [p] = purchasesAt(contested(12 * 70 + 50, 12 * 70 - 1));
  assert.equal(p.data.factionId, "world-government");
  assert.equal(p.data.candidates.length, 1);
  assert.equal(purchasesAt(contested(10, 10)).length, 0);
});

test("Lead ruling 2: the faction buys; the agent is the buyer's first FREE docked member, not the first docked character", () => {
  const world = contested(100, 5000);
  world.characters["character-15"].captivity = { captorId: "character-02", sinceTick: 0 } as never;
  const [p] = purchasesAt(world);
  assert.equal(p.data.factionId, "free-tide");
  // character-02 (WG) is docked and first by id but not of the buyer; character-15 is captive.
  assert.equal(p.actorId, "character-16");
  assert.equal(p.data.ownerId, "character-16");
  assert.equal(p.data.treasuryAfter, Math.round((p.data.treasuryBefore - p.data.price) * 100) / 100);
});

test("flag on: one valid purchase of Verdant Cay, applied to state, counted as a port change; recovery replays", () => {
  const { world, events } = run(1847, 72, { portTransfer: true });
  const buys = events.filter((e) => e.type === "settlement-purchased");
  assert.equal(buys.length, 1);
  const b = buys[0];
  assert.equal(b.tick, 24);
  assert.equal(b.data.price, 12 * (b.data.priceBasis as { garrison: number }).garrison);
  assert.match(String(b.data.cause), /^adjacent: world-government holds glassport/);
  assert.equal(world.settlements[VC].factionId !== null, true);
  const withBuy = dynamismReadout(events).totals.portOwnershipChanges;
  const without = dynamismReadout(events.filter((e) => e.type !== "settlement-purchased")).totals.portOwnershipChanges;
  assert.equal(withBuy, without + 1);
  const seqs = events.map((e) => e.sequence); assert.equal(new Set(seqs).size, seqs.length);
  const directory = mkdtempSync(join(tmpdir(), "open-era-port-transfer-"));
  try {
    const store = new WorldStore(join(directory, "world.sqlite"));
    const w = createPrototypeWorld(4096); store.initialize(w);
    while (w.tick < 300) store.appendTick(runTick(w, { portTransfer: true }).events, w);
    assert.equal(stateHash(store.recover().state), stateHash(w));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
