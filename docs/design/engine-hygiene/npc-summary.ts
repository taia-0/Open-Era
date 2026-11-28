// Reads results/npc-*.jsonl (docs/design/npc-threads/measure.ts output, narrowed ruling 5) and prints the section 6.1 row values. No sim runs.
import { readFileSync } from "node:fs";
const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] : 0; };
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const rng = (a: number[]) => (Math.min(...a) === Math.max(...a) ? `${a[0]} in all ${a.length}` : `${Math.min(...a)}–${Math.max(...a)}`);
for (const f of process.argv.slice(2)) {
  const rs: any[] = readFileSync(new URL(`./results/${f}`, import.meta.url), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const op = rs.map((r) => r.commander.openers);
  const after0 = rs.flatMap((r) => (r.commander.per100 as number[]).slice(1));
  const bin0 = rs.map((r) => r.commander.per100[0]);
  const t72 = rs.map((r) => r.commander.tabs[0].request);
  const end = rs.map((r) => r.commander.tabs.at(-1));
  const allReq = rs.flatMap((r) => (r.commander.tabs as any[]).map((t) => t.request));
  console.log(`${f}: seeds ${rs.length}; openers ${sum(op)} (per seed ${Math.min(...op)}–${Math.max(...op)}, ${(sum(op) / rs.length / 12).toFixed(2)} per 100 ticks); threadsCreated ${sum(rs.map((r) => r.commander.threadsCreated))}; bin0 ${rng(bin0)}; bins1-11 mean ${(sum(after0) / after0.length).toFixed(2)} p95 ${q(after0, .95)} max ${Math.max(...after0)}`);
  console.log(`  request tab: t72 ${rng(t72)} | t1200 ${rng(end.map((t) => t.request))} | max over all samples ${Math.max(...allReq)} | all tab t1200 ${rng(end.map((t) => t.all))}`);
  console.log(`  request tab by sample (t72,t100..t1200) seed0: ${rs[0].commander.tabs.map((t: any) => `${t.t}:${t.request}`).join(" ")}`);
  console.log(`  storedMessages ${sum(rs.map((r) => r.commander.storedMessages))}; replayExact ${rs.filter((r) => r.replayExact).length}/${rs.length}; hookOff ${rs.filter((r) => r.replayExactHookOff).length}/${rs.length}; conversationReplayExact ${rs.filter((r) => r.conversationReplayExact).length}/${rs.length}; simStreamEqual ${rs.filter((r) => r.simStreamEqual).length}/${rs.length}`);
  console.log(`  pins hookOff h72/h1200 first3: ${rs.slice(0, 3).map((r) => `${r.seed} ${r.pins.hookOff.h72}/${r.pins.hookOff.h1200}`).join("; ")}`);
}
