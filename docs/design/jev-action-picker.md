# Jev action picker for Free Tide's holder (slice 3)

Status: **Open / build spec.** Docs only. No live call was made. The Engineer builds it after `feature/ai-tax-weighted`.

- **Base.** `origin/main` `0bed4c5`.
- **Aligned with.** Slice 1 on `origin/feature/ai-tax-weighted` at **`7636a40`** ("AI tax weighted (variant b) …").
- **Code references.** Lines on main are cited as `engine.ts:N`. Lines on that branch are cited as `@7636a40 file:N`.

## 1. What slice 1 does, and what this slice copies

| Slice 1 at `7636a40` | Where | This slice |
| --- | --- | --- |
| The sim draws the choice and the vendor never picks: rails first, then a softmax over the legal options, then an inverse-CDF pick in a fixed order | `@7636a40 src/sim/ai-weighted.ts:89–132` | Same rails-then-sample order. The distribution comes from **Jev's recorded probabilities**, not from trait logits |
| The draw is a pure function of seed, faction and tick: `sha256("ai-tax-weighted:" + seed + ":" + factionId + ":" + tick)`, first 8 hex digits ÷ 2³² | `@7636a40 ai-weighted.ts:138–141`, called at `@7636a40 engine.ts:3683` | Same construction with its own label: `sha256("ai-pick:" + seed + ":" + actorId + ":" + tick)`. It never reads or writes `world.rngState` |
| Everything needed to redraw is recorded on the event's `data.ai.weighted`: params version, legal set, distribution, draw, sampled choice | `@7636a40 engine.ts:3720–3730` | `data.ai.picker` on the existing `decision-made` (section 6) |
| Replay answers from the recorded trace, keyed by request hash, and sends nothing | `@7636a40 src/sim/ai-replay.ts:33` | Same. The picker's recorded `probabilities` are reused, and Jev is never asked again |
| No network in tests | `@7636a40 tests/helpers/no-network.ts` | Imported by the new tests |

The draw is derived, not stored. A stateless hash per `(seed, actor, tick)` needs no new `WorldState` field, so the world, and therefore `stateHash`, cannot change when the flag is off. The holder makes at most one routine decision per tick (measured: max 1 per tick on all three seeds, section 2), so `(seed, actorId, tick)` is unique.

## 2. The legal-action list from the engine

**Where options are generated.** `buildCandidates(world, character, rng)` at `engine.ts:851–960`, called once per free autonomous character at `engine.ts:3961`, and today's pick is `candidates[0]` at `engine.ts:3962`. The rows are built as follows:

- **Always five fixed rows:** `rest`, `buy-provisions` (resource `provisions`), `work`, `recruit`, and `trade-local` (resource = dominant cargo or best local good). See `engine.ts:861–893`.
- **Travel rows:** one `travel` row per other settlement, from `travelCandidates` at `engine.ts:821–849`.
- **`claim-settlement`:** added when the port is hostile, troops are present and a claim is open (`engine.ts:897–908`).
- **`raid`:** added under the raid gate (`engine.ts:909–937`).
- **Score noise:** each row gets plan influence plus `rng.between(-3.5, 3.5)` from the **main** stream (`engine.ts:942`).
- **Illegal rows are marked, not removed:** they score `-1_000`. These are `buy-provisions` with an empty shelf or purse, `recruit` short of purse or arms, and unaffordable `travel` (`engine.ts:943–956`).
- **Sort:** by score, then action (`engine.ts:959`).

The `DecisionCandidate` shape is at `src/sim/types.ts:777–785`.

**Enumeration for the picker.** The picker reads the same array after the sort. `buildCandidates` and its `rng.between` draws run exactly as now, so the main stream is untouched (`ai-brain.md` section 2, item 3).

- **Legal** means `score > -1000`.
- **Stable option id** is `` `${action}:${targetId ?? "-"}:${resource ?? "-"}` ``, for example `travel:glassport:-`, `trade-local:-:arms` or `rest:-:-`.
- **Sampling order** is the legal ids sorted by `localeCompare`, not score order and not JSON key order.
- **Duplicate ids:** none were found on any measured decision (`dupIds: 0` below). If one ever occurs, the build should refuse to consult the picker for that decision and use `candidates[0]`.

**Measured.** Offline at `0bed4c5`, Node v24.22.1, with an uncommitted counter after `engine.ts:3961` in a scratch worktree, then removed. The end hashes equal flag off (`f80c529f` / `2b5060c0` / `e8ae4443`), so the counter changed nothing. Free Tide's holder `character-14` over 1,200 ticks:

| Seed | Consultations (= his `decision-made`) | Options per decision: min / median / max (histogram) | Legal options: min / median / max (histogram) | Active haul | Max per tick | Duplicate ids |
| ---: | ---: | --- | --- | ---: | ---: | ---: |
| 1847 | 853 | 8 / 8 / 9 (8: 834, 9: 19) | 3 / 6 / 9 (3: 369, 4: 8, 6: 162, 7: 267, 8: 39, 9: 8) | 0 | 1 | 0 |
| 2718 | 301 | 8 / 8 / 9 (8: 282, 9: 19) | 3 / 7 / 9 (3: 1, 5: 3, 6: 36, 7: 213, 8: 44, 9: 4) | 0 | 1 | 0 |
| 4096 | 930 | 8 / 8 / 9 (8: 921, 9: 9) | 3 / 3 / 9 (3: 645, 4: 13, 5: 34, 6: 42, 7: 113, 8: 80, 9: 3) | 0 | 1 | 0 |

- **Option count.** Typically 8 (five fixed rows plus three travel rows). It is 9 when `raid` or `claim-settlement` is present.
- **Legal count.** Often only 3, in 369 / 1 / 645 decisions. The design ceiling is far below Jev's 255 (`jev-capabilities.md` section 4).
- **Action kinds seen.** `buy-provisions`, `claim-settlement` (1847, 4096), `raid`, `recruit`, `rest`, `trade-local`, `travel` and `work`.

**Hauls and escalations.**

- **Haul.** When `activeHaul` can act (`engine.ts:3964–3983`), the contract path stays and the picker is not consulted. The count was 0 for the holder on these runs, but the rule keeps contract rulings intact.
- **Brain escalation.** `raid` and `claim-settlement` rows are brain escalations in `ai-brain.md` (section 1). Until slice 5 (triage to the brain) is built, a decision whose legal set contains either row is **not** sent to the picker and keeps `candidates[0]`. This also keeps rail breaks out of the big decisions.

## 3. The Choice question

**Endpoint and fields.** `POST https://api.typesafe.ai/v1/systemone` with a Bearer key, model pinned to `jev-1.14.0` (`@7636a40 src/sim/ai-vendor/jev.ts:6–7`; `ai-providers.md` section 2 on `docs/ai-providers`). The request has `model`, `state` and `questions`. There is no temperature or seed field (`jev-capabilities.md` section 2).

```json
{
  "model": "jev-1.14.0",
  "state": { "character": { "…": "section 4" }, "briefing": { "…": "Pilot B briefing" }, "situation": { "…": "section 4" } },
  "questions": {
    "next_action": {
      "type": "choice",
      "instructions": "You are this character. Given your temperament, purse, crew and what you know, which one of these actions would you most likely take now?",
      "criteria": {
        "rest:-:-": "Rest here to recover health and morale.",
        "work:-:-": "Work here for dependable local income.",
        "travel:glassport:-": "Sail to Glassport (passage affordable).",
        "trade-local:-:arms": "Trade arms in the local market."
      }
    }
  }
}
```

- **Criteria.** One entry per **legal** id. The key is the stable id and the value is a fixed sentence per action kind, with the target or resource name filled in from the world. Illegal rows are never offered.
- **Answer.** `answers.next_action` returns `choice` (the argmax, not used to decide), `probabilities` (one per option, summing to 1 at two decimals in the probes) and `confidence`. See `jev-capabilities.md` section 2 and the section 9 "Sums" finding.
- **Wording is pinned.** The template and the criteria sentences are hashed into `promptVersion`, as `CONTEXT_PROMPT_VERSION` is (`@7636a40 ai-context.ts`).

## 4. Trait and briefing inputs, and the size cap

- **`character`:** `id`, the `personality` block (ambition, aggression, caution, loyalty, curiosity, commerce; `types.ts` `Personality`), `health`, `morale`, `money`, `troops.count`, cargo provisions, `currentGoal`, and plan intent if any. Numbers are rounded to two decimals.
- **`briefing`:** Pilot B's serializer output, reused unchanged: `buildTaxStepBriefing(world, holderId)` (`@7636a40 ai-context.ts:45`), validated by `validateBriefing` (`@7636a40 ai-context.ts:99`). It carries morale, loyalty, top-3 grudges and allies, known ports with age, and stale ports.
- **`situation`:** the current port id and its holder faction, and the faction's rate and treasury (public, `leader-tax.md`).
- **Cap.** The `state` may be at most **2,048 bytes** of canonical JSON. That is a proposed default: the briefing alone is capped at 1,024 (`@7636a40 ai-context.ts:32`, measured max 625 in `ai-pilot-b.md`). Over the cap, drop `situation`, then the briefing's `knownPorts` from the oldest, as Pilot B's truncation order does. Record `truncated: true`.

## 5. Sampling and rails

1. Build the legal id list (section 2). If it has fewer than 2 ids, or contains `raid` or `claim-settlement`, or a haul can act, do not consult. Today's path runs, nothing is recorded, and nothing is counted.
2. Ask Jev (or the stub). Take `probabilities`.
3. **Rails.**
   - Keep only keys that are legal ids. Drop non-finite values and values outside [0, 1].
   - Renormalize over the legal ids in sort order.
   - If the kept sum is 0, or the answer is an error, timeout (2,000 ms, `@7636a40 ai-context.ts:213`), cap or malformed, **fall back to `candidates[0]`**, today's pick. Record the fallback reason (`timeout`, `error`, `illegal`, `cap`).
4. **Draw** `u = pickDraw(seed, actorId, tick)` (section 1) and walk the cumulative sum in id order. If rounding leaves no pick, take the last id, as `sampleChoice` does (`@7636a40 ai-weighted.ts:125–132`).
5. The sampled row becomes `chosen`, the same object from `candidates`, so `resolveDecision` (`engine.ts:4003`) and the `decision-made` emit (`engine.ts:3985`) run unchanged.

**Flag off is byte-identical.**

- With `TickOptions.ai.picker` unset, steps 1–5 never run, the row is `candidates[0]`, and no `data.ai` is written.
- With the flag on and a stub that puts all mass on `candidates[0]`'s id, the world is identical, because the draw is outside `rngState`. The only addition is `data.ai` on the event, which the reducer ignores: the `decision-made` reducer reads only `goal` (`src/sim/state.ts:792–795`).
- A different sampled row changes the world on purpose (AI on).

## 6. Record and replay format

On the holder's `decision-made`, `data.ai.picker` holds:

```json
{
  "role": "picker.action",
  "provider": "jev", "model": "jev-1.14.0", "responseModel": "jev-1.14.0",
  "promptVersion": "sha256:…", "inputHash": "sha256:…",
  "legal": ["rest:-:-", "trade-local:-:arms", "travel:glassport:-", "work:-:-"],
  "probabilities": { "rest:-:-": 0.1, "trade-local:-:arms": 0.2, "travel:glassport:-": 0.6, "work:-:-": 0.1 },
  "probabilitySum": 1.0, "confidence": 0.47,
  "distribution": { "…": "renormalized, 6 decimals" },
  "draw": 0.4127, "sampled": "travel:glassport:-", "scorerPick": "work:-:-",
  "outcome": "model", "fallbackReason": null, "truncated": false, "latencyMs": 0
}
```

The values above are shape only.

- **Recorded probabilities only.** Jev returns different probabilities for identical requests: firm 0.58–0.62 over four repeats (`jev-capabilities.md` section 9, P2). Replay must therefore never ask Jev again.
- Replay rebuilds the request, matches `inputHash`, takes the recorded `probabilities`, and recomputes `distribution`, `draw` and `sampled`. A mismatch on `sampled` is a replay failure.
- `WorldStore.recover` applies the recorded `decision-made` events through `applyEvent` and needs no provider at all.
- Holds have no analogue here. Every consult emits a `decision-made` already.

## 7. Caps and the cost line

- **Call cap:** 1,000 per run. The measured maximum is 930 (4096). Past the cap the fallback is `cap`, with `candidates[0]`.
- **Spend cap:** **$0.05 per run**, through the existing `CostLedger.wouldExceed` (`@7636a40 src/sim/ai-vendor/cost.ts:74–86`). The worst case per call is request bytes × $0.042 / M (`jevCostUsd`, `@7636a40 cost.ts:41`; `ai-providers.md` section 6).
- **Cost line:** one `CostLine` per call (`@7636a40 cost.ts:45`) with `role: "picker.action"` and the existing fields (`tick`, `provider`, `model`, `responseModel`, `tokensIn`, `tokensOut`, `estimatedCostUsd`, `priceSource`, `priceCheckedOn`, `status`, `outcome`, `fallbackReason`, `runSpendUsd`).
- **Estimate.** At the P3 probe's 807 input tokens for a 10-option Choice (`jev-capabilities.md` section 9), 930 × 807 × $0.042 / M = **$0.032** per run at most. Output is free. Real `state` size is unmeasured until built.

## 8. Pass gate

All of the following, on seeds 1847, 2718 and 4096 at 1,200 ticks.

1. **Hashes unchanged with the flag off.** The 72-tick fixture `6efa334f` / `e8f9cfab` / `8ac8529b` and the 1,200-tick `f80c529f` / `2b5060c0` / `e8ae4443` (`dynamism-readout.md` baseline).
2. **Argmax stub equals flag off.** A stub that puts all mass on `candidates[0]` gives the flag-off 1,200-tick hash.
3. **Replay is exact.** Each AI-on run (stubs offline; vendor only after approval) replays from its recorded `data.ai.picker` to the live `stateHash` exactly, with zero provider calls, counted by a counting stub and the no-network guard.
4. **No rail breaks.** Every recorded `sampled` is in its `legal` list. No consult happens with `raid` or `claim-settlement` legal or with a haul able to act. Zero events are sampled from a `-1000` row.
5. **Action variety goes up for the holder.** Run `npm run dynamism -- --events ai.jsonl --baseline off.jsonl`. `character-14`'s `entropyBits` must exceed the flag-off baseline, and `firstDivergentTick` must not be null. Baseline at `0bed4c5`, from the readout: 2.0115 bits over 8 kinds (1847), 2.3385 over 7 (2718), 1.9484 over 8 (4096).
   - The live gate uses Jev.
   - The offline gate uses `stubUniform`. Its expected rise follows from sampling uniformly over the 3–9 legal rows instead of always the top row.
6. **Caps hold.** Calls ≤ 1,000 and spend ≤ $0.05, with one cost line per call.
7. **`npm test` passes offline.**

## 9. Stub tests (`tests/jev-action-picker.test.ts`, importing `tests/helpers/no-network.ts`)

1. **Option ids.** Ids are stable and sorted, and legal excludes `-1000` rows. A fixture world gives the expected id list.
2. **Flag off.** With the picker unset, the 72-tick fixture and a 1,200-tick hash on one seed match. No `data.ai.picker` appears anywhere.
3. **`stubArgmax`.** The 1,200-tick hash equals flag off. Every record has `sampled === scorerPick`.
4. **`stubUniform`.** The run is deterministic across two runs, every `sampled` is legal, and the holder's entropy exceeds flag off on the same seed.
5. **Draw.** `pickDraw` is a pure function in [0, 1), and differs by actor and by tick.
6. **Rails.** `stubGarbage` returns unknown ids, NaN, negatives, a zero sum and an argmax on an illegal id. Every case drops to legal ids or falls back to `candidates[0]` with `illegal`.
7. **Failures.** `stubFail` timeout, error and cap each fall back with the right reason, and the cost line shows 0 tokens.
8. **Skips.** With `raid` or `claim-settlement` legal, or a haul able to act, there is no consult and no record.
9. **Replay.** A `stubUniform` run's records replay to its hash with zero provider calls, and `WorldStore.recover` mid-run matches.
10. **Cap.** Past the call cap or the spend cap the fallback is `cap`. The cost ledger never exceeds the cap.

## 10. Who decides

Any vendor run, the key and the spend need Micah's go-ahead. Stubs are the default.
