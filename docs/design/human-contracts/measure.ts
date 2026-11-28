// human-contracts.md harness. Runs on a tree with docs/design/human-contracts/fix.patch applied (src/ is NOT patched on main).
// Variants (the variants patch reads these): OPEN_ERA_HC_VARIANT=last|peer-walk|peer-argmax, OPEN_ERA_HC_ESCROW=off, OPEN_ERA_HC_ALLOWANCE=off.
// Scenarios: idle (never answers), attentive (buys first, then accepts and sails), afirst (accepts first, then buys one purchase per tick, then sails), lazy (accepts, does nothing).
// Usage: SEEDS=… SCENARIOS=idle,attentive,afirst,lazy node --experimental-strip-types docs/design/human-contracts/measure.ts <label> '<TickOptions JSON>'
// Offline, no AI calls. Per seed: one flag-off run (main behaviour), then per scenario a flag-on run and a flag-on + npc-threads-hook run.
import { createHash } from "node:crypto";
import { cargoCapacity, cargoLoad, humanBuyAllowance, marketDepth, provisionDemand, quotedPassage, runTick, tradeQuote, travelDuration } from "../../../src/sim/engine.ts";
import { createPrototypeWorld } from "../../../src/sim/scenario.ts";
import { applyEvent, marketPrice, stateHash } from "../../../src/sim/state.ts";
import { submitCommand } from "../../../src/sim/commands.ts";
import { replayWithSilentStarts } from "../../../src/sim/tick-start.ts";
import { assessSupplyContract } from "../../../src/sim/contracts.ts";
import { DeterministicDialogueProvider, resolveDueReplies } from "../../../src/sim/conversations.ts";
import { projectEventFeed } from "../../../src/dashboard/view-model.ts";
import type { SimEvent, SupplyContract, WorldState } from "../../../src/sim/types.ts";
import { buildCards, projectFor } from "../ui-cards-v1/cards.ts";
import { openNpcThreads, requestThreads, unreadCount, TEXT_NO_LONGER_NEEDED, TEXT_OFFER_EXPIRED, type Drop, type Opened } from "./thread-hook.ts";
import { closeNote, uiState } from "./card-states.ts";

const OPTS = { humanContracts: true };
const label = process.argv[2] ?? "default";
const baseOpts = JSON.parse(process.argv[3] ?? "{}");
const ticks = Number(process.env.TICKS ?? 1200);
const seeds = (process.env.SEEDS ?? "1847,2718,4096,1000,2000,3000,4000,5000,6000,7000,8000,9000,10000").split(",").map(Number);
const scenarios = (process.env.SCENARIOS ?? "idle,attentive,afirst,lazy").split(",");
const REPLAY_EVERY = Number(process.env.REPLAY_EVERY ?? 100);
const CAPS = { perReceiver: Infinity, perPair: 3, perSender: 9 }; // npc-threads ruling: no receiver cap
const provider = new DeterministicDialogueProvider();
const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 8);
const ECON_TYPES = ["contract-offered", "contract-accepted", "contract-refused", "contract-fulfilled", "contract-breached", "contract-cancelled", "settlement-claimed", "character-captured", "secession-declared", "battle-resolved", "relationship-changed", "player-command-failed"];

type Kind = "base" | "on" | "hook";
interface Life { buys?: number; allowance?: number; displaced?: string | null; reranked?: boolean; offeredTick: number; human: boolean; buyerId: string; outcome?: string; outcomeTick?: number; acceptedTick?: number; cause?: string; issuedTick: number; expires?: number }

async function run(seed: number, kind: Kind, scenario: string) {
  const w = createPrototypeWorld(seed);
  const playerId = Object.keys(w.players)[0];
  const cmd = w.players[playerId].characterId;
  const opts = { ...baseOpts, ...(kind === "base" ? {} : { humanContracts: true }) };
  const log: SimEvent[] = [];
  const keep = (evs: SimEvent[]) => { for (const e of evs) log.push(structuredClone(e)); };
  const counts: Record<string, number> = Object.fromEntries(ECON_TYPES.map((t) => [t, 0]));
  const life = new Map<string, Life>();
  const per100 = new Array(Math.ceil(ticks / 100)).fill(0);
  const buyLimits: Record<string, number> = {};
  const peer = { humanOffers: 0, displaced: 0, reranked: 0, scored: 0, contested: 0, humanWins: 0, margins: [] as number[], humanCandidateNoNpc: 0 }; const split: Record<string, number> = {};
  const script = { acceptOk: 0, acceptFail: 0, decline: 0, declineFail: 0, buyOk: 0, buyFail: 0, travelOk: 0, travelFail: 0, lazyAccept: 0 };
  const failReasons: Record<string, number> = {}; const declineWhy: Record<string, number> = {};
  const opened: Opened[] = []; const drops: Drop[] = [];
  const tabs: Array<{ t: number; all: number; direct: number; request: number }> = [];
  const requestAtOffer: number[] = [];
  let portChanges = 0, shortageTicks = 0, firstHumanOffer: number | null = null;
  let prevOwner = Object.fromEntries(Object.values(w.settlements).map((s) => [s.id, s.factionId]));
  const rep = createPrototypeWorld(seed);
  let repCursor = 0;
  const replay = { checked: 0, mismatches: 0, first: null as number | null, diffs: [] as string[] };
  const pins = { h72: "", h1200: "" };
  const human = (id: string | undefined) => id === cmd;

  const scan = (events: SimEvent[]) => {
    for (const e of events) {
      if (e.type in counts) counts[e.type]++;
      const c = e.data.contract as SupplyContract | undefined;
      if (c && e.type === "contract-offered" && "displacedCarrierId" in e.data) { if (human(c.carrierId)) { peer.humanOffers++; if (e.data.displacedCarrierId) peer.displaced++; } else if (e.data.reranked) peer.reranked++; if (typeof e.data.humanScore === "number") { peer.scored++; if (typeof e.data.walkScore === "number") { peer.contested++; peer.margins.push(Math.round((e.data.humanScore - e.data.walkScore) * 1000) / 1000); if (e.data.humanScore > e.data.walkScore) peer.humanWins++; } else peer.humanCandidateNoNpc++; } }
      if (c && (e.type === "contract-fulfilled" || e.type === "contract-breached")) { const k = (human(c.carrierId) ? "human" : "npc") + (e.type === "contract-fulfilled" ? "Fulfilled" : "Breached"); split[k] = (split[k] ?? 0) + 1; }
      if (!c || !e.type.startsWith("contract-")) continue;
      let L = life.get(c.id);
      if (e.type === "contract-offered") {
        L = { offeredTick: e.tick, human: human(c.carrierId), buyerId: c.buyerId, issuedTick: c.issuedTick, expires: c.offerExpiresTick };
        life.set(c.id, L);
        if (L.human) { per100[Math.min(per100.length - 1, Math.floor(e.tick / 100))]++; firstHumanOffer ??= e.tick; }
      } else if (L) {
        if (e.type === "contract-accepted") L.acceptedTick = e.tick;
        else if (e.type !== "contract-amended" && e.type !== "contract-order-issued") { L.outcome = c.status; L.outcomeTick = e.tick; if (e.type === "contract-breached") L.cause = `${e.data.cause}/${e.data.detail ?? ""}`; }
      }
    }
  };

  const mineOffered = () => Object.values(w.contracts ?? {}).filter((c) => c.carrierId === cmd && c.status === "offered" && !c.settled && c.offerExpiresTick !== undefined);
  const pendingFor = (id: string) => w.pendingCommands.some((p) => "contractId" in p && p.contractId === id);
  const reason = (r: { ok: false; code: string }) => { failReasons[r.code] = (failReasons[r.code] ?? 0) + 1; };

  // idle: never answers. lazy: says yes to every offer the engine lets it and then does nothing (the breach path).
  // attentive: prepares first, answers later. It declines at once what it cannot carry (no stock or purse here), buys the cargo
  // and the voyage ration while the offer is open, and accepts and sails in the same tick once the hold is full.
  const policy = () => {
    const ch = w.characters[cmd];
    if (!ch || ch.captivity || ch.travel || !ch.locationId) return;
    if (scenario === "afirst") {
      // Accepted and not yet loaded: one purchase per tick (one direct action may be queued), then sail.
      for (const c of Object.values(w.contracts ?? {}).filter((k) => k.carrierId === cmd && k.status === "accepted" && !k.settled)) {
        if (w.pendingCommands.some((p) => p.type === "character-action" && p.playerId === playerId)) break;
        const loc = ch.locationId, dest = c.destinationId;
        const voyage = loc === dest ? 0 : travelDuration(w, ch, dest);
        const need = Math.max(0, c.quantity + provisionDemand(ch) * voyage - ch.cargo.provisions);
        const L = life.get(c.id);
        if (need > 0) {
          const tq = tradeQuote(w, ch, "provisions", "buy", Math.ceil(need));
          const key = `${tq.limitedBy}`; buyLimits[key] = (buyLimits[key] ?? 0) + 1;
          if (process.env.BUY_DEBUG) console.error(JSON.stringify({ seed, t: w.tick, contract: c.id, need: Math.round(need * 100) / 100, quantity: tq.quantity, maxQuantity: tq.maxQuantity, limitedBy: tq.limitedBy, stock: Math.round(w.settlements[loc].stocks.provisions * 100) / 100, depth: marketDepth(w.settlements[loc], "provisions"), hold: Math.round((cargoCapacity(ch) - cargoLoad(ch)) * 100) / 100, money: Math.round(ch.money * 100) / 100, price: Math.round(tq.unitPrice * 100) / 100, allowance: L?.allowance }));
          const res = submitCommand(w, { playerId, type: "character-action", action: "buy-resource", resource: "provisions", quantity: Math.min(200, Math.ceil(need + provisionDemand(ch))) }, OPTS); // the need plus one tick of ration: one tick passes before it sails
          if (res.ok) { keep([res.event]); script.buyOk++; if (L) L.buys = (L.buys ?? 0) + 1; } else { script.buyFail++; reason(res); }
        } else if (loc !== dest) {
          const t = submitCommand(w, { playerId, type: "character-action", action: "travel", targetId: dest }, OPTS);
          if (t.ok) { keep([t.event]); script.travelOk++; } else { script.travelFail++; reason(t); }
        }
      }
    }
    for (const c of mineOffered()) {
      if (pendingFor(c.id)) continue;
      const loc = ch.locationId, dest = c.destinationId;
      if (scenario === "lazy") {
        const res = submitCommand(w, { playerId, type: "accept-contract", contractId: c.id }, OPTS);
        if (res.ok) { keep([res.event]); script.acceptOk++; continue; }
        script.acceptFail++; reason(res);
        const dec = submitCommand(w, { playerId, type: "decline-contract", contractId: c.id }, OPTS);
        if (dec.ok) { keep([dec.event]); script.decline++; } else { script.declineFail++; reason(dec); }
        continue;
      }
      const voyage = loc === dest ? 0 : travelDuration(w, ch, dest);
      const target = c.quantity + provisionDemand(ch) * voyage;
      const need = Math.max(0, target - ch.cargo.provisions);
      const stock = w.settlements[loc].stocks.provisions;
      const price = marketPrice(w, loc, "provisions");
      const passageOk = voyage === 0 ? true : quotedPassage(w, ch, dest).affordable;
      const feasible = stock >= need && ch.money >= need * price && passageOk;
      if (!feasible) {
        const why = stock < need ? "stock" : ch.money < need * price ? "purse" : "passage";
        const res = submitCommand(w, { playerId, type: "decline-contract", contractId: c.id }, OPTS);
        if (res.ok) { keep([res.event]); script.decline++; declineWhy[why] = (declineWhy[why] ?? 0) + 1; } else { script.declineFail++; reason(res); }
        continue;
      }
      if (scenario === "afirst") {
        const allowance = humanBuyAllowance(w, ch, c);
        const res = submitCommand(w, { playerId, type: "accept-contract", contractId: c.id }, OPTS);
        if (!res.ok) { script.acceptFail++; reason(res); continue; }
        keep([res.event]); script.acceptOk++;
        const L = life.get(c.id); if (L) { L.allowance = allowance; L.buys = 0; }
        if (need <= 0 && loc !== dest) { const t = submitCommand(w, { playerId, type: "character-action", action: "travel", targetId: dest }, OPTS); if (t.ok) { keep([t.event]); script.travelOk++; } else { script.travelFail++; reason(t); } }
        continue;
      }
      if (need > 0) {
        if (w.pendingCommands.some((p) => p.type === "character-action" && p.playerId === playerId)) continue;
        const res = submitCommand(w, { playerId, type: "character-action", action: "buy-resource", resource: "provisions", quantity: Math.min(200, Math.ceil(need)) }, OPTS);
        if (res.ok) { keep([res.event]); script.buyOk++; } else { script.buyFail++; reason(res); }
        continue;
      }
      const res = submitCommand(w, { playerId, type: "accept-contract", contractId: c.id }, OPTS);
      if (!res.ok) { script.acceptFail++; reason(res); continue; }
      keep([res.event]); script.acceptOk++;
      if (loc !== dest) {
        const t = submitCommand(w, { playerId, type: "character-action", action: "travel", targetId: dest }, OPTS);
        if (t.ok) { keep([t.event]); script.travelOk++; } else { script.travelFail++; reason(t); }
      }
    }
  };

  for (let i = 0; i < ticks; i++) {
    if (kind !== "base" && scenario !== "idle") policy();
    const result = runTick(w, { ...opts });
    keep(result.events);
    scan(result.events);
    const t = i + 1;
    // Checked right after the tick, before the post-tick hook and replies: those events are stamped with the next tick (world.tick has advanced),
    // so a replay that stops after them has already run that tick's silent start while the live world has not. A harness artifact, see the doc.
    if (t % REPLAY_EVERY === 0) {
      replayWithSilentStarts(rep, log.slice(repCursor)); repCursor = log.length;
      replay.checked++;
      if (stateHash(rep) !== stateHash(w)) {
        replay.mismatches++; replay.first ??= t; if (process.env.REPLAY_DEBUG && replay.mismatches === 1) console.error("first mismatch", t, log.slice(-60).map((e) => `${e.tick}:${e.type}`).join(" "));
        if (replay.diffs.length === 0) { const walk = (x: any, y: any, p: string) => { if (replay.diffs.length >= 4) return; if (x === null || y === null || typeof x !== "object" || typeof y !== "object") { if (JSON.stringify(x) !== JSON.stringify(y)) replay.diffs.push(`${p} live=${JSON.stringify(x)} replay=${JSON.stringify(y)}`); return; } for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], `${p}.${k}`); }; walk(JSON.parse(JSON.stringify(w)), JSON.parse(JSON.stringify(rep)), "world"); }
      }
    }
    if (kind === "hook") {
      const hookEvents = openNpcThreads(w, result.events, CAPS, drops, opened);
      keep(hookEvents);
      for (const e of result.events) if (e.type === "contract-offered" && human(e.targetId)) requestAtOffer.push(requestThreads(w, cmd).length);
    }
    keep(await resolveDueReplies(w, provider));
    if (Object.values(w.settlements).some((s) => s.factionId && s.stocks.provisions < 1)) shortageTicks++;
    for (const s of Object.values(w.settlements)) { if (prevOwner[s.id] !== s.factionId) portChanges++; prevOwner[s.id] = s.factionId; }
    if (t === 72) pins.h72 = stateHash(w).slice(0, 8);
    if (t % 100 === 0) {
      if (kind === "hook") { const mine = Object.values(w.conversationThreads).filter((th) => th.participantIds.includes(cmd)); tabs.push({ t, all: mine.length, direct: mine.filter((x) => x.kind === "direct").length, request: requestThreads(w, cmd).length }); }
    }
  }
  pins.h1200 = stateHash(w).slice(0, 8);
  const treasury: Record<string, number> = {}; let treasuryTotal = 0;
  for (const f of Object.values(w.factions)) { treasury[f.id] = Math.round(f.treasury * 100) / 100; treasuryTotal += f.treasury; }
  const econ = { counts, split, portChanges, shortageTicks, treasuryTotal: Math.round(treasuryTotal * 100) / 100, treasury, cmdMoney: Math.round(w.characters[cmd].money * 100) / 100, moneyTotal: Math.round(Object.values(w.characters).reduce((n, c) => n + c.money, 0) * 100) / 100 };
  return { buyLimits, peer, w, cmd, playerId, log, life, per100, script, failReasons, declineWhy, opened, drops, tabs, requestAtOffer, econ, replay, pins, firstHumanOffer };
}

const lt = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
for (const seed of seeds) {
  const base = await run(seed, "base", "idle");
  for (const scenario of scenarios) {
    const on = await run(seed, "on", scenario);
    const hook = await run(seed, "hook", scenario);
    const { w, cmd } = hook;
    const viol: Record<string, number> = {}; const bad = (k: string) => { viol[k] = (viol[k] ?? 0) + 1; };
    const checks: Record<string, number> = {}; const ok = (k: string) => { checks[k] = (checks[k] ?? 0) + 1; };

    // Liveness: no offer outlives its window, no accepted contract outlives its deadline by more than the one-tick landing grace.
    for (const c of Object.values(w.contracts ?? {})) {
      if (c.status === "offered" && !c.settled && c.offerExpiresTick !== undefined && w.tick > c.offerExpiresTick) bad("stuck-offer"); else if (c.offerExpiresTick !== undefined) ok("offer-not-stuck");
      if (c.carrierId === cmd && c.status === "accepted" && !c.settled && w.tick > c.deadlineTick + 1) bad("stuck-accepted"); else if (c.carrierId === cmd) ok("accepted-not-stuck");
      if (c.escrow > 0 && c.settled) bad("escrow-on-settled");
    }
    // Contract lifecycle for the human carrier (from the flag-on, no-hook run).
    const mine = [...on.life.entries()].filter(([, l]) => l.human);
    const byOutcome: Record<string, number> = {}; const latency: number[] = []; const toFulfil: number[] = []; const breachCauses: Record<string, number> = {};
    for (const [, l] of mine) {
      const o = l.outcome ?? (l.acceptedTick !== undefined ? "accepted-open" : "offered-open");
      byOutcome[o] = (byOutcome[o] ?? 0) + 1;
      if (l.acceptedTick !== undefined) latency.push(l.acceptedTick - l.offeredTick);
      if (l.outcome === "fulfilled" && l.acceptedTick !== undefined) toFulfil.push(l.outcomeTick! - l.acceptedTick);
      if (l.outcome === "breached") breachCauses[l.cause ?? "?"] = (breachCauses[l.cause ?? "?"] ?? 0) + 1;
    }
    // NPC baselines (flag-off run): accept latency and offered->fulfilled, so the human window is derived, not tuned.
    const npcLatency: number[] = []; const npcFulfil: number[] = []; const npcDeadline: number[] = [];
    for (const [, l] of base.life) { if (l.acceptedTick !== undefined) npcLatency.push(l.acceptedTick - l.offeredTick); if (l.outcome === "fulfilled" && l.acceptedTick !== undefined) npcFulfil.push(l.outcomeTick! - l.acceptedTick); }
    for (const e of base.log) if (e.type === "contract-offered") { const c = e.data.contract as SupplyContract; npcDeadline.push(c.deadlineTick - c.issuedTick); }

    // Privacy and structure, on the hook run (same sim as `on`, plus threads).
    const humanOffers = hook.log.filter((e) => e.type === "contract-offered" && e.targetId === cmd);
    const living = Object.values(w.characters).filter((c) => !c.dead).sort((a, b) => lt(a.id, b.id));
    const threadsOf = (v: string) => Object.values(w.conversationThreads).filter((t) => t.participantIds.includes(v));
    const stateCounts: Record<string, number> = {};
    for (const e of humanOffers) {
      const c0 = e.data.contract as SupplyContract; const c = w.contracts![c0.id];
      const buyer = w.characters[c.buyerId];
      // E1: the offer is a real stored offer to the human, with a window that is the check-in window and a delivery deadline after it.
      if (c0.carrierId !== cmd || c0.offerExpiresTick === undefined || c0.offerExpiresTick - c0.issuedTick !== 180 || c0.deadlineTick <= c0.offerExpiresTick) bad("offer-shape"); else ok("offer-shape");
      for (const v of living) {
        if (v.id === c.buyerId || v.id === c.carrierId) continue;
        const mate = v.factionId !== null && (v.factionId === buyer.factionId || v.factionId === w.characters[c.carrierId].factionId);
        const card = buildCards(projectFor(w, v)).find((x) => x.id === `contract:${c.id}`);
        if (mate) {
          if (!card || card.kind !== "supply-contract" || card.detail.price !== null || card.detail.quantity !== null || card.detail.escrow !== null || card.threadId !== null) bad("mate-card"); else ok("mate-card");
        } else if (card) bad("bystander-card"); else ok("bystander-card");
        const rows = projectEventFeed(w, v.id, [e]);
        const json = JSON.stringify(rows);
        // A buyer-faction mate already reads "<buyer> drew <escrow> from the treasury." on every treasury-funded NPC offer (existing sentence, same on main). Counted apart.
        const leaks = /escrow|offerExpiresTick|"price"/.test(json) || json.includes(String(c.price));
        const treasuryDraw = leaks && /drew [\d.]+ from the treasury/.test(String((rows[0] as { summary?: string } | undefined)?.summary ?? "")) && !/escrow|offerExpiresTick|"price"/.test(json);
        const key = mate ? "mate-feed-terms" : "bystander-feed-terms";
        if (treasuryDraw) bad("mate-feed-treasury-draw(existing)"); else if (leaks) bad(key); else ok(key);
        if (threadsOf(v.id).some((t) => hook.opened.some((o) => o.threadId === t.id && o.c.receiverId === cmd && o.c.sequence === e.sequence))) bad("bystander-thread"); else ok("bystander-thread");
      }
      // The carrier's own card carries the terms, an action-required flag while open, and the derived threadId.
      const cc = buildCards(projectFor(w, w.characters[cmd])).find((x) => x.id === `contract:${c.id}`);
      if (!cc || cc.role !== "carrier" || cc.detail.price === null) bad("carrier-card"); else ok("carrier-card");
      if (cc) { const st = uiState(c, w); stateCounts[st] = (stateCounts[st] ?? 0) + 1; if (cc.open !== (c.status === "offered" || c.status === "accepted")) bad("card-open"); else ok("card-open"); if (cc.threadId === null) bad("card-threadid-missing"); else ok("card-threadid"); }
    }
    // Thread openers from contract-offered.
    const cOpen = hook.opened.filter((o) => o.c.receiverId === cmd && o.c.trigger === "contract-offered");
    const known = new Set(w.players[hook.playerId].knownCharacterIds);
    let numbersChecked = 0;
    for (const o of cOpen) {
      if (!known.has(o.c.senderId)) bad("sender-unknown"); else ok("sender-known");
      if (o.c.summary === null) bad("opener-not-feed-visible"); else ok("opener-feed-visible");
      const msg = w.conversationMessages.find((m) => m.id === o.messageId)!;
      const shown = new Set(o.c.visibleNumbers);
      for (const n of msg.body.match(/\d+(?:\.\d+)?/g) ?? []) { numbersChecked++; if (!shown.has(n)) bad("number-not-in-feed-row"); }
      ok("number-scan");
      const origin = (msg as { origin?: { trigger: string; sequence: number; contractId?: string } }).origin;
      if (!origin || origin.trigger !== "contract-offered" || !origin.contractId || !w.contracts?.[origin.contractId]) bad("origin"); else ok("origin");
    }
    // Request tab: an offer thread is in request while the offer is open, and leaves it on accept or decline (not on expiry).
    for (const tid of requestThreads(w, cmd)) {
      const msgs = w.conversationMessages.filter((m) => m.threadId === tid);
      const op = [...msgs].reverse().find((m) => (m as { origin?: { trigger: string } }).origin?.trigger === "contract-offered") as { origin?: { contractId?: string } } | undefined;
      const k = op?.origin?.contractId ? w.contracts?.[op.origin.contractId] : undefined;
      if (k && (k.status === "accepted" || k.status === "declined" || k.status === "fulfilled" || k.status === "breached")) bad("answered-offer-still-in-request"); else ok("request-rule");
    }
    // Rev 2. Ruling 4: an expired offer is gone from `request` and its expiry message is unread after the player last read the opener.
    // Ruling 3: a no-longer-needed cancel opens a thread from the buyer to the human, with the fixed text and no relationship write.
    // Ruling 5: after a decline, expiry or breach, the same buyer makes no offer to the human for 180 ticks from the close.
    const rev2: Record<string, number> = {};
    const r2 = (k: string, good: boolean) => { rev2[k + (good ? ":ok" : ":bad")] = (rev2[k + (good ? ":ok" : ":bad")] ?? 0) + 1; };
    const reqNow = new Set(requestThreads(w, cmd));
    const dm = (a: string, b: string) => Object.values(w.conversationThreads).find((t) => t.kind === "direct" && t.participantIds.includes(a) && t.participantIds.includes(b));
    for (const [id, l] of [...on.life.entries()].filter(([, x]) => x.human)) {
      const k = w.contracts![id];
      if (l.outcome === "expired" || k.status === "expired") {
        const th = dm(l.buyerId, cmd);
        if (!th) { r2("expired-thread-dropped", true); continue; }
        const msgs = w.conversationMessages.filter((m) => m.threadId === th.id);
        const opener = msgs.find((m) => (m as { origin?: { trigger: string; contractId?: string } }).origin?.trigger === "contract-offered" && (m as { origin?: { contractId?: string } }).origin?.contractId === id);
        const exp = msgs.find((m) => (m as { origin?: { trigger: string; contractId?: string } }).origin?.trigger === "contract-cancelled" && (m as { origin?: { contractId?: string } }).origin?.contractId === id);
        r2("expired-leaves-request", !reqNow.has(th.id));
        if (opener && exp) { r2("expired-text", exp.body === TEXT_OFFER_EXPIRED); r2("expired-unread-after-opener-read", unreadCount(w, th.id, opener.createdTick) >= 1 && exp.createdTick > opener.createdTick); r2("expired-unread-if-never-read", unreadCount(w, th.id, null) >= 2); }
        else r2("expired-pair-or-drop", !exp ? true : false);
      }
      if (k.status === "cancelled" && k.closeReason === "no-longer-needed") {
        const msg = w.conversationMessages.find((m) => (m as { origin?: { trigger: string; contractId?: string } }).origin?.trigger === "contract-cancelled" && (m as { origin?: { contractId?: string } }).origin?.contractId === id);
        if (msg) {
          r2("nln-sender-is-buyer", msg.senderId === k.buyerId);
          r2("nln-text", msg.body === TEXT_NO_LONGER_NEEDED(w.settlements[k.destinationId].name) && !/\d/.test(msg.body));
          r2("nln-leaves-request", !reqNow.has(msg.threadId));
        } else r2("nln-thread-dropped", true);
        const rel = hook.log.filter((e) => e.type === "relationship-changed" && e.tick === (hook.log.find((x) => x.type === "contract-cancelled" && (x.data.contract as SupplyContract | undefined)?.id === id)?.tick ?? -1) && String(e.data.trigger ?? "").startsWith("contract") && [k.buyerId, k.carrierId].includes(e.actorId ?? ""));
        r2("nln-no-relationship-write", rel.length === 0);
      }
      if (k.status !== "offered" && k.status !== "accepted") {
        const note = closeNote(k, w);
        if (note.closeReason === null) r2("card-close-note-missing", false);
        else if (note.penalty) r2("card-close-note-breach-says-180", /180 ticks/.test(note.text ?? "") && /trusts you less/.test(note.text ?? ""));
        else if (note.closeReason !== "fulfilled") r2("card-close-note-no-penalty", /No penalty/.test(note.text ?? ""));
      }
      // cooldown (ruling 5), from the close of this contract.
      if (l.outcome === "breached" || l.outcome === "declined" || l.outcome === "expired") {
        const again = [...on.life.values()].filter((o) => o.human && o !== l && o.buyerId === l.buyerId && o.offeredTick > l.outcomeTick! && o.offeredTick - l.outcomeTick! < 180);
        r2("cooldown-" + l.outcome, again.length === 0);
      }
    }
    const buysHist: Record<string, number> = {}; const allowHist: Record<string, number> = {}; const byBuys: Record<string, Record<string, number>> = {};
    for (const [, l] of mine) if (l.buys !== undefined) { buysHist[l.buys] = (buysHist[l.buys] ?? 0) + 1; allowHist[l.allowance ?? 0] = (allowHist[l.allowance ?? 0] ?? 0) + 1; const o = l.outcome ?? "open"; (byBuys[l.buys] ??= {})[o] = (byBuys[l.buys][o] ?? 0) + 1; }
    // Hash neutrality of the flag-on tree with the flag off: pins must equal the base run.
    const onVsHook = JSON.stringify(on.econ) === JSON.stringify(hook.econ);
    const humanOnly = (r: typeof on) => Object.values(r.life).length;
    void humanOnly;
    console.log(JSON.stringify({
      label, seed, scenario,
      pins: { flagOff: base.pins, flagOn: on.pins, flagOnHook: hook.pins },
      firstHumanOffer: on.firstHumanOffer,
      human: { offers: mine.length, per100: on.per100, byOutcome, answerLatency: latency, toFulfil, breachCauses, script: on.script, failReasons: on.failReasons, declineWhy: on.declineWhy, uiStatesAtEnd: stateCounts },
      npc: { acceptLatency: npcLatency, toFulfil: npcFulfil, deadlineOffsets: npcDeadline, offersTotal: base.econ.counts["contract-offered"] },
      econ: { base: base.econ, on: on.econ },
      onEqualsHook: onVsHook,
      replay: { base: base.replay, on: on.replay, hook: hook.replay },
      threads: { openers: cOpen.length, tabs: hook.tabs, requestAtOffer: hook.requestAtOffer, drops: hook.drops.filter((d) => d.topic === "contract").length, dropReasons: hook.drops.filter((d) => d.topic === "contract").reduce((m: Record<string, number>, d) => { m[d.reason] = (m[d.reason] ?? 0) + 1; return m; }, {}), numbersChecked },
      peer: on.peer, buyLimits: on.buyLimits, afirst: { buysHist, allowHist, byBuys }, rev2, checks, violations: viol,
    }));
  }
}
