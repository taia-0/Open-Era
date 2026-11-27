import { governorId } from "../sim/governor.ts";
import type { CharacterLifecycle } from "../sim/lifecycle.ts";
import { readableNews } from "../sim/news.ts";
import { OCCUPATION_REGROWTH_STOP } from "../sim/occupation.ts";
import { atPeace } from "../sim/secession-aftermath.ts";
import { alliancesOf } from "../sim/alliances.ts";
import type { Character, Settlement, SimEvent, WorldState } from "../sim/types.ts";

/**
 * Player-facing records for the layers the sim already stores.
 *
 * Knowledge is earned and dated. A holder sees their own administration.
 * A party sees their own peace or pact. Everyone else gets a fact only when
 * a survey, a ground record, or port news already carries it, with the tick
 * it was learned. Nothing here writes the world.
 */

const OWNERSHIP_NEWS = new Set(["settlement-claimed", "settlement-purchased", "secession-joined"]);

/** Bookkeeping rows. They stay out of every player feed. */
export const PLAYER_FEED_BOOKKEEPING = [
  "lifecycle-watch",
  "lifecycle-watch-cleared",
  "aftermath-ledger-opened",
  "alliance-ledger-opened",
] as const;

export interface OccupationView {
  harshness: number;
  sinceTick: number;
  fromFactionId: string | null;
  /** The occupying faction. On the holder's own block only. */
  byFactionId?: string | null;
  regrowthStopped: boolean;
  /** Set when this reading was learned. Absent on the holder's live block. */
  learnedTick?: number;
  source?: "ground" | "news";
}

export interface FactionPeaceView {
  withFactionId: string;
  sinceTick: number;
}

export interface FactionPactView {
  withFactionId: string;
  sinceTick: number;
  allyFactionId: string;
}

export interface DiplomacyView {
  peace: FactionPeaceView[];
  pacts: FactionPactView[];
}

export interface GovernorSeatView {
  settlementId: string;
  characterId: string | null;
  name: string | null;
}

export interface LifecycleView {
  retired: { tick: number } | null;
  returned: { tick: number } | null;
  promotedFrom: string | null;
  lastPromotionTick: number | null;
  promotedSplit: number | null;
}

interface OccupationSnap {
  harshness: number;
  sinceTick: number;
  fromFactionId: string | null;
}

function lifecycleOf(character: Character): (CharacterLifecycle & { returned?: { tick: number }; promotedSplit?: number }) | undefined {
  return (character as Character & { lifecycle?: CharacterLifecycle & { returned?: { tick: number }; promotedSplit?: number } }).lifecycle;
}

function factionName(world: WorldState, id: string | null | undefined): string {
  if (!id) return "a faction";
  return world.factions[id]?.name ?? id;
}

function regrowthStopped(harshness: number): boolean {
  return harshness >= OCCUPATION_REGROWTH_STOP;
}

/** The holder's live administration. Exact harshness. Terms, food series, and the old rate stay off. */
export function holderOccupation(settlement: Settlement): OccupationView | null {
  const occupation = settlement.occupation;
  if (!occupation) return null;
  return {
    harshness: occupation.harshness,
    sinceTick: occupation.tick,
    fromFactionId: occupation.fromFactionId,
    byFactionId: occupation.byFactionId,
    regrowthStopped: regrowthStopped(occupation.harshness),
  };
}

function snapFromGround(character: Character, settlementId: string): (OccupationSnap & { learnedTick: number }) | null {
  const ground = character.knowledge[settlementId]?.ground;
  const occupation = ground?.occupation;
  if (!ground || !occupation) return null;
  return { ...occupation, learnedTick: ground.observedTick };
}

function snapFromNews(world: WorldState, character: Character, settlementId: string): (OccupationSnap & { learnedTick: number }) | null {
  let best: (OccupationSnap & { learnedTick: number }) | null = null;
  for (const record of readableNews(world, character)) {
    if (record.aboutSettlementId !== settlementId) continue;
    const occupation = record.item.occupation;
    if (!occupation) continue;
    if (!best || record.item.observedTick >= best.learnedTick) {
      best = { ...occupation, learnedTick: record.item.observedTick };
    }
  }
  return best;
}

/**
 * Harshness a non-holder has already learned.
 * Survey ground and port news only. Standing there is not a ground record.
 * Null when neither channel has it.
 */
export function learnedOccupation(world: WorldState, viewer: Character, settlement: Settlement): OccupationView | null {
  if (settlement.factionId !== null && settlement.factionId === viewer.factionId) return null;
  const ground = snapFromGround(viewer, settlement.id);
  const news = snapFromNews(world, viewer, settlement.id);
  const chosen = !ground ? news : !news ? ground : news.learnedTick >= ground.learnedTick ? news : ground;
  if (!chosen) return null;
  return {
    harshness: chosen.harshness,
    sinceTick: chosen.sinceTick,
    fromFactionId: chosen.fromFactionId,
    regrowthStopped: regrowthStopped(chosen.harshness),
    learnedTick: chosen.learnedTick,
    source: chosen === news ? "news" : "ground",
  };
}

export interface LearnedHolder {
  factionId: string | null;
  learnedTick: number | null;
}

/**
 * The map label. Own ports and a port the viewer is standing in stay live.
 * Away, the newer of the stored report and an ownership item the viewer can
 * read (a claim, a purchase, or a join carried as port news).
 */
export function learnedHolder(
  world: WorldState,
  viewer: Character,
  settlement: Settlement,
  exact: boolean,
  coLocated: boolean,
): LearnedHolder {
  if (exact || coLocated) return { factionId: settlement.factionId, learnedTick: world.tick };
  const knowledge = viewer.knowledge[settlement.id];
  let factionId = knowledge?.factionId ?? null;
  let learnedTick = knowledge ? Math.max(0, knowledge.observedTick) : null;
  let bestTick = knowledge?.observedTick ?? -Infinity;
  for (const record of readableNews(world, viewer)) {
    if (record.aboutSettlementId !== settlement.id) continue;
    if (!OWNERSHIP_NEWS.has(record.item.type)) continue;
    if (record.item.observedTick < bestTick) continue;
    bestTick = record.item.observedTick;
    factionId = record.item.factionId;
    learnedTick = record.item.observedTick;
  }
  return { factionId, learnedTick };
}

/** Port news the viewer can read about one settlement. No scarred-follower list. */
export function portNewsFor(world: WorldState, viewer: Character, settlementId: string): Array<Record<string, unknown>> | null {
  const standingHere = viewer.locationId === settlementId && viewer.travel === null;
  const items = readableNews(world, viewer).filter((record) => record.aboutSettlementId === settlementId);
  if (!standingHere && items.length === 0) return null;
  return items.map((record) => ({
    id: record.item.id,
    type: record.item.type,
    observedTick: record.item.observedTick,
    learnedTick: record.item.observedTick,
    factionId: record.item.factionId,
    ...(record.item.occupation ? { occupation: { ...record.item.occupation, learnedTick: record.item.observedTick } } : {}),
  }));
}

function peaceViews(world: WorldState, factionId: string): FactionPeaceView[] {
  return (world.secessionAftermath?.peace ?? [])
    .filter((peace) => peace.factionIds.includes(factionId))
    .map((peace) => ({
      withFactionId: peace.factionIds[0] === factionId ? peace.factionIds[1] : peace.factionIds[0],
      sinceTick: peace.tick,
    }))
    .sort((left, right) => left.sinceTick - right.sinceTick || left.withFactionId.localeCompare(right.withFactionId));
}

function pactViews(world: WorldState, factionId: string): FactionPactView[] {
  return alliancesOf(world)
    .filter((pact) => pact.factionIds.includes(factionId))
    .map((pact) => ({
      withFactionId: pact.factionIds[0] === factionId ? pact.factionIds[1] : pact.factionIds[0],
      sinceTick: pact.formedTick,
      allyFactionId: pact.enemyFactionId,
    }))
    .sort((left, right) => left.sinceTick - right.sinceTick || left.withFactionId.localeCompare(right.withFactionId));
}

/**
 * Peace and pacts the viewer is a party to.
 * On the viewer's own faction row, the whole list. On another faction's row,
 * only the record with that faction. Causes, grievance, and surplus are not copied.
 */
export function diplomacyFor(world: WorldState, viewer: Character, factionId: string, owned: boolean): DiplomacyView | null {
  if (!viewer.factionId) return null;
  const peace = peaceViews(world, viewer.factionId).filter((row) => owned || row.withFactionId === factionId);
  const pacts = pactViews(world, viewer.factionId).filter((row) => owned || row.withFactionId === factionId);
  if (!owned && peace.length === 0 && pacts.length === 0) return null;
  return { peace, pacts };
}

/** Governor seats of the viewer's own faction. A rival row is null. News does not name offices. */
export function governorSeats(world: WorldState, viewer: Character, factionId: string): GovernorSeatView[] | null {
  if (!viewer.factionId || viewer.factionId !== factionId) return null;
  return Object.values(world.settlements)
    .filter((settlement) => settlement.factionId === factionId)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((settlement) => {
      const characterId = governorId(world, settlement.id);
      const governor = characterId ? world.characters[characterId] : undefined;
      return {
        settlementId: settlement.id,
        characterId,
        name: governor?.name ?? null,
      };
    });
}

export function governorOnPort(world: WorldState, viewer: Character, settlement: Settlement): GovernorSeatView | null {
  if (!viewer.factionId || settlement.factionId !== viewer.factionId) return null;
  const characterId = governorId(world, settlement.id);
  const governor = characterId ? world.characters[characterId] : undefined;
  return { settlementId: settlement.id, characterId, name: governor?.name ?? null };
}

/** Retired, returned, and promoted on the viewer's own roster. A rival card stays null. */
export function lifecycleView(viewer: Character, character: Character): LifecycleView | null {
  if (!viewer.factionId || character.factionId !== viewer.factionId) return null;
  const state = lifecycleOf(character);
  return {
    retired: state?.retired ? { tick: state.retired.tick } : null,
    returned: state?.returned ? { tick: state.returned.tick } : null,
    promotedFrom: state?.promotedFrom ?? null,
    lastPromotionTick: state?.lastPromotionTick ?? null,
    promotedSplit: typeof state?.promotedSplit === "number" ? state.promotedSplit : null,
  };
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function partyIds(event: SimEvent): string[] {
  const data = event.data ?? {};
  const peace = data.peace as { factionIds?: unknown } | undefined;
  const alliance = data.alliance as { factionIds?: unknown } | undefined;
  return [
    ...stringList(data.factionIds),
    ...stringList(peace?.factionIds),
    ...stringList(alliance?.factionIds),
    ...stringList([data.factionId, data.payerFactionId, data.joinedFactionId, data.sellerFactionId, event.targetId]),
  ];
}

export function isDiplomacyEvent(type: string): boolean {
  return type === "faction-peace" || type === "faction-peace-broken" || type === "alliance-formed" || type === "alliance-broken";
}

/** Both parties. A third faction is not a party, including one that later holds the port. */
export function diplomacyParty(viewer: Character, event: SimEvent): boolean {
  if (!viewer.factionId) return false;
  return partyIds(event).includes(viewer.factionId);
}

export function showInPlayerFeed(viewer: Character, event: SimEvent): boolean {
  if ((PLAYER_FEED_BOOKKEEPING as readonly string[]).includes(event.type)) return false;
  if (isDiplomacyEvent(event.type)) return diplomacyParty(viewer, event);
  return true;
}

export function purchaseParty(viewer: Character, event: SimEvent): boolean {
  if (!viewer.factionId) return false;
  const data = event.data ?? {};
  return [data.factionId, data.payerFactionId, data.sellerFactionId, event.targetId].includes(viewer.factionId);
}

/**
 * Forecast and confirm copy. Null when this raid would not break a peace.
 * The command is still accepted.
 */
export function raidPeaceWarning(world: WorldState, viewer: Character, targetFactionId: string | null): string | null {
  if (!atPeace(world, viewer.factionId, targetFactionId)) return null;
  return `This raid breaks the peace with ${factionName(world, targetFactionId)}.`;
}

function garrisonEarned(world: WorldState, attacker: Character, settlementId: string | undefined, quoted: number): boolean {
  if (!settlementId) return false;
  const settlement = world.settlements[settlementId];
  if (attacker.locationId === settlementId && attacker.travel === null && settlement && Math.round(settlement.garrison) === quoted) {
    return true;
  }
  const knowledge = attacker.knowledge[settlementId];
  if (!knowledge || knowledge.source === "rumor") return false;
  return Math.round(knowledge.garrisonEstimate) === quoted;
}

/**
 * The raid reason stays on the attacker's line. A garrison figure stays only
 * when that attacker has earned that number. Anyone else loses the figure.
 */
export function presentRaidReason(world: WorldState, event: SimEvent, reader: Character | undefined, line: string): string {
  if (event.type !== "battle-started") return line;
  const pattern = / from a garrison believed to be about (\d+)/g;
  if (reader && event.actorId === reader.id) {
    return line.replace(pattern, (phrase, digits: string) => {
      const quoted = Number(digits);
      return garrisonEarned(world, reader, event.settlementId, quoted) ? phrase : "";
    });
  }
  return line.replace(pattern, "");
}

function drop(copy: Record<string, unknown>, key: string): boolean {
  if (!(key in copy)) return false;
  delete copy[key];
  return true;
}

/**
 * Payload the client may keep after the visibility check has already allowed it.
 * Picker traces, rival surplus, grievance, and the promotion clone stay off.
 * Returns the same object when nothing was removed.
 */
export function stripPlayerEventData(viewer: Character, event: SimEvent, data: unknown): unknown {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  const copy: Record<string, unknown> = { ...(data as Record<string, unknown>) };
  let changed = false;
  const gone = (key: string) => { if (drop(copy, key)) changed = true; };

  gone("ai");
  if (event.type === "settlement-purchased") gone("candidates");
  if (event.type === "character-promoted") gone("character");
  if (event.type === "settlement-upkeep" || event.type === "settlement-shortage") {
    gone("occupationTerms");
    gone("foodRatio");
    gone("foodRatios");
  }
  if (event.type === "battle-started") gone("occupationDefectors");
  if (event.type === "faction-peace" || event.type === "faction-peace-broken") {
    gone("grievance");
    gone("lastOldRaid");
    gone("evidence");
    gone("cause");
  }
  if (event.type === "secession-joined" || event.type === "alliance-formed") {
    gone("ownSurplus");
    gone("cause");
    gone("treasury");
    gone("evidence");
  }

  if (copy.occupation && typeof copy.occupation === "object") {
    const occupation = copy.occupation as Record<string, unknown>;
    copy.occupation = {
      harshness: occupation.harshness,
      sinceTick: occupation.tick ?? occupation.sinceTick,
      fromFactionId: occupation.fromFactionId,
      ...("byFactionId" in occupation ? { byFactionId: occupation.byFactionId } : {}),
    };
    changed = true;
  }

  if (copy.peace && typeof copy.peace === "object") {
    const peace = copy.peace as Record<string, unknown>;
    copy.peace = { factionIds: peace.factionIds, tick: peace.tick };
    changed = true;
  }
  if (copy.alliance && typeof copy.alliance === "object") {
    const alliance = copy.alliance as Record<string, unknown>;
    copy.alliance = {
      factionIds: alliance.factionIds,
      enemyFactionId: alliance.enemyFactionId,
      formedTick: alliance.formedTick,
    };
    changed = true;
  }
  if (copy.patron && typeof copy.patron === "object") {
    const patron = { ...(copy.patron as Record<string, unknown>) };
    if ("surplus" in patron) {
      delete patron.surplus;
      copy.patron = patron;
      changed = true;
    }
  }

  if (event.type === "settlement-purchased" && !purchaseParty(viewer, event)) {
    for (const key of ["price", "reserve", "treasuryBefore", "treasuryAfter", "cause", "priceBasis"]) gone(key);
  }
  if (event.type === "character-retired" || event.type === "character-returned" || event.type === "character-promoted" || event.type === "lifecycle-watch" || event.type === "lifecycle-watch-cleared") {
    for (const key of ["cause", "troops", "portsAtRetire", "office", "watchSince", "split", "captainTroopsAfter"]) gone(key);
  }

  if (event.type === "settlement-purchased" || event.type === "secession-joined" || event.type === "alliance-formed") {
    gone("surplus");
  }

  return changed ? copy : data;
}
