import { DeterministicRng } from "./rng.ts";
import type {
  Character,
  CharacterGoal,
  Faction,
  Personality,
  Relationship,
  Resources,
  SettlementKnowledge,
  Settlement,
  StandingOrder,
  WorldState,
} from "./types.ts";

const firstNames = [
  "Mara", "Bram", "Niko", "Sable", "Jun", "Iris", "Toma", "Vale", "Orin", "Kessa",
  "Rook", "Lio", "Ada", "Pax", "Mina", "Corin", "Zara", "Finn", "Esme", "Dax",
];

const lastNames = [
  "Vane", "Morrow", "Reef", "Calder", "Sorn", "Hale", "Dusk", "Quill", "Marrow", "Drake",
  "Tern", "Ash", "Gale", "Pike", "Wren", "Stone", "Rill", "Crow", "Vale", "Frost",
];

function resources(
  provisions: number,
  arms: number,
  medicine: number,
  shipMaterials: number,
): Resources {
  return { provisions, arms, medicine, shipMaterials };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function estimatedPrices(settlement: Settlement, factor: number): Resources {
  const base = resources(1.8, 5.6, 7.4, 4.5);
  return {
    provisions: Math.round(base.provisions * clamp(settlement.targetStocks.provisions / Math.max(1, settlement.stocks.provisions), 0.55, 2.5) * factor * 100) / 100,
    arms: Math.round(base.arms * clamp(settlement.targetStocks.arms / Math.max(1, settlement.stocks.arms), 0.55, 2.5) * factor * 100) / 100,
    medicine: Math.round(base.medicine * clamp(settlement.targetStocks.medicine / Math.max(1, settlement.stocks.medicine), 0.55, 2.5) * factor * 100) / 100,
    shipMaterials: Math.round(base.shipMaterials * clamp(settlement.targetStocks.shipMaterials / Math.max(1, settlement.stocks.shipMaterials), 0.55, 2.5) * factor * 100) / 100,
  };
}

function makeSettlement(
  values: Omit<Settlement, "ownerId" | "workers" | "targetStocks" | "surrender">,
): Settlement {
  return {
    ...values,
    ownerId: null,
    workers: Math.round(values.population * 0.42),
    targetStocks: resources(180, 90, 70, 100),
    surrender: null,
  };
}

function personalityFor(archetype: string, rng: DeterministicRng): Personality {
  const base: Personality = {
    ambition: rng.between(0.25, 0.75),
    aggression: rng.between(0.15, 0.65),
    caution: rng.between(0.25, 0.8),
    loyalty: rng.between(0.3, 0.85),
    curiosity: rng.between(0.2, 0.85),
    commerce: rng.between(0.15, 0.8),
  };

  if (archetype === "raider") {
    base.aggression = rng.between(0.78, 0.98);
    base.ambition = rng.between(0.7, 0.95);
    base.caution = rng.between(0.1, 0.35);
  } else if (archetype === "merchant") {
    base.commerce = rng.between(0.8, 0.98);
    base.aggression = rng.between(0.05, 0.25);
  } else if (archetype === "officer") {
    base.loyalty = rng.between(0.75, 0.98);
    base.caution = rng.between(0.5, 0.85);
  } else if (archetype === "explorer") {
    base.curiosity = rng.between(0.82, 0.99);
  }

  return base;
}

function makeCharacter(
  index: number,
  rng: DeterministicRng,
  settlementIds: string[],
): Character {
  const archetypes = ["officer", "merchant", "explorer", "raider", "steward"];
  const archetype = archetypes[index % archetypes.length];
  const locationId = settlementIds[index % settlementIds.length];
  const factionId = index < 13 ? "world-government" : index < 22 ? "free-tide" : null;
  const veteran = index === 0 || index === 13;

  return {
    id: `character-${String(index + 1).padStart(2, "0")}`,
    name: `${firstNames[index % firstNames.length]} ${lastNames[(index * 7 + Math.floor(index / firstNames.length) * 3) % lastNames.length]}`,
    archetype,
    factionId,
    locationId,
    travel: null,
    money: rng.integer(90, 260),
    cargo: resources(rng.integer(18, 38), rng.integer(0, 5), rng.integer(0, 4), rng.integer(0, 6)),
    health: 100,
    morale: rng.integer(70, 100),
    sailors: rng.integer(8, 22),
    troops: {
      count: veteran ? rng.integer(75, 105) : rng.integer(12, 48),
      experience: veteran ? rng.between(0.55, 0.8) : rng.between(0.05, 0.35),
      discipline: archetype === "officer" ? rng.between(0.7, 0.92) : rng.between(0.35, 0.78),
    },
    attributes: {
      power: veteran ? rng.integer(68, 82) : rng.integer(20, 55),
      speed: veteran ? rng.integer(60, 78) : rng.integer(20, 55),
      endurance: veteran ? rng.integer(65, 82) : rng.integer(25, 58),
      resilience: veteran ? rng.integer(65, 82) : rng.integer(25, 58),
    },
    skills: {
      strategy: archetype === "officer" ? rng.integer(58, 86) : rng.integer(18, 60),
      leadership: veteran ? rng.integer(70, 90) : rng.integer(20, 68),
      navigation: archetype === "explorer" ? rng.integer(60, 88) : rng.integer(20, 65),
      trade: archetype === "merchant" ? rng.integer(64, 90) : rng.integer(15, 60),
    },
    personality: personalityFor(archetype, rng),
    controller: { kind: "autonomous" },
    goals: [],
    activeGoalId: null,
    plan: null,
    relationships: {},
    knowledge: {},
    standingOrders: [],
    lastPlanReviewTick: -1,
    currentGoal: "establish-position",
    lastDecisionTick: -1,
    lastBattleTick: -100,
    victories: 0,
    defeats: 0,
  };
}

function goalsFor(character: Character): CharacterGoal[] {
  const goals: CharacterGoal[] = [
    {
      id: `${character.id}:material-security`,
      kind: "material-security",
      label: "Keep the party secure and well supplied",
      priority: 0.52 + character.personality.caution * 0.28,
      progress: 0,
      status: "active",
      origin: "universal survival motive",
      createdTick: 0,
    },
  ];
  const archetypeGoal = {
    merchant: ["build-wealth", "Build a durable trading fortune"],
    explorer: ["explore-world", "Discover distant opportunities"],
    raider: ["expand-influence", "Win recognition through daring victories"],
    officer: ["serve-faction", "Strengthen and protect the faction"],
    steward: ["build-power", "Build a capable and respected party"],
  }[character.archetype] as [CharacterGoal["kind"], string];
  goals.push({
    id: `${character.id}:${archetypeGoal[0]}`,
    kind: archetypeGoal[0],
    label: archetypeGoal[1],
    priority: 0.58 + character.personality.ambition * 0.32,
    progress: 0,
    status: "active",
    origin: `${character.archetype} root archetype`,
    createdTick: 0,
  });
  if (character.factionId && archetypeGoal[0] !== "serve-faction") {
    goals.push({
      id: `${character.id}:serve-faction`,
      kind: "serve-faction",
      label: "Advance the faction's interests",
      priority: 0.38 + character.personality.loyalty * 0.42,
      progress: 0,
      status: "active",
      origin: "faction membership",
      createdTick: 0,
    });
  }
  return goals;
}

function relationshipTo(
  characterId: string,
  rng: DeterministicRng,
  loyaltyBias = 0,
): Relationship {
  return {
    characterId,
    trust: clamp(rng.between(0.35, 0.68) + loyaltyBias, 0, 1),
    affinity: rng.between(0.25, 0.72),
    respect: clamp(rng.between(0.35, 0.72) + loyaltyBias * 0.7, 0, 1),
    fear: rng.between(0.04, 0.3),
    grievance: rng.between(0, 0.16),
    obligation: rng.between(0, 0.24),
    lastChangedTick: 0,
  };
}

function knowledgeFor(
  character: Character,
  settlements: Record<string, Settlement>,
  rng: DeterministicRng,
): Record<string, SettlementKnowledge> {
  return Object.fromEntries(Object.values(settlements).map((settlement) => {
    const direct = character.locationId === settlement.id;
    const factionReport = !direct && character.factionId !== null && character.factionId === settlement.factionId;
    const confidence = direct ? 1 : factionReport ? 0.76 : rng.between(0.22, 0.42);
    const factor = direct ? 1 : factionReport ? rng.between(0.88, 1.12) : rng.between(0.62, 1.42);
    const belief: SettlementKnowledge = {
      settlementId: settlement.id,
      observedTick: direct ? 0 : -rng.integer(3, 30),
      confidence,
      factionId: settlement.factionId,
      garrisonEstimate: Math.max(1, Math.round(settlement.garrison * factor)),
      stocksEstimate: {
        provisions: Math.round(settlement.stocks.provisions * factor),
        arms: Math.round(settlement.stocks.arms * factor),
        medicine: Math.round(settlement.stocks.medicine * factor),
        shipMaterials: Math.round(settlement.stocks.shipMaterials * factor),
      },
      priceEstimate: estimatedPrices(settlement, direct ? 1 : 2 - factor),
      source: direct ? "direct" : factionReport ? "faction-report" : "rumor",
    };
    return [settlement.id, belief];
  }));
}

function orderFor(character: Character): StandingOrder | null {
  if (!character.factionId) return null;
  const issuerId = character.factionId === "world-government" ? "character-01" : "character-14";
  if (character.id === issuerId) return null;
  const directive = character.archetype === "merchant"
    ? "trade-supplies"
    : character.archetype === "explorer"
      ? "explore"
      : character.factionId === "free-tide" && character.archetype === "raider"
        ? "pressure"
        : "protect";
  return {
    id: `${issuerId}:order:${character.id}`,
    issuerId,
    directive,
    targetId: directive === "pressure"
      ? "world-government"
      : directive === "protect"
        ? character.factionId === "world-government" ? "crown-harbor" : "cinder-key"
        : undefined,
    priority: character.factionId === "world-government" ? 0.78 : 0.67,
    issuedTick: 0,
    expiresTick: null,
    revision: 1,
    status: "pending",
    adherence: "unassessed",
    statusChangedTick: 0,
    deviationCount: 0,
    lastReport: null,
  };
}

export interface PrototypeWorldOptions {
  playerCharacterId?: string;
}

export function createPrototypeWorld(seed = 1847, options: PrototypeWorldOptions = {}): WorldState {
  const rng = new DeterministicRng(seed);
  const factions: Record<string, Faction> = {
    "world-government": {
      id: "world-government",
      name: "World Government",
      color: "#345995",
      treasury: 18_000,
      taxRate: 0.14,
    },
    "free-tide": {
      id: "free-tide",
      name: "Free Tide Compact",
      color: "#d05a47",
      treasury: 2_800,
      taxRate: 0.08,
    },
  };

  const settlements: Record<string, Settlement> = {
    "crown-harbor": makeSettlement({
      id: "crown-harbor",
      name: "Crown Harbor",
      position: { x: 24, y: 28 },
      factionId: "world-government",
      population: 18_000,
      focus: "arms",
      production: resources(5.5, 6.5, 2.2, 3.4),
      stocks: resources(220, 155, 82, 105),
      garrison: 260,
      fortification: 1.35,
      stability: 91,
    }),
    "verdant-cay": makeSettlement({
      id: "verdant-cay",
      name: "Verdant Cay",
      position: { x: 48, y: 69 },
      factionId: null,
      population: 7_200,
      focus: "provisions",
      production: resources(9.5, 1.1, 4.6, 2.2),
      stocks: resources(310, 48, 135, 66),
      garrison: 70,
      fortification: 1.08,
      stability: 78,
    }),
    "cinder-key": makeSettlement({
      id: "cinder-key",
      name: "Cinder Key",
      position: { x: 79, y: 31 },
      factionId: "free-tide",
      population: 6_400,
      focus: "shipMaterials",
      production: resources(3.2, 4.8, 1.4, 8.2),
      stocks: resources(96, 128, 42, 260),
      garrison: 115,
      fortification: 1.16,
      stability: 73,
    }),
    glassport: makeSettlement({
      id: "glassport",
      name: "Glassport",
      position: { x: 63, y: 48 },
      factionId: "world-government",
      population: 10_500,
      focus: "medicine",
      production: resources(4.1, 2.5, 7.7, 3.2),
      stocks: resources(145, 76, 215, 91),
      garrison: 155,
      fortification: 1.22,
      stability: 86,
    }),
  };

  const settlementIds = Object.keys(settlements);
  const characters: Record<string, Character> = {};
  for (let index = 0; index < 30; index += 1) {
    const character = makeCharacter(index, rng, settlementIds);
    characters[character.id] = character;
  }

  // Put a bold Free Tide captain within reach of an early consequential choice.
  characters["character-14"].locationId = "crown-harbor";
  characters["character-14"].personality.aggression = 0.97;
  characters["character-14"].personality.ambition = 0.94;
  characters["character-14"].personality.caution = 0.08;

  for (const character of Object.values(characters)) {
    character.goals = goalsFor(character);
    character.knowledge = knowledgeFor(character, settlements, rng);
    const order = orderFor(character);
    if (order) {
      character.standingOrders.push(order);
      character.relationships[order.issuerId] = relationshipTo(
        order.issuerId,
        rng,
        character.personality.loyalty * 0.18,
      );
    }
  }

  const playerCharacterId = options.playerCharacterId ?? "character-01";
  const playerCharacter = characters[playerCharacterId];
  if (!playerCharacter) throw new Error(`Unknown prototype player character: ${playerCharacterId}`);
  playerCharacter.controller = { kind: "human", playerId: "prototype-player" };

  // Give co-located characters a small social history independent of hierarchy.
  for (const character of Object.values(characters)) {
    const neighbor = Object.values(characters).find((candidate) =>
      candidate.id !== character.id &&
      candidate.locationId === character.locationId &&
      !character.relationships[candidate.id]
    );
    if (neighbor) character.relationships[neighbor.id] = relationshipTo(neighbor.id, rng);
  }

  const initialReportingOfficerId = Object.values(characters)
    .filter((character) =>
      character.controller.kind === "autonomous" &&
      character.factionId !== null &&
      character.factionId === playerCharacter.factionId
    )
    .sort((left, right) =>
      (right.skills.leadership + right.personality.loyalty * 50) -
        (left.skills.leadership + left.personality.loyalty * 50) ||
      left.id.localeCompare(right.id)
    )[0]?.id ?? null;

  return {
    version: 4,
    scenario: "four-island-pressure-test",
    seed,
    rngState: rng.state,
    tick: 0,
    ticksPerDay: 6,
    nextEventSequence: 1,
    nextCommandSequence: 1,
    nextThreadSequence: 1,
    nextMessageSequence: 1,
    nextReplySequence: 1,
    factions,
    settlements,
    characters,
    players: {
      "prototype-player": {
        id: "prototype-player",
        displayName: "Prototype Commander",
        characterId: playerCharacterId,
        knownCharacterIds: Object.keys(characters),
        conversationTagScores: {},
        briefingAcknowledgements: {},
        routineBriefingThroughSequence: 0,
        reportingOfficerId: initialReportingOfficerId,
      },
    },
    pendingCommands: [],
    activeBattles: {},
    conversationThreads: {},
    conversationMessages: [],
    scheduledReplies: [],
  };
}
