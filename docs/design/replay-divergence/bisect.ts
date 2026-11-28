// replay-divergence harness: run A (runTick) and replay B (fresh world + the
// same events through the replayWithSilentStarts logic) in lockstep, compare
// stateHash after every tick, and at the first miss print a field diff and the
// tick's events. Offline, no AI, $0.
// Usage: node --experimental-strip-types docs/design/replay-divergence/bisect.ts '<TickOptions JSON>'
// Env: SEEDS (comma), TICKS (default 5000); stops at the first miss per seed.
//      EVERY=1 (compare every N ticks; with N>1 a miss is the first differing checkpoint),
//      DETAIL=0 (skip printing the tick's events), WHOLE=1 (also replay the whole log in one call, as state-prune did).
import { runTick } from "../../../src/sim/engine.ts";
import { createPrototypeWorld } from "../../../src/sim/scenario.ts";
import { stateHash } from "../../../src/sim/state.ts";
import { replayWithSilentStarts } from "../../../src/sim/tick-start.ts";
import type { SimEvent, WorldState } from "../../../src/sim/types.ts";

const opts = JSON.parse(process.argv[2] ?? "{}");
const ticks = Number(process.env.TICKS ?? 5000);
const seeds = (process.env.SEEDS ?? "10000").split(",").map(Number);
const every = Number(process.env.EVERY ?? 1);
const detail = process.env.DETAIL !== "0";

// replayWithSilentStarts on one tick's events is the same as one step of the
// whole-log call: it runs the silent start, then the events through
// tick-advanced, and stops. So the src function (patched or not) is used as is.
function replayTick(state: WorldState, events: readonly SimEvent[], _first: boolean): void {
  replayWithSilentStarts(state, events);
}

function flatDiff(a: unknown, b: unknown, path: string, out: string[], limit = 40): void {
  if (out.length >= limit) return;
  if (Object.is(a, b)) return;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) {
    out.push(`${path}: A=${JSON.stringify(a)} B=${JSON.stringify(b)}`);
    return;
  }
  const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
  for (const k of [...keys].sort()) flatDiff((a as any)[k], (b as any)[k], `${path}.${k}`, out, limit);
}

for (const seed of seeds) {
  const started = Date.now();
  const a = createPrototypeWorld(seed);
  const b = createPrototypeWorld(seed);
  let firstMiss: number | null = null;
  let total = 0;
  const all: SimEvent[] | null = process.env.WHOLE === "1" ? [] : null;
  for (let i = 0; i < ticks; i++) {
    const before = detail ? structuredClone(b) : null;
    const evs = runTick(a, { ...opts }).events;
    total += evs.length;
    if (all) for (const e of evs) all.push(e);
    replayTick(b, evs, i === 0);
    if ((a.tick % every === 0 || i === ticks - 1)) {
      const ha = stateHash(a);
      const hb = stateHash(b);
      if (ha !== hb) {
        firstMiss = a.tick;
        const diff: string[] = [];
        flatDiff(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), "world", diff);
        console.log(JSON.stringify({ seed, firstMissTick: a.tick, hashA: ha.slice(0, 8), hashB: hb.slice(0, 8), diff }));
        if (detail) {
          console.log(`events of tick ${a.tick} (${evs.length}):`);
          for (const e of evs) console.log(JSON.stringify(e));
          // keep B before this tick for further inspection
          (globalThis as any).__before = before;
        }
        break;
      }
    }
  }
  let wholeExact: boolean | null = null;
  if (all && firstMiss === null) {
    // The state-prune method: fresh world, the whole log in one call.
    const r = createPrototypeWorld(seed);
    replayWithSilentStarts(r, all);
    wholeExact = stateHash(r) === stateHash(a);
  }
  console.log(JSON.stringify({ seed, ticks, firstMiss, exact: firstMiss === null, wholeExact, events: total, ms: Date.now() - started, finalHash: stateHash(a).slice(0, 8) }));
}
