# Jev capabilities: what TypeSafe's Jev can do, and where it fits in Open Era

Status: Open / research map. The first version made no API calls; section 9 records the six probe calls Micah approved on 2026-10-31. Base: `feature/ai-providers` d14323b.

Every claim is tagged **[verified: source]** or **[unverified]**. Doc sources were all checked on 2026-10-31. "Live run" means `/workspace/open-era/simulation-output/ai-providers/live-1847-240` (seed 1847, 240 ticks, `summary.json`, `cost.jsonl`, `trace.json`), the first vendor run on `feature/ai-providers` d14323b.

## Sources (all checked 2026-10-31)

| Ref | URL |
|---|---|
| D-intro | https://docs.typesafe.ai/introduction.md |
| D-s1 | https://docs.typesafe.ai/concepts/system-one.md |
| D-ucm | https://docs.typesafe.ai/concepts/use-case-map.md |
| D-primer | https://docs.typesafe.ai/introduction/machine-learning-primer.md |
| D-noul | https://docs.typesafe.ai/primitives/noul.md |
| D-choice | https://docs.typesafe.ai/primitives/choice.md |
| D-score | https://docs.typesafe.ai/primitives/score.md |
| D-conf | https://docs.typesafe.ai/confidence.md |
| D-models | https://docs.typesafe.ai/models.md (also https://docs.typesafe.ai/models) |
| D-api | https://docs.typesafe.ai/api/system-one.md (OpenAPI https://api.typesafe.ai/openapi.json) |
| D-err | https://docs.typesafe.ai/api/errors.md |
| D-index | https://docs.typesafe.ai/llms.txt |

There is no separate pricing page: https://docs.typesafe.ai/pricing returned "Page Not Found" on 2026-10-31. Pricing lives on the models page.

## 1. What Jev is built for

- Jev is TypeSafe's flagship model and the first "System One" model. It evaluates typed questions against a `state` and returns typed answers with probability distributions. **[verified: D-intro, D-s1]**
- It does **not** generate text: "System One models do not write replies, produce code, or generate explanations of their reasoning." **[verified: D-s1; D-primer "The model does not generate text."]**
- It is trained with RLCD "to return calibrated decisions"; the same weights serve every account and there is no fine-tuning. **[verified: D-models]** Whether its probabilities are well calibrated on *our* game states is **[unverified]**.
- Docs pitch it at games/real-time: "Frontier intelligence at real-time speeds (150ms) … Fast and smart enough to be programmed to play games". **[verified: D-ucm]**

## 2. Input and output formats

Endpoint `POST https://api.typesafe.ai/v1/systemone`, Bearer key. Request top-level fields: `model`, `state`, `questions`, `assets`. **[verified: D-api OpenAPI `SystemOneRequest`]** There is **no** `temperature`, `seed` or sampling parameter in the request schema. **[verified: D-api]**

- `state`: a string, a JSON object, or an array of text values. Text only (images only via the `TypeSafe-Danger-Zone-Images` header for assets/box questions). **[verified: D-models, D-api]**
- `questions`: a map of caller-chosen ids to questions; ids are not sent to the model; any number of questions as long as context limits hold; evaluated in parallel. **[verified: D-noul, D-models]**
- Question types (primitives): **[verified: D-noul, D-choice, D-score, D-index]**

| Type | Asks | Answer fields |
|---|---|---|
| `noul` | a yes/no question or a statement to judge | `noul`: one number in [0,1], the probability the answer is yes. No `confidence`. |
| `choice` | pick one of up to 255 named options (`criteria` map of option → description) | `choice` (argmax), `probabilities` (one per option, **sum is 1**), `confidence` |
| `score` | position on ordered levels | `score` (expected level = Σ level×p), `probabilities` keyed by level number as string (**sum is 1**), `confidence` |
| `box` | image regions | needs the images header; not relevant here |

- Response: `{ model, answers: { <id>: {...} }, usage: { input_tokens, output_tokens } }`. **[verified: D-noul, D-choice examples]**
- `instructions` and `criteria` may be strings, objects or arrays. **[verified: D-noul, D-choice]**

## 3. The weighted output ("weighted noul output")

**What "noul" is.** "Noul" is a real documented term: it is the yes/no question type. A Noul answer is **a single probability** that the answer is yes, e.g. `{"type":"noul","noul":0.93}`. There is no per-option list and nothing to sum; P(no) = 1 − noul. **[verified: D-noul]**

**The closest feature to "weighted choices" is Choice (and Score) `probabilities`.** A Choice answer returns the full distribution over every option, e.g. **[verified: D-choice]**:

```json
{ "type": "choice", "choice": "returns", "confidence": 0.42,
  "probabilities": { "returns": 0.61, "billing": 0.35, "shipping": 0.04 } }
```

(The 0.61/0.35 split is quoted from D-choice's prose; the 0.04 remainder is illustrative.)

- Format: object keyed by option name, values in [0,1]. Docs: "The sum of all values is 1." **[verified: D-choice, D-score]** Whether the returned floats sum to exactly 1.0 after rounding (docs examples show two decimals) is **[unverified]**: code must renormalise.
- `choice` is the argmax. `confidence` for Choice = (p_max − 1/n)/(1 − 1/n). **[verified: D-conf]**
- Score adds an expected value over ordered levels. **[verified: D-score]**

**What our live run recorded.** The reader (`src/sim/ai-vendor/jev.ts`) asks only `choice` questions (`loyaltyRead`, `grudge_<i>`) and keeps only `answers.<name>.choice`. The `probabilities` and `confidence` fields were discarded; `trace.json` stores the mapped briefing (`loyaltyRead: "firm"`, grudge `weight: "low"`), not the raw response. **[verified: jev.ts lines 29–56; trace.json]** So the live run proves Choice answers parse and map to our enums, but holds **no recorded probabilities**.

### Sketch: weighted choices for character decisions

1. Ask a Choice whose options are the legal actions (≤255) for one character, with the briefing as `state`.
2. Record `probabilities` (as returned) in `data.ai` on the existing event, plus `model` (versioned id) and `inputHash`.
3. Sample with the sim's seeded RNG, never `Math.random`:
   - sort options by id (fixed order, not JSON key order);
   - drop options not legal this tick; renormalise; optionally apply a floor/temperature in code (e.g. p^(1/T));
   - draw u from the world RNG stream for that character and tick; walk the cumulative sum.
4. Replay reads `probabilities` from `data.ai` and redraws with the same RNG state, so it never calls the model and stays byte-identical. The draw must consume RNG even when AI is off (or use a separate sub-stream) so flag-off runs stay byte-identical. **[design, unverified until built]**
5. Nouls fit "should X happen at all" gates: compare `noul` to a seeded uniform draw (yes iff u < noul) instead of a fixed 0.7 threshold.

This is the only part of Jev that gives us more than a single pick; DeepSeek's brain gives a single answer.

## 4. Limits, latency, cost, determinism

| Topic | Finding | Status |
|---|---|---|
| Context | 64k tokens per request / 32k per question; 262k both with `TypeSafe-Danger-Zone-Long-Context: true`, slower and less accurate | verified: D-models |
| Options | up to 255 per Choice | verified: D-choice |
| Body | ≤32 MiB, UTF-8 JSON, nesting ≤64, finite numbers only; 400/401/413/415/422/429/529 | verified: D-err |
| Rate limits | per organization, in the console (needs an account) | verified: D-models; our actual limits unverified |
| Language | English best | verified: D-models |
| Latency (docs) | "150ms" | verified: D-ucm |
| Latency (live) | 8 reader calls, 133–165 ms, mean 147 ms (2 questions each, ~750–820 input tokens) | verified: trace.json `ai.context.latencyMs` |
| Latency at larger fan-out (many options/questions) | not measured | unverified |
| Price | $0.042 per million input tokens; output tokens free | verified: D-models |
| Cost (live) | 742–821 input tokens per call, 82–83 output; $0.0000312–$0.0000345 per call; $0.000260 for all 8 (run total incl. DeepSeek $0.001962) | verified: cost.jsonl, summary.json |
| Determinism | docs state nothing; no seed/temperature parameter exists. Probes: identical requests return **different** probabilities (firm 0.58–0.62) with the same argmax | verified: probes P1–P2 (section 9) |
| Version drift | aliases move; pin `jev-1.14.0` and log response `model` | verified: D-models |

Determinism for Open Era therefore rests on recording outputs in `data.ai` and never calling at replay, as already ruled.

## 5. Fit by role

| Role | Fit | Why |
|---|---|---|
| Action picking | **Good** | A Choice over legal actions returns a full distribution that can be sampled with the seeded RNG (section 3). Quality on our states unverified. |
| Dialogue | **No** | Jev does not generate text (D-s1). It could choose *which* line or tone from a fixed set, but cannot write speech. Keep the voice role on an LLM. |
| Social reading | **Good** | Already in use as the context reader: loyalty and grudge weight as Choice enums (live run, 8/8 `outcome: model`). Score suits ordered scales (grievance level). |
| Perception and news | **Partial** | Fine for classifying a report (Noul "is this news about our port?", Choice for topic/reliability). It cannot write the news text. |
| Market | **Partial / doubtful** | Score/Choice over buy/hold/sell or price bands works mechanically, but prices and quantities are numbers best left to the scorer; Jev does not output free numbers. Unverified. |
| Escalation triage | **Good** | One request, one Noul per hard test (port holding, faction-wide number, allegiance/freedom, broken promise). Escalate if any noul ≥ threshold. Matches triage that "can only add escalations". |

## 6. Still unverified

Items 1–3 were settled by the probes in section 9; item 4 is settled for 10 options.

1. ~~Real `probabilities` on our briefings~~ verified (P1).
2. ~~Sum to 1~~ verified: every returned distribution summed to 1.00 (two decimals) (P1–P3).
3. ~~Identical outputs~~ verified: **not** identical; argmax stable (P2).
4. Latency and tokens for **dozens** of options or many questions (10 options measured in P3).
5. Calibration and quality on game states.
6. Our organization's rate limits.

## 7. Probes proposed (run only after Micah approves the spend)

Each probe is one or two requests at `jev-1.14.0`, input billed at $0.042/Mtok, output free. Costs below are estimates from the live run's ~750–820 tokens per two-question call.

| # | Probe | Request | Est. cost | Hard cap |
|---|---|---|---|---|
| P1 | Record raw `probabilities`/`confidence` | Re-send the tick-24 reader request from the live run, logging the full response | ≈ $0.00003 | 1 call, $0.001 |
| P2 | Sum to 1 and determinism | Send P1's exact request 3 more times; compare all floats | ≈ $0.0001 | 3 calls, $0.001 |
| P3 | Action-pick distribution | One Choice with ~10 legal actions for one captain, briefing as state | ≈ $0.00005 (≈1,000 tokens, unverified) | 1 call, $0.001 |
| P4 | Triage Nouls | Four Nouls (the four hard tests) on one recorded event | ≈ $0.00004 | 1 call, $0.001 |

Total cap for all probes: 6 calls, $0.005, logged to `cost.jsonl` in the same format, with the response `model` recorded.

## 8. Proposed decision

Keep Jev as the context reader, and plan it for action picking (weighted sampling) and escalation triage. Do not use it for dialogue. Start by storing `probabilities` and `confidence` in `data.ai.context`, so the next live run settles items 1–3 at no extra spend.

## 9. Probe results (2026-10-31)

Approved by Micah (relayed by the Lead): "Yes, run both live checks, capped at about 6.5 cents total". Hard limits applied: 6 calls and $0.005. Each call was checked against the limits before it was sent, using worst-case cost = request bytes × $0.042/Mtok. Key from `JEV_API_KEY` in the environment, never logged. Raw requests and responses: `docs/playtests/jev-probes-2026-10-31/probes.jsonl`. Model `jev-1.14.0`; every response's `model` was `jev-1.14.0`; all six returned HTTP 200.

The P1 request is the live run's exact tick-24 reader request: rebuilt from `trace.json`, it reproduces the recorded `inputHash` (`sha256:c11d2210…`) with holder `character-14`.

| Probe | What | Latency (box wall clock) | Input / output tokens | Cost |
|---|---|---|---|---|
| P1 | tick-24 reader request | 146 ms | 742 / 82 | $0.0000312 |
| P2a–c | same request ×3 | 47, 49, 49 ms | 742 / 82 each | $0.0000312 each |
| P3 | one Choice, 10 actions for character-14 | 49 ms | 807 / 133 | $0.0000339 |
| P4 | four triage Nouls on the tick-168 tax event | 46 ms | 684 / 80 | $0.0000287 |

**Actual total: 6 calls, $0.000187** (input tokens × $0.042/Mtok; output free).

Findings:

- **P1, raw output.** `loyaltyRead`: choice `firm`, confidence 0.40, probabilities firm 0.60 / wavering 0.40 / breaking 0. `grudge_0`: `low` 0.99 / mid 0.01 / high 0, confidence 0.98. The live run recorded only "firm", hiding a near 60/40 split. **[verified: probes.jsonl]**
- **Sums.** Every distribution summed to 1.00 at the two decimals returned (P1–P3). **[verified]**
- **Repeatability (P2).** Not identical. loyaltyRead firm was 0.60, 0.62, 0.58, 0.59 across the four identical requests (confidence 0.40, 0.43, 0.37, 0.38); grudge_0 was identical (0.99) each time; the argmax never changed. Recording outputs in `data.ai` is therefore required for replay, as ruled. **[verified]**
- **P3, weighted action pick.** sail-to-verdant-cay 0.54, patrol-home-waters 0.24, sail-to-glassport 0.08, raid-merchant 0.04, recruit-crew 0.03, sail-to-crown-harbor 0.02, accept-contract 0.02, hold-in-port / buy-provisions / repair-ship 0.01 each; confidence 0.49. That is a usable distribution for seeded sampling (section 3). The action list was written for the probe, not taken from engine legality. **[verified: shape; quality unverified]**
- **P4, triage Nouls.** port_holding 0.57, faction_number 0.09, allegiance_freedom 0.74, broken_promise 0.20. A tax event *is* a faction-wide number, so 0.09 is a miss on the instruction as worded; prompt wording needs work before triage relies on it. **[verified: values; judgment is ours]**
- **Latency.** 46–49 ms for warm calls, 146 ms for the first (connection set-up likely, unverified). The live run's 133–165 ms were measured inside the engine's sync transport, so the two are not directly comparable.
