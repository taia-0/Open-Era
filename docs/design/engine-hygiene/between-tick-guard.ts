// Guard: a new event type appearing between ticks (not in OUT_OF_TICK_TYPES) must fail.
// Usage: node --experimental-strip-types docs/design/engine-hygiene/between-tick-guard.ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { submitCommand } from "../../../src/sim/commands.ts";
import { runTick } from "../../../src/sim/engine.ts";
import { WorldStore } from "../../../src/sim/persistence.ts";
import { createPrototypeWorld } from "../../../src/sim/scenario.ts";
import { OUT_OF_TICK_TYPES, unexpectedBetweenTickType } from "../../../src/sim/tick-start.ts";

const listed = [...OUT_OF_TICK_TYPES];
const listedOk = listed.every((t) => unexpectedBetweenTickType(t) === false);
const unknownOk = unexpectedBetweenTickType("battle-resolved") === true;
const dir = mkdtempSync(join(tmpdir(), "oe-guard-"));
const path = join(dir, "world.sqlite");
const store = new WorldStore(path);
const w = createPrototypeWorld(1847, { playerCharacterId: "character-01" });
const playerId = Object.keys(w.players)[0];
store.initialize(w);
let appends = 0, between = 0;
try {
  for (let i = 1; i <= 120; i++) {
    for (const r of Object.values(w.characters)) for (const o of r.standingOrders) {
      if (o.issuerId === "character-01" && o.status === "awaiting-confirmation") {
        const res = submitCommand(w, { playerId, type: "confirm-order", characterId: r.id, orderId: o.id });
        if (res.ok) { store.appendTick([res.event], w, { betweenTicks: true }); between++; }
      }
    }
    const result = runTick(w, {});
    store.appendTick(result.events, w, { leadingCount: result.leadingCount });
    appends++;
  }
  console.log(JSON.stringify({ ok: listedOk && unknownOk, listed, listedOk, unknownOk, ticks: 120, tickAppends: appends, betweenTickAppends: between, types: listed }));
} catch (error) {
  console.log(JSON.stringify({ ok: false, error: String(error) }));
  process.exitCode = 1;
} finally {
  store.close();
  rmSync(dir, { recursive: true, force: true });
}

// The store itself throws when an unlisted type is appended as between-tick.
{
  const dir = mkdtempSync(join(tmpdir(), "oe-guard2-"));
  const path = join(dir, "world.sqlite");
  const store = new WorldStore(path);
  const w = createPrototypeWorld(1847);
  store.initialize(w);
  const result = runTick(w, {});
  store.appendTick(result.events, w, { leadingCount: result.leadingCount });
  const fake = { ...result.events[0]!, sequence: w.nextEventSequence, type: "battle-resolved" as const };
  let threw = false;
  try { store.appendTick([fake], w, { betweenTicks: true }); } catch (e) { threw = String(e).includes("unlisted between-tick event type: battle-resolved"); }
  store.close(); rmSync(dir, { recursive: true, force: true });
  if (!threw) { console.error(JSON.stringify({ ok: false, error: "store did not throw on unlisted between-tick type" })); process.exit(1); }
  console.log(JSON.stringify({ throwOnUnlisted: true }));
}
