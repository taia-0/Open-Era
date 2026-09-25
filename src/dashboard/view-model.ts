import { combatForecast } from "../sim/combat.ts";
import { marketPrice, round, settlementClaimAvailableTo } from "../sim/state.ts";
import { RESOURCE_KEYS, type SimEvent, type WorldState } from "../sim/types.ts";
import { projectCharacter, projectEvent, projectFactions } from "./visibility.ts";

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
      action: "claim-settlement",
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

export function dashboardState(world: WorldState, events: SimEvent[]): Record<string, unknown> {
  const player = Object.values(world.players)[0];
  const commander = world.characters[player.characterId];
  const activeBattle = Object.values(world.activeBattles).find((battle) => battle.attackerId === commander.id) ?? null;
  const captivity = commander.captivity;
  return {
    tick: world.tick,
    day: round(world.tick / world.ticksPerDay, 2),
    ticksPerDay: world.ticksPerDay,
    player,
    commanderId: commander.id,
    pendingCommands: world.pendingCommands,
    combat: {
      active: activeBattle ? {
        ...activeBattle,
        settlementName: world.settlements[activeBattle.settlementId].name,
        retreatDestinationName: activeBattle.retreatDestinationId
          ? world.settlements[activeBattle.retreatDestinationId]?.name ?? "Open waters"
          : "Open waters",
        canRetreat: activeBattle.phase > 0 && activeBattle.phase < activeBattle.totalPhases,
      } : null,
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
    briefing: checkInBriefing(world, commander.id, events),
    factions: projectFactions(world, commander),
    settlements: Object.values(world.settlements).map((settlement) => {
      const exact = settlement.factionId === commander.factionId;
      const knowledge = commander.knowledge[settlement.id];
      const settlementBattle = Object.values(world.activeBattles).find((battle) => battle.settlementId === settlement.id) ?? null;
      const surrenderOffered = commander.locationId === settlement.id &&
        settlement.factionId !== null &&
        settlement.factionId !== commander.factionId &&
        settlementClaimAvailableTo(settlement, commander.id);
      const forecastAvailable = commander.locationId === settlement.id &&
        settlement.factionId !== null &&
        settlement.factionId !== commander.factionId &&
        commander.troops.count >= 25 &&
        !surrenderOffered &&
        !settlementBattle &&
        !activeBattle;
      const forecast = forecastAvailable ? combatForecast(world, commander.id, settlement.id) : null;
      if (!exact) {
        return {
          id: settlement.id,
          name: settlement.name,
          position: settlement.position,
          factionId: knowledge?.factionId ?? null,
          ownerId: null,
          population: null,
          workers: null,
          focus: null,
          production: null,
          stocks: knowledge?.stocksEstimate ?? Object.fromEntries(RESOURCE_KEYS.map((resource) => [resource, 0])),
          targetStocks: null,
          garrison: knowledge?.garrisonEstimate ?? null,
          fortification: null,
          stability: null,
          prices: knowledge?.priceEstimate ?? Object.fromEntries(RESOURCE_KEYS.map((resource) => [resource, 0])),
          partyCount: null,
          battleInProgress: Boolean(settlementBattle),
          surrenderOffered,
          combatForecast: forecast,
          intelligence: knowledge ? {
            exact: false,
            source: knowledge.source,
            confidence: round(knowledge.confidence, 2),
            observedTick: knowledge.observedTick,
            ageTicks: world.tick - knowledge.observedTick,
          } : null,
        };
      }
      return {
        ...settlement,
        prices: Object.fromEntries(RESOURCE_KEYS.map((resource) => [resource, marketPrice(world, settlement.id, resource)])),
        partyCount: Object.values(world.characters).filter((character) => character.locationId === settlement.id).length,
        battleInProgress: Boolean(settlementBattle),
        surrenderOffered,
        combatForecast: forecast,
        intelligence: { exact: true, source: "owned", confidence: 1, observedTick: world.tick, ageTicks: 0 },
      };
    }),
    characters: Object.values(world.characters)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((character) => projectCharacter(world, commander, character)),
    events: events
      .slice(-100)
      .map((event) => projectEvent(world, commander, event, eventSummary(world, event)))
      .reverse(),
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
