// Probe the morning that diverges: lockstep A/B to MISS-1, then compare the
// shortPayMember inputs for CHAR on both worlds after the leading deaths.
import { runTick } from "../../../src/sim/engine.ts";
import { createPrototypeWorld } from "../../../src/sim/scenario.ts";
import { applyEvent, commandHolderId, stateHash } from "../../../src/sim/state.ts";
import { replayWithSilentStarts } from "../../../src/sim/tick-start.ts";
import { freeMateCount, memberAllowanceCap, shortPayMember, spendRole } from "../../../src/sim/allowance.ts";
import type { SimEvent, WorldState } from "../../../src/sim/types.ts";
const opts = JSON.parse(process.argv[2] ?? "{}");
const seed = Number(process.env.SEED ?? 10000);
const miss = Number(process.env.MISS);
const who = process.env.CHAR ?? "character-10";
const a = createPrototypeWorld(seed);
const b = createPrototypeWorld(seed);
const replayTick = (state: WorldState, events: readonly SimEvent[]) => replayWithSilentStarts(state, events);
function read(w: WorldState, tag: string) {
  const c = w.characters[who];
  const f = c.factionId;
  console.log(tag, JSON.stringify({ tick: w.tick, factionId: f, dead: c.dead, captivity: !!c.captivity, role: spendRole(w, c), holder: f && commandHolderId(w, f), mates: f && freeMateCount(w, f), treasury: f && w.factions[f].treasury, cap: f && memberAllowanceCap(w, f, 3), short: shortPayMember(w, c, 3), streak: c.shortMorningStreak }));
}
for (let i = 0; i < miss - 1; i++) { const evs = runTick(a, { ...opts }).events; replayTick(b, evs); }
console.log("hash equal before:", stateHash(a) === stateHash(b), a.tick);
read(a, "A end-of-prev"); read(b, "B end-of-prev");
const a2 = structuredClone(a);
const evs = runTick(a, { ...opts }).events;
console.log("tick events head:", evs.slice(0, 6).map((e) => `${e.sequence} ${e.type} ${e.actorId ?? ""}`).join(" | "));
// A: rerun leading deaths on clone
for (const e of evs) { if (e.type !== "character-died") break; applyEvent(a2, e); }
read(a2, "A pre-silent (deaths applied)");
const b2 = structuredClone(b);
for (const e of evs) { if (e.type !== "character-died") break; applyEvent(b2, e); }
read(b2, "B pre-silent (deaths applied)");
replayTick(b, evs);
read(a, "A after"); read(b, "B after");
