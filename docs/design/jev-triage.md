# Jev triage: reworded Nouls, labelled set, escalation to DeepSeek (slice 5)

Status: **Open / build spec; probe run; threshold ruled 0.6.** The live probe ran on 2026-10-31 (21:56 PT) after Micah approved the spend: 29 calls, $0.0008005 (results in section 6). The set was rebuilt on main `0cadb85` (#154 pins + #155). Base `origin/main` `56bde48` (#144). Aligned with slice 1 (`feature/ai-tax-weighted` **`7636a40`**), slice 3 (`jev-action-picker.md`) and slice 4 (`jev-social-picker.md`). `engine.ts:N` cites main; `@7636a40 file:N` cites that branch; `jev-capabilities.md` cites branch `docs/jev-capabilities` `6071c7a`; `ai-providers.md` cites branch `docs/ai-providers` (also at `@7636a40 docs/design/ai-providers.md`).

## 1. The reworded questions

**The four hard tests** (`ai-brain.md:43–46`): (1) changes who holds a port or puts a port's holding at stake; (2) sets a faction-wide number; (3) changes a person's allegiance or freedom; (4) breaks a promise by choice (contract breach with cause `choice` / `better-motive`).

**The probe's miss.** P4 sent four Nouls on the tick-168 tax-step event (`docs/playtests/jev-probes-2026-10-31/probes.jsonl` line 6) and got port_holding 0.57, **faction_number 0.09**, allegiance_freedom 0.74, broken_promise 0.20 (`jev-capabilities.md:162`). Reading the recorded request:
- The question asked whether the event *"change[s]* a faction-wide number such as a tax rate or treasury". The event was a **hold** (`"finalChoice": "hold"`, `"applied": false`), so "change" was literally false. The test is whether a number is **decided**, including kept.
- The state did not name the decision: it carried a briefing (grudges, allies, ports with garrisons) and no `kind` or options. Port and allegiance material in the briefing plausibly drew the 0.57 and 0.74 false positives (our reading, not verified).

**Fixes.** (a) Ask whether the situation *decides* the thing, and say a kept value counts. (b) Send a `situation` with an explicit `kind`, the actor, and the decision's facts or legal options; no briefing. (c) Give each Noul its clear exclusions.

**Exact wording** (as in the probe script, §3):

| Id | `type` | `instructions` |
| --- | --- | --- |
| `port_holding` | `noul` | Could the outcome of this situation change which faction or person holds a port, for example a raid, an assault, a surrender claim or a secession? Answer no for ordinary travel, trade, rest or work, even when it happens in a port, and no when the fight that decided a port is already over. |
| `faction_number` | `noul` | Does this situation decide a number that applies to a whole faction, such as its tax rate, and does that count even when the decision is to keep the number unchanged? A single person's trade, wage, purchase, ransom or contract payment is not faction-wide. |
| `allegiance_freedom` | `noul` | Does this situation decide whether a person changes which faction they serve, or whether a person is captured, held or released? A grudge, a mood or a relationship change on its own is not enough. |
| `broken_promise` | `noul` | Does this situation involve someone choosing not to keep an agreement they had already accepted, when they could have kept it? Answer no if they failed only because they could not pay or could not reach it, and no if they kept it or simply declined to accept it. |

A Noul answer is one probability of "yes", `noul` in [0, 1], with no `confidence` (`jev-capabilities.md:43,53`).

**Threshold.** A test flags when `noul ≥ 0.6`; triage flags when any of the four flags. **0.6 is ruled** (Lead, 2026-10-31; §6), lowered from `ai-brain.md`'s original 0.8 because recall matters more than precision for a gate that can only add escalations (`ai-brain.md:166`) and is budget-capped, and from the proposed 0.7 for margin: both desertions scored exactly 0.70. The probe reported 0.5, 0.7 and 0.8; the 0.6 figures are recomputed from its recorded log. Proposed probe pass: recall ≥ 0.75 and precision ≥ 0.75 per test at the chosen threshold, and `faction_number` ≥ 0.6 on item 29 (the P4 miss). With 4–8 positives per test these are coarse; one item moves recall by 0.125–0.25.

## 2. The labelled set

`docs/playtests/jev-triage-set/set.jsonl`, **29 items**. **Labels are proposed by the Researcher, for the Lead to confirm.** Each line has the exact `state` sent, its `source`, the four labels and a rationale.

- Items 1–28: offline flag-off runs at 1,200 ticks on seeds 1847, 2718, 4096. Logs made at `5c57c6d`; the sim is identical on `56bde48` (`git diff --stat 0bed4c5 56bde48 -- src` is empty), end hashes `f80c529f` / `2b5060c0` / `e8ae4443`. Selection: the first event in log order matching each rule.
- Item 29: the recorded P4 tax-step hold (live-1847-240, via `probes.jsonl` line 6), rebuilt in the new `situation` shape.
- `decision` items list the recorded top six candidates (`engine.ts:3999`) with score > −1000; the full legal list is not on the event.
- Breach causes come from `breachCause` (`engine.ts:3877–3886`). Across the three runs: `choice/better-motive` 35 / 22 / 46, `choice/deadline-infeasible` 4 / 2 / 17, `choice/consumed` 1 / 0 / 4, `purse/passage` 7 / 0 / 18, `purse/buy` 0 / 0 / 1. Only `better-motive` is labelled positive (`ai-brain.md:46`). `deadline-infeasible` is labelled a hard negative even though its cause is `choice`; the Lead should confirm that reading.

**Summary.**

| Test | Positives | Negatives | Positive items |
| --- | ---: | ---: | --- |
| port_holding | 8 | 21 | 01, 02, 07, 10, 17, 18, 19, 26 |
| faction_number | 4 | 25 | 03, 11, 20, 29 |
| allegiance_freedom | 8 | 21 | 02, 04, 05, 12, 13, 18, 21, 22 |
| broken_promise | 4 | 25 | 06, 14, 15, 23 |
| all four negative | 7 | — | 08, 09, 16, 24, 25, 27, 28 |

Columns P N A B below are port_holding, faction_number, allegiance_freedom, broken_promise.

| Id | Seed | Tick | Source | Case | P N A B | Rationale |
| --- | ---: | ---: | --- | --- | --- | --- |
| triage-01 | 1847 | 48 | `settlement-claimed` seq 5688 | claim | 1 0 0 0 | A settlement changes holder (claimed by surrender); no allegiance, rate or promise decided. |
| triage-02 | 1847 | 768 | `secession-declared` seq 102071 | secede | 1 0 1 0 | A port leaves its faction for a new one and followers change allegiance with it. |
| triage-03 | 1847 | 144 | `tax-rate-set` seq 17063 | tax | 0 1 0 0 | A faction tax rate is set; that is a faction-wide number, nothing else. |
| triage-04 | 1847 | 372 | `character-deserted` seq 45249 | desert | 0 0 1 0 | A member leaves their faction: allegiance changes; no port, rate or contract. |
| triage-05 | 1847 | 173 | `character-captured` seq 20534 | capture | 0 0 1 0 | A person loses their freedom; the battle is over, so no port holding is decided here. |
| triage-06 | 1847 | 165 | `contract-breached` seq 19562 | breach-choice | 0 0 0 1 | An accepted contract is broken for a better motive (cause choice / better-motive, engine.ts:3882): a promise broken by choice. |
| triage-07 | 1847 | 0 | `decision-made` seq 19 | raid-legal | 1 0 0 0 | A raid or surrender claim on the hostile port is a legal option, so the port's holding is at stake (ai-brain.md section 1, test 1). |
| triage-08 | 1847 | 300 | `decision-made` seq 35723 | routine | 0 0 0 0 | Only routine actions are legal (rest, work, trade, travel, buy, recruit). Clear negative on all four. |
| triage-09 | 1847 | 190 | `contract-fulfilled` seq 22489 | fulfil | 0 0 0 0 | A contract is kept. Clear negative on all four. |
| triage-10 | 2718 | 48 | `settlement-claimed` seq 5687 | claim | 1 0 0 0 | A settlement changes holder (claimed by surrender); no allegiance, rate or promise decided. |
| triage-11 | 2718 | 72 | `tax-rate-set` seq 8575 | tax | 0 1 0 0 | A faction tax rate is set; that is a faction-wide number, nothing else. |
| triage-12 | 2718 | 77 | `character-captured` seq 9199 | capture | 0 0 1 0 | A person loses their freedom; the battle is over, so no port holding is decided here. |
| triage-13 | 2718 | 161 | `captivity-released` seq 19331 | release | 0 0 1 0 | A captive is freed on ransom terms; one payment, not a faction-wide number. |
| triage-14 | 2718 | 53 | `contract-breached` seq 6254 | breach-choice | 0 0 0 1 | An accepted contract is broken for a better motive (cause choice / better-motive, engine.ts:3882): a promise broken by choice. |
| triage-15 | 2718 | 1019 | `contract-breached` seq 132890 | breach-choice | 0 0 0 1 | An accepted contract is broken for a better motive (cause choice / better-motive, engine.ts:3882): a promise broken by choice. |
| triage-16 | 2718 | 500 | `decision-made` seq 63009 | routine | 0 0 0 0 | Only routine actions are legal (rest, work, trade, travel, buy, recruit). Clear negative on all four. |
| triage-17 | 2718 | 468 | `decision-made` seq 58592 | raid-legal | 1 0 0 0 | A raid or surrender claim on the hostile port is a legal option, so the port's holding is at stake (ai-brain.md section 1, test 1). |
| triage-18 | 4096 | 409 | `secession-declared` seq 53191 | secede | 1 0 1 0 | A port leaves its faction for a new one and followers change allegiance with it. |
| triage-19 | 4096 | 212 | `settlement-claimed` seq 26279 | claim | 1 0 0 0 | A settlement changes holder (claimed by surrender); no allegiance, rate or promise decided. |
| triage-20 | 4096 | 48 | `tax-rate-set` seq 5642 | tax | 0 1 0 0 | A faction tax rate is set; that is a faction-wide number, nothing else. |
| triage-21 | 4096 | 162 | `character-deserted` seq 19721 | desert | 0 0 1 0 | A member leaves their faction: allegiance changes; no port, rate or contract. |
| triage-22 | 4096 | 104 | `captivity-released` seq 12416 | release | 0 0 1 0 | A captive is freed on ransom terms; one payment, not a faction-wide number. |
| triage-23 | 4096 | 632 | `contract-breached` seq 84733 | breach-choice | 0 0 0 1 | An accepted contract is broken for a better motive (cause choice / better-motive, engine.ts:3882): a promise broken by choice. |
| triage-24 | 4096 | 137 | `contract-breached` seq 16560 | breach-purse | 0 0 0 0 | An accepted contract fails with cause "purse": passage or purchase unaffordable (engine.ts:3880–3881), not by choice. Hard negative for test 4. |
| triage-25 | 4096 | 176 | `contract-breached` seq 21563 | breach-infeasible | 0 0 0 0 | Breach recorded as cause choice / deadline-infeasible (engine.ts:3885): the deadline could not be met, so not broken by choice. Hard negative for test 4. |
| triage-26 | 4096 | 708 | `decision-made` seq 94964 | raid-legal | 1 0 0 0 | A raid or surrender claim on the hostile port is a legal option, so the port's holding is at stake (ai-brain.md section 1, test 1). |
| triage-27 | 4096 | 900 | `decision-made` seq 120500 | routine | 0 0 0 0 | Only routine actions are legal (rest, work, trade, travel, buy, recruit). Clear negative on all four. |
| triage-28 | 4096 | 1000 | `decision-made` seq 134085 | routine | 0 0 0 0 | Only routine actions are legal (rest, work, trade, travel, buy, recruit). Clear negative on all four. |
| triage-29 | 1847 | 168 | P4 probe, tax step | tax-hold | 0 1 0 0 | The holder decides the faction tax step and holds it: still a faction-wide number decided (the P4 miss, faction_number 0.09). |

**Shape of one `state`** (item 06):

```json
{"situation":{"tick":165,"kind":"contract-breached","actorId":"character-06","targetId":"character-02","settlementId":"crown-harbor",
 "facts":{"contractId":"supply-crown-harbor-160","buyerId":"character-02","carrierId":"character-06","good":"provisions","quantity":10,"price":56.25,"deadlineTick":165,"acceptedTick":161,"status":"breached","cause":"choice","causeDetail":"better-motive"}}}
```

Request sizes, measured by the probe's dry run: 1,434–1,731 bytes per request, 45,871 bytes in total.

## 3. The probe script (not committed; run 2026-10-31)

Path: **`/workspace/jev-triage-probe-main/probe.mjs`** (re-pointed copy of `/workspace/jev-triage-probe/probe.mjs`) on the box, beside `set.jsonl` and `build.py` (the set builder).

- **Default is a dry run.** It builds every request, checks the caps and writes `dry-log.jsonl`. It never touches the network. Live mode needs `--live` and `JEV_API_KEY` in the environment, and refuses without the key.
- **One request per item**: `{model: "jev-1.14.0", state, questions: {the four Nouls}}` to `POST https://api.typesafe.ai/v1/systemone` (`@7636a40 src/sim/ai-vendor/jev.ts:6–7`). Each item is sent once, with no retry and a 2,000 ms timeout.
- **Hard caps**, checked before each call: **30 calls** and **$0.01**, with worst case = request UTF-8 bytes × $0.042 / M, the rule in `jev-capabilities.md` §9 and `ai-providers.md` §6. Output is free (`@7636a40 cost.ts:14–19`). A capped item is logged as `cap` and not sent.
- **Key-safe logs.** The key goes only in the `Authorization` header and is never written, printed or hashed. `live-log.jsonl` records the request body, status, latency, response model, tokens, cost and running spend.
- **Scoring.** Per test at thresholds 0.5, 0.7 (the probe's primary when it ran; the ruled 0.6 is recomputed in §6) and 0.8: TP, FP, FN, TN, missing, precision and recall against the proposed labels.

**Cost estimate (not run):**
- **Worst case:** 45,871 bytes × $0.042 / M = **$0.0019** for 29 calls, under both caps.
- **Expected (estimate):** P4's ratio of 684 tokens to 1,099 request bytes (`probes.jsonl` line 6) is 0.622 tokens per byte, so 45,871 × 0.622 ≈ 28,500 tokens × $0.042 / M ≈ **$0.0012**.

## 4. The escalation path to DeepSeek

**4.1 When triage fires.** Only on a routine picker consult (slices 3 and 4). It never fires when a hard test already decides:
- The tax step goes to the brain path of slice 1.
- A legal list containing `raid` or `claim-settlement` goes straight to the brain (`ai-brain.md:48`; slice 3 skip rule).
- Haul and fewer than 2 legal options keep slice 3's skips; no triage.

The four Nouls ride on the picker's own Jev request as extra questions against the same `state` (`ai-brain.md:159`; any number of questions per request, `jev-capabilities.md:38`), so they add no request. The picker's `state` gets a `situation` block `{tick, kind: "decision", actorId, settlementId, facts: {legalOptions}}` in §2's shape.

**4.2 Scores to escalation.** Escalate when all of these hold:
- any `noul ≥ 0.6` (§1);
- the run's triage budget of **50** is not spent (`ai-brain.md:169`);
- the actor has not been triage-escalated in the last **24** ticks (`ai-brain.md:169`).

The flag is deterministic given the recorded `noul` values. No draw is used: a seeded draw against `noul` (`jev-capabilities.md:79`) would add a stream for no gain on a capped gate. Triage can only add an escalation (`ai-brain.md:166`).

**4.3 The brain request.** DeepSeek chat completions in the `ai-providers.md` shape (`ai-providers.md:36–56`): `POST https://api.deepseek.com/chat/completions` (`@7636a40 src/sim/ai-vendor/deepseek.ts:8`), model `deepseek-v4-pro` (`:9`), `thinking: {type: "disabled"}`, `response_format: {type: "json_object"}`, `temperature: 0`, `stream: false`, `max_tokens` = `DEEPSEEK_MAX_TOKENS` = 64 (`deepseek.ts:10`; the doc's 32 was raised on the branch).
- **System:** `Answer as JSON: {"choice":"<option id>"}.` (the `DEEPSEEK_SYSTEM` pattern, `deepseek.ts:11`).
- **User:** a fixed template filled with the actor's persona and purse, the Pilot B briefing (`@7636a40 ai-context.ts:45`, ≤ 1,024 bytes, `:32`), the slice-4 `social` block when present, the legal option ids (slice 3 §2), and the tests that flagged (`"flagged": ["port_holding"]`). It ends "Reply with one option id from the list as JSON."
- The template is hashed into `brainPromptVersion`.

**4.4 Rails and fallback.**
- **Legal ids only.** The parsed `choice` must be one of the legal ids. Anything else is `illegal`, as is `finish_reason: "length"` (`ai-providers.md:55`).
- **Fallback order** (`ai-brain.md:170`): on timeout (30,000 ms brain timeout, `ai-providers.md:87`), error, illegal answer or cap, use the picker's sampled answer, then `candidates[0]`. There is no retry within a tick (`ai-providers.md:91`).
- **Context reader.** Runs first when an escalation is decided (`ai-brain.md:198`). It reuses slice 4's read cache; a failed read sends `social: null`.

**4.5 Record and replay under `data.ai`.** On the `decision-made`:

```json
"ai": {
  "picker": { "…": "slice 3 §6" },
  "triage": { "promptVersion": "sha256:…", "noul": { "port_holding": 0.81, "faction_number": 0.04, "allegiance_freedom": 0.12, "broken_promise": 0.02 },
              "threshold": 0.6, "flagged": ["port_holding"], "budgetLeft": 49, "cooldownUntilTick": 436, "escalated": true },
  "brain": { "provider": "deepseek", "model": "deepseek-v4-pro", "promptVersion": "sha256:…", "inputHash": "sha256:…",
             "raw": "{\"choice\":\"travel:glassport:-\"}", "choice": "travel:glassport:-", "outcome": "model", "fallbackReason": null }
}
```

Values are shape only.
- When escalated, `data.chosen` is the brain's row (or the fallback's). The world sees only the chosen row, and the reducer reads `goal` (`src/sim/state.ts:792–795`).
- Replay follows slice 1 (`@7636a40 src/sim/ai-replay.ts:33`): match `inputHash` and reuse the recorded `noul` values and brain `raw`. **No vendor is called on replay.** Budget and cooldown are recomputed from the recorded flags in event order and must match the recorded `budgetLeft`. `WorldStore.recover` uses `applyEvent` only.

**4.6 Caps and cost** (estimates; the arithmetic is shown).

| Item | Cap | Estimate |
| --- | --- | --- |
| Triage Noul tokens, holder only (slice 3 scope) | inside slice 3's spend cap | The questions are 1,209 bytes of JSON × 0.622 tokens per byte (P4 ratio) ≈ 752 tokens per call. Over 930 holder picks (slice 3 max, an upper bound) that is 699,360 tokens × $0.042 / M = **$0.029** |
| Triage on all Free Tide picks (slice 4 scope) | would breach slice 4's $0.35 | 7,211 × 752 = 5,422,672 tokens × $0.042 / M = **$0.228** on top of slice 4's ≈ $0.28. **Not proposed** until the probe sets the wording and someone shortens it. `ai-brain.md:159`'s assumption of 30 tokens per question is too low for these wordings |
| Brain calls | **50 per run** (triage budget), 30,000 ms each | — |
| Brain spend | **$0.25 per run** (`DEFAULT_SPEND_CAP_USD`, `@7636a40 cost.ts:22`), checked before each call with `deepSeekWorstCaseUsd` (`deepseek.ts:100–101`) | 2,000 assumed input tokens (`ai-providers.md:128`) × $1.32 / M + 64 × $3.96 / M (peak, `cost.ts:7–11`) = $0.002893 per call; 50 × that = **$0.145** at most |
| Cost lines | one per Jev and DeepSeek call | roles `picker.action` (the triage rides on it, with `triageQuestions: 4` added) and `brain.escalation`, with the `CostLine` fields of `@7636a40 cost.ts:45`. Keys are never logged (`ai-providers.md` §4) |

**4.7 Gate (offline first; live only after Micah confirms the spend).**
1. **Probe:** precision and recall at the chosen threshold meet §1's proposed pass, and item 29 flags `faction_number`.
2. Flag off: the fixtures `6efa334f` / `e8f9cfab` / `8ac8529b` and the 1,200-tick hashes `f80c529f` / `2b5060c0` / `e8ae4443` are unchanged.
3. A triage stub that never flags gives the same hash as picker-only (slice 3 with the same stub picks).
4. A stub that always flags: exactly min(50, eligible) escalations, cooldown respected, every brain `choice` legal or fallen back, with zero rail breaks.
5. Replay is exact with zero vendor calls (counting `fetch` and `tests/helpers/no-network.ts`).
6. Readout: `npm run dynamism -- --events triage.jsonl --baseline picker.jsonl`.
   - `firstDivergentTick` is not null whenever an escalation changed `chosen`.
   - The holder's `entropyBits` is not below the picker-only run. This is proposed: the brain should not collapse variety.
   - Report escalations per test and the share where the brain's choice differs from the picker's sample.
7. Caps hold (≤ 50 brain calls, ≤ $0.25 brain spend, one cost line per call), and `npm test` passes.

**Stub tests** (`tests/jev-triage.test.ts`, importing the no-network guard):
- question wording and threshold constants;
- the flag rule at 0.59, 0.60 and 0.61;
- budget and cooldown;
- no triage under a hard test;
- illegal or `length` brain answers fall back;
- the fallback order;
- the record shape;
- replay with zero calls;
- caps;
- items 2–3 of the gate.

## 5. Who decides

Running the probe (≤ 30 calls, ≤ $0.01, estimated $0.0012) and any live triage or brain run wait for Micah's spend confirmation via the Lead. The Lead confirms the labels and the threshold.

## 6. Probe results (2026-10-31)

**Run.** `node probe.mjs --live` on the box, model `jev-1.14.0`, set rebuilt from offline AI-off 1,200-tick runs of seeds 1847 / 2718 / 4096 on main `0cadb85` (the sources and ticks are in `docs/playtests/jev-triage-set/set.jsonl`; same picking rules and labels as before, but the ticks moved with the #154 pins). Caps 30 calls / $0.01, checked before each call. **29 calls, all HTTP 200, 19,060 input tokens, $0.0008005 actual** (dry-run worst case $0.0019255). Latency 42–141 ms. Per-call log with cost and raw responses: `docs/playtests/jev-triage-set/live-log-2026-10-31.jsonl` (no key in it).

**Per test as run, with the original labels** (TP / FP / FN / TN; precision; recall). The ruled 0.6 with the new labels is under Rulings below:

| Threshold | port_holding | faction_number | allegiance_freedom | broken_promise |
|---|---|---|---|---|
| 0.5 | 8/0/0/21; 1.00; 1.00 | 4/2/0/23; 0.667; 1.00 | 8/0/0/21; 1.00; 1.00 | 4/2/0/23; 0.667; 1.00 |
| 0.7 (superseded) | 8/0/0/21; 1.00; 1.00 | 4/2/0/23; 0.667; 1.00 | 8/0/0/21; 1.00; 1.00 | 4/0/0/25; 1.00; 1.00 |
| 0.8 | 7/0/1/21; 1.00; 0.875 | 4/2/0/23; 0.667; 1.00 | 6/0/2/21; 1.00; 0.75 | 4/0/0/25; 1.00; 1.00 |

**Per item (triage escalates when any test flags; 22 of 29 items have at least one true label):**

| Threshold | Escalations | Correct | False escalations | Missed items |
|---|---|---|---|---|
| 0.5 | 22 | 22 | 0 | none |
| 0.7 (superseded) | 22 | 22 | 0 | none |
| 0.8 | 19 | 19 | 0 | triage-01 claim (port 0.79), triage-04 and triage-21 desert (allegiance 0.70 each) |

- The per-test false positives are both secessions (triage-02, -18): faction_number 0.94 / 0.91 at every threshold, and broken_promise 0.68 / 0.62 at 0.5. Both items are true escalations anyway, so no extra brain call results. Whether a secession "decides a faction-wide number" (the new faction's tax rate) is a labelling question for the Lead.
- **Item 29 (the P4 miss) is fixed:** faction_number 0.97 (was 0.09).
- Clear negatives (routine, fulfil, purse and deadline-infeasible breaches) all stay ≤ 0.30 on every test.
- **Margin warning:** both deserts score exactly 0.70 on allegiance_freedom, so at 0.7 they pass by zero margin. 0.5 catches them with room and adds no false item escalation on this set.

**Rulings (Lead, 2026-10-31).**

1. **Threshold 0.6**, a margin argument. Both desertions score exactly 0.70 on allegiance_freedom, so at 0.7 any run-to-run drift flips them at random. The Lead's figure is drift of about ±0.02 on identical requests. Our own recorded repeats agree in size but are not Noul data: in `jev-capabilities.md` §9 (branch `docs/jev-capabilities` `6071c7a`, `docs/playtests/jev-probes-2026-10-31/probes.jsonl` lines 1–4), four identical requests returned the loyaltyRead Choice probability for "firm" as 0.60, 0.62, 0.58 and 0.59 (range 0.04), while grudge_0 stayed at 0.99. The triage probe sent each item once, so it has no repeat to measure Noul drift.
2. **A secession decides a faction-wide number** (the new faction's tax rate). triage-02 and triage-18 are relabelled faction_number = true in `docs/playtests/jev-triage-set/set.jsonl`.

**At 0.6 with the new labels** (recomputed from `live-log-2026-10-31.jsonl`, no new calls):

| Test | TP / FP / FN / TN | Precision | Recall | Lowest positive | Highest negative |
|---|---|---|---|---|---|
| port_holding | 8/0/0/21 | 1.00 | 1.00 | 0.79 (triage-01) | 0.21 (triage-21) |
| faction_number | 6/0/0/23 | 1.00 | 1.00 | 0.91 (triage-18) | 0.11 (triage-10) |
| allegiance_freedom | 8/0/0/21 | 1.00 | 1.00 | 0.70 (triage-04, -21) | 0.39 (triage-19) |
| broken_promise | 4/2/0/23 | 0.667 | 1.00 | 0.96 (triage-06 and others) | **0.68 (triage-02)**, 0.62 (triage-18) |

- **Items:** 22 escalations, all 22 true, no misses, no false escalations.
- **Margins at 0.6:** the nearest positive is 0.70 (the desertions), **+0.10**. The highest-scoring item that should not escalate is triage-25 (breach-infeasible, broken_promise 0.30), **−0.30**.
- **Note:** the two secessions also clear 0.6 on broken_promise (0.68 and 0.62), which they are not labelled for. They are per-test false positives, and 0.62 is only 0.02 above the line. They cost nothing extra, since both items escalate on three other tests, but the recorded `flagged` list will include broken_promise for them.

Superseded: the earlier proposal of 0.7 below.

**Earlier proposal (superseded): threshold 0.7.** It meets §1's pass (every test ≥ 0.75 recall; precision ≥ 0.75 on three tests, faction_number 0.667 from the secessions only) with zero missed and zero false item escalations. 0.8 misses three true escalations. 0.5 is the fallback if the desert margin proves fragile on fresh items. With 29 items this is coarse. The Lead sets the final value.

## 7. v3: no scoring call, and the brain does not pick (Lead rulings, 2026-10-31)

**The Jev scoring call is dropped for the gated kinds.** After v2 scoped triage to real decisions
(tax only when the scorer is not holding, desertion and secession only where the sim's own check
fires, claim only on a raid or claim-settlement pick, contract-break only on a real diversion), the
live flag rate was 100 % on every kind: the gated set *is* the probe's positive set, so the scoring
call added cost and latency and no selection. The sim's checks plus the per-kind budgets
(`TRIAGE_KIND_BUDGETS`) and the shared 24-tick cooldown are the triage. `jevTriageScorer` stays in
`src/sim/ai-vendor/jev.ts`, unhooked: `--triage jev` refuses; `--triage gated` (no scorer) is the
live mode. Records carry `scoreOutcome: "gated"` and the flagged tests are the kind's `KIND_TESTS`.

**The brain returns a proceed probability, not a choice** (the #145 tax pattern). It sees the sim's
choice and the one alternative and answers `{"proceed": p, "reason": …}`. The engine blends
`q = (1 − w)·prior + w·p` with `prior = 0.95`, `w = 0.3` and draws `u` from the stateless sha256
side stream `pickerDraw("triage-brain:<kind>", seed, actor, tick)`; it keeps the sim's choice when
`u < q`, else takes the alternative. p, reason, prior, weight, blend and u are recorded, and replay
checks them. Any fallback keeps the sim's choice. Tuned offline with `stubBrainLiveLike`
(see progress.md); acceptance is the v3 readout in `src/tools/triage-gate.ts` (`acceptanceCheck`).
