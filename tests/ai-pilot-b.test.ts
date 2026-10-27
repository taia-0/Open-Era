import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runTick, runTicks, type TickOptions } from "../src/sim/engine.ts";
import { WorldStore } from "../src/sim/persistence.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { canonicalJson, stateHash } from "../src/sim/state.ts";
import { stubAgree, type TaxStepProvider, type TaxStepTraceEntry } from "../src/sim/ai-provider.ts";
import {
  BRIEFING_MAX_BYTES, briefingBytes, buildTaxStepBriefing, stubContextEcho, stubContextFail, stubContextGarbage,
  validateBriefing, type ContextReader,
} from "../src/sim/ai-context.ts";
import type { SimEvent } from "../src/sim/types.ts";

/** AI pilot B, section 6 (docs/design/ai-pilot-b.md at 7a8dd0e). Stubs only. */
const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(resolve(here, "fixtures/golden-hashes.json"), "utf8")) as {
  ticks: number; seeds: { seed: number; stateHash: string; eventCount: number }[];
};
const FLAG_OFF_1200: Record<number, string> = {
  1847: "c4d99822bfd9bd19f82f9bec5a9b814edbe076d9bd875734f68a32914b125bb5",
  2718: "738181c01b6c30629f1e409b2110d1241978690f8aa44388986443bb581afca0",
  4096: "cbd6656523e62830503b7ac5011dbeec81821c5b935594bdc1696a905cd69649",
};
const CALLS_1200: Record<number, number> = { 1847: 33, 2718: 27, 4096: 30 };
const SEEDS = [1847, 2718, 4096];
const READERS: Record<string, () => ContextReader> = {
  echo: stubContextEcho,
  garbage: stubContextGarbage,
  timeout: () => stubContextFail("timeout"),
  error: () => stubContextFail("error"),
  illegal: () => stubContextFail("illegal"),
  cycle: () => stubContextFail("cycle"),
};

type Run = { hash: string; events: SimEvent[]; trace: TaxStepTraceEntry[]; world: ReturnType<typeof createPrototypeWorld> };
const cache = new Map<string, Run>();
function agreeRun(seed: number, reader: string): Run {
  const key = `${seed}:${reader}`;
  if (!cache.has(key)) {
    const result = runTicks(createPrototypeWorld(seed), 1200, { ai: { brainTaxStep: stubAgree(), context: READERS[reader]() } });
    cache.set(key, { hash: stateHash(result.state), events: result.events, trace: result.aiTrace ?? [], world: result.state });
  }
  return cache.get(key)!;
}
const aiEvents = (run: Run) => run.events.filter((event) => "ai" in event.data);
type Context = { briefing: unknown; outcome: string; fallbackReason: string | null; droppedIds: number };

test("1. off is off: 72 ticks with the flag off, and with the brain on and context unset, match the golden fixture", () => {
  for (const entry of golden.seeds) {
    const off = runTicks(createPrototypeWorld(entry.seed), golden.ticks);
    assert.equal(stateHash(off.state), entry.stateHash);
    assert.equal(off.events.length, entry.eventCount);
    const unset = runTicks(createPrototypeWorld(entry.seed), golden.ticks, { ai: { brainTaxStep: stubAgree() } });
    assert.equal(stateHash(unset.state), entry.stateHash);
    assert.equal(unset.events.length, entry.eventCount);
    for (const event of unset.events) {
      if ("ai" in event.data) assert.equal((event.data.ai as { context: unknown }).context, null);
    }
  }
});

test("2. agree stays identical: brain stubAgree with each context stub gives the flag-off 1200-tick hash", () => {
  for (const reader of Object.keys(READERS)) for (const seed of SEEDS) {
    assert.equal(agreeRun(seed, reader).hash, FLAG_OFF_1200[seed], `${reader} seed ${seed}`);
  }
});

test("3. recorded: every data.ai has a valid context briefing of at most 1,024 bytes", () => {
  for (const seed of SEEDS) {
    // Validate against the end of the run: every id ever briefed is still in the state (breakaways stay listed).
    const world = agreeRun(seed, "echo").world;
    const events = aiEvents(agreeRun(seed, "echo"));
    assert.ok(events.length > 0);
    for (const event of events) {
      const context = (event.data.ai as { context: Context | null }).context;
      assert.ok(context, `sequence ${event.sequence}`);
      assert.ok(briefingBytes(context.briefing) <= BRIEFING_MAX_BYTES);
      const again = validateBriefing(world, context.briefing);
      assert.ok(again);
      assert.equal(canonicalJson(again.briefing), canonicalJson(context.briefing), "already valid: the validator changes nothing");
      assert.equal(again.droppedIds, 0);
    }
  }
});

test("4. garbage reduced: no unknown id survives, ids were dropped, size within the cap, the brain still answers", () => {
  for (const seed of SEEDS) {
    const run = agreeRun(seed, "garbage");
    assert.equal(run.hash, agreeRun(seed, "echo").hash);
    for (const entry of run.trace) {
      const context = entry.ai.context!;
      assert.equal(context.outcome, "model");
      assert.ok(context.droppedIds > 0);
      assert.ok(briefingBytes(context.briefing) <= BRIEFING_MAX_BYTES);
      const text = canonicalJson(context.briefing);
      for (const bad of ["character-999", "ghost-ally", "atlantis", "no-such-faction", "el-dorado", "ecstatic", "enormous", "padding"]) {
        assert.equal(text.includes(bad), false, `${bad} survived`);
      }
      assert.equal(entry.ai.outcome, "model");
    }
  }
});

test("5. failure falls back to the serializer with the right reason", () => {
  for (const mode of ["timeout", "error", "illegal"] as const) for (const seed of SEEDS) {
    const run = agreeRun(seed, mode);
    assert.equal(run.hash, agreeRun(seed, "echo").hash);
    assert.ok(run.trace.length > 0);
    const echo = agreeRun(seed, "echo").trace;
    run.trace.forEach((entry, index) => {
      const context = entry.ai.context!;
      assert.equal(context.outcome, "fallback");
      assert.equal(context.fallbackReason, mode);
      // The echo stub returns the serializer, so its briefing at the same call is the serializer output.
      assert.deepEqual(context.briefing, echo[index].ai.context!.briefing);
    });
  }
  const cycle = agreeRun(1847, "cycle").trace.map((entry) => entry.ai.context!.fallbackReason);
  assert.deepEqual(cycle.slice(0, 3), ["timeout", "error", "illegal"]);
});

test("6. read-only: the world is unchanged by the serializer and by each stub's read", () => {
  const world = createPrototypeWorld(1847);
  runTicks(world, 96);
  const holderId = Object.values(world.characters).find((character) => character.factionId === "free-tide")!.id;
  const before = canonicalJson(world);
  const serializer = buildTaxStepBriefing(world, holderId);
  assert.equal(canonicalJson(world), before);
  for (const make of Object.values(READERS)) {
    make().read({ tick: world.tick, factionId: "free-tide", holderId, serializer, promptVersion: "sha256:test" });
    assert.equal(canonicalJson(world), before);
  }
  validateBriefing(world, serializer);
  assert.equal(canonicalJson(world), before);
});

test("7. replay never calls: recovery reaches the live hash with both counts unchanged", () => {
  let reads = 0;
  let decides = 0;
  const echo = stubContextEcho();
  const agree = stubAgree();
  const reader: ContextReader = { name: echo.name, model: echo.model, read: (request) => { reads += 1; return echo.read(request); } };
  const brain: TaxStepProvider = { name: agree.name, model: agree.model, decide: (request) => { decides += 1; return agree.decide(request); } };
  const directory = mkdtempSync(join(tmpdir(), "open-era-ai-pilot-b-"));
  const databasePath = join(directory, "recovery.sqlite");
  try {
    const store = new WorldStore(databasePath);
    const world = createPrototypeWorld(1847);
    store.initialize(world);
    const options: TickOptions = { ai: { brainTaxStep: brain, context: reader } };
    // Stop at 100: the latest snapshot is the tick-96 morning, so recovery replays tick 96's briefed step.
    while (world.tick < 100) store.appendTick(runTick(world, options).events, world);
    const live = stateHash(world);
    store.close();
    assert.ok(reads > 0);
    assert.equal(reads, decides);
    const [readsBefore, decidesBefore] = [reads, decides];
    const reopened = new WorldStore(databasePath);
    const recovered = reopened.recover();
    assert.ok(recovered.replayedEvents > 0);
    assert.equal(stateHash(recovered.state), live);
    assert.equal(reads, readsBefore);
    assert.equal(decides, decidesBefore);
    reopened.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("8. calls: the reader is called exactly as often as the brain, 33 / 27 / 30 at 1200 ticks", () => {
  for (const seed of SEEDS) {
    let reads = 0;
    let decides = 0;
    const echo = stubContextEcho();
    const agree = stubAgree();
    const result = runTicks(createPrototypeWorld(seed), 1200, { ai: {
      brainTaxStep: { name: agree.name, model: agree.model, decide: (request) => { decides += 1; return agree.decide(request); } },
      context: { name: echo.name, model: echo.model, read: (request) => { reads += 1; return echo.read(request); } },
    } });
    assert.equal(stateHash(result.state), FLAG_OFF_1200[seed]);
    assert.equal(reads, CALLS_1200[seed], `seed ${seed}`);
    assert.equal(decides, CALLS_1200[seed]);
  }
  // Under a cap, neither role is called past it, and the reader falls back with reason cap.
  let reads = 0;
  const echo = stubContextEcho();
  const capped = runTicks(createPrototypeWorld(1847), 1200, { ai: {
    brainTaxStep: stubAgree(), cap: 10,
    context: { name: echo.name, model: echo.model, read: (request) => { reads += 1; return echo.read(request); } },
  } });
  assert.equal(reads, 10);
  assert.ok(capped.aiTrace!.slice(10).every((entry) => entry.ai.context!.fallbackReason === "cap"));
  assert.equal(stateHash(capped.state), FLAG_OFF_1200[1847]);
});
