import { governorId } from "./governor.ts";
import { commandHolderId, round } from "./state.ts";
import type { Character, NewsRecord, Settlement, SimEvent, WorldState } from "./types.ts";

/** Public port facts. Upkeep, trade, travel progress, and the tick marker stay out. */
export const PUBLIC_NEWS_TYPES = new Set([
  "battle-resolved",
  "battle-retreated",
  "settlement-claimed",
  "character-captured",
  "captivity-released",
  "captivity-escaped",
  "settlement-surrender-declined",
  "tax-rate-set",
  "character-died",
]);

/** An away port's item counts while the tax tick minus `observedTick` is at most this. */
export const NEWS_AGE_CAP = 24;

const LOYALTY_LINE = 0.75;

function scarredLoyalty(character: Character): number {
  return character.personality.loyalty + (character.loyaltyAdjustment ?? 0);
}

/**
 * Scarred mates anchored at the port when the item is posted.
 * The holder, the acting commander, and the governor are not in the list.
 */
export function scarredFollowerIds(world: WorldState, settlementId: string): string[] {
  const settlement = world.settlements[settlementId];
  const holderId = settlement.factionId ? commandHolderId(world, settlement.factionId) : null;
  const actingId = settlement.factionId ? world.factions[settlement.factionId]?.actingCommanderId ?? null : null;
  const seated = governorId(world, settlementId);
  return Object.values(world.characters)
    .filter((character) => {
      if (character.locationId !== settlementId || character.travel !== null || character.captivity !== null) return false;
      if (character.dead) return false;
      if (!settlement.factionId || character.factionId !== settlement.factionId) return false;
      if (holderId !== null && character.id === holderId) return false;
      if (actingId !== null && character.id === actingId) return false;
      if (seated !== null && character.id === seated) return false;
      return scarredLoyalty(character) < LOYALTY_LINE;
    })
    .map((character) => character.id)
    .sort((left, right) => left.localeCompare(right));
}

export function ledgerHas(records: readonly NewsRecord[] | undefined, id: string): boolean {
  return records?.some((record) => record.item.id === id) ?? false;
}

/** Append a record the ledger does not already hold. Omits the field until the first post. */
export function appendNews(settlement: Settlement, record: NewsRecord): void {
  if (ledgerHas(settlement.news, record.item.id)) return;
  settlement.news = [...(settlement.news ?? []), record];
}

/**
 * The public item for one origin event, with the port's stability and the
 * scarred list beside it. A tax step stores `taxRate` and no port.
 */
export function newsRecordFor(world: WorldState, event: SimEvent, aboutSettlementId: string | null): NewsRecord {
  const settlement = aboutSettlementId ? world.settlements[aboutSettlementId] : undefined;
  const factionId = event.type === "tax-rate-set"
    ? (typeof event.data.factionId === "string" ? event.data.factionId : null)
    : (settlement?.factionId ?? null);
  const item = {
    id: `news-${event.sequence}`,
    type: event.type,
    observedTick: event.tick,
    factionId,
    ...(event.type === "tax-rate-set" && typeof event.data.taxRate === "number"
      ? { taxRate: event.data.taxRate }
      : {}),
  };
  return {
    item,
    aboutSettlementId,
    stability: round(settlement?.stability ?? 0, 3),
    followerIds: aboutSettlementId ? scarredFollowerIds(world, aboutSettlementId) : [],
    sequence: event.sequence,
  };
}

/** The ledger a holder can read: the port they stand in, or the bag copied when they sailed. */
export function readableNews(world: WorldState, reader: Character): readonly NewsRecord[] {
  if (reader.locationId && reader.travel === null) return world.settlements[reader.locationId]?.news ?? [];
  return reader.carriedNews ?? [];
}

/**
 * Thousandths of stability for one port, or null when the reader has no item.
 *
 * A port the holder is standing in stays live for the tax step. Secession
 * does not use that exception. An away port counts only inside the 24-tick
 * cap. A `tax-rate-set` does not supply the figure. The latest item wins,
 * by `observedTick` then sequence.
 */
export function newsStabilityThousandths(
  world: WorldState,
  reader: Character,
  settlementId: string,
  liveIfPresent: boolean,
): number | null {
  if (liveIfPresent && reader.locationId === settlementId && reader.travel === null) {
    return Math.round(world.settlements[settlementId].stability * 1000);
  }
  const matches = readableNews(world, reader).filter((record) =>
    record.aboutSettlementId === settlementId &&
    record.item.type !== "tax-rate-set" &&
    world.tick - record.item.observedTick <= NEWS_AGE_CAP,
  );
  if (matches.length === 0) return null;
  matches.sort((left, right) =>
    right.item.observedTick - left.item.observedTick || right.sequence - left.sequence,
  );
  return Math.round(matches[0].stability * 1000);
}

/** The scarred list on that same item, or an empty list when there is no item. */
export function newsFollowerIds(
  world: WorldState,
  reader: Character,
  settlementId: string,
): string[] {
  const matches = readableNews(world, reader).filter((record) =>
    record.aboutSettlementId === settlementId &&
    record.item.type !== "tax-rate-set" &&
    world.tick - record.item.observedTick <= NEWS_AGE_CAP,
  );
  if (matches.length === 0) return [];
  matches.sort((left, right) =>
    right.item.observedTick - left.item.observedTick || right.sequence - left.sequence,
  );
  return [...matches[0].followerIds];
}

/** Copy a departure ledger onto the sailor. Items already carried stay, deduped by id. */
export function takeDepartureNews(world: WorldState, character: Character, fromId: string): void {
  const ledger = world.settlements[fromId]?.news ?? [];
  const combined = [...(character.carriedNews ?? [])];
  for (const record of ledger) {
    if (!ledgerHas(combined, record.item.id)) combined.push(record);
  }
  if (combined.length === 0) delete character.carriedNews;
  else character.carriedNews = combined;
}

/**
 * Exile recovery, step 1 (next-dynamic-slice.md, revised slice A item 1):
 * own-faction loss news by courier. A faction learns that it lost a port
 * faster than ordinary news, which travels only in a sailor's bag, but not
 * instantly: one day (6 ticks, `ticksPerDay`), the time a courier needs to
 * cross the archipelago's longest sea leg. Only behind the EXILE_RECOVERY flag.
 */
export const OWN_LOSS_COURIER_TICKS = 6;

export interface OwnLossCourier {
  characterId: string;
  settlementId: string;
  /** The claim's tick and new holder, as posted in the port's public ledger. */
  observedTick: number;
  factionId: string | null;
}

/**
 * Stateless, so recovery needs nothing new: the port's ledger already holds the
 * claim item (`settlement-claimed`, written through `news-posted`). For each
 * port, the latest claim item at least `OWN_LOSS_COURIER_TICKS` old reaches every
 * free member of another faction who still believes their own faction holds the
 * port and whose belief predates the claim. The walk is in port then character
 * id order.
 */
export function ownLossCouriers(world: WorldState): OwnLossCourier[] {
  const out: OwnLossCourier[] = [];
  for (const settlement of Object.values(world.settlements).sort((a, b) => a.id.localeCompare(b.id))) {
    let latest: NewsRecord | null = null;
    for (const record of settlement.news ?? []) {
      if (record.item.type !== "settlement-claimed" || record.aboutSettlementId !== settlement.id) continue;
      if (!latest || record.item.observedTick > latest.item.observedTick || (record.item.observedTick === latest.item.observedTick && record.sequence > latest.sequence)) latest = record;
    }
    // Lead ruling (4): a secession loss counts too; the newer loss wins.
    let lossTick = latest ? latest.item.observedTick : -1;
    let holderId: string | null = latest ? latest.item.factionId : null;
    const seceded = settlement.secessionLoss;
    if (seceded && seceded.tick >= lossTick) {
      lossTick = seceded.tick;
      holderId = seceded.factionId;
    }
    if (lossTick < 0 || world.tick - lossTick < OWN_LOSS_COURIER_TICKS) continue;
    for (const character of Object.values(world.characters).sort((a, b) => a.id.localeCompare(b.id))) {
      if (character.dead || character.captivity || !character.factionId || character.factionId === holderId) continue;
      const belief = character.knowledge[settlement.id];
      if (!belief || belief.factionId !== character.factionId || belief.observedTick >= lossTick) continue;
      out.push({ characterId: character.id, settlementId: settlement.id, observedTick: lossTick, factionId: holderId });
    }
  }
  return out;
}
