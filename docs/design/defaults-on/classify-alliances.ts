// Classify props-alliances.ts violations under a combined set: protection pacts (secession aftermath) vs ALLIANCES pacts,
// checker-scope (cause format / 24-tick clock: protection pacts are validated by props-secession-aftermath.ts instead)
// vs cross-layer rules (one pact per faction, pair cooldown, break condition alive at a tick's end).
//   node --experimental-strip-types docs/design/defaults-on/classify-alliances.ts <json>
import { readFileSync } from "node:fs";
const j = JSON.parse(readFileSync(process.argv[2], "utf8"));
const out: Record<string, number> = {}; const pacts: Record<string, Set<string>> = {}; const ticksAlive: Record<string, Map<string, number>> = {};
for (const row of j.on) for (const s of row.all as string[]) {
  const id = s.match(/pact (\S+?)(:| )/)?.[1] ?? "";
  const kind = id.startsWith("protection-") ? "protection" : id ? "alliances" : "other";
  const rule = s.includes("without a known cause") ? "scope: cause format" : s.includes("off the clock") ? "scope: 24-tick clock"
    : s.includes("already in a pact") ? "one pact per faction" : s.includes("cooldown") ? "pair cooldown"
    : s.includes("alive with a gone ally") ? "break late: ally gone" : s.includes("alive with a portless enemy") ? "break late: enemy portless"
    : s.includes("alive with an ally attack") ? "break late: ally attack" : s.replace(/t\d+|\d+/g, "#");
  const k = `${kind} | ${rule}`; out[k] = (out[k] ?? 0) + 1; (pacts[k] ??= new Set()).add(`${row.seed}:${id}`);
  if (rule.startsWith("break late")) { const m = (ticksAlive[k] ??= new Map()); m.set(`${row.seed}:${id}`, (m.get(`${row.seed}:${id}`) ?? 0) + 1); }
}
for (const [k, n] of Object.entries(out).sort()) console.log(`${k}: ${n} hits, ${pacts[k].size} pacts${ticksAlive[k] ? `, ticks alive past condition per pact: ${[...ticksAlive[k].values()].join(",")}` : ""}`);
console.log("seeds:", [...new Set(Object.values(pacts).flatMap((s) => [...s].map((x) => x.split(":")[0])))].join(","));
