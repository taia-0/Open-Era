// directed-relationships-scope.md: which secession route(s) each declaration carried (event data.routes). Offline, $0.
// Usage: node --experimental-strip-types docs/design/directed-relationships-scope/probe-routes.ts <label> '<TickOptions JSON>'
import { runTick } from "../../../src/sim/engine.ts";
import { createPrototypeWorld } from "../../../src/sim/scenario.ts";
const [label, optsJson] = process.argv.slice(2);
const opts = JSON.parse(optsJson ?? "{}"); const out: Record<string, number> = {}; let total = 0;
for (const seed of [1847, 2718, 4096, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000]) {
  const w = createPrototypeWorld(seed);
  for (let i = 0; i < 1200; i++) for (const e of runTick(w, opts).events) if (e.type === "secession-declared") { total++; const k = (e.data.routes as string[]).join("+"); out[k] = (out[k] ?? 0) + 1; }
}
console.log(JSON.stringify({ label, total, routes: out }));
