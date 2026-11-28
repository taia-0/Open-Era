// Summarises results/<cfg>-<order>-<skip>.jsonl into markdown tables. Usage: node --experimental-strip-types summarize.ts results
import { readFileSync, existsSync } from "node:fs";
const dir = process.argv[2] ?? "results";
const PINS: Record<string, Record<number, [string, string]>> = {
  default: { 1847: ["7f76e474", "94de9c02"], 2718: ["976c40bd", "7a3741c9"], 4096: ["08943ea5", "af6eeaea"] },
  atls: { 1847: ["85658e53", "5367691c"], 2718: ["aa54ada1", "faf5798a"], 4096: ["e4361ee1", "7e93eab2"] },
};
const load = (n: string): any[] => (existsSync(`${dir}/${n}.jsonl`) ? readFileSync(`${dir}/${n}.jsonl`, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const q = (xs: number[], p: number) => { if (!xs.length) return "-"; const s = [...xs].sort((a, b) => a - b); return String(s[Math.min(s.length - 1, Math.floor(p * s.length))]); };
const out: string[] = [];
const variants = ["last-strict", "last-relaxed", "first-strict", "first-relaxed"];
for (const cfg of ["default", "atls"]) {
  out.push(`\n### ${cfg}\n`);
  out.push("| variant | scenario | human offers (13 seeds) | per 100 ticks (per seed, mean) | seeds with ≥1 | accepted | declined | expired | fulfilled | breached | cancelled after accept | open at end | answered/offered |");
  out.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const v of variants) {
    const rows = load(`${cfg}-${v}`);
    for (const sc of ["idle", "attentive", "lazy"]) {
      const r = rows.filter((x) => x.scenario === sc); if (!r.length) continue;
      const o = (k: string) => sum(r.map((x) => x.human.byOutcome[k] ?? 0));
      const offers = sum(r.map((x) => x.human.offers));
      const open = o("accepted-open") + o("offered-open");
      const accepted = o("accepted") + o("fulfilled") + o("breached") + o("cancelled") + o("accepted-open"); const ans = accepted + o("declined");
      out.push(`| ${v} | ${sc} | ${offers} | ${(offers / (r.length * 12)).toFixed(3)} | ${r.filter((x) => x.human.offers > 0).length} | ${accepted} | ${o("declined")} | ${o("expired")} | ${o("fulfilled")} | ${o("breached")} | ${o("cancelled")} | ${open} | ${ans}/${offers} |`);
    }
  }
}
out.push("\n### Economy against flag-off (sum over 13 seeds; flag-on minus flag-off, same seed)\n");
out.push("| config | variant | scenario | NPC offers | contracts fulfilled | contracts breached | treasury total | claims | port changes | captures | shortage ticks |");
out.push("|---|---|---|---|---|---|---|---|---|---|---|");
for (const cfg of ["default", "atls"]) for (const v of variants) {
  const rows = load(`${cfg}-${v}`);
  for (const sc of ["idle", "attentive", "lazy"]) {
    const r = rows.filter((x) => x.scenario === sc); if (!r.length) continue;
    const d = (f: (e: any) => number) => { const a = sum(r.map((x) => f(x.econ.on))), b = sum(r.map((x) => f(x.econ.base))); return `${Math.round(b * 100) / 100} → ${Math.round(a * 100) / 100} (${a - b >= 0 ? "+" : ""}${Math.round((a - b) * 100) / 100})`; };
    out.push(`| ${cfg} | ${v} | ${sc} | ${d((e) => e.counts["contract-offered"])} | ${d((e) => e.counts["contract-fulfilled"])} | ${d((e) => e.counts["contract-breached"])} | ${d((e) => e.treasuryTotal)} | ${d((e) => e.counts["settlement-claimed"])} | ${d((e) => e.portChanges)} | ${d((e) => e.counts["character-captured"])} | ${d((e) => e.shortageTicks)} |`);
  }
}
out.push("\n### Pins, replay, privacy (all variants, scenarios, seeds)\n");
let pinBad = 0, pinOk = 0, offBad = 0, offOk = 0, replayRuns = 0, replayBad = 0; const replayFirst: string[] = []; const viol: Record<string, number> = {}; const chk: Record<string, number> = {}; let hookDiff = 0, hookRuns = 0, sameAsOff = 0, diffFromOff = 0;
for (const cfg of ["default", "atls"]) for (const v of variants) for (const x of load(`${cfg}-${v}`)) {
  const p = PINS[cfg][x.seed];
  if (p) { (x.pins.flagOff.h72 === p[0] && x.pins.flagOff.h1200 === p[1]) ? pinOk++ : pinBad++; }
  if (x.scenario === "idle") (x.pins.flagOn.h1200 === x.pins.flagOff.h1200 ? sameAsOff++ : diffFromOff++);
  for (const k of ["base", "on", "hook"]) { replayRuns++; if (x.replay[k].mismatches) { replayBad++; replayFirst.push(`${cfg}-${v} ${x.seed} ${x.scenario} ${k} t${x.replay[k].first} ${x.replay[k].diffs[0] ?? ""}`); } }
  hookRuns++; if (!x.onEqualsHook) hookDiff++;
  for (const [k, n] of Object.entries<number>(x.violations)) viol[k] = (viol[k] ?? 0) + n;
  for (const [k, n] of Object.entries<number>(x.checks)) chk[k] = (chk[k] ?? 0) + n;
}
void offBad; void offOk;
out.push(`- flag-off pins on the 3 pinned seeds per config, every run: ${pinOk} match, ${pinBad} mismatch`);
out.push(`- idle runs where flag-on h1200 equals flag-off h1200: ${sameAsOff}; differs: ${diffFromOff}`);
out.push(`- replay (every 100 ticks): ${replayRuns} runs, ${replayBad} with a mismatch${replayFirst.length ? "; first few: " + [...new Set(replayFirst)].slice(0, 6).join(" | ") : ""}`);
out.push(`- hook run economy equals no-hook run economy: ${hookRuns - hookDiff}/${hookRuns}`);
out.push(`- checks passed: ${JSON.stringify(chk)}`);
out.push(`- violations: ${JSON.stringify(viol)}`);
// Latencies and spans (from the flag-off run, same in every file; and the human runs).
{
  const rows = load("default-last-strict").concat(load("atls-last-strict")).filter((x) => x.scenario === "idle");
  const lat = rows.flatMap((x) => x.npc.acceptLatency as number[]); const dl = rows.flatMap((x) => x.npc.deadlineOffsets as number[]); const tf = rows.flatMap((x) => x.npc.toFulfil as number[]);
  out.push("\n### NPC baselines (flag-off, 13 seeds, default + ATLS)\n");
  out.push(`- offer → accepted latency: n=${lat.length}, min ${q(lat, 0)}, p50 ${q(lat, 0.5)}, p90 ${q(lat, 0.9)}, max ${q(lat, 1)} (ticks)`);
  out.push(`- delivery deadline − issue tick: n=${dl.length}, min ${q(dl, 0)}, p50 ${q(dl, 0.5)}, p90 ${q(dl, 0.9)}, max ${q(dl, 1)}`);
  out.push(`- accepted → fulfilled: n=${tf.length}, min ${q(tf, 0)}, p50 ${q(tf, 0.5)}, p90 ${q(tf, 0.9)}, max ${q(tf, 1)}`);
  for (const v of variants) for (const cfg of ["default", "atls"]) {
    const r = load(`${cfg}-${v}`).filter((x) => x.scenario === "attentive");
    const tfh = r.flatMap((x) => x.human.toFulfil as number[]); const al = r.flatMap((x) => x.human.answerLatency as number[]);
    const dw: Record<string, number> = {}; for (const x of r) for (const [k, n] of Object.entries<number>(x.human.declineWhy ?? {})) dw[k] = (dw[k] ?? 0) + n;
    out.push(`- attentive ${cfg}-${v}: accepted → fulfilled n=${tfh.length} (p50 ${q(tfh, 0.5)}, max ${q(tfh, 1)}); offer → accepted n=${al.length} (p50 ${q(al, 0.5)}, max ${q(al, 1)}); declines by reason ${JSON.stringify(dw)}`);
  }
  out.push("\n### Human breach causes (lazy, all variants)\n");
  for (const cfg of ["default", "atls"]) for (const v of variants) { const c: Record<string, number> = {}; for (const x of load(`${cfg}-${v}`).filter((y) => y.scenario === "lazy")) for (const [k, n] of Object.entries<number>(x.human.breachCauses)) c[k] = (c[k] ?? 0) + n; out.push(`- ${cfg}-${v}: ${JSON.stringify(c)}`); }
  out.push("\n### UI state of the human's contracts at the last tick (hook run, summed)\n");
  for (const cfg of ["default", "atls"]) for (const v of variants) for (const sc of ["attentive", "lazy"]) { const c: Record<string, number> = {}; for (const x of load(`${cfg}-${v}`).filter((y) => y.scenario === sc)) for (const [k, n] of Object.entries<number>(x.human.uiStatesAtEnd)) c[k] = (c[k] ?? 0) + n; out.push(`- ${cfg}-${v} ${sc}: ${JSON.stringify(c)}`); }
  out.push("\n### Request tab after human offers (hook run; request count at each offer, then at t=1200)\n");
  for (const cfg of ["default", "atls"]) { const r = load(`${cfg}-last-strict`).filter((x) => x.scenario === "idle"); out.push(`- ${cfg}-last-strict idle: request tab at t=1200 per seed ${JSON.stringify(r.map((x) => x.threads.tabs.at(-1)?.request))}; openers ${sum(r.map((x) => x.threads.openers))}, contract drops ${sum(r.map((x) => x.threads.drops))}`); }
}
console.log(out.join("\n"));
