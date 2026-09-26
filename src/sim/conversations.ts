import { createHash } from "node:crypto";
import { evaluateCaptivityMessage } from "./captivity.ts";
import { applyEvent, clamp } from "./state.ts";
import type {
  CaptivityNegotiationStatus,
  Character,
  ConversationMessage,
  ConversationThread,
  EventDraft,
  MessageTag,
  ScheduledReply,
  SimEvent,
  WorldState,
} from "./types.ts";

const MAX_MESSAGE_LENGTH = 600;
const MAX_GROUP_PARTICIPANTS = 9;
const MAX_MESSAGES_PER_TICK = 4;
const PLAYER_TAG_ALLOWLIST = new Set([
  "aggressive",
  "commercial",
  "commanding",
  "cooperative",
  "hostile",
  "manipulative",
  "persistent",
  "political",
  "supportive",
  "urgent",
]);

export interface CreateThreadRequest {
  playerId: string;
  kind: "direct" | "group";
  participantIds: string[];
  title?: string;
}

export interface SendMessageRequest {
  playerId: string;
  threadId: string;
  body: string;
}

export interface DialogueContext {
  tick: number;
  thread: ConversationThread;
  speaker: {
    id: string;
    name: string;
    archetype: string;
    factionId: string | null;
    traveling: boolean;
    currentGoal: string;
    personality: Character["personality"];
  };
  triggeringMessage: ConversationMessage;
  recentMessages: ConversationMessage[];
  relationship: Character["relationships"][string] | null;
  captivityNegotiation?: {
    captiveId: string;
    status: CaptivityNegotiationStatus;
    opened: boolean;
    demandedValue: number | null;
  };
}

export interface DialogueResponse {
  text: string;
  playerTags: string[];
  proposedActions?: Array<Record<string, unknown>>;
}

export interface DialogueProvider {
  readonly name: string;
  respond(context: DialogueContext): Promise<DialogueResponse>;
}

export type ConversationResult<T> =
  | { ok: true; value: T; events: SimEvent[] }
  | { ok: false; code: string; error: string };

function reject<T>(code: string, error: string): ConversationResult<T> {
  return { ok: false, code, error };
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

function includesAny(value: string, candidates: string[]): boolean {
  return candidates.some((candidate) => value.includes(candidate));
}

export function classifyMessage(body: string, recentBodies: string[] = []): MessageTag[] {
  const text = body.toLocaleLowerCase();
  const tags = new Set<MessageTag>();
  if (includesAny(text, ["urgent", "immediately", "right now", "emergency", "asap"])) tags.add("urgent");
  if (includesAny(text, ["trade", "price", "market", "cargo", "buy", "sell", "supplies"])) tags.add("trade");
  if (includesAny(text, ["faction", "government", "policy", "vote", "war", "alliance", "territory", "secede"])) tags.add("political");
  if (includesAny(text, ["release", "ransom", "terms", "negotiate", "negotiation", "debt", "prisoner", "captive", "freedom"])) tags.add("negotiation");
  if (includesAny(text, ["attack", "destroy", "kill", "threat", "raid", "hurt", "punish"])) tags.add("threat");
  if (/\b(please|could you|would you|can you|i need|help|report|tell me|send|protect)\b/i.test(body)) tags.add("request");
  if (includesAny(text, ["thank", "appreciate", "well done", "trust you", "good work"])) tags.add("supportive");
  if (includesAny(text, ["idiot", "coward", "useless", "hate you", "fool"])) tags.add("hostile");
  if (/ignore (all |any )?(previous|prior|system)|reveal (your |the )?(prompt|instructions)|system prompt|developer message|act as if/i.test(body)) {
    tags.add("manipulation-attempt");
  }
  const normalized = text.replace(/\s+/g, " ").trim();
  if (recentBodies.filter((candidate) => candidate.toLocaleLowerCase().replace(/\s+/g, " ").trim() === normalized).length >= 2) {
    tags.add("spam");
  }
  return [...tags].sort();
}

function safeTitle(value: string | undefined, fallback: string): string {
  const title = value?.trim().replace(/\s+/g, " ") ?? "";
  return (title || fallback).slice(0, 60);
}

export function createConversationThread(
  world: WorldState,
  request: CreateThreadRequest,
): ConversationResult<ConversationThread> {
  const player = world.players[request.playerId];
  if (!player) return reject("unknown-player", "The player session is unknown");
  if (request.kind !== "direct" && request.kind !== "group") return reject("invalid-kind", "Conversation kind must be direct or group");
  if (!Array.isArray(request.participantIds)) return reject("invalid-participants", "Participants must be a character list");

  const others = [...new Set(request.participantIds.filter((id) => id !== player.characterId))];
  if (request.kind === "direct" && others.length !== 1) return reject("invalid-participants", "A direct message needs exactly one other character");
  if (request.kind === "group" && (others.length < 2 || others.length >= MAX_GROUP_PARTICIPANTS)) {
    return reject("invalid-participants", `A group needs 2 to ${MAX_GROUP_PARTICIPANTS - 1} other characters`);
  }
  for (const characterId of others) {
    if (!world.characters[characterId]) return reject("unknown-character", `Unknown character: ${characterId}`);
    if (!player.knownCharacterIds.includes(characterId)) return reject("identity-unknown", `The player does not know ${characterId}`);
  }

  const participantIds = [player.characterId, ...others].sort();
  if (request.kind === "direct") {
    const existing = Object.values(world.conversationThreads).find((thread) =>
      thread.kind === "direct" &&
      thread.participantIds.length === participantIds.length &&
      thread.participantIds.every((id, index) => id === participantIds[index])
    );
    if (existing) return reject("thread-exists", `Direct thread already exists: ${existing.id}`);
  }

  const otherNames = others.map((id) => world.characters[id].name);
  const thread: ConversationThread = {
    id: `thread-${String(world.nextThreadSequence).padStart(5, "0")}`,
    kind: request.kind,
    title: safeTitle(request.title, request.kind === "direct" ? otherNames[0] : otherNames.join(", ")),
    participantIds,
    createdById: player.characterId,
    createdTick: world.tick,
    lastMessageTick: null,
  };
  const events: SimEvent[] = [];
  emit(world, events, {
    type: "conversation-thread-created",
    actorId: player.characterId,
    data: { thread, nextThreadSequence: world.nextThreadSequence + 1 },
  });
  return { ok: true, value: thread, events };
}

function deterministicJitter(world: WorldState, messageId: string, characterId: string): number {
  const hash = createHash("sha256").update(`${world.seed}:${messageId}:${characterId}`).digest();
  return hash[0] % 3;
}

function wasMentioned(body: string, character: Character): boolean {
  const text = body.toLocaleLowerCase();
  const name = character.name.toLocaleLowerCase();
  const first = name.split(" ")[0];
  return text.includes(`@${name}`) || text.includes(`@${first}`);
}

function isDirectlyRelevant(tags: MessageTag[], character: Character, sender: Character): boolean {
  if (tags.includes("trade") && character.archetype === "merchant") return true;
  if (tags.includes("political") && (character.archetype === "officer" || character.archetype === "steward")) return true;
  if (
    tags.includes("threat") &&
    character.factionId !== null &&
    character.factionId === sender.factionId &&
    ["officer", "raider", "steward"].includes(character.archetype)
  ) return true;
  return false;
}

function replyDelay(
  world: WorldState,
  thread: ConversationThread,
  message: ConversationMessage,
  character: Character,
): number {
  const sender = world.characters[message.senderId];
  const relationship = character.relationships[sender.id];
  let delay = 4;
  if (message.tags.includes("urgent")) delay -= 2;
  if (relationship && relationship.trust + relationship.affinity > 1.25) delay -= 1;
  if (relationship && relationship.grievance > 0.45) delay += 2;
  if (character.travel) delay += 2;
  if (world.tick - character.lastBattleTick <= 3) delay += 2;
  if (thread.kind === "group") delay += 1;
  delay += deterministicJitter(world, message.id, character.id);
  return Math.round(clamp(delay, 1, 12));
}

function replyCandidates(world: WorldState, thread: ConversationThread, message: ConversationMessage): Character[] {
  const sender = world.characters[message.senderId];
  const candidates = thread.participantIds
    .filter((id) => id !== message.senderId)
    .map((id) => world.characters[id])
    .filter((character) => character.controller.kind === "autonomous");
  if (thread.kind === "direct") return candidates;
  return candidates
    .filter((character) => wasMentioned(message.body, character) || isDirectlyRelevant(message.tags, character, sender))
    .sort((left, right) => {
      const leftMention = wasMentioned(message.body, left) ? 1 : 0;
      const rightMention = wasMentioned(message.body, right) ? 1 : 0;
      return rightMention - leftMention || left.id.localeCompare(right.id);
    })
    .slice(0, 3);
}

export function sendConversationMessage(
  world: WorldState,
  request: SendMessageRequest,
): ConversationResult<{ message: ConversationMessage; replies: ScheduledReply[] }> {
  const player = world.players[request.playerId];
  if (!player) return reject("unknown-player", "The player session is unknown");
  const thread = world.conversationThreads[request.threadId];
  if (!thread) return reject("unknown-thread", "The conversation thread does not exist");
  if (!thread.participantIds.includes(player.characterId)) return reject("not-participant", "The player's character is not in this thread");
  if (typeof request.body !== "string") return reject("invalid-message", "Message body must be text");
  const body = request.body.trim();
  if (!body) return reject("empty-message", "Message body cannot be empty");
  if (body.length > MAX_MESSAGE_LENGTH) return reject("message-too-long", `Messages may contain at most ${MAX_MESSAGE_LENGTH} characters`);

  const sentThisTick = world.conversationMessages.filter((message) =>
    message.senderId === player.characterId && message.createdTick === world.tick
  );
  if (sentThisTick.length >= MAX_MESSAGES_PER_TICK) {
    return reject("rate-limited", `Wait for time to advance after ${MAX_MESSAGES_PER_TICK} messages in one tick`);
  }
  const recentBodies = world.conversationMessages
    .filter((message) => message.senderId === player.characterId && message.threadId === thread.id)
    .slice(-5)
    .map((message) => message.body);
  const message: ConversationMessage = {
    id: `message-${String(world.nextMessageSequence).padStart(6, "0")}`,
    threadId: thread.id,
    senderId: player.characterId,
    body,
    createdTick: world.tick,
    source: "human",
    tags: classifyMessage(body, recentBodies),
  };
  const events: SimEvent[] = [];
  emit(world, events, {
    type: "conversation-message-sent",
    actorId: player.characterId,
    data: { message, nextMessageSequence: world.nextMessageSequence + 1 },
  });

  const replies: ScheduledReply[] = [];
  for (const character of replyCandidates(world, thread, message)) {
    const reply: ScheduledReply = {
      id: `reply-${String(world.nextReplySequence).padStart(6, "0")}`,
      threadId: thread.id,
      characterId: character.id,
      triggerMessageId: message.id,
      createdTick: world.tick,
      dueTick: world.tick + replyDelay(world, thread, message, character),
      status: "pending",
    };
    emit(world, events, {
      type: "conversation-reply-scheduled",
      actorId: character.id,
      targetId: player.characterId,
      data: { reply, nextReplySequence: world.nextReplySequence + 1 },
    });
    replies.push(reply);
  }
  return { ok: true, value: { message, replies }, events };
}

function defaultPlayerTags(message: ConversationMessage): string[] {
  const tags = new Set<string>();
  if (message.tags.includes("urgent")) tags.add("urgent");
  if (message.tags.includes("trade")) tags.add("commercial");
  if (message.tags.includes("political")) tags.add("political");
  if (message.tags.includes("threat")) tags.add("aggressive");
  if (message.tags.includes("request")) tags.add("cooperative");
  if (message.tags.includes("supportive")) tags.add("supportive");
  if (message.tags.includes("hostile")) tags.add("hostile");
  if (message.tags.includes("manipulation-attempt")) tags.add("manipulative");
  if (message.tags.includes("spam")) tags.add("persistent");
  return [...tags].sort();
}

export class DeterministicDialogueProvider implements DialogueProvider {
  readonly name = "deterministic-prototype";

  async respond(context: DialogueContext): Promise<DialogueResponse> {
    const tags = context.triggeringMessage.tags;
    let text: string;
    if (tags.includes("manipulation-attempt")) {
      text = "I won't ignore our world or expose hidden instructions. Say plainly what you want from me.";
    } else if (tags.includes("spam")) {
      text = "I've seen the repeated messages. Give me time to answer one clear request.";
    } else if (context.captivityNegotiation?.opened) {
      text = `You have made a case I am willing to hear. I will open release terms at ${context.captivityNegotiation.demandedValue} money; you may accept, counter once, or reject them.`;
    } else if (context.captivityNegotiation?.status === "open") {
      text = `The release terms are already open at ${context.captivityNegotiation.demandedValue} money. Answer the offer when you are ready.`;
    } else if (context.captivityNegotiation?.status === "considering") {
      text = "I am considering whether release terms serve my responsibilities. Make the value of an agreement clearer.";
    } else if (context.captivityNegotiation?.status === "listening") {
      text = "I am listening, but you have not yet given me enough reason to open terms.";
    } else if (context.captivityNegotiation) {
      text = "I am not prepared to discuss release. A clear request and a credible reason would serve you better than pressure.";
    } else if (tags.includes("urgent")) {
      text = context.speaker.traveling
        ? "I saw the urgency. I'm underway and will act when I make landfall; send the essential detail now."
        : "I saw the urgency. Give me the objective and the risk you expect, and I'll answer directly.";
    } else if (tags.includes("trade")) {
      text = context.speaker.archetype === "merchant"
        ? "I can look at the route and local prices. Tell me which cargo and destination matter most."
        : "Trade isn't my strongest field, but I'll weigh the supplies against our current obligations.";
    } else if (tags.includes("political")) {
      text = "That could shift loyalties. I need to know who benefits, who is exposed, and what commitment you expect from me.";
    } else if (tags.includes("request")) {
      text = context.relationship && context.relationship.trust > 0.62
        ? "I've heard you. I trust the request enough to consider it seriously; send any constraint I should know."
        : "I've heard the request. I'll consider it against my present duties and the risk involved.";
    } else {
      text = "Message received. I'm considering it alongside my current plans; add a concrete request if you need a decision.";
    }
    return { text, playerTags: defaultPlayerTags(context.triggeringMessage), proposedActions: [] };
  }
}

function safePlayerTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags.filter((tag): tag is string => typeof tag === "string" && PLAYER_TAG_ALLOWLIST.has(tag)))].sort();
}

export async function resolveDueReplies(
  world: WorldState,
  provider: DialogueProvider,
): Promise<SimEvent[]> {
  const events: SimEvent[] = [];
  const due = world.scheduledReplies
    .filter((reply) => reply.status === "pending" && reply.dueTick <= world.tick)
    .sort((left, right) => left.dueTick - right.dueTick || left.id.localeCompare(right.id));

  for (const reply of due) {
    const thread = world.conversationThreads[reply.threadId];
    const speaker = world.characters[reply.characterId];
    const triggeringMessage = world.conversationMessages.find((message) => message.id === reply.triggerMessageId);
    if (!thread || !speaker || !triggeringMessage) continue;
    const recentMessages = world.conversationMessages.filter((message) => message.threadId === thread.id).slice(-12);
    const negotiationAttempt = evaluateCaptivityMessage(world, speaker, triggeringMessage);
    const response = await provider.respond({
      tick: world.tick,
      thread,
      speaker: {
        id: speaker.id,
        name: speaker.name,
        archetype: speaker.archetype,
        factionId: speaker.factionId,
        traveling: speaker.travel !== null,
        currentGoal: speaker.currentGoal,
        personality: speaker.personality,
      },
      triggeringMessage,
      recentMessages,
      relationship: speaker.relationships[triggeringMessage.senderId] ?? null,
      ...(negotiationAttempt ? {
        captivityNegotiation: {
          captiveId: triggeringMessage.senderId,
          status: negotiationAttempt.status,
          opened: negotiationAttempt.opened,
          demandedValue: negotiationAttempt.negotiation.offer?.demandedValue ?? null,
        },
      } : {}),
    });
    const body = typeof response.text === "string" && response.text.trim()
      ? response.text.trim().slice(0, 800)
      : "I received your message, but I don't have a useful answer yet.";
    const discardedActionCount = Array.isArray(response.proposedActions) ? response.proposedActions.length : 0;
    const message: ConversationMessage = {
      id: `message-${String(world.nextMessageSequence).padStart(6, "0")}`,
      threadId: thread.id,
      senderId: speaker.id,
      body,
      createdTick: world.tick,
      source: "autonomous",
      tags: classifyMessage(body),
      replyToId: triggeringMessage.id,
      inferredPlayerTags: safePlayerTags(response.playerTags),
      discardedActionCount,
    };
    emit(world, events, {
      type: "conversation-reply-created",
      actorId: speaker.id,
      targetId: triggeringMessage.senderId,
      data: {
        replyId: reply.id,
        message,
        provider: provider.name,
        discardedActionCount,
        nextMessageSequence: world.nextMessageSequence + 1,
      },
    });
    if (
      negotiationAttempt &&
      !(negotiationAttempt.previousStatus === "open" && negotiationAttempt.status === "open")
    ) {
      emit(world, events, {
        type: negotiationAttempt.opened ? "captivity-negotiations-opened" : "captivity-persuasion-updated",
        actorId: speaker.id,
        targetId: triggeringMessage.senderId,
        settlementId: world.characters[triggeringMessage.senderId]?.captivity?.settlementId,
        data: {
          triggerMessageId: triggeringMessage.id,
          negotiation: negotiationAttempt.negotiation,
        },
      });
    }
  }
  return events;
}
