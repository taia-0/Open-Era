// ui-cards-v1.md harness: one config x N seeds x 1,200 ticks, offline, no AI, $0. Reads only; never feeds the sim.
// Usage: node --experimental-strip-types docs/design/ui-cards-v1/measure.ts <label> '<TickOptions JSON>'
// Env: SEEDS=1847,2718,... (default the 13 standard seeds), TICKS=1200.
// One JSON row per seed: pins, replay, card volume for the commander (the /api/state viewer), all-viewer volume,
// sea-sighting volume, and the privacy / determinism / purity property results (violations by name).
import { runTick } from "../../../src/sim/engine.ts";
import { createPrototypeWorld } from "../../../src/sim/scenario.ts";
import { stateHash } from "../../../src/sim/state.ts";
import { replayWithSilentStarts } from "../../../src/sim/tick-start.ts";
import { seaSightingsFor, outOfStretchFor } from "../../../src/dashboard/visibility.ts";
import { createConversationThread, sendConversationMessage } from "../../../src/sim/conversations.ts";
import type { Character, SimEvent, WorldState } from "../../../src/sim/types.ts";
import { buildCards, partyTroopQuality, projectFor, seaPosition, threadTabs, TROOP_BAND_CUTS, type UiCard } from "./cards.ts";

const [label, optsJson] = process.argv.slice(2);
const opts = JSON.parse(optsJson ?? "{}");
const ticks = Number(process.env.TICKS ?? 1200);
const seeds = (process.env.SEEDS ?? "1847,2718,4096,1000,2000,3000,4000,5000,6000,7000,8000,9000,10000").split(",").map(Number);
const CLOSED_WINDOW = 180; // view-model.ts:87 CHECK_IN_TICKS
const DENY = ["cause", "causes", "evidence", "grievance", "surplus", "treasury", "factionTreasury", "portsAtForm", "escrowFromTreasury", "escrowFromPurse", "settled", "score", "ai", "personality", "plan", "knowledge", "activeOrderAssessment", "money", "cargo"];
const KINDS = ["supply-contract", "debt", "peace", "pact", "order-report"] as const;
const lt = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const alive = (w: WorldState) => Object.values(w.characters).filter((c) => !c.dead).sort((a, b) => lt(a.id, b.id));
const atSea = (c: Character) => c.travel !== null && c.travel.totalTicks >= 1 && c.travel.remainingTicks >= 1 && c.travel.remainingTicks <= c.travel.totalTicks;
const keysDeep = (v: unknown, out = new Set<string>()): Set<string> => {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, out));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { out.add(k); keysDeep(x, out); }
  return out;
};
const tally = (cards: UiCard[]) => {
  const o: Record<string, { open: number; closed: number }> = {};
  for (const k of KINDS) o[k] = { open: 0, closed: 0 };
  for (const c of cards) o[c.kind][c.open ? "open" : "closed"]++;
  return { total: cards.length, byKind: o, actionRequired: cards.filter((c) => c.actionRequired).length };
};

for (const seed of seeds) {
  const w = createPrototypeWorld(seed);
  const player = Object.values(w.players)[0];
  const events: SimEvent[] = [];
  const viol: Record<string, number> = {};
  const bad = (k: string) => { viol[k] = (viol[k] ?? 0) + 1; };
  const checks: Record<string, number> = {};
  const ok = (k: string) => { checks[k] = (checks[k] ?? 0) + 1; };
  let hash72 = "";
  const snaps: Array<{ tick: number; unwindowed: number } & ReturnType<typeof tally>> = [];
  const peak = { unwindowed: 0, openMax: 0, total: 0, byKind: Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<string, number> };
  const sea = { rowsTotalAllViewers: 0, maxRowsOneViewerTick: 0, commanderRows: 0, commanderTicksWithRows: 0, commanderMaxSimultaneous: 0, outOfStretchRowsWithPosition: 0, positionChecked: 0 };
  const ever = { contracts: new Set<string>(), debts: new Set<string>(), peaces: new Set<string>(), pacts: new Set<string>() };

  const checkViewer = (viewer: Character) => {
    const p = projectFor(w, viewer);
    const full = buildCards(p);
    const cards = buildCards(p, CLOSED_WINDOW);
    const again = buildCards(p, CLOSED_WINDOW);
    if (JSON.stringify(cards) !== JSON.stringify(full.filter((c) => c.open || c.ageTicks <= CLOSED_WINDOW))) bad("window-rule"); else ok("window-rule");
    if (JSON.stringify(cards) !== JSON.stringify(again)) bad("determinism-two-builds-differ"); else ok("determinism");
    const ids = cards.map((c) => c.id);
    if (new Set(ids).size !== ids.length) bad("ids-not-unique"); else ok("ids-unique");
    for (let i = 1; i < cards.length; i++) {
      const a = cards[i - 1], b = cards[i];
      if (Number(b.open) - Number(a.open) > 0 || (a.open === b.open && (b.observedTick > a.observedTick || (b.observedTick === a.observedTick && lt(a.id, b.id) > 0)))) { bad("order-violated"); break; }
    }
    // Contracts: party or faction mate only.
    for (const c of Object.values(w.contracts ?? {})) {
      const buyer = w.characters[c.buyerId], carrier = w.characters[c.carrierId];
      const party = viewer.id === c.buyerId || viewer.id === c.carrierId;
      const mate = viewer.factionId !== null && (viewer.factionId === buyer?.factionId || viewer.factionId === carrier?.factionId);
      const card = full.find((x) => x.id === `contract:${c.id}`);
      if (!!card !== (party || mate)) bad("contract-visibility"); else ok("contract-visibility");
      if (card && card.kind === "supply-contract") {
        if (!party && (card.detail.quantity !== null || card.detail.price !== null || card.detail.escrow !== null)) bad("contract-mate-sees-terms");
        if (party && (card.detail.price !== c.price || card.detail.quantity !== c.quantity || card.detail.escrow !== c.escrow)) bad("contract-party-terms-wrong");
        if (card.role === "mate" && card.threadId !== null) bad("contract-mate-threadid");
      }
    }
    // Debts: debtor, or a member of the creditor faction. Open debts only.
    for (const ch of Object.values(w.characters)) for (const d of ch.debts) {
      const debtor = ch.id === viewer.id;
      const creditor = viewer.factionId !== null && d.creditorFactionId === viewer.factionId && d.remainingValue > 0;
      const card = full.find((x) => x.id === `debt:${d.id}`);
      if (!!card !== (debtor || creditor)) bad("debt-visibility"); else ok("debt-visibility");
      if (card && card.kind === "debt" && (card.role === "debtor") !== debtor) bad("debt-role");
    }
    // Peace and pacts: members of a party faction only.
    const peaces = w.secessionAftermath?.peace ?? [];
    const pacts = w.alliances ?? [];
    const wantPeace = peaces.filter((x) => viewer.factionId !== null && x.factionIds.includes(viewer.factionId)).length;
    const wantPact = pacts.filter((x) => viewer.factionId !== null && x.factionIds.includes(viewer.factionId)).length;
    if (full.filter((c) => c.kind === "peace").length !== wantPeace) bad("peace-visibility"); else ok("peace-visibility");
    if (full.filter((c) => c.kind === "pact").length !== wantPact) bad("pact-visibility"); else ok("pact-visibility");
    for (const c of full) if ((c.kind === "peace" || c.kind === "pact") && !c.parties.some((x) => x.id === viewer.factionId)) bad("diplomacy-viewer-not-party");
    // No cause / evidence text from the stored records appears on any card.
    const body = JSON.stringify(full);
    for (const x of pacts) for (const s of Object.values(x.causes)) if (body.includes(s)) bad("pact-cause-leaked");
    for (const x of peaces) if (x.cause && body.includes(JSON.stringify(x.cause).slice(1, -1))) bad("peace-cause-leaked");
    // Orders: issuer or holder, and only with a report.
    for (const ch of Object.values(w.characters)) for (const o of ch.standingOrders) {
      const want = !!o.lastReport && (ch.id === viewer.id || o.issuerId === viewer.id);
      const card = full.find((x) => x.id === `order:${ch.id}:${o.id}`);
      if (!!card !== want) bad("order-visibility"); else ok("order-visibility");
    }
    // Withheld keys: no denylisted key at any depth; every kind's detail keys are the documented set.
    const keys = keysDeep(full);
    for (const k of DENY) if (keys.has(k)) bad(`denied-key:${k}`);
    // Thread links only name a thread the response already carries, which the viewer is in.
    for (const c of full) if (c.threadId !== null) {
      const t = p.threads.find((x) => x.id === c.threadId);
      if (!t || !t.participantIds.includes(viewer.id)) bad("threadid-not-participant");
    }
    return { p, cards, full };
  };

  // Sea position: for every row any viewer holds at the sighting tick.
  const checkSea = () => {
    for (const viewer of alive(w)) {
      const rows = seaSightingsFor(w, viewer);
      if (!rows) continue;
      const n = Object.keys(rows).length;
      sea.rowsTotalAllViewers += n;
      sea.maxRowsOneViewerTick = Math.max(sea.maxRowsOneViewerTick, n);
      if (viewer.id === player.characterId) { sea.commanderRows += n; if (n) sea.commanderTicksWithRows++; sea.commanderMaxSimultaneous = Math.max(sea.commanderMaxSimultaneous, n); }
      for (const row of Object.values(rows)) {
        const subj = w.characters[row.characterId];
        const pos = seaPosition(w, subj);
        const a = w.settlements[row.fromId].position, b = w.settlements[row.toId].position;
        const inBox = pos && pos.x >= Math.min(a.x, b.x) - 0.001 && pos.x <= Math.max(a.x, b.x) + 0.001 && pos.y >= Math.min(a.y, b.y) - 0.001 && pos.y <= Math.max(a.y, b.y) + 0.001;
        if (!pos || pos.along < 0 || pos.along >= 1 || !inBox || pos.observedTick !== row.observedTick || row.ageTicks !== 0) bad("sea-position-bounds"); else ok("sea-position");
        sea.positionChecked++;
      }
      // Same-leg out-of-stretch rows carry no sighting, so they get no position.
      for (const row of outOfStretchFor(w, viewer) ?? []) if ("position" in row || "troops" in row) sea.outOfStretchRowsWithPosition++;
    }
  };

  const snapshot = (tick: number, deep: boolean) => {
    const viewer = w.characters[player.characterId];
    const h0 = stateHash(w), j0 = deep ? JSON.stringify(w) : "";
    const { p, cards, full } = checkViewer(viewer);
    const t = tally(cards);
    const tf = tally(full);
    snaps.push({ tick, ...t, unwindowed: tf.total });
    peak.total = Math.max(peak.total, t.total); peak.unwindowed = Math.max(peak.unwindowed, tf.total);
    peak.openMax = Math.max(peak.openMax, KINDS.reduce((m, k) => m + t.byKind[k].open, 0));
    for (const k of KINDS) peak.byKind[k] = Math.max(peak.byKind[k], t.byKind[k].open + t.byKind[k].closed);
    // Troop band readout equals the card the state already carries.
    const self = p.characters.find((c) => c.id === viewer.id)!;
    const q = partyTroopQuality(viewer);
    const tq = self.progression.troopQuality;
    if (!tq || tq.band !== q.band || tq.experience !== q.experience || tq.discipline !== q.discipline || self.troops.count !== q.count) bad("troop-readout-mismatch"); else ok("troop-readout");
    const tabs = threadTabs(p);
    if (tabs.all.length !== 0) bad("tabs-nonempty-headless");
    if (deep) {
      for (const v of alive(w)) checkViewer(v);
      if (stateHash(w) !== h0 || JSON.stringify(w) !== j0) bad("purity-world-changed"); else ok("purity");
    } else if (stateHash(w) !== h0) bad("purity-world-changed"); else ok("purity");
  };

  // Per-tick commander tracking (the /api/state viewer): distinct cards ever served per type, distinct ever open, and the action-required window.
  const cmdChar = w.characters[player.characterId];
  const cmdEver: Record<string, Set<string>> = Object.fromEntries(KINDS.map((k) => [k, new Set<string>()]));
  const cmdEverOpen: Record<string, Set<string>> = Object.fromEntries(KINDS.map((k) => [k, new Set<string>()]));
  const orderFirstStatus: Record<string, number> = {};
  const act = { ticksWithActionRequired: 0, firstTick: null as number | null, maxSimultaneous: 0, distinctCards: new Set<string>() };

  for (let i = 0; i < ticks; i++) {
    events.push(...runTick(w, { ...opts }).events);
    if (i === 71) hash72 = stateHash(w).slice(0, 8);
    checkSea();
    if (cmdChar && !cmdChar.dead) {
      const served = buildCards(projectFor(w, cmdChar), CLOSED_WINDOW);
      let nAct = 0;
      for (const c of served) {
        if (!cmdEver[c.kind].has(c.id)) { cmdEver[c.kind].add(c.id); if (c.kind === "order-report") orderFirstStatus[c.status] = (orderFirstStatus[c.status] ?? 0) + 1; }
        if (c.open) cmdEverOpen[c.kind].add(c.id);
        if (c.actionRequired) { nAct++; act.distinctCards.add(c.id); }
      }
      if (nAct > 0) { act.ticksWithActionRequired++; if (act.firstTick === null) act.firstTick = i + 1; act.maxSimultaneous = Math.max(act.maxSimultaneous, nAct); }
    }
    for (const c of Object.values(w.contracts ?? {})) ever.contracts.add(c.id);
    for (const ch of Object.values(w.characters)) for (const d of ch.debts) ever.debts.add(d.id);
    for (const x of w.secessionAftermath?.peace ?? []) ever.peaces.add(`${x.factionIds.join("|")}:${x.tick}`);
    for (const x of w.alliances ?? []) ever.pacts.add(x.id);
    const t = i + 1;
    if (t === 72 || t % 100 === 0) snapshot(t, t % 200 === 0 || t === ticks);
  }
  const finalSnap = snaps[snaps.length - 1];

  // All-viewer volume at the final tick (every living character as the viewer).
  const sizes = alive(w).map((v) => buildCards(projectFor(w, v), CLOSED_WINDOW).length).sort((a, b) => a - b);
  const sizesFull = alive(w).map((v) => buildCards(projectFor(w, v)).length).sort((a, b) => a - b);

  // Threads exist only when the player or (later) an NPC makes one. Headless makes none, so exercise them on a clone.
  const clone: WorldState = JSON.parse(JSON.stringify(w));
  const cmd = clone.characters[player.characterId];
  const pid = Object.keys(clone.players)[0];
  clone.players[pid].knownCharacterIds = Object.keys(clone.characters);
  const base = projectFor(clone, cmd);
  const counterparts = [...new Set(buildCards(base).flatMap((c) => c.kind === "supply-contract" || c.kind === "order-report" ? c.parties.map((x) => x.id) : []).filter((id) => id !== cmd.id))].sort();
  const made: Record<string, string> = {};
  let threadsMade = 0;
  for (const other of counterparts.slice(0, 8)) {
    const r = createConversationThread(clone, { playerId: pid, kind: "direct", participantIds: [other] });
    if (r.ok) { made[other] = r.value.id; threadsMade++; sendConversationMessage(clone, { playerId: pid, threadId: r.value.id, body: "Please report." }); }
  }
  const others = Object.keys(clone.characters).filter((id) => id !== cmd.id).sort();
  const g = createConversationThread(clone, { playerId: pid, kind: "group", participantIds: others.slice(0, 3) });
  if (g.ok) threadsMade++;
  // A thread the viewer is not in, between the two parties of some contract the viewer only sees as a mate or not at all.
  const alien = { id: "thread-alien", kind: "direct" as const, title: "alien", participantIds: [others[0], others[1]].sort(), createdById: others[0], createdTick: clone.tick, lastMessageTick: null };
  clone.conversationThreads[alien.id] = alien;
  const p2 = projectFor(clone, cmd);
  const cards2 = buildCards(p2);  // unwindowed so every link is exercised
  const tabs2 = threadTabs(p2);
  const all2 = new Set(tabs2.all);
  if (all2.has("thread-alien")) bad("tabs-include-non-participant-thread"); else ok("tabs-exclude-non-participant");
  if (new Set([...tabs2.direct, ...tabs2.group]).size !== tabs2.all.length || tabs2.direct.some((x) => tabs2.group.includes(x))) bad("tabs-direct-group-partition"); else ok("tabs-partition");
  if (tabs2.request.some((x) => !all2.has(x)) || tabs2.request.length !== 0) bad("tabs-request-wrong"); else ok("tabs-request");
  let linked = 0;
  for (const c of cards2) {
    const chars = c.parties.filter((x) => x.kind === "character").map((x) => x.id);
    const wantThread = (c.kind === "order-report" || (c.kind === "supply-contract" && c.role !== "mate")) && chars.length === 2
      ? p2.threads.find((t) => t.kind === "direct" && chars.every((id) => t.participantIds.includes(id)))?.id ?? null : null;
    if (c.threadId !== wantThread) bad("threadid-derivation"); else ok("threadid-derivation");
    if (c.threadId) { linked++; if (!p2.threads.some((t) => t.id === c.threadId)) bad("threadid-missing-thread"); }
  }
  // actionRequired on constructed state: an issued order awaiting the commander's confirmation (harness-only mutation of the clone).
  {
    const target = Object.values(clone.characters).flatMap((c) => c.standingOrders.map((o) => ({ c, o }))).find((x) => x.o.issuerId === cmd.id);
    if (target) {
      target.o.status = "awaiting-confirmation";
      target.o.lastReport = { tick: clone.tick, kind: "completion", summary: "constructed" };
      const card = buildCards(projectFor(clone, cmd)).find((x) => x.id === `order:${target.c.id}:${target.o.id}`);
      if (!card || card.kind !== "order-report" || !card.actionRequired || card.role !== "issuer" || !card.open) bad("action-required-constructed"); else ok("action-required-constructed");
      const holderView = buildCards(projectFor(clone, target.c)).find((x) => x.id === `order:${target.c.id}:${target.o.id}`);
      if (!holderView || holderView.actionRequired || holderView.role !== "holder") bad("action-required-holder"); else ok("action-required-holder");
    }
  }
  const replay = createPrototypeWorld(seed);
  replayWithSilentStarts(replay, events);
  console.log(JSON.stringify({
    label, seed, hash72, hash1200: stateHash(w).slice(0, 8), replayExact: stateHash(replay) === stateHash(w),
    commanderId: player.characterId, commanderFaction: w.characters[player.characterId].factionId,
    cardsFinal: finalSnap, cardsPeak: peak, snaps: snaps.map((s) => ({ t: s.tick, n: s.total, unwindowed: s.unwindowed, ...Object.fromEntries(KINDS.map((k) => [k, s.byKind[k].open + s.byKind[k].closed])) })),
    allViewersFinal: { viewers: sizes.length, min: sizes[0], median: sizes[Math.floor(sizes.length / 2)], max: sizes[sizes.length - 1], unwindowedMax: sizesFull[sizesFull.length - 1] },
    commanderEver: { served: Object.fromEntries(KINDS.map((k) => [k, cmdEver[k].size])), everOpen: Object.fromEntries(KINDS.map((k) => [k, cmdEverOpen[k].size])), orderFirstStatus, actionRequired: { ticks: act.ticksWithActionRequired, firstTick: act.firstTick, maxSimultaneous: act.maxSimultaneous, distinctCards: act.distinctCards.size } },
    everCreated: { contracts: ever.contracts.size, debts: ever.debts.size, peaces: ever.peaces.size, pacts: ever.pacts.size },
    contractsInWorldFinal: Object.values(w.contracts ?? {}).reduce((m: Record<string, number>, c) => (m[c.status] = (m[c.status] ?? 0) + 1, m), {}),
    sea, threadClone: { threadsMade, cardsWithThreadId: linked, tabs: Object.fromEntries(Object.entries(tabs2).map(([k, v]) => [k, v.length])) },
    troopCuts: TROOP_BAND_CUTS, checks, violations: viol,
  }));
}
