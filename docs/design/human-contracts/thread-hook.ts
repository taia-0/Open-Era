// human-contracts.md rev 2: a copy of npc-threads/hook.ts with additions: origin.contractId; contract rule in requestThreads (an offer leaves `request` on any
// close, expiry included, ruling 4); a no-longer-needed opener from the buyer to a human carrier; the expiry opener text. Harness only.
// npc-threads.md reference hook (stored mode). Harness only. Runs after runTick, beside resolveDueReplies
// (src/dashboard/server.ts:168-170, src/cli/run-simulation.ts:93-95). Not inside runTick.
// Every decision reads the world and this tick's events. It keeps no state of its own: the throttles read stored threads.
import { classifyMessage } from "../../../src/sim/conversations.ts";
import { applyEvent } from "../../../src/sim/state.ts";
import type { ConversationMessage, ConversationThread, EventDraft, SimEvent, WorldState } from "../../../src/sim/types.ts";
import { candidatesFor, humans, WINDOW, type Candidate, type Topic } from "../npc-threads/triggers.ts";
import { projectEventFeed } from "../../../src/dashboard/view-model.ts";

/** Rev 2 texts (rulings 3 and 4). No number in either: nothing to leak, nothing to scan. */
export const TEXT_NO_LONGER_NEEDED = (port: string) => `I no longer need that delivery: ${port} is stocked again. You are not penalised, and anything you bought is yours.`;
export const TEXT_OFFER_EXPIRED = "My offer lapsed before you answered. You lose nothing.";

/**
 * Rule 3: when the buyer cancels a human carrier's accepted contract because the shelf refilled, the event's actor is the carrier and its target is the buyer
 * (engine.ts resolveContractOutcomes), so the generic rule finds no human receiver. This rule swaps it: sender = buyer, receiver = the human carrier.
 * Rule 4: the expiry event is actor = buyer, target = carrier, so the generic rule already finds it; only its text is replaced.
 */
function contractCandidates(world: WorldState, ev: SimEvent): Candidate[] {
  const out = candidatesFor(world, ev, "human").map((c) => {
    if (c.topic === "contract" && ev.type === "contract-cancelled" && ev.data.reason === "offer-expired") return { ...c, template: "contract.offer-expired", text: TEXT_OFFER_EXPIRED };
    return c;
  });
  if (ev.type === "contract-cancelled" && ev.data.reason === "no-longer-needed") {
    const k = ev.data.contract as { carrierId: string; buyerId: string; destinationId: string };
    const carrier = world.characters[k.carrierId], buyer = world.characters[k.buyerId];
    if (carrier && !carrier.dead && buyer && !buyer.dead && humans(world).includes(carrier.id) && buyer.id !== carrier.id) {
      const rows = projectEventFeed(world, carrier.id, [ev]);
      const summary = rows.length ? String((rows[0] as Record<string, unknown>).summary ?? "") || null : null;
      out.push({
        topic: "contract", trigger: ev.type, sequence: ev.sequence, tick: ev.tick, senderId: buyer.id, receiverId: carrier.id, awaitsReply: false,
        template: "contract.cancelled-no-longer-needed", summary, visibleNumbers: rows.length ? (JSON.stringify(rows[0]).match(/\d+(?:\.\d+)?/g) ?? []) : [],
        text: TEXT_NO_LONGER_NEEDED(world.settlements[k.destinationId]?.name ?? "the port"),
      });
    }
  }
  return out;
}

/** Messages after the player's read marker; the whole thread if the marker is null (npc-threads 5.1, the thread_reads side table). */
export function unreadCount(world: WorldState, threadId: string, lastReadTick: number | null): number {
  return world.conversationMessages.filter((m) => m.threadId === threadId && (lastReadTick === null || m.createdTick > lastReadTick)).length;
}

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
export type Origin = { trigger: string; sequence: number; orderId?: string; contractId?: string };
type Marked = ConversationMessage & { origin?: Origin };
const originOf = (m: ConversationMessage): Origin | undefined => (m as Marked).origin;
const isOpener = (m: ConversationMessage) => originOf(m) !== undefined;

export function openNpcThreads(world: WorldState, tickEvents: SimEvent[], caps: Caps, drops: Drop[], opened: Opened[]): SimEvent[] {
  const events: SimEvent[] = [];
  const player = Object.values(world.players)[0];
  const humanIds = humans(world);
  for (const ev of tickEvents) {
    for (const c of contractCandidates(world, ev)) {
      const drop = (reason: Drop["reason"]) => drops.push({ reason, topic: c.topic, trigger: c.trigger });
      if (c.summary === null) { drop("not-visible"); continue; }
      if (!player.knownCharacterIds.includes(c.senderId)) { drop("sender-unknown"); continue; }
      const participantIds = [c.senderId, c.receiverId].sort();
      const direct = Object.values(world.conversationThreads).find((t) => t.kind === "direct" && t.participantIds.length === 2 && t.participantIds[0] === participantIds[0] && t.participantIds[1] === participantIds[1]);
      const msgs = direct ? world.conversationMessages.filter((m) => m.threadId === direct.id) : [];
      // Pair rule: one unanswered opener per (sender, receiver, trigger type). Answered = the receiver wrote after it.
      const lastOpener = [...msgs].reverse().find((m) => isOpener(m) && m.senderId === c.senderId && originOf(m)!.trigger === c.trigger);
      // human-contracts: a contract-offered opener is also answered once its contract has left `offered` (the human answers by command, not by message).
      const contractClosed = (m: ConversationMessage) => { const id = originOf(m)?.contractId; const k = id ? world.contracts?.[id] : undefined; return originOf(m)?.trigger === "contract-offered" && !!k && k.status !== "offered"; };
      const answered = lastOpener ? msgs.some((m) => m.senderId === c.receiverId && m.createdTick >= lastOpener.createdTick) || contractClosed(lastOpener) : true;
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
      const contract = ev.type.startsWith("contract-") ? (ev.data.contract as { id?: string } | undefined) : undefined;
      const contractId = contract?.id;
      const message: Marked = {
        id: `message-${String(world.nextMessageSequence).padStart(6, "0")}`, threadId: thread.id, senderId: c.senderId, body: c.text.slice(0, 800),
        createdTick: world.tick, source: "autonomous", tags: classifyMessage(c.text), origin: { trigger: c.trigger, sequence: c.sequence, ...(c.orderId ? { orderId: c.orderId } : {}), ...(contractId ? { contractId } : {}) },
      };
      emit(world, events, { type: "conversation-message-sent", actorId: c.senderId, targetId: c.receiverId, data: { message, nextMessageSequence: world.nextMessageSequence + 1 } });
      opened.push({ c, threadId: thread.id, messageId: message.id, newThread });
    }
  }
  return events;
}

/**
 * The request tab: incoming threads the viewer has not answered.
 * Lead 2026-11-27 ruling 5, narrowed: only the player's own `confirm-order` or `cancel-order` answers an
 * order thread. An `issuer-silent` auto-close does not. Read from the order: a confirm leaves
 * `status` "completed" with `lastReport.kind` "confirmed" (state.ts `standing-order-completed`); a cancel
 * leaves `status` "cancelled"; the silent close leaves "completed" with `lastReport.kind` "closed-unanswered".
 * (An autonomous issuer's own judgment also writes "confirmed", but the viewer here is a human issuer, who
 * never "judges", engine.ts confirmUnansweredOrders.)
 */
function orderAnswered(world: WorldState, threadId: string): boolean {
  const msgs = world.conversationMessages.filter((m) => m.threadId === threadId);
  const opener = [...msgs].reverse().find((m) => originOf(m)?.trigger === "standing-order-completion-reported");
  const orderId = opener ? originOf(opener)?.orderId : undefined;
  if (!orderId) return false;
  const order = Object.values(world.characters).flatMap((c) => c.standingOrders).find((o) => o.id === orderId);
  if (!order) return false;
  return order.status === "cancelled" || (order.status === "completed" && order.lastReport?.kind === "confirmed");
}

/**
 * A contract-offer thread is answered by the viewer's own accept or decline, as for orders: the contract left `offered`
 * for any status. Ruling 4: a lapsed offer also leaves `request` (nothing is left to act on); its expiry message stays unread.
 */
function contractAnswered(world: WorldState, threadId: string): boolean {
  const msgs = world.conversationMessages.filter((m) => m.threadId === threadId);
  const opener = [...msgs].reverse().find((m) => originOf(m)?.trigger === "contract-offered");
  const contractId = opener ? originOf(opener)?.contractId : undefined;
  if (!contractId) return false;
  const contract = world.contracts?.[contractId];
  if (!contract) return false;
  return contract.status !== "offered";
}

export function requestThreads(world: WorldState, viewerId: string): string[] {
  return Object.values(world.conversationThreads)
    .filter((t) => t.participantIds.includes(viewerId) && t.createdById !== viewerId)
    .filter((t) => !world.conversationMessages.some((m) => m.threadId === t.id && m.senderId === viewerId))
    .filter((t) => !orderAnswered(world, t.id) && !contractAnswered(world, t.id))
    .sort((a, b) => (b.lastMessageTick ?? -1) - (a.lastMessageTick ?? -1) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((t) => t.id);
}
