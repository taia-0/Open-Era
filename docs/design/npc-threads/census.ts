// npc-threads.md census: which existing events involve the commander (or any character) as actor/target.
// Usage: SEEDS=1847 node --experimental-strip-types docs/design/npc-threads/census.ts '<TickOptions JSON>'
import { runTick } from "../../../src/sim/engine.ts";
import { createPrototypeWorld } from "../../../src/sim/scenario.ts";
const opts = JSON.parse(process.argv[2] ?? "{}");
const ticks = Number(process.env.TICKS ?? 1200);
const seeds = (process.env.SEEDS ?? "1847,2718,4096,1000,2000,3000,4000,5000,6000,7000,8000,9000,10000").split(",").map(Number);
type Row = { total: number; cmdActor: number; cmdTarget: number; cmdData: number; sample?: unknown };
const tally: Record<string, Row> = {};
for (const seed of seeds) {
  const w = createPrototypeWorld(seed);
  const cmd = Object.values(w.players)[0].characterId;
  for (let i = 0; i < ticks; i++) {
    const { events } = runTick(w, { ...opts });
    for (const e of events) {
      const r = (tally[e.type] ??= { total: 0, cmdActor: 0, cmdTarget: 0, cmdData: 0 });
      r.total++;
      if (e.actorId === cmd) r.cmdActor++;
      if (e.targetId === cmd) r.cmdTarget++;
      if (JSON.stringify(e.data).includes(`"${cmd}"`)) r.cmdData++;
      if (!r.sample) r.sample = { actorId: e.actorId, targetId: e.targetId, settlementId: e.settlementId, data: e.data };
    }
  }
}
for (const [k, v] of Object.entries(tally).sort((a, b) => b[1].total - a[1].total)) console.log(JSON.stringify({ type: k, ...v, sample: undefined }));
if (process.env.SAMPLES) for (const [k, v] of Object.entries(tally)) if (process.env.SAMPLES.split(",").includes(k)) console.log(k, JSON.stringify(v.sample).slice(0, 700));
