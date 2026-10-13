# Small agents

**Status: Open.** Research note for Micah. No rule was left in the tree. The count below came from a local harness that was not committed.

Checked on `origin/main` at `e87ba9173cd26406388dc91d845981545037ffb4` (merge of PR #87). Node v24.21.0, ICU 78.3. The harness ran `createPrototypeWorld(1847)` and 1,200 calls to `runTick`. It reproduced the committed 72-tick fixture for seed 1847: state hash `4ea893a485b05ce6eab599919765903ade9a0ce45f383437f4698064faa7a297`, 8,413 events. At tick 1,200 the same run hashed to `90dacc2dfcd199ab720ade191bd3fdf8742632a36f19216bd53ce0e3a3294fef` with 160,268 events. Wall time for those 1,200 ticks was 1.6 seconds.

## Smol and Jev

**Smol** is Hugging Face [smolagents](https://huggingface.co/docs/smolagents/index), the Python library in [huggingface/smolagents](https://github.com/huggingface/smolagents). `CodeAgent` writes its next step as Python and runs that code. `ToolCallingAgent` writes a JSON tool call. Either one is a multi-step loop. The agent class defaults to `max_steps` of 20 ([agents.py](https://github.com/huggingface/smolagents/blob/main/src/smolagents/agents.py)). The library is model-agnostic: Hub inference, OpenAI and Anthropic through LiteLLM, or a local Transformers or Ollama model. It publishes no per-decision price. The price is whatever model sits underneath, multiplied by the number of steps the loop actually takes.

**Jev** is a real model. It is TypeSafe AI's System One model, named for William Stanley Jevons, and it is documented by the vendor:

- Launch post, [Introducing System One Models & Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev). Diogo Almeida, TypeSafe. The post says Jev gives up string generation and returns typed probabilistic decisions. It names the training method RLCD.
- [System One](https://docs.typesafe.ai/concepts/system-one). Three primitives: Choice (one of a declared set), Score (a level), Noul (a yes/no probability). The endpoint is `POST /v1/systemone`. The docs' default model id is `jev-latest`.
- [Models](https://docs.typesafe.ai/models). Current id `jev-1.13.0`. Price $42 per billion input tokens, which is $0.042 per million. Output tokens are free. Rate limits on that page: 100K tokens per second and 80 requests per second. Context: 64k tokens per request, and 32k for the state plus the longest question. Text only.

The launch post's published end-to-end latency is 70–500 ms. The same post says a Choice can hold up to 255 options. That cardinality covers every action this sim can offer a captain.

Jev is a decision model with an HTTP API, which people then wrap in an agent loop. It is a real thing Micah can call. Prices on this page are taken from `typesafe.ai` only. Other domains that use the Jev name were advertising different rates when this note was written, and those rates are not used here.

## How a character decides today

The cast is 30 named people. Mara Vane (`character-01`) is the human. The other 29 are `controller.kind === "autonomous"`. Decisions are deterministic functions of the world and `DeterministicRng`. The same seed and the same commands reproduce the same events. There is no model call on this path.

`runTick` (`src/sim/engine.ts`) walks characters in id order after production, player commands, contracts, captivity, troop recovery, active battles, and order expiry. A character in an active battle is skipped. A captive is skipped. The human, Mara, moves along a voyage if she has one and then skips the planner.

For everyone else the tick does four scored steps.

1. **Plan review.** `reviewPlan` (`src/sim/agency.ts`) returns null unless `planReviewReason` fires: no plan, a dead goal, a scheduled review, health under 38, provisions under the reserve, a defeat since the plan was written, or a newer pending order. On a review, `scoreGoal` ranks active goals, `assessStandingOrder` scores a pending order, and the winner becomes a `CharacterPlan` with `preferredActions`. The tick emits `plan-reconsidered`. `recordOrderAssessment` then emits `standing-order-accepted` or `standing-order-refused` when that order is still pending.
2. **Action candidates.** If the character is ashore, `buildCandidates` (`src/sim/engine.ts`) scores a fixed menu. `travelCandidates` adds one `travel` row per other settlement. `planActionBoost` (`src/sim/agency.ts`) adds or subtracts for the current plan. Each row then gets `rng.between(-3.5, 3.5)`. An illegal buy, recruit, or unaffordable voyage is forced to −1000. The list is sorted by score, then by action name.
3. **The choice.** The tick keeps `candidates[0]`. That line is the whole policy. It emits `decision-made` with `data.goal` set to the action and `data.chosen` set to that row, plus `candidates.slice(0, 6)`.
4. **The effect.** `updateOrderAdherence` may emit a deviation or a resumption. `resolveDecision` emits the effect (`travel-started`, `market-trade`, `worked`, `recruited`, `rested`, a battle, or `settlement-claimed`). `judgeOrderCompletion` may emit `standing-order-completion-reported`. `progressActiveGoal` emits `goal-progressed`.

The menu `buildCandidates` can actually select is:

| Action | What the score is made of |
| --- | --- |
| `rest` | Missing health and morale, plus caution |
| `buy-provisions` | The provision gap, plus caution. Illegal if the port has no provisions or the purse cannot pay |
| `work` | A flat wage motive, low cash, and loyalty |
| `recruit` | Ambition, leadership, and a small party. Illegal under 30 spendable or under 2 arms |
| `trade-local` | Commerce, trade skill, free hold, and a cargo already marked for travel |
| `travel` | Curiosity, cargo, a believed price gap, ambition in a foreign port, minus distance. One row per other port. Illegal when `quotedPassage` says the purse is short |
| `claim-settlement` | Present only when the port is hostile, the party has troops, and `settlementClaimAvailableTo` says this character may take the surrender |
| `raid` | Present only for a faction member, with at least 25 troops, against a hostile port whose garrison clears the floor (15, or 8 when the attacker's faction holds no port), 18 ticks after the last battle, with no battle already on that beach. The score uses aggression, ambition, caution, and `believedGarrison` |

`survey`, `buy-resource`, `sell-resource`, and `decline-surrender` are player actions. `resolveDecision` knows them. `buildCandidates` never offers them. A headless run therefore never selects them.

Two more autonomous judgments sit outside that menu:

- **Retreat.** `autonomousShouldRetreat` (`src/sim/combat.ts`) runs from `progressActiveBattles` on a major battle after phase 0. It combines who is ahead, health, morale, troop fraction, caution, and aggression. A true result calls `retreatFromBattle`.
- **A supply contract.** `assessSupplyContract` (`src/sim/contracts.ts`) accepts or refuses an offer already on the world. This headless run had no offers, so it recorded none.

Dialogue is a third path and it is already the shape a model plug-in wants. `DeterministicDialogueProvider.respond` (`src/sim/conversations.ts`) returns text, and the caller stores the reply on a conversation event. The design note [autonomous characters](../design/autonomous-characters.md) says a later provider may be a hosted or local model, and that stored replies are what replay reads. This headless run sent no messages, so the count below has no dialogue decisions.

`confirmUnansweredOrders` is a timer. An autonomous issuer confirms a completion report after one tick. It is not a scored choice.

## Where a model can sit

The authority line in [autonomous characters](../design/autonomous-characters.md) already allows a language model to suggest the same typed action. The simulation still decides what is legal and still applies the result. The plug-in is the line that currently reads `candidates[0]`.

`emit` (`src/sim/engine.ts`) builds the event and immediately calls `applyEvent`. For `decision-made`, `applyEvent` (`src/sim/state.ts`) writes two fields: `actor.currentGoal` from `data.goal`, and `actor.lastDecisionTick`. The money, cargo, troops, and travel that follow are later events (`worked`, `market-trade`, `travel-started`, and the rest), and each of those reducers writes the absolute values the event carries.

`WorldStore.recover` (`src/sim/persistence.ts`) loads the latest snapshot and applies every later event through `applyEvent` only. It does not call `runTick`, `buildCandidates`, or `resolveDecision`. That is the recovery rule the M33 release-record note and the leader-tax note both ran into: a fact written beside `emit` and left off the event is on the next snapshot and gone when recovery starts from an earlier one. The same rule applies to a model choice. The call belongs in `runTick`, before `emit`, and the chosen row has to be the row on `decision-made`. Replay then copies `data.goal` and applies the effect events. Replay must not call the provider. Putting the provider inside `applyEvent` would make every recovery a new, nondeterministic decision.

`stateHash` (`src/sim/state.ts`) is sha256 of `canonicalJson` of the world. The event log is not in it. Two consequences follow.

- A choice that changes the action changes later world fields (purse, location, garrison, `rngState` once later draws diverge), so the hash moves from that tick on.
- A field added to `decision-made.data` that `applyEvent` does not read leaves the hash where it is, as long as `data.goal` and the effect events stay the same. The golden fixture stores the state hash and the event count. It does not store an event-body hash. A fallback flag on the payload would move a body hash and would leave the fixture alone.

The fixture is 72 ticks, three seeds, in `tests/fixtures/golden-hashes.json`. On this SHA the seed-1847 row is the hash above, 8,413 events. Recovery splits seed 1847 at tick 47 and replays 600 events. Pax Ash's first raid in the measured run is event tick 0, and 19 raid decisions fall on event ticks 0–71. A pilot that can disagree with the scorer inside that window moves the fixture the first time it disagrees. The default path has to keep `candidates[0]`, with the provider behind a flag that the golden test leaves off.

The RNG has to keep being drawn. `buildCandidates` calls `rng.between` once per row, and `reviewPlan` draws when a review happens. `tick-advanced` stores `rngState`. Skipping the scorer and asking the model instead consumes fewer draws. Later ticks then diverge even when the model happens to name the same action. The provider replaces the index. It does not replace the draw.

Fallbacks, in order:

1. Flag off, or no provider configured: `candidates[0]`, which is today's world.
2. The provider throws, times out, or returns an action and target that are not on the candidate list: emit `candidates[0]`, and put the failure on `data` so a reader can see it. `applyEvent` keeps reading `data.goal`. A matching fallback leaves `stateHash` and the event count on the fixture.
3. A legal choice: write that row into `data.goal` and `data.chosen`, then pass the same row to `resolveDecision`. The goal string and the effect event have to name the same action. Recovery will believe the event, not the live variables.

`plan-reconsidered` is the same shape for a plan. Its reducer writes `activeGoalId`, `plan`, and `lastPlanReviewTick` from the event. A model plan has to be that payload. This note does not recommend starting there. The measured reasons are below.

A new event type is the wrong carrier. The default arm of `applyEvent` throws `Unknown event type`. `decision-made` already carries the choice.

## Frameworks, and the models under them

The sim is Node. smolagents and Pydantic AI are Python. A Python agent loop does not belong inside `runTick`. If one is used at all, it is a sidecar that returns one allow-listed row. `CodeAgent` is a poor sidecar for this menu: the model writes code, and the design rule is that the model does not apply state. The sandboxes smolagents documents (Modal, Blaxel, E2B, Docker) limit the interpreter. They do not make the code a legal game action. `ToolCallingAgent` is closer, and it is still a loop of up to 20 model calls unless `max_steps` is set to 1.

Credible alternatives, each a real project:

- **No framework.** One structured completion whose schema is the candidate list. The dialogue provider is already this adapter. OpenAI's [Responses API](https://developers.openai.com/api/docs/guides/agents) is the "call the model yourself" end of their own agent page. The [Agents SDK](https://developers.openai.com/api/docs/guides/agents) and the hosted Agents API add a loop, session state, and tools. That loop is the cost multiplier, and it is the thing this sim already did when it built the candidate list.
- **Jev Choice.** One question whose options are the legal rows (action plus target). The answer is a member of that set, with a probability per option. Output tokens are free on the published tariff. Cardinality 255 is enough. This is the closest match to `candidates[0]`.
- **[Pydantic AI](https://ai.pydantic.dev/).** A typed Python agent loop over whatever model string you pass. Same replay problem, same step multiplier, and it is not the Node process.

None of these frameworks publish a per-decision dollar or a per-tick latency. The figures below are the model vendors' prices and speeds, applied to the measured call count. Estimates are marked. Unpublished latencies are left unpublished.

### Published prices

Standard tier, per million tokens, from the vendor pages fetched for this note.

| Model | Input | Output | Where it is written |
| --- | --- | --- | --- |
| Jev `jev-1.13.0` | $0.042 | $0 (free) | [docs.typesafe.ai/models](https://docs.typesafe.ai/models). The launch post states the same $0.042 per million input |
| `gpt-5-nano` | $0.05 | $0.40 | [OpenAI pricing](https://developers.openai.com/api/docs/pricing), standard, short context |
| `gpt-5-mini` | $0.25 | $2.00 | Same OpenAI table |
| `gemini-3.5-flash-lite` | $0.30 | $2.50 | [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing), standard paid tier. Output price includes thinking tokens. [DeepMind's model page](https://deepmind.google/models/gemini/flash-lite/) prints the same $0.30 / $2.50 |
| Groq `openai/gpt-oss-20b` | $0.075 | $0.30 | [Groq supported models](https://console.groq.com/docs/models) |

Groq lists Llama 3.1 8B and Llama 3.3 70B as Contact Sales on that page, so they have no public per-token price to apply. `gpt-oss-20b` is the small public row.

### Published speed

| Source | What it publishes | What it does not publish |
| --- | --- | --- |
| Jev launch post | End-to-end response time 70–500 ms | A single number for this sim's payload |
| Groq models page | `openai/gpt-oss-20b` at 1,000 tokens/sec | Time to first token |
| DeepMind, Gemini 3.5 Flash-Lite | 350 output tokens per second, attributed there to the Artificial Analysis Index | Time to first token. Thinking tokens are extra output |
| OpenAI pricing page | The token prices above | Latency |
| [lintware/tool-calling-benchmark](https://github.com/lintware/tool-calling-benchmark), Round 3, 20 runs, majority vote | Average milliseconds per prompt on a Framework Laptop 13 (AMD Ryzen AI 7 350, 32 GB, no discrete GPU, Ollama 0.13.5 or llama.cpp, Arch). `lfm2.5:1.2b` 1,567 ms (agent score 0.920, llama.cpp). `qwen3:0.6b` 3,410 ms (0.880, Ollama). `qwen3:1.7b` 10,665 ms (0.960, Ollama) | A measurement on our payload or on this machine |

Those local numbers are someone else's prompts. Carrying them onto our ticks is an estimate, and the note labels it that way. smolagents itself has no speed row.

## What seed 1847 does in 1,200 ticks

The harness counted emitted events. A function that returns null and emits nothing is not in the table. `reviewPlan` is called for every autonomous character who is not captive and not in a battle; only the non-null reviews are `plan-reconsidered`. Retreat checks that return false are not events. The action table is complete: every ashore autonomous choice emits `decision-made`, and `data.goal` matched `data.chosen.action` on all 26,152 of them.

Per tick is the count divided by 1,200.

### Action decisions (`decision-made`)

26,152 choices. Mean 21.79 per tick. Minimum 3, median 22, 90th percentile 25, maximum 29. The maximum is the whole autonomous cast, which happens on a tick when all 29 are ashore and free.

| Action | Times chosen | Per tick | Chosen on event ticks 0–71 |
| --- | --- | --- | --- |
| `rest` | 9,389 | 7.82 | 18 |
| `work` | 7,222 | 6.02 | 314 |
| `trade-local` | 3,082 | 2.57 | 333 |
| `travel` | 2,440 | 2.03 | 319 |
| `buy-provisions` | 2,090 | 1.74 | 49 |
| `recruit` | 1,835 | 1.53 | 86 |
| `raid` | 70 | 0.06 | 19 |
| `claim-settlement` | 24 | 0.02 | 2 |
| **All actions** | **26,152** | **21.79** | **1,140** |

The effect events line up with the choices where the effect is one event per choice: `rested` 9,389, `worked` 7,222, `recruited` 1,835, `travel-started` 2,440, `settlement-claimed` 24. `market-trade` is 5,099 against 3,082 local trades plus 2,090 provision buys (5,172 choices). The gap is choices that returned before the emit: a zero fill, or a spend that did not clear. `resolveTrade` and the provision branch both do that. `battle-started` is 53 against 70 raids; an immediate battle resolves in `resolveImmediateBattle` without opening a phased battle. `battle-resolved` is 50. `battle-retreated` is 15, all of them autonomous (`commandId` absent).

Every `decision-made` stored a shortlist of length 6, which is `candidates.slice(0, 6)`. The scorer's full list is longer: five dock actions, one travel row per other settlement (three other ports), and sometimes raid and claim. The shortlist drops the tail. Counting an action type once per shortlist, travel appeared in 26,131 of 26,152 shortlists, `trade-local` in 24,834, `work` in 24,517, `rest` in 21,652, `recruit` in 17,074, `buy-provisions` in 6,468, `raid` in 176, and `claim-settlement` in 26. Raid and claim never shared a shortlist (176 + 26 = 202). Several travel rows can sit inside one shortlist; the 26,131 figure is decisions that kept at least one, not a count of destinations.

`rest` and `work` together are 16,611 choices, 63.5% of the action stream. They are the wage and the sickbed. A model that replaces every choice spends most of its calls there.

### Plan reviews (`plan-reconsidered`)

14,610 reviews. Mean 12.18 per tick. Minimum 0, median 14, 90th percentile 19, maximum 29. Event ticks 0–71 hold 209 of them.

| Reason | Count |
| --- | --- |
| Provisions fell below the safe reserve | 12,765 |
| Scheduled strategic review | 1,671 |
| Active goal is no longer viable | 104 |
| No active plan | 43 |
| A recent defeat invalidated prior assumptions | 27 |

The selected goal kinds were `serve-faction` 5,152, `expand-influence` 4,092, `build-power` 1,767, `explore-world` 1,122, `recover-strength` 988, `material-security` 952, and `build-wealth` 537.

Twelve thousand of the reviews are the provisions threshold `planReviewReason` already names. That is a poor first place to spend a model. The scheduled reviews, 1,671 of them, are the strategic residue.

### Smaller recorded judgments

| Event | Count | Per tick |
| --- | --- | --- |
| `standing-order-deviated` | 54 | 0.05 |
| `standing-order-resumed` | 54 | 0.05 |
| `standing-order-accepted` | 14 | 0.01 |
| `standing-order-completion-reported` | 14 | 0.01 |
| `standing-order-completed` | 14 | 0.01 |
| `standing-order-refused` | 6 | 0.01 |
| `battle-retreated` (autonomous) | 15 | 0.01 |

No contract events and no conversation events in this run.

### Pax Ash

`character-14` is Pax Ash, raider, Free Tide. The scenario places him at Crown Harbor and sets his aggression, ambition, and caution by hand so that an early consequential choice is within reach. Over 1,200 ticks he recorded 853 action decisions (0.71 per tick) and 458 plan reviews. Twenty-eight of the action decisions fall on event ticks 0–71, including 4 raids. His first raid is event tick 0.

| Pax's action | Times chosen | Of which, event ticks 0–71 |
| --- | --- | --- |
| `rest` | 387 | 1 |
| `recruit` | 144 | 2 |
| `work` | 118 | 0 |
| `travel` | 82 | 11 |
| `buy-provisions` | 65 | 2 |
| `trade-local` | 38 | 8 |
| `raid` | 16 | 4 |
| `claim-settlement` | 3 | 0 |

He also made 9 of the 15 autonomous retreats. He is the busiest raider in the run (16 of 70) and the busiest retreater.

## What those counts cost

The dollar figures use one measured input and one assumed output.

**Input, measured.** For each `decision-made` the harness serialized the actor, archetype, plan intent, active goal id, and the six logged options as action, target, and resource. Scores and prose reasons were left out. That payload is 13,036,676 UTF-8 bytes across 26,152 decisions. Mean 498.50 bytes, median 498, 90th percentile 513, range 476–536.

**Input tokens, estimate.** One token per four bytes. That is a stand-in, not a call to a tokenizer. Run total 3,259,169 input tokens. Mean 124.62 input tokens per action decision. The full legal list is longer than the logged six, so a pilot that sends every legal row sends more than this. That larger body was not measured.

**Output tokens, estimate, language models only.** Sixteen tokens: a short JSON choice, no reasoning trace, no thinking tokens. 26,152 × 16 = 418,432 output tokens. Jev's published price does not charge output, so this assumption is not part of the Jev total. Gemini's output price includes thinking tokens; a thinking-enabled call is more than the 16-token line, and the extra is not estimated. OpenAI's page does not price this note's calls with reasoning turned on; the nano and mini lines below are the standard per-token rates at 16 output tokens.

| Model | Run of 26,152 action decisions | Per tick (21.79 calls) | Serial latency per tick |
| --- | --- | --- | --- |
| Jev | $0.1369 input. Output $0 | $0.000114 | Estimate: 21.79 × 70–500 ms = 1.5–10.9 s |
| `gpt-5-nano` | $0.1630 input + $0.1674 output = $0.330 | $0.000275 | Not published |
| Groq `gpt-oss-20b` | $0.2444 input + $0.1255 output = $0.370 | $0.000308 | Decode only, estimate: 16 tokens at 1,000/s is 0.016 s per call, 0.35 s per tick. Time to first token is not on the price page |
| `gpt-5-mini` | $0.8148 + $0.8369 = $1.652 | $0.00138 | Not published |
| `gemini-3.5-flash-lite` | $0.9778 + $1.046 = $2.024 | $0.00169 | Decode only, estimate: 16 tokens at the published 350/s is 0.046 s per call, 1.0 s per tick, before time to first token and before any thinking tokens |

Arithmetic, so the rounding can be checked. Jev is 3,259,169 × 0.042 / 1,000,000. Nano input is the same token count × 0.05; nano output is 418,432 × 0.40 / 1,000,000. Mini multiplies input by 0.25 and output by 2. Groq multiplies input by 0.075 and output by 0.30. Gemini multiplies input by 0.30 and output by 2.50.

Plan reviews were counted and not sized. Their dollar cost is not in the table. At the action-decision payload they would add 14,610 further calls, 0.56× the action stream, and most of those calls would be re-deciding an empty pantry.

A smolagents loop at the default cap of 20 steps, pointed at every action decision, is up to 20× the calls and up to 20× the serial latency. That multiple is the cap, not a measured step count. Setting `max_steps` to 1 collapses it back to the table.

Local CPU, transferring the Round 3 averages onto 21.79 calls and labeling the transfer as an estimate: `lfm2.5:1.2b` at 1,567 ms is about 34 s per tick and about 11 hours of serial model time across 1,200 ticks. `qwen3:0.6b` at 3,410 ms is about 74 s per tick. `qwen3:1.7b` at 10,665 ms is about 232 s per tick. The deterministic sim did the same 1,200 ticks in 1.6 s. A local model on that laptop makes the tick wait. The API bill, on these published rates, does not. Jev's 80 requests per second sits above a tick's 22 calls, so a fan-out could in principle wait on one round trip (70–500 ms) instead of the serial sum. `runTick` is synchronous today. The serial column is what a call inserted into the character loop would add.

Pax alone, 853 action decisions, using the run-wide mean payload (his bytes were not split out): 853 / 26,152 of the Jev run, which is $0.0045. Serial Jev time for his calls is 853 × 70–500 ms, about 1.0–7.1 minutes across the whole run, or one published round trip on each tick where he chooses.

## Pilot

Pilot **Pax Ash's action choice**, and nothing else.

One character, one decision type: the `decision-made` line for `character-14`. `buildCandidates` still runs, still draws the RNG, and still defines the legal rows. The provider may return one of those rows. `reviewPlan`, every other character, retreat, contracts, and dialogue stay on the rules. The flag defaults off, so the golden test keeps today's hash.

He is the character the opening already aims at a consequential choice. He produces the raid and retreat sample (16 and 9) without sending the other 25,299 action decisions to a model. Replacing the whole cast would spend 63% of the calls on rest and work. Replacing only the 202 shortlists that contain a raid or a claim is cheaper still (202 / 26,152 of the Jev bill, about $0.001) and too thin to show whether a person got smarter: the model would never have to live with his ordinary day.

Success, all of them:

1. Flag off. Seed 1847 at 72 ticks still hashes to `4ea893a485b05ce6eab599919765903ade9a0ce45f383437f4698064faa7a297` with 8,413 events, and the split at tick 47 still replays 600 events. Seed 1847 at 1,200 ticks still hashes to `90dacc2dfcd199ab720ade191bd3fdf8742632a36f19216bd53ce0e3a3294fef` with 160,268 events.
2. Flag on, and the provider returns `candidates[0]` every time. The tick-1,200 hash and the event count stay on those figures. This is the check that the plug-in still draws the RNG and still writes the scorer's row when it has nothing new to say.
3. The provider throws, times out, or names an action and target that are not on the list. The emitted choice is `candidates[0]`, and the event data says why. A run of forced failures matches the flag-off hash.
4. The provider returns a different legal row. That row is `data.goal` and `data.chosen`, and it is the row `resolveDecision` executes. `WorldStore.recover` replays the log through `applyEvent` only, does not call the provider, and reaches the same `stateHash` as the live world.
5. The run calls the provider once per Pax `decision-made` and not for anyone else. On this baseline that ceiling is 853 calls. His 458 plan reviews stay on `reviewPlan`.
6. At least one logged choice of his differs from `candidates[0]`, the trace shows both rows, and the action is `raid`, `claim-settlement`, or `travel`. If all 853 match the scorer, the hash checks passed and the pilot still failed: he did not get smarter.

His first raid is event tick 0, so criterion 6 will move the 72-tick fixture whenever it fires. That is acceptable on a flagged run. It is not acceptable on the default path, which is why criterion 1 exists.
