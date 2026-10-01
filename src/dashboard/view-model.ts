import { believedGarrison } from "../sim/agency.ts";
import { combatForecast } from "../sim/combat.ts";
import { COMMAND_LIMITS, commandCapabilities } from "../sim/commands.ts";
import {
  cargoCapacity,
  cargoLoad,
  PASSAGE_COST_PER_TICK,
  marketDepth,
  passageCost,
  provisionRunway,
  sellableProvisions,
  priceDriftPerTick,
  tradeQuote,
  travelDuration,
  type ProvisionRunway,
} from "../sim/engine.ts";
import { marketPrice, partyPowerFromTroops, round, settlementClaimAvailableTo } from "../sim/state.ts";
import { CHECK_IN_READ_CAP } from "../sim/persistence.ts";
import { RESOURCE_KEYS, type ActiveBattle, type Character, type CombatForecast, type SettlementKnowledge, type SimEvent, type WorldState } from "../sim/types.ts";
import { captiveIntelFor, projectCharacter, projectEvent, projectFactions, projectSupplyContracts, seaSightingsFor } from "./visibility.ts";
import {
  attentionLabel,
  battleResolvedSentence,
  captivityEscapedSentence,
  captivityReleasedSentence,
  causeLabelFor,
  characterCapturedSentence,
  characterName,
  eventBriefingTitle,
  qualifyCollidingNames,
  passageUpkeepSentence,
  publicFeedSentence,
  settlementClaimedSentence,
} from "./wording.ts";

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

function destinationName(world: WorldState, event: SimEvent): string {
  const id = typeof event.data.destinationId === "string" ? event.data.destinationId : event.settlementId;
  if (!id) return "the destination";
  return world.settlements[id]?.name ?? id;
}

/**
 * How far back the check-in looks, in world ticks.
 *
 * Thirty days. `ticksPerDay` is 6, so this is 180 ticks. The opening
 * standing-order warnings on seed 2718 are ticks 0–39. At tick 168 a read of
 * the newest 5,000 events starts at tick 127 and drops all 21 of them, so
 * attention was following event volume. A week (42 ticks) and a captivity
 * term (84 ticks) still start after those warnings. 180 ticks reaches tick 0
 * at that checkpoint.
 */
export const CHECK_IN_TICKS = 180;

/** The store will not return more than this from one check-in read. */
export const CHECK_IN_EVENT_CAP = CHECK_IN_READ_CAP;

/**
 * The check-in window: events in the last {@link CHECK_IN_TICKS} ticks, and
 * at most {@link CHECK_IN_EVENT_CAP} of them, keeping the newest if the cap
 * binds. This is the same bound `WorldStore.eventsSinceTick` enforces.
 */
export function checkInEvents(events: SimEvent[], tick: number): SimEvent[] {
  const minTick = Math.max(0, tick - CHECK_IN_TICKS);
  const inWindow = events.filter((event) => event.tick >= minTick);
  if (inWindow.length <= CHECK_IN_EVENT_CAP) return inWindow;
  return inWindow.slice(-CHECK_IN_EVENT_CAP);
}

function labelOf(world: WorldState, id: string | null | undefined): string | null {
  if (!id) return null;
  if (world.characters[id]) return characterName(world, id, id);
  return world.settlements[id]?.name ?? world.factions[id]?.name ?? id;
}

/**
 * Troops and power the reader can already see on the captor row, or on their
 * own captivity. A rival who only has the withheld capture sentence does not
 * get the numbers. Zero troops and zero power add nothing.
 */
function capturedTroopsClause(world: WorldState, reader: Character | undefined, event: SimEvent): string | null {
  if (!reader || event.type !== "character-captured" || !event.actorId) return null;
  const prisoner = world.characters[event.actorId];
  if (!prisoner) return null;
  const intel = captiveIntelFor(world, reader, prisoner);
  if (intel && (intel.troops > 0 || intel.partyPower > 0)) {
    return `${intel.troops} troops were taken, power ${intel.partyPower}.`;
  }
  if (reader.id !== prisoner.id || !prisoner.captivity) return null;
  const scattered = prisoner.captivity.scatteredTroops;
  const power = partyPowerFromTroops(prisoner, scattered);
  if (scattered.count <= 0 && power <= 0) return null;
  return `${scattered.count} troops were taken, power ${power}.`;
}

function eventSummary(world: WorldState, event: SimEvent, events?: SimEvent[], reader?: Character): string {
  const actor = event.actorId ? characterName(world, event.actorId, event.actorId) : "World";
  const target = labelOf(world, event.targetId);
  const settlement = event.settlementId ? world.settlements[event.settlementId]?.name ?? event.settlementId : null;
  switch (event.type) {
    case "player-command-accepted": {
      const command = event.data.command as { action?: string; quantity?: number; unitPrice?: number; gross?: number; capped?: boolean } | undefined;
      if (command?.action === "buy-provisions" && typeof command.gross === "number") {
        const cap = command.capped
          ? ` (${settlement ?? "This market"} clears no more than ${command.quantity} in one order)`
          : "";
        return `Command queued for ${actor}: ${command.quantity} provisions at ${command.unitPrice} each, ${command.gross} total${cap}`;
      }
      return `Command queued for ${actor}`;
    }
    case "player-command-resolved":
      if (event.data.action === "buy-provisions" && typeof event.data.gross === "number") {
        return `${actor} bought ${event.data.quantity} provisions for ${event.data.gross} (${event.data.unitPrice} each)`;
      }
      return `${actor}: ${String(event.data.outcome).replaceAll("-", " ")}`;
    case "player-command-failed":
      return `${actor}'s command failed: ${event.data.reason}`;
    case "standing-order-issued":
      return qualifyCollidingNames(world, `${actor} issued ${String((event.data.order as { directive: string }).directive).replaceAll("-", " ")} orders to ${target}`);
    case "standing-order-amended":
    case "standing-order-cancelled":
    case "standing-order-accepted":
    case "standing-order-refused":
    case "standing-order-deviated":
    case "standing-order-resumed":
    case "standing-order-completion-reported":
    case "standing-order-completed":
    case "standing-order-expired":
      return qualifyCollidingNames(world, String(event.data.summary));
    case "plan-reconsidered":
      return `${actor} reconsidered their plan: ${event.data.reason}`;
    case "battle-resolved":
      return battleResolvedSentence(world, event, events);
    case "battle-started":
      return `${actor} committed to a major battle at ${settlement}`;
    case "battle-phase-resolved":
      return `${actor} completed phase ${event.data.phase} at ${settlement}`;
    case "battle-retreated":
      return `${actor} retreated from ${settlement} toward ${world.settlements[String(event.data.retreatDestinationId)]?.name ?? "open waters"}`;
    case "post-defeat-withdrawal-started":
      return `${actor} escaped defeat at ${settlement} and withdrew toward ${target ?? "open waters"}`;
    case "character-captured": {
      const captured = characterCapturedSentence(world, event, events);
      const troops = capturedTroopsClause(world, reader, event);
      return troops ? `${captured}. ${troops}` : captured;
    }
    case "captivity-escaped":
      return captivityEscapedSentence(world, event);
    case "captivity-released":
      return captivityReleasedSentence(world, event, reader);
    case "character-upkeep": {
      const passage = passageUpkeepSentence(world, event);
      if (passage) return passage;
      return publicFeedSentence(world, event);
    }
    case "scattered-troops-returned":
      return `${event.data.returning} scattered troops returned to ${actor}`;
    case "settlement-claimed":
      return settlementClaimedSentence(world, event, events);
    case "arrived":
      return `${actor} arrived at ${settlement}`;
    case "travel-started":
      return `${actor} departed for ${target}`;
    case "market-trade": {
      const tax = typeof event.data.tax === "number" && event.data.tax > 0 ? ` Tax of ${event.data.tax} went to the treasury.` : "";
      if (event.data.direction === "bought" && typeof event.data.gross === "number") {
        return `${actor} bought ${event.data.quantity} ${event.data.resource} at ${settlement} for ${event.data.gross} (${event.data.unitPrice} each).${tax}`;
      }
      return `${actor} ${event.data.direction} ${event.data.quantity} ${event.data.resource} at ${settlement}.${tax}`;
    }
    case "worked": {
      const place = settlement ? ` at ${settlement}` : "";
      const tax = typeof event.data.tax === "number" && event.data.tax > 0 ? ` Tax of ${event.data.tax} went to the treasury.` : "";
      return `${actor} worked${place}.${tax}`;
    }
    case "contract-offered":
      return `${actor} offered ${event.data.price} to land ${event.data.quantity} provisions at ${destinationName(world, event)}.`;
    case "contract-amended":
      return `${actor} revised the provisions contract to ${event.data.price} for ${event.data.quantity} at ${destinationName(world, event)}.`;
    case "contract-accepted":
      return `${actor} accepted the provisions contract.`;
    case "contract-refused": {
      const reason = typeof event.data.reason === "string" ? ` ${event.data.reason}` : "";
      return `${actor} refused the provisions contract.${reason}`;
    }
    case "contract-fulfilled":
      return `${actor} landed ${event.data.quantity} provisions at ${destinationName(world, event)}.`;
    case "contract-breached":
      return `${actor} missed the provisions deadline. The escrow returned.`;
    case "contract-cancelled":
      return `${actor} cancelled the provisions contract.`;
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
    case "knowledge-updated":
      if (event.data.reason === "explore-report" && event.data.alreadyPresent === true) {
        return `${actor} received a survey of ${settlement} from an officer already there`;
      }
      return publicFeedSentence(world, event);
    default:
      return publicFeedSentence(world, event);
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
 * The port the commander is standing in, when its shelf has nothing to sell.
 * Null at sea, and null when that shelf still has a provision. Standing there
 * is what makes the live stock readable.
 */
function emptyBerthName(world: WorldState, commander: Character): string | null {
  if (commander.travel || !commander.locationId) return null;
  const here = world.settlements[commander.locationId];
  if (!here || here.stocks.provisions >= 1) return null;
  return here.name;
}

/**
 * Where food is, in words that match the resupply block.
 *
 * A market with stock is not "a market that does not sell". A null voyage means
 * the commander cannot sail there (held, or already at sea toward somewhere else).
 * An empty berth is named even when the nearest stock is another port.
 */
function provisionSourceHint(
  world: WorldState,
  commander: Character,
  resupply: ProvisionPlan | null,
  runway: ProvisionRunway,
): string {
  const berth = emptyBerthName(world, commander);
  const here = berth ? `${berth} has no provisions to sell. ` : "";
  if (!resupply) {
    return here ? `${here}No settlement you know of has provisions to sell.` : "No settlement you know of has provisions to sell.";
  }
  if (resupply.aboard) return `${resupply.name} is alongside and sells provisions.`;
  if (resupply.travelTicks === null) {
    const why = commander.captivity ? "while you are held" : "from this voyage";
    return `${here}${resupply.name} sells provisions, and you cannot reach it ${why}.`;
  }
  const reach = resupply.reachable
    ? "within reach, but there will be nothing to spare"
    : `out of reach, which is short by ${resupply.travelTicks - runway.runwayTicks} ticks`;
  return `${here}${resupply.name} is ${resupply.travelTicks} ticks${resupply.exact ? "" : " by report"} away — ${reach}.`;
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
      title: `Battle phase ${activeBattle.phase} is complete.`,
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
      title: "A captain is held captive.",
      summary: `Held at ${world.settlements[commander.captivity.settlementId]?.name ?? commander.captivity.settlementId}. Escape always works, and it wounds you. The capture risk was ${commander.captivity.displayedRisk}. Mandatory release is in ${round(daysRemaining, 1)} days.`,
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
        title: "A completion report needs confirmation.",
        summary: qualifyCollidingNames(
          world,
          order.lastReport?.summary ?? `${characterName(world, character.id, character.name)} reports an order complete.`,
        ),
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
      title: "A surrender is waiting for a decision.",
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
  const sourceHint = provisionSourceHint(world, commander, resupply, runway);
  if (runway.shortage > 0) {
    // At 0 the subtraction does not move the stored morale, so the line does not quote a cost that cannot land.
    const moraleCost = commander.morale <= 0
      ? `health ${runway.shortageHealthPerTick} per tick. Morale is already 0, so the shortage does not lower it`
      : `health ${runway.shortageHealthPerTick} and morale ${runway.shortageMoralePerTick} per tick`;
    const cost = [
      moraleCost,
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
      const gap = round(Math.max(0, runway.resupplyTarget - runway.provisions), 3);
      let target = runway.resupplyTarget > runway.provisions
        ? ` A full top-up would buy ${runway.resupplyTarget}, about ${Math.floor(runway.resupplyTarget / runway.demand)} ticks.`
        : " The hold is already at the amount a top-up would buy.";
      // Alongside, one click cannot buy a gap past the depth. Name that order
      // instead of the resupply target, which is the hold the click is aiming at.
      if (resupply?.aboard && commander.locationId) {
        const here = world.settlements[commander.locationId];
        const depth = marketDepth(here, "provisions");
        const stock = here.stocks.provisions;
        if (stock >= 1 && round(Math.min(gap, stock), 3) > depth) {
          const oneOrder = round(Math.min(gap, stock, depth), 3);
          target = ` One order buys ${oneOrder} provisions; ${here.name} clears no more than ${depth} in one order.`;
        }
      }
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

  // A port belief on a prisoner, and the prison a released captain remembers,
  // are settlement reports. The person fields on the captor row are not, and
  // they do not fire this warning. Age is counted from the raw tick.
  const release = commander.releaseSighting;
  if (release) {
    const age = Math.max(0, world.tick - release.observedTick);
    if (age >= world.ticksPerDay * 3) {
      const name = world.settlements[release.settlementId]?.name ?? release.settlementId;
      addItem({
        id: `intel:release:${release.settlementId}:${release.observedTick}`,
        severity: "warning",
        actionRequired: false,
        title: "Intelligence is stale",
        summary: `${name}'s release report is ${age} ticks old.`,
        day: round(world.tick / world.ticksPerDay, 2),
        settlementId: release.settlementId,
        acknowledgeable: true,
      });
    }
  }
  for (const prisoner of Object.values(world.characters).sort((left, right) => left.id.localeCompare(right.id))) {
    const row = captiveIntelFor(world, commander, prisoner);
    if (!row) continue;
    for (const port of row.ports) {
      if (!port.stale) continue;
      const name = world.settlements[port.settlementId]?.name ?? port.settlementId;
      addItem({
        id: `intel:captive:${prisoner.id}:${port.settlementId}:${port.observedTick}`,
        severity: "warning",
        actionRequired: false,
        title: "Intelligence is stale",
        summary: `${prisoner.name}'s report of ${name} is ${port.ageTicks} ticks old.`,
        day: round(world.tick / world.ticksPerDay, 2),
        settlementId: port.settlementId,
        acknowledgeable: true,
      });
    }
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
      title: eventBriefingTitle(event.type),
      summary: eventSummary(world, event, events, commander),
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
      counts["standing-order-completed"] ? `${counts["standing-order-completed"]} completed` : null,
    ].filter(Boolean).join(", ");
    const updateWord = routineEvents.length === 1 ? "update" : "updates";
    addItem({
      id: `routine:${reportingOfficer.id}:${throughSequence}`,
      severity: "info",
      actionRequired: false,
      title: `${characterName(world, reportingOfficer.id, reportingOfficer.name)} sent a routine digest.`,
      summary: `${routineEvents.length} routine order ${updateWord}: ${details}. No command decision is required.`,
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
    const recent = String(newest.summary).replace(/\.$/, "");
    addItem({
      ...newest,
      id: `event-group:${key}:${newest.sequence}`,
      title: `${String(newest.title).replace(/\.$/, "")}, ${bucket.length} times.`,
      summary: `${bucket.length} such reports, the most recent being: ${recent}. The first was on day ${oldest.day}.`,
      count: bucket.length,
      throughSequence: newest.sequence,
    });
  }

  // The budget applies to background information only. An action-required item is
  // a decision the player cannot make if they cannot see it, so nothing that
  // needs attention is ever dropped; the count reports what was shown, and any
  // omitted background is stated rather than silently lost.
  const attention = [...actionItems, ...warningItems];
  const seaSightings = seaSightingsFor(world, commander);
  if (seaSightings) {
    const seaItems = Object.values(seaSightings)
      .sort((left, right) => left.characterId < right.characterId ? -1 : left.characterId > right.characterId ? 1 : 0)
      .map((row) => ({
        id: `sea:${row.characterId}:${world.tick}`,
        severity: "info",
        actionRequired: false,
        title: "A ship was sighted at sea.",
        summary: row.summary,
        day: round(world.tick / world.ticksPerDay, 2),
        characterId: row.characterId,
        acknowledgeable: true,
      }));
    infoItems.unshift(...seaItems);
  }
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
    .map((character) => ({
      id: character.id,
      name: characterName(world, character.id, character.name),
      leadership: character.skills.leadership,
    }));

  return {
    /**
     * Items needing a decision. Always equal to the number of action and warning
     * items returned, because every one of them is returned.
     */
    attentionCount: attention.length,
    /** Lines drawn: the decisions, plus the background rows that fit. */
    shownCount: items.length,
    /** The check-in title. The decision count stays `attentionCount`. */
    attentionLabel: attentionLabel(attention.length, items.length),
    /** Background reports held back to keep the panel readable. */
    omittedInfoCount,
    reportingOfficer: reportingOfficer ? {
      id: reportingOfficer.id,
      name: characterName(world, reportingOfficer.id, reportingOfficer.name),
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
  /**
   * Sibling events used for a reason line, such as a surrender taken on the
   * next tick. The check-in window is wider than one feed page. When omitted,
   * the page itself is the sibling set.
   */
  context?: SimEvent[],
): Record<string, unknown>[] {
  const commander = world.characters[commanderId];
  const siblings = context ?? events;
  return events.map((event) => projectEvent(world, commander, event, eventSummary(world, event, siblings, commander)));
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
): {
  travelTicks: number | null;
  travelDays: number | null;
  /** Money the quoted voyage will charge. Null when no voyage can start. */
  passageCost: number | null;
  /** The per-tick rate, which is public even when the commander cannot sail. */
  passageCostPerTick: number;
} {
  const rate = PASSAGE_COST_PER_TICK;
  const canSail = commander.locationId !== null &&
    commander.locationId !== settlementId &&
    commander.travel === null &&
    commander.captivity === null;
  if (!canSail) return { travelTicks: null, travelDays: null, passageCost: null, passageCostPerTick: rate };
  const ticks = travelDuration(world, commander, settlementId);
  return {
    travelTicks: ticks,
    travelDays: round(ticks / world.ticksPerDay, 2),
    passageCost: passageCost(ticks),
    passageCostPerTick: rate,
  };
}

function settlementTaxRate(world: WorldState, factionId: string | null): number {
  return factionId ? world.factions[factionId].taxRate : 0;
}

/**
 * How fresh a price figure is.
 *
 * A live board is recomputed from stock every tick, so a number read now is
 * good for this tick and expires on the next one. An estimate is a report:
 * it has an age on `intelligence` and no expiry, because it was never a quote.
 * `live` is false and `expiresTick` is null in that case — unknown freshness
 * is not a one-tick promise.
 */
/**
 * Per-good change a live board would make in one quiet tick.
 *
 * Published beside `prices`, not inside them. A remote estimate has no slope
 * worth stating, and that absence is null rather than a drift of zero.
 */
function projectPriceDrift(
  world: WorldState,
  live: boolean,
  settlementId: string,
): Record<string, number> | null {
  if (!live) return null;
  return Object.fromEntries(
    RESOURCE_KEYS.map((resource) => [resource, priceDriftPerTick(world, settlementId, resource)]),
  );
}

/**
 * Age of a stored report, counted from the tick the player is shown.
 *
 * Seeded hearsay can carry a negative `observedTick`. That backdate stays in
 * the simulation, and `combatForecast` still ages its band from the raw tick.
 * The player is not shown a tick that never happened. The age beside the
 * floored tick is the world tick minus that tick, so a rumor cannot read as
 * older than the world.
 */
function reportedAge(world: WorldState, observedTick: number): { observedTick: number; ageTicks: number } {
  const shownTick = Math.max(0, observedTick);
  return {
    observedTick: shownTick,
    ageTicks: Math.max(0, world.tick - shownTick),
  };
}

/**
 * Where a remote garrison figure was seen.
 *
 * Own-faction ports and the island underfoot are present numbers. Away, the
 * figure is the stored estimate, and it keeps the report's tick and age so a
 * frozen garrison cannot be read as the island's current strength.
 */
function projectGarrisonIntelligence(
  world: WorldState,
  exact: boolean,
  coLocated: boolean,
  knowledge: SettlementKnowledge | undefined,
): { source: string; observedTick: number; ageTicks: number } | null {
  if (exact) return { source: "owned", observedTick: world.tick, ageTicks: 0 };
  if (coLocated) return { source: "direct-observation", observedTick: world.tick, ageTicks: 0 };
  if (!knowledge) return null;
  return { source: knowledge.source, ...reportedAge(world, knowledge.observedTick) };
}

/**
 * One fortification figure while the commander is standing on the island.
 *
 * The forecast scales the wall by strategy (`1 + (wall − 1) × (0.35 + skill × 0.65)`).
 * Printing that product beside the true wall made 1.16 and 1.13× look like two
 * measurements. The panel keeps the true wall. This factor names that same
 * wall and says the defender band is skill-scaled. The world state's stored
 * forecast is left alone. The player projection rewrites it only while the
 * commander is on that island, including an active battle they are fighting,
 * so a remote forecast cannot be handed the live wall.
 */
function presentFortification(forecast: CombatForecast, fortification: number): CombatForecast {
  const label = `defensive ground is ${round(fortification, 2).toFixed(2)}×, skill-scaled`;
  let changed = false;
  const revealedFactors = forecast.revealedFactors.map((factor) => {
    if (!factor.startsWith("defensive ground estimated near ")) return factor;
    changed = true;
    return label;
  });
  return changed ? { ...forecast, revealedFactors } : forecast;
}

function projectPriceQuote(
  world: WorldState,
  live: boolean,
  knowledge: SettlementKnowledge | undefined,
): { asOfTick: number; expiresTick: number | null; live: boolean } | null {
  if (live) return { asOfTick: world.tick, expiresTick: world.tick + 1, live: true };
  if (!knowledge) return null;
  return { asOfTick: Math.max(0, knowledge.observedTick), expiresTick: null, live: false };
}

/**
 * Where a population and a wall figure came from.
 *
 * Own-faction ports are the faction's record. Standing there is present truth.
 * Away, only a survey or an officer's report supplies one, and it keeps the
 * age of that record. No record is null, not a zero.
 */
function projectGroundIntelligence(
  world: WorldState,
  exact: boolean,
  coLocated: boolean,
  knowledge: SettlementKnowledge | undefined,
): { source: string; observedTick: number; ageTicks: number } | null {
  if (exact) return { source: "owned", observedTick: world.tick, ageTicks: 0 };
  if (coLocated) return { source: "direct-observation", observedTick: world.tick, ageTicks: 0 };
  const ground = knowledge?.ground;
  if (!ground) return null;
  const observedTick = Math.max(0, ground.observedTick);
  return {
    source: ground.source,
    observedTick,
    ageTicks: Math.max(0, world.tick - observedTick),
  };
}

function projectCommandedBattle(world: WorldState, battle: ActiveBattle): Record<string, unknown> {
  const fortification = world.settlements[battle.settlementId].fortification;
  return {
    ...battle,
    startingForecast: presentFortification(battle.startingForecast, fortification),
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
 * Everything here belongs to the *market*: its tax, and its board of prices,
 * stock and per-resource ceilings. The commander's own purse and hold are not
 * here, because a field named `market.money` reads as the market's cash and
 * invites a player to believe in a counterparty credit limit that does not
 * exist. Those figures live on the commander's own `party.hold`.
 *
 * Every figure comes from `tradeQuote`, the same function the command boundary
 * charges against, so the panel cannot quote a trade the boundary would price
 * differently. Nothing here is offered for a market the commander is not at,
 * because trading requires being there and a remote quote would be an estimate
 * presented as a price.
 */
function projectMarket(world: WorldState, commander: Character, settlementId: string): Record<string, unknown> {
  const settlement = world.settlements[settlementId];
  const taxRate = settlement.factionId ? world.factions[settlement.factionId].taxRate : 0;
  return {
    settlementId,
    /** Fraction of a sale the local faction takes. Zero with no faction. */
    taxRate,
    /** Which side of the board pays `taxRate`. A purchase is not taxed. */
    taxAppliesTo: "sell" as const,
    /**
     * The board was read this tick. Production and trade recompute every price
     * on the next tick, so the figure expires then — `exact` knowledge of the
     * island is not a promise that the price will still be there on arrival.
     */
    quotedTick: world.tick,
    expiresTick: world.tick + 1,
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
        /**
         * Largest whole-unit buy the market, the depth, the hold and the purse
         * allow. Orders are whole units, so a depth of 14.4 is an order of 14.
         */
        maxBuy: Math.floor(buy.maxQuantity),
        /** Largest whole-unit sale the hold, the reserve and the depth allow. */
        maxSell: Math.floor(sell.maxQuantity),
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
    player: {
      ...player,
      // Derived on read. The stored string stays "Prototype Commander".
      displayName: commander.name,
    },
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
      /**
       * The commander's own purse and hold. These are the figures a trade board
       * spends from and fills, so they live with the party rather than inside a
       * `market` block, where `money` and `load` read as the settlement's.
       */
      hold: {
        /** Units the hold can carry in total, across every resource. */
        capacity: cargoCapacity(commander),
        /** Units it is carrying now. */
        load: round(cargoLoad(commander), 3),
        /** Units it could still take. */
        free: round(Math.max(0, cargoCapacity(commander) - cargoLoad(commander)), 3),
        money: commander.money,
        /** Provisions held back from sale, so a voyage cannot strand its own crew. */
        provisionsReserve: round(commander.cargo.provisions - sellableProvisions(commander), 3),
        /**
         * What is actually in the hold, by good. The totals above do not say
         * which good a sale would move, and a trader who reads only this block
         * otherwise has to find the same figures on the character.
         */
        cargo: {
          provisions: round(commander.cargo.provisions, 3),
          arms: round(commander.cargo.arms, 3),
          medicine: round(commander.cargo.medicine, 3),
          shipMaterials: round(commander.cargo.shipMaterials, 3),
        },
      },
      /** Money charged per tick while the party is underway. Provisions are separate and burn either way. */
      passageCostPerTick: PASSAGE_COST_PER_TICK,
      /** What the current voyage will still charge, or null while at anchor. */
      passageCostRemaining: commander.travel ? passageCost(commander.travel.remainingTicks) : null,
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
        attackerName: characterName(world, battle.attackerId, battle.attackerId),
        phase: battle.phase,
        totalPhases: battle.totalPhases,
      })),
      /** Compatibility alias for `commandedBattle`. Prefer the explicit name. */
      active: commandedBattle ? projectCommandedBattle(world, commandedBattle) : null,
    },
    captivity: {
      active: captivity ? {
        ...captivity,
        causeLabel: causeLabelFor(captivity.cause),
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
      const coLocated = commander.locationId === settlement.id;
      const surrenderOffered = coLocated &&
        settlement.factionId !== null &&
        settlement.factionId !== commander.factionId &&
        settlementClaimAvailableTo(settlement, commander.id);
      // Remote hostility follows the report the panel already shows. Testing the
      // true faction here let a port that changed hands announce it by gaining
      // or losing a forecast while `factionId` still named the old owner.
      // Standing there, and a port the commander's faction holds, are present
      // records, so they use the faction that is actually there.
      const knownFactionId = exact || coLocated ? settlement.factionId : knowledge?.factionId ?? null;
      const hostile = knownFactionId !== null && knownFactionId !== commander.factionId;
      // A forecast no longer requires standing on the island. It requires some
      // earned basis for one: either direct observation or a report. The forecast
      // blends every input by that report's confidence, so this widens when a
      // decision can be informed, not what the commander can know.
      const forecastAvailable = hostile &&
        commander.troops.count >= 25 &&
        !surrenderOffered &&
        !battleVisible &&
        !commandedBattle &&
        (coLocated || knowledge !== undefined);
      const rawForecast = forecastAvailable ? combatForecast(world, commander.id, settlement.id) : null;
      const forecast = rawForecast && coLocated ? presentFortification(rawForecast, settlement.fortification) : rawForecast;
      const voyage = travelEstimate(world, commander, settlement.id);
      // Standing in a settlement is direct perception of the ground, and it does
      // not last. A survey, or an officer's delivered report, is what remains
      // after the commander leaves; without one the panel says unknown.
      const recordedGround = coLocated ? undefined : knowledge?.ground;
      const groundIntelligence = projectGroundIntelligence(world, exact, coLocated, knowledge);
      const garrisonIntelligence = projectGarrisonIntelligence(world, exact, coLocated, knowledge);
      const reported = knowledge ? reportedAge(world, knowledge.observedTick) : null;
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
          // Offshore, the faction on the viewer's report. A claim they have not
          // been told about does not change the label; substituting the live
          // holder would announce that change while the stored garrison stayed
          // put. Standing on the island, the faction that is actually there,
          // the same split the garrison already uses.
          factionId: knownFactionId,
          // Standing on a foreign island, the person who holds it is visible.
          // Offshore, a personal owner is not part of the report.
          ownerId: coLocated ? settlement.ownerId : null,
          population: coLocated ? settlement.population : recordedGround?.population ?? null,
          workers: null,
          focus: null,
          production: null,
          // Perception of a market is present-tense for the same reason a
          // garrison is: standing in it is direct observation, and showing an
          // estimate beside a quote taken from the real board is worse than
          // either. Away from it, nothing here is present-tense.
          stocks: coLocated ? { ...settlement.stocks } : knowledge?.stocksEstimate ?? null,
          targetStocks: coLocated ? { ...settlement.targetStocks } : null,
          garrison: coLocated ? settlement.garrison : knowledge?.garrisonEstimate ?? null,
          fortification: coLocated ? settlement.fortification : recordedGround?.fortification ?? null,
          stability: coLocated ? settlement.stability : null,
          prices: coLocated ? currentPrices(world, settlement.id) : knowledge?.priceEstimate ?? null,
          /**
           * The rate of the faction the viewer last recorded as the holder.
           * Standing on the island, that is the faction actually collecting it.
           * With no report at all the live rate is still published: a missing
           * entry must not hide the tax the way it hides a price. The rate is
           * not copied onto the knowledge record. Faction rates do not change,
           * and writing a new field through observation would move the hashes.
           */
          taxRate: settlementTaxRate(
            world,
            coLocated || !knowledge ? settlement.factionId : knowledge.factionId,
          ),
          priceQuote: projectPriceQuote(world, coLocated, knowledge),
          priceDrift: projectPriceDrift(world, coLocated, settlement.id),
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
          passageCost: voyage.passageCost,
          passageCostPerTick: voyage.passageCostPerTick,
          groundIntelligence,
          garrisonIntelligence,
          intelligence: (knowledge || coLocated) ? {
            exact: false,
            /** True when these figures are what the commander can see right now. */
            present: coLocated,
            source: coLocated ? "direct-observation" : knowledge!.source,
            // Read through the same belief function the forecast uses. Decaying
            // the stored confidence independently here is how the panel and the
            // forecast came to show different numbers for one report.
            confidence: coLocated ? 1 : believedGarrison(world, commander, settlement.id).confidence,
            observedTick: coLocated ? world.tick : reported!.observedTick,
            ageTicks: coLocated ? 0 : reported!.ageTicks,
          } : null,
        };
      }
      return {
        ...settlement,
        prices: currentPrices(world, settlement.id),
        taxRate: settlementTaxRate(world, settlement.factionId),
        // Owned records stay the live board, even from another of the faction's
        // ports. They expire next tick. `priceDrift` is how far that live
        // number moves on its own, so a voyage can see the slope instead of
        // treating one tick of truth as a fare.
        priceQuote: projectPriceQuote(world, true, knowledge),
        priceDrift: projectPriceDrift(world, true, settlement.id),
        market,
        partyCount: Object.values(world.characters).filter((character) => character.locationId === settlement.id).length,
        battleInProgress: battleVisible,
        surrenderOffered,
        combatForecast: forecast,
        travelTicks: voyage.travelTicks,
        travelDays: voyage.travelDays,
        passageCost: voyage.passageCost,
        passageCostPerTick: voyage.passageCostPerTick,
        groundIntelligence,
        garrisonIntelligence,
        intelligence: { exact: true, present: commander.locationId === settlement.id, source: "owned", confidence: 1, observedTick: world.tick, ageTicks: 0 },
      };
    }),
    characters: Object.values(world.characters)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((character) => projectCharacter(world, commander, character, briefingEvents)),
    contracts: projectSupplyContracts(world, commander),
    events: projectEventFeed(world, commander.id, feed.events, briefingEvents).reverse(),
    /**
     * How to page `events`. This is a page descriptor, not the feed itself: the
     * events are under `events` above. It was called `eventFeed`, which read as
     * though it contained them, and a playtest paged it for new events and got
     * an empty result.
     */
    eventPage: {
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
