import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { DatabaseSync } from "node:sqlite";
import type { SimEvent } from "../sim/types.ts";
import { aiSummary } from "../tools/social-gate.ts";
import { compareReadouts, DEFAULT_MIN_DECISIONS, DEFAULT_WINDOW_TICKS, dynamismReadout, firstDivergentTick, readoutTable } from "../tools/dynamism.ts";

/**
 * Offline dynamism readout (docs/design/dynamism-readout.md). Reads an event
 * log and prints JSON and a table. It never runs the simulation.
 *
 *   npm run dynamism -- --events run.jsonl [--baseline off.jsonl] [--window 240] [--min-decisions 20] [--json out.json]
 *   npm run dynamism -- --database .open-era/world.sqlite
 *   add --ai for the picker summary from `data.ai` (picks, reads, loyalty-driven picks; jev-social-picker.md §11 item 7)
 */
const { values } = parseArgs({
  options: {
    events: { type: "string" },
    database: { type: "string" },
    baseline: { type: "string" },
    "baseline-database": { type: "string" },
    window: { type: "string", default: String(DEFAULT_WINDOW_TICKS) },
    "min-decisions": { type: "string", default: String(DEFAULT_MIN_DECISIONS) },
    json: { type: "string" },
    ai: { type: "boolean" },
  },
});

/** One `SimEvent` per line. Blank lines are skipped. */
export function readJsonl(path: string): SimEvent[] {
  return readFileSync(path, "utf8").split("\n").filter((line) => line.trim().length > 0).map((line) => JSON.parse(line) as SimEvent);
}

/** Reads the `events` table of a `WorldStore` database, read-only. */
export function readDatabase(path: string): SimEvent[] {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    const rows = database.prepare("SELECT * FROM events ORDER BY sequence").all() as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      sequence: Number(row.sequence),
      tick: Number(row.tick),
      type: String(row.type),
      actorId: (row.actor_id as string | null) ?? undefined,
      targetId: (row.target_id as string | null) ?? undefined,
      settlementId: (row.settlement_id as string | null) ?? undefined,
      data: JSON.parse(String(row.data_json)) as Record<string, unknown>,
    }));
  } finally {
    database.close();
  }
}

function load(file?: string, db?: string): SimEvent[] | null {
  if (file) return readJsonl(file);
  if (db) return readDatabase(db);
  return null;
}

const events = load(values.events, values.database);
if (!events) throw new Error("give --events <file.jsonl> or --database <file.sqlite>");
const options = { windowTicks: Number.parseInt(values.window!, 10), minDecisions: Number.parseInt(values["min-decisions"]!, 10) };
const readout = dynamismReadout(events, options);
const baselineEvents = load(values.baseline, values["baseline-database"]);
const output = baselineEvents
  ? { readout, baseline: dynamismReadout(baselineEvents, options), comparison: compareReadouts(readout, dynamismReadout(baselineEvents, options), firstDivergentTick(events, baselineEvents)) }
  : { readout };
if (values.ai) (output as Record<string, unknown>).ai = aiSummary(events);
if (values.json) writeFileSync(values.json, `${JSON.stringify(output, null, 2)}\n`);
console.log(readoutTable(readout));
if (output.comparison) console.log(`\nAgainst baseline: first divergent tick ${output.comparison.firstDivergentTick ?? "none"}; ` +
  Object.entries(output.comparison.totals).map(([key, value]) => `${key} ${value.delta >= 0 ? "+" : ""}${value.delta}`).join(", "));
if (!values.json) console.log(`\n${JSON.stringify(output.comparison ?? readout.totals)}`);
if (values.ai) { const { byActor: _, ...ai } = aiSummary(events); console.log(`\nAI: ${JSON.stringify(ai)}`); }
