# AI brain judgment: from rubber stamp to a ruler's own call

Status: **Open / design.** Analysis of the prompt v2 live runs plus offline checks. No API call or spend was made for this note. The live check in section 5 **needs a fresh yes from Micah** before it runs.

## 1. What v2 did (verified from the output)

Output: `simulation-output/ai-prompt-v2/live-{1847,2718,4096}-240` on the box, from `feature/ai-prompt-v2` at `131cd82`.

| Seed | Brain calls | Agree with scorer | Fallbacks | Spend (USD) | Live end hash | Flag-off hash at 240 ticks (offline, `131cd82`) |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| 1847 | 6 | 6 | 0 | 0.00204303 | `a30b4361` / 28211 | `a30b4361` / 28211 |
| 2718 | 7 | 7 | 0 | 0.002351616 | `567505d9` / 29059 | `567505d9` / 29059 |
| 4096 | 9 | 9 | 0 | 0.003093636 | `061f3de4` / 29363 | `061f3de4` / 29363 |
| **Total** | **22** | **22** | 0 | **0.007488** | | |

- Agreement is **22 of 22**, and the spend totals $0.0075, as the Lead said.
- The end hash equals flag-off on **all three seeds**, not only 1847. With every choice equal to the scorer's, the world is the scorer's world.
- The hold bias is gone. Live choices include down (5), up (4) and hold (13).
- The reasons restate the rule we showed. 12 of the 22 contain the words "per standing rule" (for example `"No port pressed and pay covered, so hold per standing rule."`), and the rest paraphrase `scorerReason` ("Port at revolt line; cut tax to calm unrest."). None names the ruler's temperament, grudges or plans. Brain output was 19–25 tokens, within the 64-token limit.

**Cause.** The v2 line `The standing rule recommends {scorerChoice}: {scorerReason}` hands the model the answer and its justification. The only other inputs (thresholds, rate, treasury) are the same ones the scorer uses, and the briefing carries no temperament. With nothing the rule ignores, the safest move for the model is to agree.

## 2. What the brain is for

- `game-vision.md`: "Characters pursue their own ambitions" (line 11); "Autonomous characters plan freely from their motives and knowledge. The simulation validates every proposed action and applies the consequences. Language-model text must never be allowed to bypass game rules" (line 19); "Resistance must emerge from characters, material conditions, opportunities, and player action" (line 39).
- `ai-brain.md`: the brain is asked only for big decisions (line 5). The scorer still runs, still draws, and is the fallback (section 2, items 3 and 4). The fallback chain is brain → scorer (default 12).

A brain that only copies the scorer adds cost and no character. The point is a ruler whose temperament and situation can lead to a different but legal call, with the rules still in charge.

## 3. Options

| Option | What changes | For | Against |
| --- | --- | --- | --- |
| **A. Hide the pick** | Drop the "standing rule recommends" line. Keep the explained thresholds | Removes the anchor | The inputs are still exactly the scorer's, so a good model rebuilds the same rule. Expect agreement to stay high, now with no reason to differ |
| **B. Feed what the scorer ignores** | Add the ruler's personality (ambition, aggression, caution, commerce, loyalty), pay days covered, and the Pilot B briefing (morale, grudges, allies, known ports) | Gives the model something to judge with | With the pick still shown, the anchor likely wins |
| **C. Both (recommended)** | Hide the pick, add temperament and treasury outlook, and turn the safety part of the rule into a hard rail | Judgment from character state; safety kept by code, not by trust | Larger prompt; disagreement must be checked for noise |

**Recommended default: C.** The safety half of the scorer becomes a rule the code enforces, and the rest becomes the character's call:

- **Hard rail, in code.** When `pressed` (a held port at or below stability 55), `up` is not accepted. When `short` and not pressed, `down` is not accepted. A railed answer counts as `illegal` and falls back to the scorer. So revolt and pay safety cannot be broken by the model.
- **Judgment inside the rail.** At a pressed point the ruler may cut or hold; at a short point, raise or hold; otherwise any legal step. Temperament decides, for example a high-ambition, low-caution ruler holding at the line, or a cautious one cutting early.
- The prompt asks for a reason that names what in the temperament or situation decides it.

## 4. Guard rails (unchanged unless stated)

1. **Legal options only.** `parseTaxChoice` against the option set, narrowed by the rail when a context reader is set. Anything else is `illegal` and falls back to the scorer.
2. **Fallback.** Timeout 30,000 ms, error, illegal, call cap and spend cap: the scorer's choice, reason recorded on `data.ai`.
3. **Replay recorded.** The choice rides on `tax-rate-set`; `data.ai` records the request hash, prompt version and raw answer. Replay never calls a model.
4. **Flag off byte-identical.** The new request fields (`persona`, `payDaysCovered`) are set only when a context reader is present, and the rail only narrows the parse when it is.

### How much disagreement is healthy, and how we know it is not noise

No measurement exists yet. As a proposal: **10–40% of points**. Under 10% means it is still a stamp; over 40% means the rule's safety logic is being ignored (the rail would show it as illegal fallbacks) or the model is guessing. Disagreement counts as **judgment, not noise**, only if all three hold:

1. **Stated and tied.** Every override's reason names a temperament trait or situation field that is actually in the prompt (checked by matching the reason against the request fields).
2. **Repeatable.** The same request gives the same choice. Re-asking an identical request (same `inputHash`) must reproduce the choice; temperature is 0.
3. **Directional.** Overrides lean the way the trait points across rulers: higher caution leans down, higher ambition or commerce leans up or hold. With one ruler per run this can only be spot-checked at first.

## 5. Offline check (done, no network)

The proposal as a patch, uncommitted, on the box at `/workspace/ai-brain-judgment-v3.patch`, applied in a scratch worktree on `131cd82`. Node v24.22.1 / ICU 78.3.

- **`npm test`:** 535 tests, 534 passed, 1 failed. The failure is `tests/ai-prompt-v2.test.ts`, "the tick-96 prompt renders as in the rationale doc", which pins the v2 text. A v3 build would replace that test.
- **Hashes, 1,200 ticks, base `131cd82` and v3 alike:** flag off and stubs (`stubAgree` + `stubContextEcho`):

| Seed | Flag off | Stubs | 240-tick flag off = stubs |
| --- | --- | --- | --- |
| 1847 | `c4d99822` / 163679 | `c4d99822` / 163679 | `a30b4361` / 28211 |
| 2718 | `738181c0` / 159177 | `738181c0` / 159177 | `567505d9` / 29059 |
| 4096 | `cbd66565` / 161386 | `cbd66565` / 161386 | `061f3de4` / 29363 |

Byte-identical. The agree stub's choice is the scorer's, which always lies inside the rail.

- **Request sizes:** full DeepSeek request body, UTF-8 bytes, over every call on the stubs at 1,200 ticks:

| Seed | Calls | v2 min–max (mean) | v3 min–max (mean) |
| --- | ---: | --- | --- |
| 1847 | 33 | 1502–1712 (1614.3) | 1727–1946 (1838.3) |
| 2718 | 27 | 1481–1706 (1623.1) | 1706–1940 (1845.4) |
| 4096 | 30 | 1524–1776 (1635.6) | 1748–1994 (1859.3) |

v3 adds about 225 bytes per request.

The v3 user prompt at 1847 tick 96, rendered offline:

```
You are character-14, who holds the tax seat of free-tide at tick 96. Decide as this person would, from their temperament and situation.
Tax rate: 8% (allowed 0% to 30%, one point per step).
Unrest: lowest port stability 55.00; revolt risk at or below 55.00. PRESSED: a port is at the revolt line.
Pay: The treasury covers a day's pay. Treasury 62518 cents, 4 days of pay for 8 free mates.
Your temperament (0 to 1): ambition 0.94, aggression 0.97, caution 0.08, commerce 0.67, loyalty 0.71.
Safety: when a port is at the revolt line you may not raise; when pay is short and no port is pressed you may not cut.
Options: down = cut the rate one point (calms unrest, less income); hold = keep the rate; up = raise the rate one point (more income, more unrest).
Briefing on you (validated, at most 1,024 bytes): {…}.
Reply as JSON with a reason of at most 12 words naming what in your temperament or situation decides it, then the choice: {"reason":"...","choice":"<option>"}.
```

## 6. Live check plan: needs a fresh yes from Micah

Not run. Three runs at 240 ticks with v3: **1847, 4096, and 1847 again** (the repeat tests noise). Each run uses `--ai-vendor --ticks 240 --max-calls 10 --cap-usd 0.02`.

**Estimated cost, peak prices:**

- **Brain input per call:** v2 live input was 381–435 tokens. Scaled by the largest v3/v2 body ratio, 435 × 1,994 / 1,776 ≈ **488 tokens** at most.
- **Brain per call:** 488 × $1.32 / M + 64 × $3.96 / M = $0.000644 + $0.000253 = **$0.000897**. This assumes the full 64 output tokens; v2 used 19–25.
- **Reader per call:** v2 Jev input was 742–826 tokens; 826 × $0.042 / M = **$0.0000347**.
- **Per run:** 10 × $0.000932 = **$0.0093**. Three runs: **$0.028**. For scale, the v2 runs spent $0.0075 for 22 calls.

**Hard cap:** $0.02 per run, checked before every call, so **$0.06** at most in total.

**Pass, all of:**

1. **Real disagreement.** Overrides at 10–40% of points across the three runs.
2. **Reasons tied to character state.** Every override's reason names a temperament trait or situation field present in its prompt.
3. **No safety broken.** Zero `up` at a pressed point and zero `down` at a short, unpressed point among model outcomes. Rail fallbacks are counted and reported.
4. **Not noise.** The 1847 repeat gives the same choice at every point where the two runs' `inputHash` match.
5. **Recorded.** `fallbacks`, raw answers and cost lines are all recorded, and replay of each run reaches its live hash with no vendor call.

## 7. Who decides

Running the live check, the keys and the spend need Micah's go-ahead.

## 8. Defaults

1. Option C: hide the scorer's pick; add temperament and pay days covered; keep the explained thresholds.
2. Hard rail in code: no raise when pressed; no cut when short and unpressed.
3. Each reason must name the trait or field that decides it.
4. Healthy disagreement is 10–40% of points; noise is checked by repeat runs.
5. Live check: 3 runs × 240 ticks, cap $0.02 per run, `--max-calls 10`, only after a fresh yes.
