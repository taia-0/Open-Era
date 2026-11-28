// npc-threads.md reference hook (stored mode). Harness only. Runs after runTick, beside resolveDueReplies
// (src/dashboard/server.ts:168-170, src/cli/run-simulation.ts:93-95). Not inside runTick.
// Every decision reads the world and this tick's events. It keeps no state of its own: the throttles read stored threads.
import { classifyMessage } from "../../../src/sim/conversations.ts";
import { applyEvent } from "../../../src/sim/state.ts";
import type { ConversationMessage, ConversationThread, EventDraft, SimEvent, WorldState } from "../../../src/sim/types.ts";
import { candidatesFor, humans, WINDOW, type Candidate, type Topic } from "./triggers.ts";

export interface Caps { perReceiver: number; perPair: number; perSender: number } // openers per 100 ticks
export const NO_CAPS: Caps = { perReceiver: Infinity, perPair: Infinity, perSender: Infinity };
export interface Drop { reason: "not-visible" | "sender-unknown" | "pair-open" | "cap-receiver" | "cap-pair" | "cap-sender"; topic: Topic; trigger: string }
export interface Opened { c: Candidate; threadId: string; messageId: string; newThread: boolean }

function emit(world: WorldState, events: SimEvent[], draft: EventDraft): void {
  const ev: SimEvent = { sequence: world.nextEventSequence, tick: world.tick, ...draft };
  applyEvent(world, ev);
  events.push(ev);
}

/** The one storage addition: an optional provenance mark on an NPC opener. Absent on every human message and every reply. */
export type Origin = { trigger: string; sequence: number };
type Marked = ConversationMessage & { origin?: Origin };
const originOf = (m: ConversationMessage): Origin | undefined => (m as Marked).origin;
const isOpener = (m: ConversationMessage) => originOf(m) !== undefined;

export function openNpcThreads(world: WorldState, tickEvents: SimEvent[], caps: Caps, drops: Drop[], opened: Opened[]): SimEvent[] {
  const events: SimEvent[] = [];
  const player = Object.values(world.players)[0];
  const humanIds = humans(world);
  for (const ev of tickEvents) {
    for (const c of candidatesFor(world, ev, "human")) {
      const drop = (reason: Drop["reason"]) => drops.push({ reason, topic: c.topic, trigger: c.trigger });
      if (c.summary === null) { drop("not-visible"); continue; }
      if (!player.knownCharacterIds.includes(c.senderId)) { drop("sender-unknown"); continue; }
      const participantIds = [c.senderId, c.receiverId].sort();
      const direct = Object.values(world.conversationThreads).find((t) => t.kind === "direct" && t.participantIds.length === 2 && t.participantIds[0] === participantIds[0] && t.participantIds[1] === participantIds[1]);
      const msgs = direct ? world.conversationMessages.filter((m) => m.threadId === direct.id) : [];
      // Pair rule: one unanswered opener per (sender, receiver, trigger type). Answered = the receiver wrote after it.
      const lastOpener = [...msgs].reverse().find((m) => isOpener(m) && m.senderId === c.senderId && originOf(m)!.trigger === c.trigger);
      const answered = lastOpener ? msgs.some((m) => m.senderId === c.receiverId && m.createdTick >= lastOpener.createdTick) : true;
      if (lastOpener && !answered && c.tick - lastOpener.createdTick < WINDOW) { drop("pair-open"); continue; }
      // Rate caps read stored openers in the last 100 ticks.
      const recent = world.conversationMessages.filter((m) => isOpener(m) && m.createdTick > c.tick - 100);
      const inThread = (m: ConversationMessage) => world.conversationThreads[m.threadId]?.participantIds ?? [];
      if (recent.filter((m) => inThread(m).includes(c.receiverId) && m.senderId !== c.receiverId).length >= caps.perReceiver) { drop("cap-receiver"); continue; }
      if (recent.filter((m) => m.senderId === c.senderId && inThread(m).includes(c.receiverId)).length >= caps.perPair) { drop("cap-pair"); continue; }
      if (recent.filter((m) => m.senderId === c.senderId).length >= caps.perSender) { drop("cap-sender"); continue; }
      void humanIds;

      let thread: ConversationThread | undefined = direct;
      let newThread = false;
      if (!thread) {
        thread = {
          id: `thread-${String(world.nextThreadSequence).padStart(5, "0")}`, kind: "direct", title: world.characters[c.senderId].name.slice(0, 60),
          participantIds, createdById: c.senderId, createdTick: world.tick, lastMessageTick: null,
        };
        emit(world, events, { type: "conversation-thread-created", actorId: c.senderId, targetId: c.receiverId, data: { thread, nextThreadSequence: world.nextThreadSequence + 1 } });
        newThread = true;
      }
      const message: Marked = {
        id: `message-${String(world.nextMessageSequence).padStart(6, "0")}`, threadId: thread.id, senderId: c.senderId, body: c.text.slice(0, 800),
        createdTick: world.tick, source: "autonomous", tags: classifyMessage(c.text), origin: { trigger: c.trigger, sequence: c.sequence },
      };
      emit(world, events, { type: "conversation-message-sent", actorId: c.senderId, targetId: c.receiverId, data: { message, nextMessageSequence: world.nextMessageSequence + 1 } });
      opened.push({ c, threadId: thread.id, messageId: message.id, newThread });
    }
  }
  return events;
}

/** The request tab, per the Lead's ruling: incoming threads the viewer has not answered. */
export function requestThreads(world: WorldState, viewerId: string): string[] {
  return Object.values(world.conversationThreads)
    .filter((t) => t.participantIds.includes(viewerId) && t.createdById !== viewerId)
    .filter((t) => !world.conversationMessages.some((m) => m.threadId === t.id && m.senderId === viewerId))
    .sort((a, b) => (b.lastMessageTick ?? -1) - (a.lastMessageTick ?? -1) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((t) => t.id);
}
