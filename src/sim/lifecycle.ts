import type { Character, SimEvent, WorldState } from "./types.ts";
import { firstNames, lastNames } from "./scenario.ts";
import { governorId } from "./governor.ts";
/**
 * LIFECYCLE (docs/design/lifecycle.md rev 2): promotion, retirement, crisis-only return.
 * Behind the `lifecycle` run option / `--lifecycle`, default off. Deterministic: no RNG, no AI.
 * Lead rulings: (1) promoted names are the scenario roster offset by seed; (2) a returning governor
 * competes for the seat like anyone else (isRetired clears; syncSeats / appointGovernor do the rest).
 */
export const LIFECYCLE_DEFAULT = false;
/** Raid troop gate (engine.ts buildCandidates: troops ≥ 25). */
export const POWER_FLOOR = 25;
/** p90 of spells below 25 troops, flag off, 13 seeds (433 spells, incl. spells ended by death). */
export const RETIRE_AFTER = 215;
/** p90 of the attacker's troops after an attacker victory, flag off, 13 seeds (783 wins). */
export const PROMOTE_TROOPS = 424;
/** One promotion per captain per promise window. */
export const PROMOTE_COOLDOWN = 240;
export type CharacterLifecycle = { watchSince?: number; retired?: { tick: number; cause: string; portsAtRetire: number }; lastPromotionTick?: number; promotedFrom?: string };
type LC = CharacterLifecycle;
type C = Character & { lifecycle?: LC };
type Emit = (d: { type: string; actorId?: string; settlementId?: string; targetId?: string; data: Record<string, unknown> }) => void;
const lc = (c: Character) => (c as C).lifecycle;
export const isRetired = (c: Character) => Boolean(lc(c)?.retired);
const portsOf = (w: WorldState, f: string | null) => (f ? Object.values(w.settlements).filter((s) => s.factionId === f).length : 0);
export function lifecycleStep(world: WorldState, tickEvents: SimEvent[], emit: Emit): void {
  const chars = Object.values(world.characters).filter((c) => !c.dead && c.controller.kind !== "human").sort((a, b) => a.id.localeCompare(b.id));
  for (const c of chars) {
    const s = lc(c);
    if (s?.retired) {
      const r = s.retired; let cause: string | null = null;
      const now = portsOf(world, c.factionId);
      const battle = c.locationId ? Object.values(world.activeBattles).sort((a, b) => a.id.localeCompare(b.id)).find((b) => b.settlementId === c.locationId && world.settlements[b.settlementId].factionId === c.factionId && c.factionId) : undefined;
      if (battle) cause = `crisis: battle ${battle.id} at ${c.locationId}, held by ${c.factionId}`;
      else if (c.factionId && now < r.portsAtRetire) cause = `crisis: ${c.factionId} ports ${r.portsAtRetire} -> ${now}`;
      // v1: crisis is the only return. "recovered" needs a recruit or garrison path for retired captains (lifecycle.md §1).
      if (cause) emit({ type: "character-returned", actorId: c.id, settlementId: c.locationId ?? undefined, data: { cause, retiredTick: r.tick, troops: c.troops.count, factionPorts: now } });
      continue;
    }
    const below = c.troops.count < POWER_FLOOR;
    if (below && s?.watchSince === undefined) emit({ type: "lifecycle-watch", actorId: c.id, data: { since: world.tick, troops: c.troops.count } });
    else if (!below && s?.watchSince !== undefined) emit({ type: "lifecycle-watch-cleared", actorId: c.id, data: { since: s.watchSince, troops: c.troops.count } });
    else if (below && s?.watchSince !== undefined && world.tick - s.watchSince >= RETIRE_AFTER && !c.captivity && !c.travel && c.locationId) {
      emit({ type: "character-retired", actorId: c.id, settlementId: c.locationId, data: { cause: `power-loss: troops ${c.troops.count} < ${POWER_FLOOR} since t${s.watchSince} (${world.tick - s.watchSince} ticks)`, watchSince: s.watchSince, troops: c.troops.count, portsAtRetire: portsOf(world, c.factionId), office: governorId(world, c.locationId) === c.id ? c.locationId : null } });
    }
  }
  // Promotion: an attacker victory this tick that leaves the captain with at least PROMOTE_TROOPS.
  for (const e of tickEvents) {
    if (e.type !== "battle-resolved" || e.data.outcome !== "attacker-victory" || !e.actorId) continue;
    const cap = world.characters[e.actorId]; if (!cap || cap.dead || cap.captivity || isRetired(cap)) continue;
    const s = lc(cap); if (s?.lastPromotionTick !== undefined && world.tick - s.lastPromotionTick < PROMOTE_COOLDOWN) continue;
    if (cap.troops.count < PROMOTE_TROOPS) continue;
    const n = Object.keys(world.characters).length + 1; const id = `character-${String(n).padStart(2, "0")}`;
    if (world.characters[id]) continue;
    const split = Math.floor(cap.troops.count / 2);
    const fresh: C = { ...structuredClone(cap), id, name: rosterName(world, n - 1), money: 0, victories: 0, defeats: 0, relationships: {}, troops: { ...cap.troops, count: split }, lastBattleTick: world.tick };
    delete fresh.lifecycle; fresh.lifecycle = { promotedFrom: cap.id };
    emit({ type: "character-promoted", actorId: cap.id, settlementId: cap.locationId ?? undefined, targetId: id, data: { cause: `battle: attacker victory at ${e.settlementId} (seq ${e.sequence}) leaves ${cap.troops.count} troops >= ${PROMOTE_TROOPS}`, character: fresh, split, captainTroopsAfter: cap.troops.count - split } });
  }
}
export function applyLifecycleEvent(world: WorldState, event: SimEvent): boolean {
  const c = event.actorId ? (world.characters[event.actorId] as C | undefined) : undefined;
  switch (event.type) {
    case "lifecycle-watch": (c!.lifecycle ??= {}).watchSince = event.data.since as number; return true;
    case "lifecycle-watch-cleared": delete c!.lifecycle!.watchSince; if (!Object.keys(c!.lifecycle!).length) delete c!.lifecycle; return true;
    case "character-retired": { const l = (c!.lifecycle ??= {}); delete l.watchSince; l.retired = { tick: event.tick, cause: event.data.cause as string, portsAtRetire: event.data.portsAtRetire as number }; return true; }
    case "character-returned": delete c!.lifecycle!.retired; if (!Object.keys(c!.lifecycle!).length) delete c!.lifecycle; return true;
    case "character-promoted": {
      const fresh = structuredClone(event.data.character) as C; world.characters[fresh.id] = fresh;
      c!.troops = { ...c!.troops, count: event.data.captainTroopsAfter as number }; (c!.lifecycle ??= {}).lastPromotionTick = event.tick; return true;
    }
  }
  return false;
}

/** The scenario's own naming formula (scenario.ts), continued past the starting cast. */
export function nameAt(index: number): string {
  return `${firstNames[index % firstNames.length]} ${lastNames[(index * 7 + Math.floor(index / firstNames.length) * 3) % lastNames.length]}`;
}
/** Lead ruling 1: offset the promotion roster by seed so different worlds get different newcomers. Still deterministic. */
export function rosterOffset(seed: number): number {
  const span = firstNames.length * lastNames.length;
  return ((seed % span) + span) % span;
}
/** First unused name in the seed-offset roster, starting at `index + rosterOffset(seed)`. */
export function rosterName(world: WorldState, index: number): string {
  const used = new Set(Object.values(world.characters).map((c) => c.name));
  const start = index + rosterOffset(world.seed);
  for (let k = start; k < start + firstNames.length * lastNames.length; k++) { const nm = nameAt(k); if (!used.has(nm)) return nm; }
  return nameAt(start);
}
