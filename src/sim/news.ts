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
