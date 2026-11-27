// Per-seed table for chosen configs: claims / port changes / secessions / portless factions at t1200.
//   node --experimental-strip-types docs/design/defaults-on/perseed.ts subset-none subset-OATLS subset-ATLS subset-ATL
import { readFileSync } from "node:fs";
import { join } from "node:path";
const labels = process.argv.slice(2);
const data = labels.map((l) => readFileSync(join(import.meta.dirname, "raw", `${l}.jsonl`), "utf8").trim().split("\n").map((s) => JSON.parse(s)));
console.log(`| Seed | ${labels.map((l) => `${l} C / PC / Sec / Portless`).join(" | ")} |`);
console.log(`|---|${labels.map(() => "---").join("|")}|`);
for (let i = 0; i < data[0].length; i++) console.log(`| ${data[0][i].seed} | ${data.map((rows) => { const r = rows[i]; return `${r.claims} / ${r.portChanges} / ${r.secessions} / ${r.portless}`; }).join(" | ")} |`);
console.log(`| low | ${data.map((rows) => { const lo = (k: string) => { const m = Math.min(...rows.map((r) => r[k])); return `${m} (${rows.filter((r) => r[k] === m).map((r) => r.seed).join(",")})`; }; return `C ${lo("claims")}, PC ${lo("portChanges")}`; }).join(" | ")} |`);
