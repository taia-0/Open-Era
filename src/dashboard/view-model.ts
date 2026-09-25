import { believedGarrison } from "../sim/agency.ts";
import { combatForecast } from "../sim/combat.ts";
import { commandCapabilities } from "../sim/commands.ts";
import { travelDuration } from "../sim/engine.ts";
import { marketPrice, round, settlementClaimAvailableTo } from "../sim/state.ts";
import { RESOURCE_KEYS, type ActiveBattle, type Character, type SimEvent, type WorldState } from "../sim/types.ts";
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

function checkInBriefing(world: WorldState, commanderId: string, events: SimEvent[]): Record<string, unknown> {
  const commander = world.characters[commanderId];
  const player = Object.values(world.players).find((candidate) => candidate.characterId === commanderId)!;
  const actionItems: Array<Record<string, unknown>> = [];
  const warningItems: Array<Record<string, unknown>> = [];
  const infoItems: Array<Record<string, unknown>> = [];
  const assignedOfficer = player.reportingOfficerId ? world.characters[player.reportingOfficerId] : null;
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

  const staleIntelligence = Object.values(world.settlements)
    .filter((settlement) => settlement.factionId !== commander.factionId)
    .map((settlement) => ({ settlement, knowledge: commander.knowledge[settlement.id] }))
    .filter(({ knowledge }) => knowledge && world.tick - knowledge.observedTick >= world.ticksPerDay * 3)
    .sort((left, right) => left.knowledge.observedTick - right.knowledge.observedTick)
    .slice(0, 2);
  for (const { settlement, knowledge } of staleIntelligence) {
    addItem({
      id: `intel:${settlement.id}:${knowledge.observedTick}`,
      severity: "warning",
      actionRequired: false,
      title: "Intelligence is stale",
      summary: `${settlement.name}'s report is ${world.tick - knowledge.observedTick} ticks old.`,
      day: round(world.tick / world.ticksPerDay, 2),
      settlementId: settlement.id,
      acknowledgeable: true,
    });
  }

  const includedTypes = new Set([
    "player-command-failed",
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
    addItem({
      id: `event:${event.sequence}`,
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

  const items = [...actionItems, ...warningItems, ...infoItems].slice(0, 10);
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
    attentionCount: actionItems.length + warningItems.length,
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
  return {
    tick: world.tick,
    day: round(world.tick / world.ticksPerDay, 2),
    ticksPerDay: world.ticksPerDay,
    player,
    commanderId: commander.id,
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
          stocks: knowledge?.stocksEstimate ?? Object.fromEntries(RESOURCE_KEYS.map((resource) => [resource, 0])),
          targetStocks: null,
          garrison: coLocated ? settlement.garrison : knowledge?.garrisonEstimate ?? null,
          fortification: coLocated ? settlement.fortification : null,
          stability: null,
          prices: knowledge?.priceEstimate ?? Object.fromEntries(RESOURCE_KEYS.map((resource) => [resource, 0])),
          partyCount: null,
          // Present in the owned branch as well, so the settlement object has the
          // same keys either way. Its absence here crashed a playtest client.
          surrender: null,
          battleInProgress: battleVisible,
          surrenderOffered,
          combatForecast: forecast,
          travelTicks: voyage.travelTicks,
          travelDays: voyage.travelDays,
          intelligence: knowledge ? {
            exact: false,
            source: knowledge.source,
            // Read through the same belief function the forecast uses. Decaying
            // the stored confidence independently here is how the panel and the
            // forecast came to show different numbers for one report.
            confidence: believedGarrison(world, commander, settlement.id).confidence,
            observedTick: knowledge.observedTick,
            ageTicks: world.tick - knowledge.observedTick,
          } : null,
        };
      }
      return {
        ...settlement,
        prices: Object.fromEntries(RESOURCE_KEYS.map((resource) => [resource, marketPrice(world, settlement.id, resource)])),
        partyCount: Object.values(world.characters).filter((character) => character.locationId === settlement.id).length,
        battleInProgress: battleVisible,
        surrenderOffered,
        combatForecast: forecast,
        travelTicks: voyage.travelTicks,
        travelDays: voyage.travelDays,
        intelligence: { exact: true, source: "owned", confidence: 1, observedTick: world.tick, ageTicks: 0 },
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
