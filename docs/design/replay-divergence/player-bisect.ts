// Lockstep A/B with the npc-threads "attentive" player script (hook off):
// between ticks the player confirms awaiting orders and, every 60 ticks,
// offers a supply contract. Those command events go into the log ahead of the
// next tick's events, as the dashboard store does (/api/commands appends at once).
// Usage: SEED=8000 TICKS=1200 node --experimental-strip-types docs/design/replay-divergence/player-bisect.ts '<TickOptions JSON>'
import { runTick } from "../../../src/sim/engine.ts";
import { createPrototypeWorld } from "../../../src/sim/scenario.ts";
import { stateHash, commandHolderId } from "../../../src/sim/state.ts";
import { replayWithSilentStarts } from "../../../src/sim/tick-start.ts";
import { submitCommand } from "../../../src/sim/commands.ts";
import { freeMateCount, memberAllowanceCap, shortPayMember, spendRole } from "../../../src/sim/allowance.ts";
import type { SimEvent, WorldState } from "../../../src/sim/types.ts";

const opts = JSON.parse(process.argv[2] ?? "{}");
const ticks = Number(process.env.TICKS ?? 1200);
const role = process.env.ROLE ?? "character-01";
const seeds = (process.env.SEEDS ?? process.env.SEED ?? "8000").split(",").map(Number);

function flatDiff(a: any, b: any, path: string, out: string[]): void {
  if (out.length >= 20 || Object.is(a, b)) return;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) { out.push(`${path}: A=${JSON.stringify(a)} B=${JSON.stringify(b)}`); return; }
  for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) flatDiff(a[k], b[k], `${path}.${k}`, out);
}
function inputs(w: WorldState, id: string) {
  const c = w.characters[id]; const f = c.factionId;
  return { factionId: f, role: spendRole(w, c), holder: f && commandHolderId(w, f), mates: f && freeMateCount(w, f), treasury: f && w.factions[f].treasury, cap: f && memberAllowanceCap(w, f, 3), short: shortPayMember(w, c, 3), streak: c.shortMorningStreak };
}

for (const seed of seeds) {
  const a = createPrototypeWorld(seed, { playerCharacterId: role });
  const b = createPrototypeWorld(seed, { playerCharacterId: role });
  const playerId = Object.keys(a.players)[0];
  const cmd = a.players[playerId].characterId;
  let miss: number | null = null;
  for (let i = 0; i < ticks && miss === null; i++) {
    const chunk: SimEvent[] = [];
    const between: SimEvent[] = [];
    for (const r of Object.values(a.characters)) for (const o of r.standingOrders) {
      if (o.issuerId === cmd && o.status === "awaiting-confirmation") {
        const res = submitCommand(a, { playerId, type: "confirm-order", characterId: r.id, orderId: o.id } as any);
        if (res.ok) between.push(structuredClone(res.event));
      }
    }
    if (a.tick > 0 && a.tick % 60 === 0) {
      const carriers = ["character-02", "character-07", "character-12", "character-17"].filter((id) => id !== cmd);
      const res = submitCommand(a, { playerId, type: "offer-contract", characterId: carriers[(a.tick / 60) % carriers.length], quantity: 10, destinationId: "crown-harbor", price: 18, expiresInTicks: 12 } as any);
      if (res.ok) between.push(structuredClone(res.event));
    }
    const pre = between.length ? structuredClone(a) : null;
    const tickEvents = runTick(a, { ...opts }).events.map((e) => structuredClone(e));
    chunk.push(...between, ...tickEvents);
    const bBefore = structuredClone(b);
    replayWithSilentStarts(b, chunk);
    if (stateHash(a) !== stateHash(b)) {
      miss = a.tick;
      const diff: string[] = [];
      flatDiff(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), "world", diff);
      console.log(JSON.stringify({ seed, firstMissTick: a.tick, diff }));
      console.log("between-tick events:", JSON.stringify(between.map((e) => ({ seq: e.sequence, type: e.type, cmd: (e.data as any).command?.type, id: (e.data as any).command?.id }))));
      console.log("leading tick events:", tickEvents.slice(0, 6).map((e) => `${e.sequence} ${e.type} ${e.actorId ?? ""}`).join(" | "));
      const id = diff[0]?.match(/characters\.([^.]+)\./)?.[1];
      if (id && pre) {
        console.log("A world before submit (prev tick end) inputs:", JSON.stringify(inputs(bBefore, id)));
        console.log("A world after submit, before runTick:", JSON.stringify(inputs(pre, id)));
      }
    }
  }
  console.log(JSON.stringify({ seed, ticks, firstMiss: miss, exact: miss === null }));
}
