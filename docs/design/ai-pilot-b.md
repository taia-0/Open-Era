# AI pilot B: the context reader briefs Free Tide's tax step

Status: **Open / build brief.** Docs only. Step B of the pilot in `ai-brain.md`. Builds on pilot A as built on `feature/ai-pilot-a` at `7531ffc`. Stubs only, no vendor, no key, flag off by default, every hash byte-identical with the flag off.

## Checked on

`feature/ai-pilot-a` at `7531ffc` (pilot A: `abfd3e3` A1, `372a2a9` A2, `3185cb7` A3, `c430504` tests). Node v24.21.0, ICU 78.3. `npm test`: 510 tests, 510 passed. A harness in `/tmp`, outside the repository, ran 1,200 ticks per seed with `ai.brainTaxStep = stubAgree()` and a wrapper that serialized the proposed briefing at each provider call. `git status` was clean afterwards. 1,200-tick hashes, flag off and agree stub identical: `c4d99822` / `738181c0` / `cbd66565` (163679 / 159177 / 161386 events) on 1847 / 2718 / 4096.

## The code this pilot touches

- `src/sim/ai-provider.ts`: `TaxStepRequest`, `TaxStepProvider` (synchronous `decide`), the three stubs, `TaxStepAiRecord` with `context: null`, `taxStepInputHash` (sha256 of `canonicalJson(request)`), `RAW_ANSWER_MAX = 400`, `TAX_STEP_DEFAULT_CAP = 50`.
- `src/sim/engine.ts`: `TickAiOptions { brainTaxStep?, cap?, calls? }`, `chooseAutonomousTaxRates`, `consultTaxStep`. Only `free-tide`, only a free autonomous holder, only a set with two or more options.
- `src/sim/types.ts`: `Character.relationships` (`Relationship`: trust, affinity, respect, fear, grievance, obligation, lastChangedTick), `Character.knowledge` (`SettlementKnowledge`: observedTick, confidence, factionId, garrisonEstimate, stocks and price estimates, source), `morale`, `personality.loyalty`, `loyaltyAdjustment`.

## What the tree gives pilot B

- **Calls to brief: 33 / 27 / 30 per run**, the pilot A calls (agree stub, measured). The reader runs only right before a pilot A provider call, never at a frozen, capped, or skipped clock point.
- At those calls the holder had **1–29** relationships (mean 18.5 / 12.4 / 13.3) and exactly **4** knowledge entries on every call, every seed.
- The pilot A request is **314–323 bytes** of canonical JSON.

## 1. Slices, in build order

| # | Slice | Files | Hash expectation |
| --- | --- | --- | --- |
| B1 | `TaxStepBriefing` type, the deterministic serializer `buildTaxStepBriefing(world, holderId)` and `validateBriefing` (drops unknown ids, clamps enums, enforces the cap). No caller yet | `src/sim/ai-context.ts` (new) | Unchanged everywhere |
| B2 | `ContextReader` seam and stubs (`stubContextEcho`, `stubContextFail(mode)`, `stubContextGarbage`). `TickAiOptions.context?: ContextReader`. `consultTaxStep` calls the reader first when set, puts the validated briefing on `TaxStepRequest.briefing`, and records it on `data.ai.context` | `ai-context.ts`, `ai-provider.ts`, `engine.ts` | Flag off and `context` unset: byte-identical. Reader set with any stub and the brain on `stubAgree`: still byte-identical (section 5) |
| B3 | Bump the prompt template to include `{briefing}` and pin it with its own `promptVersion`; the old version stays for runs without the reader | `ai-provider.ts` | Unchanged |
| B4 | Tests | `tests/ai-pilot-b.test.ts` | — |

No slice touches the reducer, `WorldState`, a rule, or World Government's path.

## 2. What goes in the briefing, and the cap

Read-only. The reader may read the holder and its faction; it never writes a field, emits an event, or draws a number. Fields follow the context-reader schema in `ai-brain.md`, trimmed to what the tax step can use:

| Field | Source | Serializer (the fallback and the echo stub) |
| --- | --- | --- |
| `morale` | `character.morale` | Rounded integer |
| `loyalty` | `personality.loyalty + loyaltyAdjustment` | Two decimals |
| `loyaltyRead` | — | `null` in the serializer; a reader may set `firm` / `wavering` / `breaking` |
| `grudges` | relationships with grievance > 0 | Top 3 by grievance, ties by id: `{ id, grievance }`; a reader may add `weight: low/mid/high` |
| `allies` | relationships with a same-faction character | Top 3 by trust, ties by id: `{ id, trust }` |
| `knownPorts` | `character.knowledge` | Every entry, by port id: `{ port, holder, garrison, ageTicks }` |
| `staleKnowledge` | the same | Ports with `ageTicks > 24` |

Measured size of the serializer output, canonical JSON, at every pilot A call on `7531ffc`:

| Seed | Calls | Min bytes | Max bytes | Mean bytes |
| --- | ---: | ---: | ---: | ---: |
| 1847 | 33 | 419 | 569 | 513.8 |
| 2718 | 27 | 420 | 586 | 517.3 |
| 4096 | 30 | 454 | 625 | 527.3 |

**Cap: 1,024 bytes of canonical JSON** (proposed default; the measured maximum is 625, so 399 bytes of headroom for a reader's enums). Over the cap the validator drops, in order, `staleKnowledge`, then `knownPorts` from the oldest, then `allies`, then `grudges` from the last, and sets `truncated: true`. The top-3 limits keep the 29-relationship case bounded. The cap is a byte count of the recorded value, so it is the same on every machine.

## 3. The `data.ai.context` slot

Pilot A writes `context: null`. Pilot B fills it, and only on a `tax-rate-set` that already carries `data.ai` (a step). A hold keeps its record in `aiTrace` as in pilot A.

```json
"context": {
  "role": "context.taxStep",
  "provider": "stub-context-echo",
  "model": "stub-context-echo@1",
  "promptVersion": "sha256:…",
  "inputHash": "sha256:…",
  "briefing": { "morale": 0, "loyalty": 0, "loyaltyRead": null, "grudges": [], "allies": [], "knownPorts": [], "staleKnowledge": [] },
  "outcome": "model",
  "fallbackReason": null,
  "droppedIds": 0,
  "truncated": false,
  "latencyMs": 0
}
```

`briefing` is the validated value the brain saw. The brain's `inputHash` is taken over the request **including** this briefing, so the record alone shows what the brain was given. Fallback reasons: `timeout`, `error`, `illegal` (not an object), `cap` (pilot A's per-run cap reached: neither role is called). On any fallback the briefing is the serializer output, `outcome: "fallback"`.

## 4. Stubs only, no vendor

`ContextReader { name; model; read(request): { raw: string | null; latencyMs; error? } }`, synchronous like `TaxStepProvider`.

- `stubContextEcho`: returns the serializer output. Deterministic.
- `stubContextFail(mode)`: `timeout`, `error`, `illegal`, `cycle`, as `stubFail`.
- `stubContextGarbage`: valid shape, ids not in the state, an out-of-set `loyaltyRead`, and a 4 KB padding field. The validator must reduce it to a legal briefing.

No network, no key, no vendor id in the tree. Timeout 2,000 ms (from `ai-brain.md`; proposed, stubs never reach it). The reader counts against pilot A's cap as part of the same call, not separately.

## 5. Determinism and replay

- The reader runs only inside `consultTaxStep`, after the cap check, so the flag off or `context` unset is pilot A exactly.
- Its output enters the world only through the brain's choice, which is already on `tax-rate-set` and applied by `applyEvent`. The reducer does not read `data.ai` or `data.ai.context`.
- `data.ai` is event data. With the brain on `stubAgree` the event's world-visible fields equal the scorer's, so the briefing can change event bytes only for runs where the flag is on, and `stateHash` covers world state only (M33).
- Replay and `WorldStore.recover` apply recorded events and never call either role. The briefing is recorded, so the brain's call never needs to be re-run to know what it saw.
- No draw on any stream. Sorting is by id, so the serializer is order-stable.

## 6. Tests (`tests/ai-pilot-b.test.ts`)

1. **Off is off.** 72 ticks, seeds 1847 / 2718 / 4096: `context` unset matches the golden fixture; flag off matches.
2. **Agree stays identical.** Brain `stubAgree` with each context stub: the 1,200-tick `stateHash` equals the flag-off hash (`c4d99822` / `738181c0` / `cbd66565`).
3. **Recorded.** Every `data.ai` has a non-null `context` whose `briefing` passes `validateBriefing` and is ≤ 1,024 bytes.
4. **Garbage reduced.** `stubContextGarbage`: no unknown id survives, `droppedIds > 0`, size ≤ cap, brain still answers, hash equals test 2.
5. **Failure falls back.** Each `stubContextFail` mode: `outcome: "fallback"` with the right reason, briefing = serializer output, hash equals test 2.
6. **Read-only.** `canonicalJson(world)` is equal before and after `buildTaxStepBriefing` and after each stub's `read`.
7. **Replay never calls.** A counting reader and a counting brain: `WorldStore.recover` from a snapshot reaches the live hash with both counts unchanged.
8. **Calls.** The reader count equals the brain count: 33 / 27 / 30 on the agree stub at 1,200 ticks.

## 7. Pass criteria

| Criterion | Pass |
| --- | --- |
| Flag off | 72-tick golden fixture and 1,200-tick hashes byte-identical to `7531ffc` |
| Agree + any context stub | 1,200-tick hashes equal flag off |
| Reader calls | Equal to pilot A calls, 33 / 27 / 30, and zero during replay or recovery |
| Briefing | Every recorded briefing valid and ≤ 1,024 bytes; no unknown id |
| Read-only | World unchanged by the reader (test 6) |
| Fallbacks | Every mode records its reason and the serializer briefing |
| Suite | `npm test` passes |
| Estimated vendor cost | Not spent. If later wired to Jev: 33 × 1,500 tokens (**assumed** in `ai-brain.md`) = 49,500 × $0.042 / M = **$0.0021** per run, estimate |

## 8. Defaults

1. The reader runs only before a pilot A provider call. No call, no briefing.
2. Cap 1,024 bytes; truncation order as section 2.
3. Top 3 grudges and top 3 allies; all knowledge entries (4 at every measured call).
4. Stale means `ageTicks > 24`, one tax clock.
5. Fallback is the deterministic serializer, never "no briefing".
6. The context reader shares pilot A's per-run cap (default 50).
7. Stubs only until Micah picks a vendor and supplies a key.
