// Reads results/*.jsonl produced by measure.ts and prints markdown tables (no sim runs).
import { readFileSync } from "node:fs";
const dir = new URL("./results/", import.meta.url);
const load = (n: string): any[] => readFileSync(new URL(n, dir), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] : 0; };
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const files = process.argv.slice(2);
for (const f of files) {
  const rs = load(f);
  const op = rs.map((r) => r.commander.openers);
  const bins = rs.flatMap((r) => r.commander.per100 as number[]);
  const after0 = rs.flatMap((r) => (r.commander.per100 as number[]).slice(1));
  const tabsEnd = rs.map((r) => r.commander.tabs[r.commander.tabs.length - 1]);
  console.log(`## ${f}  (${rs.length} seeds, role ${rs[0].role}, scenario ${rs[0].scenario}, caps ${JSON.stringify(rs[0].caps)})`);
  console.log(`openers total ${sum(op)}; per seed min ${Math.min(...op)} max ${Math.max(...op)}; threadsCreated ${sum(rs.map((r) => r.commander.threadsCreated))}; storedMessages ${sum(rs.map((r) => r.commander.storedMessages))}`);
  console.log(`per100 bins: all p50 ${q(bins, .5)} p95 ${q(bins, .95)} max ${Math.max(...bins)}; bin0 min ${Math.min(...rs.map((r) => r.commander.per100[0]))} max ${Math.max(...rs.map((r) => r.commander.per100[0]))}; bins>=1 mean ${(sum(after0) / after0.length).toFixed(2)} p95 ${q(after0, .95)} max ${Math.max(...after0)}`);
  console.log(`per-seed mean openers/100 ticks (12 bins): ${(sum(op) / rs.length / 12).toFixed(2)}`);
  console.log(`tabs at end: request ${tabsEnd.map((t) => t.request).join(",")}; all ${tabsEnd.map((t) => t.all).join(",")}`);
  const t72 = rs.map((r) => r.commander.tabs[0]);
  console.log(`tabs at t72: request ${t72.map((t) => t.request).join(",")}`);
  const topics: Record<string, number> = {}; const trig: Record<string, number> = {}; const drops: Record<string, number> = {};
  for (const r of rs) { for (const [k, v] of Object.entries(r.commander.byTopic)) topics[k] = (topics[k] ?? 0) + (v as number); for (const [k, v] of Object.entries(r.commander.byTrigger)) trig[k] = (trig[k] ?? 0) + (v as number); for (const [k, v] of Object.entries(r.commander.drops)) drops[k] = (drops[k] ?? 0) + (v as number); }
  console.log(`byTopic ${JSON.stringify(topics)}\nbyTrigger ${JSON.stringify(trig)}\ndrops ${JSON.stringify(drops)}`);
  const ck = rs[0].checks ?? {};
  const viol = sum(rs.map((r) => sum(Object.values(r.violations ?? {}).map((v: any) => (Array.isArray(v) ? v.length : Number(v))))));
  console.log(`violations ${viol}; simStreamEqual ${rs.filter((r) => r.simStreamEqual).length}/${rs.length}; blankedEqual ${rs.filter((r) => r.blankedEqual).length}/${rs.length}; replayExact ${rs.filter((r) => r.replayExact).length}/${rs.length}; replayExactHookOff ${rs.filter((r) => r.replayExactHookOff).length}/${rs.length}; conversationReplayExact ${rs.filter((r) => r.conversationReplayExact).length}/${rs.length}; maxEvents180 ${Math.max(...rs.map((r) => r.maxEventsIn180Ticks ?? 0))}`);
  void ck;
}
