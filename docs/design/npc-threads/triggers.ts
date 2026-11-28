// npc-threads.md reference code. Harness only: not in src/, not imported by anything in src/.
// Pure read of existing events and the world after the tick. It writes nothing and draws no RNG.
import { projectEventFeed } from "../../../src/dashboard/view-model.ts";
import type { Character, SimEvent, WorldState } from "../../../src/sim/types.ts";

export type Topic = "order" | "contract" | "captivity" | "debt" | "diplomacy" | "secession";
export interface Candidate {
  topic: Topic;
  trigger: string;           // the source event type
  sequence: number;          // the source event sequence (the dedupe and audit key)
  tick: number;
  senderId: string;
  receiverId: string;
  orderId?: string;          // standing-order id, set on order-topic candidates (request-tab ruling 5)
  awaitsReply: boolean;      // true only where a player verb answers it (confirm-order)
  template: string;          // template id
  summary: string | null;    // the receiver's own projected feed sentence for this event, or null if not feed-visible
  text: string;
  visibleNumbers: string[];  // every number in the receiver's own projected feed row for the event (summary and payload)
}

export const WINDOW = 180; // CHECK_IN_TICKS, src/dashboard/view-model.ts:87
/** Topics the live rule opens. `debt` and the bare order acknowledgement are measured but off by default (see npc-threads.md). */
export const INCLUDE = new Set((process.env.INCLUDE ?? "order,contract,captivity,secession,diplomacy").split(","));
export const INCLUDE_ACCEPTED = process.env.INCLUDE_ACCEPTED === "1";

const lt = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export const humans = (w: WorldState): string[] => Object.values(w.players).map((p) => p.characterId);
const alive = (w: WorldState, id: string | undefined | null): Character | null => {
  const c = id ? w.characters[id] : undefined;
  return c && !c.dead ? c : null;
};

/** The sender for a faction-level record: the living owner of that faction's lowest-id port. */
export function factionRep(w: WorldState, factionId: string | null | undefined, exclude: string[] = []): string | null {
  if (!factionId) return null;
  const ports = Object.values(w.settlements).filter((s) => s.factionId === factionId && s.ownerId).sort((a, b) => lt(a.id, b.id));
  for (const p of ports) {
    const c = alive(w, p.ownerId);
    if (c && !exclude.includes(c.id) && c.controller.kind !== "human" && c.captivity === null) return c.id;
  }
  return null;
}

const factionIdsOf = (d: Record<string, any>): string[] => (d.alliance?.factionIds ?? d.peace?.factionIds ?? d.factionIds ?? []) as string[];

/**
 * Which existing events can open a thread, and from whom to whom. `receivers` limits who may receive:
 * the human characters in the live rule, every character in the proxy stream.
 * Returned in a fixed order: by event, then by receiver id.
 */
export function candidatesFor(w: WorldState, ev: SimEvent, receivers: "human" | "any"): Candidate[] {
  const d = ev.data as Record<string, any>;
  const out: Candidate[] = [];
  const humanIds = humans(w);
  const okReceiver = (id: string) => {
    const c = alive(w, id);
    return !!c && (receivers === "any" || humanIds.includes(id));
  };
  const push = (c: Omit<Candidate, "tick" | "sequence" | "trigger" | "summary" | "text" | "template" | "visibleNumbers"> & { template: string; text: (s: string | null) => string }) => {
    if (c.senderId === c.receiverId || !alive(w, c.senderId) || !okReceiver(c.receiverId)) return;
    const rows = projectEventFeed(w, c.receiverId, [ev]);
    const summary = rows.length ? String((rows[0] as Record<string, unknown>).summary ?? "") || null : null;
    const visibleNumbers = rows.length ? (JSON.stringify(rows[0]).match(/\d+(?:\.\d+)?/g) ?? []) : [];
    out.push({ ...c, trigger: ev.type, sequence: ev.sequence, tick: ev.tick, summary, visibleNumbers, text: c.text(summary) });
  };
  const sName = (id: string) => w.characters[id]?.name ?? id;
  const place = (id: string | undefined | null) => (id ? w.settlements[id]?.name ?? id : "port");
  const fName = (id: string) => w.factions[id]?.name ?? id;
  const trust = (from: string, to: string) => w.characters[from]?.relationships[to]?.trust ?? 0;
  const tail = (s: string | null) => (s ? ` ${s}` : "");

  switch (ev.type) {
    case "standing-order-completion-reported":
    case "standing-order-refused":
    case "standing-order-deviated":
    case "standing-order-accepted": {
      if (ev.type === "standing-order-accepted" && !INCLUDE_ACCEPTED) break;
      const holder = ev.actorId!, issuer = String(d.issuerId);
      const id = ev.type.replace("standing-order-", "order.");
      push({
        topic: "order", senderId: holder, receiverId: issuer, orderId: String(d.orderId), awaitsReply: ev.type === "standing-order-completion-reported", template: id,
        text: (s) => {
          if (ev.type === "standing-order-completion-reported") return (trust(holder, issuer) > 0.62 ? "Commander, it is done." : "The order is complete.") + tail(s) + " Confirm it when you are satisfied.";
          if (ev.type === "standing-order-refused") return "I cannot take this order." + tail(s);
          if (ev.type === "standing-order-deviated") return "I have had to change course." + tail(s);
          return "Order received." + tail(s);
        },
      });
      break;
    }
    case "contract-offered": case "contract-accepted": case "contract-refused": case "contract-breached": case "contract-fulfilled": case "contract-cancelled": {
      const lead: Record<string, string> = {
        "contract-offered": "I have a delivery for you.", "contract-accepted": "I will carry it.", "contract-refused": "I am turning the contract down.",
        "contract-breached": "I could not deliver.", "contract-fulfilled": "The delivery is made.", "contract-cancelled": "The contract is off.",
      };
      push({ topic: "contract", senderId: ev.actorId!, receiverId: ev.targetId!, awaitsReply: false, template: ev.type.replace("contract-", "contract."), text: (s) => lead[ev.type] + tail(s) });
      break;
    }
    case "character-captured": case "captivity-released": {
      const captive = ev.actorId!;
      const factionId = ev.type === "character-captured" ? (d.captivity?.captorFactionId ?? ev.targetId ?? null) : (ev.targetId ?? null);
      const sender = factionId ? factionRep(w, factionId, [captive]) : (typeof d.ransom?.leaderId === "string" ? d.ransom.leaderId : null);
      if (!sender) break;
      const terms = d.terms as { demandedValue?: number; moneyPaid?: number; debtValue?: number; systemMaximum?: number } | undefined;
      push({
        topic: "captivity", senderId: sender, receiverId: captive, awaitsReply: false, template: ev.type === "character-captured" ? "captivity.captured" : (d.debt ? "captivity.released-with-debt" : "captivity.released"),
        text: (s) => ev.type === "character-captured"
          ? `You are held at ${place(ev.settlementId)}.` + tail(s)
          : d.debt
            ? `You are free to go. The price was ${terms?.demandedValue}; you paid ${terms?.moneyPaid}, and ${terms?.debtValue} stays on your account.` + tail(s)
            : `You are free to go. The price was ${terms?.demandedValue}, and you paid it.` + tail(s),
      });
      break;
    }
    case "secession-declared": {
      const owner = ev.actorId!, prev = String(d.previousFactionId ?? "");
      const members = Object.values(w.characters).filter((c) => !c.dead && c.factionId === prev && c.id !== owner).sort((a, b) => lt(a.id, b.id));
      for (const m of members) push({
        topic: "secession", senderId: owner, receiverId: m.id, awaitsReply: false, template: "secession.declared",
        text: (s) => `I am taking ${place(ev.settlementId)} out of ${fName(prev)}.` + tail(s),
      });
      break;
    }
    case "debt-repaid": {
      if (!INCLUDE.has("debt")) break;
      const debtor = ev.actorId!, creditorFaction = ev.targetId ?? "";
      const members = Object.values(w.characters).filter((c) => !c.dead && c.factionId === creditorFaction && c.id !== debtor).sort((a, b) => lt(a.id, b.id));
      for (const m of members) push({
        topic: "debt", senderId: debtor, receiverId: m.id, awaitsReply: false, template: d.closed ? "debt.repaid-closed" : "debt.repaid-part",
        text: () => d.closed ? `I have paid what I owed: ${d.paid}.` : `I have paid ${d.paid} toward what I owe; ${d.remainingValue} remains.`,
      });
      break;
    }
    case "faction-peace": case "faction-peace-broken": case "alliance-formed": case "alliance-broken": {
      const ids = factionIdsOf(d);
      if (ids.length !== 2) break;
      for (const [mine, other] of [[ids[0], ids[1]], [ids[1], ids[0]]] as const) {
        const members = Object.values(w.characters).filter((c) => !c.dead && c.factionId === mine).sort((a, b) => lt(a.id, b.id));
        const sender = factionRep(w, other, members.map((m) => m.id));
        if (!sender) continue;
        const verb = ev.type === "faction-peace" ? `${fName(other)} and ${fName(mine)} are at peace.` : ev.type === "faction-peace-broken" ? `The peace between ${fName(other)} and ${fName(mine)} is over.`
          : ev.type === "alliance-formed" ? `${fName(other)} and ${fName(mine)} have joined against ${fName(String(d.alliance?.enemyFactionId))}.` : `The pact between ${fName(other)} and ${fName(mine)} has ended.`;
        for (const m of members) push({ topic: "diplomacy", senderId: sender, receiverId: m.id, awaitsReply: false, template: ev.type.replace("faction-", "").replace("alliance-", "pact."), text: () => verb });
      }
      break;
    }
    default: break;
  }
  return out;
}

export const TOPICS: Topic[] = ["order", "contract", "captivity", "debt", "diplomacy", "secession"];
export const SOURCE_EVENTS = [
  "standing-order-completion-reported", "standing-order-refused", "standing-order-deviated", "standing-order-accepted",
  "contract-offered", "contract-accepted", "contract-refused", "contract-breached", "contract-fulfilled", "contract-cancelled",
  "character-captured", "captivity-released", "secession-declared", "debt-repaid", "faction-peace", "faction-peace-broken", "alliance-formed", "alliance-broken",
];
