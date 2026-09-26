import { believedGarrison } from "../sim/agency.ts";
import { combatForecast } from "../sim/combat.ts";
import { COMMAND_LIMITS, commandCapabilities } from "../sim/commands.ts";
import {
  cargoCapacity,
  cargoLoad,
  provisionRunway,
  sellableProvisions,
  tradeQuote,
  travelDuration,
  type ProvisionRunway,
} from "../sim/engine.ts";
import { marketPrice, round, settlementClaimAvailableTo } from "../sim/state.ts";
import { RESOURCE_KEYS, type ActiveBattle, type Character, type SettlementKnowledge, type SimEvent, type WorldState } from "../sim/types.ts";
import { projectCharacter, projectEvent, projectFactions } from "./visibility.ts";

/**
 * Whether a battle at this settlement is one the commander could actually know
 * about. One rule, applied to `battleInProgress`, `observedBattles` and the
 * forecast gate: a commander sees a battle only where they are standing.
 *
 * These three previously disagreed. The per-settlement flag was set for any
 * battle anywhere, while the observable list correctly hid distant ones, so a
 * battle on the far side of the map announced itself both by setting the flag and
 * by silently removing the forecast from a foreign island the commander was
 * still considering attacking.
 */
export function battleIsVisible(commander: Character, settlementId: string): boolean {
  return commander.locationId === settlementId;
}

function eventSummary(world: WorldState, event: SimEvent): string {
  const actor = event.actorId ? world.characters[event.actorId]?.name ?? event.actorId : "World";
  const target = event.targetId
    ? world.characters[event.targetId]?.name ?? world.settlements[event.targetId]?.name ?? world.factions[event.targetId]?.name ?? event.targetId
    : null;
  const settlement = event.settlementId ? world.settlements[event.settlementId]?.name ?? event.settlementId : null;
  switch (event.type) {
    case "player-command-accepted":
      return `Command queued for ${actor}`;
    case "player-command-resolved":
      return `${actor}: ${String(event.data.outcome).replaceAll("-", " ")}`;
    case "player-command-failed":
      return `${actor}'s command failed: ${event.data.reason}`;
    case "standing-order-issued":
      return `${actor} issued ${String((event.data.order as { directive: string }).directive).replaceAll("-", " ")} orders to ${target}`;
    case "standing-order-amended":
      return String(event.data.summary);
    case "standing-order-cancelled":
      return String(event.data.summary);
    case "standing-order-accepted":
      return String(event.data.summary);
    case "standing-order-refused":
      return String(event.data.summary);
    case "standing-order-deviated":
      return String(event.data.summary);
    case "standing-order-resumed":
      return String(event.data.summary);
    case "standing-order-completion-reported":
      return String(event.data.summary);
    case "standing-order-completed":
      return String(event.data.summary);
    case "standing-order-expired":
      return String(event.data.summary);
    case "plan-reconsidered":
      return `${actor} reconsidered their plan: ${event.data.reason}`;
    case "battle-resolved":
      return `${actor} ${event.data.outcome === "attacker-victory" ? "won" : "lost"} at ${settlement}`;
    case "battle-started":
      return `${actor} committed to a major battle at ${settlement}`;
    case "battle-phase-resolved":
      return `${actor} completed phase ${event.data.phase} at ${settlement}`;
    case "battle-retreated":
      return `${actor} retreated from ${settlement} toward ${world.settlements[String(event.data.retreatDestinationId)]?.name ?? "open waters"}`;
    case "post-defeat-withdrawal-started":
      return `${actor} escaped defeat at ${settlement} and withdrew toward ${target ?? "open waters"}`;
    case "character-captured":
      return `${actor} was captured at ${settlement} after ${String(event.data.cause).replaceAll("-", " ")}`;
    case "captivity-escaped":
      return `${actor} escaped captivity at ${settlement} and suffered ${event.data.injury} health damage`;
    case "captivity-released": {
      const terms = event.data.terms as { moneyPaid: number; debtValue: number };
      return `${actor} was released from ${settlement}: ${terms.moneyPaid} paid and ${terms.debtValue} recorded as debt`;
    }
    case "scattered-troops-returned":
      return `${event.data.returning} scattered troops returned to ${actor}`;
    case "settlement-claimed":
      return `${actor} accepted ${settlement}'s surrender and established a claim`;
    case "arrived":
      return `${actor} arrived at ${settlement}`;
    case "travel-started":
      return `${actor} departed for ${target}`;
    case "market-trade":
      return `${actor} ${event.data.direction} ${event.data.quantity} ${event.data.resource} at ${settlement}`;
    case "goal-evolved":
      return `${actor}'s ambitions changed after ${event.data.trigger}`;
    case "settlement-shortage":
      return `${settlement} is suffering a provisions shortage`;
    case "conversation-thread-created":
      return `${actor} opened a conversation`;
    case "conversation-message-sent":
      return `${actor} sent a message`;
    case "conversation-reply-scheduled":
      return `${actor} will reply later`;
    case "conversation-reply-created":
      return `${actor} replied`;
    default:
      return `${actor}: ${event.type.replaceAll("-", " ")}`;
  }
}

interface ProvisionSource {
  settlementId: string;
  name: string;
  /** The commander is already at this settlement. */
  aboard: boolean;
  /** True when the figures are exact rather than a report. */
  exact: boolean;
  /** Provisions on the market, or null when the commander has never heard. */
  provisions: number | null;
  price: number | null;
  travelTicks: number | null;
  travelDays: number | null;
}

interface ProvisionPlan extends ProvisionSource {
  /** The voyage fits inside the remaining runway, with nothing to spare. */
  reachable: boolean;
}

/**
 * The nearest place the commander could actually buy provisions, and whether the
 * voyage fits inside the remaining runway.
 *
 * "You are about to starve" is only half an answer. The other half is whether any
 * food is reachable, which is the decision the player actually has to make. Owned
 * settlements are exact; foreign ones come from the same knowledge estimates the
 * rest of the panel uses, so this cannot reveal a market the commander has not
 * heard about.
 */
function provisionPlan(
  world: WorldState,
  commander: Character,
  runway: ProvisionRunway,
): ProvisionPlan | null {
  const candidates: ProvisionSource[] = Object.values(world.settlements)
    .map((settlement) => {
      const exact = settlement.factionId === commander.factionId;
      const knowledge = commander.knowledge[settlement.id];
      const provisions = exact
        ? settlement.stocks.provisions
        : knowledge?.stocksEstimate.provisions ?? null;
      const price = exact
        ? marketPrice(world, settlement.id, "provisions")
        : knowledge?.priceEstimate.provisions ?? null;
      const aboard = commander.locationId === settlement.id;
      // A party mid-voyage cannot divert. Its destination is the only market it
      // can still reach in time, so that is the only candidate worth quoting —
      // and quoting it is the whole point, because the realistic way to starve is
      // to run out a few ticks short of a port you were already sailing to.
      const travelTicks = aboard
        ? 0
        : commander.travel
          ? commander.travel.toId === settlement.id ? commander.travel.remainingTicks : null
          : travelEstimate(world, commander, settlement.id).travelTicks;
      return {
        settlementId: settlement.id,
        name: settlement.name,
        aboard,
        exact,
        provisions: provisions === null ? null : round(provisions, 1),
        price: price === null ? null : round(price, 2),
        travelTicks,
        travelDays: travelTicks === null ? null : round(travelTicks / world.ticksPerDay, 2),
      };
    })
    .filter((candidate) => (candidate.provisions ?? 0) >= 1)
    // Already alongside, then closest. A market whose quantity is unknown sorts
    // last, because the commander cannot plan around a stock they have not heard.
    .sort((left, right) => {
      if (left.aboard !== right.aboard) return left.aboard ? -1 : 1;
      if (left.travelTicks === null) return 1;
      if (right.travelTicks === null) return -1;
      return left.travelTicks - right.travelTicks || left.settlementId.localeCompare(right.settlementId);
    });

  const nearest = candidates[0];
  if (!nearest) return null;
  // Arriving with nothing left in the hold is still arriving: provisions can be
  // bought the moment the party is alongside.
  const reachable = nearest.travelTicks === null
    ? false
    : runway.runwayTicks === null || nearest.travelTicks <= runway.runwayTicks;
  return { ...nearest, reachable };
}

/**
 * Background reports shown at once. Applies to informational items only: an
 * action-required decision is never withheld, because a decision the player
 * cannot see is a decision the player cannot make.
 */
const INFO_ITEM_BUDGET = 10;

/**
 * Reserve the provisioning warning insists on, in world days. The warning fires
 * once the party could not make a return voyage to the nearest market and still
 * hold this much. It is a judgement call rather than a derivation, tuned by the
 * `own-party-001` playtest, and it should be revisited if long voyages change shape.
 */
const PROVISION_RESERVE_DAYS = 4;

function checkInBriefing(world: WorldState, commanderId: string, events: SimEvent[]): Record<string, unknown> {
  const commander = world.characters[commanderId];
  const player = Object.values(world.players).find((candidate) => candidate.characterId === commanderId)!;
  const actionItems: Array<Record<string, unknown>> = [];
  const warningItems: Array<Record<string, unknown>> = [];
  const infoItems: Array<Record<string, unknown>> = [];  const assignedOfficer = player.reportingOfficerId ? world.characters[player.reportingOfficerId] : null;
  const reportingOfficer = assignedOfficer?.controller.kind === "autonomous" &&
      assignedOfficer.factionId !== null &&
      assignedOfficer.factionId === commander.factionId
    ? assignedOfficer
    : null;
  const acknowledged = (id: string): boolean => id in player.briefingAcknowledgements;
  const addItem = (item: Record<string, unknown>): void => {
    if (!item.actionRequired && acknowledged(item.id as string)) return;
    if (item.actionRequired) actionItems.push(item);
    else if (item.severity === "warning") warningItems.push(item);
    else infoItems.push(item);
  };
  const relevantOrder = (event: SimEvent) => {
    const recipient = event.targetId ? world.characters[event.targetId] : undefined;
    const orderId = typeof event.data.orderId === "string" ? event.data.orderId : null;
    return recipient?.standingOrders.find((order) => order.id === orderId && order.issuerId === commanderId) ?? null;
  };

  const activeBattle = Object.values(world.activeBattles).find((battle) => battle.attackerId === commanderId);
  if (activeBattle?.lastPhase) {
    addItem({
      id: `battle:${activeBattle.id}:${activeBattle.phase}`,
      severity: "action",
      actionRequired: true,
      title: `Battle phase ${activeBattle.phase} complete`,
      summary: `${activeBattle.lastPhase.outcome.replaceAll("-", " ")}; retreat risk is ${activeBattle.lastPhase.retreatRisk}. Continue or withdraw toward ${activeBattle.retreatDestinationId ? world.settlements[activeBattle.retreatDestinationId]?.name ?? "open waters" : "open waters"}.`,
      day: round(world.tick / world.ticksPerDay, 2),
      settlementId: activeBattle.settlementId,
      battleId: activeBattle.id,
      action: "review-battle",
    });
  }

  if (commander.captivity) {
    const daysRemaining = Math.max(
      0,
      (commander.captivity.mandatoryReleaseTick - world.tick) / world.ticksPerDay,
    );
    addItem({
      id: `captivity:${commander.captivity.capturedTick}`,
      severity: "action",
      actionRequired: true,
      title: "Character held captive",
      summary: `Held at ${world.settlements[commander.captivity.settlementId]?.name ?? commander.captivity.settlementId}. Escape is guaranteed but dangerous; bounded release terms become mandatory in ${round(daysRemaining, 1)} days.`,
      day: round(world.tick / world.ticksPerDay, 2),
      settlementId: commander.captivity.settlementId,
      action: "review-captivity",
    });
  }

  for (const character of Object.values(world.characters)) {
    for (const order of character.standingOrders) {
      if (order.issuerId !== commanderId || order.status !== "awaiting-confirmation") continue;
      addItem({
        id: `confirm:${order.id}`,
        severity: "action",
        actionRequired: true,
        title: "Completion needs confirmation",
        summary: order.lastReport?.summary ?? `${character.name} reports an order complete.`,
        day: round(order.statusChangedTick / world.ticksPerDay, 2),
        characterId: character.id,
        orderId: order.id,
        action: "confirm-order",
      });
    }
  }

  const surrender = Object.values(world.settlements).find((settlement) =>
    commander.locationId === settlement.id && settlementClaimAvailableTo(settlement, commander.id)
  );
  if (surrender) {
    addItem({
      id: `surrender:${surrender.id}`,
      severity: "action",
      actionRequired: true,
      title: "Surrender awaiting decision",
      summary: `${surrender.name} is offering surrender to ${commander.name}.`,
      day: round(world.tick / world.ticksPerDay, 2),
      settlementId: surrender.id,
      action: "review-surrender",
      // The offer is a decision, not a single button: accept and keep fighting
      // are both legitimate, and the second one used to have no representation.
      actions: ["claim-settlement", "decline-surrender"],
    });
  }

  // The party's own supplies. The simulation has always acted on this: the
  // autonomous planner weighs a supply need before it commits to a plan, so an
  // unsupervised party provisions itself. A player had only a falling number and
  // no warning, and one lost thirty-three ticks of morale to that silence.
  const runway = provisionRunway(world, commander);
  const resupply = provisionPlan(world, commander, runway);
  const sourceHint = resupply
    ? resupply.aboard
      ? `${resupply.name} is alongside and sells provisions.`
      : resupply.travelTicks === null
        ? `No market you could still reach sells provisions.`
        : `${resupply.name} is ${resupply.travelTicks} ticks${resupply.exact ? "" : " by report"} away — ${
          resupply.reachable
            ? "within reach, but there will be nothing to spare"
            : `out of reach, which is short by ${resupply.travelTicks - runway.runwayTicks} ticks`
        }.`
    : "No settlement you know of has provisions to sell.";
  if (runway.shortage > 0) {
    const cost = [
      `health ${runway.shortageHealthPerTick} and morale ${runway.shortageMoralePerTick} per tick`,
      runway.shortageTroopLossPerTick > 0 ? `${runway.shortageTroopLossPerTick} troops per tick` : null,
    ].filter(Boolean).join(", and ");
    addItem({
      id: "provision:critical",
      severity: "action",
      // Deliberately not acknowledgeable. This is not a heads-up, it is a state
      // the party is in until someone buys food.
      actionRequired: true,
      title: "The party is starving",
      summary: `The hold is empty and ${runway.shortage} provisions per tick cannot be found. That costs ${cost}. Morale gains nothing while the shortage lasts, so it will not recover on its own. ${sourceHint}`,
      day: round(world.tick / world.ticksPerDay, 2),
      settlementId: resupply?.settlementId ?? null,
      aboard: resupply?.aboard ?? false,
      action: "review-provisions",
    });
  } else {
    // Warn while there is still time to act. A first playtest found this firing at
    // one day of food, which is a smoke alarm that sounds once the fire is lit, so
    // the standard is now a whole return voyage to the nearest market plus a four
    // day reserve. That is the point at which the hold stops being able to
    // guarantee an exit rather than merely being low.
    const reserve = PROVISION_RESERVE_DAYS * world.ticksPerDay;
    const voyage = resupply && !resupply.aboard ? (resupply.travelTicks ?? Infinity) : 0;
    const needed = voyage === Infinity ? Infinity : 2 * voyage + reserve;
    if (runway.runwayTicks <= needed) {
      const ticks = runway.runwayTicks === 1 ? "1 tick" : `${runway.runwayTicks} ticks`;
      const days = runway.runwayDays === 1 ? "1 day" : `${runway.runwayDays} days`;
      const target = runway.resupplyTarget > runway.provisions
        ? ` A full top-up would buy ${runway.resupplyTarget}, about ${Math.floor(runway.resupplyTarget / runway.demand)} ticks.`
        : " The hold is already at the amount a top-up would buy.";
      addItem({
        id: "provision:low",
        severity: "warning",
        actionRequired: false,
        title: "Provisions are running low",
        summary: `About ${ticks} (${days}) of provisions remain at ${runway.demand} per tick.${target} ${sourceHint}`,
        day: round(world.tick / world.ticksPerDay, 2),
        settlementId: resupply?.settlementId ?? null,
        acknowledgeable: true,
      });
    }
  }

  // Hearsay seeded before the world began carries a negative `observedTick` to
  // mark it as predating the commander's arrival. That backdating is not elapsed
  // time, and reading it as such made a two-day-old world describe a report four
  // days old and fire this warning on day one for knowledge that was never fresh.
  const staleness = (knowledge: SettlementKnowledge): number =>
    world.tick - Math.max(0, knowledge.observedTick);
  const staleIntelligence = Object.values(world.settlements)
    .filter((settlement) => settlement.factionId !== commander.factionId)
    .map((settlement) => ({ settlement, knowledge: commander.knowledge[settlement.id] }))
    .filter(({ knowledge }) => knowledge && staleness(knowledge) >= world.ticksPerDay * 3)
    // Most stale first, so the two reported are the two least trustworthy.
    .sort((left, right) => staleness(right.knowledge) - staleness(left.knowledge))
    .slice(0, 2);
  for (const { settlement, knowledge } of staleIntelligence) {
    addItem({
      // Clamped so a backdated report cannot put a negative number in an id.
      id: `intel:${settlement.id}:${Math.max(0, knowledge.observedTick)}`,
      severity: "warning",
      actionRequired: false,
      title: "Intelligence is stale",
      summary: knowledge.observedTick < 0
        ? `${settlement.name}'s report predates your arrival and has never been refreshed.`
        : `${settlement.name}'s report is ${staleness(knowledge)} ticks old.`,
      day: round(world.tick / world.ticksPerDay, 2),
      settlementId: settlement.id,
      acknowledgeable: true,
    });
  }

  const includedTypes = new Set([    "player-command-failed",
    "standing-order-accepted",
    "standing-order-refused",
    "standing-order-deviated",
    "standing-order-resumed",
    "standing-order-completed",
    "standing-order-expired",
    "battle-resolved",
    "character-captured",
    "captivity-escaped",
    "captivity-released",
    "scattered-troops-returned",
    "settlement-shortage",
    "settlement-claimed",
  ]);
  const routineTypes = new Set(["standing-order-accepted", "standing-order-resumed", "standing-order-completed"]);
  const routineEvents: SimEvent[] = [];
  const eventReports: Array<Record<string, unknown> & { sequence: number }> = [];
  for (const event of [...events].reverse()) {
    if (!includedTypes.has(event.type)) continue;
    if (event.type.startsWith("standing-order-") && !relevantOrder(event)) continue;
    if (event.type === "settlement-shortage" && world.settlements[event.settlementId!]?.factionId !== commander.factionId) continue;
    if (event.type === "battle-resolved") {
      const actor = event.actorId ? world.characters[event.actorId] : undefined;
      const defendedFactionId = event.settlementId ? world.settlements[event.settlementId]?.factionId : null;
      if (actor?.factionId !== commander.factionId && defendedFactionId !== commander.factionId) continue;
    }
    const warning = event.type === "player-command-failed" || event.type === "standing-order-refused" ||
      event.type === "standing-order-deviated" || event.type === "standing-order-expired" ||
      event.type === "settlement-shortage" || event.type === "character-captured" ||
      event.type === "captivity-released" ||
      (event.type === "battle-resolved" && event.data.outcome !== "attacker-victory");
    if (reportingOfficer && routineTypes.has(event.type)) {
      if (event.sequence > player.routineBriefingThroughSequence) routineEvents.push(event);
      continue;
    }
    eventReports.push({
      id: `event:${event.sequence}`,
      sequence: event.sequence,
      severity: warning ? "warning" : "info",
      actionRequired: false,
      title: event.type.replaceAll("-", " "),
      summary: eventSummary(world, event),
      day: round(event.tick / world.ticksPerDay, 2),
      characterId: event.targetId && world.characters[event.targetId] ? event.targetId : event.actorId,
      settlementId: event.settlementId,
      orderId: event.data.orderId,
      acknowledgeable: true,
    });
  }

  if (reportingOfficer && routineEvents.length > 0) {
    const throughSequence = Math.max(...routineEvents.map((event) => event.sequence));
    const counts = Object.fromEntries(
      [...routineTypes].map((type) => [type, routineEvents.filter((event) => event.type === type).length]),
    ) as Record<string, number>;
    const details = [
      counts["standing-order-accepted"] ? `${counts["standing-order-accepted"]} accepted` : null,
      counts["standing-order-resumed"] ? `${counts["standing-order-resumed"]} resumed` : null,
      counts["standing-order-completed"] ? `${counts["standing-order-completed"]} confirmed` : null,
    ].filter(Boolean).join(", ");
    addItem({
      id: `routine:${reportingOfficer.id}:${throughSequence}`,
      severity: "info",
      actionRequired: false,
      title: `${reportingOfficer.name}'s routine digest`,
      summary: `${routineEvents.length} routine order updates: ${details}. No command decision is required.`,
      day: round(Math.max(...routineEvents.map((event) => event.tick)) / world.ticksPerDay, 2),
      reportingOfficerId: reportingOfficer.id,
      throughSequence,
      routed: true,
      acknowledgeable: true,
    });
  }

  // Repeated reports about the same subject are one piece of news, not seven.
  // The paged-history session was shown seven near-identical "standing order
  // deviated" entries for one character, which is what crowded the panel until
  // genuine decisions fell off the end of it. Grouping is by kind and subject,
  // deliberately not by order, because the duplicates differed only in which
  // order they named.
  const groupKey = (report: Record<string, unknown>): string =>
    [report.title, report.characterId ?? "-", report.settlementId ?? "-"].join("|");
  const grouped = new Map<string, Array<Record<string, unknown> & { sequence: number }>>();
  for (const report of eventReports) {
    const key = groupKey(report);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(report);
    else grouped.set(key, [report]);
  }
  for (const [key, bucket] of grouped) {
    if (bucket.length === 1) {
      addItem(bucket[0]);
      continue;
    }
    // Newest sequence in the identifier, so acknowledging the group silences it
    // only up to what has been read; the next report reopens it.
    const newest = bucket.reduce((left, right) => (right.sequence > left.sequence ? right : left));
    const oldest = bucket.reduce((left, right) => (right.sequence < left.sequence ? right : left));
    addItem({
      ...newest,
      id: `event-group:${key}:${newest.sequence}`,
      title: `${newest.title} ×${bucket.length}`,
      summary: `${bucket.length} such reports, the most recent being: ${newest.summary}. The first was on day ${oldest.day}.`,
      count: bucket.length,
      throughSequence: newest.sequence,
    });
  }

  // The budget applies to background information only. An action-required item is
  // a decision the player cannot make if they cannot see it, so nothing that
  // needs attention is ever dropped; the count reports what was shown, and any
  // omitted background is stated rather than silently lost.
  const attention = [...actionItems, ...warningItems];
  const infoBudget = Math.max(0, INFO_ITEM_BUDGET - attention.length);
  const info = infoItems.slice(0, infoBudget);
  const omittedInfoCount = infoItems.length - info.length;
  const items = [...attention, ...info];
  const eligibleOfficers = Object.values(world.characters)
    .filter((character) =>
      character.controller.kind === "autonomous" &&
      character.factionId !== null &&
      character.factionId === commander.factionId &&
      player.knownCharacterIds.includes(character.id)
    )
    .sort((left, right) => right.skills.leadership - left.skills.leadership || left.id.localeCompare(right.id))
    .map((character) => ({ id: character.id, name: character.name, leadership: character.skills.leadership }));

  return {
    /**
     * Items needing a decision. Always equal to the number of action and warning
     * items returned, because every one of them is returned.
     */
    attentionCount: attention.length,
    /** Background reports held back to keep the panel readable. */
    omittedInfoCount,
    reportingOfficer: reportingOfficer ? {
      id: reportingOfficer.id,
      name: reportingOfficer.name,
      leadership: reportingOfficer.skills.leadership,
    } : null,
    eligibleOfficers,
    items,
  };
}

/**
 * One page of the event feed. The caller supplies the page so the feed can be
 * paged without widening how much a single request may read, while the briefing
 * still scans a much larger window for exceptional events.
 */
export interface EventFeedPage {
  events: SimEvent[];
  /** True when events older than this page exist. */
  hasMore: boolean;
  /** The page size the caller requested. */
  limit: number;
  /** Total events retained in the store. */
  total: number;
  /**
   * Largest page a client may request. Carried on the page because the
   * capability block publishes it, and a hardcoded copy there would drift.
   */
  limitMax: number;
  /** Page size applied when the client does not request one. */
  limitDefault: number;
}

/**
 * Projects events for one commander through the single visibility path.
 *
 * Both the feed and the advance diff must go through this function. A second,
 * more permissive path would silently undo the redaction work: a feed that is
 * more permissive than the character projection defeats the projection entirely.
 */
export function projectEventFeed(
  world: WorldState,
  commanderId: string,
  events: SimEvent[],
): Record<string, unknown>[] {
  const commander = world.characters[commanderId];
  return events.map((event) => projectEvent(world, commander, event, eventSummary(world, event)));
}

/** Builds a feed page holding every supplied event. Convenient when the caller already holds a full set. */
export function fullEventFeed(events: SimEvent[], bounds: { limitMax?: number; limitDefault?: number } = {}): EventFeedPage {
  return {
    events,
    hasMore: false,
    limit: events.length,
    total: events.length,
    limitMax: bounds.limitMax ?? events.length,
    limitDefault: bounds.limitDefault ?? events.length,
  };
}

/**
 * Voyage length to a settlement the commander could actually sail to, in ticks
 * and days. Nulls when the question does not apply: already there, already at
 * sea, or captive. Uses the same function travel will use, so the quote cannot
 * disagree with the voyage.
 */
function travelEstimate(
  world: WorldState,
  commander: Character,
  settlementId: string,
): { travelTicks: number | null; travelDays: number | null } {
  const canSail = commander.locationId !== null &&
    commander.locationId !== settlementId &&
    commander.travel === null &&
    commander.captivity === null;
  if (!canSail) return { travelTicks: null, travelDays: null };
  const ticks = travelDuration(world, commander, settlementId);
  return { travelTicks: ticks, travelDays: round(ticks / world.ticksPerDay, 2) };
}

function projectCommandedBattle(world: WorldState, battle: ActiveBattle): Record<string, unknown> {
  return {
    ...battle,
    settlementName: world.settlements[battle.settlementId].name,
    retreatDestinationName: battle.retreatDestinationId
      ? world.settlements[battle.retreatDestinationId]?.name ?? "Open waters"
      : "Open waters",
    canRetreat: battle.phase > 0 && battle.phase < battle.totalPhases,
  };
}

/** Present-tense prices at one market, as the board actually reads right now. */
function currentPrices(world: WorldState, settlementId: string): Record<string, number> {
  return Object.fromEntries(RESOURCE_KEYS.map((resource) => [resource, marketPrice(world, settlementId, resource)]));
}

/**
 * What the commander could buy or sell at the market they are standing in.
 *
 * Every figure comes from `tradeQuote`, the same function the command boundary
 * charges against, so the panel cannot quote a trade the boundary would price
 * differently. Nothing here is offered for a market the commander is not at,
 * because trading requires being there and a remote quote would be an estimate
 * presented as a price.
 */
function projectMarket(world: WorldState, commander: Character, settlementId: string): Record<string, unknown> {
  const settlement = world.settlements[settlementId];
  const capacity = cargoCapacity(commander);
  const load = cargoLoad(commander);
  const taxRate = settlement.factionId ? world.factions[settlement.factionId].taxRate : 0;
  return {
    settlementId,
    /** Units the hold can carry in total, across every resource. */
    capacity,
    /** Units it is carrying now. */
    load: round(load, 3),
    /** Units it could still take. */
    free: round(Math.max(0, capacity - load), 3),
    money: commander.money,
    /** Fraction of a sale the local faction takes. Zero with no faction. */
    taxRate,
    /** Provisions held back from sale so a voyage cannot strand its own crew. */
    provisionsReserve: round(commander.cargo.provisions - sellableProvisions(commander), 3),
    resources: Object.fromEntries(RESOURCE_KEYS.map((resource) => {
      const buy = tradeQuote(world, commander, resource, "buy", COMMAND_LIMITS.tradeQuantity.max);
      const sell = tradeQuote(world, commander, resource, "sell", COMMAND_LIMITS.tradeQuantity.max);
      return [resource, {
        /**
         * Board price, per unit, exact — cents are not rounded here because the
         * panel runs this through the same cent cascade the boundary charges
         * (`tradeAmounts`), and rounding twice would quote a total the purse
         * disagrees with. One price covers both directions: a purchase adds no
         * tax, a sale subtracts `taxRate` from the same board figure.
         */
        price: buy.unitPrice,
        stock: round(settlement.stocks[resource], 3),
        targetStock: settlement.targetStocks[resource],
        /** Largest single buy the market, the hold and the purse allow. */
        maxBuy: buy.maxQuantity,
        /** Largest single sale the hold and the reserve allow. */
        maxSell: sell.maxQuantity,
      }];
    })),
  };
}

export function dashboardState(
  world: WorldState,
  briefingEvents: SimEvent[],
  feed: EventFeedPage,
): Record<string, unknown> {
  const player = Object.values(world.players)[0];
  const commander = world.characters[player.characterId];
  const commandedBattle = Object.values(world.activeBattles)
    .find((battle) => battle.attackerId === commander.id) ?? null;
  // A battle the commander is not leading, but which they can actually observe:
  // either they are on the ground, or it is happening in their own territory.
  // Distant battles stay hidden, matching the character projection.
  const observedBattles = Object.values(world.activeBattles)
    .filter((battle) => battle.attackerId !== commander.id && battleIsVisible(commander, battle.settlementId))
    .sort((left, right) => left.id.localeCompare(right.id));
  const captivity = commander.captivity;
  const ownPartyRunway = provisionRunway(world, commander);
  const resupplyPlan = provisionPlan(world, commander, ownPartyRunway);
  return {
    tick: world.tick,
    day: round(world.tick / world.ticksPerDay, 2),
    ticksPerDay: world.ticksPerDay,
    player,
    commanderId: commander.id,
    /**
     * The commander's own party. Owned assets expose exact statistics, and these
     * are the numbers the party will actually be charged next tick, plus the
     * trajectory they imply.
     */
    party: {
      id: commander.id,
      name: commander.name,
      locationId: commander.locationId,
      ...ownPartyRunway,
      /** Where provisions could be bought, and whether the voyage fits the runway. */
      resupply: resupplyPlan,
    },
    pendingCommands: world.pendingCommands,
    capabilities: commandCapabilities({
      eventFeed: { limitMax: feed.limitMax, limitDefault: feed.limitDefault },
    }),
    combat: {
      /** The battle this commander is personally leading. */
      commandedBattle: commandedBattle ? projectCommandedBattle(world, commandedBattle) : null,
      /** Battles at the commander's location led by someone else. */
      observedBattles: observedBattles.map((battle) => ({
        id: battle.id,
        settlementId: battle.settlementId,
        settlementName: world.settlements[battle.settlementId].name,
        attackerId: battle.attackerId,
        attackerName: world.characters[battle.attackerId]?.name ?? battle.attackerId,
        phase: battle.phase,
        totalPhases: battle.totalPhases,
      })),
      /** Compatibility alias for `commandedBattle`. Prefer the explicit name. */
      active: commandedBattle ? projectCommandedBattle(world, commandedBattle) : null,
    },
    captivity: {
      active: captivity ? {
        ...captivity,
        settlementName: world.settlements[captivity.settlementId]?.name ?? captivity.settlementId,
        captorName: captivity.captorFactionId
          ? world.factions[captivity.captorFactionId]?.name ?? captivity.captorFactionId
          : "Unknown captor",
        heldDays: round((world.tick - captivity.capturedTick) / world.ticksPerDay, 2),
        daysUntilMandatoryRelease: round(Math.max(0, captivity.mandatoryReleaseTick - world.tick) / world.ticksPerDay, 2),
        canEscape: true,
      } : null,
    },
    briefing: checkInBriefing(world, commander.id, briefingEvents),
    factions: projectFactions(world, commander),
    settlements: Object.values(world.settlements).map((settlement) => {
      const exact = settlement.factionId === commander.factionId;
      const knowledge = commander.knowledge[settlement.id];
      const settlementBattle = Object.values(world.activeBattles).find((battle) => battle.settlementId === settlement.id) ?? null;
      // Distant battles are not disclosed. `forecastAvailable` uses the same
      // visibility test so a hidden battle cannot announce itself by making the
      // forecast silently vanish.
      const battleVisible = settlementBattle !== null && battleIsVisible(commander, settlement.id);
      const surrenderOffered = commander.locationId === settlement.id &&
        settlement.factionId !== null &&
        settlement.factionId !== commander.factionId &&
        settlementClaimAvailableTo(settlement, commander.id);
      const hostile = settlement.factionId !== null && settlement.factionId !== commander.factionId;
      // A forecast no longer requires standing on the island. It requires some
      // earned basis for one: either direct observation or a report. The forecast
      // blends every input by that report's confidence, so this widens when a
      // decision can be informed, not what the commander can know.
      const forecastAvailable = hostile &&
        commander.troops.count >= 25 &&
        !surrenderOffered &&
        !battleVisible &&
        !commandedBattle &&
        (commander.locationId === settlement.id || knowledge !== undefined);
      const forecast = forecastAvailable ? combatForecast(world, commander.id, settlement.id) : null;
      const voyage = travelEstimate(world, commander, settlement.id);
      // Standing in a settlement is direct perception of the ground. Reporting a
      // wall estimate in the forecast's own factor list while the panel showed
      // "fortification unknown" for the same island was a contradiction a
      // playtest caught: the commander could read the ground in one place and not
      // in the other. Perception is present-tense here, because nothing persisted
      // records the ground of a place the commander has left.
      const coLocated = commander.locationId === settlement.id;
      // What the commander can trade, and on what terms, wherever they are
      // standing. Trading needs a market they are physically at, so this is the
      // only place the true stock and price may be quoted — and building it from
      // the same `tradeQuote` the boundary charges means the shown cost is the
      // charged cost.
      const market = coLocated ? projectMarket(world, commander, settlement.id) : null;
      if (!exact) {
        return {
          id: settlement.id,
          name: settlement.name,
          position: settlement.position,
          factionId: knowledge?.factionId ?? null,
          ownerId: null,
          population: coLocated ? settlement.population : null,
          workers: null,
          focus: null,
          production: null,
          // Perception of a market is present-tense for the same reason a
          // garrison is: standing in it is direct observation, and showing an
          // estimate beside a quote taken from the real board is worse than
          // either. Away from it, nothing here is present-tense.
          stocks: coLocated ? { ...settlement.stocks } : knowledge?.stocksEstimate ?? Object.fromEntries(RESOURCE_KEYS.map((resource) => [resource, 0])),
          targetStocks: coLocated ? { ...settlement.targetStocks } : null,
          garrison: coLocated ? settlement.garrison : knowledge?.garrisonEstimate ?? null,
          fortification: coLocated ? settlement.fortification : null,
          stability: coLocated ? settlement.stability : null,
          prices: coLocated ? currentPrices(world, settlement.id) : knowledge?.priceEstimate ?? Object.fromEntries(RESOURCE_KEYS.map((resource) => [resource, 0])),
          market,
          partyCount: null,
          // Present in the owned branch as well, so the settlement object has the
          // same keys either way. Its absence here crashed a playtest client.
          surrender: null,
          battleInProgress: battleVisible,
          surrenderOffered,
          combatForecast: forecast,
          travelTicks: voyage.travelTicks,
          travelDays: voyage.travelDays,
          intelligence: (knowledge || coLocated) ? {
            exact: false,
            /** True when these figures are what the commander can see right now. */
            present: coLocated,
            source: coLocated ? "direct-observation" : knowledge!.source,
            // Read through the same belief function the forecast uses. Decaying
            // the stored confidence independently here is how the panel and the
            // forecast came to show different numbers for one report.
            confidence: coLocated ? 1 : believedGarrison(world, commander, settlement.id).confidence,
            observedTick: coLocated ? world.tick : knowledge!.observedTick,
            ageTicks: coLocated ? 0 : world.tick - knowledge!.observedTick,
          } : null,
        };
      }
      return {
        ...settlement,
        prices: currentPrices(world, settlement.id),
        market,
        partyCount: Object.values(world.characters).filter((character) => character.locationId === settlement.id).length,
        battleInProgress: battleVisible,
        surrenderOffered,
        combatForecast: forecast,
        travelTicks: voyage.travelTicks,
        travelDays: voyage.travelDays,
        intelligence: { exact: true, present: commander.locationId === settlement.id, source: "owned", confidence: 1, observedTick: world.tick, ageTicks: 0 },
      };
    }),
    characters: Object.values(world.characters)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((character) => projectCharacter(world, commander, character)),
    events: projectEventFeed(world, commander.id, feed.events).reverse(),
    eventFeed: {
      count: feed.events.length,
      limit: feed.limit,
      total: feed.total,
      hasMore: feed.hasMore,
      oldestSequence: feed.events[0]?.sequence ?? null,
      newestSequence: feed.events.at(-1)?.sequence ?? null,
      /** Pass as `beforeSequence` to read the next older page. */
      cursor: feed.events[0]?.sequence ?? null,
    },
    conversations: {
      threads: Object.values(world.conversationThreads)
        .filter((thread) => thread.participantIds.includes(commander.id))
        .map((thread) => ({
          ...thread,
          participants: thread.participantIds.map((id) => ({ id, name: world.characters[id]?.name ?? id })),
        })),
      messages: world.conversationMessages.filter((message) =>
        world.conversationThreads[message.threadId]?.participantIds.includes(commander.id)
      ),
      scheduledReplies: world.scheduledReplies.filter((reply) =>
        reply.status === "pending" && world.conversationThreads[reply.threadId]?.participantIds.includes(commander.id)
      ),
    },
  };
}
