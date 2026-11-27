// offices-docked-governor.md counting harness (extends wg-picker-cap-atl/count.ts with docked-only counters). Offline, no AI, $0. Needs ../wg-picker-cap-atl/hook.patch applied to src/sim/engine.ts (scratch only).
// Usage: node --experimental-strip-types docs/design/wg-picker-cap-atl/count.ts <label> '<TickOptions JSON>' [--stub]
//   read-only mode (default): no picker; counts WG decisions meeting the picker eligibility rule (wg-jev-picker.md
//   recount method: role holder/governor, ≥ 2 legal ids, no raid/claim legal, no active haul that can act).
//   --stub: ai.picker = stubUniform, pickerFactions = [world-government], wgPickerCap = 1e9 (uncapped); counts the
//   consult records the engine actually writes (the defaults-on.md §5 method).
// One JSON row per seed.
import { stubUniformPicker } from "../../../src/sim/ai-action-picker.ts";
import { legalIds } from "../../../src/sim/ai-action-picker.ts";
import { ESCALATION_ACTIONS } from "../../../src/sim/ai-action-picker.ts";
import { WG_FACTION_ID } from "../../../src/sim/ai-wg-picker.ts";
import { runTick, wgPickerRole } from "../../../src/sim/engine.ts";
import { governorId } from "../../../src/sim/governor.ts";
import { createPrototypeWorld } from "../../../src/sim/scenario.ts";
import { stateHash } from "../../../src/sim/state.ts";
import type { Character, SimEvent, WorldState } from "../../../src/sim/types.ts";

const [label, optsJson, mode] = process.argv.slice(2);
const opts = JSON.parse(optsJson ?? "{}");
const stub = mode === "--stub";
const ticks = Number(process.env.TICKS ?? 1200);
const seeds = (process.env.SEEDS ?? "1847,2718,4096,1000,2000,3000,4000,5000,6000,7000,8000,9000,10000").split(",").map(Number);
const BIN = 200;
type Cand = { action: string; score: number };

for (const seed of seeds) {
  const w = createPrototypeWorld(seed);
  const initial = new Set(Object.keys(w.characters));
  const inc = (o: Record<string, number>, k: string, n = 1) => { o[k] = (o[k] ?? 0) + n; };
  const c = {
    wgDecisions: 0, gateOpen: 0, role: {} as Record<string, number>, eligible: 0, eligibleByRole: {} as Record<string, number>,
    // among governor decisions with the haul gate open: why not eligible
    govGated: 0, govDup: 0, govLt2: 0, govEsc: 0, govPactBlockedHere: 0, govPeaceBlockedHere: 0,
    govAway: 0, govAwayEligible: 0, govAwayPactBlocked: 0,
    eligibleByActor: {} as Record<string, number>, eligibleBySeat: {} as Record<string, number>, eligibleByBin: {} as Record<string, number>,
    eligibleByOrigin: {} as Record<string, number>, eligiblePactBlocked: 0, eligibleAwayBySeat: {} as Record<string, number>, eligibleAwayAt: {} as Record<string, number>,
    eligibleDocked: 0, dockedBySeat: {} as Record<string, number>, dockedByBin: {} as Record<string, number>, dockedByActor: {} as Record<string, number>, dockedByOrigin: {} as Record<string, number>,
  };
  const actorMeta: Record<string, { name: string; origin: string }> = {};
  (globalThis as { __wgHook?: unknown }).__wgHook = (d: { world: WorldState; character: Character; candidates: Cand[]; gate: boolean; pactFriendly: boolean; peaceFriendly: boolean }) => {
    const { world, character, candidates, gate } = d;
    c.wgDecisions++;
    if (!gate) return;
    c.gateOpen++;
    const role = wgPickerRole(world, character);
    inc(c.role, role ?? "member");
    if (!role) return;
    const seat = Object.values(world.settlements).filter((s) => governorId(world, s.id) === character.id).map((s) => s.id).sort().join("+") || (role === "holder" ? "holder" : "?");
    const away = role === "governor" && character.locationId !== null && !seat.split("+").includes(character.locationId!);
    const legal = legalIds(candidates as never);
    const legalRows = candidates.filter((r) => r.score > -1000);
    const esc = legalRows.some((r) => ESCALATION_ACTIONS.has(r.action));
    if (role === "governor") {
      c.govGated++;
      if (away) c.govAway++;
      if (d.pactFriendly) c.govPactBlockedHere++;
      if (d.peaceFriendly) c.govPeaceBlockedHere++;
      if (away && d.pactFriendly) c.govAwayPactBlocked++;
      if (!legal) c.govDup++; else if (legal.length < 2) c.govLt2++; else if (esc) c.govEsc++;
    }
    if (!legal || legal.length < 2 || esc) return;
    c.eligible++;
    inc(c.eligibleByRole, role);
    inc(c.eligibleByActor, character.id);
    inc(c.eligibleBySeat, seat);
    inc(c.eligibleByBin, String(Math.floor(world.tick / BIN) * BIN));
    const origin = initial.has(character.id) ? (character.lifecycle?.retired ? "initial-retired?" : "initial") : (character.lifecycle?.promotedFrom ? "promoted" : "spawned-other");
    inc(c.eligibleByOrigin, origin);
    if (d.pactFriendly || d.peaceFriendly) c.eligiblePactBlocked++;
    if (!(role === "governor" && away)) { c.eligibleDocked++; const here = role === "governor" ? character.locationId! : seat; inc(c.dockedBySeat, here); inc(c.dockedByBin, String(Math.floor(world.tick / BIN) * BIN)); inc(c.dockedByActor, character.id); inc(c.dockedByOrigin, origin); }
    if (role === "governor" && away) { c.govAwayEligible++; inc(c.eligibleAwayBySeat, seat); inc(c.eligibleAwayAt, character.locationId ?? "?"); }
    actorMeta[character.id] = { name: character.name, origin };
  };
  // Seat occupancy, read between ticks (governorId previews; it does not write the world).
  const seats = { wgPortTicks: 0, seatedTicks: 0, vacantTicks: 0, wgPortTicksBySettlement: {} as Record<string, number>, seatedBySettlement: {} as Record<string, number>, seatedByOrigin: {} as Record<string, number>, maxWgPorts: 0, seatedBin: {} as Record<string, number> };
  const events: SimEvent[] = [];
  let records = 0;
  const ai = stub ? { picker: stubUniformPicker(), pickerFactions: [WG_FACTION_ID], wgPickerCap: 1e9 } : undefined;
  for (let i = 0; i < ticks; i++) {
    const tickNo = w.tick;
    for (const e of runTick(w, ai ? { ...opts, ai } : { ...opts }).events) {
      events.push(e);
      if ((e.data as { ai?: { picker?: { wg?: unknown } } } | undefined)?.ai?.picker?.wg) records++;
    }
    const wgPorts = Object.values(w.settlements).filter((s) => s.factionId === WG_FACTION_ID);
    seats.maxWgPorts = Math.max(seats.maxWgPorts, wgPorts.length);
    for (const s of wgPorts) {
      seats.wgPortTicks++; inc(seats.wgPortTicksBySettlement, s.id);
      const g = governorId(w, s.id);
      if (g) {
        seats.seatedTicks++; inc(seats.seatedBySettlement, s.id); inc(seats.seatedBin, String(Math.floor(tickNo / BIN) * BIN));
        inc(seats.seatedByOrigin, initial.has(g) ? "initial" : (w.characters[g]?.lifecycle?.promotedFrom ? "promoted" : "spawned-other"));
      } else seats.vacantTicks++;
    }
  }
  const n = (t: string) => events.filter((e) => e.type === t).length;
  const wgEv = (t: string) => events.filter((e) => e.type === t && (w.characters[e.actorId ?? ""]?.factionId === WG_FACTION_ID || (e.data as { buyer?: string; factionId?: string })?.buyer === WG_FACTION_ID || (e.data as { factionId?: string })?.factionId === WG_FACTION_ID)).length;
  const purchases = events.filter((e) => e.type === "settlement-purchased").map((e) => ({ tick: e.tick, settlement: e.settlementId ?? e.targetId, data: Object.fromEntries(Object.entries(e.data ?? {}).filter(([k]) => ["buyer", "factionId", "price"].includes(k))) }));
  console.log(JSON.stringify({ label, mode: stub ? "stub" : "readonly", seed, hash1200: stateHash(w).slice(0, 8), stubRecords: stub ? records : null, ...c, seats, actorMeta,
    promotions: n("character-promoted"), wgPromotions: wgEv("character-promoted"), retirements: n("character-retired"), wgRetirements: wgEv("character-retired"), returns: n("character-returned"), purchases, pacts: n("alliance-formed") }));
}
