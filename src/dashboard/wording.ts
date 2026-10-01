import { commandHolderId } from "../sim/state.ts";
import type { Character, Faction, SimEvent, WorldState } from "../sim/types.ts";

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
  return type === "character-captured" || type === "captivity-released" || type === "battle-resolved" || type === "settlement-claimed";
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
    case "settlement-surrender-declined":
      return `${actor} declined a surrender${at}.`;
    case "player-command-accepted":
      return `A command was queued for ${actor}.`;
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
 * already records `purseDrawn`. Characters carry no pronoun, and the existing
 * sentences use "their", so the purse clause does too. A rival, and a draw of
 * zero, return null.
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
    return `${name} drew ${drawn} from the treasury and paid ${purse} from their purse.`;
  }
  return `${name} drew ${drawn} from the treasury.`;
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
