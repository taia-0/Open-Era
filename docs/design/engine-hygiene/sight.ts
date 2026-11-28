// Item 5 harness: combat-sighting freshness. One config, 13 seeds x 1,200 ticks. Run once on a tree WITHOUT and once WITH
// item5-sighting-freshness.patch; compare with sight-compare.ts.
// A scripted commander (character-01) confirms every awaiting order and, every 24 ticks, sends two officers of its own faction
// to explore a rotating port it does not hold. The reports store party sightings on the commander (the headless run never does).
// Every 12 ticks it reads combatForecast for every other port. Offline, no AI, $0.
// Usage: node --experimental-strip-types docs/design/engine-hygiene/sight.ts <label> <flag-off|atls>
import { combatForecast } from "../../../src/sim/combat.ts";
import { runTick } from "../../../src/sim/engine.ts";
import { createPrototypeWorld } from "../../../src/sim/scenario.ts";
import { stateHash } from "../../../src/sim/state.ts";
import { submitCommand } from "../../../src/sim/commands.ts";
import type { SimEvent } from "../../../src/sim/types.ts";
import { CONFIGS, EventDigest, outcomes, SEEDS13 } from "./common.ts";

const [label, cfg] = process.argv.slice(2);
const opts = CONFIGS[cfg];
const ticks = Number(process.env.TICKS ?? 1200);
const seeds = (process.env.SEEDS ?? SEEDS13).split(",").map(Number);

for (const seed of seeds) {
  const w = createPrototypeWorld(seed, { playerCharacterId: "character-01" });
  const playerId = Object.keys(w.players)[0];
  const cmd = w.characters["character-01"];
  const log: SimEvent[] = [];
  const dig = new EventDigest();
  const keep = (evs: SimEvent[]) => { for (const e of evs) { dig.add(e); log.push(e); } };
  const script = { confirm: 0, explore: 0, exploreFail: 0 };
  const forecasts: Array<[number, string, number, number, number, number, number, number, number]> = [];
  let h72 = "";
  let rot = 0;
  for (let i = 1; i <= ticks; i++) {
    for (const r of Object.values(w.characters)) for (const o of r.standingOrders) {
      if (o.issuerId === cmd.id && o.status === "awaiting-confirmation") {
        const res = submitCommand(w, { playerId, type: "confirm-order", characterId: r.id, orderId: o.id });
        if (res.ok) { keep([res.event]); script.confirm++; }
      }
    }
    if (w.tick > 0 && w.tick % 24 === 0 && cmd.factionId) {
      const ports = Object.values(w.settlements).filter((s) => s.factionId !== cmd.factionId).sort((a, b) => a.id.localeCompare(b.id));
      const officers = Object.values(w.characters)
        .filter((c) => !c.dead && c.id !== cmd.id && c.factionId === cmd.factionId && c.controller.kind === "autonomous" && c.captivity === null && c.travel === null)
        .sort((a, b) => a.id.localeCompare(b.id));
      for (let k = 0; k < 2 && ports.length && officers.length; k++) {
        const port = ports[(rot++) % ports.length];
        const officer = officers[(rot + k) % officers.length];
        const res = submitCommand(w, { playerId, type: "issue-order", characterId: officer.id, directive: "explore", targetId: port.id, expiresInTicks: 72 });
        if (res.ok) { keep([res.event]); script.explore++; } else script.exploreFail++;
      }
    }
    keep(runTick(w, { ...opts }).events);
    if (i === 72) h72 = stateHash(w).slice(0, 8);
    if (i % 12 === 0) {
      for (const s of Object.values(w.settlements).sort((a, b) => a.id.localeCompare(b.id))) {
        if (cmd.locationId === s.id) continue;
        const f = combatForecast(w, cmd.id, s.id);
        const sights = Object.values(cmd.partySightings ?? {}).filter((x) => x.locationId === s.id);
        const stale = sights.filter((x) => w.tick - x.observedTick > 72).length;
        forecasts.push([w.tick, s.id, f.winChance.low, f.winChance.high, f.defenderPower.low, f.defenderPower.high, sights.length, stale, f.revealedFactors.length]);
      }
    }
  }
  const withSight = forecasts.filter((x) => x[6] > 0).length;
  const withStale = forecasts.filter((x) => x[7] > 0).length;
  const sightingsHeld = Object.keys(cmd.partySightings ?? {}).length;
  console.log(JSON.stringify({
    label, cfg, seed, h72, h1200: stateHash(w).slice(0, 8), events: dig.count, eventDigest: dig.hex(), typeDigest: dig.typesHex(), ...outcomes(w, log),
    script, sightingsHeld, forecastsN: forecasts.length, forecastsWithSighting: withSight, forecastsWithStale: withStale, forecasts,
  }));
}
