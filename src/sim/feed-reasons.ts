import { sha256 } from "./ai-provider.ts";
import { DEEPSEEK_PRICES, deepSeekCostUsd, deepSeekPricePeriod, jevCostUsd, JEV_PRICES, type CostLedger, type CostLine } from "./ai-vendor/cost.ts";
import type { SyncTransport } from "./ai-vendor/sync-http.ts";
import { PROMISE_BREACH_COUNT, PROMISE_WINDOW_TICKS } from "./secession.ts";
import { canonicalJson } from "./state.ts";
import type { SimEvent, WorldState } from "./types.ts";

/**
 * Slice B, feed reasons (docs/design/feed-reasons.md). A brain-written one-line
 * reason on six headline event kinds, recorded at `data.ai.reason` on the event
 * after the tick has run. Hash-neutral: nothing in `src/sim` reads it back, it
 * is not world state, and with `ai.feedReasons` unset nothing here runs.
 */
export type FeedReasonKind = "secession" | "desertion" | "breach" | "raid" | "claim" | "tax";

/** Section 12 system prompt, verbatim from the passing re-sample (`probe.mjs`). */
export const FEED_REASON_SYSTEM = "You write the one-line reason shown in a strategy game's event feed. You get one event as JSON: the facts the acting character knows. Write one sentence of at most 20 words, plain past tense. Start with the acting character's full name exactly as given in actor.name. Never use a pronoun for any person (no he, she, him, her, his, hers, they, them, their); repeat a name instead. Give as the cause only what the trigger field says. If the trigger says no cause was recorded, state what happened without a motive. Personality values run 0 to 1: you may use one as a describing word, never as the cause, and never quote the numbers. Do not add names, places, numbers, motives, events or relationships that are not in the JSON. Reply as JSON: {\"reason\": \"...\"}.";
export const FEED_REASON_PROMPT_VERSION = sha256(FEED_REASON_SYSTEM);
export const FEED_REASON_MAX_WORDS = 20;
export const FEED_REASON_MAX_TOKENS = 64;
/** Section 6: 8,000 ms, then fallback. */
export const FEED_REASON_TIMEOUT_MS = 8_000;
/** Lead ruling: $0.10 and 200 calls per run. */
export const FEED_REASON_CAP_USD = 0.10;
export const FEED_REASON_CALL_CAP = 200;
/** Lead ruling: with EXILE_RECOVERY on (more qualifying events), the brain call cap is 300. The Jev check count and the $0.10 cap are unchanged. */
export const FEED_REASON_CALL_CAP_EXILE = 300;
export function feedReasonCallCap(exileRecovery: boolean): number {
  return exileRecovery ? FEED_REASON_CALL_CAP_EXILE : FEED_REASON_CALL_CAP;
}
/** Section 12 checker: one Jev Noul per reason, flag at noul ≥ 0.5. Advisory only (section 14): it never replaces text. */
export const FEED_REASON_CHECK_THRESHOLD = 0.5;
export const FEED_REASON_CHECK_TIMEOUT_MS = 2_000;
export const FEED_REASON_CHECK = {
  type: "noul",
  instructions: "Does the reason state any motive, cause or fact that is not in the facts? Wording that only restates the facts, or describes a listed personality trait, is not new. Answer yes if it adds a cause, a feeling, a relationship, a gender, a person, a place or a number that the facts do not contain.",
} as const;

export type FeedReasonFallback = "illegal" | "timeout" | "error" | "cap" | "missing-key";

export interface FeedReasonCheck { noul: number | null; flagged: boolean; outcome: "model" | "error" | "timeout" | "cap" | "missing-key" }

export interface FeedReasonRecord {
  model: string;
  promptVersion: string;
  inputHash: string;
  text: string | null;
  outcome: "model" | "fallback" | "cached";
  fallbackReason: FeedReasonFallback | null;
  latencyMs: number;
  /** Advisory Jev check; never changes `text`. */
  check?: FeedReasonCheck;
}

export interface FeedReasonAnswer { raw: string | null; latencyMs: number; error?: "timeout" | "error" | "cap" | "missing-key" }
export interface FeedReasonWriter {
  readonly model: string;
  write(facts: Record<string, unknown>, tick: number): FeedReasonAnswer;
}
export interface FeedReasonChecker {
  check(facts: Record<string, unknown>, reason: string, tick: number): FeedReasonCheck;
}

export interface FeedReasonOptions {
  writer: FeedReasonWriter;
  checker?: FeedReasonChecker;
  /** Follow-up (a): the advisory Jev check is opt-in. Unset or false: the checker is not called. */
  check?: boolean;
  /** Brain calls per run; default 200, or 300 with exileRecovery. Counted on the writer only; the Jev checker keeps its own count, capped at 200. */
  callCap?: number;
  /** Run memory. */
  calls?: number;
  checks?: number;
  /** Within-run cache by `inputHash` (section 6). */
  cache?: Map<string, string>;
  /** Replay: recorded records by event sequence. Set, no writer is called. */
  replay?: Map<number, FeedReasonRecord>;
  /** EXILE_RECOVERY on: a raid may carry the home-port claim as its trigger. */
  exileRecovery?: boolean;
}

/** Section 2's rule. */
export function feedReasonKind(event: SimEvent): FeedReasonKind | null {
  const d = event.data ?? {};
  switch (event.type) {
    case "secession-declared": return "secession";
    case "character-deserted": return "desertion";
    case "contract-breached": return d.cause === "choice" && d.detail === "better-motive" ? "breach" : null;
    case "battle-started": return event.tick > 0 ? "raid" : null;
    case "settlement-claimed": return "claim";
    case "tax-rate-set": return !Object.prototype.hasOwnProperty.call(d, "commandId") && d.previousTaxRate !== d.taxRate ? "tax" : null;
    default: return null;
  }
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/** The home-port clause from the raider's decision this tick ("…to win back P, lost to H"), or null. */
function homeRaidTrigger(event: SimEvent, siblings: SimEvent[]): string | null {
  for (const other of siblings) {
    if (other.type !== "decision-made" || other.actorId !== event.actorId || other.data.goal !== "raid") continue;
    const reason = String((other.data.chosen as { reason?: string } | undefined)?.reason ?? "");
    const at = reason.indexOf("to win back ");
    if (at >= 0) return reason.slice(at).split(";")[0].replace(/[.\s]+$/, "");
  }
  return null;
}

/**
 * Follow-up (b): the raid's cause, read from the raider's own `decision-made` event this tick
 * (the raid scorer's recorded reason), so no new event bytes are written and hashes are unchanged.
 * Order of precedence: the home-port claim (EXILE_RECOVERY), a standing order, the plan the raid
 * supports, else the scorer's base clause (seize supplies from the estimated garrison).
 */
export function raidCause(event: SimEvent, siblings: SimEvent[], exileRecovery = false): { cause: "home-claim" | "order" | "plan" | "loot"; trigger: string } | null {
  const decision = siblings.find((other) => other.type === "decision-made" && other.actorId === event.actorId && other.data.goal === "raid");
  if (!decision) return null;
  const home = exileRecovery ? homeRaidTrigger(event, siblings) : null;
  if (home) return { cause: "home-claim", trigger: home };
  if (decision.data.orderId) return { cause: "order", trigger: "following a standing raid order from the commander" };
  const reason = String((decision.data.chosen as { reason?: string } | undefined)?.reason ?? "");
  const plan = /supports plan: ([^;]+)/.exec(reason)?.[1]?.replace(/[.\s]+$/, "");
  if (plan) return { cause: "plan", trigger: `to further the plan: ${plan}` };
  const garrison = /estimated garrison \((\d+)/.exec(reason)?.[1];
  if (/seize supplies/.test(reason)) return { cause: "loot", trigger: garrison ? `to seize supplies from a garrison believed to be about ${garrison}` : "to seize supplies" };
  return null;
}

/** Section 3 and 12: grounded facts, names not ids, with `trigger` in words. Built right after the event's tick. */
export function buildFeedFacts(world: WorldState, event: SimEvent, kind: FeedReasonKind, siblings: SimEvent[] = [], exileRecovery = false): Record<string, unknown> {
  const d = event.data as Record<string, any>;
  const a = event.actorId ? world.characters[event.actorId] : undefined;
  const fname = (id: unknown) => typeof id === "string" ? world.factions[id]?.name ?? null : null;
  const facts: Record<string, unknown> = {
    event: kind, tick: event.tick,
    actor: a ? { name: a.name, archetype: a.archetype, faction: fname(a.factionId), morale: r2(a.morale), personality: Object.fromEntries(Object.entries(a.personality).map(([k, v]) => [k, r2(v as number)])) } : null,
  };
  const port = event.settlementId ? world.settlements[event.settlementId] : undefined;
  if (port) facts.port = { name: port.name };
  if (kind === "secession") {
    facts.leftFaction = fname(d.previousFactionId);
    facts.newFaction = d.faction?.name ?? null;
    facts.followers = (Array.isArray(d.followerIds) ? d.followerIds : []).map((id: string) => world.characters[id]?.name).filter(Boolean);
    facts.garrisonFollowed = d.garrisonFollowed ?? null;
    facts.portStability = typeof d.stability === "number" ? r2(d.stability) : null;
    const routes: string[] = Array.isArray(d.routes) ? d.routes : [];
    facts.trigger = routes.length === 0 ? "declared by the commander's order" : routes.map((route) => {
      if (route === "promise") {
        const since = event.tick - PROMISE_WINDOW_TICKS;
        const n = Object.values(world.contracts ?? {}).filter((c: any) => c.status === "breached" && c.destinationId === event.settlementId && (c.observedTick ?? -Infinity) > since).length;
        return `broken promises: ${n} supply contracts owed to ${port?.name ?? "the port"} were broken in the last ${PROMISE_WINDOW_TICKS / world.ticksPerDay} days (the line is ${PROMISE_BREACH_COUNT})`;
      }
      if (route === "tax") return `tax: the ${fname(d.previousFactionId)} tax rate was above 15%`;
      if (route === "hated") return `grievance: the governor's grievance against the ${fname(d.previousFactionId)} leadership had grown past the line`;
      return String(route);
    }).join("; ");
  } else if (kind === "desertion") {
    facts.leftFaction = fname(d.previousFactionId);
    facts.nowServes = fname(d.factionId) ?? "no faction";
    facts.trigger = "twelve mornings in a row without money for a day of passage, then a desertion roll that came up";
  } else if (kind === "breach") {
    const c = d.contract ?? {};
    facts.contract = { buyer: world.characters[c.buyerId]?.name ?? null, good: c.good, quantity: c.quantity, price: c.price, deadlineTick: c.deadlineTick };
    const rel = a && c.buyerId ? a.relationships[c.buyerId] : undefined;
    if (rel) facts.actorTowardBuyer = { trust: r2(rel.trust), grievance: r2(rel.grievance) };
    facts.trigger = "dropped the accepted contract for a better-paying option";
  } else if (kind === "raid") {
    const b = d.battle ?? {};
    facts.defenderFaction = fname(b.defenderFactionId);
    facts.attackerTroops = b.attackerInitialTroops;
    facts.defenderGarrison = b.defenderInitialGarrison;
    facts.outlook = b.startingForecast?.outlook ?? null;
    const cause = raidCause(event, siblings, exileRecovery);
    if (cause) facts.cause = cause.cause;
    facts.trigger = cause?.trigger ?? "not recorded: the raid event carries no cause";
  } else if (kind === "claim") {
    facts.previousHolder = fname(d.previousFactionId);
    facts.newHolder = fname(d.factionId);
    facts.basis = d.basis;
    facts.garrison = d.garrison;
    facts.trigger = "the port surrendered and the claim was accepted";
  } else {
    facts.faction = fname(d.factionId);
    facts.previousRate = `${Math.round(d.previousTaxRate * 100)}%`;
    facts.newRate = `${Math.round(d.taxRate * 100)}%`;
    facts.trigger = d.taxRate > d.previousTaxRate ? "the treasury was short" : "unrest in a port the faction held";
  }
  return facts;
}

export function feedReasonInputHash(facts: Record<string, unknown>): string {
  return sha256(canonicalJson({ promptVersion: FEED_REASON_PROMPT_VERSION, facts }));
}

const PRONOUNS = new Set(["he", "she", "him", "her", "his", "hers", "they", "them", "their", "theirs", "himself", "herself", "themselves"]);

/**
 * Section 4's check. Returns the reason or null (illegal): JSON parses, one
 * sentence of 1–20 words, every capitalised word and every number appears in
 * the facts, and (name-only ruling) no personal pronoun.
 */
export function validateFeedReason(raw: string | null, facts: Record<string, unknown>): string | null {
  if (raw === null) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  const text = value && typeof value === "object" && typeof (value as { reason?: unknown }).reason === "string" ? (value as { reason: string }).reason.trim() : null;
  if (!text) return null;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > FEED_REASON_MAX_WORDS) return null;
  const haystack = JSON.stringify(facts);
  const lower = haystack.toLowerCase();
  for (const word of words) {
    const bare = word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").replace(/'s$/, "");
    if (!bare) continue;
    if (PRONOUNS.has(bare.toLowerCase())) return null;
    for (const num of bare.match(/\d+(?:\.\d+)?/g) ?? []) if (!haystack.includes(num)) return null;
    if (/^\p{Lu}/u.test(bare) && !lower.includes(bare.toLowerCase())) return null;
  }
  return text;
}

/** Stub writer (offline, no network): states the act and the trigger from the facts. Deterministic. */
export function stubFeedReasonWriter(): FeedReasonWriter {
  return {
    model: "stub",
    write(facts) {
      const name = (facts.actor as { name?: string } | null)?.name ?? "Someone";
      const trigger = String(facts.trigger ?? "");
      const text = trigger.startsWith("not recorded") ? `${name} acted.` : `${name} acted: ${trigger}.`;
      const words = text.split(/\s+/);
      return { raw: JSON.stringify({ reason: words.length > FEED_REASON_MAX_WORDS ? `${name} acted.` : text }), latencyMs: 0 };
    },
  };
}

/** Section 4 + 6: annotate this tick's qualifying events. Never touches world state. */
export function annotateFeedReasons(world: WorldState, events: SimEvent[], options: FeedReasonOptions): void {
  const cap = options.callCap ?? feedReasonCallCap(options.exileRecovery === true);
  const checkCap = Math.min(cap, FEED_REASON_CALL_CAP);
  options.cache ??= new Map();
  for (const event of events) {
    const kind = feedReasonKind(event);
    if (!kind) continue;
    const facts = buildFeedFacts(world, event, kind, events, options.exileRecovery === true);
    const inputHash = feedReasonInputHash(facts);
    let record: FeedReasonRecord;
    if (options.replay) {
      const recorded = options.replay.get(event.sequence);
      record = recorded ?? { model: "replay", promptVersion: FEED_REASON_PROMPT_VERSION, inputHash, text: null, outcome: "fallback", fallbackReason: "error", latencyMs: 0 };
    } else if (options.cache.has(inputHash)) {
      record = { model: options.writer.model, promptVersion: FEED_REASON_PROMPT_VERSION, inputHash, text: options.cache.get(inputHash)!, outcome: "cached", fallbackReason: null, latencyMs: 0 };
    } else {
      const base = { model: options.writer.model, promptVersion: FEED_REASON_PROMPT_VERSION, inputHash };
      if ((options.calls ?? 0) >= cap) {
        record = { ...base, text: null, outcome: "fallback", fallbackReason: "cap", latencyMs: 0 };
      } else {
        const answer = options.writer.write(facts, event.tick);
        if (answer.error !== "cap" && answer.error !== "missing-key") options.calls = (options.calls ?? 0) + 1;
        const text = answer.error ? null : validateFeedReason(answer.raw, facts);
        record = { ...base, text, outcome: text ? "model" : "fallback", fallbackReason: text ? null : (answer.error ?? "illegal"), latencyMs: answer.latencyMs };
        if (text) options.cache.set(inputHash, text);
        if (text && options.checker && options.check === true) {
          if ((options.checks ?? 0) >= checkCap) record.check = { noul: null, flagged: false, outcome: "cap" };
          else {
            record.check = options.checker.check(facts, text, event.tick);
            if (record.check.outcome !== "cap" && record.check.outcome !== "missing-key") options.checks = (options.checks ?? 0) + 1;
          }
        }
      }
    }
    event.data = { ...event.data, ai: { ...((event.data.ai as Record<string, unknown> | undefined) ?? {}), reason: record } };
  }
}

/** Replay map from recorded events (sequence → record). */
export function feedReasonReplay(events: SimEvent[]): Map<number, FeedReasonRecord> {
  const map = new Map<number, FeedReasonRecord>();
  for (const event of events) {
    const record = (event.data?.ai as { reason?: FeedReasonRecord } | undefined)?.reason;
    if (record) map.set(event.sequence, record);
  }
  return map;
}

// ---- vendors ---------------------------------------------------------------

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const DEEPSEEK_MODEL = "deepseek-v4-pro";
const JEV_URL = "https://api.typesafe.ai/v1/systemone";
const JEV_MODEL = "jev-1.14.0";
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;

export function feedReasonRequestBody(facts: Record<string, unknown>): string {
  return JSON.stringify({
    model: DEEPSEEK_MODEL,
    messages: [{ role: "system", content: FEED_REASON_SYSTEM }, { role: "user", content: JSON.stringify(facts) }],
    thinking: { type: "disabled" }, response_format: { type: "json_object" },
    max_tokens: FEED_REASON_MAX_TOKENS, temperature: 0, stream: false,
  });
}

export function feedReasonWorstCaseUsd(body: string): number {
  return Buffer.byteLength(body, "utf8") * DEEPSEEK_PRICES.peak.miss + FEED_REASON_MAX_TOKENS * DEEPSEEK_PRICES.peak.out;
}

interface VendorOptions { transport: SyncTransport; ledger: CostLedger; env?: Record<string, string | undefined>; now?: () => Date; timeoutMs?: number }

/** DeepSeek writer. The key is read once from the env and only sent as a header; never logged. */
export function deepSeekFeedReasonWriter(options: VendorOptions): FeedReasonWriter {
  const key = (options.env ?? process.env).DEEPSEEK_API_KEY;
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.timeoutMs ?? FEED_REASON_TIMEOUT_MS;
  const base = (tick: number) => ({
    tick, role: "brain.feedReason" as const, provider: "deepseek" as const, model: DEEPSEEK_MODEL, responseModel: null, systemFingerprint: null, finishReason: null,
    tokensIn: 0, tokensInCacheHit: 0, tokensOut: 0, estimatedCostUsd: 0, priceSource: DEEPSEEK_PRICES.source, priceCheckedOn: DEEPSEEK_PRICES.checkedOn,
  });
  return {
    model: DEEPSEEK_MODEL,
    write(facts, tick) {
      const started = now();
      const period = deepSeekPricePeriod(started);
      const unreached = (reason: "cap" | "missing-key"): FeedReasonAnswer => {
        options.ledger.record({ ...base(tick), pricePeriod: period, outcome: "fallback", fallbackReason: reason, status: null });
        return { raw: null, latencyMs: 0, error: reason };
      };
      if (!key) return unreached("missing-key");
      const body = feedReasonRequestBody(facts);
      if (options.ledger.wouldExceed(feedReasonWorstCaseUsd(body))) return unreached("cap");
      const response = options.transport({ url: DEEPSEEK_URL, headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body, timeoutMs });
      const latencyMs = Math.max(0, now().getTime() - started.getTime());
      if (response.kind !== "response") {
        const reason = response.kind === "timeout" ? "timeout" : "error";
        options.ledger.record({ ...base(tick), pricePeriod: period, outcome: "fallback", fallbackReason: reason, status: null });
        return { raw: null, latencyMs, error: reason };
      }
      let parsed: Record<string, any> | null = null;
      try { const v = JSON.parse(response.body); parsed = v && typeof v === "object" ? v : null; } catch { parsed = null; }
      const usage = parsed?.usage ?? {};
      const hit = num(usage.prompt_cache_hit_tokens);
      const miss = usage.prompt_cache_miss_tokens !== undefined ? num(usage.prompt_cache_miss_tokens) : Math.max(0, num(usage.prompt_tokens) - hit);
      const out = num(usage.completion_tokens);
      const line = {
        ...base(tick),
        responseModel: typeof parsed?.model === "string" ? parsed.model : null,
        systemFingerprint: typeof parsed?.system_fingerprint === "string" ? parsed.system_fingerprint : null,
        finishReason: typeof parsed?.choices?.[0]?.finish_reason === "string" ? String(parsed.choices[0].finish_reason).slice(0, 40) : null,
        tokensIn: miss + hit, tokensInCacheHit: hit, tokensOut: out, estimatedCostUsd: deepSeekCostUsd(period, miss, hit, out), pricePeriod: period, status: response.status,
      };
      if (response.status !== 200 || !parsed) {
        options.ledger.record({ ...line, outcome: "fallback", fallbackReason: "error" });
        return { raw: null, latencyMs, error: "error" };
      }
      const choice = parsed.choices?.[0];
      const raw = choice?.finish_reason === "length" ? null : typeof choice?.message?.content === "string" ? choice.message.content : null;
      const legal = validateFeedReason(raw, facts) !== null;
      options.ledger.record({ ...line, outcome: legal ? "model" : "fallback", fallbackReason: legal ? null : "illegal" });
      return { raw, latencyMs };
    },
  };
}

/** Jev Noul checker (section 12), advisory: the result is recorded, never acted on. */
export function jevFeedReasonChecker(options: VendorOptions): FeedReasonChecker {
  const key = (options.env ?? process.env).JEV_API_KEY;
  const timeoutMs = options.timeoutMs ?? FEED_REASON_CHECK_TIMEOUT_MS;
  const base = (tick: number) => ({
    tick, role: "check.feedReason" as const, provider: "jev" as const, model: JEV_MODEL, responseModel: null,
    tokensIn: 0, tokensInCacheHit: 0, tokensOut: 0, estimatedCostUsd: 0, pricePeriod: "flat" as const, priceSource: JEV_PRICES.source, priceCheckedOn: JEV_PRICES.checkedOn,
  });
  return {
    check(facts, reason, tick) {
      const miss = (outcome: "cap" | "missing-key"): FeedReasonCheck => {
        options.ledger.record({ ...base(tick), outcome: "fallback", fallbackReason: outcome, status: null });
        return { noul: null, flagged: false, outcome };
      };
      if (!key) return miss("missing-key");
      const body = JSON.stringify({ model: JEV_MODEL, state: { facts, reason }, questions: { invented: FEED_REASON_CHECK } });
      if (options.ledger.wouldExceed(jevCostUsd(Buffer.byteLength(body, "utf8")))) return miss("cap");
      const response = options.transport({ url: JEV_URL, headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body, timeoutMs });
      if (response.kind !== "response") {
        options.ledger.record({ ...base(tick), outcome: "fallback", fallbackReason: response.kind === "timeout" ? "timeout" : "error", status: null });
        return { noul: null, flagged: false, outcome: response.kind === "timeout" ? "timeout" : "error" };
      }
      let parsed: Record<string, any> | null = null;
      try { const v = JSON.parse(response.body); parsed = v && typeof v === "object" ? v : null; } catch { parsed = null; }
      const tokensIn = num(parsed?.usage?.input_tokens);
      const noulRaw = parsed?.answers?.invented?.noul;
      const noul = typeof noulRaw === "number" && Number.isFinite(noulRaw) ? Math.min(1, Math.max(0, noulRaw)) : null;
      const ok = response.status === 200 && noul !== null;
      options.ledger.record({ ...base(tick), responseModel: typeof parsed?.model === "string" ? parsed.model : null, tokensIn, tokensOut: num(parsed?.usage?.output_tokens), estimatedCostUsd: jevCostUsd(tokensIn), outcome: ok ? "model" : "fallback", fallbackReason: ok ? null : "error", status: response.status });
      return ok ? { noul: r2(noul!), flagged: noul! >= FEED_REASON_CHECK_THRESHOLD, outcome: "model" } : { noul: null, flagged: false, outcome: "error" };
    },
  };
}

/** Feed line (section 4): `<today's line> — <text>` when a model reason is recorded; today's line otherwise. */
export function withFeedReason(line: string, event: SimEvent): string {
  const record = (event.data?.ai as { reason?: FeedReasonRecord } | undefined)?.reason;
  return record?.text ? `${line} — ${record.text}` : line;
}
