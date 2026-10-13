import { CLAIM_STABILITY_FLOOR, commandHolderId, practicedSkill, round } from "../sim/state.ts";
import type { Character, Faction, ResourceKey, SimEvent, WorldState } from "../sim/types.ts";

/**
 * Player-facing sentences. They are built when the state is read.
 * Nothing here writes the world, an event, or a stored cause.
 */

const OUTSCORE_CAUSE_LABEL = "taken on the dock after the other side won on a higher score";

/** The card label beside a stored `outscore-loss`. Other causes keep no extra label. */
export function causeLabelFor(cause: unknown): string | null {
  return cause === "outscore-loss" ? OUTSCORE_CAUSE_LABEL : null;
}

/**
 * A battle the payload itself rules out of a standing win.
 *
 * Troops at least 8, health above 15, morale at or below 12, garrison not 0,
 * and a higher attacker score. A finished major with morale above 12 can be a
 * standing win or an outscore win, and the battle event does not carry the
 * phase tally, so that case keeps `won at`.
 */
export function higherScoreWin(data: Record<string, unknown>): boolean {
  if (data.outcome !== "attacker-victory") return false;
  const troops = numberOrNull(data.attackerTroops);
  const health = numberOrNull(data.attackerHealth);
  const morale = numberOrNull(data.attackerMorale);
  const garrison = numberOrNull(data.defenderGarrison);
  const attackerScore = numberOrNull(data.attackerScore);
  const defenderScore = numberOrNull(data.defenderScore);
  if (
    troops === null || health === null || morale === null ||
    garrison === null || attackerScore === null || defenderScore === null
  ) return false;
  return troops >= 8 && health > 15 && morale <= 12 && garrison !== 0 && attackerScore > defenderScore;
}

/** ` on a higher score` when the payload rules the standing win out, otherwise empty. */
export function higherScoreClause(data: Record<string, unknown>): string {
  return higherScoreWin(data) ? " on a higher score" : "";
}

/**
 * Feed rows that keep the briefing sentence when the payload stays withheld.
 * `data` stays null. A decision, a contract, and an upkeep row are not in this set.
 */
export function summaryStaysWhenWithheld(type: string): boolean {
  return type === "character-captured" || type === "captivity-released" || type === "battle-resolved" || type === "settlement-claimed" || type === "secession-declared" || type === "tax-rate-set";
}

/**
 * Toma Reef and Toma Hale share a first name. The qualifier is display only.
 * The stored name is unchanged. Other shared first names are left as they are.
 */
const TOMA_REEF_ID = "character-07";
const TOMA_HALE_ID = "character-27";

export function characterName(world: WorldState, id: string | undefined, fallback: string): string {
  if (!id) return fallback;
  const character = world.characters[id];
  if (!character) return fallback;
  if (id !== TOMA_REEF_ID && id !== TOMA_HALE_ID) return character.name;
  const otherId = id === TOMA_REEF_ID ? TOMA_HALE_ID : TOMA_REEF_ID;
  const other = world.characters[otherId];
  if (!other || other.name.split(" ")[0] !== character.name.split(" ")[0]) return character.name;
  const faction = character.factionId
    ? world.factions[character.factionId]?.name ?? character.factionId
    : "unaffiliated";
  return `${character.name} (${faction})`;
}

/**
 * Display-only. Stored summaries still say "Toma Reef". A row the reader can
 * see uses the same qualifier as the card. Already-qualified text is left as it is.
 */
export function qualifyCollidingNames(world: WorldState, text: string): string {
  const reef = characterName(world, TOMA_REEF_ID, "Toma Reef");
  const hale = characterName(world, TOMA_HALE_ID, "Toma Hale");
  return text
    .replaceAll(/Toma Reef(?! \()/g, reef)
    .replaceAll(/Toma Hale(?! \()/g, hale);
}

export function settlementName(world: WorldState, id: string | undefined, fallback: string): string {
  if (!id) return fallback;
  return world.settlements[id]?.name ?? id;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function surrenderOfferedThisTick(event: SimEvent): boolean {
  const surrender = event.data.surrender;
  if (!surrender || typeof surrender !== "object") return false;
  return (surrender as { offeredTick?: unknown }).offeredTick === event.tick;
}

/**
 * Why a witnessed battle ended, in plain words, from the battle payload.
 *
 * "outscore" and "nerve broke" are not used. A major that ends with morale at
 * 12 or lower says morale gave out. A higher score on that shape says so.
 * The phase tally is not on the event, so a win with morale still above 12
 * is not called a phase win. An immediate fight (no battle id) is the score only.
 */
export function battleResolvedSentence(world: WorldState, event: SimEvent, events?: SimEvent[]): string {
  const actor = characterName(world, event.actorId, "Someone");
  const settlement = settlementName(world, event.settlementId, "the port");
  const won = event.data.outcome === "attacker-victory";
  const verb = won ? "won the fight" : "lost the fight";
  const parts = [`${actor} ${verb} at ${settlement}${battleReasonClause(event.data)}.`];
  const company = sameTickVictories(world, event, events);
  if (company) parts.push(company);
  const surrender = surrenderClause(event, events);
  if (surrender) parts.push(surrender);
  return parts.join(" ");
}

function battleReasonClause(data: Record<string, unknown>): string {
  const major = typeof data.battleId === "string";
  const morale = numberOrNull(data.attackerMorale);
  const health = numberOrNull(data.attackerHealth);
  const troops = numberOrNull(data.attackerTroops);
  const garrison = numberOrNull(data.defenderGarrison);
  const score = scoreClause(data);
  if (major && garrison === 0) return " because the garrison was gone";
  if (major && troops !== null && troops < 8) return " because fewer than 8 troops were left";
  if (major && health !== null && health <= 15) return " because the captain was too badly wounded to keep fighting";
  if (higherScoreWin(data)) return " on a higher score, after morale gave out";
  if (major && morale !== null && morale <= 12) {
    return score ? ` because morale gave out,${score}` : " because morale gave out";
  }
  return score;
}

function scoreClause(data: Record<string, unknown>): string {
  const attackerScore = numberOrNull(data.attackerScore);
  const defenderScore = numberOrNull(data.defenderScore);
  if (attackerScore === null || defenderScore === null) return "";
  if (attackerScore > defenderScore) return " on a higher score";
  if (attackerScore < defenderScore) return " on a lower score";
  return " on an equal score";
}

function sameTickVictories(world: WorldState, event: SimEvent, events: SimEvent[] | undefined): string | null {
  if (event.data.outcome !== "attacker-victory" || !events) return null;
  const wins = events.filter((other) =>
    other.type === "battle-resolved" &&
    other.tick === event.tick &&
    other.settlementId === event.settlementId &&
    other.data.outcome === "attacker-victory",
  );
  if (wins.length < 2) return null;
  const names = wins.map((other) => characterName(world, other.actorId, "Someone"));
  const garrison = numberOrNull(event.data.defenderGarrison);
  const standing = garrison !== null && garrison > 0 ? " This fight left the garrison standing." : "";
  return `${wins.length} captains won a fight here on this tick: ${names.join(", ")}.${standing}`;
}

function offerTo(event: SimEvent): { offeredToId?: string; offeredTick?: number } | null {
  const surrender = event.data.surrender;
  if (!surrender || typeof surrender !== "object") return null;
  return surrender as { offeredToId?: string; offeredTick?: number };
}

/**
 * The claim that took this battle's offer. It has to come after the battle.
 * A claim earlier in the tick took some other offer.
 */
function claimOfOffer(event: SimEvent, events: SimEvent[] | undefined): SimEvent | null {
  const offer = offerTo(event);
  if (!offer?.offeredToId || offer.offeredTick !== event.tick) return null;
  return (events ?? []).find((other) =>
    other.type === "settlement-claimed" &&
    other.settlementId === event.settlementId &&
    other.sequence > event.sequence &&
    other.actorId === offer.offeredToId,
  ) ?? null;
}

function surrenderClause(event: SimEvent, events: SimEvent[] | undefined): string | null {
  if (!surrenderOfferedThisTick(event)) return null;
  const claim = claimOfOffer(event, events);
  if (!claim) return "A surrender was offered.";
  if (claim.tick === event.tick) return "The surrender was offered and taken on this same tick.";
  if (claim.tick === event.tick + 1) return "The surrender was taken on the next tick.";
  return "A surrender was offered.";
}

/**
 * A claim that took a surrender offered on this tick or the tick before.
 * The offer did not sit as a decision. Without that battle in the read,
 * the line only says the port was claimed.
 */
export function settlementClaimedSentence(world: WorldState, event: SimEvent, events?: SimEvent[]): string {
  const actor = characterName(world, event.actorId, "Someone");
  const settlement = settlementName(world, event.settlementId, "the port");
  const offer = [...(events ?? [])].reverse().find((other) => {
    const surrender = offerTo(other);
    const offeredTick = surrender?.offeredTick;
    return other.type === "battle-resolved" &&
      other.settlementId === event.settlementId &&
      other.sequence < event.sequence &&
      surrender?.offeredToId === event.actorId &&
      typeof offeredTick === "number";
  });
  const offeredTick = offer ? offerTo(offer)?.offeredTick : undefined;
  if (typeof offeredTick === "number" && event.tick - offeredTick <= 1) {
    const when = event.tick === offeredTick ? "on this same tick" : "on the next tick";
    return `${actor} claimed ${settlement}. The surrender was offered and taken ${when}, so it was not waiting.`;
  }
  return `${actor} claimed ${settlement}.`;
}

/**
 * A withheld refusal. The directive stays out. The second sentence is the
 * captain's public place at the moment the state is read.
 */
export function refusedStandingOrderSentence(world: WorldState, event: SimEvent): string {
  const actor = characterName(world, event.actorId, "Someone");
  const character = event.actorId ? world.characters[event.actorId] : undefined;
  if (character?.travel) {
    const from = settlementName(world, character.travel.fromId, "a port");
    const to = settlementName(world, character.travel.toId, "a port");
    return `${actor} refused a standing order. ${actor} is sailing from ${from} to ${to}.`;
  }
  if (character?.locationId) {
    const place = settlementName(world, character.locationId, "a port");
    return `${actor} refused a standing order. ${actor} is at ${place}.`;
  }
  return `${actor} refused a standing order.`;
}

/** The captor faction on the capture row. A test event with no target falls back to the hold. */
export function captorName(world: WorldState, event: SimEvent): string {
  if (event.targetId && world.factions[event.targetId]) return world.factions[event.targetId].name;
  const captivity = event.data.captivity;
  if (captivity && typeof captivity === "object") {
    const id = (captivity as { captorFactionId?: unknown }).captorFactionId;
    if (typeof id === "string") return world.factions[id]?.name ?? id;
  }
  return "Unknown captor";
}

/**
 * The actor of the `battle-resolved` row whose `battleId` matches this capture.
 * A read handed only the capture cannot see that name.
 */
export function namedBattleWinner(world: WorldState, event: SimEvent, events?: SimEvent[]): string | null {
  const battleId = event.data.battleId;
  if (typeof battleId !== "string" || !events) return null;
  const battle = events.find((candidate) => candidate.type === "battle-resolved" && candidate.data.battleId === battleId);
  if (!battle?.actorId) return null;
  return world.characters[battle.actorId]?.name ?? battle.actorId;
}

export function characterCapturedSentence(world: WorldState, event: SimEvent, events?: SimEvent[]): string {
  const prisoner = characterName(world, event.actorId, "Someone");
  const settlement = settlementName(world, event.settlementId, "the port");
  const captor = captorName(world, event);
  const cause = typeof event.data.cause === "string" ? event.data.cause : "";
  if (cause === "outscore-loss") {
    const winner = namedBattleWinner(world, event, events) ?? "the attacker";
    return `${captor} took ${prisoner} on the dock at ${settlement} after ${winner} won there on a higher score`;
  }
  const causeText = cause ? cause.replaceAll("-", " ") : "the fight";
  return `${captor} took ${prisoner} at ${settlement} after ${causeText}`;
}

/** Chronicle body, without the day prefix. The winner is bold only when the battle row names them. */
export function characterCapturedChronicle(world: WorldState, event: SimEvent, events?: SimEvent[]): string {
  const prisoner = characterName(world, event.actorId, "Someone");
  const settlement = settlementName(world, event.settlementId, "the port");
  const captor = captorName(world, event);
  const cause = typeof event.data.cause === "string" ? event.data.cause : "";
  if (cause === "outscore-loss") {
    const winner = namedBattleWinner(world, event, events);
    const winnerText = winner ? `**${winner}**` : "the attacker";
    return `**${captor}** took **${prisoner}** on the dock at **${settlement}** after ${winnerText} won there on a higher score; their surviving troops scattered.`;
  }
  const causeText = cause ? cause.replaceAll("-", " ") : "the fight";
  return `**${captor}** took **${prisoner}** at **${settlement}** after ${causeText}; their surviving troops scattered.`;
}

export interface SeatReturn {
  name: string;
  faction: string;
}

/**
 * The freed character is still the person who issues the faction's orders.
 * The cover has already been cleared by the time a release is read, so the
 * line names the holder who returns and does not name the cover.
 */
export function seatReturn(world: WorldState, characterId: string | undefined): SeatReturn | null {
  if (!characterId) return null;
  const character = world.characters[characterId];
  if (!character?.factionId) return null;
  if (commandHolderId(world, character.factionId) !== character.id) return null;
  const faction = world.factions[character.factionId];
  if (!faction) return null;
  return { name: character.name, faction: faction.name };
}

export function seatReturnSentence(seat: SeatReturn): string {
  return `${seat.name} holds the seat of ${seat.faction} again`;
}

interface RansomCredit {
  treasuryShare: number;
  leaderShare: number;
  treasuryFactionId: string | null;
  leaderId: string | null;
}

function ransomCredit(event: SimEvent): RansomCredit | null {
  const ransom = event.data.ransom;
  if (!ransom || typeof ransom !== "object") return null;
  const credit = ransom as Partial<RansomCredit>;
  if (typeof credit.treasuryShare !== "number" || typeof credit.leaderShare !== "number") return null;
  return {
    treasuryShare: credit.treasuryShare,
    leaderShare: credit.leaderShare,
    treasuryFactionId: typeof credit.treasuryFactionId === "string" ? credit.treasuryFactionId : null,
    leaderId: typeof credit.leaderId === "string" ? credit.leaderId : null,
  };
}

/**
 * The reader cannot see this faction's treasury balance.
 * No reader means the world chronicle, which is not a person's view.
 */
function treasuryBalanceHidden(reader: Character | undefined, treasuryFactionId: string | null): boolean {
  if (!reader || !treasuryFactionId) return false;
  return reader.factionId !== treasuryFactionId;
}

/**
 * The payment line both sides read.
 *
 * A faction captor names only the treasury and the whole amount paid. A
 * factionless captor names only the party leader. A stored leader share above
 * 0 still names both recipients, so an older split event stays readable.
 * Absent when the release has no ransom credit.
 *
 * The amount paid is not the balance. When this reader cannot see that
 * treasury, the line says so instead of leaving the balance blank. The number
 * stays off the line.
 */
export function ransomPaidSentence(
  world: WorldState,
  event: SimEvent,
  chronicle = false,
  reader?: Character,
): string | null {
  const credit = ransomCredit(event);
  if (!credit) return null;
  const terms = event.data.terms as { moneyPaid?: number } | undefined;
  const paid = typeof terms?.moneyPaid === "number" ? terms.moneyPaid : credit.treasuryShare + credit.leaderShare;
  const payer = characterName(world, event.actorId, "Someone");
  const payerText = chronicle ? `**${payer}**` : payer;
  const leaderName = credit.leaderId ? characterName(world, credit.leaderId, "the party leader") : null;
  const leaderText = leaderName ? (chronicle ? `**${leaderName}**` : leaderName) : null;
  const hidden = !chronicle && treasuryBalanceHidden(reader, credit.treasuryFactionId)
    ? ". The balance is not visible to you"
    : "";
  if (credit.treasuryFactionId) {
    const factionName = world.factions[credit.treasuryFactionId]?.name ?? credit.treasuryFactionId;
    const factionText = chronicle ? `**${factionName}**` : factionName;
    if (leaderText && credit.leaderShare > 0) {
      const treasury = `${credit.treasuryShare} to the ${factionText} treasury`;
      return `${payerText} paid ${paid} ransom: ${treasury} and ${credit.leaderShare} to ${leaderText}${hidden}`;
    }
    return `${paid} went to the ${factionText} treasury${hidden}`;
  }
  if (!leaderText) return null;
  return `${payerText} paid ${paid} ransom: ${credit.leaderShare} to ${leaderText}`;
}

/**
 * The release, in short sentences.
 *
 * The feed may join them into one summary. `details` keeps each part. Every
 * fact from the old single sentence stays: place, paid, debt, the loyalty
 * line when debt is above 0, the ransom split, and the seat when she holds it.
 * The ransom sentence names only the ransom.
 */
export function captivityReleasedParts(
  world: WorldState,
  event: SimEvent,
  chronicle = false,
  reader?: Character,
): string[] {
  const actor = characterName(world, event.actorId, "Someone");
  const settlement = settlementName(world, event.settlementId, "captivity");
  const actorText = chronicle ? `**${actor}**` : actor;
  const settlementText = chronicle ? `**${settlement}**` : settlement;
  const terms = event.data.terms as { moneyPaid?: number; debtValue?: number } | undefined;
  const parts: string[] = [
    chronicle
      ? `${actorText} was released from ${settlementText} under mandatory terms.`
      : `${actorText} was released from ${settlementText}.`,
  ];
  if (typeof terms?.moneyPaid === "number" && typeof terms.debtValue === "number") {
    parts.push(`${terms.moneyPaid} was paid and ${terms.debtValue} was recorded as debt.`);
  }
  if (typeof terms?.debtValue === "number" && terms.debtValue > 0) parts.push("Loyalty fell.");
  const paid = ransomPaidSentence(world, event, chronicle, reader);
  if (paid) {
    parts.push(`${paid}.`);
    parts.push("The ransom line covers only the ransom.");
  }
  const seat = seatReturn(world, event.actorId);
  if (seat) {
    parts.push(chronicle
      ? `**${seat.name}** holds the seat of **${seat.faction}** again.`
      : `${seatReturnSentence(seat)}.`);
  }
  return parts;
}

export function captivityReleasedSentence(world: WorldState, event: SimEvent, reader?: Character): string {
  return captivityReleasedParts(world, event, false, reader).join(" ");
}

export function captivityReleasedChronicle(world: WorldState, event: SimEvent): string {
  return captivityReleasedParts(world, event, true).join(" ");
}

/**
 * Debt the release line already states, on the released character's card.
 *
 * The amount and the place are the same facts as that line. The stored debt
 * row stays on the debtor's own card only.
 */
export function releaseDebtNote(world: WorldState, characterId: string, events: SimEvent[] | undefined): string | null {
  if (!events) return null;
  const notes: string[] = [];
  for (const event of events) {
    if (event.type !== "captivity-released" || event.actorId !== characterId) continue;
    const debt = (event.data.terms as { debtValue?: number } | undefined)?.debtValue;
    if (typeof debt !== "number" || debt <= 0) continue;
    const place = settlementName(world, event.settlementId, "the port");
    notes.push(`Owes ${debt} from the release at ${place}.`);
  }
  return notes.length > 0 ? notes.join(" ") : null;
}

/**
 * The latest ransom credit the release line already names for this leader.
 *
 * It does not print the purse. A faction captor pays the treasury, so that
 * release is not income. A share of 0 is not income either.
 */
export function ransomIncomeNote(world: WorldState, characterId: string, events: SimEvent[] | undefined): string | null {
  if (!events) return null;
  let latest: SimEvent | null = null;
  let share = 0;
  for (const event of events) {
    if (event.type !== "captivity-released") continue;
    const credit = ransomCredit(event);
    if (!credit || credit.treasuryFactionId || credit.leaderId !== characterId || credit.leaderShare <= 0) continue;
    if (latest && event.sequence < latest.sequence) continue;
    latest = event;
    share = credit.leaderShare;
  }
  if (!latest) return null;
  const payer = characterName(world, latest.actorId, "Someone");
  const place = settlementName(world, latest.settlementId, "the port");
  return `Received ${share} from ${payer}'s ransom at ${place}.`;
}

/**
 * A withheld feed row, using only the names already on the row.
 *
 * Actor, target, and settlement ids are copied even when `data` is null.
 * Amounts, motives, and cargo stay off this sentence.
 */
export function publicFeedSentence(world: WorldState, event: SimEvent): string {
  const actor = event.actorId ? characterName(world, event.actorId, event.actorId) : "The world";
  const settlement = event.settlementId ? settlementName(world, event.settlementId, event.settlementId) : null;
  const target = event.targetId
    ? world.characters[event.targetId]?.name ?? world.settlements[event.targetId]?.name ?? world.factions[event.targetId]?.name ?? null
    : null;
  const at = settlement ? ` at ${settlement}` : "";
  switch (event.type) {
    case "standing-order-refused":
      return refusedStandingOrderSentence(world, event);
    case "standing-order-accepted":
      return `${actor} accepted an order.`;
    case "standing-order-deviated":
      return `${actor} left an order.`;
    case "standing-order-resumed":
      return `${actor} resumed an order.`;
    case "standing-order-completed":
      return `${actor} completed an order.`;
    case "standing-order-expired":
      return `${actor}'s order expired.`;
    case "standing-order-issued":
      return `${actor} issued an order.`;
    case "standing-order-amended":
      return `${actor} amended an order.`;
    case "standing-order-cancelled":
      return `${actor} cancelled an order.`;
    case "standing-order-completion-reported":
      return `${actor} reported an order complete.`;
    case "travel-progressed":
      return target ? `${actor} continued toward ${target}.` : `${actor} continued the voyage.`;
    case "travel-started":
      return target ? `${actor} departed for ${target}.` : `${actor} departed.`;
    case "arrived":
      return settlement ? `${actor} arrived at ${settlement}.` : `${actor} arrived.`;
    case "settlement-upkeep":
      return `${settlement ?? "A port"} kept its stores.`;
    case "settlement-produced":
      return `${settlement ?? "A port"} produced goods.`;
    case "settlement-shortage":
      return `${settlement ?? "A port"} is short of provisions.`;
    case "worked":
      return `${actor} worked${at}.`;
    case "market-trade":
      return `${actor} traded${at}.`;
    case "recruited":
      return `${actor} recruited${at}.`;
    case "rested":
      return `${actor} rested${at}.`;
    case "character-upkeep":
      return `${actor}'s upkeep was recorded.`;
    case "decision-made":
      return `${actor} made a decision.`;
    case "plan-reconsidered":
      return `${actor} reconsidered a plan.`;
    case "goal-progressed":
      return `${actor}'s ambition moved.`;
    case "goal-evolved":
      return `${actor}'s ambitions changed.`;
    case "knowledge-updated":
      return `${actor} updated what they know.`;
    case "relationship-changed":
      return `${actor}'s relationship changed.`;
    case "battle-started":
      return `${actor} started a battle${at}.`;
    case "battle-phase-resolved":
      return `${actor} finished a battle phase${at}.`;
    case "battle-retreated":
      return `${actor} retreated${at}.`;
    case "battle-resolved":
      return `${actor} finished a battle${at}.`;
    case "post-defeat-withdrawal-started":
      return `${actor} withdrew after a defeat${at}.`;
    case "character-captured":
      return `${actor} was taken${at}.`;
    case "captivity-released":
      return `${actor} was released${at}.`;
    case "captivity-escaped":
      return `${actor} escaped captivity${at}.`;
    case "scattered-troops-returned":
      return `Scattered troops returned to ${actor}.`;
    case "settlement-claimed":
      return settlement ? `${actor} claimed ${settlement}.` : `${actor} claimed a port.`;
    case "secession-declared":
      return secessionDeclaredSentence(world, event, actor);
    case "settlement-surrender-declined":
      return `${actor} declined a surrender${at}.`;
    case "player-command-accepted":
      return `A command was queued for ${actor}.`;
    case "tax-rate-set":
      return taxRateSetSentence(world, event, actor);
    case "player-command-resolved":
      return `${actor}'s command was resolved.`;
    case "player-command-failed":
      return `${actor}'s command failed.`;
    case "player-action-executed":
      return `${actor} carried out an action.`;
    case "metrics-recorded":
      return "The world recorded its figures.";
    case "tick-advanced":
      return "The day moved on.";
    case "conversation-thread-created":
      return `${actor} opened a conversation.`;
    case "conversation-message-sent":
      return `${actor} sent a message.`;
    case "conversation-reply-scheduled":
      return `${actor} will reply later.`;
    case "conversation-reply-created":
      return `${actor} replied.`;
    case "briefing-item-acknowledged":
      return `${actor} acknowledged a briefing item.`;
    case "reporting-officer-assigned":
      return "A reporting officer was assigned.";
    case "contract-offered":
      return `${actor} offered a contract.`;
    case "contract-amended":
      return `${actor} amended a contract.`;
    case "contract-accepted":
      return `${actor} accepted a contract.`;
    case "contract-refused":
      return `${actor} refused a contract.`;
    case "contract-fulfilled":
      return `${actor} fulfilled a contract.`;
    case "contract-breached":
      return `${actor} missed a contract.`;
    case "contract-cancelled":
      return `${actor} cancelled a contract.`;
    default:
      return `${actor} had a ${event.type.replaceAll("-", " ")} recorded.`;
  }
}

/**
 * Work or a sale at a port the reader already administers.
 *
 * The tax is the part that is not the ransom. Gross, the purse, and morale
 * stay out. Null when this row has no tax, or the port is not theirs.
 */
export function ownedPortTaxSentence(world: WorldState, readerFactionId: string | null, event: SimEvent): string | null {
  if (event.type !== "worked" && event.type !== "market-trade") return null;
  const tax = event.data.tax;
  if (typeof tax !== "number" || tax <= 0) return null;
  if (!readerFactionId || !event.settlementId) return null;
  if (world.settlements[event.settlementId]?.factionId !== readerFactionId) return null;
  const actor = characterName(world, event.actorId, "Someone");
  const place = settlementName(world, event.settlementId, "the port");
  const verb = event.type === "worked" ? "worked" : "traded";
  return `${actor} ${verb} at ${place}. Tax of ${tax} went to the treasury.`;
}

export function captivityEscapedSentence(world: WorldState, event: SimEvent): string {
  const actor = characterName(world, event.actorId, "Someone");
  const settlement = settlementName(world, event.settlementId, "captivity");
  let sentence = `${actor} escaped captivity at ${settlement} and suffered ${event.data.injury} health damage`;
  const seat = seatReturn(world, event.actorId);
  if (seat) sentence += `. ${seatReturnSentence(seat)}`;
  return sentence;
}

export function captivityEscapedChronicle(world: WorldState, event: SimEvent, scar: { attribute: string; penalty: number } | null): string {
  const actor = characterName(world, event.actorId, "Someone");
  const settlement = settlementName(world, event.settlementId, "captivity");
  let sentence = `**${actor}** escaped captivity at **${settlement}**, suffering ${event.data.injury} health damage${scar ? ` and a permanent -${scar.penalty} ${scar.attribute} scar` : ""}.`;
  const seat = seatReturn(world, event.actorId);
  if (seat) sentence += ` **${seat.name}** holds the seat of **${seat.faction}** again.`;
  return sentence;
}

/** While a cover is set. Null when the seat is not being covered. */
export function seatSummaryFor(world: WorldState, faction: Faction): string | null {
  const actingId = faction.actingCommanderId;
  if (!actingId) return null;
  const holderId = commandHolderId(world, faction.id);
  const cover = world.characters[actingId];
  const holder = holderId ? world.characters[holderId] : undefined;
  if (!cover || !holder) return null;
  return `${cover.name} covers ${holder.name}'s seat in ${faction.name} while ${holder.name} is held. The orders stay ${holder.name}'s.`;
}

/**
 * Which figure the seat sort reads, on the commander's own card.
 *
 * Only the rounded figure. The raw seed stays on `personality.loyalty` and is
 * not copied into this sentence.
 */
export function loyaltyNoteFor(_character: Character, displayedLoyalty: number): string {
  return `The seat reads ${displayedLoyalty}. That rounded figure is the one the seat uses.`;
}

/**
 * Briefing title for an event row.
 *
 * A raw type (`character captured`) reads as if the prisoner did the capturing.
 * These are sentences. They do not depend on actorId.
 */
export function eventBriefingTitle(type: string): string {
  switch (type) {
    case "character-captured":
      return "A captain was taken";
    case "battle-resolved":
      return "A battle was decided";
    case "captivity-released":
      return "A captain was released";
    case "captivity-escaped":
      return "A captain escaped";
    case "player-command-failed":
      return "A command failed";
    case "standing-order-accepted":
      return "An order was accepted";
    case "standing-order-refused":
      return "An order was refused";
    case "standing-order-deviated":
      return "An order was not followed.";
    case "standing-order-resumed":
      return "An order was resumed.";
    case "standing-order-completed":
      return "An order was completed";
    case "standing-order-expired":
      return "An order has expired.";
    case "scattered-troops-returned":
      return "Scattered troops came back.";
    case "settlement-shortage":
      return "A port is short of provisions";
    case "settlement-claimed":
      return "A port was claimed";
    case "secession-declared":
      return "A port was declared separate";
    default:
      return type.replaceAll("-", " ");
  }
}

export function skillsWithheldNote(name: string, tier: string, source: string): string {
  return `${name}'s leadership is withheld on this card. The reading is ${tier} (${source}), so skills stay off the card.`;
}

export function learnedInPortNote(place: string): string {
  return `Learned at ${place}. The hold and the purse are on this card because both ships are in port.`;
}

/** The upkeep row already stores the passage. Null when this upkeep was not a voyage. */
export function passageUpkeepSentence(world: WorldState, event: SimEvent): string | null {
  const passage = event.data.passageCost;
  const left = event.data.characterMoney;
  if (typeof passage !== "number" || typeof left !== "number") return null;
  const actor = characterName(world, event.actorId, "Someone");
  const drawn = event.data.treasuryDrawn;
  if (typeof drawn === "number" && drawn > 0) {
    return `${actor} paid ${passage} passage. ${drawn} came from the treasury. ${left} left.`;
  }
  return `${actor} paid ${passage} passage. ${left} left.`;
}

/**
 * A treasury draw the reader's own faction is allowed to see.
 *
 * Same shape as the port-tax sentence: who paid, and how much left the treasury.
 * Cargo and motives stay out. The purse share is named only when the event
 * already records `purseDrawn`. Characters have no pronoun field, so the purse
 * clause does not invent one. A rival, and a draw of zero, return null.
 *
 * A recruit that already carries a count and a cost uses `recruitDetailSentence`
 * instead of this line, so the draw is not said twice.
 */
export function treasuryDrawSentence(world: WorldState, readerFactionId: string | null, event: SimEvent): string | null {
  if (!readerFactionId || !event.actorId) return null;
  const actor = world.characters[event.actorId];
  if (!actor || actor.factionId !== readerFactionId) return null;
  const drawn = event.data.treasuryDrawn;
  if (typeof drawn !== "number" || drawn <= 0) return null;
  const name = characterName(world, event.actorId, "Someone");
  const purse = event.data.purseDrawn;
  if (typeof purse === "number" && purse > 0) {
    return `${name} drew ${drawn} from the treasury and paid ${purse} from the purse.`;
  }
  return `${name} drew ${drawn} from the treasury.`;
}

/**
 * Count and cost already stored on a recruit.
 *
 * One sentence for the whole event. Both payers stay in that sentence, so a
 * treasury draw is not dropped and is not repeated as a second line. Null when
 * the count or the cost is missing.
 */
export function recruitDetailSentence(world: WorldState, event: SimEvent): string | null {
  if (event.type !== "recruited") return null;
  const quantity = event.data.quantity;
  const cost = event.data.cost;
  if (typeof quantity !== "number" || typeof cost !== "number") return null;
  const actor = characterName(world, event.actorId, "Someone");
  const place = event.settlementId ? settlementName(world, event.settlementId, event.settlementId) : null;
  const at = place ? ` at ${place}` : "";
  const treasury = typeof event.data.treasuryDrawn === "number" ? event.data.treasuryDrawn : 0;
  const purse = typeof event.data.purseDrawn === "number" ? event.data.purseDrawn : 0;
  if (treasury > 0 && purse > 0) {
    return `${actor} recruited ${quantity}${at} for ${cost}: ${treasury} from the treasury and ${purse} from the purse.`;
  }
  if (treasury > 0) return `${actor} recruited ${quantity}${at} for ${cost} from the treasury.`;
  if (purse > 0) return `${actor} recruited ${quantity}${at} for ${cost} from the purse.`;
  return `${actor} recruited ${quantity}${at}.`;
}

/**
 * The trade the player keeps. Buys name who paid. Buys and sells name the
 * hold of that good as the state exposes it when the line is read, rounded
 * to two decimals. The receipt's `characterCargo` is the fill before the rest
 * of the tick, so it is not this figure.
 */
export function marketTradeSentence(
  world: WorldState,
  event: SimEvent,
  actor: string,
  settlement: string | null,
): string {
  const tax = typeof event.data.tax === "number" && event.data.tax > 0
    ? ` Tax of ${event.data.tax} went to the treasury.`
    : "";
  const resource = typeof event.data.resource === "string" ? event.data.resource : "goods";
  const quantity = event.data.quantity;
  const hold = holdNow(world, event, resource);
  const place = ` at ${settlement}`;
  if (event.data.direction === "bought" && typeof event.data.gross === "number") {
    return `${actor} bought ${quantity} ${resource}${place} for ${event.data.gross}${spendClause(event.data)}${hold}.${tax}`;
  }
  const direction = typeof event.data.direction === "string" ? event.data.direction : "traded";
  return `${actor} ${direction} ${quantity} ${resource}${place}${hold}.${tax}`;
}

/**
 * Who paid, already stored on the trade. Both shares, then treasury, then
 * the purse. No recorded payer leaves this empty, so a sale does not invent
 * a side.
 */
function spendClause(data: Record<string, unknown>): string {
  const treasury = numberOrNull(data.treasuryDrawn) ?? 0;
  const purse = numberOrNull(data.purseDrawn) ?? 0;
  if (treasury > 0 && purse > 0) {
    return `: ${treasury} from the treasury and ${purse} from the purse`;
  }
  if (treasury > 0) return " from the treasury";
  if (purse > 0) return " from the purse";
  return "";
}

function holdNow(world: WorldState, event: SimEvent, resource: string): string {
  const key = resourceKey(resource);
  if (!key) return "";
  const actor = event.actorId ? world.characters[event.actorId] : undefined;
  const live = actor ? actor.cargo[key] : null;
  const amount = typeof live === "number" ? live : cargoAmount(event.data.characterCargo, key);
  if (amount === null) return "";
  return ` (hold now ${round(amount, 2)})`;
}

function resourceKey(value: string): ResourceKey | null {
  if (value === "provisions" || value === "arms" || value === "medicine" || value === "shipMaterials") return value;
  return null;
}

function cargoAmount(value: unknown, key: ResourceKey): number | null {
  if (!value || typeof value !== "object") return null;
  return numberOrNull((value as Record<string, unknown>)[key]);
}

/**
 * The player-action-executed line, when the paired result already stores a count.
 *
 * The recruit, the buy, and the voyage are recorded on the next event for this
 * officer, before the command resolves. This sentence reads that pair. It does
 * not add a sim field. A recruit uses the same count, cost, and payer as
 * `recruitDetailSentence`, with a colon after the name and no extra period, so
 * the two lines cannot disagree. A buy uses the quantity, the good, and the
 * gross already on `market-trade`. A voyage uses `totalTicks` on
 * `travel-started`. The coin cost of a passage is not on that event: each sea
 * tick writes it later, on `character-upkeep`. Missing count returns null, and
 * the public line stays `{name} carried out an action.`
 *
 * A rival and any withheld row never keep this sentence. `projectEvent`
 * replaces it when the payload is withheld.
 */
export function executedActionSentence(world: WorldState, event: SimEvent, siblings?: SimEvent[]): string | null {
  if (event.type !== "player-action-executed") return null;
  const action = event.data.action;
  const actor = characterName(world, event.actorId, "Someone");
  if (action === "recruit") {
    const paired = pairedResult(event, siblings, "recruited");
    const quantity = paired ? numberOrNull(paired.data.quantity) : null;
    if (!paired || quantity === null) return null;
    const at = atPlace(world, paired.settlementId ?? event.settlementId);
    return `${actor}: recruited ${quantity}${at}${recordedPayer(paired.data)}`;
  }
  if (action === "buy-provisions" || action === "buy-resource" || action === "sell-resource") {
    const paired = pairedResult(event, siblings, "market-trade");
    if (!paired) return null;
    const quantity = numberOrNull(paired.data.quantity);
    const resource = typeof paired.data.resource === "string" ? paired.data.resource : null;
    const direction = paired.data.direction;
    const bought = action === "sell-resource" ? direction === "sold" : direction === "bought";
    if (quantity === null || !resource || !bought) return null;
    const verb = direction === "sold" ? "sold" : "bought";
    const at = atPlace(world, paired.settlementId ?? event.settlementId);
    return `${actor}: ${verb} ${quantity} ${resource}${at}${recordedPayer(paired.data)}`;
  }
  if (action === "travel") {
    const paired = pairedResult(event, siblings, "travel-started");
    const travel = paired ? travelRecord(paired.data.travel) : null;
    if (!travel || travel.totalTicks === null) return null;
    const destination = settlementName(world, travel.toId ?? event.targetId, "the destination");
    return `${actor}: traveled ${travel.totalTicks} ticks to ${destination}`;
  }
  return null;
}

/**
 * Cost and payer already stored on the paired result.
 *
 * Same words as the recruit sentence. Both shares, then treasury only, then
 * the purse. No recorded payer leaves the cost off, so a line that cannot say
 * who paid does not invent a side.
 */
function recordedPayer(data: Record<string, unknown>): string {
  const cost = numberOrNull(data.cost) ?? numberOrNull(data.gross);
  if (cost === null) return "";
  const treasury = numberOrNull(data.treasuryDrawn) ?? 0;
  const purse = numberOrNull(data.purseDrawn) ?? 0;
  if (treasury > 0 && purse > 0) {
    return ` for ${cost}: ${treasury} from the treasury and ${purse} from the purse`;
  }
  if (treasury > 0) return ` for ${cost} from the treasury`;
  if (purse > 0) return ` for ${cost} from the purse`;
  return "";
}

function atPlace(world: WorldState, settlementId: string | undefined): string {
  if (!settlementId) return "";
  return ` at ${settlementName(world, settlementId, settlementId)}`;
}

function pairedResult(event: SimEvent, siblings: SimEvent[] | undefined, type: string): SimEvent | null {
  if (!siblings) return null;
  const commandId = event.data.commandId;
  const ordered = siblings
    .filter((candidate) => candidate.sequence > event.sequence)
    .sort((left, right) => left.sequence - right.sequence);
  for (const candidate of ordered) {
    if (
      (candidate.type === "player-command-resolved" || candidate.type === "player-command-failed") &&
      candidate.data.commandId === commandId
    ) {
      break;
    }
    if (candidate.actorId === event.actorId && candidate.type === type) return candidate;
  }
  return null;
}

function travelRecord(value: unknown): { toId?: string; totalTicks: number | null } | null {
  if (!value || typeof value !== "object") return null;
  const travel = value as { toId?: unknown; totalTicks?: unknown };
  const toId = typeof travel.toId === "string" ? travel.toId : undefined;
  return { toId, totalTicks: numberOrNull(travel.totalTicks) };
}

/**
 * A withheld recruit the reader's own faction may already see a treasury draw on.
 *
 * A rival stays null. A purse-only row stays null. Both keep the public
 * sentence, which does not name the count or the cost. Null when the detail
 * cannot be built, so the draw sentence can still name the treasury share.
 */
export function withheldRecruitSentence(world: WorldState, readerFactionId: string | null, event: SimEvent): string | null {
  if (event.type !== "recruited") return null;
  if (!readerFactionId || !event.actorId) return null;
  const actor = world.characters[event.actorId];
  if (!actor || actor.factionId !== readerFactionId) return null;
  const drawn = event.data.treasuryDrawn;
  if (typeof drawn !== "number" || drawn <= 0) return null;
  return recruitDetailSentence(world, event);
}

/**
 * The confirmation line for a published tax-rate change.
 *
 * The rate is public, so a rival sees the same sentence. The payload may
 * still be withheld. 0.12 reads as 12%.
 */
/**
 * The public secession line.
 *
 * Follower names stay out of it. The old faction is the one on the event,
 * which is still in the world after the break.
 */
export function secessionDeclaredSentence(world: WorldState, event: SimEvent, actor: string): string {
  const place = settlementName(world, event.settlementId, "the port");
  const previousId = typeof event.data.previousFactionId === "string"
    ? event.data.previousFactionId
    : event.targetId;
  const faction = previousId ? world.factions[previousId]?.name ?? previousId : "the faction";
  let sentence = `${actor} declared ${place} separate from ${faction}.`;
  const founded = foundedFaction(event);
  // The event stores the treasury at the declaration, which is 0. Tax later
  // in the same tick can credit the faction row. The line says the start, so
  // the row's later balance is not a second founding figure.
  // The name is the new faction's, not the declarer's. An autonomous
  // declaration passes no name, and the payload stores "Free <port name>".
  // A faction with no name yet still says the treasury starts empty.
  if (founded && founded.treasury === 0) {
    const live = world.factions[founded.id]?.name;
    const named = founded.name || (typeof live === "string" ? live.trim() : "");
    sentence += ` ${named || "The new faction"} starts with an empty treasury.`;
  }
  // An autonomous declaration names no successor. The new seat stays unnamed.
  // A holder who leaves names the successor in a separate clause.
  if (event.type === "secession-declared" && !namedSuccessor(event)) {
    sentence += " (no leader yet)";
  }
  return sentence;
}

function foundedFaction(event: SimEvent): { id: string; name: string; treasury: number } | null {
  const faction = event.data.faction;
  if (!faction || typeof faction !== "object") return null;
  const record = faction as { id?: unknown; name?: unknown; treasury?: unknown };
  if (typeof record.id !== "string") return null;
  if (typeof record.treasury !== "number") return null;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  return { id: record.id, name, treasury: record.treasury };
}

function namedSuccessor(event: SimEvent): boolean {
  return typeof event.data.successorId === "string" && event.data.successorId.length > 0;
}

/**
 * The seat clause for a viewer who may see the payload.
 *
 * Null when this declaration did not name a successor. The public sentence
 * stays the line above. Follower names stay out of both.
 */
export function secessionSuccessorClause(world: WorldState, event: SimEvent): string | null {
  const successorId = event.data.successorId;
  if (typeof successorId !== "string" || successorId.length === 0) return null;
  return `${characterName(world, successorId, successorId)} takes the seat.`;
}

/**
 * The confirmation line for a published tax-rate change.
 *
 * A player set keeps `{actor} set the {faction} tax rate to {percent}%.`
 * An autonomous set, which has no `commandId`, names the direction and a
 * public reason. A rise is the short-treasury step. A fall is the pressed
 * port: the same-tick upkeep stability at or under 55, among ports that
 * faction held when the step ran. The stability number stays off the line.
 * When that upkeep is not in the sibling events, the line says unrest and
 * does not guess a port from a later reading.
 */
export function taxRateSetSentence(
  world: WorldState,
  event: SimEvent,
  actor: string,
  siblings?: SimEvent[],
): string {
  const rate = typeof event.data.taxRate === "number" ? event.data.taxRate : null;
  const factionId = typeof event.data.factionId === "string" ? event.data.factionId : event.targetId ?? undefined;
  const faction = factionId ? world.factions[factionId]?.name ?? "the faction" : "the faction";
  if (rate === null) return `${actor} set the tax rate.`;
  const previous = typeof event.data.previousTaxRate === "number" ? event.data.previousTaxRate : null;
  const autonomous = !Object.prototype.hasOwnProperty.call(event.data, "commandId");
  if (autonomous && previous !== null && previous !== rate) {
    const verb = rate > previous ? "raised" : "lowered";
    const reason = rate > previous ? "treasury short" : unrestReason(world, event, factionId, siblings);
    return `${actor} ${verb} the ${faction} tax to ${Math.round(rate * 100)}% (${reason}).`;
  }
  return `${actor} set the ${faction} tax rate to ${Math.round(rate * 100)}%.`;
}

function unrestReason(
  world: WorldState,
  event: SimEvent,
  factionId: string | undefined,
  siblings: SimEvent[] | undefined,
): string {
  if (!factionId) return "unrest";
  const port = pressedPortName(world, event, factionId, siblings);
  return port ? `unrest at ${port}` : "unrest";
}

/**
 * The pressed port the autonomous step would have read.
 *
 * Ownership is the current map, walked back through later claims and
 * declarations in the sibling list. Stability is the same-tick upkeep or
 * shortage that ran before the set. The lowest thousandth at or under the
 * claim floor wins. A tie takes the lower settlement id.
 */
function pressedPortName(
  world: WorldState,
  event: SimEvent,
  factionId: string,
  siblings: SimEvent[] | undefined,
): string | null {
  const owner = new Map<string, string | null>();
  for (const settlement of Object.values(world.settlements)) owner.set(settlement.id, settlement.factionId);
  const later = (siblings ?? [])
    .filter((other) => other.sequence > event.sequence)
    .sort((left, right) => right.sequence - left.sequence);
  for (const other of later) applyOwnership(owner, other, "reverse");
  let bestId: string | null = null;
  let bestThousandths = Number.POSITIVE_INFINITY;
  for (const [settlementId, holder] of owner) {
    if (holder !== factionId) continue;
    const upkeep = (siblings ?? []).find((other) =>
      other.tick === event.tick &&
      other.sequence < event.sequence &&
      other.settlementId === settlementId &&
      (other.type === "settlement-upkeep" || other.type === "settlement-shortage") &&
      typeof other.data.stability === "number"
    );
    if (!upkeep) continue;
    const thousandths = Math.round((upkeep.data.stability as number) * 1000);
    if (thousandths > CLAIM_STABILITY_FLOOR * 1000) continue;
    if (thousandths < bestThousandths || (thousandths === bestThousandths && (bestId === null || settlementId < bestId))) {
      bestId = settlementId;
      bestThousandths = thousandths;
    }
  }
  if (!bestId) return null;
  return world.settlements[bestId]?.name ?? bestId;
}

/**
 * The queued-command line.
 *
 * A tax-rate command names the percent. A provision buy keeps the quoted total.
 * Any other action is named only when the command itself carries the action
 * and a purse or treasury source, and a berth can be named. The berth is the
 * settlement stored on the event, or the officer's port on this reading when
 * the command did not store one. Anything missing keeps `Command queued for {name}`.
 */
export function queuedCommandSentence(
  world: WorldState,
  event: SimEvent,
  actor: string,
  settlement: string | null,
): string {
  const fallback = `Command queued for ${actor}`;
  const command = commandRecord(event.data.command);
  if (!command) return fallback;
  if (command.type === "set-tax-rate" && typeof command.taxRate === "number") {
    return `Command queued for ${actor}: set tax rate to ${Math.round(command.taxRate * 100)}%`;
  }
  if (command.type === "declare-secession") {
    const place = typeof command.settlementId === "string"
      ? world.settlements[command.settlementId]?.name ?? settlement ?? command.settlementId
      : settlement;
    if (!place) return fallback;
    const named = typeof command.name === "string" && command.name.length > 0 ? ` as ${command.name}` : "";
    return `Command queued for ${actor}: declare ${place} separate${named}`;
  }
  if (command.action === "buy-provisions" && typeof command.gross === "number") {
    const cap = command.capped
      ? ` (${settlement ?? "This market"} clears no more than ${command.quantity} in one order)`
      : "";
    return `Command queued for ${actor}: ${command.quantity} provisions at ${command.unitPrice} each, ${command.gross} total${cap}`;
  }
  if (typeof command.action !== "string" || command.action.length === 0) return fallback;
  const source = command.source === "purse" || command.source === "treasury" ? command.source : null;
  const place = settlement ?? berthName(world, event.actorId);
  if (!source || !place) return fallback;
  if (command.action === "travel") {
    const destinationId = typeof command.targetId === "string" ? command.targetId : null;
    const destination = destinationId ? world.settlements[destinationId]?.name ?? null : null;
    if (!destination) return fallback;
    return `Command queued for ${actor}: travel from ${place} to ${destination} (from the ${source})`;
  }
  return `Command queued for ${actor}: ${command.action} at ${place} (from the ${source})`;
}

/**
 * Income and spending the viewer's own faction can already account for.
 *
 * Tax is `tax` on work and sales, attributed to the faction that held the
 * port when the event was applied. Ransom is `ransom.treasuryShare` when
 * `treasuryFactionId` is this faction. Spending is `treasuryDrawn` by a
 * member, minus `treasuryRefunded` to that member. There is no wage event.
 * Passage, buys, and recruits are the draws. The window is the check-in
 * list the caller already loaded. A port taken before that list starts is
 * already on the current map, so reversing the list's claims is enough.
 * When the list was capped, the line says the older part was not loaded.
 */
export function treasuryBreakdownLine(
  world: WorldState,
  factionId: string,
  events: SimEvent[],
  windowTicks: number,
  capped: boolean,
): string {
  const ordered = [...events].sort((left, right) => left.sequence - right.sequence);
  const owner = new Map<string, string | null>();
  for (const settlement of Object.values(world.settlements)) owner.set(settlement.id, settlement.factionId);
  const member = new Map<string, string | null>();
  for (const character of Object.values(world.characters)) member.set(character.id, character.factionId);
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    applyOwnership(owner, ordered[index], "reverse");
    applyMembership(member, ordered[index], "reverse");
  }
  let tax = 0;
  let ransom = 0;
  let draws = 0;
  let refunds = 0;
  for (const event of ordered) {
    if ((event.type === "worked" || event.type === "market-trade") && event.settlementId) {
      const amount = numberOrNull(event.data.tax);
      if (amount !== null && amount > 0 && owner.get(event.settlementId) === factionId) tax += amount;
    }
    const credit = event.type === "captivity-released" ? ransomCredit(event) : null;
    if (credit && credit.treasuryFactionId === factionId && credit.treasuryShare > 0) ransom += credit.treasuryShare;
    if (event.actorId && member.get(event.actorId) === factionId) {
      const drawn = numberOrNull(event.data.treasuryDrawn);
      const refunded = numberOrNull(event.data.treasuryRefunded);
      if (drawn !== null && drawn > 0) draws += drawn;
      if (refunded !== null && refunded > 0) refunds += refunded;
    }
    applyOwnership(owner, event, "forward");
    applyMembership(member, event, "forward");
  }
  const spending = Math.max(0, draws - refunds);
  const income = ransom > 0
    ? `Tax income ${money(tax)}, ransom ${money(ransom)}`
    : `Tax income ${money(tax)}`;
  const cap = capped ? " Older events in that window were not loaded." : "";
  return `${income}, spending ${money(spending)}, over the last ${windowTicks} ticks.${cap}`;
}

function money(value: number): string {
  return String(round(value, 2));
}

function applyOwnership(owner: Map<string, string | null>, event: SimEvent, direction: "forward" | "reverse"): void {
  if (!event.settlementId) return;
  if (event.type === "settlement-claimed") {
    const next = typeof event.data.factionId === "string" ? event.data.factionId : null;
    const previous = typeof event.data.previousFactionId === "string" ? event.data.previousFactionId : null;
    owner.set(event.settlementId, direction === "forward" ? next : previous);
    return;
  }
  if (event.type !== "secession-declared") return;
  const founded = foundedFaction(event);
  const previous = typeof event.data.previousFactionId === "string" ? event.data.previousFactionId : null;
  owner.set(event.settlementId, direction === "forward" ? founded?.id ?? null : previous);
}

function applyMembership(member: Map<string, string | null>, event: SimEvent, direction: "forward" | "reverse"): void {
  if (event.type !== "secession-declared") return;
  const founded = foundedFaction(event);
  const previous = typeof event.data.previousFactionId === "string" ? event.data.previousFactionId : null;
  const next = direction === "forward" ? founded?.id ?? null : previous;
  const ownerId = typeof event.data.ownerId === "string" ? event.data.ownerId : event.actorId;
  if (ownerId) member.set(ownerId, next);
  const followers = event.data.followerIds;
  if (!Array.isArray(followers)) return;
  for (const followerId of followers) {
    if (typeof followerId === "string") member.set(followerId, next);
  }
}

function commandRecord(value: unknown): {
  type?: string;
  action?: string;
  source?: string;
  quantity?: number;
  unitPrice?: number;
  gross?: number;
  capped?: boolean;
  taxRate?: number;
  settlementId?: string;
  name?: string;
  targetId?: string;
} | null {
  if (!value || typeof value !== "object") return null;
  return value as {
    type?: string;
    action?: string;
    source?: string;
    quantity?: number;
    unitPrice?: number;
    gross?: number;
    capped?: boolean;
    taxRate?: number;
    settlementId?: string;
    name?: string;
    targetId?: string;
  };
}

function berthName(world: WorldState, actorId: string | undefined): string | null {
  if (!actorId) return null;
  const locationId = world.characters[actorId]?.locationId;
  if (!locationId) return null;
  return world.settlements[locationId]?.name ?? null;
}

/**
 * The panel title. `attentionCount` stays the decision count.
 * Background lines are the items drawn beyond that count.
 */
export function attentionLabel(attentionCount: number, shownCount: number): string {
  if (attentionCount <= 0) return "Check-in · clear";
  const background = shownCount - attentionCount;
  if (background <= 0) return `Check-in · ${attentionCount} need attention`;
  const noun = background === 1 ? "1 background line is" : `${background} background lines are`;
  return `Check-in · ${attentionCount} need attention, and ${noun} listed with them.`;
}

/**
 * Skills a feeding event practices, in the order the step writes them.
 *
 * `worked` practices leadership and trade. `travel-started` practices
 * navigation. `battle-resolved` practices strategy and leadership.
 * A sea tick and a battle phase are not in this map, so they grow nothing.
 */
const FEEDING_SKILLS: Record<string, readonly (keyof Character["skills"])[]> = {
  worked: ["leadership", "trade"],
  "travel-started": ["navigation"],
  "battle-resolved": ["strategy", "leadership"],
};

function wholePart(value: number): number {
  return Math.floor(round(value, 3) + 1e-9);
}

/**
 * The whole number a stored skill absolute crossed, or null when it did not.
 *
 * The feeding event stores the new absolute only. One use closes 0.1% of the
 * gap to 100 and rounds to 3 decimals, so the previous value is whichever
 * 3-decimal skill `practicedSkill` maps to this number. A step moves by at
 * most 0.1, and it crosses at most one whole number. Preimages that disagree
 * about the crossing produce no number.
 */
export function wholeNumberReached(next: number): number | null {
  if (!Number.isFinite(next)) return null;
  const rounded = round(next, 3);
  const approx = (rounded - 0.1) / 0.999;
  const center = Math.round(approx * 1000);
  const matches: number[] = [];
  for (let milli = center - 5; milli <= center + 5; milli += 1) {
    if (milli < 0) continue;
    const candidate = round(milli / 1000, 3);
    if (practicedSkill(candidate) === rounded) matches.push(candidate);
  }
  if (matches.length === 0) return null;
  const whole = wholePart(rounded);
  if (matches.every((previous) => whole > wholePart(previous))) return whole;
  return null;
}

/**
 * The quiet skill-gain line for one feeding event.
 *
 * One sentence per skill that crossed a whole number, in practice order.
 * "Mara Vane's trade rose to 58." A step that stays inside the same whole
 * number returns null. This does not write an event.
 */
export function skillGainSentence(world: WorldState, event: SimEvent): string | null {
  const keys = FEEDING_SKILLS[event.type];
  if (!keys || !event.actorId) return null;
  const name = characterName(world, event.actorId, event.actorId);
  const lines: string[] = [];
  for (const key of keys) {
    const next = event.data[key];
    if (typeof next !== "number") continue;
    const whole = wholeNumberReached(next);
    if (whole === null) continue;
    lines.push(`${name}'s ${key} rose to ${whole}.`);
  }
  return lines.length === 0 ? null : lines.join(" ");
}
