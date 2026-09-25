import { DeterministicRng } from "./rng.ts";
import {
  autonomousShouldRetreat,
  battleRisk,
  combatForecast,
  isMajorBattle,
  projectedBattleRisk,
  selectRetreatDestination,
  settlementDefensePower,
} from "./combat.ts";
import {
  activeStandingOrder,
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
import {
  applyEvent,
  CLAIM_STABILITY_FLOOR,
  clamp,
  distanceBetween,
  factionPower,
  marketPrice,
  partyPower,
  round,
  settlementClaimAvailableTo,
  SURRENDER_GARRISON_THRESHOLD,
  SURRENDER_STABILITY_THRESHOLD,
} from "./state.ts";
import {
  RESOURCE_KEYS,
  type ActiveBattle,
  type BattlePhaseReport,
  type Character,
  type DecisionCandidate,
  type EventDraft,
  type ResourceKey,
  type Resources,
  type SimEvent,
  type StandingOrder,
  type TickResult,
  type WorldState,
} from "./types.ts";

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

function produceSettlements(world: WorldState, events: SimEvent[]): void {
  for (const settlement of Object.values(world.settlements).sort((a, b) => a.id.localeCompare(b.id))) {
    if (Object.values(world.activeBattles).some((battle) => battle.settlementId === settlement.id)) continue;
    const stocks = cloneResources(settlement.stocks);
    for (const resource of RESOURCE_KEYS) {
      const focusMultiplier = settlement.focus === resource ? 1.25 : 1;
      const workerCondition = 0.7 + (settlement.stability / 100) * 0.3;
      stocks[resource] = round(stocks[resource] + settlement.production[resource] * focusMultiplier * workerCondition);
    }
    emit(world, events, {
      type: "settlement-produced",
      settlementId: settlement.id,
      data: { focus: settlement.focus, stocks },
    });

    const afterConsumption = cloneResources(stocks);
    const demand = round(settlement.population / 3_600, 3);
    const consumed = Math.min(afterConsumption.provisions, demand);
    afterConsumption.provisions = round(afterConsumption.provisions - consumed);
    const shortage = round(demand - consumed);
    const stability = clamp(settlement.stability - shortage * 0.35 + (shortage === 0 ? 0.03 : 0), 0, 100);
    const garrisonLoss = shortage > 0 ? Math.min(settlement.garrison, Math.floor(shortage * 0.18)) : 0;
    emit(world, events, {
      type: shortage > 0 ? "settlement-shortage" : "settlement-upkeep",
      settlementId: settlement.id,
      data: {
        demand,
        consumed,
        shortage,
        stocks: afterConsumption,
        stability: round(stability),
        garrison: settlement.garrison - garrisonLoss,
        garrisonLoss,
      },
    });
  }
}

function upkeepCharacter(
  world: WorldState,
  character: Character,
  events: SimEvent[],
  traveling: boolean,
): void {
  const cargo = cloneResources(character.cargo);
  // One tick is four world-hours. Consumption therefore represents one sixth
  // of a party's daily needs rather than a full daily ration.
  const demand = round(0.12 + character.sailors * 0.008 + character.troops.count * 0.004);
  const consumed = Math.min(cargo.provisions, demand);
  cargo.provisions = round(cargo.provisions - consumed);
  const shortage = round(demand - consumed);
  const troopLoss = shortage > 0 ? Math.min(character.troops.count, Math.floor(shortage * 0.5)) : 0;
  const morale = clamp(character.morale - shortage * 2.4 - (traveling ? 0.03 : 0) + (shortage === 0 ? 0.04 : 0), 0, 100);
  const health = clamp(character.health - shortage * 0.8, 1, 100);

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
    },
  });
}

function travelDuration(world: WorldState, character: Character, destinationId: string): number {
  if (!character.locationId) return 1;
  const distance = distanceBetween(world, character.locationId, destinationId);
  const navigationMultiplier = 1 - character.skills.navigation / 220;
  return Math.max(2, Math.ceil((distance / 11) * navigationMultiplier));
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
  if (
    hostileTerritory &&
    character.factionId !== null &&
    character.troops.count >= 25 &&
    settlement.garrison >= 15 &&
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
    if (candidate.action === "buy-provisions" && (settlement.stocks.provisions < 1 || character.money < 2)) {
      candidate.score = -1_000;
    }
    if (candidate.action === "recruit" && (character.money < 30 || settlement.stocks.arms < 2)) {
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

  if (carried && tradableAmount(character, resource) >= 2) {
    quantity = round(Math.min(tradableAmount(character, resource), 16 + character.skills.trade / 7));
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
    quantity = round(Math.min(20 + character.skills.trade / 8, capacity - load, settlement.stocks[resource] * 0.16, character.money / price));
    if (quantity <= 0) {
      return;
    }
    gross = round(quantity * price, 2);
    tax = 0;
    direction = "bought";
    characterMoney = round(character.money - gross, 2);
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
      factionTreasury,
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
      settlementStability <= SURRENDER_STABILITY_THRESHOLD &&
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

function completeMajorBattle(
  world: WorldState,
  battle: ActiveBattle,
  events: SimEvent[],
  attackerWon: boolean,
  attackerScore: number,
  defenderScore: number,
): void {
  const character = world.characters[battle.attackerId];
  const settlement = world.settlements[battle.settlementId];
  const settlementStocks = cloneResources(settlement.stocks);
  const lootArms = attackerWon ? round(Math.min(settlementStocks.arms, 8 + character.troops.count * 0.08)) : 0;
  settlementStocks.arms = round(settlementStocks.arms - lootArms);
  const surrender = attackerWon &&
      settlement.garrison <= SURRENDER_GARRISON_THRESHOLD &&
      settlement.stability <= SURRENDER_STABILITY_THRESHOLD &&
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
  const attackerWon = defenderGarrison === 0 ||
    (attackerTroops >= 8 && attackerHealth > 15 && attackerMorale > 12 &&
      (updatedBattle.attackerPhaseWins > updatedBattle.defenderPhaseWins ||
        (updatedBattle.attackerPhaseWins === updatedBattle.defenderPhaseWins && attackerScore > defenderScore)));
  completeMajorBattle(world, updatedBattle, events, attackerWon, attackerScore, defenderScore);
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
    startingForecast: combatForecast(world, character.id, settlement.id),
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
): void {
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
  const riskRate = risks.retreatRisk === "severe" ? 0.1 : risks.retreatRisk === "high" ? 0.07 : risks.retreatRisk === "moderate" ? 0.045 : 0.025;
  const pursuitLosses = Math.min(character.troops.count, Math.max(0, Math.round(character.troops.count * riskRate * rng.between(0.75, 1.25))));
  const attackerHealth = round(clamp(character.health - (2 + pursuitLosses * 0.12), 1, 100));
  const attackerMorale = round(clamp(character.morale - (6 + pursuitLosses * 0.2), 0, 100));
  emitCombatObservation(world, character, settlement.id, events, "final battlefield assessment before withdrawal");
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
}

function evolveLocalRelationship(
  world: WorldState,
  character: Character,
  events: SimEvent[],
  rng: DeterministicRng,
): void {
  if (!character.locationId) return;
  const numericId = Number.parseInt(character.id.slice(-2), 10);
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
      retreatFromBattle(world, battle, events, rng, command.id);
      emit(world, events, {
        type: "player-command-resolved",
        actorId: commander.id,
        settlementId: battle.settlementId,
        data: { commandId: command.id, outcome: "battle-retreated", battleId: battle.id },
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
        (order.status !== "pending" && order.status !== "active")
      ) {
        emit(world, events, {
          type: "player-command-failed",
          actorId: commander.id,
          targetId: command.characterId,
          data: { commandId: command.id, reason: "the order is no longer available for amendment" },
        });
        continue;
      }
      const amended: StandingOrder = {
        ...order,
        directive: command.directive,
        targetId: command.targetId,
        priority: command.priority,
        expiresTick: command.expiresTick,
        revision: order.revision + 1,
        status: command.majorChange ? "pending" : order.status,
        adherence: command.majorChange ? "unassessed" : order.adherence,
        statusChangedTick: command.majorChange ? world.tick : order.statusChangedTick,
        lastReport: {
          tick: world.tick,
          kind: "amended",
          summary: command.majorChange
            ? `${commander.name} materially revised the order; ${recipient.name} must reassess it.`
            : `${commander.name} adjusted the order's priority or deadline without changing its objective.`,
        },
      };
      emit(world, events, {
        type: "standing-order-amended",
        actorId: commander.id,
        targetId: recipient.id,
        data: {
          commandId: command.id,
          orderId: order.id,
          majorChange: command.majorChange,
          previousRevision: order.revision,
          order: amended,
          summary: amended.lastReport!.summary,
        },
      });
      emit(world, events, {
        type: "player-command-resolved",
        actorId: commander.id,
        targetId: recipient.id,
        data: { commandId: command.id, outcome: "order-amended", orderId: order.id, revision: amended.revision },
      });
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
    const chosen: DecisionCandidate = {
      action: command.action,
      targetId: command.targetId,
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
    resolveDecision(world, commander, chosen, events, rng);
    emit(world, events, {
      type: "player-command-resolved",
      actorId: commander.id,
      targetId: command.targetId,
      data: { commandId: command.id, outcome: "action-executed", action: command.action },
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

  switch (chosen.action) {
    case "travel": {
      const destinationId = chosen.targetId!;
      const totalTicks = travelDuration(world, character, destinationId);
      emit(world, events, {
        type: "travel-started",
        actorId: character.id,
        targetId: destinationId,
        data: {
          travel: { fromId: settlementId, toId: destinationId, totalTicks, remainingTicks: totalTicks },
          reason: chosen.reason,
        },
      });
      break;
    }
    case "buy-provisions": {
      const price = marketPrice(world, settlementId, "provisions");
      const desired = Math.max(0, 28 + character.troops.count * 0.25 - character.cargo.provisions);
      const quantity = round(Math.min(desired, settlement.stocks.provisions, character.money / price));
      if (quantity > 0) {
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
            gross: round(quantity * price, 2),
            tax: 0,
            characterMoney: round(character.money - quantity * price, 2),
            characterCargo,
            settlementStocks,
            factionTreasury: settlement.factionId ? world.factions[settlement.factionId].treasury : 0,
          },
        });
      }
      break;
    }
    case "trade-local":
      resolveTrade(world, character, events, chosen.resource);
      break;
    case "work": {
      const gross = round(10 + character.skills.leadership * 0.08 + character.skills.trade * 0.07, 2);
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
      const quantity = Math.max(1, Math.min(8, Math.floor(character.money / 12), Math.floor(settlement.stocks.arms / 0.35)));
      const settlementStocks = cloneResources(settlement.stocks);
      settlementStocks.arms = round(settlementStocks.arms - quantity * 0.35);
      emit(world, events, {
        type: "recruited",
        actorId: character.id,
        settlementId,
        data: {
          quantity,
          cost: quantity * 12,
          characterMoney: round(character.money - quantity * 12, 2),
          troopCount: character.troops.count + quantity,
          settlementStocks,
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
  }
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
  const battleParticipants = progressActiveBattles(world, events, rng);
  expireStandingOrders(world, events);

  for (const character of Object.values(world.characters).sort((a, b) => a.id.localeCompare(b.id))) {
    const inActiveBattle = Object.values(world.activeBattles).some((battle) => battle.attackerId === character.id);
    if (battleParticipants.has(character.id) || inActiveBattle) continue;
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
