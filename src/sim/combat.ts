import { believedGarrison } from "./agency.ts";
import { clamp, distanceBetween, partyPower, round } from "./state.ts";
import type {
  ActiveBattle,
  Character,
  CombatForecast,
  CombatRisk,
  NumericRange,
  Settlement,
  WorldState,
} from "./types.ts";

export function settlementDefensePower(settlement: Settlement): number {
  return round(settlement.garrison * settlement.fortification + settlement.population * 0.002);
}

export function selectRetreatDestination(
  world: WorldState,
  attackerId: string,
  battleSettlementId: string,
): string | null {
  const attacker = world.characters[attackerId];
  const alternatives = Object.values(world.settlements)
    .filter((settlement) => settlement.id !== battleSettlementId);
  const friendly = alternatives.filter((settlement) =>
    attacker.factionId === null ? settlement.factionId === null : settlement.factionId === attacker.factionId
  );
  const neutral = alternatives.filter((settlement) => settlement.factionId === null);
  const candidates = friendly.length > 0 ? friendly : neutral.length > 0 ? neutral : alternatives;
  return candidates
    .sort((left, right) =>
      distanceBetween(world, battleSettlementId, left.id) - distanceBetween(world, battleSettlementId, right.id) ||
      left.id.localeCompare(right.id)
    )[0]?.id ?? null;
}

export function isMajorBattle(character: Character, settlement: Settlement): boolean {
  return character.troops.count + settlement.garrison >= 120 ||
    partyPower(character) + settlementDefensePower(settlement) >= 275;
}

function range(center: number, width: number, minimum = 0): NumericRange {
  return {
    low: round(Math.max(minimum, center * (1 - width)), 1),
    high: round(Math.max(minimum, center * (1 + width)), 1),
  };
}

function chanceRange(lowAttack: number, highAttack: number, lowDefense: number, highDefense: number): NumericRange {
  const low = 100 * lowAttack / Math.max(1, lowAttack + highDefense);
  const high = 100 * highAttack / Math.max(1, highAttack + lowDefense);
  return { low: round(clamp(low, 2, 98)), high: round(clamp(high, 2, 98)) };
}

function riskFromChance(chance: number): CombatRisk {
  if (chance <= 18) return "low";
  if (chance <= 38) return "moderate";
  if (chance <= 62) return "high";
  return "severe";
}

export function captureChanceForRisk(risk: CombatRisk): number {
  return {
    low: 0.04,
    moderate: 0.12,
    high: 0.3,
    severe: 0.55,
  }[risk];
}

function outlook(chance: number): CombatForecast["outlook"] {
  if (chance >= 72) return "decisive-advantage";
  if (chance >= 58) return "favored";
  if (chance >= 43) return "contested";
  if (chance >= 28) return "underdog";
  return "grave-danger";
}

function expectedLosses(
  attacker: Character,
  defenderEstimate: number,
  attackerEstimate: number,
  major: boolean,
): { attacker: number; defender: number } {
  const ratio = clamp(attackerEstimate / Math.max(1, defenderEstimate), 0.2, 3);
  const phaseScale = major ? 1.15 : 1;
  return {
    attacker: attacker.troops.count * (ratio >= 1 ? 0.05 + 0.11 / ratio : 0.16 + 0.2 / ratio) * phaseScale,
    defender: (defenderEstimate / 1.2) * (ratio >= 1 ? 0.28 + 0.12 * ratio : 0.07 + 0.08 * ratio) * phaseScale,
  };
}

export function combatForecast(
  world: WorldState,
  attackerId: string,
  settlementId: string,
  options: { observedLocally?: boolean } = {},
): CombatForecast {
  const attacker = world.characters[attackerId];
  const settlement = world.settlements[settlementId];
  if (!attacker || !settlement) throw new Error("Combat forecast requires a known attacker and settlement");

  const belief = believedGarrison(world, attacker, settlementId);
  const storedKnowledge = attacker.knowledge[settlementId];
  // An active battle counts as direct observation: the attacker is on the ground
  // by definition, even if a position field disagrees for a tick. Callers that
  // know this pass it explicitly rather than leaving it to inference.
  const locallyObserved = options.observedLocally ?? attacker.locationId === settlementId;
  const strategy = clamp(attacker.skills.strategy, 0, 100);
  const skill = strategy / 100;
  const ageTicks = locallyObserved ? 0 : storedKnowledge ? Math.max(0, world.tick - storedKnowledge.observedTick) : null;
  const agePenalty = ageTicks === null ? 0.3 : Math.min(0.28, ageTicks / 180);
  const intelligencePenalty = (1 - belief.confidence) * 0.34 + agePenalty;
  const attackerWidth = clamp(0.4 - skill * 0.27, 0.1, 0.42);
  const defenderWidth = clamp(0.3 - skill * 0.16 + intelligencePenalty, 0.12, 0.72);

  // Fortification and population are ground truth only while the commander is
  // actually present. Deliberately binary, not scaled by confidence: nothing
  // stored describes the ground of a settlement the commander has not stood on,
  // so any confidence-scaled contribution of the true value would be a
  // proportional disclosure of it. A player who knows this formula could read
  // true fortification straight out of the result. Ignorance is expressed
  // through the range widths below instead, which widen as confidence falls and
  // reports age.
  const groundTruthWeight = locallyObserved ? 1 : 0;
  const knownFortification = 1 + (settlement.fortification - 1) * groundTruthWeight;
  const knownPopulation = settlement.population * groundTruthWeight;
  const fortificationEstimate = 1 + (knownFortification - 1) * (0.35 + skill * 0.65);
  const populationDefenseEstimate = knownPopulation * 0.002 * (0.25 + skill * 0.75);
  const attackerCenter = partyPower(attacker);
  const defenderCenter = belief.estimate * fortificationEstimate + populationDefenseEstimate;
  const attackerPower = range(attackerCenter, attackerWidth, 1);
  const defenderPower = range(defenderCenter, defenderWidth, 1);
  const winChance = chanceRange(attackerPower.low, attackerPower.high, defenderPower.low, defenderPower.high);
  const winMidpoint = (winChance.low + winChance.high) / 2;
  // A commander deciding whether to commit should read the bad case, not the good
  // one. Locally the range is narrow and the midpoint represents it. Remotely the
  // range is wide and the midpoint drifts *upward* as it widens, because the
  // attacker's upper power and the defender's lower power both move in the
  // favourable direction. Reading the midpoint there made the headline grow more
  // confident the less the commander knew. A fresh-context playtest caught it.
  const headlineChance = locallyObserved ? winMidpoint : winChance.low;
  // The battle format follows the same rule: locally from the real order of
  // battle, remotely from what the report supports. Reading the true garrison
  // and defenses here would leak both through `phases`.
  const majorBattle = locallyObserved
    ? isMajorBattle(attacker, settlement)
    : attacker.troops.count + belief.estimate >= 120 || partyPower(attacker) + defenderCenter >= 275;
  const expected = expectedLosses(attacker, defenderCenter, attackerCenter, majorBattle);
  const casualtyWidth = clamp(0.48 - skill * 0.28 + intelligencePenalty * 0.35, 0.16, 0.68);
  const attackerCasualties = range(expected.attacker, casualtyWidth);
  const defenderCasualties = range(expected.defender, casualtyWidth);

  const retreatCenter = clamp(
    42 + attacker.attributes.speed * 0.22 + strategy * 0.22 + attacker.troops.discipline * 18 -
      Math.max(0, defenderCenter / Math.max(1, attackerCenter) - 1) * 18,
    12,
    94,
  );
  const retreatWidth = 20 - skill * 11 + intelligencePenalty * 12;
  const retreatSuccess = {
    low: round(clamp(retreatCenter - retreatWidth, 5, 98)),
    high: round(clamp(retreatCenter + retreatWidth, 5, 98)),
  };
  const retreatFailure = 100 - (retreatSuccess.low + retreatSuccess.high) / 2;
  const captureChance = clamp(
    retreatFailure * 0.55 + Math.max(0, 45 - attacker.morale) * 0.7 + Math.max(0, 40 - attacker.health) * 0.45,
    2,
    92,
  );

  const revealedFactors = [
    `${Math.round(belief.confidence * 100)}% confidence in the garrison estimate`,
    `${Math.round(attacker.troops.discipline * 100)}% troop discipline`,
  ];
  if (!locallyObserved) {
    // Nothing stored describes the ground itself, so any label here would either
    // be invented or read off the true fortification. The second is exactly the
    // leak this whole projection exists to prevent, so the honest answer is that
    // the ground is unknown.
    revealedFactors.push("defensive ground remains poorly understood");
  } else if (strategy >= 70) {
    revealedFactors.push(`defensive ground estimated near ${round(fortificationEstimate, 2)}×`);
    revealedFactors.push(`battle variance constrained by strategy ${strategy}`);
  } else if (strategy >= 40) {
    revealedFactors.push(settlement.fortification >= 1.25 ? "prepared defenses appear significant" : "defensive ground appears limited");
  } else {
    revealedFactors.push("defensive ground remains poorly understood");
  }

  return {
    settlementId,
    generatedTick: world.tick,
    outlook: outlook(headlineChance),
    detailLevel: strategy >= 70 ? "command" : strategy >= 40 ? "tactical" : "basic",
    strategy,
    intelligence: {
      source: locallyObserved ? "direct" : storedKnowledge?.source ?? "none",
      confidence: round(belief.confidence, 2),
      ageTicks,
    },
    attackerPower,
    defenderPower,
    winChance,
    attackerCasualties,
    defenderCasualties,
    retreatSuccess,
    retreatRisk: riskFromChance(retreatFailure),
    captureRisk: riskFromChance(captureChance),
    majorBattle,
    phases: majorBattle ? 3 : 1,
    revealedFactors,
  };
}

export function battleRisk(world: WorldState, battle: ActiveBattle): { retreatRisk: CombatRisk; captureRisk: CombatRisk } {
  // An active battle is fought on the ground, so its risks use exact inputs.
  const forecast = combatForecast(world, battle.attackerId, battle.settlementId, { observedLocally: true });
  return { retreatRisk: forecast.retreatRisk, captureRisk: forecast.captureRisk };
}

const RISK_LEVELS: CombatRisk[] = ["low", "moderate", "high", "severe"];

function raiseRisk(risk: CombatRisk, levels: number): CombatRisk {
  return RISK_LEVELS[Math.min(RISK_LEVELS.length - 1, RISK_LEVELS.indexOf(risk) + levels)];
}

export interface BattleCondition {
  attackerHealth: number;
  attackerMorale: number;
  attackerTroops: number;
  defenderGarrison: number;
}

export function projectedBattleRisk(
  world: WorldState,
  battle: ActiveBattle,
  condition: BattleCondition,
): { retreatRisk: CombatRisk; captureRisk: CombatRisk } {
  const baseline = battleRisk(world, battle);
  const troopFraction = condition.attackerTroops / Math.max(1, battle.attackerInitialTroops);
  const outnumbered = condition.defenderGarrison > Math.max(1, condition.attackerTroops) * 1.4;
  const retreatPressure = (troopFraction < 0.45 ? 1 : 0) + (outnumbered ? 1 : 0);
  const capturePressure = (condition.attackerHealth < 38 ? 1 : 0) +
    (condition.attackerMorale < 32 ? 1 : 0) + (troopFraction < 0.3 ? 1 : 0);
  return {
    retreatRisk: raiseRisk(baseline.retreatRisk, retreatPressure),
    captureRisk: raiseRisk(baseline.captureRisk, capturePressure),
  };
}

export function autonomousShouldRetreat(world: WorldState, battle: ActiveBattle): boolean {
  const attacker = world.characters[battle.attackerId];
  if (!attacker || battle.phase === 0) return false;
  const losing = battle.defenderPhaseWins > battle.attackerPhaseWins;
  const danger = attacker.health < 38 || attacker.morale < 32 || attacker.troops.count < Math.max(8, battle.attackerInitialTroops * 0.35);
  const personalityThreshold = attacker.personality.caution * 0.75 - attacker.personality.aggression * 0.35;
  const pressure = (losing ? 0.38 : 0) + (danger ? 0.55 : 0) + (1 - attacker.health / 100) * 0.22;
  return pressure > 0.48 + personalityThreshold;
}
