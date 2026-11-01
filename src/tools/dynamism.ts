import type { SimEvent } from "../sim/types.ts";

/**
 * Dynamism readout (docs/design/dynamism-readout.md). Pure: reads a list of
 * events and returns counts. It imports no engine code, runs no tick, and
 * writes nothing, so it cannot move a hash.
 */
export const READOUT_VERSION = 1;
/** Default window length in ticks (one tenth of the standard 1,200-tick run, rounded to 10 tax clocks). */
export const DEFAULT_WINDOW_TICKS = 240;
/** An actor needs this many `decision-made` events to get an entropy figure. */
export const DEFAULT_MIN_DECISIONS = 20;

export interface Counts {
  portOwnershipChanges: number;
  portsChangedHands: number;
  secessions: number;
  desertions: number;
  captures: number;
  releases: number;
  deaths: number;
  rateChanges: number;
  rateRaises: number;
  rateCuts: number;
  decisions: number;
}

export interface ActorEntropy {
  actorId: string;
  decisions: number;
  kinds: number;
  entropyBits: number;
  normalized: number;
}

export interface ActionVariety {
  actorsMeasured: number;
  meanEntropyBits: number;
  meanNormalized: number;
  minEntropyBits: number;
  maxEntropyBits: number;
  globalEntropyBits: number;
  globalKinds: number;
  actors: ActorEntropy[];
}

export interface WindowReadout extends Counts {
  fromTick: number;
  toTick: number;
}

export interface DynamismReadout {
  version: number;
  events: number;
  firstTick: number | null;
  lastTick: number | null;
  windowTicks: number;
  minDecisions: number;
  totals: Counts;
  rateChangesByFaction: Record<string, number>;
  actionVariety: ActionVariety;
  windows: WindowReadout[];
}

export interface ReadoutOptions {
  windowTicks?: number;
  minDecisions?: number;
}

function emptyCounts(): Counts {
  return { portOwnershipChanges: 0, portsChangedHands: 0, secessions: 0, desertions: 0, captures: 0, releases: 0, deaths: 0, rateChanges: 0, rateRaises: 0, rateCuts: 0, decisions: 0 };
}

const cents = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) : null;
const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

/** Shannon entropy in bits of a count table. Zero for one kind or none. */
export function entropyBits(counts: Iterable<number>): number {
  const values = [...counts].filter((count) => count > 0);
  const total = values.reduce((sum, count) => sum + count, 0);
  if (total === 0) return 0;
  let bits = 0;
  for (const count of values) {
    const p = count / total;
    bits -= p * Math.log2(p);
  }
  return bits;
}

/** The action kind of a `decision-made`: `data.goal` (the chosen action, or "haul"). */
export function actionKind(event: SimEvent): string {
  const goal = event.data.goal;
  return typeof goal === "string" && goal.length > 0 ? goal : "unknown";
}

/** Adds one event to a count block. `ports` collects settlement ids that changed hands. */
function count(target: Counts, event: SimEvent, ports: Set<string>): void {
  switch (event.type) {
    case "settlement-claimed":
      if ((event.data.factionId ?? null) !== (event.data.previousFactionId ?? null)) {
        target.portOwnershipChanges += 1;
        if (event.settlementId) ports.add(event.settlementId);
      }
      break;
    case "secession-declared":
      target.secessions += 1;
      target.portOwnershipChanges += 1;
      if (event.settlementId) ports.add(event.settlementId);
      break;
    case "character-deserted": target.desertions += 1; break;
    case "character-captured": target.captures += 1; break;
    case "captivity-released": target.releases += 1; break;
    case "character-died": target.deaths += 1; break;
    case "tax-rate-set": {
      const next = cents(event.data.taxRate);
      const previous = cents(event.data.previousTaxRate);
      if (next === null || previous === null || next === previous) break;
      target.rateChanges += 1;
      if (next > previous) target.rateRaises += 1; else target.rateCuts += 1;
      break;
    }
    case "decision-made": target.decisions += 1; break;
  }
}

export function dynamismReadout(events: readonly SimEvent[], options: ReadoutOptions = {}): DynamismReadout {
  const windowTicks = options.windowTicks ?? DEFAULT_WINDOW_TICKS;
  const minDecisions = options.minDecisions ?? DEFAULT_MIN_DECISIONS;
  if (!Number.isSafeInteger(windowTicks) || windowTicks <= 0) throw new Error("windowTicks must be a positive integer");
  if (!Number.isSafeInteger(minDecisions) || minDecisions <= 0) throw new Error("minDecisions must be a positive integer");
  const ordered = [...events].sort((left, right) => left.sequence - right.sequence);
  const totals = emptyCounts();
  const totalPorts = new Set<string>();
  const windows = new Map<number, { counts: Counts; ports: Set<string> }>();
  const byFaction: Record<string, number> = {};
  const perActor = new Map<string, Map<string, number>>();
  const global = new Map<string, number>();
  for (const event of ordered) {
    count(totals, event, totalPorts);
    // Window w holds ticks (w*W, (w+1)*W]; tick 0 falls in window 0.
    const index = Math.max(0, Math.ceil(event.tick / windowTicks) - 1);
    let window = windows.get(index);
    if (!window) windows.set(index, window = { counts: emptyCounts(), ports: new Set() });
    count(window.counts, event, window.ports);
    if (event.type === "tax-rate-set") {
      const next = cents(event.data.taxRate);
      const previous = cents(event.data.previousTaxRate);
      const factionId = String(event.data.factionId ?? event.targetId ?? "");
      if (next !== null && previous !== null && next !== previous) byFaction[factionId] = (byFaction[factionId] ?? 0) + 1;
    }
    if (event.type === "decision-made" && event.actorId) {
      const kind = actionKind(event);
      let table = perActor.get(event.actorId);
      if (!table) perActor.set(event.actorId, table = new Map());
      table.set(kind, (table.get(kind) ?? 0) + 1);
      global.set(kind, (global.get(kind) ?? 0) + 1);
    }
  }
  totals.portsChangedHands = totalPorts.size;
  const actors: ActorEntropy[] = [];
  for (const [actorId, table] of [...perActor].sort(([left], [right]) => left.localeCompare(right))) {
    const decisions = [...table.values()].reduce((sum, value) => sum + value, 0);
    if (decisions < minDecisions) continue;
    const bits = entropyBits(table.values());
    actors.push({ actorId, decisions, kinds: table.size, entropyBits: round4(bits), normalized: round4(table.size > 1 ? bits / Math.log2(table.size) : 0) });
  }
  const mean = (values: number[]) => values.length ? round4(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
  const bitsList = actors.map((actor) => actor.entropyBits);
  return {
    version: READOUT_VERSION,
    events: ordered.length,
    firstTick: ordered.length ? ordered[0].tick : null,
    lastTick: ordered.length ? ordered[ordered.length - 1].tick : null,
    windowTicks,
    minDecisions,
    totals,
    rateChangesByFaction: Object.fromEntries(Object.entries(byFaction).sort(([left], [right]) => left.localeCompare(right))),
    actionVariety: {
      actorsMeasured: actors.length,
      meanEntropyBits: mean(bitsList),
      meanNormalized: mean(actors.map((actor) => actor.normalized)),
      minEntropyBits: bitsList.length ? Math.min(...bitsList) : 0,
      maxEntropyBits: bitsList.length ? Math.max(...bitsList) : 0,
      globalEntropyBits: round4(entropyBits(global.values())),
      globalKinds: global.size,
      actors,
    },
    windows: [...windows].sort(([left], [right]) => left - right).map(([index, window]) => ({
      fromTick: index * windowTicks + (index === 0 ? 0 : 1),
      toTick: (index + 1) * windowTicks,
      ...window.counts,
      portsChangedHands: window.ports.size,
    })),
  };
}

export interface MetricDelta { run: number; baseline: number; delta: number }

export interface Comparison {
  totals: Record<keyof Counts, MetricDelta>;
  meanEntropyBits: MetricDelta;
  globalEntropyBits: MetricDelta;
  /** First tick whose ordered (type, actor, target, settlement) list differs; null if the logs match. */
  firstDivergentTick: number | null;
}

/** Key of one event for divergence: what happened, to whom, where. Data is left out. */
function eventKey(event: SimEvent): string {
  return `${event.type}|${event.actorId ?? ""}|${event.targetId ?? ""}|${event.settlementId ?? ""}`;
}

export function firstDivergentTick(run: readonly SimEvent[], baseline: readonly SimEvent[]): number | null {
  const group = (events: readonly SimEvent[]) => {
    const ticks = new Map<number, string[]>();
    for (const event of [...events].sort((left, right) => left.sequence - right.sequence)) {
      const list = ticks.get(event.tick) ?? [];
      list.push(eventKey(event));
      ticks.set(event.tick, list);
    }
    return ticks;
  };
  const left = group(run);
  const right = group(baseline);
  const ticks = [...new Set([...left.keys(), ...right.keys()])].sort((a, b) => a - b);
  for (const tick of ticks) {
    const a = left.get(tick) ?? [];
    const b = right.get(tick) ?? [];
    if (a.length !== b.length || a.some((key, index) => key !== b[index])) return tick;
  }
  return null;
}

export function compareReadouts(run: DynamismReadout, baseline: DynamismReadout, divergence: number | null = null): Comparison {
  const delta = (a: number, b: number): MetricDelta => ({ run: a, baseline: b, delta: round4(a - b) });
  const totals = {} as Record<keyof Counts, MetricDelta>;
  for (const key of Object.keys(run.totals) as (keyof Counts)[]) totals[key] = delta(run.totals[key], baseline.totals[key]);
  return {
    totals,
    meanEntropyBits: delta(run.actionVariety.meanEntropyBits, baseline.actionVariety.meanEntropyBits),
    globalEntropyBits: delta(run.actionVariety.globalEntropyBits, baseline.actionVariety.globalEntropyBits),
    firstDivergentTick: divergence,
  };
}

const COLUMNS: [keyof Counts, string][] = [
  ["portOwnershipChanges", "port changes"], ["portsChangedHands", "ports"], ["secessions", "secessions"],
  ["desertions", "desertions"], ["captures", "captures"], ["releases", "releases"], ["deaths", "deaths"],
  ["rateChanges", "rate changes"], ["rateRaises", "raises"], ["rateCuts", "cuts"], ["decisions", "decisions"],
];

/** A short markdown table: one row per window plus the total. */
export function readoutTable(readout: DynamismReadout): string {
  const header = `| Ticks | ${COLUMNS.map(([, label]) => label).join(" | ")} |`;
  const rule = `| --- | ${COLUMNS.map(() => "---:").join(" | ")} |`;
  const rows = readout.windows.map((window) => `| ${window.fromTick}–${window.toTick} | ${COLUMNS.map(([key]) => window[key]).join(" | ")} |`);
  const total = `| **all** | ${COLUMNS.map(([key]) => readout.totals[key]).join(" | ")} |`;
  const variety = `Action variety: ${readout.actionVariety.actorsMeasured} actors with ≥ ${readout.minDecisions} decisions, mean ${readout.actionVariety.meanEntropyBits} bits (normalized ${readout.actionVariety.meanNormalized}), range ${readout.actionVariety.minEntropyBits}–${readout.actionVariety.maxEntropyBits}; global ${readout.actionVariety.globalEntropyBits} bits over ${readout.actionVariety.globalKinds} kinds.`;
  return [header, rule, ...rows, total, "", variety].join("\n");
}
