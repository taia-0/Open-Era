// ui-cards-v1.md reference builder. Harness only: not in src/, not imported by anything in src/.
// Pure fold over records the player projection already returns. It reads no world field directly except
// `world.tick`, the thread list the response already carries, and (sea position only) the subject's own travel leg.
import { projectCharacter, projectFactions, projectSupplyContracts, troopQualityBand, type ProjectedContract } from "../../../src/dashboard/visibility.ts";
import { round } from "../../../src/sim/state.ts";
import type { Character, StandingOrderReport, WorldState } from "../../../src/sim/types.ts";

export type CardKind = "supply-contract" | "debt" | "peace" | "pact" | "order-report";
export type CardRole = "buyer" | "carrier" | "mate" | "debtor" | "creditor" | "signatory" | "issuer" | "holder";
export interface CardParty { kind: "character" | "faction"; id: string; name: string; side: string }
interface Base<K extends CardKind, D> {
  id: string; kind: K; role: CardRole; status: string; open: boolean; actionRequired: boolean;
  observedTick: number; ageTicks: number; parties: CardParty[]; threadId: string | null; detail: D;
}
export type SupplyContractCard = Base<"supply-contract", { good: "provisions"; destinationId: string; deadlineTick: number; revision: number; source: "own-character" | "faction-report"; quantity: number | null; price: number | null; escrow: number | null }>;
export type DebtCard = Base<"debt", { originalValue: number; remainingValue: number; incurredTick: number; reason: string }>;
export type PeaceCard = Base<"peace", { withFactionId: string; sinceTick: number }>;
export type PactCard = Base<"pact", { withFactionId: string; sinceTick: number; againstFactionId: string }>;
export type OrderReportCard = Base<"order-report", { orderId: string; directive: string; targetId: string | null; priority: number; issuedTick: number; expiresTick: number | null; revision: number; adherence: string; deviationCount: number; lastReport: StandingOrderReport }>;
export type UiCard = SupplyContractCard | DebtCard | PeaceCard | PactCard | OrderReportCard;

type Row = Record<string, any>;
export interface Projected {
  viewerId: string; viewerFactionId: string | null; tick: number;
  contracts: ProjectedContract[]; factions: Row[]; characters: Row[];
  threads: Array<{ id: string; kind: "direct" | "group"; participantIds: string[]; createdById: string; createdTick: number; lastMessageTick: number | null }>;
}

/** The same inputs `dashboardState` hands the client, for one viewer. */
export function projectFor(world: WorldState, viewer: Character): Projected {
  return {
    viewerId: viewer.id, viewerFactionId: viewer.factionId, tick: world.tick,
    contracts: projectSupplyContracts(world, viewer),
    factions: projectFactions(world, viewer),
    characters: Object.values(world.characters).sort((l, r) => (l.id < r.id ? -1 : l.id > r.id ? 1 : 0)).map((c) => projectCharacter(world, viewer, c)),
    threads: Object.values(world.conversationThreads).filter((t) => t.participantIds.includes(viewer.id)),
  };
}

const lt = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0); // code-unit order, not locale
const pair = (a: string, b: string) => (a < b ? [a, b] : [b, a]) as [string, string];

/** `closedWindow`: a closed card is served only while `ageTicks <= closedWindow`. Open cards are always served. */
export function buildCards(p: Projected, closedWindow: number = Infinity): UiCard[] {
  const nameOf = (id: string) => p.characters.find((c) => c.id === id)?.displayName ?? id;
  const factionName = (id: string) => p.factions.find((f) => f.id === id)?.name ?? id;
  const ch = (id: string, side: string): CardParty => ({ kind: "character", id, name: nameOf(id), side });
  const fa = (id: string, side: string): CardParty => ({ kind: "faction", id, name: factionName(id), side });
  const threadFor = (a: string, b: string): string | null =>
    p.threads.find((t) => t.kind === "direct" && t.participantIds.length === 2 && t.participantIds.includes(a) && t.participantIds.includes(b))?.id ?? null;
  const age = (tick: number) => Math.max(0, p.tick - tick);
  const cards: UiCard[] = [];

  for (const c of p.contracts) {
    const role: CardRole = c.source === "own-character" ? (c.buyerId === p.viewerId ? "buyer" : "carrier") : "mate";
    cards.push({
      id: `contract:${c.id}`, kind: "supply-contract", role, status: c.status,
      open: c.status === "offered" || c.status === "accepted", actionRequired: false,
      observedTick: c.observedTick, ageTicks: c.ageTicks,
      parties: [ch(c.buyerId, "buyer"), ch(c.carrierId, "carrier")],
      threadId: role === "mate" ? null : threadFor(c.buyerId, c.carrierId),
      detail: { good: c.good, destinationId: c.destinationId, deadlineTick: c.deadlineTick, revision: c.revision, source: c.source, quantity: c.quantity, price: c.price, escrow: c.escrow },
    });
  }

  const seen = new Set<string>();
  const self = p.characters.find((c) => c.id === p.viewerId);
  for (const d of (self?.debts ?? []) as Row[]) {
    seen.add(d.id);
    cards.push({
      // A closed debt is spliced out of `character.debts` (state.ts:1038), so every debt card is open.
      id: `debt:${d.id}`, kind: "debt", role: "debtor", status: "open", open: true, actionRequired: false,
      observedTick: d.incurredTick, ageTicks: age(d.incurredTick),
      parties: [ch(p.viewerId, "debtor"), ...(d.creditorFactionId ? [fa(d.creditorFactionId, "creditor")] : [])],
      threadId: null,
      detail: { originalValue: d.originalValue, remainingValue: d.remainingValue, incurredTick: d.incurredTick, reason: d.reason },
    });
  }
  const own = p.factions.find((f) => f.id === p.viewerFactionId);
  for (const d of (own?.debts ?? []) as Row[]) {
    if (seen.has(d.id)) continue;
    cards.push({
      id: `debt:${d.id}`, kind: "debt", role: "creditor", status: "open", open: true, actionRequired: false,
      observedTick: d.incurredTick, ageTicks: age(d.incurredTick),
      parties: [ch(d.debtorId, "debtor"), fa(own!.id, "creditor")], threadId: null,
      detail: { originalValue: d.originalValue, remainingValue: d.remainingValue, incurredTick: d.incurredTick, reason: d.reason },
    });
  }

  const dip = own?.diplomacy as { peace: Array<{ withFactionId: string; sinceTick: number }>; pacts: Array<{ withFactionId: string; sinceTick: number; allyFactionId: string }> } | null | undefined;
  for (const x of dip?.peace ?? []) {
    const [a, b] = pair(own!.id, x.withFactionId);
    cards.push({
      id: `peace:${a}|${b}:${x.sinceTick}`, kind: "peace", role: "signatory", status: "in-force", open: true, actionRequired: false,
      observedTick: x.sinceTick, ageTicks: age(x.sinceTick), parties: [fa(own!.id, "ours"), fa(x.withFactionId, "theirs")], threadId: null,
      detail: { withFactionId: x.withFactionId, sinceTick: x.sinceTick },
    });
  }
  for (const x of dip?.pacts ?? []) {
    const [a, b] = pair(own!.id, x.withFactionId);
    cards.push({
      id: `pact:${a}|${b}:${x.sinceTick}`, kind: "pact", role: "signatory", status: "in-force", open: true, actionRequired: false,
      observedTick: x.sinceTick, ageTicks: age(x.sinceTick), parties: [fa(own!.id, "ours"), fa(x.withFactionId, "theirs")], threadId: null,
      // `allyFactionId` on today's FactionPactView carries Alliance.enemyFactionId (client-readiness.ts:207). The card names it for what it is.
      detail: { withFactionId: x.withFactionId, sinceTick: x.sinceTick, againstFactionId: x.allyFactionId },
    });
  }

  for (const c of p.characters) {
    for (const o of (c.standingOrders ?? []) as Row[]) {
      if (!o.lastReport) continue;
      const role: CardRole = c.id === p.viewerId ? "holder" : "issuer";
      cards.push({
        id: `order:${c.id}:${o.id}`, kind: "order-report", role, status: o.status,
        open: o.status === "pending" || o.status === "active" || o.status === "awaiting-confirmation",
        actionRequired: role === "issuer" && o.status === "awaiting-confirmation",
        observedTick: o.lastReport.tick, ageTicks: age(o.lastReport.tick),
        parties: [ch(o.issuerId, "issuer"), ch(c.id, "holder")], threadId: threadFor(o.issuerId, c.id),
        detail: { orderId: o.id, directive: o.directive, targetId: o.targetId ?? null, priority: o.priority, issuedTick: o.issuedTick, expiresTick: o.expiresTick, revision: o.revision, adherence: o.adherence, deviationCount: o.deviationCount, lastReport: o.lastReport },
      });
    }
  }

  return cards.filter((c) => c.open || c.ageTicks <= closedWindow).sort((l, r) => Number(r.open) - Number(l.open) || r.observedTick - l.observedTick || lt(l.id, r.id));
}

export interface ThreadTabs { all: string[]; direct: string[]; group: string[]; request: string[] }
export function threadTabs(p: Projected): ThreadTabs {
  const sorted = [...p.threads].sort((l, r) => (r.lastMessageTick ?? -1) - (l.lastMessageTick ?? -1) || r.createdTick - l.createdTick || lt(l.id, r.id));
  const ids = (f: (t: Projected["threads"][number]) => boolean) => sorted.filter(f).map((t) => t.id);
  return { all: ids(() => true), direct: ids((t) => t.kind === "direct"), group: ids((t) => t.kind === "group"), request: ids((t) => t.createdById !== p.viewerId) };
}

export const TROOP_BAND_CUTS = [0.35, 0.55, 0.8] as const;
export function partyTroopQuality(c: Character) {
  return { count: c.troops.count, experience: round(c.troops.experience, 3), discipline: round(c.troops.discipline, 3), band: troopQualityBand(c.troops.experience), cuts: [...TROOP_BAND_CUTS] };
}

export interface SeaPosition { along: number; x: number; y: number; observedTick: number }
/** Where the subject was on its own leg at the sighting tick. Departure is 0; it never reaches 1 while at sea. */
export function seaPosition(world: WorldState, subject: Character): SeaPosition | null {
  const t = subject.travel;
  if (!t || t.totalTicks < 1) return null;
  const from = world.settlements[t.fromId]?.position, to = world.settlements[t.toId]?.position;
  if (!from || !to) return null;
  const along = (t.totalTicks - t.remainingTicks) / t.totalTicks;
  return { along: round(along, 3), x: round(from.x + (to.x - from.x) * along, 3), y: round(from.y + (to.y - from.y) * along, 3), observedTick: world.tick };
}
