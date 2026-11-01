import assert from "node:assert/strict";
import test from "node:test";
import { ActionPickerReplay, stubArgmaxPicker, stubUniformPicker, type ActionPicker, type ActionPickerRecord } from "../src/sim/ai-action-picker.ts";
import { parsePickerFactions, WG_FACTION_ID, WG_NUDGE_PRIOR, WG_NUDGE_WEIGHT, WG_PICKER_DEFAULT_CAP, WG_PICKER_DEFAULT_SPEND_CAP_USD, wgNudge, type WgNudge } from "../src/sim/ai-wg-picker.ts";
import { runTick, wgPickerRole, type TickAiOptions } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { commandHolderId, stateHash } from "../src/sim/state.ts";
import type { WorldState } from "../src/sim/types.ts";

type Rec = { tick: number; actorId: string; picker: ActionPickerRecord & { wg?: WgNudge } };
function run(world: WorldState, ticks: number, ai?: TickAiOptions) {
  const records: Rec[] = [];
  for (let i = 0; i < ticks; i++) for (const e of runTick(world, ai ? { ai } : {}).events) {
    const picker = (e.data as { ai?: { picker?: Rec["picker"] } } | undefined)?.ai?.picker;
    if (picker) records.push({ tick: e.tick, actorId: e.actorId!, picker });
  }
  return records;
}
const wgOnly = (picker: ActionPicker, extra: Partial<TickAiOptions> = {}): TickAiOptions => ({ picker, pickerFactions: [WG_FACTION_ID], ...extra });

test("ruling 1 caps and ruling 3 blend constants; the factions flag parses and rejects unknown factions", () => {
  assert.equal(WG_PICKER_DEFAULT_CAP, 1853);
  assert.equal(WG_PICKER_DEFAULT_SPEND_CAP_USD, 0.11);
  assert.deepEqual([WG_NUDGE_PRIOR, WG_NUDGE_WEIGHT], [0.95, 0.3]);
  assert.deepEqual(parsePickerFactions("free-tide,world-government"), ["free-tide", "world-government"]);
  assert.equal(parsePickerFactions(undefined), undefined);
  assert.throws(() => parsePickerFactions("pirates"));
});

test("the default (unset) equals pickerFactions [free-tide] byte for byte, and consults no WG member", () => {
  const a = createPrototypeWorld(2718); const b = createPrototypeWorld(2718);
  const ra = run(a, 200, { picker: stubArgmaxPicker() });
  const rb = run(b, 200, { picker: stubArgmaxPicker(), pickerFactions: ["free-tide"] });
  assert.equal(stateHash(a), stateHash(b));
  assert.equal(ra.length, rb.length);
  assert.ok(ra.every((r) => !r.picker.wg));
});

test("nudge: q = 0.7·0.95 + 0.3·p; kept when u < q, else Jev's top other legal id", () => {
  const base = { outcome: "model", legal: ["a", "b", "c"], scorerPick: "a", jevDistribution: { a: 0.1, b: 0.3, c: 0.6 } } as unknown as ActionPickerRecord;
  const n = wgNudge(base, "governor", 1847, "character-02", 10);
  assert.equal(n.p, 0.1);
  assert.equal(n.blend, Math.round((0.7 * 0.95 + 0.3 * 0.1) * 1e6) / 1e6);
  assert.equal(n.alternative, "c");
  assert.equal(n.kept, n.u! < n.blend!);
  const fallback = wgNudge({ ...base, outcome: "fallback", jevDistribution: null } as ActionPickerRecord, "governor", 1847, "character-02", 10);
  assert.deepEqual([fallback.kept, fallback.p, fallback.blend, fallback.u], [true, null, null, null]);
});

test("v1: world-government only consults WG governors, never the player holder, rails hold, and replay is exact with 0 calls", () => {
  const world = createPrototypeWorld(1847);
  const holder = commandHolderId(world, WG_FACTION_ID)!;
  assert.equal(world.characters[holder].controller.kind, "human");
  const records = run(world, 400, wgOnly(stubUniformPicker()));
  assert.ok(records.length > 0);
  assert.ok(records.every((r) => r.picker.wg?.role === "governor" && r.actorId !== holder));
  assert.ok(records.every((r) => r.picker.legal.includes(r.picker.sampled)));
  assert.ok(records.some((r) => !r.picker.wg!.kept) && records.some((r) => r.picker.wg!.kept));
  assert.ok(records.every((r) => r.picker.sampled === (r.picker.wg!.kept ? r.picker.scorerPick : r.picker.wg!.alternative)));
  const replay = new ActionPickerReplay(records);
  const again = createPrototypeWorld(1847);
  run(again, 400, wgOnly(replay));
  assert.equal(stateHash(again), stateHash(world));
  assert.equal(replay.calls, 0);
  assert.equal(replay.used, replay.size);
});

test("the WG call cap: past it every consult is a cap fallback that keeps the sim's choice", () => {
  const world = createPrototypeWorld(1847);
  const ai = wgOnly(stubUniformPicker(), { wgPickerCap: 5 });
  const records = run(world, 300, ai);
  assert.equal(ai.wgPickerCalls, 5);
  const capped = records.slice(5);
  assert.ok(capped.length > 0 && capped.every((r) => r.picker.fallbackReason === "cap" && r.picker.wg!.kept && r.picker.sampled === r.picker.scorerPick));
});

/** Fixture: move the WG seat from the player to an autonomous, non-governor WG member (every order the player issued). */
function seatToNpc(world: WorldState): { player: string; npc: string } {
  const player = commandHolderId(world, WG_FACTION_ID)!;
  const governors = new Set(Object.values(world.characters).filter((c) => wgPickerRole(world, c) === "governor").map((c) => c.id));
  const npc = Object.values(world.characters).find((c) => c.factionId === WG_FACTION_ID && c.id !== player && !c.dead && c.controller.kind === "autonomous" && !governors.has(c.id))!;
  assert.ok(npc, "fixture needs an autonomous WG member who is not a governor");
  for (const c of Object.values(world.characters)) for (const order of c.standingOrders) if (order.issuerId === player) order.issuerId = npc.id;
  return { player, npc: npc.id };
}

test("dormant holder path: after the WG seat moves to an NPC, the holder is consulted as \"holder\" and replays exactly", () => {
  const world = createPrototypeWorld(1847);
  const { player, npc } = seatToNpc(world);
  assert.equal(commandHolderId(world, WG_FACTION_ID), npc);
  assert.equal(wgPickerRole(world, world.characters[npc]), "holder");
  const records = run(world, 400, wgOnly(stubUniformPicker()));
  const holderRecords = records.filter((r) => r.picker.wg?.role === "holder");
  assert.ok(holderRecords.length > 0, "the NPC holder reaches the consult");
  assert.ok(holderRecords.every((r) => r.actorId === npc));
  assert.ok(records.every((r) => r.actorId !== player));
  assert.ok(holderRecords.every((r) => r.picker.legal.includes(r.picker.sampled)));
  const replay = new ActionPickerReplay(records);
  const again = createPrototypeWorld(1847);
  seatToNpc(again);
  run(again, 400, wgOnly(replay));
  assert.equal(stateHash(again), stateHash(world));
  assert.equal(replay.calls, 0);
  assert.equal(replay.used, replay.size);
});
