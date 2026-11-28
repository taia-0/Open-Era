// Rev 2 summary of results/<cfg>-<arm>.jsonl and results/noise-<cfg>.jsonl into markdown. Usage: node --experimental-strip-types summarize.ts results
import { readFileSync, existsSync } from "node:fs";
const dir = process.argv[2] ?? "results";
const PINS: Record<string, Record<number, [string, string]>> = {
  default: { 1847: ["7f76e474", "94de9c02"], 2718: ["976c40bd", "7a3741c9"], 4096: ["08943ea5", "af6eeaea"] },
  atls: { 1847: ["85658e53", "5367691c"], 2718: ["aa54ada1", "faf5798a"], 4096: ["e4361ee1", "7e93eab2"] },
};
const rd = (f: string): any[] => (existsSync(`${dir}/${f}`) ? readFileSync(`${dir}/${f}`, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const load = (n: string) => rd(`${n}.jsonl`);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const r2 = (n: number) => Math.round(n * 100) / 100;
const q = (xs: number[], p: number) => { if (!xs.length) return "-"; const s = [...xs].sort((a, b) => a - b); return String(s[Math.min(s.length - 1, Math.floor(p * s.length))]); };
const arms = ["last", "peer-walk", "peer-argmax", "last-noescrow", "last-noallow"];
const scs = ["idle", "attentive", "afirst", "lazy"];
const CFG = ["default", "atls"];
const out: string[] = [];
const sgn = (n: number) => (n >= 0 ? "+" : "") + r2(n);

out.push("### Volume: human offers (13 seeds x 1,200 ticks; per 100 ticks is per seed)\n");
out.push("| config | arm | scenario | human offers | per 100 ticks per seed | seeds with >=1 | accepted | declined | expired | fulfilled | breached | cancelled after accept | open at end |");
out.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const cfg of CFG) for (const a of arms) for (const sc of scs) {
  const r = load(`${cfg}-${a}`).filter((x) => x.scenario === sc); if (!r.length) continue;
  const o = (k: string) => sum(r.map((x) => x.human.byOutcome[k] ?? 0));
  const offers = sum(r.map((x) => x.human.offers));
  const accepted = o("accepted") + o("fulfilled") + o("breached") + o("cancelled") + o("accepted-open");
  out.push(`| ${cfg} | ${a} | ${sc} | ${offers} | ${(offers / (r.length * 12)).toFixed(3)} | ${r.filter((x) => x.human.offers > 0).length} | ${accepted} | ${o("declined")} | ${o("expired")} | ${o("fulfilled")} | ${o("breached")} | ${o("cancelled")} | ${o("accepted-open") + o("offered-open")} |`);
}

// Noise floor: nine byte-different flag-off runs.
const noise: Record<string, any[]> = { default: rd("noise-default.jsonl"), atls: rd("noise-atls.jsonl") };
const range = (rows: any[], f: (r: any) => number) => { const v = rows.map(f); return [Math.min(...v), Math.max(...v)]; };

out.push("\n### Peer displacement (idle and attentive; NPC contracts the human took, and what happened to NPC fulfilment)\n");
out.push("| config | arm | scenario | human offers | of which displaced an NPC that would have been chosen | NPC offers re-ranked (argmax only) | NPC offers flag-off -> on | NPC fulfilled flag-off -> on | NPC breached flag-off -> on |");
out.push("|---|---|---|---|---|---|---|---|---|");
for (const cfg of CFG) for (const a of ["last", "peer-walk", "peer-argmax"]) for (const sc of ["idle", "attentive"]) {
  const r = load(`${cfg}-${a}`).filter((x) => x.scenario === sc); if (!r.length) continue;
  const d = (b: number, n: number) => `${b} -> ${n} (${sgn(n - b)})`;
  const nOff = (e: any) => e.counts["contract-offered"] - 0;
  const humanOffers = sum(r.map((x) => x.peer.humanOffers || x.human.offers));
  out.push(`| ${cfg} | ${a} | ${sc} | ${humanOffers} | ${sum(r.map((x) => x.peer.displaced))} | ${sum(r.map((x) => x.peer.reranked))} | ${d(sum(r.map((x) => nOff(x.econ.base))), sum(r.map((x) => nOff(x.econ.on) - x.human.offers)))} | ${d(sum(r.map((x) => x.econ.base.split.npcFulfilled ?? 0)), sum(r.map((x) => x.econ.on.split.npcFulfilled ?? 0)))} | ${d(sum(r.map((x) => x.econ.base.split.npcBreached ?? 0)), sum(r.map((x) => x.econ.on.split.npcBreached ?? 0)))} |`);
}

out.push("\n### Economy against flag-off (sum over 13 seeds) with the noise floor (nine flag-off runs with the commander purse +0..+8, min..max)\n");
out.push("| config | arm | scenario | all offers | all fulfilled | NPC fulfilled | treasury total | claims | port changes | captures | shortage ticks |");
out.push("|---|---|---|---|---|---|---|---|---|---|---|");
for (const cfg of CFG) {
  const n = noise[cfg];
  if (n.length) out.push(`| ${cfg} | NOISE FLOOR (min..max of ${n.length}) | - | ${range(n, (x) => x["contract-offered"]).join("..")} | ${range(n, (x) => x["contract-fulfilled"]).join("..")} | (same as all fulfilled) | ${range(n, (x) => x.treasury).join("..")} | ${range(n, (x) => x["settlement-claimed"]).join("..")} | ${range(n, (x) => x.portChanges).join("..")} | ${range(n, (x) => x["character-captured"]).join("..")} | ${range(n, (x) => x.shortageTicks).join("..")} |`);
  for (const a of arms) for (const sc of scs) {
    const r = load(`${cfg}-${a}`).filter((x) => x.scenario === sc); if (!r.length) continue;
    const d = (f: (e: any) => number) => { const x = sum(r.map((y) => f(y.econ.on))), b = sum(r.map((y) => f(y.econ.base))); return `${r2(b)} -> ${r2(x)} (${sgn(x - b)})`; };
    out.push(`| ${cfg} | ${a} | ${sc} | ${d((e) => e.counts["contract-offered"])} | ${d((e) => e.counts["contract-fulfilled"])} | ${d((e) => e.split.npcFulfilled ?? 0)} | ${d((e) => e.treasuryTotal)} | ${d((e) => e.counts["settlement-claimed"])} | ${d((e) => e.portChanges)} | ${d((e) => e.counts["character-captured"])} | ${d((e) => e.shortageTicks)} |`);
  }
}

out.push("\n### Matched seeds: per-seed change in the run against the same seed flag-off, and the per-seed noise range\n");
out.push("Noise range per seed = min..max over the nine purse nudges of that seed's own total. 'outside' = the arm's value falls outside that range. Fulfilled is all contracts; treasury is the sum of faction treasuries at t=1200.\n");
out.push("| config | arm | scenario | seeds outside noise: fulfilled | seeds outside noise: treasury | mean per-seed fulfilled change | mean per-seed treasury change | noise mean absolute per-seed fulfilled spread (max-min) |");
out.push("|---|---|---|---|---|---|---|---|");
for (const cfg of CFG) {
  const n = noise[cfg]; if (!n.length || !n[0].perSeed) continue;
  const seeds = Object.keys(n[0].perSeed);
  const nr = (s: string, k: "fulfilled" | "treasury") => { const v = n.map((x) => x.perSeed[s][k]); return [Math.min(...v), Math.max(...v)]; };
  const spread = r2(sum(seeds.map((s) => nr(s, "fulfilled")[1] - nr(s, "fulfilled")[0])) / seeds.length);
  for (const a of arms) for (const sc of scs) {
    const r = load(`${cfg}-${a}`).filter((x) => x.scenario === sc); if (!r.length) continue;
    let of = 0, ot = 0, df = 0, dt = 0;
    for (const x of r) {
      const s = String(x.seed); const f = x.econ.on.counts["contract-fulfilled"], t = x.econ.on.treasuryTotal;
      const [fl, fh] = nr(s, "fulfilled"), [tl, th] = nr(s, "treasury");
      if (f < fl || f > fh) of++; if (t < tl || t > th) ot++;
      df += f - x.econ.base.counts["contract-fulfilled"]; dt += t - x.econ.base.treasuryTotal;
    }
    out.push(`| ${cfg} | ${a} | ${sc} | ${of}/${r.length} | ${ot}/${r.length} | ${sgn(df / r.length)} | ${sgn(dt / r.length)} | ${spread} |`);
  }
}

out.push("\n### Accept-then-buy (afirst) against buy-then-accept (attentive), and the derived allowance\n");
out.push("| config | arm | scenario | accepted | fulfilled | breached | cancelled | buys per accepted contract (histogram) | allowance at accept (histogram) | outcome by buys |");
out.push("|---|---|---|---|---|---|---|---|---|---|");
for (const cfg of CFG) for (const [a, sc] of [["last", "attentive"], ["last", "afirst"], ["last-noallow", "afirst"]] as const) {
  const r = load(`${cfg}-${a}`).filter((x) => x.scenario === sc); if (!r.length) continue;
  const o = (k: string) => sum(r.map((x) => x.human.byOutcome[k] ?? 0));
  const accepted = o("accepted") + o("fulfilled") + o("breached") + o("cancelled") + o("accepted-open");
  const merge = (f: (x: any) => Record<string, number>) => { const m: Record<string, number> = {}; for (const x of r) for (const [k, v] of Object.entries<number>(f(x))) m[k] = (m[k] ?? 0) + v; return JSON.stringify(m); };
  const nested: Record<string, Record<string, number>> = {};
  for (const x of r) for (const [b, oc] of Object.entries<Record<string, number>>(x.afirst.byBuys)) for (const [k, v] of Object.entries(oc)) { (nested[b] ??= {})[k] = (nested[b][k] ?? 0) + v; }
  out.push(`| ${cfg} | ${a} | ${sc} | ${accepted} | ${o("fulfilled")} | ${o("breached")} | ${o("cancelled")} | ${merge((x) => x.afirst.buysHist)} | ${merge((x) => x.afirst.allowHist)} | ${JSON.stringify(nested)} |`);
}

out.push("\n### Pins, replay, privacy, rev-2 checks (all arms, scenarios, seeds)\n");
let pinBad = 0, pinOk = 0, replayRuns = 0, replayBad = 0; const replayFirst: string[] = []; const viol: Record<string, number> = {}; const chk: Record<string, number> = {}; const rv: Record<string, number> = {}; let hookDiff = 0, hookRuns = 0, sameAsOff = 0, diffFromOff = 0;
for (const cfg of CFG) for (const a of arms) for (const x of load(`${cfg}-${a}`)) {
  const p = PINS[cfg][x.seed];
  if (p) { (x.pins.flagOff.h72 === p[0] && x.pins.flagOff.h1200 === p[1]) ? pinOk++ : pinBad++; }
  if (x.scenario === "idle" && a === "last") (x.pins.flagOn.h1200 === x.pins.flagOff.h1200 ? sameAsOff++ : diffFromOff++);
  for (const k of ["base", "on", "hook"]) { replayRuns++; if (x.replay[k].mismatches) { replayBad++; replayFirst.push(`${cfg}-${a} ${x.seed} ${x.scenario} ${k} t${x.replay[k].first} ${x.replay[k].diffs[0] ?? ""}`); } }
  hookRuns++; if (!x.onEqualsHook) hookDiff++;
  for (const [k, n] of Object.entries<number>(x.violations)) viol[k] = (viol[k] ?? 0) + n;
  for (const [k, n] of Object.entries<number>(x.checks)) chk[k] = (chk[k] ?? 0) + n;
  for (const [k, n] of Object.entries<number>(x.rev2 ?? {})) rv[k] = (rv[k] ?? 0) + n;
}
out.push(`- flag-off pins on the 3 pinned seeds per config, every run: ${pinOk} match, ${pinBad} mismatch`);
out.push(`- arm last, idle runs where flag-on h1200 equals flag-off h1200: ${sameAsOff}; differs: ${diffFromOff}`);
out.push(`- replay (every 100 ticks, three runs per row): ${replayRuns} runs, ${replayBad} with a mismatch${replayFirst.length ? "; first few: " + [...new Set(replayFirst)].slice(0, 6).join(" | ") : ""}`);
out.push(`- hook run economy equals no-hook run economy: ${hookRuns - hookDiff}/${hookRuns}`);
out.push(`- checks passed: ${JSON.stringify(chk)}`);
out.push(`- rev-2 checks (ok/bad): ${JSON.stringify(rv)}`);
out.push(`- violations: ${JSON.stringify(viol)}`);

{
  const rows = load("default-last").concat(load("atls-last")).filter((x) => x.scenario === "idle");
  const lat = rows.flatMap((x) => x.npc.acceptLatency as number[]); const dl = rows.flatMap((x) => x.npc.deadlineOffsets as number[]); const tf = rows.flatMap((x) => x.npc.toFulfil as number[]);
  out.push("\n### NPC baselines (flag-off, 13 seeds, default + ATLS)\n");
  out.push(`- offer -> accepted latency: n=${lat.length}, min ${q(lat, 0)}, p50 ${q(lat, 0.5)}, p90 ${q(lat, 0.9)}, max ${q(lat, 1)} (ticks)`);
  out.push(`- delivery deadline - issue tick: n=${dl.length}, min ${q(dl, 0)}, p50 ${q(dl, 0.5)}, p90 ${q(dl, 0.9)}, max ${q(dl, 1)}`);
  out.push(`- accepted -> fulfilled: n=${tf.length}, min ${q(tf, 0)}, p50 ${q(tf, 0.5)}, p90 ${q(tf, 0.9)}, max ${q(tf, 1)}`);
  out.push("\n### Human breach causes (lazy, arm last)\n");
  for (const cfg of CFG) { const c: Record<string, number> = {}; for (const x of load(`${cfg}-last`).filter((y) => y.scenario === "lazy")) for (const [k, n] of Object.entries<number>(x.human.breachCauses)) c[k] = (c[k] ?? 0) + n; out.push(`- ${cfg}: ${JSON.stringify(c)}`); }
  out.push("\n### Attentive decline reasons and answer latency\n");
  for (const cfg of CFG) for (const a of ["last", "peer-walk", "peer-argmax"]) {
    const r = load(`${cfg}-${a}`).filter((x) => x.scenario === "attentive");
    const tfh = r.flatMap((x) => x.human.toFulfil as number[]); const al = r.flatMap((x) => x.human.answerLatency as number[]);
    const dw: Record<string, number> = {}; for (const x of r) for (const [k, n] of Object.entries<number>(x.human.declineWhy ?? {})) dw[k] = (dw[k] ?? 0) + n;
    out.push(`- ${cfg}-${a}: accepted -> fulfilled n=${tfh.length} (p50 ${q(tfh, 0.5)}, max ${q(tfh, 1)}); offer -> accepted n=${al.length} (p50 ${q(al, 0.5)}, max ${q(al, 1)}); declines by reason ${JSON.stringify(dw)}`);
  }
}
console.log(out.join("\n"));
