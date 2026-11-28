// Capture diagnosis for negotiated-transfer.md rev 2. Reads measure-nt JSONL (flag off, flag on, leave-one-out).
// Usage: node --experimental-strip-types docs/design/negotiated-transfer/compare-captures.ts
import { readFileSync, writeFileSync } from "node:fs";

const load = (l: string) => readFileSync(`docs/design/negotiated-transfer/raw/${l}.jsonl`, "utf8").trim().split("\n").map((x) => JSON.parse(x));
const sum = (rs: any[], k: string) => rs.reduce((a, r) => a + (r[k] ?? 0), 0);
const r2 = (n: number) => Math.round(n * 1000) / 1000;
const r2b = (n: number) => Math.round(n * 100) / 100;

function rate(c: number, b: number) { return b ? r2(c / b) : 0; }

const labels = {
  off: "ATLS",
  on: "ATLS-NT",
  cess: "ATLS-NT-cession",
  sale: "ATLS-NT-sale",
  offX: "ATLS-exile-off",
  onX: "ATLS-NT-exile-off",
  cessX: "ATLS-NT-exile-off-cession",
  saleX: "ATLS-NT-exile-off-sale",
};

function block(title: string, offL: string, onL: string, cessL: string, saleL: string) {
  const off = load(offL), on = load(onL), cess = load(cessL), sale = load(saleL);
  const bySeed = (rs: any[]) => Object.fromEntries(rs.map((r) => [r.seed, r]));
  const O = bySeed(off), N = bySeed(on), C = bySeed(cess), S = bySeed(sale);
  const seeds = off.map((r) => r.seed);

  const lines: string[] = [];
  lines.push(`## ${title}`);
  lines.push("");
  lines.push("| Seed | Captures off → on (cession-only, sale-only) | Battles off → on (c, s) | Cap/battle off → on (c, s) | Offers/accepts on (cess / sale triggers) |");
  lines.push("|---|---|---|---|---|");
  for (const seed of seeds) {
    const o = O[seed], n = N[seed], c = C[seed], s = S[seed];
    lines.push(`| ${seed} | ${o.captures} → ${n.captures} (${c.captures}, ${s.captures}) | ${o.battles} → ${n.battles} (${c.battles}, ${s.battles}) | ${rate(o.captures, o.battles)} → ${rate(n.captures, n.battles)} (${rate(c.captures, c.battles)}, ${rate(s.captures, s.battles)}) | ${n.offers}/${n.accepts} (${n.offersByTrigger?.cession ?? 0}/${n.offersByTrigger?.sale ?? 0}) |`);
  }
  const tot = (rs: any[]) => ({ cap: sum(rs, "captures"), bat: sum(rs, "battles"), start: sum(rs, "battleStarts"), claims: sum(rs, "claims") });
  const ot = tot(off), nt = tot(on), ct = tot(cess), st = tot(sale);
  lines.push(`| **total** | **${ot.cap} → ${nt.cap} (${ct.cap}, ${st.cap})** | **${ot.bat} → ${nt.bat} (${ct.bat}, ${st.bat})** | **${rate(ot.cap, ot.bat)} → ${rate(nt.cap, nt.bat)} (${rate(ct.cap, ct.bat)}, ${rate(st.cap, st.bat)})** | ${sum(on, "offers")}/${sum(on, "accepts")} |`);
  lines.push("");

  // Ports that were transferred in the flag-on run vs the rest, compared to flag-off.
  lines.push("### Captures and battles at ports the flag-on run transfers, vs other ports");
  lines.push("");
  lines.push("| Seed | Transferred ports | Cap at those ports off → on | Battles at those ports off → on | Starts at those ports off → on | Cap at other ports off → on | Battles at other ports off → on |");
  lines.push("|---|---|---|---|---|---|---|");
  let tCapO = 0, tCapN = 0, tBatO = 0, tBatN = 0, tStO = 0, tStN = 0, oCapO = 0, oCapN = 0, oBatO = 0, oBatN = 0;
  for (const seed of seeds) {
    const o = O[seed], n = N[seed];
    const ports = new Set((n.transfers ?? []).map((t: any) => t.port));
    const all = new Set([...Object.keys(o.byPort ?? {}), ...Object.keys(n.byPort ?? {})]);
    const at = (row: any, id: string, k: "captures" | "resolved" | "started") => row.byPort?.[id]?.[k] ?? 0;
    let tcO = 0, tcN = 0, tbO = 0, tbN = 0, tsO = 0, tsN = 0, ocO = 0, ocN = 0, obO = 0, obN = 0;
    for (const id of all) {
      if (ports.has(id)) { tcO += at(o, id, "captures"); tcN += at(n, id, "captures"); tbO += at(o, id, "resolved"); tbN += at(n, id, "resolved"); tsO += at(o, id, "started"); tsN += at(n, id, "started"); }
      else { ocO += at(o, id, "captures"); ocN += at(n, id, "captures"); obO += at(o, id, "resolved"); obN += at(n, id, "resolved"); }
    }
    tCapO += tcO; tCapN += tcN; tBatO += tbO; tBatN += tbN; tStO += tsO; tStN += tsN; oCapO += ocO; oCapN += ocN; oBatO += obO; oBatN += obN;
    lines.push(`| ${seed} | ${[...ports].sort().join(", ") || "—"} | ${tcO} → ${tcN} | ${tbO} → ${tbN} | ${tsO} → ${tsN} | ${ocO} → ${ocN} | ${obO} → ${obN} |`);
  }
  lines.push(`| **total** | | **${tCapO} → ${tCapN} (${tCapN - tCapO})** | **${tBatO} → ${tBatN} (${tBatN - tBatO})** | **${tStO} → ${tStN} (${tStN - tStO})** | **${oCapO} → ${oCapN} (${oCapN - oCapO})** | **${oBatO} → ${oBatN} (${oBatN - oBatO})** |`);
  lines.push("");

  // Windows around transfers in the flag-on run; same windows in flag-off (loose counterfactual).
  lines.push("### 152-tick windows around each flag-on transfer, versus the same window in the flag-off run");
  lines.push("");
  const kindOf = (t: any) => `${t.trigger}/${t.kind}`;
  const agg: Record<string, { n: number; garrisons: number[]; startedOnBefore: number; startedOnAfter: number; capOnBefore: number; capOnAfter: number; batOnBefore: number; batOnAfter: number; startedOffBefore: number; startedOffAfter: number; capOffBefore: number; capOffAfter: number; batOffBefore: number; batOffAfter: number }> = {};
  const bump = (k: string) => (agg[k] ??= { n: 0, garrisons: [], startedOnBefore: 0, startedOnAfter: 0, capOnBefore: 0, capOnAfter: 0, batOnBefore: 0, batOnAfter: 0, startedOffBefore: 0, startedOffAfter: 0, capOffBefore: 0, capOffAfter: 0, batOffBefore: 0, batOffAfter: 0 });
  const inWin = (list: any[], port: string, typePortKey: "port", lo: number, hi: number) => list.filter((x) => x[typePortKey] === port && x.tick >= lo && x.tick <= hi).length;
  for (const seed of seeds) {
    const o = O[seed], n = N[seed];
    for (const t of n.transferWindows ?? []) {
      const row = bump(kindOf(t));
      row.n += 1;
      if (typeof t.garrison === "number") row.garrisons.push(t.garrison);
      row.startedOnBefore += t.startedBefore; row.startedOnAfter += t.startedAfter;
      row.capOnBefore += t.capturesBefore; row.capOnAfter += t.capturesAfter;
      row.batOnBefore += t.resolvedBefore; row.batOnAfter += t.resolvedAfter;
      const raids = o.raidStarts ?? [];
      const caps = o.capturesDetail ?? [];
      const bats = (o.raidStarts && o.byPort) ? null : null;
      // Flag-off starts and captures in the same numeric window; battles approximated from raidStarts if no resolved list — use byPort is lifetime, so count from raidStarts / capturesDetail only, plus a reconstructed resolved? We don't have off resolved-by-tick. Use raidStarts and capturesDetail.
      void bats;
      row.startedOffBefore += inWin(raids, t.port, "port", t.tick - 152, t.tick - 1);
      row.startedOffAfter += inWin(raids, t.port, "port", t.tick + 1, t.tick + 152);
      row.capOffBefore += inWin(caps, t.port, "port", t.tick - 152, t.tick - 1);
      row.capOffAfter += inWin(caps, t.port, "port", t.tick + 1, t.tick + 152);
    }
  }
  const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.max(0, Math.ceil((p / 100) * s.length) - 1)] : "—"; };
  lines.push("| Kind | N | Garrison min / median / max | Starts on before → after | Starts off before → after | Captures on before → after | Captures off before → after | Battles on before → after |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const [k, a] of Object.entries(agg).sort()) {
    const g = a.garrisons;
    lines.push(`| ${k} | ${a.n} | ${g.length ? `${Math.min(...g)} / ${pct(g, 50)} / ${Math.max(...g)}` : "—"} | ${a.startedOnBefore} → ${a.startedOnAfter} | ${a.startedOffBefore} → ${a.startedOffAfter} | ${a.capOnBefore} → ${a.capOnAfter} | ${a.capOffBefore} → ${a.capOffAfter} | ${a.batOnBefore} → ${a.batOnAfter} |`);
  }
  lines.push("");

  // WG-bought (sale to world-government) garrisons
  const bought = on.flatMap((r) => (r.transferWindows ?? []).filter((t: any) => t.kind === "sale" && t.to === "world-government"));
  const g = bought.map((t: any) => t.garrison).filter((x: any) => typeof x === "number");
  lines.push(`WG-bought sale ports: ${bought.length} sales, garrison min / median / max ${g.length ? `${Math.min(...g)} / ${pct(g, 50)} / ${Math.max(...g)}` : "—"}; price sum ${bought.reduce((a: number, t: any) => a + (t.price ?? 0), 0)}.`);
  const byFrom = bought.reduce((a: Record<string, number>, t: any) => { const k = String(t.from).startsWith("secession-") ? "breakaway" : t.from; a[k] = (a[k] ?? 0) + 1; return a; }, {});
  lines.push(`By seller: ${JSON.stringify(byFrom)}.`);
  lines.push("");

  // Totals leave-one-out vs both
  lines.push("### Leave-one-trigger-out totals");
  lines.push("");
  lines.push("| Set | Offers (cession / sale) | Accepts (sales / grants) | Captures | Battles | Cap/battle | Claims | Port changes | Battle starts |");
  lines.push("|---|---|---|---|---|---|---|---|---|");
  for (const [name, rs] of [[offL, off], [onL, on], [cessL, cess], [saleL, sale]] as const) {
    const k = rs.reduce((a: Record<string, number>, r: any) => { for (const [x, n] of Object.entries(r.acceptsByKind ?? {})) a[x] = (a[x] ?? 0) + (n as number); return a; }, {});
    const tr = rs.reduce((a: Record<string, number>, r: any) => { for (const [x, n] of Object.entries(r.offersByTrigger ?? {})) a[x] = (a[x] ?? 0) + (n as number); return a; }, {});
    lines.push(`| ${name} | ${sum(rs, "offers")} (${tr.cession ?? 0} / ${tr.sale ?? 0}) | ${sum(rs, "accepts")} (${k.sale ?? 0} / ${k.grant ?? 0}) | ${sum(rs, "captures")} | ${sum(rs, "battles")} | ${rate(sum(rs, "captures"), sum(rs, "battles"))} | ${sum(rs, "claims")} | ${sum(rs, "portChanges")} | ${sum(rs, "battleStarts")} |`);
  }
  lines.push("");
  return lines.join("\n");
}

const out = [];
out.push("# Capture diagnosis (rev 2)");
out.push("");
out.push(block("ATLS (exile on)", labels.off, labels.on, labels.cess, labels.sale));
out.push(block("ATLS exile off", labels.offX, labels.onX, labels.cessX, labels.saleX));
writeFileSync("docs/design/negotiated-transfer/raw/capture-diagnosis.txt", out.join("\n"));
console.log(out.join("\n"));
