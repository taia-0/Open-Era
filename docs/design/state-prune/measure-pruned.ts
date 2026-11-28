// Apply docs/design/state-prune/prune.ts after every tick. Offline, no AI, $0.
// Usage: node --experimental-strip-types docs/design/state-prune/measure-pruned.ts <label> '<TickOptions JSON>'
// Env: SEEDS, TICKS=1200. Prints pins, replay, event-log identity vs an unpruned twin,
// world bytes before/after the end-of-run shape, and per-structure counts.
import { createHash } from "node:crypto";
import { runTick } from "../../../src/sim/engine.ts";
import { createPrototypeWorld } from "../../../src/sim/scenario.ts";
import { applyEvent, canonicalJson, stateHash } from "../../../src/sim/state.ts";
import { applySilentTickStart } from "../../../src/sim/tick-start.ts";
import type { SimEvent, WorldState } from "../../../src/sim/types.ts";
import { ledgerSizes, pruneWorld } from "./prune.ts";

const [label, optsJson] = process.argv.slice(2);
const opts = JSON.parse(optsJson ?? "{}");
const ticks = Number(process.env.TICKS ?? 1200);
const seeds = (process.env.SEEDS ?? "1847,2718,4096").split(",").map(Number);

const bytes = (value: unknown): number => Buffer.byteLength(canonicalJson(value), "utf8");
const eventSig = (events: readonly SimEvent[]): string =>
  createHash("sha256").update(events.map((e) => `${e.sequence}:${e.tick}:${e.type}`).join("\n")).digest("hex").slice(0, 16);
const eventDataSig = (events: readonly SimEvent[]): string => {
  const h = createHash("sha256");
  for (const e of events) h.update(canonicalJson([e.sequence, e.tick, e.type, e.actorId ?? "", e.targetId ?? "", e.settlementId ?? "", e.data]));
  h.update(String(events.length));
  return h.digest("hex").slice(0, 16);
};

function replayPruned(state: WorldState, events: readonly SimEvent[]): void {
  let index = 0;
  let atStart = events.length > 0;
  while (index < events.length) {
    if (atStart) {
      while (index < events.length && events[index].type === "character-died") {
        applyEvent(state, events[index]);
        index += 1;
      }
      applySilentTickStart(state);
      atStart = false;
      continue;
    }
    const event = events[index];
    applyEvent(state, event);
    index += 1;
    if (event.type === "tick-advanced") {
      pruneWorld(state);
      atStart = true;
    }
  }
}

for (const seed of seeds) {
  const started = Date.now();
  const pruned = createPrototypeWorld(seed);
  const control = createPrototypeWorld(seed);
  const prunedEvents: SimEvent[] = [];
  const controlEvents: SimEvent[] = [];
  let hash72 = "";
  let controlHash72 = "";
  let bytes72 = 0;
  let controlBytes72 = 0;
  let sizes72 = ledgerSizes(pruned);
  for (let i = 0; i < ticks; i++) {
    prunedEvents.push(...runTick(pruned, { ...opts }).events);
    pruneWorld(pruned);
    controlEvents.push(...runTick(control, { ...opts }).events);
    if (pruned.tick === 72) {
      hash72 = stateHash(pruned).slice(0, 8);
      controlHash72 = stateHash(control).slice(0, 8);
      bytes72 = bytes(pruned);
      controlBytes72 = bytes(control);
      sizes72 = ledgerSizes(pruned);
    }
  }
  const replay = createPrototypeWorld(seed);
  replayPruned(replay, prunedEvents);
  const row = {
    label,
    seed,
    ticks,
    hash72,
    hash1200: stateHash(pruned).slice(0, 8),
    hashEnd: stateHash(pruned),
    controlHash72,
    controlHashEnd8: stateHash(control).slice(0, 8),
    t72PinMoved: hash72 !== controlHash72,
    tEndPinMoved: stateHash(pruned) !== stateHash(control),
    replayExact: stateHash(replay) === stateHash(pruned),
    eventCountMatch: prunedEvents.length === controlEvents.length,
    eventTypeSigPruned: eventSig(prunedEvents),
    eventTypeSigControl: eventSig(controlEvents),
    eventTypeSigMatch: eventSig(prunedEvents) === eventSig(controlEvents),
    eventDataSigPruned: eventDataSig(prunedEvents),
    eventDataSigControl: eventDataSig(controlEvents),
    eventDataSigMatch: eventDataSig(prunedEvents) === eventDataSig(controlEvents),
    worldBytes: bytes(pruned),
    controlWorldBytes: bytes(control),
    bytes72,
    controlBytes72,
    sizes: ledgerSizes(pruned),
    controlSizes: ledgerSizes(control),
    sizes72,
    elapsedMs: Date.now() - started,
  };
  console.log(JSON.stringify(row));
}
