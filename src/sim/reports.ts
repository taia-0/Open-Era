import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { factionPower, marketPrice, partyPower, round, stateHash } from "./state.ts";
import { RESOURCE_KEYS, type SimEvent, type WorldState } from "./types.ts";

function xml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function mapSvg(world: WorldState): string {
  const width = 1_000;
  const height = 650;
  const scaleX = (value: number) => 70 + value * 8.6;
  const scaleY = (value: number) => 50 + value * 5.5;
  const routes = Object.values(world.characters)
    .filter((character) => character.travel)
    .map((character) => {
      const travel = character.travel!;
      const from = world.settlements[travel.fromId];
      const to = world.settlements[travel.toId];
      const progress = 1 - travel.remainingTicks / travel.totalTicks;
      const x = scaleX(from.position.x + (to.position.x - from.position.x) * progress);
      const y = scaleY(from.position.y + (to.position.y - from.position.y) * progress);
      return `<g><line x1="${scaleX(from.position.x)}" y1="${scaleY(from.position.y)}" x2="${scaleX(to.position.x)}" y2="${scaleY(to.position.y)}" class="route"/><path d="M ${x - 9} ${y + 5} L ${x} ${y - 7} L ${x + 10} ${y + 5} Z" class="ship"/><title>${xml(character.name)} sailing to ${xml(to.name)}</title></g>`;
    })
    .join("\n");

  const islands = Object.values(world.settlements)
    .map((settlement) => {
      const x = scaleX(settlement.position.x);
      const y = scaleY(settlement.position.y);
      const faction = settlement.factionId ? world.factions[settlement.factionId] : null;
      const characters = Object.values(world.characters).filter((character) => character.locationId === settlement.id);
      const stockLine = RESOURCE_KEYS.map((key) => `${key === "shipMaterials" ? "ship" : key.slice(0, 4)} ${Math.round(settlement.stocks[key])}`).join(" · ");
      return `<g>
        <circle cx="${x}" cy="${y}" r="58" fill="${faction?.color ?? "#8b8b72"}" opacity="0.2"/>
        <path d="M ${x - 43} ${y + 10} Q ${x - 30} ${y - 42}, ${x + 5} ${y - 36} Q ${x + 48} ${y - 26}, ${x + 42} ${y + 17} Q ${x + 8} ${y + 44}, ${x - 43} ${y + 10}" class="island"/>
        <text x="${x}" y="${y + 72}" class="island-name">${xml(settlement.name)}</text>
        <text x="${x}" y="${y + 90}" class="detail">${xml(faction?.name ?? "Independent")} · garrison ${settlement.garrison} · stability ${Math.round(settlement.stability)}</text>
        <text x="${x}" y="${y + 106}" class="stock">${xml(stockLine)}</text>
        <text x="${x}" y="${y - 52}" class="characters">${characters.length} parties</text>
      </g>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>
    .sea { fill: #dff2f0; }
    .wave { stroke: #a7d4d2; stroke-width: 2; opacity: .55; fill: none; }
    .route { stroke: #567b87; stroke-width: 2; stroke-dasharray: 7 7; opacity: .45; }
    .ship { fill: #323b4a; }
    .island { fill: #89b96f; stroke: #3d6d53; stroke-width: 3; }
    text { font-family: ui-rounded, system-ui, sans-serif; text-anchor: middle; fill: #263746; }
    .title { font-size: 25px; font-weight: 700; text-anchor: start; }
    .subtitle { font-size: 14px; text-anchor: start; fill: #59707b; }
    .island-name { font-size: 18px; font-weight: 700; }
    .detail { font-size: 12px; }
    .stock { font-size: 10px; fill: #60747a; }
    .characters { font-size: 12px; font-weight: 650; }
  </style>
  <rect width="100%" height="100%" class="sea"/>
  <path d="M30 160 Q160 120 300 160 T580 160 T920 160" class="wave"/>
  <path d="M70 430 Q230 390 400 430 T760 430 T980 430" class="wave"/>
  <text x="32" y="38" class="title">Open Era — Day ${round(world.tick / world.ticksPerDay, 1)}</text>
  <text x="32" y="61" class="subtitle">${xml(world.scenario)} · tick ${world.tick} · state ${stateHash(world).slice(0, 12)}</text>
  ${routes}
  ${islands}
</svg>`;
}

function decisionTraces(world: WorldState, events: SimEvent[]): string {
  return events
    .filter((event) => event.type === "decision-made")
    .map((event) =>
      JSON.stringify({
        sequence: event.sequence,
        tick: event.tick,
        day: round(event.tick / world.ticksPerDay, 2),
        characterId: event.actorId,
        character: event.actorId ? world.characters[event.actorId]?.name : undefined,
        settlementId: event.settlementId,
        ...event.data,
      }),
    )
    .join("\n");
}

function agencyTraces(world: WorldState, events: SimEvent[]): string {
  const included = new Set([
    "plan-reconsidered",
    "knowledge-updated",
    "goal-evolved",
    "relationship-changed",
    "standing-order-issued",
    "standing-order-amended",
    "standing-order-cancelled",
    "standing-order-accepted",
    "standing-order-refused",
    "standing-order-deviated",
    "standing-order-resumed",
    "standing-order-completion-reported",
    "standing-order-completed",
    "standing-order-expired",
    "settlement-claimed",
    "player-action-executed",
    "player-command-failed",
    "briefing-item-acknowledged",
    "reporting-officer-assigned",
  ]);
  return events
    .filter((event) => included.has(event.type))
    .map((event) => JSON.stringify({
      sequence: event.sequence,
      tick: event.tick,
      day: round(event.tick / world.ticksPerDay, 2),
      type: event.type,
      characterId: event.actorId,
      character: event.actorId ? world.characters[event.actorId]?.name : undefined,
      targetId: event.targetId,
      settlementId: event.settlementId,
      ...event.data,
    }))
    .join("\n");
}

function conversationTraces(world: WorldState, events: SimEvent[]): string {
  return events
    .filter((event) => event.type.startsWith("conversation-"))
    .map((event) => JSON.stringify({
      sequence: event.sequence,
      tick: event.tick,
      day: round(event.tick / world.ticksPerDay, 2),
      type: event.type,
      characterId: event.actorId,
      character: event.actorId ? world.characters[event.actorId]?.name : undefined,
      targetId: event.targetId,
      ...event.data,
    }))
    .join("\n");
}

function combatTraces(world: WorldState, events: SimEvent[]): string {
  return events
    .filter((event) =>
      event.type.startsWith("battle-") ||
      event.type.startsWith("captivity-") ||
      event.type === "character-captured" ||
      event.type === "scattered-troops-returned" ||
      event.type === "post-defeat-withdrawal-started" ||
      event.type === "settlement-claimed"
    )
    .map((event) => JSON.stringify({
      sequence: event.sequence,
      tick: event.tick,
      day: round(event.tick / world.ticksPerDay, 2),
      type: event.type,
      characterId: event.actorId,
      character: event.actorId ? world.characters[event.actorId]?.name : undefined,
      targetId: event.targetId,
      settlementId: event.settlementId,
      ...event.data,
    }))
    .join("\n");
}

function metricsCsv(events: SimEvent[]): string {
  const header = "tick,day,faction_id,faction,power,treasury,settlements,provisions,arms,medicine,ship_materials";
  const rows = [header];
  for (const event of events.filter((item) => item.type === "metrics-recorded")) {
    const factions = event.data.factions as Record<string, { name: string; power: number; treasury: number; settlements: number }>;
    const stocks = event.data.totalStocks as Record<string, number>;
    for (const [factionId, faction] of Object.entries(factions)) {
      rows.push([
        event.tick,
        event.data.day,
        factionId,
        JSON.stringify(faction.name),
        faction.power,
        faction.treasury,
        faction.settlements,
        stocks.provisions,
        stocks.arms,
        stocks.medicine,
        stocks.shipMaterials,
      ].join(","));
    }
  }
  return rows.join("\n") + "\n";
}

function eventStory(world: WorldState, event: SimEvent): string | null {
  const actor = event.actorId ? world.characters[event.actorId]?.name ?? event.actorId : "Unknown";
  const settlement = event.settlementId ? world.settlements[event.settlementId]?.name ?? event.settlementId : "unknown waters";
  if (event.type === "battle-resolved") {
    const won = event.data.outcome === "attacker-victory";
    return `- Day ${round(event.tick / world.ticksPerDay, 1)}: **${actor}** ${won ? "defeated" : "was repelled by"} the garrison at **${settlement}**. ${event.data.attackerLosses} attackers and ${event.data.defenderLosses} defenders were lost.`;
  }
  if (event.type === "battle-started") {
    const battle = event.data.battle as { totalPhases: number };
    return `- Day ${round(event.tick / world.ticksPerDay, 1)}: **${actor}** committed to a ${battle.totalPhases}-phase battle at **${settlement}**.`;
  }
  if (event.type === "battle-retreated") {
    const destination = event.data.retreatDestinationId
      ? world.settlements[event.data.retreatDestinationId as string]?.name ?? event.data.retreatDestinationId
      : "open waters";
    return `- Day ${round(event.tick / world.ticksPerDay, 1)}: **${actor}** retreated from **${settlement}** toward **${destination}** during phase ${event.data.phase}, losing ${event.data.pursuitLosses} troops in withdrawal.`;
  }
  if (event.type === "character-captured") {
    return `- Day ${round(event.tick / world.ticksPerDay, 1)}: **${actor}** was captured at **${settlement}** after ${String(event.data.cause).replaceAll("-", " ")}; their surviving troops scattered.`;
  }
  if (event.type === "captivity-escaped") {
    const scar = event.data.scar as { attribute: string; penalty: number } | null;
    return `- Day ${round(event.tick / world.ticksPerDay, 1)}: **${actor}** escaped captivity at **${settlement}**, suffering ${event.data.injury} health damage${scar ? ` and a permanent -${scar.penalty} ${scar.attribute} scar` : ""}.`;
  }
  if (event.type === "captivity-released") {
    const terms = event.data.terms as { moneyPaid: number; debtValue: number };
    return `- Day ${round(event.tick / world.ticksPerDay, 1)}: **${actor}** was released from **${settlement}** under mandatory terms: ${terms.moneyPaid} paid and ${terms.debtValue} recorded as debt.`;
  }
  if (event.type === "scattered-troops-returned") {
    return `- Day ${round(event.tick / world.ticksPerDay, 1)}: ${event.data.returning} scattered troops returned to **${actor}**${event.data.completed ? ", completing the recovery" : ""}.`;
  }
  if (event.type === "settlement-claimed") {
    const previousFaction = event.data.previousFactionId
      ? world.factions[event.data.previousFactionId as string]?.name ?? event.data.previousFactionId
      : "independent rule";
    return `- Day ${round(event.tick / world.ticksPerDay, 1)}: **${actor}** accepted **${settlement}**'s surrender, ending ${previousFaction}'s control and establishing a personal claim.`;
  }
  if (event.type === "arrived") {
    return `- Day ${round(event.tick / world.ticksPerDay, 1)}: ${actor} arrived at **${settlement}**.`;
  }
  if (event.type === "settlement-shortage") {
    return `- Day ${round(event.tick / world.ticksPerDay, 1)}: **${settlement}** suffered a provisions shortage, weakening stability and its garrison.`;
  }
  if (event.type === "market-trade" && event.data.direction === "sold" && Number(event.data.gross) >= 35) {
    return `- Day ${round(event.tick / world.ticksPerDay, 1)}: ${actor} sold ${event.data.quantity} ${event.data.resource} at **${settlement}** for ${event.data.gross}.`;
  }
  if (event.type === "goal-evolved") {
    const goal = event.data.goal as { label: string };
    return `- Day ${round(event.tick / world.ticksPerDay, 1)}: ${actor}'s experience at **${settlement}** created or reshaped the ambition _${goal.label}_.`;
  }
  if (event.type === "relationship-changed") {
    if (!String(event.data.trigger).includes("standing orders")) return null;
    const target = event.targetId ? world.characters[event.targetId]?.name ?? event.targetId : "their superior";
    return `- Day ${round(event.tick / world.ticksPerDay, 1)}: ${event.data.trigger} changed ${actor}'s relationship with **${target}**.`;
  }
  if (event.type === "standing-order-issued") {
    const target = event.targetId ? world.characters[event.targetId]?.name ?? event.targetId : "a subordinate";
    const order = event.data.order as { directive: string };
    return `- Day ${round(event.tick / world.ticksPerDay, 1)}: ${actor} issued **${order.directive.replaceAll("-", " ")}** orders to **${target}**.`;
  }
  if (event.type.startsWith("standing-order-") && typeof event.data.summary === "string") {
    return `- Day ${round(event.tick / world.ticksPerDay, 1)}: ${event.data.summary}`;
  }
  if (event.type === "player-action-executed") {
    return `- Day ${round(event.tick / world.ticksPerDay, 1)}: Human direction committed ${actor} to **${String(event.data.action).replaceAll("-", " ")}**.`;
  }
  return null;
}

function summaryMarkdown(world: WorldState, events: SimEvent[], snapshotCount: number): string {
  const factions = Object.values(world.factions)
    .sort((left, right) => factionPower(world, right.id) - factionPower(world, left.id))
    .map((faction) => `| ${faction.name} | ${factionPower(world, faction.id)} | ${round(faction.treasury, 2)} | ${Object.values(world.settlements).filter((settlement) => settlement.factionId === faction.id).length} |`)
    .join("\n");
  const active = Object.values(world.characters)
    .sort((left, right) => partyPower(right) - partyPower(left))
    .slice(0, 8)
    .map((character) => {
      const goal = character.goals.find((candidate) => candidate.id === character.activeGoalId);
      return `| ${character.name} | ${character.archetype} | ${character.factionId ? world.factions[character.factionId].name : "Unaffiliated"} | ${partyPower(character)} | ${character.victories}–${character.defeats} | ${goal?.label ?? "Uncommitted"} |`;
    })
    .join("\n");
  const majorTypes = new Set([
    "battle-started",
    "battle-retreated",
    "battle-resolved",
    "character-captured",
    "captivity-escaped",
    "captivity-released",
    "scattered-troops-returned",
    "post-defeat-withdrawal-started",
    "settlement-claimed",
    "goal-evolved",
    "relationship-changed",
    "settlement-shortage",
    "standing-order-issued",
    "standing-order-amended",
    "standing-order-cancelled",
    "standing-order-refused",
    "standing-order-deviated",
    "standing-order-resumed",
    "standing-order-completion-reported",
    "standing-order-completed",
    "standing-order-expired",
    "player-action-executed",
  ]);
  const majorStories = events
    .filter((event) => majorTypes.has(event.type))
    .map((event) => eventStory(world, event))
    .filter(Boolean)
    .slice(-35)
    .join("\n");
  const recentStories = events
    .filter((event) => !majorTypes.has(event.type))
    .map((event) => eventStory(world, event))
    .filter(Boolean)
    .slice(-30)
    .join("\n");
  const battles = events.filter((event) => event.type === "battle-resolved").length;
  const retreats = events.filter((event) => event.type === "battle-retreated").length;
  const captures = events.filter((event) => event.type === "character-captured").length;
  const escapes = events.filter((event) => event.type === "captivity-escaped").length;
  const releases = events.filter((event) => event.type === "captivity-released").length;
  const journeys = events.filter((event) => event.type === "travel-started").length;
  const trades = events.filter((event) => event.type === "market-trade").length;
  const planReviews = events.filter((event) => event.type === "plan-reconsidered");
  const orderAssessments = planReviews
    .map((event) => event.data.orderAssessment as { willComply: boolean } | null)
    .filter((assessment): assessment is { willComply: boolean } => Boolean(assessment));
  const acceptedOrders = events.filter((event) => event.type === "standing-order-accepted").length;
  const refusedOrders = events.filter((event) => event.type === "standing-order-refused").length;
  const orderDeviations = events.filter((event) => event.type === "standing-order-deviated").length;
  const orderResumptions = events.filter((event) => event.type === "standing-order-resumed").length;
  const completionReports = events.filter((event) => event.type === "standing-order-completion-reported").length;
  const confirmedOrders = events.filter((event) => event.type === "standing-order-completed").length;
  const amendedOrders = events.filter((event) => event.type === "standing-order-amended").length;
  const cancelledOrders = events.filter((event) => event.type === "standing-order-cancelled").length;
  const briefingAcknowledgements = events.filter((event) => event.type === "briefing-item-acknowledged").length;
  const reportingAssignments = events.filter((event) => event.type === "reporting-officer-assigned").length;
  const observations = events.filter((event) => event.type === "knowledge-updated").length;
  const evolvedGoals = events.filter((event) => event.type === "goal-evolved").length;
  const relationshipChanges = events.filter((event) => event.type === "relationship-changed").length;
  const goalDistribution = Object.entries(
    Object.values(world.characters).reduce<Record<string, number>>((counts, character) => {
      const goal = character.goals.find((candidate) => candidate.id === character.activeGoalId);
      const kind = goal?.kind ?? "uncommitted";
      counts[kind] = (counts[kind] ?? 0) + 1;
      return counts;
    }, {}),
  )
    .sort((left, right) => right[1] - left[1])
    .map(([kind, count]) => `${kind}: ${count}`)
    .join("; ");

  const humanCharacters = Object.values(world.characters).filter((character) => character.controller.kind === "human").length;
  const autonomousCharacters = Object.values(world.characters).length - humanCharacters;
  const acceptedCommands = events.filter((event) => event.type === "player-command-accepted").length;
  const resolvedCommands = events.filter((event) => event.type === "player-command-resolved").length;
  const sentMessages = events.filter((event) => event.type === "conversation-message-sent").length;
  const autonomousReplies = events.filter((event) => event.type === "conversation-reply-created").length;
  const pendingReplies = world.scheduledReplies.filter((reply) => reply.status === "pending").length;

  return `# Open Era simulation report

The **${world.scenario}** scenario reached tick ${world.tick} (day ${round(world.tick / world.ticksPerDay, 1)}). Its deterministic state hash is \`${stateHash(world)}\`.

## Run health

- ${autonomousCharacters} autonomous characters and ${humanCharacters} human-controlled character
- ${events.length} persisted events across ${snapshotCount} snapshots
- ${journeys} journeys, ${trades} market trades, ${battles} completed battles, and ${retreats} successful retreats
- ${captures} captures, ${escapes} dangerous escapes, and ${releases} mandatory releases
- ${Object.keys(world.activeBattles).length} major battles currently active
- ${acceptedCommands} player commands accepted and ${resolvedCommands} resolved
- ${sentMessages} player messages, ${autonomousReplies} autonomous replies, and ${pendingReplies} replies pending

## Agency diagnostics

- ${planReviews.length} explicit plan reviews and ${observations} direct knowledge updates
- ${orderAssessments.length} plan-time order assessments; ${acceptedOrders} orders accepted and ${refusedOrders} refused
- ${orderDeviations} reported order deviations, ${orderResumptions} resumptions, ${completionReports} completion reports, and ${confirmedOrders} issuer confirmations
- ${amendedOrders} order amendments, ${cancelledOrders} cancellations, ${briefingAcknowledgements} briefing acknowledgements, and ${reportingAssignments} reporting-officer assignments
- ${evolvedGoals} goals reshaped by major experiences and ${relationshipChanges} relationship changes
- Active long-term goals — ${goalDistribution}

## Faction balance

| Faction | Power | Treasury | Settlements |
| --- | ---: | ---: | ---: |
${factions}

## Most powerful active parties

| Character | Archetype | Allegiance | Party power | W–L | Active ambition |
| --- | --- | --- | ---: | ---: | --- |
${active}

## Consequential events

${majorStories || "No major public events occurred during this run."}

## Recent activity

${recentStories || "No recent public activity was recorded."}

## Final island markets

${Object.values(world.settlements).map((settlement) => `- **${settlement.name}:** ${RESOURCE_KEYS.map((resource) => `${resource} ${round(settlement.stocks[resource], 1)} @ ${marketPrice(world, settlement.id, resource)}`).join("; ")}.`).join("\n")}
`;
}

export function writeReports(
  outputDirectory: string,
  world: WorldState,
  events: SimEvent[],
  snapshotCount: number,
): void {
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(join(outputDirectory, "decision-traces.jsonl"), decisionTraces(world, events) + "\n");
  writeFileSync(join(outputDirectory, "agency-traces.jsonl"), agencyTraces(world, events) + "\n");
  writeFileSync(join(outputDirectory, "conversation-traces.jsonl"), conversationTraces(world, events) + "\n");
  writeFileSync(join(outputDirectory, "combat-traces.jsonl"), combatTraces(world, events) + "\n");
  writeFileSync(join(outputDirectory, "metrics.csv"), metricsCsv(events));
  writeFileSync(join(outputDirectory, "map.svg"), mapSvg(world));
  writeFileSync(join(outputDirectory, "report.md"), summaryMarkdown(world, events, snapshotCount));
  writeFileSync(join(outputDirectory, "final-state.json"), JSON.stringify(world, null, 2) + "\n");
}
