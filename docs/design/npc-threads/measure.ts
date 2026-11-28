// npc-threads.md harness: one config x one scenario x N seeds x 1,200 ticks, offline, no AI, $0.
// Usage: node --experimental-strip-types docs/design/npc-threads/measure.ts <label> '<TickOptions JSON>'
// Env: SEEDS=1847,..., TICKS=1200, SCENARIO=idle|attentive, ROLE=character-01 (the human), CAPS=<perReceiver>,<perPair>,<perSender> (default no caps)
// Prints one JSON row per seed.
import { createHash } from "node:crypto";
import { runTick } from "../../../src/sim/engine.ts";
import { createPrototypeWorld } from "../../../src/sim/scenario.ts";
import { stateHash } from "../../../src/sim/state.ts";
import { replayWithSilentStarts } from "../../../src/sim/tick-start.ts";
import { submitCommand } from "../../../src/sim/commands.ts";
import { DeterministicDialogueProvider, resolveDueReplies, sendConversationMessage } from "../../../src/sim/conversations.ts";
import type { SimEvent, WorldState } from "../../../src/sim/types.ts";
import { buildCards, projectFor } from "../ui-cards-v1/cards.ts";
import { candidatesFor, TOPICS, WINDOW, type Topic } from "./triggers.ts";
import { NO_CAPS, openNpcThreads, requestThreads, type Caps, type Drop, type Opened } from "./hook.ts";

const [label, optsJson] = process.argv.slice(2);
const opts = JSON.parse(optsJson ?? "{}");
const ticks = Number(process.env.TICKS ?? 1200);
const seeds = (process.env.SEEDS ?? "1847,2718,4096,1000,2000,3000,4000,5000,6000,7000,8000,9000,10000").split(",").map(Number);
const scenario = process.env.SCENARIO ?? "idle";
const role = process.env.ROLE ?? "character-01";
const caps: Caps = process.env.CAPS ? (([r, p, s]) => ({ perReceiver: Number(r), perPair: Number(p), perSender: Number(s) }))(process.env.CAPS.split(",")) : NO_CAPS;
const provider = new DeterministicDialogueProvider();
const lt = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 8);

/** The world with every conversation field blanked: it must equal the hook-off hash (the hook writes nothing else). */
/** Ids and counters that are minted from `nextEventSequence`. The hook consumes sequence numbers, so these shift; nothing else may. */
const normIds = (x: string) => x.replace(/(battle|debt|news)-\d+/g, "$1-N").replace(/"sequence":\d+/g, '"sequence":0').replace(/seq \d+/g, "seq N");
function blankedHash(w: WorldState): string {
  const c = structuredClone(w);
  c.nextEventSequence = 0;
  c.conversationThreads = {}; c.conversationMessages = []; c.scheduledReplies = [];
  c.nextThreadSequence = 1; c.nextMessageSequence = 1; c.nextReplySequence = 1;
  for (const p of Object.values(c.players)) p.conversationTagScores = {};
  return sha(normIds(JSON.stringify(c)));
}
const quant = (xs: number[], q: number) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))] : null);

async function run(seed: number, hookOn: boolean, nTicks: number = ticks) {
  const w = createPrototypeWorld(seed, { playerCharacterId: role });
  const playerId = Object.keys(w.players)[0];
  const cmd = w.players[playerId].characterId;
  const log: SimEvent[] = [];
  // The store serializes events as it appends them, so a later mutation of a live object can never reach the log. Clone the same way.
  const keep = (evs: SimEvent[]) => { for (const e of evs) log.push(structuredClone(e)); };
  const simDigest = createHash("sha256");
  const drops: Drop[] = []; const opened: Opened[] = [];
  const viol: Record<string, number> = {}; const bad = (k: string) => { viol[k] = (viol[k] ?? 0) + 1; };
  const checks: Record<string, number> = {}; const ok = (k: string) => { checks[k] = (checks[k] ?? 0) + 1; };
  let h72 = "";
  const script = { confirmOk: 0, confirmFail: 0, offerOk: 0, offerFail: 0, replies: 0 };
  const tabs: Array<{ t: number; all: number; direct: number; group: number; request: number }> = [];
  const proxy = { raw: 0, notVisible: 0, afterPair: 0, byTopic: Object.fromEntries(TOPICS.map((t) => [t, 0])) as Record<string, number>, byTrigger: {} as Record<string, number>,
    recvBin: new Map<string, number>(), pairBin: new Map<string, number>(), sendBin: new Map<string, number>(), rawRecvBin: new Map<string, number>(), rawPairBin: new Map<string, number>(), rawSendBin: new Map<string, number>() };
  const lastPair = new Map<string, number>();
  const eventsPerTick: number[] = [];
  const answerDelays: number[] = [];
  const trace: Array<{ len: number; hash: string }> = [];

  for (let i = 0; i < nTicks; i++) {
    if (scenario === "attentive") {
      for (const r of Object.values(w.characters)) for (const o of r.standingOrders) {
        if (o.issuerId === cmd && o.status === "awaiting-confirmation") {
          const res = submitCommand(w, { playerId, type: "confirm-order", characterId: r.id, orderId: o.id });
          if (res.ok) { keep([res.event]); script.confirmOk++; } else script.confirmFail++;
        }
      }
      if (w.tick > 0 && w.tick % 60 === 0) {
        const carriers = ["character-02", "character-07", "character-12", "character-17"].filter((id) => id !== cmd);
        const res = submitCommand(w, { playerId, type: "offer-contract", characterId: carriers[(w.tick / 60) % carriers.length], quantity: 10, destinationId: "crown-harbor", price: 18, expiresInTicks: 12 });
        if (res.ok) { keep([res.event]); script.offerOk++; } else script.offerFail++;
      }
      if (hookOn) for (const tid of requestThreads(w, cmd)) {
        const last = w.conversationMessages.filter((m) => m.threadId === tid).at(-1)!;
        if (w.tick - last.createdTick >= 3) {
          const res = sendConversationMessage(w, { playerId, threadId: tid, body: "Understood. Keep me informed." });
          if (res.ok) { keep(res.events); script.replies++; answerDelays.push(w.tick - last.createdTick); }
        }
      }
    }
    const result = runTick(w, { ...opts });
    keep(result.events);
    simDigest.update(normIds(JSON.stringify(result.events.map((e) => ({ ...e, sequence: 0 })))));
    eventsPerTick.push(result.events.length);
    if (hookOn) {
      // Proxy stream (read only): every character as a receiver, character-level topics, same pair rule, nobody ever answers.
      for (const ev of result.events) for (const c of candidatesFor(w, ev, "any")) {
        if (c.topic !== "order" && c.topic !== "contract" && c.topic !== "captivity") continue;
        proxy.raw++;
        if (c.summary === null) { proxy.notVisible++; continue; }
        const bin = Math.floor(c.tick / 100);
        const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
        bump(proxy.rawRecvBin, `${c.receiverId}|${bin}`); bump(proxy.rawPairBin, `${c.senderId}>${c.receiverId}|${bin}`); bump(proxy.rawSendBin, `${c.senderId}|${bin}`);
        const pk = `${c.senderId}>${c.receiverId}>${c.trigger}`; const last = lastPair.get(pk);
        if (last !== undefined && c.tick - last < WINDOW) continue;
        lastPair.set(pk, c.tick);
        proxy.afterPair++; proxy.byTopic[c.topic]++; proxy.byTrigger[c.trigger] = (proxy.byTrigger[c.trigger] ?? 0) + 1;
        bump(proxy.recvBin, `${c.receiverId}|${bin}`); bump(proxy.pairBin, `${c.senderId}>${c.receiverId}|${bin}`); bump(proxy.sendBin, `${c.senderId}|${bin}`);
      }
      const hookEvents = openNpcThreads(w, result.events, caps, drops, opened);
      keep(hookEvents);
    }
    const replyEvents = await resolveDueReplies(w, provider);
    keep(replyEvents);
    const t = i + 1;
    if (t === 72) h72 = stateHash(w).slice(0, 8);
    if (hookOn && (t === 72 || t % 100 === 0)) {
      const mine = Object.values(w.conversationThreads).filter((th) => th.participantIds.includes(cmd));
      tabs.push({ t, all: mine.length, direct: mine.filter((x) => x.kind === "direct").length, group: mine.filter((x) => x.kind === "group").length, request: requestThreads(w, cmd).length });
    }
  }
  return { trace, w, cmd, log, simDigest: simDigest.digest("hex").slice(0, 8), drops, opened, viol, checks, bad, ok, h72, h1200: stateHash(w).slice(0, 8), script, tabs, proxy, eventsPerTick, answerDelays, playerId };
}

for (const seed of seeds) {
  const off = await run(seed, false);
  const on = await run(seed, true);
  const { w, cmd, opened, drops, bad, ok } = on;
  // Replay exactness: the log alone rebuilds the hook-on world.
  const rep = createPrototypeWorld(seed, { playerCharacterId: role });
  replayWithSilentStarts(rep, on.log);
  const replayExact = stateHash(rep) === stateHash(w);
  const convOf = (x: WorldState) => JSON.stringify([x.conversationThreads, x.conversationMessages, x.scheduledReplies, x.nextThreadSequence, x.nextMessageSequence, x.nextReplySequence]);
  const conversationReplayExact = convOf(rep) === convOf(w);
  const replayDiffs: string[] = [];
  if (!replayExact) {
    const walk = (x: any, y: any, path: string) => { if (replayDiffs.length >= 6) return; if (typeof x !== typeof y || x === null || y === null || typeof x !== "object") { if (JSON.stringify(x) !== JSON.stringify(y)) replayDiffs.push(path); return; } for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], path + "." + k); };
    walk(JSON.parse(JSON.stringify(w)), JSON.parse(JSON.stringify(rep)), "world");
  }
  const repOff = createPrototypeWorld(seed, { playerCharacterId: role });
  replayWithSilentStarts(repOff, off.log);
  const replayExactHookOff = stateHash(repOff) === stateHash(off.w);

  // The hook is observer-only for the sim.
  const simStreamEqual = off.simDigest === on.simDigest;
  const blankedEqual = blankedHash(w) === blankedHash(off.w);

  // Privacy and structure checks on every opener.
  const samples: Record<string, string[]> = {};
  let numbersChecked = 0;
  const known = new Set(w.players[on.playerId].knownCharacterIds);
  const humanIds = Object.values(w.players).map((p) => p.characterId);
  const threadsOf = (viewerId: string) => Object.values(w.conversationThreads).filter((t) => t.participantIds.includes(viewerId));
  const others = Object.values(w.characters).filter((c) => !c.dead && !humanIds.includes(c.id)).sort((a, b) => lt(a.id, b.id));
  for (const o of opened) {
    const c = o.c;
    if (!humanIds.includes(c.receiverId)) bad("receiver-not-human"); else ok("receiver-human");
    if (!known.has(c.senderId)) bad("sender-unknown"); else ok("sender-known");
    if (c.summary === null) bad("opener-not-feed-visible"); else ok("opener-feed-visible");
    const th = w.conversationThreads[o.threadId];
    if (!th || th.participantIds.length !== 2 || !th.participantIds.includes(c.senderId) || !th.participantIds.includes(c.receiverId)) bad("thread-participants"); else ok("thread-participants");
    const msg = w.conversationMessages.find((m) => m.id === o.messageId)!;
    if (msg.source !== "autonomous" || msg.replyToId !== undefined || msg.senderId !== c.senderId) bad("opener-shape"); else ok("opener-shape");
    // Every number in the text must already be in the receiver's own projected feed row for the source event.
    const shown = new Set(c.visibleNumbers);
    for (const n of msg.body.match(/\d+(?:\.\d+)?/g) ?? []) {
      numbersChecked++;
      if (!shown.has(n)) { bad("number-not-in-receiver-feed-row"); (samples[c.trigger] ??= []).push(`${n} :: ${msg.body}`); }
    }
    ok("number-scan");
    // Only participants see it.
    const bystander = others.find((x) => x.id !== c.senderId);
    if (bystander && threadsOf(bystander.id).some((t) => t.id === o.threadId)) bad("bystander-sees-thread"); else ok("bystander-no-thread");
  }
  // Request tab rule and answered threads leave it.
  const req = requestThreads(w, cmd);
  for (const tid of req) { const th = w.conversationThreads[tid]; if (th.createdById === cmd || w.conversationMessages.some((m) => m.threadId === tid && m.senderId === cmd)) bad("request-rule"); else ok("request-rule"); }
  // Cards: derived threadId reaches order and contract cards of the commander; never non-null for a non-participant viewer.
  const cmdChar = w.characters[cmd];
  const cards = buildCards(projectFor(w, cmdChar));
  let linked = 0;
  for (const card of cards) {
    if (card.threadId === null) continue;
    linked++;
    if (!threadsOf(cmd).some((t) => t.id === card.threadId)) bad("card-threadid-not-participant"); else ok("card-threadid-participant");
  }
  for (const v of others.slice(0, 6)) for (const card of buildCards(projectFor(w, v))) {
    if (card.threadId !== null && !threadsOf(v.id).some((t) => t.id === card.threadId)) bad("card-threadid-leak"); else ok("card-threadid-viewer-scoped");
  }
  const orderCardsWithThread = cards.filter((x) => x.kind === "order-report" && x.threadId !== null).length;

  // Volumes for the human receiver.
  const mineOpeners = opened.filter((o) => o.c.receiverId === cmd);
  const byTopic: Record<string, number> = Object.fromEntries(TOPICS.map((t) => [t, 0]));
  const byTrigger: Record<string, number> = {};
  const bins = new Array(Math.ceil(ticks / 100)).fill(0);
  for (const o of mineOpeners) { byTopic[o.c.topic]++; byTrigger[o.c.trigger] = (byTrigger[o.c.trigger] ?? 0) + 1; bins[Math.min(bins.length - 1, Math.floor(o.c.tick / 100))]++; }
  const dropsBy: Record<string, number> = {};
  for (const d of drops) { const k = `${d.reason}:${d.topic}`; dropsBy[k] = (dropsBy[k] ?? 0) + 1; }
  const msgs = w.conversationMessages.filter((m) => w.conversationThreads[m.threadId]?.participantIds.includes(cmd));
  const maxWin = (() => { let best = 0, sum = 0; for (let i = 0; i < on.eventsPerTick.length; i++) { sum += on.eventsPerTick[i]; if (i >= WINDOW) sum -= on.eventsPerTick[i - WINDOW]; best = Math.max(best, sum); } return best; })();
  const cells = (m: Map<string, number>) => [...m.values()];
  console.log(JSON.stringify({
    label, seed, scenario, role, caps,
    pins: { hookOff: { h72: off.h72, h1200: off.h1200 }, hookOn: { h72: on.h72, h1200: on.h1200 } },
    replayExact, replayExactHookOff, conversationReplayExact, replayDiffs, simStreamEqual, blankedEqual,
    commander: {
      openers: mineOpeners.length, byTopic, byTrigger, per100: bins, threadsCreated: mineOpeners.filter((o) => o.newThread).length,
      storedMessages: msgs.length, npcReplies: msgs.filter((m) => m.source === "autonomous" && m.replyToId !== undefined).length, playerMessages: msgs.filter((m) => m.senderId === cmd).length,
      threadsAtEnd: threadsOf(cmd).length, requestAtEnd: req.length, tabs: on.tabs, drops: dropsBy, cardsWithThreadId: linked, orderCardsWithThread,
    },
    script: on.script, answerDelays: on.answerDelays.length ? { n: on.answerDelays.length, min: Math.min(...on.answerDelays), max: Math.max(...on.answerDelays) } : null,
    proxy: {
      raw: on.proxy.raw, notVisible: on.proxy.notVisible, afterPair: on.proxy.afterPair, byTopic: on.proxy.byTopic, byTrigger: on.proxy.byTrigger,
      recv: cells(on.proxy.recvBin), pair: cells(on.proxy.pairBin), send: cells(on.proxy.sendBin), rawRecv: cells(on.proxy.rawRecvBin), rawPair: cells(on.proxy.rawPairBin), rawSend: cells(on.proxy.rawSendBin),
    },
    maxEventsIn180Ticks: maxWin, quant: quant(cells(on.proxy.recvBin), 0.95),
    checks: { ...on.checks, "numbers-checked": numbersChecked }, violations: { ...on.viol }, samples,
  }));
}
