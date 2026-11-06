import { freeMateCount } from "./allowance.ts";
import type { SimEvent, WorldState } from "./types.ts";

/**
 * PORT_TRANSFER (docs/design/port-transfer.md v1): purchase of a neutral port by a faction treasury.
 * Behind the `portTransfer` run option / `--port-transfer`, default off. Deterministic: no RNG, no AI.
 * Lead rulings on top of the spec:
 *  - when several factions qualify (a free member docked, a cause, and treasury ≥ price + reserve), the buyer is
 *    the one with the largest treasury surplus over its reserve (treasury − reserve), ties by faction id;
 *  - the faction buys, not a member: the acting agent is the buyer's first free docked member by id.
 */
export const PORT_TRANSFER_DEFAULT = false;
export const PURCHASE_CLOCK = 24;
/** engine.ts recruit: 12 money per soldier. */
export const PRICE_PER_SOLDIER = 12;
/** governor.ts stipend: 18 per free mate and per seat. */
export const RESERVE_PER_HEAD = 18;
/** alliances.md §2 adjacency. */
export const ADJACENT = 30;

const dist = (w: WorldState, a: string, b: string) => { const p = w.settlements[a].position, q = w.settlements[b].position; return Math.hypot(p.x - q.x, p.y - q.y); };
const r2 = (v: number) => Math.round(v * 100) / 100;
type Emit = (d: { type: string; actorId?: string; settlementId?: string; targetId?: string; data: Record<string, unknown> }) => void;

export interface PurchaseTerms { factionId: string; price: number; reserve: number; treasury: number; surplus: number; covers: boolean; cause: string | null }

export function purchaseTerms(world: WorldState, portId: string, factionId: string): PurchaseTerms {
  const port = world.settlements[portId]; const faction = world.factions[factionId];
  const held = Object.values(world.settlements).filter((s) => s.factionId === factionId).sort((a, b) => a.id.localeCompare(b.id));
  const price = PRICE_PER_SOLDIER * port.garrison;
  const reserve = RESERVE_PER_HEAD * (freeMateCount(world, factionId) + held.length);
  const adj = held.find((s) => dist(world, s.id, portId) <= ADJACENT);
  const cause = adj ? `adjacent: ${factionId} holds ${adj.id} at ${dist(world, adj.id, portId).toFixed(3)}` : !held.length ? `landless: ${factionId} holds no port` : null;
  return { factionId, price, reserve, treasury: faction.treasury, surplus: r2(faction.treasury - reserve), covers: faction.treasury >= price + reserve, cause };
}

/** Free docked members at the port, by id (alive, no captivity, not travelling, in a faction). */
export function freeDocked(world: WorldState, portId: string) {
  return Object.values(world.characters).filter((c) => !c.dead && !c.captivity && !c.travel && c.factionId && c.locationId === portId).sort((a, b) => a.id.localeCompare(b.id));
}

/** Ruling 1: the qualifying factions in buyer order (largest surplus over reserve first, then faction id). */
export function rankBuyers(world: WorldState, portId: string): PurchaseTerms[] {
  const factions = [...new Set(freeDocked(world, portId).map((c) => c.factionId!))].filter((f) => world.factions[f]);
  return factions.map((f) => purchaseTerms(world, portId, f)).filter((t) => t.cause && t.covers)
    .sort((a, b) => b.surplus - a.surplus || a.factionId.localeCompare(b.factionId));
}

export function portPurchases(world: WorldState, emit: Emit): void {
  if (world.tick <= 0 || world.tick % PURCHASE_CLOCK !== 0) return;
  for (const port of Object.values(world.settlements).sort((a, b) => a.id.localeCompare(b.id))) {
    if (port.factionId !== null) continue;
    if (Object.values(world.activeBattles).some((b) => b.settlementId === port.id)) continue;
    const ranked = rankBuyers(world, port.id);
    const t = ranked[0];
    if (!t) continue;
    // Ruling 2: the faction buys; its first free docked member acts.
    const agent = freeDocked(world, port.id).find((c) => c.factionId === t.factionId)!;
    emit({ type: "settlement-purchased", actorId: agent.id, settlementId: port.id, targetId: t.factionId, data: {
      factionId: t.factionId, ownerId: agent.id, payerFactionId: t.factionId, price: t.price,
      priceBasis: { garrison: port.garrison, perSoldier: PRICE_PER_SOLDIER }, reserve: t.reserve,
      treasuryBefore: t.treasury, treasuryAfter: r2(t.treasury - t.price), cause: t.cause,
      candidates: ranked.map((c) => ({ factionId: c.factionId, surplus: c.surplus, cause: c.cause })),
      stability: port.stability, population: port.population,
    } });
  }
}

export function applyPurchase(world: WorldState, event: SimEvent): boolean {
  if (event.type !== "settlement-purchased") return false;
  const s = world.settlements[event.settlementId!]; const f = world.factions[event.data.payerFactionId as string];
  s.factionId = event.data.factionId as string; s.ownerId = event.data.ownerId as string; s.surrender = null;
  f.treasury = event.data.treasuryAfter as number;
  return true;
}
