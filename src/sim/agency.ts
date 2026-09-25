import { DeterministicRng } from "./rng.ts";
import { clamp, marketPrice, round } from "./state.ts";
import {
  RESOURCE_KEYS,
  type Character,
  type CharacterGoal,
  type CharacterPlan,
  type GoalKind,
  type OrderDirective,
  type ResourceKey,
  type SettlementKnowledge,
  type StandingOrder,
  type WorldState,
} from "./types.ts";

export interface OrderAssessment {
  orderId: string;
  directive: OrderDirective;
  issuerId: string;
  targetId?: string;
  obedience: number;
  threshold: number;
  willComply: boolean;
  factors: Record<string, number>;
}

export interface PlanReview {
  reason: string;
  selectedGoalId: string;
  goalScores: Array<{ goalId: string; kind: GoalKind; score: number; reason: string }>;
  orderAssessment: OrderAssessment | null;
  plan: CharacterPlan;
}

export interface OrderActionAssessment {
  aligned: boolean;
  summary: string;
}

export interface OrderCompletionJudgment {
  score: number;
  threshold: number;
  summary: string;
}

const fallbackPrices: Record<ResourceKey, number> = {
  provisions: 2.4,
  arms: 5.6,
  medicine: 7.4,
  shipMaterials: 4.5,
};

function freshness(world: WorldState, belief: SettlementKnowledge): number {
  const age = Math.max(0, world.tick - belief.observedTick);
  return clamp(belief.confidence * Math.exp(-age / 72), 0.08, 1);
}

export function believedPrice(
  world: WorldState,
  character: Character,
  settlementId: string,
  resource: ResourceKey,
): number {
  if (character.locationId === settlementId) return marketPrice(world, settlementId, resource);
  const belief = character.knowledge[settlementId];
  if (!belief) return fallbackPrices[resource];
  const confidence = freshness(world, belief);
  return round(belief.priceEstimate[resource] * confidence + fallbackPrices[resource] * (1 - confidence), 2);
}

export function believedGarrison(
  world: WorldState,
  character: Character,
  settlementId: string,
): { estimate: number; confidence: number; observedTick: number } {
  if (character.locationId === settlementId) {
    return { estimate: world.settlements[settlementId].garrison, confidence: 1, observedTick: world.tick };
  }
  const belief = character.knowledge[settlementId];
  if (!belief) return { estimate: 100, confidence: 0.1, observedTick: -1 };
  const confidence = freshness(world, belief);
  return {
    estimate: Math.max(1, round(belief.garrisonEstimate * confidence + 100 * (1 - confidence), 1)),
    // Two decimals, because this is a player-facing confidence and every surface
    // is expected to display exactly this number.
    confidence: round(confidence, 2),
    observedTick: belief.observedTick,
  };
}

export function directObservation(world: WorldState, character: Character): SettlementKnowledge | null {
  if (!character.locationId) return null;
  const settlement = world.settlements[character.locationId];
  return {
    settlementId: settlement.id,
    observedTick: world.tick,
    confidence: 1,
    factionId: settlement.factionId,
    garrisonEstimate: settlement.garrison,
    stocksEstimate: { ...settlement.stocks },
    priceEstimate: Object.fromEntries(
      RESOURCE_KEYS.map((resource) => [resource, marketPrice(world, settlement.id, resource)]),
    ) as SettlementKnowledge["priceEstimate"],
    source: "direct",
  };
}

export function needsObservation(world: WorldState, character: Character): boolean {
  if (!character.locationId) return false;
  const belief = character.knowledge[character.locationId];
  return !belief || belief.source !== "direct" || world.tick - belief.observedTick >= world.ticksPerDay;
}

export function activeStandingOrder(character: Character, tick: number): StandingOrder | null {
  return character.standingOrders
    .filter((order) =>
      (order.status === "pending" || order.status === "active") &&
      (order.expiresTick === null || order.expiresTick > tick)
    )
    .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id))[0] ?? null;
}

export function assessStandingOrder(character: Character, order: StandingOrder | null): OrderAssessment | null {
  if (!order) return null;
  const relationship = character.relationships[order.issuerId];
  const trust = relationship?.trust ?? 0.35;
  const respect = relationship?.respect ?? 0.35;
  const grievance = relationship?.grievance ?? 0;
  const obligation = relationship?.obligation ?? 0;
  const risk = {
    protect: 0.38,
    pressure: 0.88,
    "trade-supplies": 0.25,
    explore: 0.34,
  }[order.directive];
  const alignment = {
    protect: character.personality.loyalty,
    pressure: (character.personality.aggression + character.personality.ambition) / 2,
    "trade-supplies": character.personality.commerce,
    explore: character.personality.curiosity,
  }[order.directive];
  const factors = {
    authority: order.priority * 0.24,
    loyalty: character.personality.loyalty * 0.24,
    trust: trust * 0.14,
    respect: respect * 0.16,
    alignment: alignment * 0.18,
    obligation: obligation * 0.08,
    grievance: -grievance * 0.18,
    perceivedRisk: -character.personality.caution * risk * 0.16,
  };
  const obedience = round(clamp(Object.values(factors).reduce((sum, value) => sum + value, 0), 0, 1));
  const threshold = round(0.54 + character.personality.ambition * 0.08);
  return {
    orderId: order.id,
    directive: order.directive,
    issuerId: order.issuerId,
    targetId: order.targetId,
    obedience,
    threshold,
    willComply: order.status === "active" || obedience >= threshold,
    factors: Object.fromEntries(Object.entries(factors).map(([key, value]) => [key, round(value)])),
  };
}

function planReviewReason(world: WorldState, character: Character): string | null {
  if (!character.plan) return "no active plan";
  const goal = character.goals.find((candidate) => candidate.id === character.plan!.goalId);
  if (!goal || goal.status !== "active") return "active goal is no longer viable";
  if (world.tick >= character.plan.reviewAfterTick) return "scheduled strategic review";
  if (character.health < 38 && goal.kind !== "recover-strength" && goal.kind !== "material-security") {
    return "health crisis overrides the current ambition";
  }
  const requiredReserve = 7 + character.troops.count * 0.08;
  if (character.cargo.provisions < requiredReserve && goal.kind !== "material-security") {
    return "provisions fell below the safe reserve";
  }
  if (character.lastBattleTick > character.plan.createdTick && character.defeats > 0 && goal.kind !== "recover-strength") {
    return "a recent defeat invalidated prior assumptions";
  }
  const newerOrder = character.standingOrders.some((order) =>
    order.status === "pending" && order.issuedTick > character.plan!.createdTick
  );
  if (newerOrder) return "a new standing order requires consideration";
  return null;
}

function scoreGoal(character: Character, goal: CharacterGoal): { score: number; reason: string } {
  let situational = 0;
  let reason = "persistent personal ambition";
  switch (goal.kind) {
    case "material-security":
      const safeReserve = 7 + character.troops.count * 0.08;
      situational =
        Math.max(0, 35 - character.cargo.provisions) / 50 +
        Math.max(0, 70 - character.health) / 80 +
        (1 - character.morale / 100) * 0.18 +
        (character.cargo.provisions < safeReserve ? 0.82 : 0) +
        (character.health < 38 ? 0.72 : 0);
      reason = "current supply, health, and morale needs";
      break;
    case "build-wealth":
      situational = character.personality.commerce * 0.36 + Math.max(0, 260 - character.money) / 700;
      reason = "commercial instinct and available capital";
      break;
    case "build-power":
      situational = character.personality.ambition * 0.34 + Math.max(0, 75 - character.troops.count) / 180;
      reason = "ambition and present party strength";
      break;
    case "serve-faction":
      situational = character.personality.loyalty * 0.46;
      reason = "loyalty and institutional duty";
      break;
    case "explore-world":
      situational = character.personality.curiosity * 0.48;
      reason = "curiosity and stale world knowledge";
      break;
    case "expand-influence":
      situational = character.personality.ambition * 0.3 + character.personality.aggression * 0.22;
      reason = "ambition, aggression, and reputation seeking";
      break;
    case "recover-strength":
      situational = Math.max(0, 100 - character.health) / 85 + Math.min(0.3, character.defeats * 0.08);
      reason = "the consequences of defeat and injury";
      break;
  }
  return { score: goal.priority + situational - goal.progress * 0.12, reason };
}

function actionsForGoal(kind: GoalKind): string[] {
  return {
    "material-security": ["buy-provisions", "rest", "work", "travel"],
    "build-wealth": ["trade-local", "travel", "work"],
    "build-power": ["recruit", "work", "raid", "claim-settlement"],
    "serve-faction": ["recruit", "work", "raid", "claim-settlement", "travel"],
    "explore-world": ["travel", "trade-local"],
    "expand-influence": ["raid", "claim-settlement", "recruit", "travel"],
    "recover-strength": ["rest", "buy-provisions", "recruit"],
  }[kind];
}

function actionsForOrder(directive: OrderDirective): string[] {
  return {
    protect: ["recruit", "work", "travel"],
    pressure: ["raid", "claim-settlement", "recruit", "travel"],
    "trade-supplies": ["trade-local", "travel"],
    explore: ["travel", "trade-local"],
  }[directive];
}

export function reviewPlan(
  world: WorldState,
  character: Character,
  rng: DeterministicRng,
): PlanReview | null {
  const reason = planReviewReason(world, character);
  if (!reason) return null;

  const order = activeStandingOrder(character, world.tick);
  const orderAssessment = assessStandingOrder(character, order);
  const goalScores = character.goals
    .filter((goal) => goal.status === "active")
    .map((goal) => {
      const result = scoreGoal(character, goal);
      const orderAffinity = orderAssessment?.willComply && goal.kind === "serve-faction" ? 0.34 : 0;
      return {
        goalId: goal.id,
        kind: goal.kind,
        score: round(result.score + orderAffinity + rng.between(-0.035, 0.035)),
        reason: result.reason,
      };
    })
    .sort((left, right) => right.score - left.score || left.goalId.localeCompare(right.goalId));
  const selected = goalScores[0];
  if (!selected) throw new Error(`${character.name} has no active goals`);

  const preferredActions = [...actionsForGoal(selected.kind)];
  if (orderAssessment?.willComply) {
    for (const action of actionsForOrder(orderAssessment.directive)) {
      if (!preferredActions.includes(action)) preferredActions.push(action);
    }
  }
  const reviewInterval = rng.integer(6, 14) + Math.round(character.personality.caution * 4);
  const plan: CharacterPlan = {
    id: `${character.id}:plan:${world.tick}:${selected.kind}`,
    goalId: selected.goalId,
    intent: character.goals.find((goal) => goal.id === selected.goalId)!.label,
    preferredActions,
    targetId: orderAssessment?.willComply ? orderAssessment.targetId : undefined,
    createdTick: world.tick,
    reviewAfterTick: world.tick + reviewInterval,
    reason,
    orderId: orderAssessment?.willComply ? orderAssessment.orderId : undefined,
  };
  return {
    reason,
    selectedGoalId: selected.goalId,
    goalScores,
    orderAssessment,
    plan,
  };
}

function settlementMatchesFaction(world: WorldState, settlementId: string | undefined, factionId: string | undefined): boolean {
  return Boolean(settlementId && factionId && world.settlements[settlementId]?.factionId === factionId);
}

export function assessOrderAction(
  world: WorldState,
  character: Character,
  order: StandingOrder,
  action: string,
  targetId?: string,
): OrderActionAssessment {
  const targetName = order.targetId
    ? world.settlements[order.targetId]?.name ?? world.factions[order.targetId]?.name ?? order.targetId
    : "the assigned objective";
  let aligned = true;
  let summary = `Continuing ${order.directive.replaceAll("-", " ")} orders concerning ${targetName}.`;

  if (order.directive === "protect") {
    aligned = character.locationId === order.targetId
      ? action !== "travel"
      : action === "travel" && targetId === order.targetId;
  } else if (order.directive === "pressure") {
    const actingAgainstTarget = (action === "raid" || action === "claim-settlement") &&
      settlementMatchesFaction(world, character.locationId ?? targetId, order.targetId);
    const travelingAgainstTarget = action === "travel" && settlementMatchesFaction(world, targetId, order.targetId);
    aligned = actingAgainstTarget || travelingAgainstTarget || action === "recruit" || action === "buy-provisions" || action === "rest";
  } else if (order.directive === "trade-supplies") {
    aligned = action === "trade-local" || action === "buy-provisions" ||
      (action === "travel" && (!order.targetId || targetId === order.targetId));
  } else if (order.directive === "explore") {
    aligned = action === "trade-local" ||
      (action === "travel" && (!order.targetId || targetId === order.targetId)) ||
      Boolean(order.targetId && character.locationId === order.targetId && action !== "travel");
  }

  if (!aligned) {
    summary = `${character.name} diverted to ${action.replaceAll("-", " ")} while retaining ${order.directive.replaceAll("-", " ")} orders for ${targetName}.`;
  } else if (order.adherence === "deviating") {
    summary = `${character.name} resumed ${order.directive.replaceAll("-", " ")} orders concerning ${targetName}.`;
  }
  return { aligned, summary };
}

export function judgeOrderCompletion(
  world: WorldState,
  character: Character,
  order: StandingOrder,
  action: string,
  events: Array<{ type: string; actorId?: string; targetId?: string; settlementId?: string; data: Record<string, unknown> }>,
  rng: DeterministicRng,
): OrderCompletionJudgment | null {
  if (order.status !== "active" || order.adherence !== "following") return null;
  const elapsed = world.tick - order.statusChangedTick;
  let evidence = 0;
  let summary = "";

  if (order.directive === "protect" && character.locationId === order.targetId && elapsed >= world.ticksPerDay) {
    const settlement = world.settlements[order.targetId!];
    evidence = 0.62 + Math.min(0.2, elapsed / (world.ticksPerDay * 10)) + settlement.stability / 1_000;
    summary = `${character.name} reports that ${settlement.name} is secure and asks the issuer to close the protection order.`;
  } else if (order.directive === "pressure") {
    const success = [...events].reverse().find((event) =>
      event.actorId === character.id &&
      ((event.type === "battle-resolved" && event.data.outcome === "attacker-victory" && event.targetId === order.targetId) ||
        (event.type === "settlement-claimed" && event.data.previousFactionId === order.targetId))
    );
    if (success) {
      evidence = success.type === "settlement-claimed" ? 1 : 0.91;
      const place = success.settlementId ? world.settlements[success.settlementId]?.name ?? success.settlementId : "the objective";
      summary = `${character.name} judges the pressure operation at ${place} successful and requests confirmation.`;
    }
  } else if (order.directive === "trade-supplies" && action === "trade-local") {
    const trade = [...events].reverse().find((event) =>
      event.type === "market-trade" && event.actorId === character.id &&
      (!order.targetId || event.settlementId === order.targetId)
    );
    if (trade) {
      evidence = 0.9;
      const place = world.settlements[trade.settlementId!]?.name ?? "the assigned market";
      summary = `${character.name} reports the supply transaction at ${place} complete and requests confirmation.`;
    }
  } else if (order.directive === "explore") {
    const targetId = order.targetId ?? character.locationId;
    const knowledge = targetId ? character.knowledge[targetId] : undefined;
    if (targetId && character.locationId === targetId && knowledge?.source === "direct" && knowledge.observedTick >= order.issuedTick) {
      evidence = 0.88;
      summary = `${character.name} considers the survey of ${world.settlements[targetId].name} complete and requests confirmation.`;
    }
  }

  if (!summary) return null;
  const score = round(clamp(evidence + character.personality.ambition * 0.08 - character.personality.caution * 0.1 + rng.between(-0.04, 0.04), 0, 1));
  const threshold = round(0.7 + character.personality.caution * 0.08);
  return score >= threshold ? { score, threshold, summary } : null;
}

export function planActionBoost(
  character: Character,
  action: string,
  targetId?: string,
): { boost: number; reason: string | null } {
  const plan = character.plan;
  if (!plan) return { boost: 0, reason: null };
  const goal = character.goals.find((candidate) => candidate.id === plan.goalId);
  let boost = plan.preferredActions.includes(action) ? 20 : -3;
  if (action === "travel" && goal?.kind !== "explore-world" && goal?.kind !== "build-wealth") {
    boost -= 14;
  }
  if (plan.targetId && targetId === plan.targetId) boost += 22;
  if (plan.orderId && plan.preferredActions.includes(action)) boost += 7;
  return {
    boost,
    reason: boost > 0 ? `supports plan: ${plan.intent}` : null,
  };
}

export function goalProgressForAction(goal: CharacterGoal | undefined, action: string): number {
  if (!goal) return 0;
  const matches = actionsForGoal(goal.kind).includes(action);
  return matches ? 0.008 : 0.001;
}
