# Feed reasons (slice B): brain-written one-line reasons in the feed

Status: **Ruled / build spec** (Lead, after #159; section 12). Acceptance re-sample **passed** on 2026-10-31 (section 13). Base `origin/main` `7f92a4e` (#158). A capped live sample ran on 2026-10-31 at about 22:10 PT: 28 calls, $0.003733 (section 8). Sources: `next-dynamic-slice.md` (candidate B and the Lead ruling "B comes next, after A"), `ai-brain.md` (roles, `data.ai`, replay never calls a model), `ai-providers.md` (the DeepSeek provider, cost line and cap) and `src/dashboard/wording.ts:1233–1255` (today's fixed tax reasons).

## 1. What changes

Today the feed explains only autonomous tax steps, with fixed strings: "treasury short", unrest, or "ruler's choice" when `finalChoice ≠ scorerChoice` (`wording.ts:1250–1252`). Every other event reads as a bare fact. Slice B adds an optional one-line **reason**, written by the brain (`deepseek-v4-pro`, thinking disabled), to a short list of headline events. It changes how the feed reads, never what happens.

## 2. Events that get a reason

| Event | Rule | Per run, 1,200 ticks (1847 / 2718 / 4096) | Fixed fallback |
|---|---|---|---|
| `secession-declared` | all | 4 / 0 / 4 | today's line, no reason |
| `character-deserted` | all | 3 / 2 / 4 | today's line |
| `contract-breached` | `cause: choice`, `detail: better-motive` only (broken by choice; purse and deadline-infeasible keep today's line) | 43 / 15 / 42 | "(for a better offer)" |
| `battle-started` (raid) | tick > 0 | 54 / 41 / 36 | today's line |
| `settlement-claimed` | all | 26 / 25 / 39 | "(surrender accepted)" from `basis` |
| `tax-rate-set` | autonomous and the rate changed | 22 / 26 / 34 | today's fixed reason (`wording.ts:1250–1252`) |
| **Total** | | **152 / 109 / 159** | |

Counts come from offline AI-off runs on main `0cadb85`; `src/` is unchanged from there to `7f92a4e`. Hashes match the pins: 1847 `b51aa07a`, 2718 `091f7628`, 4096 `25bdbf15`.

## 3. Inputs: grounded facts only

The brain sees one JSON object built by code, never free world state. It holds only what the acting character knows:

- **Event facts** copied from the event: kind, tick, port name, and the factions and people involved by display name. Ids are mapped to names in code.
- **The actor:** name, archetype, faction, morale and personality (two decimals). These are the actor's own state.
- **Per kind:**
  - secession: the faction left, the new faction, followers, whether the garrison followed, port stability, the routes;
  - desertion: the faction left and the faction now served;
  - breach: buyer, good, quantity, price, deadline, the cause in words, and the actor's trust and grievance toward the buyer;
  - raid: the defender's faction, attacker troops, defender garrison, the forecast outlook;
  - claim: previous and new holder, basis, garrison;
  - tax: faction, old and new rate, and the scorer's cause.
- **Not included:** other characters' private state, true state the actor has not seen (ports are named, not their hidden holders), or future events.

**Changes the sample calls for** (section 8):
- add the actor's pronoun from the character record, or tell the brain to use the name only;
- give each secession route in words, for example "promise: …", using the definitions in `secession.ts`.

## 4. Output

- JSON `{"reason": "…"}` (`response_format: json_object`), at most **20 words**, one sentence, past tense, third person, plain, with no quotes or numbers beyond those in the facts. `max_tokens` 64, `temperature` 0.
- The engine checks: the JSON parses, the reason is 1–20 words, and every capitalised name and every number in it appears in the input facts. A failed check → **fallback** to the fixed string in section 2, with `fallbackReason` set to `illegal`, `timeout`, `error` or `cap`.
- Recorded at `data.ai.reason = { model, promptVersion, inputHash, text, outcome, fallbackReason, latencyMs }` on the existing event. The feed shows `<today's line> — <text>`.

## 5. Hashes and determinism

- **Hash-neutral.** `stateHash` covers world state only (the M33 rule). The reason lives in event `data.ai` and in wording, so flag-on and flag-off give the same `stateHash`. With the flag off, event JSON is byte-identical too.
- **Nothing reads the reason.** It must never feed back into scoring, relationships or news. A test asserts that no `src/sim` code reads `data.ai.reason`.
- **Replay uses the recorded text** and never calls a model, as in `ai-brain.md`. A replayed event without a recorded reason shows the fixed fallback.
- `temperature: 0` does not make DeepSeek deterministic (not verified), so the recorded text is the only source of truth.

## 6. Limits

- **Per-run spend cap: $0.10** (proposed). The pre-call check uses worst case = prompt UTF-8 bytes × peak miss price + 64 × peak output price, the `ai-providers.md` §6 rule. Past the cap → fallback `cap`.
- **Per-run call cap: 200** (proposed; the measured maximum is 159).
- **Rate.** At most 1 in flight; the 8,000 ms timeout → fallback. DeepSeek's rate limits are as noted in `ai-providers.md`.
- **Caching.**
  - The system prompt is fixed, so DeepSeek's prefix cache serves it: 3,456 cache-hit tokens over 28 calls in the sample.
  - Locally, identical `inputHash` → reuse the recorded text within a run. In the sample, no two items had the same facts.
- **Cost log:** one line per call, in `cost.jsonl` format, carrying role `brain.feedReason`.

## 7. Gating

- `ai.reasons` (per-role flag under `ai.enabled`), **default off**.
- It needs `DEEPSEEK_API_KEY`. Without the key, every reason falls back and logs `missing-key`.
- Live runs follow Micah's standing approval: caps and cost logs on.

## 8. Live sample (2026-10-31)

**Set.** 28 events: per seed, the first 2 secessions, 2 desertions, 2 better-motive breaches, 1 raid (tick > 0), 1 claim and 2 autonomous tax changes. 2718 has no secession. They come from offline 1,200-tick runs of seeds 1847 / 2718 / 4096 on `7f92a4e`. Facts were built from engine state at the event's tick by `docs/playtests/feed-reasons-2026-10-31/build.ts`.

**Run.** `probe.mjs`, the same directory. It did a dry run first (28 calls, worst case $0.047628), then went live. Settings: caps of 40 calls / $0.25, checked before each call; `deepseek-v4-pro` with thinking disabled, JSON output, `max_tokens` 64, `temperature` 0. The key was never logged; a check of the committed files finds no key.

**Result.**
- **28 calls, all HTTP 200, `finish_reason: stop`, $0.003733 actual**, all at the off-peak price.
- Tokens in 230–293, out 16–30; latency 785 / 1,263 / 1,922 ms (min / median / max).
- Log: `live-log.jsonl`.

**Grading** (the Researcher's reading against each item's facts in `set.jsonl`):
- **Faithful** = nothing contradicts or misreads the facts.
- **Invented fact** = it states something not in the input.
- **Length** = at most 20 words.

| # | Item | Event | Reason (verbatim) | Words | Faithful | Invented fact |
|---|---|---|---|---|---|---|
| 1 | 1847-535 | raid | Mina Vale raided Glassport despite being outnumbered, driven by curiosity and a desire to disrupt the World Government. | 18 | partial | yes: motive "disrupt the World Government" |
| 2 | 1847-6695 | claim | Dax Pike accepted the surrender of Glassport for the Free Tide Compact. | 12 | yes | no |
| 3 | 1847-8248 | tax | Pax Ash lowered taxes to quell unrest in a held port. | 11 | yes | no |
| 4 | 1847-8249 | tax | She lowered taxes to ease unrest in a held port. | 10 | partial | yes: gender ("She") |
| 5 | 1847-9846 | breach | Lio breached the contract to pursue a more profitable opportunity. | 10 | yes | no |
| 6 | 1847-33747 | breach | Lio dropped the contract for a better-paying option. | 8 | yes | no |
| 7 | 1847-103495 | secession | Niko Wren seceded from the World Government to form Free Glassport, driven by ambition and loyalty to his followers. | 19 | partial | yes: "loyalty to his followers" (motive, gender) |
| 8 | 1847-104074 | secession | Corin Hale seceded from Free Tide Compact to form Free Glassport II, driven by ambition and loyalty to Glassport. | 19 | partial | yes: "loyalty to Glassport" (motive) |
| 9 | 1847-107490 | desertion | Mina Vale left the Free Tide Compact due to low morale. | 11 | yes | no |
| 10 | 1847-107491 | desertion | She lost faith in the Free Tide Compact and chose to strike out alone. | 14 | partial | yes: gender ("She") |
| 11 | 2718-763 | raid | Orin Rill raided Cinder Key despite being outnumbered, driven by high aggression and ambition. | 14 | yes | no |
| 12 | 2718-4520 | claim | Jun Marrow accepted the surrender of Cinder Key to secure it for the World Government. | 15 | yes | no |
| 13 | 2718-5502 | tax | She lowered taxes to ease unrest in a held port. | 10 | partial | yes: gender ("She") |
| 14 | 2718-8186 | tax | Pax Ash lowered taxes to quell unrest in a held port. | 11 | yes | no |
| 15 | 2718-10547 | breach | Bram Tern breached the contract to pursue a more profitable opportunity. | 11 | yes | no |
| 16 | 2718-10781 | breach | Finn Frost breached the contract with Pax Ash to pursue a more profitable opportunity. | 14 | yes | no |
| 17 | 2718-90684 | desertion | Mina Vale left the Free Tide Compact due to low loyalty and morale. | 13 | yes | no (loyalty 0.46 called "low": overreach) |
| 18 | 2718-90685 | desertion | He left the Free Tide Compact to pursue his own path. | 11 | partial | yes: gender ("He") |
| 19 | 4096-623 | raid | Rook Tern raided Cinder Key out of loyalty to the World Government, despite being outnumbered. | 15 | yes | no |
| 20 | 4096-4973 | claim | Mara Calder accepted the surrender of Glassport for the Free Tide Compact. | 12 | yes | no |
| 21 | 4096-8298 | breach | Zara Gale breached the contract to pursue a better-paying option. | 10 | yes | no |
| 22 | 4096-8413 | tax | Pax Ash lowered taxes to quell unrest in a held port. | 11 | yes | no |
| 23 | 4096-9116 | breach | Zara Gale breached the contract to pursue a more profitable opportunity. | 11 | yes | no |
| 24 | 4096-16978 | tax | Pax Ash raised taxes to address a treasury short. | 9 | yes | no |
| 25 | 4096-43430 | secession | Mara Calder seceded from Free Tide Compact due to low ambition and high caution, prioritizing stability. | 16 | partial | no, but a misleading cause: traits read as the reason, the "promise" route ignored |
| 26 | 4096-48303 | secession | Ada Sorn seceded from the World Government due to high curiosity and ambition, seeking independence for Crown Harbor. | 18 | yes | no |
| 27 | 4096-55326 | desertion | Zara Gale left the Free Tide Compact due to low morale and weak loyalty. | 14 | yes | no |
| 28 | 4096-72116 | desertion | She abandoned the Free Tide Compact to pursue her own ambitions. | 11 | partial | yes: gender ("She") |

**Rates.**
- **Faithful: 19 / 28 (68%).**
- **Invented fact: 8 / 28 (29%)**:
  - 5 are a gender pronoun ("She" / "He"), which the input never gives;
  - 3 are motives ("disrupt the World Government", "loyalty to his followers", "loyalty to Glassport").
- One more is misleading without an invented fact (#25: traits given as the cause of a "promise" secession).
- **Length: 28 / 28 within 20 words** (8–19, mean 12.8).
- All 6 breaches, 3 claims and the 4 named tax lines are faithful. The failures cluster on secessions (3 of 4 flawed) and on unnamed lines.

**Reading.** The pronoun failures need only a prompt fix: "always start with the character's name" plus a pronoun field. The motive inventions are on secessions and raids, where the facts give no cause in words. Section 3's route-in-words change targets that. The name/number check in section 4 would not catch either kind, because both use no new names. A re-sample after the prompt fix (≈ 28 calls, ≈ $0.004) is the acceptance gate below.

## 9. Projected cost per run

The sample's mean was $0.000133 per call off-peak. At the peak price on the same tokens it is $0.000267.

| Seed | Events | Off-peak | Peak |
|---|---|---|---|
| 1847 | 152 | $0.020 | $0.041 |
| 2718 | 109 | $0.015 | $0.029 |
| 4096 | 159 | $0.021 | $0.042 |

That is below the earlier ≈ $0.11 estimate (`next-dynamic-slice.md`), which assumed 2,000 input tokens per call; the measured figure is 230–293. The $0.10 cap leaves about 2× headroom at peak.

## 10. Acceptance

1. Flag off: 1,200-tick hashes and event counts byte-identical to the pins (1847 `b51aa07a`/156382, 2718 `091f7628`/157208, 4096 `25bdbf15`/160697), and the 72-tick pins hold.
2. Flag on, stub brain: `stateHash` equals flag-off on all three seeds. Only `data.ai.reason` differs.
3. Replay of a flag-on log makes zero network calls and gives byte-identical feed text.
4. The validator rejects:
   - a reason over 20 words;
   - an unknown capitalised name;
   - a number not in the facts;
   - malformed JSON.

   Each falls back to the fixed string.
5. The cap stub gives fallback `cap` after the cap, with spend never above it.
6. A live re-sample after the prompt fix (same 28 items, ≤ 40 calls, ≤ $0.25 cap): **invented facts ≤ 1 / 28, faithful ≥ 26 / 28**, all within 20 words.

## 11. Open questions (for the Lead)

1. **Event list.** Raids (36–54 per run) and breaches (15–43) dominate the calls. Keep them, or limit reasons to secessions, desertions, claims and tax changes (≈ 55–71 per run)?
2. **Pronouns.** Add a pronoun to the character record, or require name-only lines?
3. **Secession motive.** Is the route list enough grounding, or should the secession event carry the triggering grievance or promise in words?
4. **Validator strictness.** A capitalised-name check misses invented motives. Is a second check acceptable, for example a Jev Noul "does the reason state anything not in the facts?" at about $0.00003 per call? Or is prompt discipline enough?
5. **Ordering.** B depends on A only for the lines A adds ("…to win back <P>"). Should B also cover A's home-port-claim raids once they are built?

## 12. Lead rulings (after #159)

1. **Caps:** $0.10 and 200 calls per run.
2. **All five open-question defaults are accepted:**
   - every event type in section 2 keeps a reason;
   - lines are name-only;
   - the trigger is spelled out in words in the facts;
   - a Jev check for invented motives;
   - A's home-port raids get reasons once A lands.

**Prompt and facts as built for the re-sample** (they supersede sections 3–4 where they differ):
- **Every fact packet has a `trigger` field in words**, taken from the engine's own rule:
  - secession: the route, e.g. "broken promises: 12 supply contracts owed to Glassport were broken in the last 240 days (the line is 10)", from `secessionRoutes` (`src/sim/secession.ts:466–484`); the tax and grievance routes have their own wording;
  - desertion: "twelve mornings in a row without money for a day of passage, then a desertion roll that came up" (`src/sim/desertion.ts:48–77`);
  - breach: "dropped the accepted contract for a better-paying option";
  - claim: "the port surrendered and the claim was accepted";
  - tax: "the treasury was short" or "unrest in a port the faction held";
  - raid: "not recorded: the raid event carries no cause".
- **System prompt:**
  - start with `actor.name` exactly;
  - never use a pronoun for a person; repeat the name;
  - give as the cause only what `trigger` says, and if no cause was recorded, state the act without a motive;
  - a personality value may be a describing word, never the cause;
  - at most 20 words.

  Full text: `docs/playtests/feed-reasons-resample-2026-10-31/probe.mjs`.
- **Jev motive check:** one Noul per reason on `jev-1.14.0`.
  - Request: `state = {facts, reason}`, with the question: "Does the reason state any motive, cause or fact that is not in the facts? Wording that only restates the facts, or describes a listed personality trait, is not new. Answer yes if it adds a cause, a feeling, a relationship, a gender, a person, a place or a number that the facts do not contain."
  - It flags at `noul ≥ 0.5`, and a flag replaces the reason with the fixed fallback (`fallbackReason: "check"`).
  - Cost about $0.000024 per call; it uses the same cap and cost log.
  - **Its status is advisory** (section 14).

## 13. Acceptance re-sample (2026-10-31, about 22:20 PT)

**Set.** The same 28 events (identical ids), rebuilt on main `b0ac371` with the trigger fields (`build.ts`). `src/` is unchanged from `7f92a4e`.

**Run.** The dry run came first. Its worst-case accumulation (peak prices, a full 64 output tokens) would have stopped at 22 brain items, because the pre-call check is deliberately pessimistic. The live run's actual spend stayed far below. Caps: 70 calls and $0.05 total across brain and Jev, checked before every call. The keys were never logged, and a check of the committed files finds none.

| Part | Calls | Spend |
|---|---|---|
| Brain (`deepseek-v4-pro`, thinking disabled, off-peak) | 28 | $0.007355 |
| Jev check on the re-sample reasons | 28 | $0.000679 |
| Jev check on 14 first-sample reasons (scoring, section 14) | 14 | $0.000328 |
| **Total** | **70** | **$0.008362** |

- All calls returned HTTP 200.
- Brain: tokens in 312–365 (the trigger adds about 70), latency 980–2,986 ms.
- Jev: latency 44–115 ms.
- Logs: `live-log.jsonl` (brain and checker, one line per call) and `live-log-checker.jsonl`.

**Manual grades** (the Researcher, against each item's facts in `set.jsonl`):

| # | Item | Event | Reason (verbatim) | Words | Faithful | Invented | Jev noul |
|---|---|---|---|---|---|---|---|
| 1 | 1847-535 | raid | Mina Vale raided Glassport. | 4 | yes | no | 0.06 |
| 2 | 1847-6695 | claim | Dax Pike claimed Glassport after the port surrendered and the claim was accepted. | 13 | yes | no | 0.05 |
| 3 | 1847-8248 | tax | Pax Ash lowered the tax rate from 8% to 7% due to unrest in a port the faction held. | 19 | yes | no | 0.07 |
| 4 | 1847-8249 | tax | Mara Vane lowered the tax rate due to unrest in a port the faction held. | 15 | yes | no | 0.07 |
| 5 | 1847-9846 | breach | Lio Crow dropped the accepted contract for a better-paying option. | 10 | yes | no | 0.11 |
| 6 | 1847-33747 | breach | Lio Crow dropped the accepted contract for a better-paying option. | 10 | yes | no | 0.13 |
| 7 | 1847-103495 | secession | Niko Wren seceded Glassport from the World Government after broken promises. | 11 | yes | no | 0.07 |
| 8 | 1847-104074 | secession | Corin Hale seceded from Free Tide Compact after broken promises. | 10 | yes | no | 0.07 |
| 9 | 1847-107490 | desertion | Mina Vale deserted the Free Tide Compact after twelve mornings without money for a day of passage. | 17 | yes | no | 0.06 |
| 10 | 1847-107491 | desertion | Esme Dusk deserted the Free Tide Compact after twelve mornings without money for a day of passage. | 17 | yes | no | 0.06 |
| 11 | 2718-763 | raid | Orin Rill raided Cinder Key. | 5 | yes | no | 0.05 |
| 12 | 2718-4520 | claim | Jun Marrow claimed Cinder Key after the port surrendered and the claim was accepted. | 14 | yes | no | 0.04 |
| 13 | 2718-5502 | tax | Mara Vane lowered the tax rate due to unrest in a port the faction held. | 15 | yes | no | 0.07 |
| 14 | 2718-8186 | tax | Pax Ash lowered the tax rate due to unrest in a port the faction held. | 15 | yes | no | 0.06 |
| 15 | 2718-10547 | breach | Bram Tern dropped the accepted contract for a better-paying option. | 10 | yes | no | 0.16 |
| 16 | 2718-10781 | breach | Finn Frost dropped the accepted contract for a better-paying option. | 10 | yes | no | 0.16 |
| 17 | 2718-90684 | desertion | Mina Vale deserted the Free Tide Compact after twelve mornings without money for a day of passage. | 17 | yes | no | 0.07 |
| 18 | 2718-90685 | desertion | Finn Frost deserted the Free Tide Compact after twelve mornings without money for a day of passage. | 17 | yes | no | 0.06 |
| 19 | 4096-623 | raid | Rook Tern raided Cinder Key. | 5 | yes | no | 0.05 |
| 20 | 4096-4973 | claim | Mara Calder claimed Glassport after the port surrendered. | 8 | yes | no | 0.05 |
| 21 | 4096-8298 | breach | Zara Gale dropped the accepted contract for a better-paying option. | 10 | yes | no | 0.15 |
| 22 | 4096-8413 | tax | Pax Ash lowered the tax rate due to unrest in a port the faction held. | 15 | yes | no | 0.06 |
| 23 | 4096-9116 | breach | Zara Gale dropped the accepted contract for a better-paying option. | 10 | yes | no | 0.15 |
| 24 | 4096-16978 | tax | Pax Ash raised taxes because the treasury was short. | 9 | yes | no | 0.05 |
| 25 | 4096-43430 | secession | Mara Calder seceded from Free Tide Compact due to broken promises. | 11 | yes | no | 0.05 |
| 26 | 4096-48303 | secession | Ada Sorn seceded from World Government after broken promises. | 9 | yes | no | 0.06 |
| 27 | 4096-55326 | desertion | Zara Gale deserted the Free Tide Compact after twelve mornings without money for passage. | 14 | yes | no | 0.07 |
| 28 | 4096-72116 | desertion | Esme Dusk deserted the Free Tide Compact after twelve mornings without money. | 12 | yes | no | 0.12 |

**Result: PASS.**
- **Faithful: 28 / 28. Invented facts: 0 / 28.** The bar was at most 1 invented and at least 26 faithful.
- Length 4–19 words. Every line starts with the name, and none uses a pronoun.
- **Trade-off:** raids now read as bare acts ("Mina Vale raided Glassport."), because the raid event records no cause. A real raid reason needs the engine to record why: the decision score or A's home-port claim.

## 14. Jev checker vs manual grades

The re-sample has no invented facts, so it can only test false alarms. To test catches, the checker was also run (14 calls, within the same cap) on 14 first-sample reasons (section 8): all 8 with an invented fact, the 1 misleading line, and 5 faithful lines. That gives 42 graded items: 8 positive and 34 negative.

| Threshold | Agreement (42) | Catches (of 8) | Misses | False alarms (of 34) |
|---|---|---|---|---|
| 0.3 | 37 / 42 = 88% | 5 | 3 | 2 |
| **0.5 (used)** | **35 / 42 = 83%** | **3** | **5** | **2** |
| 0.6 | 34 / 42 = 81% | 2 | 6 | 2 |

- **At 0.5:**
  - catches: #1 "disrupt the World Government" 0.57; #10 "She" 0.83; #18 "He" 0.60;
  - misses: three pronoun lines (#4 0.21, #13 0.24, #28 0.31) and two invented loyalty motives (#7 0.24, #8 0.43);
  - false alarms: #25 (traits given as the cause; graded misleading, not invented) 0.64, and #27 (a faithful desertion line) 0.65.
- On the 28 re-sample reasons, the checker agreed 28 / 28 (max noul 0.16).
- **Ruling recorded: the checker is advisory only.** Headline agreement is 83%, but that figure is padded by easy negatives. On the items that matter it **catches 3 of 8 (38%)**, and on the 14 first-sample items it agrees 7 / 14. It is logged in `data.ai.reason.check` and shown in the dashboard. It does **not** replace text, until a reworded check catches at least 6 of 8 with no more than 2 false alarms in 34. The pronoun ban and the trigger-only cause rule are the real defence: they took invented facts from 8 to 0.
