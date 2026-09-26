import type {
  CaptivityNegotiationState,
  CaptivityReleaseOffer,
  CaptivityState,
  Character,
  ConversationMessage,
  WorldState,
} from "./types.ts";

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function selectCaptivityNegotiator(
  world: WorldState,
  captiveId: string,
  settlementId: string,
  captorFactionId: string | null,
): string | null {
  if (!captorFactionId) return null;
  const candidates = Object.values(world.characters)
    .filter((character) =>
      character.id !== captiveId &&
      character.controller.kind === "autonomous" &&
      character.factionId === captorFactionId
    )
    .sort((left, right) => {
      const leftLocal = left.locationId === settlementId ? 1 : 0;
      const rightLocal = right.locationId === settlementId ? 1 : 0;
      const leftAuthority = left.skills.leadership + left.skills.strategy * 0.35 +
        (left.archetype === "officer" || left.archetype === "steward" ? 12 : 0);
      const rightAuthority = right.skills.leadership + right.skills.strategy * 0.35 +
        (right.archetype === "officer" || right.archetype === "steward" ? 12 : 0);
      return rightLocal - leftLocal || rightAuthority - leftAuthority || left.id.localeCompare(right.id);
    });
  return candidates[0]?.id ?? null;
}

export function initialCaptivityNegotiation(negotiatorId: string | null): CaptivityNegotiationState {
  return {
    negotiatorId,
    persuasion: 0,
    status: "unreceptive",
    attempts: 0,
    lastAttemptTick: null,
    openedTick: null,
    offer: null,
  };
}

export function normalizeCaptivityNegotiation(captivity: CaptivityState): CaptivityState {
  captivity.negotiation ??= initialCaptivityNegotiation(null);
  captivity.negotiation.persuasion ??= 0;
  captivity.negotiation.status ??= "unreceptive";
  captivity.negotiation.attempts ??= 0;
  captivity.negotiation.lastAttemptTick ??= null;
  captivity.negotiation.openedTick ??= null;
  captivity.negotiation.offer ??= null;
  return captivity;
}

export function captivitySystemMaximum(character: Character, captivity: CaptivityState): number {
  const physicalAverage = Object.values(character.attributes).reduce((sum, value) => sum + value, 0) / 4;
  return round(clamp(50 + captivity.scatteredTroops.count * 2 + physicalAverage * 0.5, 75, 600), 2);
}

function statusFor(persuasion: number, threshold: number): CaptivityNegotiationState["status"] {
  if (persuasion >= threshold) return "open";
  if (persuasion >= threshold * 0.68) return "considering";
  if (persuasion >= threshold * 0.32) return "listening";
  return "unreceptive";
}

function persuasionThreshold(world: WorldState, captive: Character, negotiator: Character): number {
  const relationship = negotiator.relationships[captive.id];
  const daysHeld = captive.captivity
    ? (world.tick - captive.captivity.capturedTick) / world.ticksPerDay
    : 0;
  const relationshipHelp = relationship
    ? relationship.trust * 0.1 + relationship.affinity * 0.06 + relationship.respect * 0.08 + relationship.fear * 0.03
    : 0;
  const relationshipResistance = relationship?.grievance ?? 0;
  return clamp(
    0.5 +
      negotiator.personality.caution * 0.12 +
      negotiator.personality.loyalty * 0.12 +
      negotiator.personality.aggression * 0.05 +
      relationshipResistance * 0.14 -
      relationshipHelp -
      Math.min(0.12, daysHeld * 0.012),
    0.32,
    0.78,
  );
}

function persuasionDelta(message: ConversationMessage, negotiator: Character): number {
  const tags = message.tags;
  let delta = tags.includes("negotiation") ? 0.17 : 0.015;
  if (tags.includes("request")) delta += 0.07;
  if (tags.includes("supportive")) delta += 0.05;
  if (tags.includes("political")) delta += 0.025;
  if (tags.includes("urgent")) delta += 0.015 - negotiator.personality.caution * 0.02;
  if (tags.includes("threat")) delta -= 0.1 + negotiator.personality.caution * 0.08;
  if (tags.includes("hostile")) delta -= 0.15;
  if (tags.includes("spam")) delta -= 0.22;
  if (tags.includes("manipulation-attempt")) delta -= 0.28;
  return round(delta, 4);
}

function offerFor(
  world: WorldState,
  captive: Character,
  negotiator: Character,
  persuasion: number,
  message: ConversationMessage,
): CaptivityReleaseOffer {
  const captivity = captive.captivity!;
  const systemMaximum = captivitySystemMaximum(captive, captivity);
  const relationship = negotiator.relationships[captive.id];
  const daysHeld = (world.tick - captivity.capturedTick) / world.ticksPerDay;
  const ratio = clamp(
    0.76 +
      negotiator.personality.aggression * 0.1 +
      negotiator.personality.loyalty * 0.08 +
      negotiator.personality.commerce * 0.06 +
      (relationship?.grievance ?? 0) * 0.08 -
      (relationship?.trust ?? 0) * 0.08 -
      persuasion * 0.16 -
      Math.min(0.1, daysHeld * 0.01),
    0.45,
    1,
  );
  return {
    id: `offer-${message.id}-${negotiator.id}`,
    createdTick: world.tick,
    demandedValue: round(systemMaximum * ratio, 2),
    systemMaximum,
    countered: false,
  };
}

export interface NegotiationAttemptResult {
  negotiation: CaptivityNegotiationState;
  previousStatus: CaptivityNegotiationState["status"];
  status: CaptivityNegotiationState["status"];
  opened: boolean;
}

export function evaluateCaptivityMessage(
  world: WorldState,
  negotiator: Character,
  message: ConversationMessage,
): NegotiationAttemptResult | null {
  const captive = world.characters[message.senderId];
  const captivity = captive?.captivity;
  if (!captivity || captivity.negotiation.negotiatorId !== negotiator.id) return null;
  const current = captivity.negotiation;
  if (current.status === "open" && current.offer) {
    return { negotiation: current, previousStatus: "open", status: "open", opened: false };
  }
  const threshold = persuasionThreshold(world, captive, negotiator);
  const persuasion = round(clamp(current.persuasion + persuasionDelta(message, negotiator), 0, 1), 4);
  const status = statusFor(persuasion, threshold);
  const opened = status === "open";
  const negotiation: CaptivityNegotiationState = {
    ...current,
    persuasion,
    status,
    attempts: current.attempts + 1,
    lastAttemptTick: world.tick,
    openedTick: opened ? world.tick : current.openedTick,
    offer: opened ? offerFor(world, captive, negotiator, persuasion, message) : null,
  };
  return { negotiation, previousStatus: current.status, status, opened };
}

export function counterOfferAccepted(
  world: WorldState,
  captive: Character,
  proposedValue: number,
): boolean {
  const captivity = captive.captivity;
  const offer = captivity?.negotiation.offer;
  const negotiator = captivity?.negotiation.negotiatorId
    ? world.characters[captivity.negotiation.negotiatorId]
    : undefined;
  if (!captivity || !offer || !negotiator) return false;
  const relationship = negotiator.relationships[captive.id];
  const daysHeld = (world.tick - captivity.capturedTick) / world.ticksPerDay;
  const minimumRatio = clamp(
    0.62 +
      negotiator.personality.commerce * 0.12 +
      negotiator.personality.loyalty * 0.08 +
      negotiator.personality.aggression * 0.05 +
      (relationship?.grievance ?? 0) * 0.08 -
      (relationship?.trust ?? 0) * 0.08 -
      captivity.negotiation.persuasion * 0.08 -
      Math.min(0.08, daysHeld * 0.008),
    0.48,
    0.88,
  );
  return proposedValue >= round(offer.demandedValue * minimumRatio, 2);
}
