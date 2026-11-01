# AI pilot A: Free Tide's tax step on the brain

**Status: Open / build brief.** Design only. Nothing here is in the tree, and no account, key, or paid call was used. This turns step A of the pilot in [AI brain](ai-brain.md) into slices the Engineer can build. Connecting a real vendor stays Micah's call.

## Checked on

`origin/main` at `f1a0db310102186d8a95395bd0f206fb6c05b405` (includes PR #126, `ai-brain.md`). Node v24.21.0, ICU 78.3. `npm test` passed, 459 tests, 0 failed. A harness outside the repository ran 1,200 ticks on each seed, no player commands, and was not committed. `git status` was clean afterwards. The 1200-tick hashes matched the batch 1 baseline (`7314d632` / `b7015fce` / `7f0f865b`, 163059 / 165135 / 168755 events).

## The code this pilot touches

- **The scorer.** `autonomousTaxStep(world, factionId)` in `src/sim/tax-rate.ts`. It runs only when `world.tick > 0`, `world.tick % TAX_RATE_COOLDOWN_TICKS === 0` (24), the faction has a free command holder (`freeCommandHolder`, via `spendRole` in `src/sim/allowance.ts`), and the cooldown since `faction.taxRateSetTick` has passed. *Pressed* is the lowest held-port stability at or under `CLAIM_STABILITY_FLOOR` (55, in thousandths: `stability × 1000 ≤ 55000`; the constant is in `src/sim/state.ts`). *Short* is `freeMateCount(...) > 0` and the treasury below one day of passage per mate. Pressed steps down one cent. Short and not pressed steps up one cent. The rate stops at 0 and at `TAX_RATE_MAX` (0.30). It returns `null` when the cent would not change, and **null emits no event**. **It makes no RNG draw.**
- **The caller.** `chooseAutonomousTaxRates(world, events, liveSession)` in `src/sim/engine.ts`, called from `runTick` right after player commands and before `declareAutonomousSecessions`. Factions in id order. A live session skips a human holder. It calls `emit(world, events, { type: "tax-rate-set", actorId, targetId: factionId, data: { factionId, taxRate, previousTaxRate, taxRateSetTick } })`.
- **`emit`** (`src/sim/engine.ts`) stamps `sequence` and `tick`, calls `applyEvent`, and pushes the event.
- **`applyEvent`**, case `"tax-rate-set"` (`src/sim/state.ts`), reads only `data.factionId` (or `targetId`), `data.taxRate`, and `data.taxRateSetTick`. It writes `faction.taxRate` and `faction.taxRateSetTick`. It ignores every other `data` key. `applyEvent` also advances `world.nextEventSequence`, so **an added event moves `stateHash`**. An added key on an existing event does not.
- **`stateHash`** (`src/sim/state.ts`) is sha256 of `canonicalJson(world)`. The event log is not in it.
- **RNG.** The main stream is `DeterministicRng` (`src/sim/rng.ts`), created from `world.rngState` at the top of `runTick`. Side streams exist already, for example `desertionRng` in `src/sim/engine.ts`, forked from the scenario's starting `rngState` and kept off the world.
- **Recovery.** `WorldStore.recover()` (`src/sim/persistence.ts`) loads the latest snapshot and applies later events through `applyEvent` only. The golden recovery test is in `tests/golden.test.ts`.
- **Players.** Free Tide is `free-tide` (`src/sim/scenario.ts`, starting rate 0.08, treasury 2,800). Its holder in the scenario is autonomous. World Government's holder is Mara Vane, the human, who is stepped only in headless runs.

## What the tree does today

Harness counts, 1200 ticks, headless. "Clock points" are ticks where, at the start of the tick, `free-tide` had a free holder, the tick was a positive multiple of 24, and the cooldown had passed. That check runs at tick start, before player commands and upkeep, so it is a close approximation of `autonomousTaxStep`'s own gate, not a copy of it.

| Seed | `tax-rate-set` WG / FT | FT steps up / down | FT clock points | …of which FT held no port | FT steps while holding no port | First FT step | FT end rate | FT max rate |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1847 | 7 / 15 | 12 / 3 | 45 | 22 | 1 | 120 | 0.17 | 0.18 |
| 2718 | 3 / 22 | 22 / 0 | 45 | 29 | 14 | 216 | 0.30 | 0.30 |
| 4096 | 1 / 25 | 17 / 8 | 42 | 3 | 2 | 264 | 0.17 | 0.21 |

Two corrections to `ai-brain.md`:

1. Its 22 / 25 / 26 tax calls were **both factions**. Free Tide alone stepped 15 / 22 / 25 times.
2. A model can choose a step where the scorer holds, so the pilot is asked at every **clock point**, not only where the scorer steps: 45 / 45 / 42 clock points per run. **Built: 33 / 27 / 30 calls** (see the correction below).

## Correction, 2026-10-26: built call counts

Pilot A as built on `feature/ai-pilot-a` at `7531ffc` makes **33 / 27 / 30** provider calls per 1,200-tick run on seeds 1847 / 2718 / 4096 (agree stub, re-measured for `ai-pilot-b.md`), not the 45 / 45 / 42 planned. The main cause is the **landless freeze**, which already existed: at a clock point where Free Tide holds no port, `taxStepOptions` (`src/sim/tax-rate.ts`) returns the one option `hold`, and `chooseAutonomousTaxRates` does not send a one-option set (section 7, default 4). Counted per clock point at `7531ffc` with an uncommitted counter, restored afterwards:

| Seed | Clock points reached | Sent | Landless freeze (one option) | No step offered (no holder, or within 24 ticks of a set) | Non-autonomous holder |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1847 | 49 | 33 | 7 | 9 | 0 |
| 2718 | 49 | 27 | 9 | 13 | 0 |
| 4096 | 49 | 30 | 19 | 0 | 0 |

The planned 45 / 45 / 42 counted Free Tide's clock points on the batch 1 tree without either gate; the freeze is the largest skip on 4096. Cost falls to match: $0.14 / $0.11 / $0.13 at peak, estimate (calls × $0.004224).

## 1. Slices, in build order

| # | Slice | Files | Hash expectation |
| --- | --- | --- | --- |
| A0 | **Options, no behavior change.** Add `taxStepOptions(world, factionId)` beside `autonomousTaxStep`. It returns the clock gate, the holder, the scorer's choice (`down`, `hold`, or `up`), and the legal set: `hold` always, `down` when cents > 0, `up` when cents < 30. `autonomousTaxStep` becomes a thin wrapper that returns `null` for `hold`. Pure, no draw | `src/sim/tax-rate.ts`, a new test | **Neutral.** Fixture and 1200-tick hashes byte-identical |
| A1 | **Provider seam and flag, stubs only.** `TaxStepProvider` interface, the three stubs, and `TickOptions.ai?: { brainTaxStep?: TaxStepProvider }`. With the option absent, `chooseAutonomousTaxRates` is unchanged and writes no `data.ai` | new `src/sim/ai-provider.ts`, `src/sim/engine.ts` (`TickOptions`, `chooseAutonomousTaxRates`) | **Neutral** with the flag off. With the flag on and the agree stub, `stateHash` and event counts are identical to flag off; event bodies gain `data.ai` on `tax-rate-set` only |
| A2 | **Recording, fallback, and recovery tests.** `data.ai` schema (section 2), the fallback reasons, a trace for holds (below), and the six checks (section 5) | `src/sim/engine.ts`, `src/sim/ai-provider.ts`, new `tests/ai-pilot-a.test.ts` | **Neutral** with flag off. **Moves** only under a scripted stub that disagrees, and only on the flagged run |
| A3 | **Free Tide only, plus the run cap.** The provider is consulted for `factionId === "free-tide"` and a free autonomous holder. World Government keeps the scorer. A per-run call cap | `src/sim/engine.ts`, test | **Neutral** with flag off |
| A4 (waits for batch 2) | **Landless freeze in the legal set.** When the faction holds no port, the legal set is `hold` only, and the provider is not called. Built with the batch 2 freeze so the scorer and the legal set agree | `src/sim/tax-rate.ts`, test | Moves with batch 2's freeze, not on its own |
| A5 (later, Micah's call) | **Real vendor.** `runTick` is synchronous; a network call needs an async tick loop or answers fetched before the tick. Not part of pilot A | — | — |

### Holds

Today a hold emits nothing. The pilot keeps that. Adding a `tax-rate-held` event would advance `nextEventSequence` and move `stateHash` even when the stub agrees, which breaks check 2. A **hold needs no replay record**, because it changes no world field. For audit, a hold the provider chose (including a hold that overrides the scorer's step) is written to an **in-memory call trace** returned beside the events (`TickResult` gains an optional `aiTrace`) and kept outside the world and outside `stateHash`. Replay never needs it.

## 2. The `data.ai` field on `tax-rate-set`

Written only when the flag is on and the final choice is a step. The reducer does not read it.

```json
"ai": {
  "role": "brain.taxStep",
  "provider": "stub-agree",
  "model": "stub-agree@1",
  "promptVersion": "sha256:…",
  "inputHash": "sha256:…",
  "options": ["down", "hold", "up"],
  "scorerChoice": "up",
  "rawAnswer": "{\"choice\":\"up\"}",
  "parsedChoice": "up",
  "finalChoice": "up",
  "outcome": "model",
  "fallbackReason": null,
  "latencyMs": 0,
  "context": null
}
```

| Field | Meaning |
| --- | --- |
| `role` | Always `brain.taxStep` in this pilot |
| `provider`, `model` | Provider name and a **versioned** model ID. Stubs use `stub-agree@1`, `stub-fail@1`, `stub-script@1`. Never an alias like `jev-latest` |
| `promptVersion` | sha256 of the prompt template text |
| `inputHash` | sha256 of `canonicalJson` of the request (the section 3 `TaxStepRequest`) |
| `options` | The legal set offered, in the fixed order `down`, `hold`, `up`, with the bounds (and later the freeze) already applied |
| `scorerChoice` | What `taxStepOptions` chose |
| `rawAnswer` | The provider's answer as a string, capped at 400 characters; null on timeout or error |
| `parsedChoice` | The answer parsed into the legal set, or null |
| `finalChoice` | What was applied. Equals `data.taxRate − data.previousTaxRate` in cents |
| `outcome` | `model`, or `fallback` |
| `fallbackReason` | `timeout`, `error`, `illegal`, `cap`, or null. `flag-off` never appears on an event, because flag off writes no `data.ai`; it appears only in the trace for tests |
| `latencyMs` | Wall-clock time. Non-deterministic |
| `context` | Null in step A. Step B puts the context reader's briefing here (schema in `ai-brain.md` section 3a) |

**Which fields are hashed.**

- **`stateHash`: none of them.** `applyEvent` ignores `data.ai`, so no world field depends on it. That is why flag-on with an agreeing stub keeps `stateHash`.
- **Event-body comparisons** in the new tests, and any future log digest: every field except `latencyMs`. The tests strip `latencyMs` before comparing a live log with a replayed or repeated one, because it is the only wall-clock field. `inputHash` and `promptVersion` are hashes over deterministic inputs, so they compare exactly.

## 3. Provider and stubs

```ts
type TaxChoice = "down" | "hold" | "up";

interface TaxStepRequest {
  tick: number;
  factionId: string;
  holderId: string;
  rateCents: number;
  pressed: boolean;
  short: boolean;
  lowestStabilityThousandths: number | null;
  treasuryCents: number;
  freeMates: number;
  options: TaxChoice[];
  scorerChoice: TaxChoice;
  promptVersion: string;
}

interface TaxStepAnswer {
  raw: string | null;
  latencyMs: number;
  error?: "timeout" | "error";
}

interface TaxStepProvider {
  readonly name: string;
  readonly model: string;
  decide(request: TaxStepRequest): TaxStepAnswer; // synchronous in pilot A
}
```

- **`stub-agree`** returns `scorerChoice`. Deterministic, `latencyMs: 0`.
- **`stub-fail`** returns `{ raw: null, error }`, cycling `timeout` and `error` by a fixed rule, or returns an illegal string such as `"sideways"`. Each case is selectable.
- **`stub-script`** returns choices from a fixed table keyed by `(seed, tick, factionId)`, falling back to `scorerChoice` when the key is missing. It is the only stub that diverges, and it is what the recovery test uses.

**Where the call sits.** Inside `chooseAutonomousTaxRates`, after `taxStepOptions` and before `emit`. Order: gate → options → (flag, Free Tide, cap) → `decide` → parse against `options` → final choice. Then either `emit` a `tax-rate-set` with `data.ai`, or record a hold in the trace. The legal set and the scorer use no RNG, so the call cannot shift any draw. A future provider that samples uses a side stream forked like `desertionRng`, never the main `rngState`.

**Replay and recovery stay model-free.** `WorldStore.recover()` applies stored events with `applyEvent`. The `tax-rate-set` reducer writes the rate from `data.taxRate`. It never calls `chooseAutonomousTaxRates`, so the provider is unreachable during recovery. Ticks run after recovery are live ticks and call the provider again, as they would in a continuous run.

## 4. The flag

- `ai.brain.taxStep`, carried as `TickOptions.ai.brainTaxStep` (a provider instance). **Default: absent, which means off.** `TickOptions` is a run option and is not on `WorldState`, like `liveSession`, so the flag itself never enters `stateHash`.
- **Flag off:** `chooseAutonomousTaxRates` runs exactly today's path. No `data.ai`, no trace entry, no new event. The 72-tick fixture (`86507558` / `c6268c39` / `d62ab7f9`, 8426 / 8335 / 8266), the 600-event split recovery on 1847 at tick 47, and the 1200-tick baseline (`7314d632` / `b7015fce` / `7f0f865b`) stay byte-identical. The golden test (`tests/golden.test.ts`) and `scripts/update-golden-hashes.ts` never pass the option.

## 5. Tests (`tests/ai-pilot-a.test.ts`)

1. **Flag off, hashes unchanged.** The golden fixture and split recovery pass unchanged, and 1200-tick runs match the baseline hashes and counts. No event has `data.ai`.
2. **Agree stub.** On all three seeds at 1200 ticks, `stateHash` and event counts equal flag off. Every Free Tide `tax-rate-set` has `data.ai.outcome === "model"` and `finalChoice === scorerChoice`. The trace has one entry per clock point.
3. **Failing stub.** For each of `timeout`, `error`, and `illegal`, the world matches flag off. Every Free Tide step carries `outcome: "fallback"` and the matching `fallbackReason`, and the applied choice is the scorer's.
4. **Recovery without the provider.** Run 1847 with `stub-script` set to choose `hold` where the scorer steps up and `up` where it holds, on at least one clock point before tick 120 (the first step on 1847). Snapshot, then recover from an earlier snapshot with a provider that throws if called. `recover()` reaches the live `stateHash`, and the throwing provider is never called.
5. **Calls only for this decision.** A counting stub is called only from `chooseAutonomousTaxRates`, only for `free-tide`, only at clock points, at most once per clock point, and never for World Government. On the agree stub the built gate makes 33 / 27 / 30 calls (7531ffc); the clock points are 45 / 45 / 42, and the gap is the landless freeze.
6. **Cap.** With a cap of 10, the 11th and later clock points apply the scorer's choice with `fallbackReason: "cap"`, and the world matches flag off under the agree stub. The default cap (50) is above every measured run, so it does not bind. The counter lives in run memory. A binding cap that has to survive recovery would need a world field and is out of scope.

## 6. Pilot measurements and judgment

Run every seed at 1200 ticks with the flag off, `stub-agree`, `stub-fail` (each reason), and `stub-script`. Record:

| Measure | How |
| --- | --- |
| Calls per run | Trace length. 33 / 27 / 30 on the agree stub at 7531ffc |
| Fallback rate | Fallback entries ÷ calls, by reason |
| FT rate path | `(tick, rate)` for every Free Tide `tax-rate-set`; end and maximum rate |
| Divergence tick | First tick at which `stateHash` differs from flag off, run tick by tick. Agree and fail stubs: none |
| Latency | `latencyMs` per call: mean, p95, max. Stubs are about 0 |
| Agreement | Per call: `finalChoice` vs `scorerChoice` as a 3 × 3 table (down, hold, up). Disagreements listed with the request fields (pressed, short, rate, treasury, mates, ports held) |
| Downstream | Secessions, Free Tide end treasury, ports held, from the same run |
| Estimated vendor cost | Calls × the per-call estimate in `ai-brain.md`: 2,000 input and 400 output tokens, both **assumed**, on `deepseek-v4-pro` at peak ($1.32 / $3.96 per M), 0.004224 per call. Built: 33 × 0.004224 = **$0.14** (1847), 27 × = $0.11, 30 × = $0.13 per run, estimate. Off-peak: 33 × 0.002112 = **$0.070**. (Planned at 45 calls: $0.19 / $0.095.) |

**Pass to move to a real vendor** (Micah decides; these are the bar this note proposes):

1. Checks 1–6 pass on all three seeds.
2. The agree stub has zero divergence and zero fallbacks.
3. Every forced fallback reproduces the flag-off world.
4. The scripted stub's recovery matches the live hash with the throwing provider.
5. Calls per run match the clock-point count and stay under the cap.
6. The estimated vendor cost per run is under the `ai-brain.md` budget guard ($5).

A real-vendor run would then be judged on agreement and reasons, not on beating the scorer: every disagreement must be explainable from the request fields. For example, a model that holds on 2718 while Free Tide holds no port, where the tree steps up 14 times, is the behavior the batch 2 freeze rules for.

## 7. Defaults

1. `ai.brain.taxStep` **off** (option absent). No `data.ai`, no trace, byte-identical hashes.
2. Scope **`free-tide` only**, free autonomous holder only. World Government stays on the scorer.
3. Asked at **every clock point** (45 / 45 / 42 clock points; 33 / 27 / 30 calls as built, because a landless clock point is not sent), not only when the scorer steps.
4. Legal set **`down`, `hold`, `up`**, bounded at 0 and 0.30. The landless freeze joins the set **with batch 2** (slice A4). A one-option set is not sent.
5. **Holds emit no event**. They go to the trace outside the world.
6. Provider is **synchronous, stubs only**. A real vendor needs an async tick loop (A5) and Micah's choice of vendor and key.
7. Fallback is **the scorer's choice**, with reason `timeout`, `error`, `illegal`, or `cap`.
8. Timeout **30,000 ms**, the brain timeout in `ai-brain.md`. Proposed, not measured. Stubs never reach it.
9. Run cap **50 calls**, above every measured run. Counter in run memory.
10. Model IDs **versioned**; prompt template pinned by sha256 in `promptVersion`.
11. `rawAnswer` capped at **400 characters**.
12. `latencyMs` is **excluded** from every log comparison. No `data.ai` field enters `stateHash`.
13. **No RNG** in the pilot. Any later sampling uses a side stream forked like `desertionRng`.
14. Step B (context reader) folds in later by filling `data.ai.context`. It is null in step A.
