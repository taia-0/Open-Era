import type { SimEvent, WorldState } from "./types.ts";
/**
 * ALLIANCES (docs/design/alliances.md rev 2), behind the `alliances` run option / `--alliances`, default off. Deterministic, no RNG draw.
 * Flag off: nothing here runs; world.alliances / world.allianceMemory never exist.
 */
export const ALLIANCES_DEFAULT = false;
export const ALLIANCE_CLOCK = 24;
/** Adjacent ports: inter-port distance ≤ 30 (the gap between 25.807 and 43.829 in the measured distances). */
export const ALLIANCE_NEAR = 30;
/** Raid-history window: p90 of the gap between successive raids by one faction on another (152 ticks, 959 gaps, flag off, 13 seeds). */
export const ALLIANCE_RAID_WINDOW = 152;
export const ALLIANCE_COOLDOWN = 240;
export interface Alliance { id: string; factionIds: [string, string]; enemyFactionId: string; formedTick: number; causes: Record<string, string>; portsAtForm: Record<string, number> }
type W = WorldState;
export const alliancesOf = (world: WorldState) => (world as W).alliances ?? [];
export function allied(world: WorldState, a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || a === b) return false;
  return alliancesOf(world).some((x) => x.factionIds.includes(a) && x.factionIds.includes(b));
}
const portsOf = (world: WorldState, f: string) => Object.values(world.settlements).filter((s) => s.factionId === f).sort((a, b) => a.id.localeCompare(b.id));
const alive = (world: WorldState, f: string) => Object.values(world.characters).some((c) => !c.dead && c.factionId === f);
function dist(world: WorldState, a: string, b: string) { const p = world.settlements[a] as unknown as { x?: number; y?: number; position?: { x: number; y: number } }; const q = world.settlements[b] as unknown as typeof p; const pa = p.position ?? { x: p.x ?? 0, y: p.y ?? 0 }; const qb = q.position ?? { x: q.x ?? 0, y: q.y ?? 0 }; return Math.hypot(pa.x - qb.x, pa.y - qb.y); }
/** Cause for faction f to ally against enemy e, or null. Checked in this order. */
export function allianceCause(world: WorldState, f: string, e: string): string | null {
  const mine = portsOf(world, f), theirs = portsOf(world, e);
  if (!theirs.length) return null;
  const last = (world as W).allianceRaids?.[`${e}>${f}`];
  if (last !== undefined && world.tick - last <= ALLIANCE_RAID_WINDOW) return `raided: ${e} raided ${f} at t${last}, ${world.tick - last} ticks ago`;
  for (const m of mine) for (const t of theirs) { const d = dist(world, m.id, t.id); if (d <= ALLIANCE_NEAR) return `near: ${e} holds ${t.id} at ${d.toFixed(3)} from ${m.id}`; }
  if (!mine.length) return `landless: ${f} holds no port while ${e} holds ${theirs.map((s) => s.id).join(", ")}`;
  return null;
}
/** Joint battles: allied captains docked at the battle port or an adjacent port (≤ ALLIANCE_NEAR). */
export interface AllyJoiner { id: string; side: "attacker" | "defender"; at: string; power: number; troops: number; losses?: number }

/**
 * Lead ruling (2026-11-01, on top of §4/§8): joiners take losses, pro-rata to their share of their side's power,
 * with the existing loss formula. The side's loss is round(sideTroops × lossRate), where sideTroops is the
 * principal's troops (the attacker's party, or the garrison) plus every joiner's troops. Each joiner loses
 * min(troops, round(sideLoss × power / sideBase)); the principal loses min(own, max(1, round(sideLoss × ownBase / sideBase))).
 * With no joiners on a side this is exactly today's min(own, max(1, round(own × rate))).
 */
export function shareSideLosses(own: number, ownBase: number, rate: number, joiners: AllyJoiner[]): { principal: number; joiners: number[] } {
  if (!joiners.length) return { principal: Math.min(own, Math.max(1, Math.round(own * rate))), joiners: [] };
  const sideBase = ownBase + joiners.reduce((a, j) => a + j.power, 0);
  const sideLoss = Math.round((own + joiners.reduce((a, j) => a + j.troops, 0)) * rate);
  const share = (power: number) => (sideBase > 0 ? sideLoss * power / sideBase : 0);
  return { principal: Math.min(own, Math.max(1, Math.round(share(ownBase)))), joiners: joiners.map((j) => Math.min(j.troops, Math.round(share(j.power)))) };
}

export function allyJoinersWith(world: WorldState, attacker: { id: string; factionId: string | null }, settlement: { id: string; factionId: string | null }, power: (c: never) => number) {
  const joiners: AllyJoiner[] = [];
  let attackerPower = 0, defenderPower = 0;
  const busy = new Set(Object.values(world.activeBattles).map((b) => b.attackerId));
  for (const c of Object.values(world.characters).sort((a, b) => a.id.localeCompare(b.id))) {
    if (c.dead || c.captivity || c.travel || !c.locationId || c.troops.count <= 0 || c.id === attacker.id || busy.has(c.id) || !c.factionId) continue;
    if (c.locationId !== settlement.id && dist(world, c.locationId, settlement.id) > ALLIANCE_NEAR) continue;
    const side = allied(world, c.factionId, attacker.factionId) ? "attacker" : allied(world, c.factionId, settlement.factionId) ? "defender" : null;
    if (!side) continue;
    const p = Math.round(power(c as never) * 1000) / 1000; joiners.push({ id: c.id, side, at: c.locationId, power: p, troops: c.troops.count });
    if (side === "attacker") attackerPower += p; else defenderPower += p;
  }
  return { joiners, attackerPower, defenderPower };
}
type Emit = (draft: { type: string; data: Record<string, unknown>; settlementId?: string; targetId?: string; actorId?: string }) => void;
/** End of every tick, before metrics: breaks. */
export function allianceBreaks(world: WorldState, emit: Emit): void {
  if (!(world as W).allianceRaids) emit({ type: "alliance-ledger-opened", data: {} });
  for (const a of [...alliancesOf(world)]) {
    const [x, y] = a.factionIds;
    let reason: string | null = null; let evidence: Record<string, unknown> = {};
    if (!alive(world, x) || !alive(world, y)) { reason = "ally-gone"; evidence = { aliveX: alive(world, x), aliveY: alive(world, y) }; }
    else if (!portsOf(world, a.enemyFactionId).length) { reason = "enemy-portless"; evidence = { enemyFactionId: a.enemyFactionId, enemyPorts: 0 }; }
    else {
      const b = Object.values(world.activeBattles).sort((p, q) => p.id.localeCompare(q.id)).find((bt) => { const atk = world.characters[bt.attackerId]?.factionId; const def = world.settlements[bt.settlementId]?.factionId; return a.factionIds.includes(atk as string) && a.factionIds.includes(def as string) && atk !== def; });
      if (b) { reason = "ally-attack"; evidence = { battleId: b.id, attackerId: b.attackerId, settlementId: b.settlementId }; }
    }
    if (reason) emit({ type: "alliance-broken", data: { allianceId: a.id, factionIds: a.factionIds, enemyFactionId: a.enemyFactionId, reason, evidence } });
  }
}
/** On the clock (t > 0, t % 24 === 0), after secessions: forms. */
export function allianceForms(world: WorldState, emit: Emit): void {
  if (world.tick <= 0 || world.tick % ALLIANCE_CLOCK !== 0) return;
  const factions = Object.keys(world.factions).filter((f) => alive(world, f)).sort();
  const inPact = (f: string) => alliancesOf(world).some((a) => a.factionIds.includes(f));
  const blocked = (p: string, q: string) => ((world as W).allianceMemory ?? []).some((m) => m.factionIds.includes(p) && m.factionIds.includes(q) && world.tick - m.brokenTick < ALLIANCE_COOLDOWN);
  for (const p of factions) for (const q of factions) {
    if (q <= p || inPact(p) || inPact(q) || blocked(p, q)) continue;
    const enemies = factions.filter((e) => e !== p && e !== q && portsOf(world, e).length).sort((a, b) => portsOf(world, b).length - portsOf(world, a).length || a.localeCompare(b));
    for (const e of enemies) {
      const cp = allianceCause(world, p, e), cq = allianceCause(world, q, e);
      if (cp && cq) { emit({ type: "alliance-formed", data: { alliance: { id: `alliance-${world.tick}-${p}-${q}`, factionIds: [p, q], enemyFactionId: e, formedTick: world.tick, causes: { [p]: cp, [q]: cq }, portsAtForm: { [p]: portsOf(world, p).length, [q]: portsOf(world, q).length } } } }); break; }
    }
  }
}
/** Ruling: joiner losses, applied from the battle event (flag on only: only flag-on battles carry allyJoiners). */
export function applyJoinerLosses(world: WorldState, event: SimEvent): void {
  if (event.type !== "battle-resolved" && event.type !== "battle-phase-resolved") return;
  const joiners = event.data.allyJoiners as AllyJoiner[] | undefined;
  if (!joiners) return;
  for (const j of joiners) { const c = world.characters[j.id]; if (c && j.losses) c.troops.count = Math.max(0, c.troops.count - j.losses); }
}

export function applyAllianceEvent(world: WorldState, event: SimEvent): boolean {
  const w = world as W;
  if (event.type === "alliance-ledger-opened") { w.allianceRaids = {}; return true; }
  if (event.type === "alliance-formed") { (w.alliances ??= []).push(event.data.alliance as Alliance); return true; }
  if (event.type === "alliance-broken") {
    w.alliances = (w.alliances ?? []).filter((a) => a.id !== event.data.allianceId); if (!w.alliances.length) delete w.alliances;
    // §6: prune entries older than the cooldown (they can no longer block a pair).
    w.allianceMemory = [...(w.allianceMemory ?? []).filter((m) => event.tick - m.brokenTick < ALLIANCE_COOLDOWN), { factionIds: event.data.factionIds as [string, string], brokenTick: event.tick }]; return true;
  }
  return false;
}
/** Raid ledger (flag on only: the ledger exists only after alliance-ledger-opened). */
export function noteRaid(world: WorldState, event: SimEvent): void {
  const w = world as W; if (!w.allianceRaids) return;
  if (!(event.type === "battle-started" || (event.type === "battle-resolved" && !event.data.battleId))) return;
  const atk = event.actorId ? world.characters[event.actorId]?.factionId : null; const def = event.targetId;
  if (atk && def && atk !== def) w.allianceRaids[`${atk}>${def}`] = event.tick;
}
