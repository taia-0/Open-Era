// Item 3 harness: news guard / news prune. Headless, one config, 13 seeds x 1,200 ticks (TICKS=... to change).
// Prints the event digest (incl. sequence), pins, outcomes, replay exactness, ledger sizes at the end and
// arrival-post statistics. Run on a tree with and without item3-news-guard-prune.patch.
// Usage: node --experimental-strip-types docs/design/engine-hygiene/news.ts <label> <flag-off|atls>
import { runTick } from "../../../src/sim/engine.ts";
import { createPrototypeWorld } from "../../../src/sim/scenario.ts";
import { stateHash } from "../../../src/sim/state.ts";
import { replayWithSilentStarts } from "../../../src/sim/tick-start.ts";
import type { SimEvent } from "../../../src/sim/types.ts";
import { CONFIGS, EventDigest, outcomes, SEEDS13 } from "./common.ts";

const [label, cfg] = process.argv.slice(2);
const opts = CONFIGS[cfg];
const ticks = Number(process.env.TICKS ?? 1200);
const seeds = (process.env.SEEDS ?? SEEDS13).split(",").map(Number);
for (const seed of seeds) {
  const w = createPrototypeWorld(seed);
  const log: SimEvent[] = [];
  const dig = new EventDigest();
  let h72 = "";
  const ages = { posts: 0, arrivalPosts: 0, over24: 0, over180: 0, over240: 0 };
  let newsBytes = 0, newsEvents = 0;
  for (let i = 1; i <= ticks; i++) {
    for (const e of runTick(w, { ...opts }).events) {
      dig.add(e); log.push(e);
      if (e.type === "news-posted") {
        const rec = e.data.record as { item: { observedTick: number } };
        ages.posts++; newsEvents++; newsBytes += JSON.stringify(e.data).length;
        const age = e.tick - rec.item.observedTick;
        if (age > 0) { ages.arrivalPosts++; if (age > 24) ages.over24++; if (age > 180) ages.over180++; if (age > 240) ages.over240++; }
      }
    }
    if (i === 72) h72 = stateHash(w).slice(0, 8);
  }
  const rep = createPrototypeWorld(seed);
  replayWithSilentStarts(rep, log);
  const ledger = Object.values(w.settlements).map((s) => (s.news ?? []).length);
  const ledgerJson = JSON.stringify(Object.values(w.settlements).map((s) => s.news ?? [])).length;
  console.log(JSON.stringify({ label, cfg, seed, h72, h1200: stateHash(w).slice(0, 8), events: dig.count, eventDigest: dig.hex(), typeDigest: dig.typesHex(), ...outcomes(w, log),
    replayExact: stateHash(rep) === stateHash(w), ledgerItems: ledger.reduce((a, b) => a + b, 0), ledgerMax: Math.max(...ledger), ledgerBytes: ledgerJson, stateBytes: JSON.stringify(w).length, newsEvents, newsEventBytes: newsBytes, ages }));
}
