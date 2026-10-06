export type ResourceKey = "provisions" | "arms" | "medicine" | "shipMaterials";

export type Resources = Record<ResourceKey, number>;

export interface Point {
  x: number;
  y: number;
}

export interface Faction {
  id: string;
  name: string;
  color: string;
  treasury: number;
  taxRate: number;
  /**
   * Who covers the seat while the command holder is captive.
   * Absent, not null, once that holder is free. The holder is not stored here.
   */
  actingCommanderId?: string;
}

export interface Settlement {
  id: string;
  name: string;
  position: Point;
  factionId: string | null;
  ownerId: string | null;
  population: number;
  workers: number;
  focus: ResourceKey;
  production: Resources;
  stocks: Resources;
  targetStocks: Resources;
  garrison: number;
  fortification: number;
  stability: number;
  surrender: {
    offeredToId: string;
    offeredTick: number;
    previousFactionId: string;
  } | null;
}

export interface Personality {
  ambition: number;
  aggression: number;
  caution: number;
  loyalty: number;
  curiosity: number;
  commerce: number;
}

export interface CharacterSkills {
  strategy: number;
  leadership: number;
  navigation: number;
  trade: number;
}

export interface CharacterAttributes {
  power: number;
  speed: number;
  endurance: number;
  resilience: number;
}

export interface TroopGroup {
  count: number;
  experience: number;
  discipline: number;
}

export interface CharacterScar {
  id: string;
  attribute: keyof CharacterAttributes;
  penalty: number;
  cause: "captivity-escape";
  gainedTick: number;
}

export interface DebtObligation {
  id: string;
  creditorFactionId: string | null;
  originalValue: number;
  remainingValue: number;
  incurredTick: number;
  reason: "prisoner-release";
}

export interface CaptivityState {
  captorFactionId: string | null;
  settlementId: string;
  capturedTick: number;
  mandatoryReleaseTick: number;
  cause: "major-defeat" | "failed-retreat" | "outscore-loss";
  displayedRisk: CombatRisk;
  scatteredTroops: TroopGroup;
  releaseDestinationId: string | null;
}

export interface TroopRecoveryState {
  total: number;
  remaining: number;
  nextReturnTick: number;
  returnEveryTicks: number;
  sourceSettlementId: string;
}

export interface NumericRange {
  low: number;
  high: number;
}

export type CombatRisk = "low" | "moderate" | "high" | "severe";

export interface CombatForecast {
  settlementId: string;
  generatedTick: number;
  outlook: "decisive-advantage" | "favored" | "contested" | "underdog" | "grave-danger";
  detailLevel: "basic" | "tactical" | "command";
  strategy: number;
  intelligence: {
    source: SettlementKnowledge["source"] | "none";
    confidence: number;
    ageTicks: number | null;
  };
  attackerPower: NumericRange;
  defenderPower: NumericRange;
  winChance: NumericRange;
  attackerCasualties: NumericRange;
  defenderCasualties: NumericRange;
  retreatSuccess: NumericRange;
  retreatRisk: CombatRisk;
  captureRisk: CombatRisk;
  majorBattle: boolean;
  phases: number;
  revealedFactors: string[];
}

export interface BattlePhaseReport {
  phase: number;
  outcome: "attacker-advantage" | "defender-advantage";
  attackerLosses: number;
  defenderLosses: number;
  attackerHealth: number;
  attackerMorale: number;
  attackerTroops: number;
  defenderGarrison: number;
  retreatRisk: CombatRisk;
  captureRisk: CombatRisk;
}

export interface ActiveBattle {
  id: string;
  attackerId: string;
  settlementId: string;
  defenderFactionId: string | null;
  startedTick: number;
  phase: number;
  totalPhases: number;
  attackerInitialPower: number;
  defenderInitialPower: number;
  attackerInitialTroops: number;
  defenderInitialGarrison: number;
  attackerPhaseWins: number;
  defenderPhaseWins: number;
  retreatDestinationId: string | null;
  lastPhase: BattlePhaseReport | null;
  startingForecast: CombatForecast;
}

export interface TravelState {
  fromId: string;
  toId: string;
  totalTicks: number;
  remainingTicks: number;
  /**
   * Set only when a player voyage was accepted with `source: "purse"`.
   * Sea ticks then pay the purse and skip the allowance. Absent on every
   * autonomous voyage, so a headless log does not grow the field.
   */
  source?: "purse";
}

export type GoalKind =
  | "material-security"
  | "build-wealth"
  | "build-power"
  | "serve-faction"
  | "explore-world"
  | "expand-influence"
  | "recover-strength";

export interface CharacterGoal {
  id: string;
  kind: GoalKind;
  label: string;
  priority: number;
  progress: number;
  status: "active" | "satisfied" | "abandoned";
  origin: string;
  createdTick: number;
}

export interface CharacterPlan {
  id: string;
  goalId: string;
  intent: string;
  preferredActions: string[];
  targetId?: string;
  createdTick: number;
  reviewAfterTick: number;
  reason: string;
  orderId?: string;
}

export interface Relationship {
  characterId: string;
  trust: number;
  affinity: number;
  respect: number;
  fear: number;
  grievance: number;
  obligation: number;
  lastChangedTick: number;
}

/**
 * Population and walls, dated separately from the rest of a settlement report.
 *
 * Garrison, stocks and prices keep refreshing while a character stands in a
 * port. The ground does not: a later arrival or a daily refresh must carry this
 * record forward, because the reducer replaces the whole knowledge entry.
 * Absent means the ground was never surveyed. It is never stored as null.
 */
export interface SettlementGround {
  population: number;
  fortification: number;
  observedTick: number;
  source: "direct" | "faction-report";
}

export interface SettlementKnowledge {
  settlementId: string;
  observedTick: number;
  confidence: number;
  factionId: string | null;
  garrisonEstimate: number;
  stocksEstimate: Resources;
  priceEstimate: Resources;
  source: "direct" | "faction-report" | "rumor";
  ground?: SettlementGround;
}

/**
 * One party, anchored in a port, as someone saw them.
 *
 * The numbers stay as seen. They are not recomputed from later experience,
 * discipline, or leadership, which would move an old power when a hidden skill
 * moved. Health, money, cargo, skills, orders, and captivity stay off the
 * record. `travel: null` is the whole heading: this slice does not store a course.
 */
export interface PartySighting {
  characterId: string;
  locationId: string;
  travel: null;
  troops: number;
  partyPower: number;
  observedTick: number;
  source: "direct" | "faction-report";
  confidence: 1;
}

/**
 * One anchored party, as a prisoner saw them on the morning they were released.
 *
 * The count and the power are the ones on that tick. A fellow prisoner is
 * included at count 0 and power 0. Captivity itself is not copied.
 */
export interface ReleaseParty {
  characterId: string;
  troops: number;
  partyPower: number;
  observedTick: number;
  source: "direct";
  confidence: 1;
}

/**
 * The prison a released captain carries home.
 *
 * Written once, inside the release, after that morning's upkeep. Absent until
 * the first release, so a world with no release hashes as it does now. A later
 * release replaces it when the new tick is greater or equal. Nothing deletes it.
 * It is not an event and it is not copied into `knowledge`.
 */
export interface ReleaseSighting {
  settlementId: string;
  factionId: string | null;
  captorFactionId: string | null;
  garrison: number;
  parties: ReleaseParty[];
  observedTick: number;
  source: "direct";
  confidence: 1;
}

export type OrderDirective = "protect" | "pressure" | "trade-supplies" | "explore";

export type StandingOrderStatus =
  | "pending"
  | "active"
  | "refused"
  | "awaiting-confirmation"
  | "completed"
  | "expired"
  | "cancelled";

export type StandingOrderAdherence = "unassessed" | "following" | "deviating";

export interface StandingOrderReport {
  tick: number;
  kind: "accepted" | "refused" | "deviation" | "resumed" | "completion" | "confirmed" | "closed-unanswered" | "expired" | "amended" | "cancelled";
  summary: string;
}

export type SupplyContractStatus =
  | "offered"
  | "accepted"
  | "refused"
  | "fulfilled"
  | "breached"
  | "cancelled";

/**
 * A paid provisions delivery. The price sits on `escrow`, in neither purse and
 * in no treasury, from the moment the offer is applied until it is paid to the
 * carrier or returned exactly once. A return sends `escrowFromTreasury` back
 * to the faction treasury and `escrowFromPurse` back to the purse. It does
 * not restore today's allowance.
 */
export interface SupplyContract {
  id: string;
  buyerId: string;
  carrierId: string;
  good: "provisions";
  quantity: number;
  destinationId: string;
  price: number;
  escrow: number;
  /**
   * Coins of `escrow` that came from the buyer's faction treasury. The rest
   * is `escrowFromPurse`. Both are set on a new offer, including when one of
   * them is 0. Absent on a contract from before the split, which returns the
   * whole escrow to the purse.
   */
  escrowFromTreasury?: number;
  /** Coins of `escrow` that came from the buyer's purse. */
  escrowFromPurse?: number;
  /** True after the escrow has been paid to the carrier or returned to its sources. */
  settled: boolean;
  deadlineTick: number;
  issuedTick: number;
  acceptedTick: number | null;
  status: SupplyContractStatus;
  revision: number;
  /** Tick of the last status change. The projection's age is `tick - observedTick`. */
  observedTick: number;
}

export interface StandingOrder {
  id: string;
  issuerId: string;
  directive: OrderDirective;
  targetId?: string;
  priority: number;
  issuedTick: number;
  expiresTick: number | null;
  revision: number;
  status: StandingOrderStatus;
  adherence: StandingOrderAdherence;
  statusChangedTick: number;
  deviationCount: number;
  lastReport: StandingOrderReport | null;
}

export type CharacterController =
  | { kind: "autonomous" }
  | { kind: "human"; playerId: string };

export interface Player {
  id: string;
  displayName: string;
  characterId: string;
  knownCharacterIds: string[];
  conversationTagScores: Record<string, number>;
  briefingAcknowledgements: Record<string, number>;
  routineBriefingThroughSequence: number;
  reportingOfficerId: string | null;
}

export type ConversationKind = "direct" | "group";

export type MessageTag =
  | "urgent"
  | "trade"
  | "political"
  | "threat"
  | "request"
  | "supportive"
  | "hostile"
  | "manipulation-attempt"
  | "spam";

export interface ConversationThread {
  id: string;
  kind: ConversationKind;
  title: string;
  participantIds: string[];
  createdById: string;
  createdTick: number;
  lastMessageTick: number | null;
}

export interface ConversationMessage {
  id: string;
  threadId: string;
  senderId: string;
  body: string;
  createdTick: number;
  source: "human" | "autonomous";
  tags: MessageTag[];
  replyToId?: string;
  inferredPlayerTags?: string[];
  discardedActionCount?: number;
}

export interface ScheduledReply {
  id: string;
  threadId: string;
  characterId: string;
  triggerMessageId: string;
  createdTick: number;
  dueTick: number;
  status: "pending" | "responded";
  respondedTick?: number;
}

export type PlayerAction =
  | "travel"
  | "buy-provisions"
  | "trade-local"
  | "buy-resource"
  | "sell-resource"
  | "work"
  | "recruit"
  | "raid"
  | "claim-settlement"
  | "decline-surrender"
  | "survey"
  | "rest";

export type PlayerCommand =
  | {
      id: string;
      playerId: string;
      issuedTick: number;
      type: "character-action";
      action: PlayerAction;
      targetId?: string;
      /** Set by the two trading verbs: what to trade, and how much of it. */
      resource?: ResourceKey;
      quantity?: number;
      /**
       * The price per unit this order was accepted at. Fixed at acceptance so the
       * player is charged the total they were quoted, even if a tick of
       * autonomous trading moves the board before the order fills.
       */
      unitPrice?: number;
      /**
       * The total quoted at acceptance, in cents: `quantity` times `unitPrice`.
       * Set on `buy-provisions` so the accepted command states what the purse
       * will pay. The resolution event's `gross` is what was actually paid.
       */
      gross?: number;
      /**
       * Set on `buy-provisions` when the gap up to the resupply target was larger
       * than one order may clear. `quantity` is then `marketDepth`, not the gap.
       */
      capped?: boolean;
      /**
       * `"purse"` pays this character's purse and skips the allowance.
       * Omitted on a member keeps the allowance-then-purse draw. The free
       * command holder's accept event echoes `"treasury"` when the request
       * omits it.
       */
      source?: "purse" | "treasury";
    }
  | {
      id: string;
      playerId: string;
      issuedTick: number;
      type: "issue-order";
      characterId: string;
      directive: OrderDirective;
      targetId?: string;
      priority: number;
      expiresTick: number | null;
    }
  | {
      id: string;
      playerId: string;
      issuedTick: number;
      type: "confirm-order";
      characterId: string;
      orderId: string;
    }
  | {
      id: string;
      playerId: string;
      issuedTick: number;
      type: "amend-order";
      characterId: string;
      orderId: string;
      directive: OrderDirective;
      targetId?: string;
      priority: number;
      expiresTick: number | null;
      majorChange: boolean;
    }
  | {
      id: string;
      playerId: string;
      issuedTick: number;
      type: "cancel-order";
      characterId: string;
      orderId: string;
    }
  | {
      id: string;
      playerId: string;
      issuedTick: number;
      type: "retreat-battle";
      battleId: string;
    }
  | {
      id: string;
      playerId: string;
      issuedTick: number;
      type: "escape-captivity";
    }
  | {
      id: string;
      playerId: string;
      issuedTick: number;
      type: "offer-contract";
      characterId: string;
      /** Set when this offer restates a contract that is still `offered`. */
      contractId?: string;
      quantity: number;
      destinationId: string;
      price: number;
      expiresTick: number;
      /** Same field as on a character action. `"purse"` skips the allowance. */
      source?: "purse" | "treasury";
    }
  | {
      id: string;
      playerId: string;
      issuedTick: number;
      type: "cancel-contract";
      characterId: string;
      contractId: string;
    };

export interface Character {
  id: string;
  name: string;
  archetype: string;
  factionId: string | null;
  locationId: string | null;
  travel: TravelState | null;
  money: number;
  cargo: Resources;
  health: number;
  morale: number;
  sailors: number;
  troops: TroopGroup;
  captivity: CaptivityState | null;
  troopRecovery: TroopRecoveryState | null;
  scars: CharacterScar[];
  debts: DebtObligation[];
  attributes: CharacterAttributes;
  skills: CharacterSkills;
  personality: Personality;
  /**
   * Unpaid-release loyalty scar, omitted while it is 0.
   *
   * The cover sort adds this to `personality.loyalty` before multiplying by 50.
   * Orders, plans, work, the dock sort, and `personality.loyalty` itself do not
   * read it. A paid release and an escape do not write it. No event carries it.
   */
  loyaltyAdjustment?: number;
  /**
   * Coins left of today's treasury allowance. The cap is the balance share,
   * `min(18, treasury / free mates)`, read on each quote. Omitted while it
   * equals that cap. Omitted means full. The `tick-advanced` reducer deletes
   * it on a day boundary, so unused allowance does not carry and the next
   * quote reads the share again. A capped member's spend event carries the
   * new absolute. The free command holder has no cap and does not store this.
   * A refunded escrow does not write this field.
   */
  allowanceRemaining?: number;
  controller: CharacterController;
  goals: CharacterGoal[];
  activeGoalId: string | null;
  plan: CharacterPlan | null;
  relationships: Record<string, Relationship>;
  knowledge: Record<string, SettlementKnowledge>;
  /**
   * Parties seen anchored in a port, keyed by the subject's id.
   *
   * Absent until the first sighting. A survey, or a targeted explore delivered
   * to this character, writes it. A daily observation does not, and nothing
   * deletes an entry. Omitted so a world with no sightings hashes as before.
   */
  partySightings?: Record<string, PartySighting>;
  /**
   * The prison this captain was released from.
   *
   * Absent until the first release. A later release replaces it when the new
   * `observedTick` is greater or equal. Nothing deletes it. Omitted so a world
   * with no release hashes as before. The captor's reading is not stored here.
   */
  releaseSighting?: ReleaseSighting;
  standingOrders: StandingOrder[];
  lastPlanReviewTick: number;
  currentGoal: string;
  lastDecisionTick: number;
  lastBattleTick: number;
  victories: number;
  defeats: number;
}

export interface WorldState {
  version: 5;
  scenario: string;
  seed: number;
  rngState: number;
  tick: number;
  ticksPerDay: number;
  nextEventSequence: number;
  nextCommandSequence: number;
  nextThreadSequence: number;
  nextMessageSequence: number;
  nextReplySequence: number;
  factions: Record<string, Faction>;
  settlements: Record<string, Settlement>;
  characters: Record<string, Character>;
  players: Record<string, Player>;
  pendingCommands: PlayerCommand[];
  activeBattles: Record<string, ActiveBattle>;
  conversationThreads: Record<string, ConversationThread>;
  conversationMessages: ConversationMessage[];
  scheduledReplies: ScheduledReply[];
  /**
   * Paid provisions contracts, keyed by id.
   *
   * Absent until the first offer. A headless world never writes it, so the
   * golden hash stays the world that has no contracts.
   */
  contracts?: Record<string, SupplyContract>;
}

export interface DecisionCandidate {
  action: string;
  score: number;
  reason: string;
  targetId?: string;
  resource?: ResourceKey;
  /** Units a trading action should move. Set by the player, not the planner. */
  quantity?: number;
  /**
   * The price per unit the order was accepted at. Player trades only: it fixes
   * the price at the moment the player was shown it, because a tick of
   * autonomous trading can move a board between accepting an order and filling
   * it, and a player who was quoted a total must be charged that total.
   */
  unitPrice?: number;
  /** Player `source: "purse"` only. Autonomous decisions leave this unset. */
  spendSource?: "purse";
}

export interface SimEvent {
  sequence: number;
  tick: number;
  type: string;
  actorId?: string;
  targetId?: string;
  settlementId?: string;
  data: Record<string, unknown>;
}

export interface EventDraft {
  type: string;
  actorId?: string;
  targetId?: string;
  settlementId?: string;
  data: Record<string, unknown>;
}

export interface TickResult {
  state: WorldState;
  events: SimEvent[];
}

export const RESOURCE_KEYS: ResourceKey[] = [
  "provisions",
  "arms",
  "medicine",
  "shipMaterials",
];

export function emptyResources(): Resources {
  return { provisions: 0, arms: 0, medicine: 0, shipMaterials: 0 };
}
