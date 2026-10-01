import { DeterministicRng } from "./rng.ts";
import {
  autonomousShouldRetreat,
  battleRisk,
  captureChanceForRisk,
  combatForecast,
  isMajorBattle,
  projectedBattleRisk,
  selectRetreatDestination,
  settlementDefensePower,
} from "./combat.ts";
import {
  activeStandingOrder,
  openStandingOrder,
  assessOrderAction,
  believedGarrison,
  believedPrice,
  directObservation,
  goalProgressForAction,
  judgeOrderCompletion,
  needsObservation,
  planActionBoost,
  reviewPlan,
} from "./agency.ts";
import { assessSupplyContract, contractRelationship } from "./contracts.ts";
import { resolvePassageCharge, resolveQuotedSpend, spendableAmount, spendData, type SpendSource } from "./allowance.ts";
import {
  applyEvent,
  captorPartyLeader,
  CLAIM_STABILITY_FLOOR,
  clamp,
  distanceBetween,
  factionPower,
  marketPrice,
  resourcePrice,
  partyPower,
  retainGround,
  round,
  splitRansom,
  settlementClaimAvailableTo,
  surrenderStabilityLimit,
  SURRENDER_GARRISON_THRESHOLD,
} from "./state.ts";
import {
  RESOURCE_KEYS,
  type ActiveBattle,
  type BattlePhaseReport,
  type CaptivityState,
  type Character,
  type CharacterAttributes,
  type CharacterGoal,
  type CharacterScar,
  type CombatRisk,
  type DebtObligation,
  type DecisionCandidate,
  type EventDraft,
  type PartySighting,
  type PlayerCommand,
  type ResourceKey,
  type Resources,
  type SettlementKnowledge,
  type SimEvent,
  type StandingOrder,
  type SupplyContract,
  type TickResult,
  type TravelState,
  type TroopRecoveryState,
  type WorldState,
} from "./types.ts";

const CAPTIVITY_MAX_DAYS = 14;

/**
 * Fraction of a market's normal holding that one order may clear.
 *
 * The autonomous buyer already refused to take more than this share of a
 * board. Player orders did not, so emptying a market at the pre-trade price
 * was the dominant trade. Both paths now use `marketDepth`.
 */
export const MARKET_DEPTH_FRACTION = 0.16;

/**
 * Money a party spends per tick underway, on top of the provisions it eats
 * whether it sails or stands. Flat on purpose: the question is "is this trip
 * worth it", and a rate that depends on crew size would hide that question
 * inside a second formula.
 */
export const PASSAGE_COST_PER_TICK = 3;

/** Money a voyage of `ticks` charges if the purse can cover it. */
export function passageCost(ticks: number): number {
  return round(Math.max(0, ticks) * PASSAGE_COST_PER_TICK, 2);
}

/**
 * Whether the quoted passage to `destinationId` can be covered before leaving.
 *
 * The quote is `passageCost(travelDuration)` and nothing else. The money is
 * spent at sea, not paid to the destination, so a destination tax is not part
 * of it. Player commands and autonomous planning both ask this function, so
 * the two cannot drift. A faction member covers it from today's allowance and
 * then the purse. The free command holder covers it from the treasury. The
 * refusal text is still the short-purse line. A voyage already underway is not
 * re-quoted here; each sea tick still charges what can be paid, down to zero,
 * and is not turned around.
 */
export function quotedPassage(
  world: WorldState,
  character: Character,
  destinationId: string,
  source: SpendSource = "default",
): { ticks: number; cost: number; affordable: boolean } {
  const ticks = travelDuration(world, character, destinationId);
  const cost = passageCost(ticks);
  return { ticks, cost, affordable: resolveQuotedSpend(world, character, cost, PASSAGE_COST_PER_TICK, source).ok };
}

/**
 * Units one order may move before the board is asked to clear more than a
 * tick of trade should.
 *
 * The cap is a fraction of the settlement's *target* holding, not of the
 * stock on the shelf. A shortage is why a merchant sailed, and sizing the
 * cap off the empty shelf would make the dearest market the one that buys
 * the least. A purchase is still also capped by the stock that is actually
 * there, in `tradeQuote`.
 */
export function marketDepth(
  settlement: { targetStocks: Resources },
  resource: ResourceKey,
): number {
  return round(settlement.targetStocks[resource] * MARKET_DEPTH_FRACTION, 3);
}

/**
 * Non-provision goods a settlement uses in one tick.
 *
 * An island uses little of the good it focuses on and more of the others, so
 * a focus stays an export and a neighbour's focus stays an import. Provisions
 * are omitted: they already have a population demand, and a second one would
 * double-count the ration.
 */
export function localResourceUse(
  settlement: { population: number; focus: ResourceKey },
  resource: ResourceKey,
): number {
  if (resource === "provisions") return 0;
  const perCapita = settlement.population / 2_800;
  const focusFactor = settlement.focus === resource ? 0.2 : 1.4;
  return round(perCapita * focusFactor, 3);
}

/** Gross pay for one tick of `work`, before the local sales-and-work tax. */
export function workGross(character: Character): number {
  return round(10 + character.skills.leadership * 0.08 + character.skills.trade * 0.07, 2);
}

function cloneResources(resources: Resources): Resources {
  return { ...resources };
}

function emit(world: WorldState, events: SimEvent[], draft: EventDraft): SimEvent {
  const event: SimEvent = {
    sequence: world.nextEventSequence,
    tick: world.tick,
    ...draft,
  };
  applyEvent(world, event);
  events.push(event);
  return event;
}

/**
 * Stocks after one tick of production, before the island eats.
 *
 * Shared with the published price drift, so the number on the board is the
 * change this same step would make if nobody traded.
 *
 * Provisions output is `max(penalized, min(unpenalized, demand))`. Unpenalized
 * is `production.provisions * focusMultiplier`. Penalized is that times
 * `workerCondition`. Demand is `round(population / 3600, 3)`, the same ration
 * `consumedStocks` eats. The stability penalty cannot cut a field that can
 * cover the ration, and a field that cannot cover it is not topped up.
 */
export function producedStocks(settlement: {
  focus: ResourceKey;
  stability: number;
  population: number;
  production: Resources;
  stocks: Resources;
}): Resources {
  const stocks = cloneResources(settlement.stocks);
  const workerCondition = 0.7 + (settlement.stability / 100) * 0.3;
  const provisionDemand = round(settlement.population / 3_600, 3);
  for (const resource of RESOURCE_KEYS) {
    const focusMultiplier = settlement.focus === resource ? 1.25 : 1;
    const unpenalized = settlement.production[resource] * focusMultiplier;
    const penalized = unpenalized * workerCondition;
    const output = resource === "provisions"
      ? Math.max(penalized, Math.min(unpenalized, provisionDemand))
      : penalized;
    stocks[resource] = round(stocks[resource] + output);
  }
  return stocks;
}

/**
 * Stocks after one tick of local use, starting from `stocks`.
 *
 * Provisions use the population ration. The other goods use `localResourceUse`.
 * The returned demand figures are the provision shortage path; they are not a
 * second consumption of arms or medicine.
 */
export function consumedStocks(
  settlement: { population: number; focus: ResourceKey },
  stocks: Resources,
): { stocks: Resources; demand: number; consumed: number; shortage: number } {
  const after = cloneResources(stocks);
  const demand = round(settlement.population / 3_600, 3);
  const consumed = Math.min(after.provisions, demand);
  after.provisions = round(after.provisions - consumed);
  for (const resource of RESOURCE_KEYS) {
    if (resource === "provisions") continue;
    const use = localResourceUse(settlement, resource);
    after[resource] = round(Math.max(0, after[resource] - use));
  }
  return { stocks: after, demand, consumed, shortage: round(demand - consumed) };
}

/**
 * How far one good's price moves in one quiet tick.
 *
 * Quiet means production and local use only. Other merchants are not in the
 * figure, and a price sitting on the floor or the ceiling reports 0 until
 * stock would leave that clamp. A battle in the settlement skips the tick, so
 * the drift is 0 while one is underway.
 */
export function priceDriftPerTick(
  world: WorldState,
  settlementId: string,
  resource: ResourceKey,
): number {
  const settlement = world.settlements[settlementId];
  const before = marketPrice(world, settlementId, resource);
  if (Object.values(world.activeBattles).some((battle) => battle.settlementId === settlementId)) return 0;
  const next = consumedStocks(settlement, producedStocks(settlement)).stocks;
  const after = resourcePrice(resource, settlement.targetStocks[resource], next[resource]);
  return round(after - before, 2);
}

/**
 * Soldiers a fed settlement gains on this world tick.
 *
 * One soldier every `max(6, round(200000 / population))` ticks, and only while
 * provisions are met (`shortage === 0`) and garrison is under
 * `round(population / 70)`. Both rounds are to the nearest integer. The
 * interval is the world clock, not time since a battle: tick 0 is the opening
 * figure, and a later tick gains when `tick % interval === 0`. A shortage, the
 * ceiling, or a battle that skips this settlement drops that soldier. It is
 * not owed later. Neutral ports count. The rule reads this settlement's
 * population, its own provision shortage, and its garrison. It does not read a
 * faction treasury, a survey, or anyone's knowledge.
 */
function garrisonRegrowth(population: number, garrison: number, tick: number, shortage: number): number {
  if (shortage !== 0 || tick <= 0) return 0;
  const ceiling = round(population / 70, 0);
  if (garrison >= ceiling) return 0;
  const interval = Math.max(6, round(200_000 / population, 0));
  if (!Number.isFinite(interval) || interval <= 0 || tick % interval !== 0) return 0;
  return 1;
}

function produceSettlements(world: WorldState, events: SimEvent[]): void {
  for (const settlement of Object.values(world.settlements).sort((a, b) => a.id.localeCompare(b.id))) {
    if (Object.values(world.activeBattles).some((battle) => battle.settlementId === settlement.id)) continue;
    const stocks = producedStocks(settlement);
    emit(world, events, {
      type: "settlement-produced",
      settlementId: settlement.id,
      data: { focus: settlement.focus, stocks },
    });

    // Arms, medicine and ship materials are used as well. Without a sink those
    // stocks only rise, every price falls to the floor, and a cargo that paid
    // on the way out has nothing to do on the way home. Provisions keep the
    // shortage path above; running out of timber is a price, not a garrison loss.
    const { stocks: afterConsumption, demand, consumed, shortage } = consumedStocks(settlement, stocks);
    const stability = clamp(settlement.stability - shortage * 0.35 + (shortage === 0 ? 0.03 : 0), 0, 100);
    const garrisonLoss = shortage > 0 ? Math.min(settlement.garrison, Math.floor(shortage * 0.18)) : 0;
    const garrisonGain = garrisonRegrowth(settlement.population, settlement.garrison, world.tick, shortage);
    emit(world, events, {
      type: shortage > 0 ? "settlement-shortage" : "settlement-upkeep",
      settlementId: settlement.id,
      data: {
        demand,
        consumed,
        shortage,
        stocks: afterConsumption,
        stability: round(stability),
        garrison: settlement.garrison - garrisonLoss + garrisonGain,
        garrisonLoss,
      },
    });
  }
}

/**
 * Provisions a party eats in one tick.
 *
 * One tick is four world-hours, so this is one sixth of a party's daily need
 * rather than a full ration. Pure and exported, because a quoted runway that
 * disagreed with the charge upkeep actually applies would be worse than none.
 */
export function provisionDemand(character: Character): number {
  return round(0.12 + character.sailors * 0.008 + character.troops.count * 0.004);
}

/**
 * Provisions a market top-up aims to leave a party holding.
 *
 * Pure and exported because the panel quotes this figure and `buy-provisions`
 * charges against it. A quoted ceiling that disagreed with the real one would
 * reproduce the exact blind spot it exists to remove: the hold filling to a
 * number the player was never shown.
 */
export function provisionResupplyTarget(character: Character): number {
  return round(28 + character.troops.count * 0.25);
}

export interface ProvisionRunway {
  /** Provisions in the hold now. */
  provisions: number;
  /** Provisions consumed per tick at the current complement. */
  demand: number;
  /** Ticks until the hold is empty and shortage begins. */
  runwayTicks: number;
  /** The same runway in world days, for display. */
  runwayDays: number;
  /** Provisions missing per tick right now; zero while the party is fed. */
  shortage: number;
  /**
   * Health lost per tick *while short of provisions*. This is the starvation cost
   * only — it is not a net projection, and it reads zero on a fed party that is
   * losing health for some other reason.
   */
  shortageHealthPerTick: number;
  /** Morale lost per tick while short. Also a shortage term, not a net delta. */
  shortageMoralePerTick: number;
  /** Troops lost per tick while short. Zero until the shortfall is severe. */
  shortageTroopLossPerTick: number;
  /** What a market top-up at the current complement would leave the hold holding. */
  resupplyTarget: number;
}

/**
 * How long the hold lasts, and what running out would cost.
 *
 * A commander could already watch `cargo.provisions` fall, but nothing said when
 * it reached zero or what happened next, and a long campaign was lost to that
 * silence: morale sat at zero for thirty-three ticks because nobody was told.
 * The autonomous planner weighs a supply need when it plans (`agency.ts`), so
 * this is the player's half of a signal the simulation already acts on.
 */export function provisionRunway(world: WorldState, character: Character): ProvisionRunway {
  const demand = provisionDemand(character);
  const provisions = round(character.cargo.provisions, 3);
  const shortage = round(Math.max(0, demand - provisions), 3);
  // Demand is never zero: it carries a flat term even for an empty party, so the
  // runway is always defined and never divides by nothing.
  const runwayTicks = Math.max(0, Math.floor(provisions / demand));
  return {
    provisions,
    demand,
    runwayTicks,
    runwayDays: round(runwayTicks / world.ticksPerDay, 2),
    shortage,
    shortageHealthPerTick: round(shortage * 0.8, 3),
    shortageMoralePerTick: round(shortage * 2.4, 3),
    // Matches the `Math.floor(shortage * 0.5)` in upkeep, so a trivial shortfall
    // is not reported as killing troops it will not kill.
    shortageTroopLossPerTick: Math.floor(shortage * 0.5),
    resupplyTarget: provisionResupplyTarget(character),
  };
}

/** Hold capacity in units, shared across every resource. */
export function cargoCapacity(character: Character): number {
  return 40 + character.sailors * 2;
}

/** Units of every resource currently in the hold. */
export function cargoLoad(character: Character): number {
  return round(RESOURCE_KEYS.reduce((total, resource) => total + character.cargo[resource], 0), 3);
}

/**
 * Provisions a trader may not sell: the crew's own reserve.
 *
 * Selling the reserve is how a profitable-looking voyage strands its crew, so
 * the boundary refuses it rather than warning about it afterwards.
 */
export function sellableProvisions(character: Character): number {
  const reserve = 20 + character.troops.count * 0.18;
  return round(Math.max(0, character.cargo.provisions - reserve), 3);
}

/** Units of one resource the hold could still take, and units it could give up. */
export function tradableUnits(character: Character, resource: ResourceKey): number {
  return resource === "provisions" ? sellableProvisions(character) : round(character.cargo[resource], 3);
}

/**
 * The money one trade moves, in whole cents.
 *
 * Money rounds to cents here and only here: a panel that multiplied an exact
 * per-unit price would show a total the purse does not agree with, so the panel
 * mirrors this same three-step cascade (see `tradeAmounts` in the dashboard
 * page) and `tests/trade.test.ts` holds the two to each other.
 */
/** Purse after a trade. A buy draws allowance then purse, so the purse may fall by less than the gross. */
function moneyAfterTrade(
  world: WorldState,
  character: Character,
  direction: "buy" | "sell",
  net: number,
  source: SpendSource = "default",
): number {
  if (direction === "sell") return round(character.money + net, 2);
  const spent = resolveQuotedSpend(world, character, net, PASSAGE_COST_PER_TICK, source);
  return spent.ok ? spent.characterMoney : round(character.money, 2);
}

export function tradeAmounts(
  quantity: number,
  unitPrice: number,
  taxRate: number,
  direction: "buy" | "sell",
): { gross: number; tax: number; net: number } {
  const gross = round(quantity * unitPrice, 2);
  const tax = direction === "sell" ? round(gross * taxRate, 2) : 0;
  return { gross, tax, net: round(gross - tax, 2) };
}

export interface TradeQuote {
  resource: ResourceKey;
  direction: "buy" | "sell";
  /** Units the player asked for. */
  requested: number;
  /** Units that can actually move, after stock, money, hold and reserve limits. */
  quantity: number;
  /** Units of the requested amount that cannot be filled, and why. */
  shortfall: number;
  limitedBy: "none" | "stock" | "money" | "hold" | "cargo" | "reserve" | "depth";
  /** Price per unit, before any tax. */
  unitPrice: number;
  /** quantity x unitPrice. */
  gross: number;
  /** Local faction tax on a sale; zero on a purchase, which is not earned money. */
  tax: number;
  /** Money that changes hands: paid on a buy, received after tax on a sell. */
  net: number;
  moneyAfter: number;
  /** The largest quantity the same trade would accept. */
  maxQuantity: number;
}

/**
 * What one trade would actually do, before it is done.
 *
 * Pure and exported because the panel quotes this and the boundary charges it.
 * The two trading verbs and the market preview all read this one function, so a
 * quoted price cannot drift from the price charged — the failure mode the
 * provisioning work already had to close once.
 */
export function tradeQuote(
  world: WorldState,
  character: Character,
  resource: ResourceKey,
  direction: "buy" | "sell",
  requested: number,
  source: SpendSource = "default",
): TradeQuote {
  const settlement = world.settlements[character.locationId!];
  const unitPrice = marketPrice(world, settlement.id, resource);
  const capacity = cargoCapacity(character);
  const load = cargoLoad(character);
  const depth = marketDepth(settlement, resource);

  let maxQuantity: number;
  if (direction === "buy") {
    const byHold = Math.max(0, capacity - load);
    const byMoney = unitPrice > 0 ? spendableAmount(world, character, PASSAGE_COST_PER_TICK, source) / unitPrice : 0;
    maxQuantity = Math.max(0, Math.min(settlement.stocks[resource], depth, byHold, byMoney));
  } else {
    maxQuantity = Math.min(tradableUnits(character, resource), depth);
  }
  maxQuantity = round(maxQuantity, 3);

  const quantity = round(Math.max(0, Math.min(requested, maxQuantity)), 3);
  const taxRate = settlement.factionId ? world.factions[settlement.factionId].taxRate : 0;
  const { gross, tax, net } = tradeAmounts(quantity, unitPrice, taxRate, direction);

  // Named so a refusal can say which limit was reached rather than only that one
  // was. A partial fill the player did not ask for is the defect this replaces.
  //
  // A purchase has several ceilings and they bind in whichever order the market
  // puts them, so the *smallest* decides and must be the one named. Testing the
  // stock first told a player the island held only what their purse could buy.
  // Ties keep the earlier name: stock before depth before hold before money.
  let limitedBy: TradeQuote["limitedBy"] = "none";
  if (quantity < requested) {
    if (direction === "sell") {
      const byCargo = tradableUnits(character, resource);
      limitedBy = depth < byCargo ? "depth" : resource === "provisions" ? "reserve" : "cargo";
    } else {
      const candidates: Array<[TradeQuote["limitedBy"], number]> = [
        ["stock", settlement.stocks[resource]],
        ["depth", depth],
        ["hold", Math.max(0, capacity - load)],
        ["money", unitPrice > 0 ? spendableAmount(world, character, PASSAGE_COST_PER_TICK, source) / unitPrice : 0],
      ];
      limitedBy = candidates.reduce((best, candidate) => candidate[1] < best[1] ? candidate : best)[0];
    }
  }

  return {
    resource,
    direction,
    requested: round(requested, 3),
    quantity,
    shortfall: round(Math.max(0, requested - quantity), 3),
    limitedBy,
    unitPrice,
    gross,
    tax,
    net,
    moneyAfter: moneyAfterTrade(world, character, direction, net, source),
    maxQuantity,
  };
}

function upkeepCharacter(
  world: WorldState,
  character: Character,
  events: SimEvent[],
  traveling: boolean,
): void {
  const cargo = cloneResources(character.cargo);
  const demand = provisionDemand(character);
  const consumed = Math.min(cargo.provisions, demand);
  cargo.provisions = round(cargo.provisions - consumed);
  const shortage = round(demand - consumed);
  const troopLoss = shortage > 0 ? Math.min(character.troops.count, Math.floor(shortage * 0.5)) : 0;
  const morale = clamp(character.morale - shortage * 2.4 - (traveling ? 0.03 : 0) + (shortage === 0 ? 0.04 : 0), 0, 100);
  const health = clamp(character.health - shortage * 0.8, 1, 100);
  // Provisions burn at the same rate at sea and at anchor. The passage charge
  // is the part that does not: a voyage has to be worth the money it costs,
  // not only the ticks it takes. A party that cannot pay spends what it can
  // and is not turned around. Allowance first, then the purse. The free holder
  // draws the treasury. A captive is not walked, and a quote while held draws nothing.
  const passage = traveling ? resolvePassageCharge(world, character, PASSAGE_COST_PER_TICK) : null;

  emit(world, events, {
    type: "character-upkeep",
    actorId: character.id,
    data: {
      demand,
      consumed,
      shortage,
      cargo,
      morale: round(morale),
      health: round(health),
      troopCount: character.troops.count - troopLoss,
      troopLoss,
      ...(passage
        ? {
            passageCost: round(passage.treasuryDrawn + passage.purseDrawn, 2),
            characterMoney: passage.characterMoney,
            ...spendData(passage),
          }
        : {}),
    },
  });
}

/**
 * Voyage length in ticks. Pure, so it can be quoted before the voyage starts,
 * and it is the same function the simulation applies when travel begins — a
 * quoted estimate that disagreed with the real duration would be worse than none.
 */
export function travelDuration(world: WorldState, character: Character, destinationId: string): number {
  if (!character.locationId) return 1;
  const distance = distanceBetween(world, character.locationId, destinationId);
  const navigationMultiplier = 1 - character.skills.navigation / 220;
  return Math.max(2, Math.ceil((distance / 11) * navigationMultiplier));
}

function releaseTravel(
  world: WorldState,
  character: Character,
  captivity: CaptivityState,
): TravelState | null {
  const destinationId = captivity.releaseDestinationId;
  if (!destinationId || destinationId === captivity.settlementId) return null;
  const totalTicks = travelDuration(world, character, destinationId);
  return {
    fromId: captivity.settlementId,
    toId: destinationId,
    totalTicks,
    remainingTicks: totalTicks,
  };
}

function recoveryAfterRelease(world: WorldState, captivity: CaptivityState): TroopRecoveryState | null {
  if (captivity.scatteredTroops.count <= 0) return null;
  return {
    total: captivity.scatteredTroops.count,
    remaining: captivity.scatteredTroops.count,
    nextReturnTick: world.tick + world.ticksPerDay,
    returnEveryTicks: world.ticksPerDay,
    sourceSettlementId: captivity.settlementId,
  };
}

interface CaptureAttempt {
  cause: CaptivityState["cause"];
  risk: CombatRisk;
  battleId: string;
  health: number;
  morale: number;
  troopCount: number;
  /**
   * When set, including null, this is the hold's captor. The defeat and
   * retreat paths leave it unset and keep the settlement's faction.
   */
  captorFactionId?: string | null;
}

function attemptCapture(
  world: WorldState,
  character: Character,
  settlementId: string,
  attempt: CaptureAttempt,
  events: SimEvent[],
  rng: DeterministicRng,
  roll = rng.next(),
): boolean {
  const chance = captureChanceForRisk(attempt.risk);
  if (roll >= chance) return false;
  const captivity: CaptivityState = {
    captorFactionId: attempt.captorFactionId !== undefined
      ? attempt.captorFactionId
      : world.settlements[settlementId].factionId,
    settlementId,
    capturedTick: world.tick,
    mandatoryReleaseTick: world.tick + CAPTIVITY_MAX_DAYS * world.ticksPerDay,
    cause: attempt.cause,
    displayedRisk: attempt.risk,
    scatteredTroops: {
      count: attempt.troopCount,
      experience: character.troops.experience,
      discipline: character.troops.discipline,
    },
    releaseDestinationId: selectRetreatDestination(world, character.id, settlementId),
  };
  emit(world, events, {
    type: "character-captured",
    actorId: character.id,
    targetId: captivity.captorFactionId ?? undefined,
    settlementId,
    data: {
      battleId: attempt.battleId,
      cause: attempt.cause,
      displayedRisk: attempt.risk,
      captureChance: chance,
      captureRoll: round(roll, 4),
      health: attempt.health,
      morale: attempt.morale,
      captivity,
    },
  });
  return true;
}

function beginPostDefeatWithdrawal(
  world: WorldState,
  character: Character,
  settlementId: string,
  battleId: string,
  events: SimEvent[],
): void {
  const destinationId = selectRetreatDestination(world, character.id, settlementId);
  const duration = destinationId ? travelDuration(world, character, destinationId) : null;
  const travel = destinationId && duration !== null ? {
    fromId: settlementId,
    toId: destinationId,
    totalTicks: duration,
    remainingTicks: duration,
  } : null;
  emit(world, events, {
    type: "post-defeat-withdrawal-started",
    actorId: character.id,
    settlementId,
    targetId: destinationId ?? undefined,
    data: { battleId, destinationId, travel },
  });
}

function bestTradeResource(
  world: WorldState,
  settlementId: string,
  character: Character,
): ResourceKey {
  const settlement = world.settlements[settlementId];
  return [...RESOURCE_KEYS]
    .sort((left, right) => {
      const score = (resource: ResourceKey): number => {
        const localPrice = marketPrice(world, settlementId, resource);
        const bestRemotePrice = Math.max(
          ...Object.values(world.settlements)
            .filter((destination) => destination.id !== settlementId)
            .map((destination) => believedPrice(world, character, destination.id, resource)),
        );
        const exportable = Math.max(0, settlement.stocks[resource] - settlement.targetStocks[resource] * 0.55);
        return Math.max(0, bestRemotePrice - localPrice) * Math.min(30, exportable) + exportable * 0.015;
      };
      return score(right) - score(left) || left.localeCompare(right);
    })[0];
}

function tradableAmount(character: Character, resource: ResourceKey): number {
  if (resource !== "provisions") return character.cargo[resource];
  const partyReserve = 20 + character.troops.count * 0.18;
  return Math.max(0, character.cargo.provisions - partyReserve);
}

function dominantCargo(character: Character): ResourceKey | null {
  const result = [...RESOURCE_KEYS]
    .filter((resource) => tradableAmount(character, resource) >= 1)
    .sort((left, right) => tradableAmount(character, right) - tradableAmount(character, left));
  return result[0] ?? null;
}

function travelCandidates(world: WorldState, character: Character): DecisionCandidate[] {
  if (!character.locationId) return [];
  const carried = dominantCargo(character);
  return Object.values(world.settlements)
    .filter((settlement) => settlement.id !== character.locationId)
    .map((settlement) => {
      const distance = distanceBetween(world, character.locationId!, settlement.id);
      const tradeOpportunity = carried
        ? Math.max(0, believedPrice(world, character, settlement.id, carried) - marketPrice(world, character.locationId!, carried)) * tradableAmount(character, carried)
        : 0;
      const factionInterest = settlement.factionId !== character.factionId && character.personality.ambition > 0.6 ? 8 : 0;
      const score =
        8 +
        character.personality.curiosity * 22 +
        (carried ? 45 : 0) +
        character.personality.commerce * tradeOpportunity * 0.4 +
        factionInterest -
        distance * 0.13;
      return {
        action: "travel",
        targetId: settlement.id,
        score,
        reason: carried
          ? `seek a stronger ${carried} market at ${settlement.name}`
          : `pursue opportunities at ${settlement.name}`,
      };
    });
}

function buildCandidates(
  world: WorldState,
  character: Character,
  rng: DeterministicRng,
): DecisionCandidate[] {
  if (!character.locationId) return [];
  const settlement = world.settlements[character.locationId];
  const capacity = 40 + character.sailors * 2;
  const cargoLoad = RESOURCE_KEYS.reduce((sum, resource) => sum + character.cargo[resource], 0);
  const provisionNeed = Math.max(0, 22 + character.troops.count * 0.22 - character.cargo.provisions);
  const candidates: DecisionCandidate[] = [
    {
      action: "rest",
      score: (100 - character.health) * 1.4 + (55 - character.morale) * 0.8 + character.personality.caution * 12,
      reason: "recover health and morale",
    },
    {
      action: "buy-provisions",
      score: provisionNeed * 3.2 + character.personality.caution * 18,
      reason: "secure provisions for the party",
      resource: "provisions",
    },
    {
      action: "work",
      score: 22 + Math.max(0, 120 - character.money) * 0.16 + character.personality.loyalty * 8,
      reason: "earn dependable local income",
    },
    {
      action: "recruit",
      score:
        character.personality.ambition * 36 +
        character.skills.leadership * 0.24 +
        Math.max(0, 35 - character.troops.count) * 0.7,
      reason: "increase the party's military strength",
    },
    {
      action: "trade-local",
      score:
        character.personality.commerce * 35 +
        character.skills.trade * 0.2 +
        (cargoLoad < capacity * 0.65 ? 9 : -8) +
        (dominantCargo(character) && character.currentGoal === "travel" ? 55 : 0),
      reason: dominantCargo(character) ? "sell carried goods into the local market" : "buy a local surplus for resale",
      resource: dominantCargo(character) ?? bestTradeResource(world, settlement.id, character),
    },
    ...travelCandidates(world, character),
  ];

  const hostileTerritory = settlement.factionId !== character.factionId && settlement.factionId !== null;
  if (hostileTerritory && character.troops.count > 0 && settlementClaimAvailableTo(settlement, character.id)) {
    candidates.push({
      action: "claim-settlement",
      targetId: settlement.id,
      score:
        175 +
        character.personality.ambition * 38 +
        character.personality.aggression * 12 -
        character.personality.caution * 8,
      reason: `accept ${settlement.name}'s surrender and establish a personal claim`,
    });
  }
  // A faction that still holds a settlement raids at 15. A landless faction
  // raids at 8. Troops, cooldown, hostility, and the open-battle check stay.
  const landless =
    character.factionId !== null &&
    !Object.values(world.settlements).some((held) => held.factionId === character.factionId);
  if (
    hostileTerritory &&
    character.factionId !== null &&
    character.troops.count >= 25 &&
    (settlement.garrison >= 15 || (landless && settlement.garrison >= 8)) &&
    world.tick - character.lastBattleTick >= 18 &&
    !Object.values(world.activeBattles).some((battle) => battle.settlementId === settlement.id)
  ) {
    const defenseBelief = believedGarrison(world, character, settlement.id);
    const perceivedDefense = defenseBelief.estimate * settlement.fortification;
    const perceivedRatio = partyPower(character) / Math.max(1, perceivedDefense);
    candidates.push({
      action: "raid",
      targetId: settlement.id,
      score:
        character.personality.aggression * 82 +
        character.personality.ambition * 42 -
        character.personality.caution * 38 +
        perceivedRatio * 15,
      reason: `challenge ${settlement.name}'s estimated garrison (${Math.round(defenseBelief.estimate)}, ${Math.round(defenseBelief.confidence * 100)}% confidence) and seize supplies`,
    });
  }

  for (const candidate of candidates) {
    const planInfluence = planActionBoost(character, candidate.action, candidate.targetId);
    candidate.score = round(candidate.score + planInfluence.boost + rng.between(-3.5, 3.5), 2);
    if (planInfluence.reason) candidate.reason += `; ${planInfluence.reason}`;
    if (candidate.action === "buy-provisions" && (settlement.stocks.provisions < 1 || spendableAmount(world, character, PASSAGE_COST_PER_TICK) < 2)) {
      candidate.score = -1_000;
    }
    if (candidate.action === "recruit" && (spendableAmount(world, character, PASSAGE_COST_PER_TICK) < 30 || settlement.stocks.arms < 2)) {
      candidate.score = -1_000;
    }
    if (
      candidate.action === "travel" &&
      candidate.targetId &&
      !quotedPassage(world, character, candidate.targetId).affordable
    ) {
      candidate.score = -1_000;
    }
  }

  return candidates.sort((left, right) => right.score - left.score || left.action.localeCompare(right.action));
}

function tradeTax(world: WorldState, settlementId: string, gross: number): { tax: number; treasury: number } {
  const settlement = world.settlements[settlementId];
  if (!settlement.factionId) return { tax: 0, treasury: 0 };
  const faction = world.factions[settlement.factionId];
  const tax = round(gross * faction.taxRate, 2);
  return { tax, treasury: round(faction.treasury + tax, 2) };
}

function resolveTrade(
  world: WorldState,
  character: Character,
  events: SimEvent[],
  requestedResource?: ResourceKey,
): void {
  const settlementId = character.locationId!;
  const settlement = world.settlements[settlementId];
  const carried = dominantCargo(character);
  const resource = carried ?? requestedResource ?? bestTradeResource(world, settlementId, character);
  const price = marketPrice(world, settlementId, resource);
  const characterCargo = cloneResources(character.cargo);
  const settlementStocks = cloneResources(settlement.stocks);
  let quantity: number;
  let gross: number;
  let direction: "bought" | "sold";
  let characterMoney: number;
  let tax: number;
  let factionTreasury = settlement.factionId ? world.factions[settlement.factionId].treasury : 0;
  let purchase: ReturnType<typeof resolveQuotedSpend> | null = null;

  if (carried && tradableAmount(character, resource) >= 2) {
    quantity = round(Math.min(tradableAmount(character, resource), 16 + character.skills.trade / 7, marketDepth(settlement, resource)));
    gross = round(quantity * price, 2);
    const taxation = tradeTax(world, settlementId, gross);
    tax = taxation.tax;
    factionTreasury = taxation.treasury;
    direction = "sold";
    characterMoney = round(character.money + gross - tax, 2);
    characterCargo[resource] = round(characterCargo[resource] - quantity);
    settlementStocks[resource] = round(settlementStocks[resource] + quantity);
  } else {
    const capacity = 40 + character.sailors * 2;
    const load = RESOURCE_KEYS.reduce((sum, key) => sum + character.cargo[key], 0);
    const spendable = spendableAmount(world, character, PASSAGE_COST_PER_TICK);
    quantity = round(Math.min(20 + character.skills.trade / 8, capacity - load, marketDepth(settlement, resource), settlement.stocks[resource], price > 0 ? spendable / price : 0));
    if (quantity <= 0) {
      return;
    }
    gross = round(quantity * price, 2);
    tax = 0;
    direction = "bought";
    purchase = resolveQuotedSpend(world, character, gross, PASSAGE_COST_PER_TICK);
    if (!purchase.ok) return;
    characterMoney = purchase.characterMoney;
    characterCargo[resource] = round(characterCargo[resource] + quantity);
    settlementStocks[resource] = round(settlementStocks[resource] - quantity);
  }

  emit(world, events, {
    type: "market-trade",
    actorId: character.id,
    settlementId,
    data: {
      direction,
      resource,
      quantity,
      unitPrice: price,
      gross,
      tax,
      characterMoney,
      characterCargo,
      settlementStocks,
      ...(direction === "sold"
        ? { factionTreasury }
        : purchase && purchase.ok
          ? spendData(purchase)
          : {}),
    },
  });
}

function recordBattleConsequences(
  world: WorldState,
  character: Character,
  settlement: WorldState["settlements"][string],
  events: SimEvent[],
  attackerWon: boolean,
): void {
  const goalKind = attackerWon ? "expand-influence" : "recover-strength";
  const goalId = `${character.id}:${goalKind}`;
  const existingGoal = character.goals.find((goal) => goal.id === goalId);
  const evolvedGoal = existingGoal
    ? {
        ...existingGoal,
        priority: round(clamp(existingGoal.priority + (attackerWon ? 0.025 : 0.08), 0, 1)),
        progress: round(clamp(existingGoal.progress + (attackerWon ? 0.07 : 0), 0, 1)),
        status: "active" as const,
        origin: attackerWon
          ? `reinforced by victory at ${settlement.name}`
          : `renewed by defeat at ${settlement.name}`,
      }
    : {
        id: goalId,
        kind: goalKind,
        label: attackerWon ? "Turn battlefield success into lasting influence" : "Recover strength after a consequential defeat",
        priority: attackerWon ? 0.74 : 0.92,
        progress: attackerWon ? 0.07 : 0,
        status: "active" as const,
        origin: attackerWon ? `victory at ${settlement.name}` : `defeat at ${settlement.name}`,
        createdTick: world.tick,
      };
  emit(world, events, {
    type: "goal-evolved",
    actorId: character.id,
    settlementId: settlement.id,
    data: {
      trigger: attackerWon ? "victory" : "defeat",
      goal: evolvedGoal,
    },
  });

  const relevantOrder = character.standingOrders.find((order) => order.issuerId in character.relationships);
  if (relevantOrder) {
    const prior = character.relationships[relevantOrder.issuerId];
    const relationship = {
      ...prior,
      trust: round(clamp(prior.trust + (attackerWon ? 0.012 : -0.025), 0, 1)),
      respect: round(clamp(prior.respect + (attackerWon ? 0.028 : -0.008), 0, 1)),
      fear: round(clamp(prior.fear + (attackerWon ? -0.005 : 0.018), 0, 1)),
      grievance: round(clamp(prior.grievance + (attackerWon ? -0.006 : 0.035), 0, 1)),
      obligation: round(clamp(prior.obligation + (attackerWon ? -0.01 : 0.015), 0, 1)),
      lastChangedTick: world.tick,
    };
    emit(world, events, {
      type: "relationship-changed",
      actorId: character.id,
      targetId: relevantOrder.issuerId,
      data: {
        characterId: relevantOrder.issuerId,
        trigger: attackerWon ? "victory under standing orders" : "costly defeat under standing orders",
        relationship,
      },
    });
  }
}

function emitCombatObservation(
  world: WorldState,
  character: Character,
  settlementId: string,
  events: SimEvent[],
  reason: string,
): void {
  const knowledge = directObservation(world, character);
  if (!knowledge || knowledge.settlementId !== settlementId) return;
  emit(world, events, {
    type: "knowledge-updated",
    actorId: character.id,
    settlementId,
    data: { settlementId, knowledge, reason },
  });
}

function resolveImmediateBattle(
  world: WorldState,
  character: Character,
  events: SimEvent[],
  rng: DeterministicRng,
): void {
  const settlement = world.settlements[character.locationId!];
  const attackerBase = partyPower(character);
  const defenderBase = settlementDefensePower(settlement);
  const uncertainty = 0.38 * (1 - character.skills.strategy / 125);
  const attackerRoll = 1 + rng.between(-uncertainty, uncertainty);
  const defenderRoll = 1 + rng.between(-0.22, 0.22);
  const attackerScore = attackerBase * attackerRoll;
  const defenderScore = defenderBase * defenderRoll;
  const attackerWon = attackerScore > defenderScore;
  const ratio = Math.min(3, Math.max(0.2, attackerScore / Math.max(1, defenderScore)));
  const attackerLossRate = attackerWon ? 0.05 + 0.11 / ratio : 0.16 + 0.2 / ratio;
  const defenderLossRate = attackerWon ? 0.28 + 0.12 * ratio : 0.07 + 0.08 * ratio;
  const attackerLosses = Math.min(character.troops.count, Math.max(1, Math.round(character.troops.count * attackerLossRate)));
  const defenderLosses = Math.min(settlement.garrison, Math.max(1, Math.round(settlement.garrison * defenderLossRate)));
  const settlementStocks = cloneResources(settlement.stocks);
  const lootArms = attackerWon ? round(Math.min(settlementStocks.arms, 8 + character.troops.count * 0.08)) : 0;
  settlementStocks.arms = round(settlementStocks.arms - lootArms);
  const defenderGarrison = settlement.garrison - defenderLosses;
  const settlementStability = round(clamp(settlement.stability - (attackerWon ? 12 : 3), 0, 100));
  const surrender = attackerWon &&
      defenderGarrison <= SURRENDER_GARRISON_THRESHOLD &&
      settlementStability <= surrenderStabilityLimit(defenderGarrison) &&
      settlement.factionId !== null
    ? {
        offeredToId: character.id,
        offeredTick: world.tick,
        previousFactionId: settlement.factionId,
      }
    : settlement.surrender;

  emit(world, events, {
    type: "battle-resolved",
    actorId: character.id,
    targetId: settlement.factionId ?? undefined,
    settlementId: settlement.id,
    data: {
      outcome: attackerWon ? "attacker-victory" : "defender-victory",
      attackerBase,
      defenderBase: round(defenderBase),
      attackerScore: round(attackerScore),
      defenderScore: round(defenderScore),
      strategyUncertainty: round(uncertainty),
      attackerLosses,
      defenderLosses,
      lootArms,
      attackerHealth: round(clamp(character.health - (attackerWon ? 6 : 18), 1, 100)),
      attackerMorale: round(clamp(character.morale + (attackerWon ? 10 : -18), 0, 100)),
      attackerTroops: character.troops.count - attackerLosses,
      attackerMoney: round(character.money + (attackerWon ? 35 + lootArms * 2 : 0), 2),
      victories: character.victories + (attackerWon ? 1 : 0),
      defeats: character.defeats + (attackerWon ? 0 : 1),
      defenderGarrison,
      settlementStability,
      settlementStocks,
      surrender,
      phases: 1,
    },
  });
  emitCombatObservation(world, character, settlement.id, events, "immediate post-battle assessment");
  recordBattleConsequences(world, character, settlement, events, attackerWon);
}

function dockCommandScore(character: Character): number {
  // The dock ranks the seed. loyaltyAdjustment is read only by the cover sort.
  return character.skills.leadership + character.personality.loyalty * 50;
}

/**
 * Who an outscore win's already-drawn capture roll can take.
 *
 * A member of the losing faction, standing on the port, not travelling, free,
 * and not the attacker. Highest leadership plus loyalty times 50. A lower id
 * wins a tie, the same comparison that names an acting commander. No draw.
 * Nobody on the dock means the caller still spends the roll and takes nobody.
 */
function selectOutscoreDockPrisoner(
  world: WorldState,
  settlementId: string,
  losingFactionId: string | null,
  attackerId: string,
): Character | null {
  if (!losingFactionId) return null;
  const ranked = Object.values(world.characters)
    .filter((candidate) =>
      candidate.factionId === losingFactionId &&
      candidate.locationId === settlementId &&
      candidate.travel === null &&
      candidate.captivity === null &&
      candidate.id !== attackerId
    )
    .sort((left, right) =>
      dockCommandScore(right) - dockCommandScore(left) ||
      left.id.localeCompare(right.id)
    );
  return ranked[0] ?? null;
}

function completeMajorBattle(
  world: WorldState,
  battle: ActiveBattle,
  events: SimEvent[],
  attackerWon: boolean,
  attackerScore: number,
  defenderScore: number,
  rng: DeterministicRng,
  consumeIgnoredCaptureRoll = false,
): void {
  const character = world.characters[battle.attackerId];
  const settlement = world.settlements[battle.settlementId];
  const settlementStocks = cloneResources(settlement.stocks);
  const lootArms = attackerWon ? round(Math.min(settlementStocks.arms, 8 + character.troops.count * 0.08)) : 0;
  settlementStocks.arms = round(settlementStocks.arms - lootArms);
  const surrender = attackerWon &&
      settlement.garrison <= SURRENDER_GARRISON_THRESHOLD &&
      settlement.stability <= surrenderStabilityLimit(settlement.garrison) &&
      settlement.factionId !== null
    ? {
        offeredToId: character.id,
        offeredTick: world.tick,
        previousFactionId: settlement.factionId,
      }
    : settlement.surrender;

  emit(world, events, {
    type: "battle-resolved",
    actorId: character.id,
    targetId: settlement.factionId ?? undefined,
    settlementId: settlement.id,
    data: {
      battleId: battle.id,
      outcome: attackerWon ? "attacker-victory" : "defender-victory",
      attackerBase: battle.attackerInitialPower,
      defenderBase: battle.defenderInitialPower,
      attackerScore: round(attackerScore),
      defenderScore: round(defenderScore),
      strategyUncertainty: round(0.38 * (1 - character.skills.strategy / 125)),
      attackerLosses: battle.attackerInitialTroops - character.troops.count,
      defenderLosses: battle.defenderInitialGarrison - settlement.garrison,
      lootArms,
      attackerHealth: character.health,
      attackerMorale: character.morale,
      attackerTroops: character.troops.count,
      attackerMoney: round(character.money + (attackerWon ? 35 + lootArms * 2 : 0), 2),
      victories: character.victories + (attackerWon ? 1 : 0),
      defeats: character.defeats + (attackerWon ? 0 : 1),
      defenderGarrison: settlement.garrison,
      settlementStability: settlement.stability,
      settlementStocks,
      surrender,
      phases: battle.phase,
    },
  });
  recordBattleConsequences(world, character, settlement, events, attackerWon);
  if (!attackerWon) {
    const risk = battle.lastPhase?.captureRisk ?? battle.startingForecast.captureRisk;
    const captured = attemptCapture(world, character, settlement.id, {
      cause: "major-defeat",
      risk,
      battleId: battle.id,
      health: character.health,
      morale: character.morale,
      troopCount: character.troops.count,
    }, events, rng);
    if (!captured) beginPostDefeatWithdrawal(world, character, settlement.id, battle.id, events);
  } else if (consumeIgnoredCaptureRoll) {
    // A defeat would have drawn this roll inside attemptCapture. Spend that
    // one draw, at the phase's existing chance, on the senior losing officer
    // standing on the port. The captor is the attacker's faction. The cause
    // is outscore-loss, so the chronicle does not say the prisoner lost the
    // fight. An empty dock still spends the roll and takes nobody. No second
    // draw. A major that was already an attacker victory does not pass this
    // flag, and does not draw. The victory, the surrender offer, and the
    // garrison were written on battle-resolved above and are left as they are.
    const risk = battle.lastPhase?.captureRisk ?? battle.startingForecast.captureRisk;
    const roll = rng.next();
    const prisoner = selectOutscoreDockPrisoner(
      world,
      settlement.id,
      settlement.factionId,
      character.id,
    );
    if (prisoner) {
      attemptCapture(world, prisoner, settlement.id, {
        cause: "outscore-loss",
        risk,
        battleId: battle.id,
        health: prisoner.health,
        morale: prisoner.morale,
        troopCount: prisoner.troops.count,
        captorFactionId: character.factionId,
      }, events, rng, roll);
    }
  }
}

function resolveBattlePhase(
  world: WorldState,
  battleId: string,
  events: SimEvent[],
  rng: DeterministicRng,
): void {
  const battle = world.activeBattles[battleId];
  if (!battle) return;
  const character = world.characters[battle.attackerId];
  const settlement = world.settlements[battle.settlementId];
  const phase = battle.phase + 1;
  const attackerBase = partyPower(character);
  const defenderBase = settlementDefensePower(settlement);
  const uncertainty = 0.38 * (1 - character.skills.strategy / 125);
  const attackerScore = attackerBase * (1 + rng.between(-uncertainty, uncertainty));
  const defenderScore = defenderBase * (1 + rng.between(-0.22, 0.22));
  const attackerAdvantage = attackerScore > defenderScore;
  const ratio = clamp(attackerScore / Math.max(1, defenderScore), 0.2, 3);
  const intensity = [0.34, 0.42, 0.5][Math.min(2, phase - 1)];
  const attackerLossRate = (attackerAdvantage ? 0.05 + 0.11 / ratio : 0.16 + 0.2 / ratio) * intensity;
  const defenderLossRate = (attackerAdvantage ? 0.28 + 0.12 * ratio : 0.07 + 0.08 * ratio) * intensity;
  const attackerLosses = Math.min(character.troops.count, Math.max(1, Math.round(character.troops.count * attackerLossRate)));
  const defenderLosses = Math.min(settlement.garrison, Math.max(1, Math.round(settlement.garrison * defenderLossRate)));
  const attackerHealth = round(clamp(character.health - (attackerAdvantage ? 2 : 6), 1, 100));
  const attackerMorale = round(clamp(character.morale + (attackerAdvantage ? 3 : -7), 0, 100));
  const attackerTroops = character.troops.count - attackerLosses;
  const defenderGarrison = settlement.garrison - defenderLosses;
  const settlementStability = round(clamp(settlement.stability - (attackerAdvantage ? 4 : 1), 0, 100));
  const risks = projectedBattleRisk(world, battle, {
    attackerHealth,
    attackerMorale,
    attackerTroops,
    defenderGarrison,
  });
  const lastPhase: BattlePhaseReport = {
    phase,
    outcome: attackerAdvantage ? "attacker-advantage" : "defender-advantage",
    attackerLosses,
    defenderLosses,
    attackerHealth,
    attackerMorale,
    attackerTroops,
    defenderGarrison,
    ...risks,
  };
  const updatedBattle: ActiveBattle = {
    ...battle,
    phase,
    attackerPhaseWins: battle.attackerPhaseWins + (attackerAdvantage ? 1 : 0),
    defenderPhaseWins: battle.defenderPhaseWins + (attackerAdvantage ? 0 : 1),
    lastPhase,
  };
  emit(world, events, {
    type: "battle-phase-resolved",
    actorId: character.id,
    targetId: settlement.factionId ?? undefined,
    settlementId: settlement.id,
    data: {
      battle: updatedBattle,
      phase,
      outcome: lastPhase.outcome,
      attackerScore: round(attackerScore),
      defenderScore: round(defenderScore),
      attackerLosses,
      defenderLosses,
      attackerHealth,
      attackerMorale,
      attackerTroops,
      defenderGarrison,
      settlementStability,
      retreatRisk: risks.retreatRisk,
      captureRisk: risks.captureRisk,
    },
  });
  emitCombatObservation(world, character, settlement.id, events, `post-battle phase ${phase} assessment`);

  const battleEnded = phase >= updatedBattle.totalPhases || attackerTroops < 8 || defenderGarrison === 0 ||
    attackerHealth <= 15 || attackerMorale <= 12;
  if (!battleEnded) return;
  const phaseWinsSayAttacker =
    updatedBattle.attackerPhaseWins > updatedBattle.defenderPhaseWins ||
    (updatedBattle.attackerPhaseWins === updatedBattle.defenderPhaseWins && attackerScore > defenderScore);
  // Garrison 0, or troops still in the field with health and morale above the
  // line and the phase tally, is the win this battle already had.
  const standingAttackerWin = defenderGarrison === 0 ||
    (attackerTroops >= 8 && attackerHealth > 15 && attackerMorale > 12 && phaseWinsSayAttacker);
  // Outscore. The battle still ends at morale 12 or lower. A higher attacker
  // score is a victory when troops are at least 8, health is above 15, and
  // the garrison is not yet 0, including when morale is what ended it and
  // including when the phase tally would still call it a defeat. Surrender
  // then uses the same garrison and stability limit as any other attacker
  // victory. Any higher score qualifies. A tie does not.
  const outscoreAttackerWin = attackerTroops >= 8 &&
    attackerHealth > 15 &&
    defenderGarrison !== 0 &&
    attackerScore > defenderScore;
  const attackerWon = standingAttackerWin || outscoreAttackerWin;
  completeMajorBattle(
    world,
    updatedBattle,
    events,
    attackerWon,
    attackerScore,
    defenderScore,
    rng,
    attackerWon && !standingAttackerWin,
  );
}

function startMajorBattle(
  world: WorldState,
  character: Character,
  events: SimEvent[],
  rng: DeterministicRng,
): void {
  const settlement = world.settlements[character.locationId!];
  const id = `battle-${String(world.nextEventSequence).padStart(6, "0")}`;
  const battle: ActiveBattle = {
    id,
    attackerId: character.id,
    settlementId: settlement.id,
    defenderFactionId: settlement.factionId,
    startedTick: world.tick,
    phase: 0,
    totalPhases: 3,
    attackerInitialPower: partyPower(character),
    defenderInitialPower: settlementDefensePower(settlement),
    attackerInitialTroops: character.troops.count,
    defenderInitialGarrison: settlement.garrison,
    attackerPhaseWins: 0,
    defenderPhaseWins: 0,
    retreatDestinationId: selectRetreatDestination(world, character.id, settlement.id),
    lastPhase: null,
    startingForecast: combatForecast(world, character.id, settlement.id, { observedLocally: true }),
  };
  emit(world, events, {
    type: "battle-started",
    actorId: character.id,
    targetId: settlement.factionId ?? undefined,
    settlementId: settlement.id,
    data: { battle },
  });
  resolveBattlePhase(world, id, events, rng);
}

function resolveBattle(
  world: WorldState,
  character: Character,
  events: SimEvent[],
  rng: DeterministicRng,
): void {
  const settlement = world.settlements[character.locationId!];
  if (isMajorBattle(character, settlement)) startMajorBattle(world, character, events, rng);
  else resolveImmediateBattle(world, character, events, rng);
}

function retreatFromBattle(
  world: WorldState,
  battle: ActiveBattle,
  events: SimEvent[],
  rng: DeterministicRng,
  commandId?: string,
): "retreated" | "captured" {
  const character = world.characters[battle.attackerId];
  const settlement = world.settlements[battle.settlementId];
  const retreatDestinationId = battle.retreatDestinationId ??
    selectRetreatDestination(world, character.id, settlement.id);
  const retreatDuration = retreatDestinationId ? travelDuration(world, character, retreatDestinationId) : null;
  const retreatTravel = retreatDestinationId && retreatDuration !== null ? {
    fromId: settlement.id,
    toId: retreatDestinationId,
    totalTicks: retreatDuration,
    remainingTicks: retreatDuration,
  } : null;
  const risks = battle.lastPhase
    ? { retreatRisk: battle.lastPhase.retreatRisk, captureRisk: battle.lastPhase.captureRisk }
    : battleRisk(world, battle);
  const captureRoll = rng.next();
  const riskRate = risks.retreatRisk === "severe" ? 0.1 : risks.retreatRisk === "high" ? 0.07 : risks.retreatRisk === "moderate" ? 0.045 : 0.025;
  const pursuitLosses = Math.min(character.troops.count, Math.max(0, Math.round(character.troops.count * riskRate * rng.between(0.75, 1.25))));
  const attackerHealth = round(clamp(character.health - (2 + pursuitLosses * 0.12), 1, 100));
  const attackerMorale = round(clamp(character.morale - (6 + pursuitLosses * 0.2), 0, 100));
  emitCombatObservation(world, character, settlement.id, events, "final battlefield assessment before withdrawal");
  const captured = attemptCapture(world, character, settlement.id, {
    cause: "failed-retreat",
    risk: risks.captureRisk,
    battleId: battle.id,
    health: attackerHealth,
    morale: attackerMorale,
    troopCount: character.troops.count - pursuitLosses,
  }, events, rng, captureRoll);
  if (captured) return "captured";
  emit(world, events, {
    type: "battle-retreated",
    actorId: character.id,
    targetId: settlement.factionId ?? undefined,
    settlementId: settlement.id,
    data: {
      battleId: battle.id,
      commandId,
      phase: battle.phase,
      pursuitLosses,
      attackerHealth,
      attackerMorale,
      attackerTroops: character.troops.count - pursuitLosses,
      retreatDestinationId,
      retreatTravel,
      retreatRisk: risks.retreatRisk,
      captureRisk: risks.captureRisk,
      outcome: pursuitLosses > 0 ? "contested-retreat" : "clean-retreat",
    },
  });
  return "retreated";
}

function progressActiveBattles(world: WorldState, events: SimEvent[], rng: DeterministicRng): Set<string> {
  const participants = new Set<string>();
  for (const battle of Object.values(world.activeBattles).sort((left, right) => left.id.localeCompare(right.id))) {
    if (battle.startedTick >= world.tick) continue;
    participants.add(battle.attackerId);
    const attacker = world.characters[battle.attackerId];
    if (attacker.controller.kind === "autonomous" && autonomousShouldRetreat(world, battle)) {
      retreatFromBattle(world, battle, events, rng);
    } else {
      resolveBattlePhase(world, battle.id, events, rng);
    }
  }
  return participants;
}

function resolveSettlementClaim(
  world: WorldState,
  character: Character,
  events: SimEvent[],
): void {
  const settlement = world.settlements[character.locationId!];
  emit(world, events, {
    type: "settlement-claimed",
    actorId: character.id,
    targetId: settlement.factionId ?? undefined,
    settlementId: settlement.id,
    data: {
      previousFactionId: settlement.factionId,
      previousOwnerId: settlement.ownerId,
      ownerId: character.id,
      factionId: character.factionId,
      garrison: settlement.garrison,
      stability: round(Math.max(CLAIM_STABILITY_FLOOR, settlement.stability)),
      basis: "accepted-surrender",
    },
  });
}

/**
 * Ambitions the character was given at creation: the universal survival motive,
 * the archetype root, and faction membership. Battle-born goals such as
 * `recover-strength` are not roots; the next victory or defeat reopens those.
 */
function isOpeningAmbition(character: Character, goal: CharacterGoal): boolean {
  if (goal.kind === "material-security") return true;
  if (goal.kind === "recover-strength") return false;
  if (goal.kind === "expand-influence" && character.archetype !== "raider") return false;
  return goal.createdTick === 0;
}

function renewedOrigin(origin: string): string {
  const prefix = "renewed: ";
  return origin.startsWith(prefix) ? origin : `${prefix}${origin}`;
}

/**
 * Satisfaction is a finished cycle, not retirement. When it would leave the
 * character with nothing to score, reopen the personality roots at progress 0.
 */
function renewOpeningAmbitions(
  world: WorldState,
  character: Character,
  events: SimEvent[],
): void {
  const roots = character.goals
    .filter((goal) => isOpeningAmbition(character, goal))
    .sort((left, right) => left.id.localeCompare(right.id));
  const renewing = roots.length > 0
    ? roots
    : [...character.goals].sort((left, right) => left.id.localeCompare(right.id));
  for (const goal of renewing) {
    emit(world, events, {
      type: "goal-evolved",
      actorId: character.id,
      settlementId: character.locationId ?? undefined,
      data: {
        trigger: "satisfying every open ambition",
        goal: {
          ...goal,
          progress: 0,
          status: "active" as const,
          origin: renewedOrigin(goal.origin),
        },
      },
    });
  }
}

function progressActiveGoal(
  world: WorldState,
  character: Character,
  action: string,
  events: SimEvent[],
): void {
  const goal = character.goals.find((candidate) => candidate.id === character.activeGoalId);
  const increment = goalProgressForAction(goal, action);
  if (!goal || increment <= 0) return;
  const progress = round(clamp(goal.progress + increment, 0, 1));
  emit(world, events, {
    type: "goal-progressed",
    actorId: character.id,
    data: {
      goalId: goal.id,
      action,
      increment,
      progress,
      status: progress >= 1 ? "satisfied" : "active",
    },
  });
  if (progress >= 1 && !character.goals.some((candidate) => candidate.status === "active")) {
    renewOpeningAmbitions(world, character, events);
  }
}

/**
 * A stable per-character offset used to stagger periodic work across ticks.
 *
 * This read `id.slice(-2)`, which silently aliases once ids pass two digits:
 * `character-100` and `character-101` both parsed as `00` and `01`. Ids are
 * zero-padded today, so nothing is wrong yet, but the cadence would quietly
 * collapse rather than fail when the roster grows.
 */
export function characterCadence(characterId: string): number {
  const parsed = Number.parseInt(characterId.split("-").pop() ?? "", 10);
  return Number.isSafeInteger(parsed) ? Math.abs(parsed) : 0;
}

function evolveLocalRelationship(
  world: WorldState,
  character: Character,
  events: SimEvent[],
  rng: DeterministicRng,
): void {
  if (!character.locationId) return;
  const numericId = characterCadence(character.id);
  if ((world.tick + numericId) % world.ticksPerDay !== 0) return;
  const companions = Object.values(world.characters)
    .filter((candidate) => candidate.id !== character.id && candidate.locationId === character.locationId)
    .sort((left, right) => left.id.localeCompare(right.id));
  if (companions.length === 0) return;
  const companion = rng.pick(companions);
  const prior = character.relationships[companion.id] ?? {
    characterId: companion.id,
    trust: 0.28,
    affinity: 0.25,
    respect: 0.28,
    fear: 0.08,
    grievance: 0,
    obligation: 0,
    lastChangedTick: world.tick,
  };
  const sharedFaction = character.factionId !== null && character.factionId === companion.factionId;
  const relationship = {
    ...prior,
    trust: round(clamp(prior.trust + (sharedFaction ? 0.012 : 0.004), 0, 1)),
    affinity: round(clamp(prior.affinity + 0.006 + character.personality.curiosity * 0.006, 0, 1)),
    respect: round(clamp(prior.respect + (companion.troops.count > character.troops.count ? 0.008 : 0.003), 0, 1)),
    grievance: round(clamp(prior.grievance - 0.003, 0, 1)),
    lastChangedTick: world.tick,
  };
  emit(world, events, {
    type: "relationship-changed",
    actorId: character.id,
    targetId: companion.id,
    settlementId: character.locationId,
    data: {
      characterId: companion.id,
      trigger: `shared time at ${world.settlements[character.locationId].name}`,
      relationship,
    },
  });
}

function escapeCaptivity(
  world: WorldState,
  character: Character,
  events: SimEvent[],
  rng: DeterministicRng,
  commandId: string,
): void {
  const captivity = character.captivity!;
  const injury = round(Math.max(12, 18 + rng.between(0, 12) - character.attributes.resilience / 30), 1);
  const health = round(clamp(character.health - injury, 1, 100));
  const morale = round(clamp(character.morale - 4, 0, 100));
  const scarChance = clamp(0.08 + Math.max(0, 45 - health) * 0.003, 0.08, 0.25);
  const scarRoll = rng.next();
  let scar: CharacterScar | null = null;
  const attributes: CharacterAttributes = { ...character.attributes };
  if (scarRoll < scarChance) {
    const attribute = rng.pick<keyof CharacterAttributes>(["power", "speed", "endurance", "resilience"]);
    const penalty = Math.min(attributes[attribute] - 1, rng.integer(1, 3));
    if (penalty > 0) {
      attributes[attribute] -= penalty;
      scar = {
        id: `scar-${String(world.nextEventSequence).padStart(6, "0")}`,
        attribute,
        penalty,
        cause: "captivity-escape",
        gainedTick: world.tick,
      };
    }
  }
  const travel = releaseTravel(world, character, captivity);
  emit(world, events, {
    type: "captivity-escaped",
    actorId: character.id,
    targetId: captivity.captorFactionId ?? undefined,
    settlementId: captivity.settlementId,
    data: {
      commandId,
      injury,
      health,
      morale,
      scarChance: round(scarChance, 3),
      scarRoll: round(scarRoll, 4),
      scar,
      attributes,
      travel,
      releaseLocationId: travel ? null : captivity.settlementId,
      troopRecovery: recoveryAfterRelease(world, captivity),
    },
  });
}

function processCaptivityDeadlines(
  world: WorldState,
  events: SimEvent[],
  rng: DeterministicRng,
): void {
  for (const character of Object.values(world.characters).sort((left, right) => left.id.localeCompare(right.id))) {
    const captivity = character.captivity;
    if (!captivity || world.tick < captivity.mandatoryReleaseTick) continue;
    const physicalAverage = Object.values(character.attributes).reduce((sum, value) => sum + value, 0) / 4;
    const systemMaximum = round(clamp(50 + captivity.scatteredTroops.count * 2 + physicalAverage * 0.5, 75, 600), 2);
    const demandedValue = round(systemMaximum * rng.between(0.55, 1), 2);
    // Only the coins that leave the purse are credited. The debt is the unpaid
    // remainder and is not credited. A faction captor's treasury receives
    // every cent. The party leader receives 0. No faction: the leader takes
    // the whole payment. No recipient at all: the coins stay in the purse,
    // so a payment cannot destroy them.
    const faction = captivity.captorFactionId ? world.factions[captivity.captorFactionId] : undefined;
    const leader = faction ? null : captorPartyLeader(world, character);
    let moneyPaid = round(Math.min(character.money, demandedValue), 2);
    if (!faction && !leader) moneyPaid = 0;
    const shares = splitRansom(moneyPaid, Boolean(faction));
    const debtValue = round(demandedValue - moneyPaid, 2);
    const debt: DebtObligation | null = debtValue > 0 ? {
      id: `debt-${String(world.nextEventSequence).padStart(6, "0")}`,
      creditorFactionId: captivity.captorFactionId,
      originalValue: debtValue,
      remainingValue: debtValue,
      incurredTick: world.tick,
      reason: "prisoner-release",
    } : null;
    const travel = releaseTravel(world, character, captivity);
    emit(world, events, {
      type: "captivity-released",
      actorId: character.id,
      targetId: captivity.captorFactionId ?? undefined,
      settlementId: captivity.settlementId,
      data: {
        reason: "mandatory-bounded-terms",
        daysHeld: round((world.tick - captivity.capturedTick) / world.ticksPerDay, 2),
        terms: { systemMaximum, demandedValue, moneyPaid, debtValue },
        // Same event type. The credit is extra fields so replay pays the
        // treasury, or the leader when there is no faction, without a second
        // draw or a second event. A faction captor keeps leaderShare at 0 and
        // omits leaderId and leaderMoney: there is no leader credit to store.
        ransom: {
          treasuryShare: shares.treasuryShare,
          leaderShare: shares.leaderShare,
          treasuryFactionId: faction ? faction.id : null,
          factionTreasury: faction ? round(faction.treasury + shares.treasuryShare, 2) : null,
          ...(leader ? {
            leaderId: leader.id,
            leaderMoney: round(leader.money + shares.leaderShare, 2),
          } : {}),
        },
        characterMoney: round(character.money - moneyPaid, 2),
        debt,
        travel,
        releaseLocationId: travel ? null : captivity.settlementId,
        troopRecovery: recoveryAfterRelease(world, captivity),
      },
    });
  }
}

function progressTroopRecoveries(world: WorldState, events: SimEvent[]): void {
  for (const character of Object.values(world.characters).sort((left, right) => left.id.localeCompare(right.id))) {
    const recovery = character.troopRecovery;
    if (!recovery || character.captivity || world.tick < recovery.nextReturnTick) continue;
    const returning = Math.min(recovery.remaining, Math.max(1, Math.ceil(recovery.total / 7)));
    const remaining = recovery.remaining - returning;
    const nextRecovery: TroopRecoveryState | null = remaining > 0 ? {
      ...recovery,
      remaining,
      nextReturnTick: world.tick + recovery.returnEveryTicks,
    } : null;
    emit(world, events, {
      type: "scattered-troops-returned",
      actorId: character.id,
      settlementId: character.locationId ?? undefined,
      data: {
        returning,
        troopCount: character.troops.count + returning,
        troopRecovery: nextRecovery,
        completed: nextRecovery === null,
      },
    });
  }
}

/**
 * Write one amendment of an order the issuer already holds.
 *
 * Shared by `amend-order` and by `issue-order` when the pair already has an
 * open order. A major change (directive or target) returns the order to
 * pending and clears a plan that pointed at it. Priority or deadline alone
 * keeps the current acceptance.
 */
function emitOrderAmendment(
  world: WorldState,
  events: SimEvent[],
  commander: Character,
  recipient: Character,
  order: StandingOrder,
  amendment: {
    id: string;
    directive: StandingOrder["directive"];
    targetId?: string;
    priority: number;
    expiresTick: number | null;
    majorChange: boolean;
  },
): void {
  const amended: StandingOrder = {
    ...order,
    directive: amendment.directive,
    targetId: amendment.targetId,
    priority: amendment.priority,
    expiresTick: amendment.expiresTick,
    revision: order.revision + 1,
    status: amendment.majorChange ? "pending" : order.status,
    adherence: amendment.majorChange ? "unassessed" : order.adherence,
    statusChangedTick: amendment.majorChange ? world.tick : order.statusChangedTick,
    lastReport: {
      tick: world.tick,
      kind: "amended",
      summary: amendment.majorChange
        ? `${commander.name} materially revised the order; ${recipient.name} must reassess it.`
        : `${commander.name} adjusted the order's priority or deadline without changing its objective.`,
    },
  };
  emit(world, events, {
    type: "standing-order-amended",
    actorId: commander.id,
    targetId: recipient.id,
    data: {
      commandId: amendment.id,
      orderId: order.id,
      majorChange: amendment.majorChange,
      previousRevision: order.revision,
      order: amended,
      summary: amended.lastReport!.summary,
    },
  });
  emit(world, events, {
    type: "player-command-resolved",
    actorId: commander.id,
    targetId: recipient.id,
    data: { commandId: amendment.id, outcome: "order-amended", orderId: order.id, revision: amended.revision },
  });
}

function contractParties(world: WorldState, contract: SupplyContract): { buyer: Character; carrier: Character } | null {
  const buyer = world.characters[contract.buyerId];
  const carrier = world.characters[contract.carrierId];
  if (!buyer || !carrier) return null;
  return { buyer, carrier };
}

function carrierBlocked(world: WorldState, carrier: Character): boolean {
  return carrier.controller.kind !== "autonomous" ||
    Boolean(carrier.captivity) ||
    Boolean(carrier.travel) ||
    Object.values(world.activeBattles).some((battle) => battle.attackerId === carrier.id);
}

/**
 * Write one contract event. The escrow amount on the contract is the hold
 * after this event. Money on the two purses is absolute, the way a market
 * trade records `characterMoney`.
 */
function emitContract(
  world: WorldState,
  events: SimEvent[],
  type: string,
  contract: SupplyContract,
  buyerMoney: number,
  carrierMoney: number,
  actorId: string,
  extra: Record<string, unknown> = {},
): void {
  const carrier = world.characters[contract.carrierId];
  emit(world, events, {
    type,
    actorId,
    targetId: actorId === contract.buyerId ? contract.carrierId : contract.buyerId,
    settlementId: type === "contract-fulfilled" || type === "contract-breached" ? contract.destinationId : undefined,
    data: {
      contract: { ...contract },
      buyerId: contract.buyerId,
      carrierId: contract.carrierId,
      buyerMoney,
      carrierMoney,
      escrow: contract.escrow,
      price: contract.price,
      quantity: contract.quantity,
      destinationId: contract.destinationId,
      ...(type === "contract-fulfilled" && carrier
        ? {
            settlementStocks: extra.settlementStocks,
            carrierCargo: extra.carrierCargo,
          }
        : {}),
      ...Object.fromEntries(Object.entries(extra).filter(([key]) => key !== "settlementStocks" && key !== "carrierCargo")),
    },
  });
}

function writeContractRelationships(
  world: WorldState,
  events: SimEvent[],
  buyer: Character,
  carrier: Character,
  victory: boolean,
  trigger: string,
): void {
  const sides = [buyer, carrier].sort((left, right) => left.id.localeCompare(right.id));
  for (const from of sides) {
    const to = from.id === buyer.id ? carrier : buyer;
    emit(world, events, {
      type: "relationship-changed",
      actorId: from.id,
      targetId: to.id,
      data: {
        characterId: to.id,
        trigger,
        relationship: contractRelationship(from, to.id, world.tick, victory),
      },
    });
  }
}

/** Return the escrow to the buyer and close the contract. Does nothing if it already settled. */
function refundEscrow(
  world: WorldState,
  events: SimEvent[],
  contract: SupplyContract,
  status: "refused" | "breached" | "cancelled",
  type: string,
  actorId: string,
  extra: Record<string, unknown> = {},
): SupplyContract | null {
  if (contract.settled) return null;
  const parties = contractParties(world, contract);
  if (!parties) return null;
  const next: SupplyContract = {
    ...contract,
    status,
    escrow: 0,
    settled: true,
    observedTick: world.tick,
  };
  emitContract(
    world,
    events,
    type,
    next,
    round(parties.buyer.money + contract.escrow, 2),
    parties.carrier.money,
    actorId,
    extra,
  );
  return world.contracts?.[contract.id] ?? next;
}

function resolveContractCommand(
  world: WorldState,
  events: SimEvent[],
  commander: Character,
  command: Extract<PlayerCommand, { type: "offer-contract" | "cancel-contract" }>,
): void {
  if (command.type === "cancel-contract") {
    const contract = world.contracts?.[command.contractId];
    if (!contract || contract.buyerId !== commander.id || (contract.status !== "offered" && contract.status !== "accepted")) {
      emit(world, events, {
        type: "player-command-failed",
        actorId: commander.id,
        targetId: command.characterId,
        data: { commandId: command.id, reason: "the contract is no longer open" },
      });
      return;
    }
    const wasAccepted = contract.status === "accepted";
    refundEscrow(world, events, contract, "cancelled", "contract-cancelled", commander.id, { commandId: command.id });
    if (wasAccepted) {
      const parties = contractParties(world, contract);
      if (parties) writeContractRelationships(world, events, parties.buyer, parties.carrier, false, "supply contract cancelled");
    }
    emit(world, events, {
      type: "player-command-resolved",
      actorId: commander.id,
      targetId: command.characterId,
      data: { commandId: command.id, outcome: "contract-cancelled", contractId: contract.id },
    });
    return;
  }

  const carrier = world.characters[command.characterId];
  if (!carrier || carrierBlocked(world, carrier)) {
    emit(world, events, {
      type: "player-command-failed",
      actorId: commander.id,
      targetId: command.characterId,
      data: { commandId: command.id, reason: "the carrier is no longer available" },
    });
    return;
  }

  if (command.contractId) {
    const existing = world.contracts?.[command.contractId];
    if (!existing || existing.status !== "offered" || existing.buyerId !== commander.id || existing.settled) {
      emit(world, events, {
        type: "player-command-failed",
        actorId: commander.id,
        targetId: carrier.id,
        data: { commandId: command.id, reason: "the offer is no longer open" },
      });
      return;
    }
    const due = round(command.price - existing.escrow, 2);
    const contractSource: SpendSource = command.source === "purse" ? "purse" : "default";
    const raised = due > 0 ? resolveQuotedSpend(world, commander, due, PASSAGE_COST_PER_TICK, contractSource) : null;
    if (raised && !raised.ok) {
      emit(world, events, {
        type: "player-command-failed",
        actorId: commander.id,
        targetId: carrier.id,
        data: { commandId: command.id, reason: "the offerer can no longer cover the escrow" },
      });
      return;
    }
    const next: SupplyContract = {
      ...existing,
      quantity: command.quantity,
      destinationId: command.destinationId,
      price: command.price,
      escrow: command.price,
      deadlineTick: command.expiresTick,
      revision: existing.revision + 1,
      observedTick: world.tick,
    };
    emitContract(
      world,
      events,
      "contract-amended",
      next,
      raised && raised.ok ? raised.characterMoney : round(commander.money - due, 2),
      carrier.money,
      commander.id,
      { commandId: command.id, ...(raised && raised.ok ? { ...spendData(raised), characterMoney: raised.characterMoney } : {}) },
    );
    emit(world, events, {
      type: "player-command-resolved",
      actorId: commander.id,
      targetId: carrier.id,
      data: { commandId: command.id, outcome: "contract-amended", contractId: existing.id, revision: next.revision },
    });
    return;
  }

  const escrow = resolveQuotedSpend(world, commander, command.price, PASSAGE_COST_PER_TICK, command.source === "purse" ? "purse" : "default");
  if (!escrow.ok) {
    emit(world, events, {
      type: "player-command-failed",
      actorId: commander.id,
      targetId: carrier.id,
      data: { commandId: command.id, reason: "the offerer can no longer cover the escrow" },
    });
    return;
  }
  const contract: SupplyContract = {
    id: `${command.id}:contract`,
    buyerId: commander.id,
    carrierId: carrier.id,
    good: "provisions",
    quantity: command.quantity,
    destinationId: command.destinationId,
    price: command.price,
    escrow: command.price,
    settled: false,
    deadlineTick: command.expiresTick,
    issuedTick: world.tick,
    acceptedTick: null,
    status: "offered",
    revision: 1,
    observedTick: world.tick,
  };
  emitContract(
    world,
    events,
    "contract-offered",
    contract,
    escrow.characterMoney,
    carrier.money,
    commander.id,
    { commandId: command.id, ...spendData(escrow), characterMoney: escrow.characterMoney },
  );
  emit(world, events, {
    type: "player-command-resolved",
    actorId: commander.id,
    targetId: carrier.id,
    data: { commandId: command.id, outcome: "contract-offered", contractId: contract.id },
  });
}

/**
 * Score contracts that were already offered before this tick.
 *
 * A new offer, and only a new offer, waits. The player has to be able to see
 * `offered` and restate it. An amendment asked for a new score, so a revision
 * above 1 is judged on the tick it is written. Acceptance does not move the
 * escrow again.
 */
function resolveOfferedContracts(world: WorldState, events: SimEvent[]): void {
  const offered = Object.values(world.contracts ?? {})
    .filter((contract) =>
      contract.status === "offered" &&
      !contract.settled &&
      (contract.revision > 1 || contract.observedTick < world.tick)
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const contract of offered) {
    const parties = contractParties(world, contract);
    if (!parties) continue;
    const assessment = assessSupplyContract(world, parties.carrier, {
      buyerId: parties.buyer.id,
      quantity: contract.quantity,
      price: contract.price,
      destinationId: contract.destinationId,
      deadlineTick: contract.deadlineTick,
    });
    if (assessment.accepted) {
      const next: SupplyContract = {
        ...contract,
        status: "accepted",
        acceptedTick: world.tick,
        observedTick: world.tick,
      };
      emitContract(world, events, "contract-accepted", next, parties.buyer.money, parties.carrier.money, parties.carrier.id, {
        score: assessment.score,
        threshold: assessment.threshold,
        factors: assessment.factors,
        travelTicks: assessment.travelTicks,
        ticksLeft: assessment.ticksLeft,
        costBasis: assessment.costBasis,
      });
      continue;
    }
    refundEscrow(world, events, contract, "refused", "contract-refused", parties.carrier.id, {
      gate: assessment.gate,
      score: assessment.score,
      threshold: assessment.threshold,
      factors: assessment.factors,
      travelTicks: assessment.travelTicks,
      ticksLeft: assessment.ticksLeft,
      costBasis: assessment.costBasis,
      ...(assessment.reason ? { reason: assessment.reason } : {}),
    });
  }
}

/**
 * Pay a delivery that has landed, or return the escrow once the deadline has
 * passed. The deadline test is the one `expireStandingOrders` uses:
 * `world.tick >= deadlineTick`. A short hold does not count.
 */
function resolveContractOutcomes(world: WorldState, events: SimEvent[]): void {
  const accepted = Object.values(world.contracts ?? {})
    .filter((contract) => contract.status === "accepted" && !contract.settled)
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const contract of accepted) {
    const parties = contractParties(world, contract);
    if (!parties) continue;
    if (world.tick >= contract.deadlineTick) {
      refundEscrow(world, events, contract, "breached", "contract-breached", parties.carrier.id);
      const current = contractParties(world, contract);
      if (current) writeContractRelationships(world, events, current.buyer, current.carrier, false, "supply contract breached");
      continue;
    }
    const { carrier, buyer } = parties;
    const landed = carrier.locationId === contract.destinationId && !carrier.travel && carrier.cargo.provisions >= contract.quantity;
    if (!landed) continue;
    const cargo = cloneResources(carrier.cargo);
    cargo.provisions = round(cargo.provisions - contract.quantity);
    const stocks = cloneResources(world.settlements[contract.destinationId].stocks);
    stocks.provisions = round(stocks.provisions + contract.quantity);
    const next: SupplyContract = {
      ...contract,
      status: "fulfilled",
      escrow: 0,
      settled: true,
      observedTick: world.tick,
    };
    emitContract(
      world,
      events,
      "contract-fulfilled",
      next,
      buyer.money,
      round(carrier.money + contract.escrow, 2),
      carrier.id,
      { settlementStocks: stocks, carrierCargo: cargo },
    );
    const current = contractParties(world, contract);
    if (current) writeContractRelationships(world, events, current.buyer, current.carrier, true, "supply contract fulfilled");
  }
}

function processPlayerCommands(
  world: WorldState,
  events: SimEvent[],
  rng: DeterministicRng,
): void {
  for (const command of [...world.pendingCommands]) {
    const player = world.players[command.playerId];
    const commander = player ? world.characters[player.characterId] : undefined;
    if (!player || !commander) {
      emit(world, events, {
        type: "player-command-failed",
        data: { commandId: command.id, reason: "player or controlled character no longer exists" },
      });
      continue;
    }

    if (command.type === "escape-captivity") {
      if (!commander.captivity) {
        emit(world, events, {
          type: "player-command-failed",
          actorId: commander.id,
          data: { commandId: command.id, reason: "the character is no longer captive" },
        });
        continue;
      }
      emit(world, events, {
        type: "player-action-executed",
        actorId: commander.id,
        settlementId: commander.captivity.settlementId,
        data: { commandId: command.id, action: "escape-captivity" },
      });
      escapeCaptivity(world, commander, events, rng, command.id);
      emit(world, events, {
        type: "player-command-resolved",
        actorId: commander.id,
        data: { commandId: command.id, outcome: "captivity-escaped" },
      });
      continue;
    }

    // A captive already queued something else before the hold. Escape is the
    // only action that still runs. The refusal text is the one submit uses.
    if (commander.captivity) {
      emit(world, events, {
        type: "player-command-failed",
        actorId: commander.id,
        data: { commandId: command.id, reason: "Only an escape attempt is available while the character is captive" },
      });
      continue;
    }

    if (command.type === "retreat-battle") {
      const battle = world.activeBattles[command.battleId];
      if (!battle || battle.attackerId !== commander.id || battle.phase < 1 || battle.phase >= battle.totalPhases) {
        emit(world, events, {
          type: "player-command-failed",
          actorId: commander.id,
          data: { commandId: command.id, reason: "the retreat window is no longer available" },
        });
        continue;
      }
      emit(world, events, {
        type: "player-action-executed",
        actorId: commander.id,
        settlementId: battle.settlementId,
        data: { commandId: command.id, action: "retreat", battleId: battle.id },
      });
      const outcome = retreatFromBattle(world, battle, events, rng, command.id);
      emit(world, events, {
        type: "player-command-resolved",
        actorId: commander.id,
        settlementId: battle.settlementId,
        data: {
          commandId: command.id,
          outcome: outcome === "captured" ? "character-captured" : "battle-retreated",
          battleId: battle.id,
        },
      });
      continue;
    }

    if (command.type === "amend-order") {
      const recipient = world.characters[command.characterId];
      const order = recipient?.standingOrders.find((candidate) => candidate.id === command.orderId);
      if (
        !recipient ||
        !order ||
        order.issuerId !== commander.id ||
        // Awaiting confirmation is the pair's open order. Explicit amend-order
        // and a further issue-order both accept it: a major change returns it
        // to pending, and priority or deadline alone keeps this state.
        (order.status !== "pending" && order.status !== "active" && order.status !== "awaiting-confirmation")
      ) {
        emit(world, events, {
          type: "player-command-failed",
          actorId: commander.id,
          targetId: command.characterId,
          data: { commandId: command.id, reason: "the order is no longer available for amendment" },
        });
        continue;
      }
      emitOrderAmendment(world, events, commander, recipient, order, command);
      continue;
    }

    if (command.type === "cancel-order") {
      const recipient = world.characters[command.characterId];
      const order = recipient?.standingOrders.find((candidate) => candidate.id === command.orderId);
      if (
        !recipient ||
        !order ||
        order.issuerId !== commander.id ||
        !new Set(["pending", "active", "awaiting-confirmation"]).has(order.status)
      ) {
        emit(world, events, {
          type: "player-command-failed",
          actorId: commander.id,
          targetId: command.characterId,
          data: { commandId: command.id, reason: "the order is no longer available for cancellation" },
        });
        continue;
      }
      emit(world, events, {
        type: "standing-order-cancelled",
        actorId: commander.id,
        targetId: recipient.id,
        data: {
          commandId: command.id,
          orderId: order.id,
          summary: `${commander.name} cancelled ${recipient.name}'s ${order.directive.replaceAll("-", " ")} order.`,
        },
      });
      emit(world, events, {
        type: "player-command-resolved",
        actorId: commander.id,
        targetId: recipient.id,
        data: { commandId: command.id, outcome: "order-cancelled", orderId: order.id },
      });
      continue;
    }

    if (command.type === "confirm-order") {
      const recipient = world.characters[command.characterId];
      const order = recipient?.standingOrders.find((candidate) => candidate.id === command.orderId);
      if (!recipient || !order || order.issuerId !== commander.id || order.status !== "awaiting-confirmation") {
        emit(world, events, {
          type: "player-command-failed",
          actorId: commander.id,
          targetId: command.characterId,
          data: { commandId: command.id, reason: "the completion report is no longer awaiting this issuer" },
        });
        continue;
      }
      emit(world, events, {
        type: "standing-order-completed",
        actorId: commander.id,
        targetId: recipient.id,
        data: {
          commandId: command.id,
          orderId: order.id,
          summary: `${commander.name} confirmed ${recipient.name}'s completion report.`,
        },
      });
      emit(world, events, {
        type: "player-command-resolved",
        actorId: commander.id,
        targetId: recipient.id,
        data: { commandId: command.id, outcome: "order-completion-confirmed", orderId: order.id },
      });
      continue;
    }

    if (command.type === "issue-order") {
      const recipient = world.characters[command.characterId];
      if (!recipient || recipient.controller.kind !== "autonomous") {
        emit(world, events, {
          type: "player-command-failed",
          actorId: commander.id,
          targetId: command.characterId,
          data: { commandId: command.id, reason: "order recipient is no longer available" },
        });
        continue;
      }
      // Do not mint `${command.id}:standing-order` while this issuer already
      // has an open order with the recipient. Submit rewrites that issue into
      // amend-order; this is the same rule if an issue-order is still queued.
      const open = openStandingOrder(recipient, commander.id);
      if (open) {
        const majorChange = command.directive !== open.directive || command.targetId !== open.targetId;
        if (!majorChange && command.priority === open.priority && command.expiresTick === open.expiresTick) {
          emit(world, events, {
            type: "player-command-failed",
            actorId: commander.id,
            targetId: recipient.id,
            data: { commandId: command.id, reason: "the amendment does not change the order" },
          });
          continue;
        }
        emitOrderAmendment(world, events, commander, recipient, open, {
          id: command.id,
          directive: command.directive,
          targetId: command.targetId,
          priority: command.priority,
          expiresTick: command.expiresTick,
          majorChange,
        });
        continue;
      }
      const order: StandingOrder = {
        id: `${command.id}:standing-order`,
        issuerId: commander.id,
        directive: command.directive,
        targetId: command.targetId,
        priority: command.priority,
        issuedTick: world.tick,
        expiresTick: command.expiresTick,
        revision: 1,
        status: "pending",
        adherence: "unassessed",
        statusChangedTick: world.tick,
        deviationCount: 0,
        lastReport: null,
      };
      emit(world, events, {
        type: "standing-order-issued",
        actorId: commander.id,
        targetId: recipient.id,
        data: { commandId: command.id, order },
      });
      emit(world, events, {
        type: "player-command-resolved",
        actorId: commander.id,
        targetId: recipient.id,
        data: { commandId: command.id, outcome: "order-delivered", orderId: order.id },
      });
      continue;
    }

    if (command.type === "offer-contract" || command.type === "cancel-contract") {
      resolveContractCommand(world, events, commander, command);
      continue;
    }

    if (commander.travel || !commander.locationId) {
      emit(world, events, {
        type: "player-command-failed",
        actorId: commander.id,
        data: { commandId: command.id, reason: "controlled character cannot act while traveling" },
      });
      continue;
    }
    if (command.action === "claim-settlement") {
      const settlement = world.settlements[commander.locationId];
      const hostile = settlement.factionId !== null && settlement.factionId !== commander.factionId;
      if (!hostile || !settlementClaimAvailableTo(settlement, commander.id)) {
        emit(world, events, {
          type: "player-command-failed",
          actorId: commander.id,
          settlementId: settlement.id,
          data: { commandId: command.id, reason: "the settlement is no longer offering surrender" },
        });
        continue;
      }
    }
    if (command.action === "decline-surrender") {
      const settlement = world.settlements[commander.locationId];
      const hostile = settlement.factionId !== null && settlement.factionId !== commander.factionId;
      if (!hostile || !settlementClaimAvailableTo(settlement, commander.id)) {
        emit(world, events, {
          type: "player-command-failed",
          actorId: commander.id,
          settlementId: settlement.id,
          data: { commandId: command.id, reason: "the settlement is no longer offering surrender" },
        });
        continue;
      }
      // Declining ends the offer outright rather than letting it sit unanswered.
      // The victor keeps the ground contested and must fight again to win it.
      emit(world, events, {
        type: "settlement-surrender-declined",
        actorId: commander.id,
        settlementId: settlement.id,
        targetId: settlement.surrender?.previousFactionId ?? undefined,
        data: {
          commandId: command.id,
          previousFactionId: settlement.surrender?.previousFactionId ?? null,
        },
      });
      emit(world, events, {
        type: "player-command-resolved",
        actorId: commander.id,
        settlementId: settlement.id,
        data: { commandId: command.id, outcome: "surrender-declined", action: "decline-surrender" },
      });
      continue;
    }
    const chosen: DecisionCandidate = {
      action: command.action,
      targetId: command.targetId,
      // The two trading verbs carry what to move, how much of it, and the price
      // it was accepted at. The planner never sets these; they exist only because
      // a player chose them explicitly.
      ...(command.type === "character-action" && command.resource !== undefined
        ? { resource: command.resource, quantity: command.quantity, unitPrice: command.unitPrice }
        : {}),
      ...(command.type === "character-action" && command.source === "purse" ? { spendSource: "purse" as const } : {}),
      score: 1,
      reason: "direct human instruction",
    };
    emit(world, events, {
      type: "player-action-executed",
      actorId: commander.id,
      targetId: command.targetId,
      settlementId: commander.locationId,
      data: { commandId: command.id, action: command.action },
    });
    const resolvedFrom = events.length;
    resolveDecision(world, commander, chosen, events, rng);
    const paid = command.action === "buy-provisions"
      ? events.slice(resolvedFrom).find((event) => event.type === "market-trade" && event.actorId === commander.id)
      : undefined;
    emit(world, events, {
      type: "player-command-resolved",
      actorId: commander.id,
      targetId: command.targetId,
      data: {
        commandId: command.id,
        outcome: "action-executed",
        action: command.action,
        ...(paid
          ? { quantity: paid.data.quantity, unitPrice: paid.data.unitPrice, gross: paid.data.gross }
          : {}),
      },
    });
  }
}

function expireStandingOrders(world: WorldState, events: SimEvent[]): void {
  for (const character of Object.values(world.characters).sort((left, right) => left.id.localeCompare(right.id))) {
    for (const order of character.standingOrders) {
      if (
        (order.status === "pending" || order.status === "active") &&
        order.expiresTick !== null &&
        world.tick >= order.expiresTick
      ) {
        emit(world, events, {
          type: "standing-order-expired",
          actorId: order.issuerId,
          targetId: character.id,
          data: {
            orderId: order.id,
            summary: `${order.directive.replaceAll("-", " ")} orders expired before completion was reported.`,
          },
        });
      }
    }
  }
}

/**
 * Close a completion report the issuer has not signed.
 *
 * Runs after `expireStandingOrders`, which is after `processPlayerCommands`,
 * so a confirm or a cancel queued for this tick still wins. No new RNG draw.
 *
 * A free autonomous issuer signs on the next tick. Anyone who cannot submit
 * — an idle human, a captive issuer, a missing issuer — waits one day.
 * A pressure order does not write the relationship: the victory that filed
 * the report already did.
 *
 * `issuer-judgment` and a player's `confirm-order` leave `lastReport.kind`
 * as `confirmed`. `issuer-silent` is applied as `closed-unanswered`.
 */
function confirmUnansweredOrders(world: WorldState, events: SimEvent[]): void {
  for (const holder of Object.values(world.characters).sort((left, right) => left.id.localeCompare(right.id))) {
    for (const order of holder.standingOrders) {
      if (order.status !== "awaiting-confirmation") continue;
      const waited = world.tick - order.statusChangedTick;
      if (waited < 1) continue;
      const issuer = world.characters[order.issuerId];
      const judges = issuer !== undefined && issuer.controller.kind === "autonomous" && issuer.captivity === null;
      if (!judges && waited < world.ticksPerDay) continue;
      const issuerName = issuer?.name ?? order.issuerId;
      const reason = judges ? "issuer-judgment" : "issuer-silent";
      const summary = judges
        ? `${issuerName} confirmed ${holder.name}'s completion report.`
        : `${issuerName} did not answer ${holder.name}'s completion report within a day, and the order closed.`;
      emit(world, events, {
        type: "standing-order-completed",
        actorId: order.issuerId,
        targetId: holder.id,
        data: { orderId: order.id, reason, summary },
      });
      if (order.directive === "pressure") continue;
      const prior = holder.relationships[order.issuerId] ?? {
        characterId: order.issuerId,
        trust: 0.28,
        affinity: 0.25,
        respect: 0.28,
        fear: 0.08,
        grievance: 0,
        obligation: 0,
        lastChangedTick: world.tick,
      };
      const relationship = {
        ...prior,
        trust: round(clamp(prior.trust + 0.012, 0, 1)),
        respect: round(clamp(prior.respect + 0.028, 0, 1)),
        fear: round(clamp(prior.fear - 0.005, 0, 1)),
        grievance: round(clamp(prior.grievance - 0.006, 0, 1)),
        obligation: round(clamp(prior.obligation - 0.01, 0, 1)),
        lastChangedTick: world.tick,
      };
      emit(world, events, {
        type: "relationship-changed",
        actorId: holder.id,
        targetId: order.issuerId,
        data: {
          characterId: order.issuerId,
          trigger: "order confirmed",
          relationship,
        },
      });
    }
  }
}

function recordOrderAssessment(
  world: WorldState,
  character: Character,
  events: SimEvent[],
  assessment: NonNullable<ReturnType<typeof reviewPlan>>["orderAssessment"],
): void {
  if (!assessment) return;
  const order = character.standingOrders.find((candidate) => candidate.id === assessment.orderId);
  if (!order || order.status !== "pending") return;
  const accepted = assessment.willComply;
  emit(world, events, {
    type: accepted ? "standing-order-accepted" : "standing-order-refused",
    actorId: character.id,
    targetId: character.id,
    data: {
      orderId: order.id,
      issuerId: order.issuerId,
      obedience: assessment.obedience,
      threshold: assessment.threshold,
      factors: assessment.factors,
      summary: accepted
        ? `${character.name} accepted the ${order.directive.replaceAll("-", " ")} order.`
        : `${character.name} refused the ${order.directive.replaceAll("-", " ")} order after weighing loyalty, risk, and ambition.`,
    },
  });
}

function updateOrderAdherence(
  world: WorldState,
  character: Character,
  chosen: DecisionCandidate,
  events: SimEvent[],
): StandingOrder | null {
  const order = activeStandingOrder(character, world.tick);
  if (!order || order.status !== "active") return null;
  const assessment = assessOrderAction(world, character, order, chosen.action, chosen.targetId);
  if (!assessment.aligned && order.adherence !== "deviating") {
    emit(world, events, {
      type: "standing-order-deviated",
      actorId: character.id,
      targetId: character.id,
      data: { orderId: order.id, issuerId: order.issuerId, action: chosen.action, summary: assessment.summary },
    });
  } else if (assessment.aligned && order.adherence === "deviating") {
    emit(world, events, {
      type: "standing-order-resumed",
      actorId: character.id,
      targetId: character.id,
      data: { orderId: order.id, issuerId: order.issuerId, action: chosen.action, summary: assessment.summary },
    });
  }
  return order;
}

function resolveDecision(
  world: WorldState,
  character: Character,
  chosen: DecisionCandidate,
  events: SimEvent[],
  rng: DeterministicRng,
): void {
  const settlementId = character.locationId!;
  const settlement = world.settlements[settlementId];
  const source: SpendSource = chosen.spendSource === "purse" ? "purse" : "default";

  switch (chosen.action) {
    case "travel": {
      // Affordability is `quotedPassage`, applied when the voyage is chosen:
      // the player command refuses a short purse, and `buildCandidates` scores
      // an unaffordable autonomous voyage at -1000. A voyage that has already
      // started is not sent back. Each sea tick still charges what the purse
      // can pay, down to zero.
      const destinationId = chosen.targetId!;
      const totalTicks = travelDuration(world, character, destinationId);
      emit(world, events, {
        type: "travel-started",
        actorId: character.id,
        targetId: destinationId,
        data: {
          travel: {
            fromId: settlementId,
            toId: destinationId,
            totalTicks,
            remainingTicks: totalTicks,
            ...(source === "purse" ? { source: "purse" as const } : {}),
          },
          reason: chosen.reason,
        },
      });
      break;
    }
    case "buy-resource":
    case "sell-resource": {
      // The quantity and the price are the player's, both checked against stock,
      // money, the hold and the provisions reserve when the order was accepted.
      // The price is charged as quoted rather than re-read here, because a tick of
      // autonomous trading can move a board in between, and an order accepted at
      // one price must not quietly fill at another.
      const direction = chosen.action === "buy-resource" ? "buy" : "sell";
      const resource = chosen.resource ?? "provisions";
      const quoted = tradeQuote(world, character, resource, direction, chosen.quantity ?? 0);
      const unitPrice = chosen.unitPrice ?? quoted.unitPrice;
      // What the board, the hold, the purse and the reserve can still support. A
      // board another trader has drained since acceptance shrinks the fill, and
      // the event records what actually moved rather than claiming the request.
      const affordable = unitPrice > 0 ? spendableAmount(world, character, PASSAGE_COST_PER_TICK, source) / unitPrice : 0;
      const spare = Math.max(0, cargoCapacity(character) - cargoLoad(character));
      const depth = marketDepth(settlement, resource);
      const limit = direction === "buy"
        ? Math.min(settlement.stocks[resource], spare, affordable, depth)
        : Math.min(tradableUnits(character, resource), depth);
      const quantity = round(Math.max(0, Math.min(chosen.quantity ?? 0, limit)), 3);
      if (quantity <= 0) break;
      const taxRate = settlement.factionId ? world.factions[settlement.factionId].taxRate : 0;
      const { gross, tax, net } = tradeAmounts(quantity, unitPrice, taxRate, direction);
      const characterCargo = cloneResources(character.cargo);
      const settlementStocks = cloneResources(settlement.stocks);
      characterCargo[resource] = round(characterCargo[resource] + (direction === "buy" ? quantity : -quantity));
      settlementStocks[resource] = round(settlementStocks[resource] - (direction === "buy" ? quantity : -quantity));
      const purchase = direction === "buy"
        ? resolveQuotedSpend(world, character, gross, PASSAGE_COST_PER_TICK, source)
        : null;
      if (purchase && !purchase.ok) break;
      const factionTreasury = direction === "sell" && settlement.factionId
        ? round(world.factions[settlement.factionId].treasury + tax, 2)
        : settlement.factionId ? world.factions[settlement.factionId].treasury : 0;
      emit(world, events, {
        type: "market-trade",
        actorId: character.id,
        settlementId,
        data: {
          direction: direction === "buy" ? "bought" : "sold",
          resource,
          quantity,
          unitPrice,
          gross,
          tax,
          characterMoney: purchase && purchase.ok
            ? purchase.characterMoney
            : round(character.money + net, 2),
          characterCargo,
          settlementStocks,
          ...(direction === "sell"
            ? { factionTreasury }
            : purchase && purchase.ok
              ? spendData(purchase)
              : {}),
        },
      });
      break;
    }
    case "buy-provisions": {
      // A player order arrives with the price and quantity quoted at acceptance.
      // Autonomous captains do not: their fill stays the uncapped top-up, and
      // this branch must keep that formula. Capping it moves the fixture hashes.
      if (typeof chosen.unitPrice !== "number") {
        const price = marketPrice(world, settlementId, "provisions");
        const desired = Math.max(0, provisionResupplyTarget(character) - character.cargo.provisions);
        const spendable = spendableAmount(world, character, PASSAGE_COST_PER_TICK);
        const quantity = round(Math.min(desired, settlement.stocks.provisions, price > 0 ? spendable / price : 0));
        if (quantity > 0) {
          const gross = round(quantity * price, 2);
          const spent = resolveQuotedSpend(world, character, gross, PASSAGE_COST_PER_TICK);
          if (!spent.ok) break;
          const characterCargo = cloneResources(character.cargo);
          const settlementStocks = cloneResources(settlement.stocks);
          characterCargo.provisions = round(characterCargo.provisions + quantity);
          settlementStocks.provisions = round(settlementStocks.provisions - quantity);
          emit(world, events, {
            type: "market-trade",
            actorId: character.id,
            settlementId,
            data: {
              direction: "bought",
              resource: "provisions",
              quantity,
              unitPrice: price,
              gross,
              tax: 0,
              characterMoney: spent.characterMoney,
              characterCargo,
              settlementStocks,
              ...spendData(spent),
            },
          });
        }
        break;
      }
      const price = chosen.unitPrice;
      const depth = marketDepth(settlement, "provisions");
      const affordable = price > 0 ? spendableAmount(world, character, PASSAGE_COST_PER_TICK, source) / price : 0;
      const quantity = round(Math.max(0, Math.min(chosen.quantity ?? 0, settlement.stocks.provisions, affordable, depth)));
      if (quantity > 0) {
        const gross = round(quantity * price, 2);
        const spent = resolveQuotedSpend(world, character, gross, PASSAGE_COST_PER_TICK, source);
        if (!spent.ok) break;
        const characterCargo = cloneResources(character.cargo);
        const settlementStocks = cloneResources(settlement.stocks);
        characterCargo.provisions = round(characterCargo.provisions + quantity);
        settlementStocks.provisions = round(settlementStocks.provisions - quantity);
        emit(world, events, {
          type: "market-trade",
          actorId: character.id,
          settlementId,
          data: {
            direction: "bought",
            resource: "provisions",
            quantity,
            unitPrice: price,
            gross,
            tax: 0,
            characterMoney: spent.characterMoney,
            characterCargo,
            settlementStocks,
            ...spendData(spent),
          },
        });
      }
      break;
    }
    case "trade-local":
      resolveTrade(world, character, events, chosen.resource);
      break;
    case "work": {
      const gross = workGross(character);
      const taxation = tradeTax(world, settlementId, gross);
      emit(world, events, {
        type: "worked",
        actorId: character.id,
        settlementId,
        data: {
          gross,
          tax: taxation.tax,
          characterMoney: round(character.money + gross - taxation.tax, 2),
          factionTreasury: taxation.treasury,
          morale: round(clamp(character.morale - 0.35, 0, 100)),
        },
      });
      break;
    }
    case "recruit": {
      const spendable = spendableAmount(world, character, PASSAGE_COST_PER_TICK, source);
      const quantity = Math.max(1, Math.min(8, Math.floor(spendable / 12), Math.floor(settlement.stocks.arms / 0.35)));
      const cost = quantity * 12;
      const spent = resolveQuotedSpend(world, character, cost, PASSAGE_COST_PER_TICK, source);
      if (!spent.ok) break;
      const settlementStocks = cloneResources(settlement.stocks);
      settlementStocks.arms = round(settlementStocks.arms - quantity * 0.35);
      emit(world, events, {
        type: "recruited",
        actorId: character.id,
        settlementId,
        data: {
          quantity,
          cost,
          characterMoney: spent.characterMoney,
          troopCount: character.troops.count + quantity,
          settlementStocks,
          ...spendData(spent),
        },
      });
      break;
    }
    case "raid":
      resolveBattle(world, character, events, rng);
      break;
    case "claim-settlement":
      resolveSettlementClaim(world, character, events);
      break;
    case "rest": {
      const cargo = cloneResources(character.cargo);
      const medicineUsed = Math.min(cargo.medicine, character.health < 70 ? 0.5 : 0);
      cargo.medicine = round(cargo.medicine - medicineUsed);
      emit(world, events, {
        type: "rested",
        actorId: character.id,
        settlementId,
        data: {
          medicineUsed,
          cargo,
          health: round(clamp(character.health + 4 + medicineUsed * 8, 1, 100)),
          morale: round(clamp(character.morale + 3, 0, 100)),
        },
      });
      break;
    }
    case "survey": {
      // The action slot is the cost. Passive presence still refreshes garrison,
      // stocks and prices without recording the ground; only this verb does.
      // The same action records who is anchored here. A party underway, and a
      // party in another port, are left out. The commander is not a sighting
      // of herself.
      const observed = directObservation(world, character);
      if (!observed) break;
      const surveyed: SettlementKnowledge = {
        ...observed,
        ground: {
          population: settlement.population,
          fortification: settlement.fortification,
          observedTick: world.tick,
          source: "direct",
        },
      };
      emit(world, events, {
        type: "knowledge-updated",
        actorId: character.id,
        settlementId,
        data: {
          settlementId,
          knowledge: retainGround(character.knowledge[settlementId], surveyed),
          reason: "survey",
          partySightings: partySightingsAt(world, settlementId, character.id, "direct"),
        },
      });
      break;
    }
  }
}

/**
 * Hand an officer's completed, targeted survey to the issuer.
 *
 * The officer is standing on the target, so the record is what they see this
 * tick, dated to the report. It is written onto the issuer, not the officer:
 * the faction tier already hides the officer's map. An explore order with no
 * target never calls this.
 */
function deliverTargetedExploreReport(
  world: WorldState,
  officer: Character,
  order: StandingOrder,
  events: SimEvent[],
): void {
  const targetId = order.targetId;
  if (!targetId || order.directive !== "explore" || officer.locationId !== targetId) return;
  const settlement = world.settlements[targetId];
  const issuer = world.characters[order.issuerId];
  const observed = directObservation(world, officer);
  if (!observed || observed.settlementId !== targetId || !issuer) return;
  // Issued and completed on this tick: the officer was already standing there.
  // Travel takes at least two ticks, so this is not a voyage that finished early.
  const alreadyPresent = order.issuedTick === world.tick;
  const reported: SettlementKnowledge = {
    settlementId: targetId,
    observedTick: world.tick,
    confidence: observed.confidence,
    factionId: observed.factionId,
    garrisonEstimate: observed.garrisonEstimate,
    stocksEstimate: { ...observed.stocksEstimate },
    priceEstimate: { ...observed.priceEstimate },
    source: "faction-report",
    ground: {
      population: settlement.population,
      fortification: settlement.fortification,
      observedTick: world.tick,
      source: "faction-report",
    },
  };
  emit(world, events, {
    type: "knowledge-updated",
    actorId: order.issuerId,
    settlementId: targetId,
    data: {
      settlementId: targetId,
      knowledge: retainGround(issuer.knowledge[targetId], reported),
      reason: "explore-report",
      // The officer's own map does not gain the list. The issuer receives who
      // was anchored, other than the officer, at the report tick.
      partySightings: partySightingsAt(world, targetId, officer.id, "faction-report"),
      ...(alreadyPresent ? { alreadyPresent: true } : {}),
    },
  });
}

/**
 * Parties anchored in a port, other than the person looking.
 *
 * A captive is included, at the troop count they have. Captivity itself is not
 * copied. `partyPower()` is taken now and stored; a later skill change must not
 * rewrite it. The key stays absent when this list is empty.
 */
function partySightingsAt(
  world: WorldState,
  settlementId: string,
  observerId: string,
  source: PartySighting["source"],
): PartySighting[] {
  return Object.values(world.characters)
    .filter((candidate) =>
      candidate.id !== observerId &&
      candidate.locationId === settlementId &&
      candidate.travel === null
    )
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((candidate) => ({
      characterId: candidate.id,
      locationId: settlementId,
      travel: null,
      troops: candidate.troops.count,
      partyPower: partyPower(candidate),
      observedTick: world.tick,
      source,
      confidence: 1 as const,
    }));
}

function progressTravel(world: WorldState, character: Character, events: SimEvent[]): void {
  const travel = character.travel!;
  const remainingTicks = Math.max(0, travel.remainingTicks - 1);
  emit(world, events, {
    type: "travel-progressed",
    actorId: character.id,
    targetId: travel.toId,
    data: {
      remainingTicks,
      cargo: cloneResources(character.cargo),
      health: character.health,
      morale: character.morale,
      troopCount: character.troops.count,
    },
  });
  if (remainingTicks === 0) {
    emit(world, events, {
      type: "arrived",
      actorId: character.id,
      settlementId: travel.toId,
      data: { locationId: travel.toId, fromId: travel.fromId },
    });
    const knowledge = directObservation(world, character);
    if (knowledge) {
      emit(world, events, {
        type: "knowledge-updated",
        actorId: character.id,
        settlementId: knowledge.settlementId,
        data: {
          settlementId: knowledge.settlementId,
          knowledge,
          reason: "arrival observation",
        },
      });
    }
  }
}

function metrics(world: WorldState): Record<string, unknown> {
  const factionMetrics = Object.fromEntries(
    Object.values(world.factions).map((faction) => [
      faction.id,
      {
        name: faction.name,
        power: factionPower(world, faction.id),
        treasury: round(faction.treasury, 2),
        settlements: Object.values(world.settlements).filter((settlement) => settlement.factionId === faction.id).length,
      },
    ]),
  );
  const totalStocks = Object.fromEntries(
    RESOURCE_KEYS.map((resource) => [
      resource,
      round(Object.values(world.settlements).reduce((sum, settlement) => sum + settlement.stocks[resource], 0)),
    ]),
  );
  return { day: round(world.tick / world.ticksPerDay, 2), factions: factionMetrics, totalStocks };
}

export function runTick(world: WorldState): TickResult {
  const rng = new DeterministicRng(world.rngState);
  const events: SimEvent[] = [];

  produceSettlements(world, events);
  processPlayerCommands(world, events, rng);
  resolveOfferedContracts(world, events);
  resolveContractOutcomes(world, events);
  processCaptivityDeadlines(world, events, rng);
  progressTroopRecoveries(world, events);
  const battleParticipants = progressActiveBattles(world, events, rng);
  expireStandingOrders(world, events);
  confirmUnansweredOrders(world, events);

  for (const character of Object.values(world.characters).sort((a, b) => a.id.localeCompare(b.id))) {
    const inActiveBattle = Object.values(world.activeBattles).some((battle) => battle.attackerId === character.id);
    if (battleParticipants.has(character.id) || inActiveBattle) continue;
    if (character.captivity) continue;
    upkeepCharacter(world, character, events, Boolean(character.travel));
    if (needsObservation(world, character)) {
      const knowledge = directObservation(world, character);
      if (knowledge) {
        emit(world, events, {
          type: "knowledge-updated",
          actorId: character.id,
          settlementId: knowledge.settlementId,
          data: {
            settlementId: knowledge.settlementId,
            knowledge,
            reason: "direct local observation",
          },
        });
      }
    }
    if (character.controller.kind === "human") {
      if (character.travel) progressTravel(world, character, events);
      continue;
    }
    const planReview = reviewPlan(world, character, rng);
    if (planReview) {
      emit(world, events, {
        type: "plan-reconsidered",
        actorId: character.id,
        targetId: planReview.plan.targetId,
        data: planReview as unknown as Record<string, unknown>,
      });
      recordOrderAssessment(world, character, events, planReview.orderAssessment);
    }
    if (character.travel) {
      progressTravel(world, character, events);
      continue;
    }
    const candidates = buildCandidates(world, character, rng);
    const chosen = candidates[0];
    if (!chosen) continue;
    emit(world, events, {
      type: "decision-made",
      actorId: character.id,
      settlementId: character.locationId ?? undefined,
      targetId: chosen.targetId,
      data: {
        archetype: character.archetype,
        goal: chosen.action,
        activeLongTermGoalId: character.activeGoalId,
        planId: character.plan?.id,
        planIntent: character.plan?.intent,
        orderId: character.plan?.orderId,
        targetKnowledge: chosen.targetId ? character.knowledge[chosen.targetId] : undefined,
        chosen,
        candidates: candidates.slice(0, 6),
      },
    });
    const order = updateOrderAdherence(world, character, chosen, events);
    resolveDecision(world, character, chosen, events, rng);
    progressActiveGoal(world, character, chosen.action, events);
    if (order) {
      const judgment = judgeOrderCompletion(world, character, order, chosen.action, events, rng);
      if (judgment) {
        emit(world, events, {
          type: "standing-order-completion-reported",
          actorId: character.id,
          targetId: character.id,
          data: {
            orderId: order.id,
            issuerId: order.issuerId,
            score: judgment.score,
            threshold: judgment.threshold,
            summary: judgment.summary,
          },
        });
        if (order.directive === "explore" && order.targetId) {
          deliverTargetedExploreReport(world, character, order, events);
        }
      }
    }
    evolveLocalRelationship(world, character, events, rng);
  }

  emit(world, events, { type: "metrics-recorded", data: metrics(world) });
  emit(world, events, {
    type: "tick-advanced",
    data: { nextTick: world.tick + 1, rngState: rng.state },
  });
  return { state: world, events };
}

export function runTicks(world: WorldState, count: number): { state: WorldState; events: SimEvent[] } {
  const events: SimEvent[] = [];
  for (let index = 0; index < count; index += 1) {
    events.push(...runTick(world).events);
  }
  return { state: world, events };
}
