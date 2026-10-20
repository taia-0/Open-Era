# AI brain

**Status: Open.** Design and research note for the Lead and Micah. Nothing in this note is in the tree. No account was created, no API key was used, and no model was called. Choosing a vendor, signing up, and paying stay Micah's call.

Micah's brief: a "nervous system and brain" for AI characters. Small, cheap models (Jev or an alternative) take routine character decisions. A big "brain" model (DeepSeek or similar) is asked only for big decisions. This note says which decisions are which, how the sim stays deterministic and replayable, what the candidates cost per 1200-tick run, and what the smallest pilot is.

It builds on [small agents](../research/small-agents.md) (`baee32a`), which measured the action stream on seed 1847 at `e87ba91` and found where a model choice can sit under the M33 replay rule. That note's mechanics still hold and are not repeated in full here.

## Checked on

`origin/main` at `f451793` (merge of PR #125). Node v24.22.0, ICU 78.3 (the Node 24 release available to this box; the fixture was generated on v24.21.0). `npm test` passed, 459 tests, 0 failed. A local harness outside the repository ran `createPrototypeWorld(seed)` and 1,200 calls to `runTick`, seeds 1847, 2718, and 4096, no player commands. `git status` was clean afterwards. The 72-tick hashes matched the committed fixture.

| Seed | Tick 72 hash (events) | Tick 1200 hash | Events |
| --- | --- | --- | ---: |
| 1847 | `86507558` (8426) | `7314d632` | 163059 |
| 2718 | `c6268c39` (8335) | `b7015fce` | 165135 |
| 4096 | `d62ab7f9` (8266) | `7f0f865b` | 168755 |

This is the tree, batch 1 included. The batch 2 stack is not built, so it has no contract events. Contract counts below are copied from the cancellation-at-10 table in [contract fulfilment](contract-fulfilment.md) and are labelled as such. Negotiation is not built either.

## Jev, verified

Jev is TypeSafe AI's model, as `baee32a` said. Checked on 2026-10-19:

- [Introducing System One Models & Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev) (Diogo Almeida, founder, TypeSafe, Sep 15, 2026). Jev is the first "System One" model. It returns typed, probabilistic decisions instead of generated text. Input $0.042 per million tokens, output free. End-to-end response time 70–500 ms. Choice cardinality up to 255. Early access.
- [TypeSafe models](https://docs.typesafe.ai/models). Current IDs `jev-1.14.0` (available from October 14, 2026, alias `jev-preview`) and `jev-1.13.0` (alias `jev-latest`). Both $0.042 per million input tokens, output free. 64k per-request and 32k per-question context. Text only. Endpoint `POST /v1/systemone`. Rate limits are now "set per organization" in the console; the 80 requests per second figure `baee32a` quoted is no longer on that page and is not used here. The page says an alias "moves when a new release ships" and recommends sending a versioned ID once thresholds are tuned.

## 1. Decision points

### Escalation rule

A decision goes to the brain when it does at least one of these:

1. **Changes who holds a port**, or puts a port's holding at stake (secession, raid, claim).
2. **Sets a faction-wide number** (the holder's tax step).
3. **Changes a person's allegiance or freedom** (desertion, captivity terms, ransom).
4. **Breaks a promise by choice** (a contract breach whose cause is `choice` / `better-motive`, or abandoning a negotiated term).

Everything else is the nervous system: the small model, or the rules when the small tier is off. A routine action decision is promoted to the brain only if its legal list contains `raid` or `claim-settlement`; the brain then picks from the whole list, so a raid-capable character can still decide to rest.

The rule names event types, not scores, so it can be checked from the log. It does not depend on the model's own confidence. Confidence-based escalation (a small model that is unsure hands up) is a later option; it makes the routing depend on a model output, which is harder to replay and audit.

### Table

Counts per 1200-tick run, seeds 1847 / 2718 / 4096. "Tree" means the harness above on `f451793`. "Docs" means copied from the named note.

| Decision point | Where it is today | Tier | 1847 | 2718 | 4096 | Source |
| --- | --- | --- | ---: | ---: | ---: | --- |
| Action, ashore (`decision-made`), no raid or claim on the list | `buildCandidates`, `candidates[0]` | Small | 26,727 | 27,103 | 27,686 | Tree: all `decision-made` minus the row below |
| …of which `rest` / `work` | same | Small | 11,379 / 6,172 | 10,960 / 6,899 | 11,910 / 6,691 | Tree |
| …of which `travel` (movement) | same | Small | 2,180 | 2,218 | 2,024 | Tree |
| …of which `buy-provisions` / `trade-local` (buying) | same | Small | 1,921 / 3,243 | 2,089 / 3,225 | 2,298 / 3,041 | Tree |
| …of which `recruit` (recruitment) | same | Small | 1,928 | 1,863 | 1,900 | Tree |
| Action whose legal shortlist holds `raid` or `claim-settlement` | same | **Big** | 214 | 269 | 247 | Tree. Chosen: raid 78 / 74 / 48, claim 40 / 44 / 21 |
| Holder's tax step (`tax-rate-set`, autonomous) | `src/sim/tax-rate.ts`, engine | **Big** | 22 | 25 | 26 | Tree |
| Secession (`secession-declared`, autonomous) | `src/sim/secession.ts`, engine | **Big** | 5 | 5 | 2 | Tree |
| Desertion (`character-deserted`) | `resolveMorningDesertion` | **Big** | 3 | 1 | 6 | Tree. Desertions, not rolls; a roll that fails emits nothing, so the number of times the 12-morning streak was reached is not countable from the log |
| Captivity: one captor-side terms decision per capture (`character-captured`) | combat and captivity | **Big** | 16 | 11 | 6 | Tree. Releases 15 / 8 / 6. Negotiation is unbuilt; today the ransom is paid without bargaining ([negotiation](negotiation.md)) |
| Negotiation offers (ransom, contract, pact, tribute) | not built | **Big** | — | — | — | [Negotiation](negotiation.md) is a brief; no count exists |
| Contract offer answered (accept or refuse) | `assessSupplyContract`, batch 2 walk | Small | 320 | 186 | 430 | Docs: [contract fulfilment](contract-fulfilment.md), cancellation at 10 |
| Contract breach by choice (`choice` / `better-motive`) | batch 2 haul | **Big** | 49 | 45 | 61 | Docs: same table. `deadline-infeasible` (146 / 46 / 157) is a feasibility outcome, not a choice, and stays on the rules |
| Plan review (`plan-reconsidered`) | `reviewPlan` | Rules | 16,003 | 16,262 | 18,411 | Tree. Most are the provisions-reserve trigger (`baee32a`); not sent to any model in this design |
| Standing order accept / refuse | `assessStandingOrder` | Small | 20 | 20 | 20 | Tree (14 + 6, 14 + 6, 16 + 4) |
| Autonomous retreat (`battle-retreated`) | `autonomousShouldRetreat` | Rules | 13 | 13 | 9 | Tree. Only true results are events, so the number of checks is not countable |

Totals per run, each column summed from the table:

- **Small tier:** 26,727 + 320 + 20 = 27,067; 27,103 + 186 + 20 = 27,309; 27,686 + 430 + 20 = 28,136.
- **Big tier:** 214 + 22 + 5 + 3 + 16 + 49 = 309; 269 + 25 + 5 + 1 + 11 + 45 = 356; 247 + 26 + 2 + 6 + 6 + 61 = 348.

The brain sees about 1.2% of the decisions (356 / (356 + 27,309) on 2718). Pax Ash (`character-14`) alone made 1,010 / 939 / 932 action decisions.

## 2. Determinism and replay

The M33 rule governs everything here: replay goes only through `applyEvent`, extra randomness uses side RNG streams, and `stateHash` covers world state only, not the event log.

1. **The call sits in `runTick`, before `emit`.** The model's answer is written onto the decision's own event (`decision-made.data.goal` and `data.chosen`, `tax-rate-set.data.taxRate`, `secession-declared`, and so on). The effect events that follow carry absolute values, as they do today. `WorldStore.recover` replays those events through `applyEvent` and never calls a provider. A provider inside `applyEvent` would make every recovery a new decision.
2. **No new event type for the choice.** The default arm of `applyEvent` throws on an unknown type. Model metadata rides on the existing event's `data`.
3. **The scorer still runs and still draws.** `buildCandidates`, the tax readout, and the secession readout are computed exactly as now and consume the same main-stream draws. The model replaces the index, not the draw. Otherwise later ticks diverge even when the model agrees.
4. **Seeded fallback.** On flag off, no provider, timeout, error, or an answer that is not in the legal set: emit the scorer's choice (`candidates[0]`, or the readout's step). A fallback writes the same fields the scorer writes, so the world, and therefore the hash, is unchanged. The reason goes on `data.ai` (below); `applyEvent` does not read it.
5. **AI off is byte-identical.** With the flag off, no field is added to any event, so both `stateHash` and the event bodies match today. The golden fixture (`86507558` / `c6268c39` / `d62ab7f9`) and the 600-event split recovery must pass unchanged. With the flag on and every call falling back, `stateHash` and event counts must match flag-off; event bodies differ only by `data.ai`.
6. **Any model-only randomness uses a side stream.** If a choice is sampled from a model's probabilities (Jev returns a probability per option), the draw comes from a side stream keyed by seed, tick, and actor, so the main `rngState` is untouched.
7. **What gets recorded** on `data.ai`: `tier` (`small` or `big`), `provider`, the versioned `model` ID the response names (never an alias such as `jev-latest`), `promptVersion` (a hash of the prompt template), `inputHash` (sha256 of the canonical request), `outcome` (`model`, `fallback-timeout`, `fallback-error`, `fallback-illegal`, `cache`), and `latencyMs`. The answer itself is the event's normal field.
8. **Pinning.** A run's config names one model ID and one prompt version per tier. Changing either is a new run, not a replay. A run log records both on tick 0, so a reader knows which brain made which world.
9. **Caching.** An optional cache keyed by `inputHash` stores answers on disk outside the world. It saves cost on re-runs of the same seed and config. It is never needed for replay, because replay reads the events. A cache hit is logged as `outcome: cache`.
10. **Wall-clock independence.** A timeout produces a fallback, and the fallback is recorded, so a slow network changes `data.ai.outcome` on that run. Replay of that log is still exact. Two live runs with the same seed can still differ if one timed out; that is a property of live AI, and it is why the flag stays off in the fixture.

`runTick` is synchronous today. A live call needs either an awaited provider (a change to the tick loop's signature) or a pre-computed answer file. The pilot below uses the awaited form for one decision type only.

## 3. Candidate models

### Token assumptions

- **Small call, input: 124.62 tokens.** Measured bytes from `baee32a` (mean 498.50 bytes per action decision: actor, archetype, plan, goal, six options) divided by 4. A byte-per-token stand-in, not a tokenizer count.
- **Small call, output: 16 tokens.** Assumption from `baee32a`: a short JSON choice, no reasoning. Jev does not charge output.
- **Big call, input: 2,000 tokens. Output: 400 tokens.** **Assumption, not measured.** Room for the character, the faction's ports, treasury, rates, recent news, and the legal options, plus a short stated reason. A thinking-mode model can spend far more output; that is not estimated.
- **Calls:** the highest seed in the table, so the figures are an upper estimate across the three seeds: 28,136 small calls (4096) and 356 big calls (2718).

Small run tokens: 28,136 × 124.62 = 3,506,308 input; 28,136 × 16 = 450,176 output. Big run tokens: 356 × 2,000 = 712,000 input; 356 × 400 = 142,400 output.

### Small tier (nervous system)

Cost = input tokens × input price + output tokens × output price, per million, standard tier, list prices. Estimates.

| Model | Runs where | Price in / out per M | Cost per run (estimate) | Latency | Source |
| --- | --- | --- | --- | --- | --- |
| Jev `jev-1.14.0` / `jev-1.13.0` | API only (TypeSafe) | $0.042 / free | 3.506308 × 0.042 = **$0.147** | 70–500 ms per call (vendor). Serial over 28,136 calls: 33–234 min, estimate | [docs.typesafe.ai/models](https://docs.typesafe.ai/models), [launch post](https://typesafe.ai/blog/introducing-system-one-models-and-jev) |
| OpenAI `gpt-5-nano` | API only | $0.05 / $0.40 | 0.1753 + 0.1801 = **$0.355** | Not published | [OpenAI pricing](https://developers.openai.com/api/docs/pricing) |
| OpenAI `gpt-6-luna` | API only | $0.10 / $0.50 | 0.3506 + 0.2251 = **$0.576** | Not published | Same page |
| Groq `openai/gpt-oss-20b` | API (open weights also exist) | $0.075 / $0.30 | 0.2630 + 0.1351 = **$0.398** | 1,000 tokens/s listed; decode-only estimate 16 ms per call, time to first token not published | [Groq models](https://console.groq.com/docs/models) |
| `deepseek-flash` (DeepSeek-V4.1-Flash), non-thinking | API | $0.30 / $1.20 peak; $0.15 / $0.60 off-peak (cache miss) | Peak 1.0519 + 0.5402 = **$1.59**; off-peak **$0.80** | Not published | [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing) |
| `qwen3:0.6b` / `qwen3:1.7b` | Local, Ollama (523 MB / 1.4 GB) | $0 | **$0** API; machine time only | Carried from `baee32a` (lintware tool-calling benchmark, laptop CPU): 3,410 ms and 10,665 ms per prompt. Serial over 28,136 calls: about 26.6 h and 83.3 h, estimate | [Ollama qwen3](https://ollama.com/library/qwen3); benchmark as cited in [small agents](../research/small-agents.md), not re-fetched |

Jev is the cheapest API and its Choice primitive matches "pick one legal row" directly. Its latency, not its price, is the constraint: a serial call per decision adds minutes to a 1.6-second run. The small tier is only worth turning on once calls are batched per tick (Jev's docs describe many questions against one `state` in a single request) or run ahead of the tick.

### Big tier (brain)

| Model | Runs where | Price in / out per M | Cost per run (estimate, 356 calls) | Latency | Source |
| --- | --- | --- | --- | --- | --- |
| `deepseek-v4-pro` | API | $1.32 / $3.96 peak; $0.66 / $1.98 off-peak (cache miss) | Peak 0.9398 + 0.5639 = **$1.50**; off-peak **$0.75** | Not published | [DeepSeek pricing](https://api-docs.deepseek.com/quick_start/pricing) |
| `deepseek-flash`, thinking mode | API | $0.30 / $1.20 peak | 0.2136 + 0.1709 = **$0.38**, before thinking tokens | Not published | Same page |
| OpenAI `gpt-5.6-terra` | API | $2.00 / $12.00 | 1.424 + 1.709 = **$3.13** | Not published | [OpenAI pricing](https://developers.openai.com/api/docs/pricing) |
| OpenAI `gpt-6-sol` | API | $2.00 / $10.00 | 1.424 + 1.424 = **$2.85** | Not published | Same page |
| `qwen3:30b` | Local, Ollama (19 GB) | $0 | **$0** API | Not measured; no public figure on this machine class was found | [Ollama qwen3](https://ollama.com/library/qwen3) |

DeepSeek peak hours are 01:00–04:00 and 06:00–10:00 UTC on weekdays (18:00–21:00 and 23:00–03:00 PT); off-peak is half price. Whether DeepSeek V4 weights can run locally was not checked and is not assumed. The TypeSafe launch post reports end-to-end response times of 3 to 329 seconds for frontier LLMs in general; that is the vendor's claim about competitors, not a DeepSeek figure, and it is a reason the brain should only see a few hundred calls.

**Both tiers, per run, estimate:** Jev small plus DeepSeek V4 Pro big at peak is 0.147 + 1.504 = **$1.65**. Big tier alone at off-peak is $0.75.

## 4. Pilot

**One decision type: Free Tide's holder tax step, on the brain tier only.** Behind `ai.brain.taxStep`, off by default.

- 22 / 25 / 26 calls per run. Cost on `deepseek-v4-pro` at peak, estimate: 26 × (2,000 × 1.32 + 400 × 3.96) / 1,000,000 = 26 × 0.004224 = **$0.11** per run.
- The legal set is what the readout already allows: down one step, hold, or up one step of 0.01, inside the bounds the readout already enforces ([leader tax](leader-tax.md)), and frozen when the faction holds no port (the batch 2 ruling). The model may only pick a member of that set.
- The scorer's readout runs and draws as now. The model's step is written to `tax-rate-set.data.taxRate` with `data.ai`.
- It is small and visible: a faction-wide number, read by news and secession, and the [news](news.md) and [secession](secession.md) notes already trace what a rate change does. The action stream, the small tier, and contract walk stay on the rules.

Why not Pax Ash's action choice (the `baee32a` pilot)? It is 932–1,010 calls a run on the small tier and needs batching to be bearable. The tax step tests the brain path, recording, fallback, and replay with about 25 calls. Pax is the natural second slice, for the small tier.

Success, all of them:

1. Flag off: the 72-tick fixture and the 600-event split recovery pass unchanged, and the 1200-tick hashes stay `7314d632` / `b7015fce` / `7f0f865b` on this tree (or the current pin when the slice is built).
2. Flag on with a stub provider that returns the readout's step: same hashes and event counts as flag off.
3. Stub that throws, times out, or answers outside the legal set: every event is a fallback, the world matches flag off, and `data.ai.outcome` names the cause.
4. Stub that returns a different legal step: `WorldStore.recover` from an earlier snapshot reaches the live `stateHash` without calling the provider.
5. The provider is called only for autonomous `tax-rate-set`, never during recovery.
6. A real model is only connected after Micah chooses a vendor and supplies a key. Until then the slice ships with stubs.

## 5. Defaults

1. `ai.enabled` = **false**. With it off, nothing in this note runs and every hash is byte-identical.
2. Escalation rule = **the four tests in section 1** (port at stake, faction-wide number, allegiance or freedom, breach by choice). No confidence-based escalation in the first slices.
3. Routine actions with `raid` or `claim-settlement` on the legal list = **big**.
4. Plan reviews and autonomous retreat = **rules**, not a model.
5. Small tier default provider = **none** (rules). First candidate when turned on: **Jev**, versioned ID, batched per tick.
6. Big tier default provider = **none** (rules). First candidate: **`deepseek-v4-pro`**, non-thinking, off-peak when possible.
7. Model IDs = **versioned only** (`jev-1.14.0`, not `jev-latest`). Changing a model or prompt is a new run.
8. Timeout = **2,000 ms small, 30,000 ms big**. Proposed, not measured.
9. Fallback = **the current scorer's choice**, recorded with its reason.
10. Model-only sampling = **a side RNG stream** keyed by seed, tick, and actor.
11. Answer cache = **on, keyed by input hash**, outside the world, never needed for replay.
12. Replay = **never calls a model**.
13. Output token cap = **16 small, 400 big**.
14. Pilot = **Free Tide holder's tax step on the big tier**, behind `ai.brain.taxStep`, off by default, stubs only until Micah picks a vendor.
15. Budget guard = **stop calling and fall back** once a run's estimated spend passes **$5**. Proposed, about three times the both-tier estimate above.
