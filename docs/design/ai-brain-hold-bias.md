# AI brain hold bias: why DeepSeek answered hold at every tax point

Status: **Open / diagnosis and proposal.** Docs only. Analysis of the first live run. No API call, no live run and no paid call was made to write it. The check in section 4 is **not to be run until Micah approves the spend.**

## The run

`simulation-output/ai-providers/live-1847-240` (a run directory on the box, not in the repo), made from `feature/ai-providers` at `d14323b`: seed 1847, 240 ticks, `mode: vendor`, `stateHash 77962c09…`, 28,313 events, 8 brain calls, 16 cost lines, 0 fallbacks, spend $0.001962402 of a $0.25 cap (`summary.json`).

| Tick | `pressed` | `short` | Lowest stability (thousandths) | Treasury (cents) | Mates | Scorer | Brain raw answer | Final |
| ---: | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| 24 | false | false | 72720 | 230542 | 8 | hold | `{"choice":"hold"}` | hold |
| 48 | false | false | 67870 | 186211 | 8 | hold | `{"choice":"hold"}` | hold |
| 96 | **true** | false | 55000 | 62518 | 8 | **down** | `{"choice":"hold"}` | hold |
| 120 | false | false | null | 34830 | 8 | hold | `{"choice":"hold"}` | hold |
| 144 | false | false | null | 14919 | 8 | hold | `{"choice":"hold"}` | hold |
| 168 | false | **true** | 57580 | 5829 | 7 | **up** | `{"choice":"hold"}` | hold |
| 192 | **true** | true | 55000 | 8497 | 7 | **down** | `{"choice":"hold"}` | hold |
| 216 | false | **true** | null | 1744 | 7 | **up** | `{"choice":"hold"}` | hold |

The four overrides are two skipped cuts (96 and 192, both at the revolt line) and two skipped raises (168 and 216, both short of pay). Raw answers, scorer choices and `outcome` come from `trace.json`. The rate was 8 cents (0.08) throughout.

**How the request fields were recovered.** `trace.json` records `inputHash` but not the request. An offline harness at `d14323b` replayed seed 1847 for 240 ticks with a brain that answers hold and a reader that returns the recorded briefing for each tick. It reached the live `stateHash` (`77962c09…`, 28,313 events), and the sha256 of each of the eight rebuilt requests equals the recorded `inputHash`. So the request columns above, and the prompt text below (a pure function of the request and the pinned template), are exactly what DeepSeek was sent.

## 1. Diagnosis

**Cause: prompt framing, with missing context as the second part. Not the 32-token limit.**

### Not the answer limit, not truncation

- Every brain cost line has `tokensOut: 5` (`cost.jsonl`), far under `max_tokens: 32`. `{"choice":"hold"}` is the whole answer.
- `finish_reason` is **not logged** on the cost line. It is still ruled out by the code: `deepSeekBrain` turns `finish_reason: "length"` into `raw: null`, which the engine records as `illegal`. All eight records are `outcome: "model"`, `parsedChoice: "hold"`, `fallbackReason: null`, and `summary.json` has `fallbacks: 0`, so none was cut.
- JSON mode with 32 tokens does not truncate, but the format asks only for the choice, so the model commits in five tokens with no stated basis. That favours a default. It is a contributing factor, not the cause.

### Framing (the main cause)

The prompt DeepSeek received at tick 96, rebuilt exactly (system message: `Answer as JSON: {"choice":"<option>"}.`):

```
You hold the tax seat of free-tide at tick 96.
The rate is 8 cents. Pressed: true. Short: false.
Lowest held-port stability (thousandths): 55000.
Treasury (cents): 62518. Free mates: 8.
Choose one of ["down","hold","up"]. Answer as JSON: {"choice":"<option>"}.
Briefing on the holder (validated, at most 1,024 bytes): {…personal briefing…}.
```

- **No goal.** Nothing says what the holder is trying to achieve: keep ports from revolting and keep mates paid.
- **Internal flags without meaning.** `Pressed` and `Short` are scorer variable names. The prompt never says that pressed means a held port is at or below the revolt line (`CLAIM_STABILITY_FLOOR = 55` in `src/sim/state.ts`; `pressed = known && lowest <= CLAIM_STABILITY_FLOOR * 1000` in `src/sim/tax-rate.ts`), or that short means the treasury cannot cover a day's pay for the mates.
- **Unrest arrives as a bare number, with no scale or threshold.** `55000` thousandths is exactly the revolt line, but the prompt gives neither the scale nor the line. At 120, 144 and 216 the figure is the word `null` (no current report).
- **The rate reads as money.** "8 cents" means a 0.08 rate on a 0 to 0.30 scale, which is not stated.
- **Options are bare words.** `["down","hold","up"]` says nothing about what each does to unrest or income.
- **The scorer's choice and reason are not shown.** `scorerChoice` is in the request (and in the recorded `inputHash`), but the template has no slot for it, so the model never sees that the standing rule says cut or raise, or why.

With no goal, no meaning for the flags and no effect for each option, the neutral middle option is the safe answer, and the model gave it eight times out of eight.

### Missing context (the second part)

- The revolt line and the pay threshold are not in the prompt.
- The briefing is the holder's personal state (morale, loyalty, grudges, allies, known ports with garrison and age). It has **no port stability or unrest**. The only unrest figure is the bare `lowestStabilityThousandths`.
- One day's pay (`dayCents`) is not in the request, so the model could not check "short" even with it explained. The fix states the flag's meaning instead of adding a field.

### Option order and default

The options always arrive as `down, hold, up` (built in that order in `taxStepOptions`), so hold is always in the middle. The prompt names no default. Eight answers on one seed cannot separate position bias from the framing above, and nothing in the record isolates it. The fix keeps the order and gives each option its effect.

## 2. Proposed fix: prompt v2

Change the briefed template and the DeepSeek request only. No request field, rule, event or reducer changes.

1. State the goal: keep ports from revolting and the crew paid.
2. Give the rate as a percent with its bounds: `Tax rate: 8% (allowed 0% to 30%, one point per step).`
3. Give unrest in plain terms, with the line: `lowest port stability 55.00; revolt risk at or below 55.00. PRESSED: a port is at the revolt line.` A null figure becomes `no current stability report from your ports.`
4. Give pay in plain terms: `SHORT: the treasury cannot cover a day's pay for the mates.`
5. Show the standing rule and its reason: `The standing rule recommends down: a port is at the revolt line, so cut.`
6. List options with their effects: `down = cut the rate one point (calms unrest, less income); hold = keep the rate; up = raise the rate one point (more income, more unrest).`
7. Ask for a short reason before the choice, `{"reason":"<at most 12 words>","choice":"<option>"}`, and raise `max_tokens` to **64**. `parseTaxChoice` already reads `.choice` from an object, and `rawAnswer` (capped at 400 characters) keeps the reason for audit.
8. Log `finish_reason` on the brain cost line.

The slots are derived from the request in `deepSeekRequestBody` (`taxStepPromptSlots`), so the request, its `inputHash` schema and the stubs are unchanged. `promptVersion` changes because the template changes. The patch used for the offline check is on the box at `/workspace/ai-brain-hold-bias-prompt-v2.patch`. It is uncommitted and not on this branch.

The v2 prompt at tick 96, rendered offline from the recovered request:

```
You hold the tax seat of free-tide at tick 96. Your job is to keep the faction's ports from revolting and its crew paid.
Tax rate: 8% (allowed 0% to 30%, one point per step).
Unrest: lowest port stability 55.00; revolt risk at or below 55.00. PRESSED: a port is at the revolt line.
Pay: The treasury covers a day's pay.
Treasury: 62518 cents for 8 free mates.
The standing rule recommends down: a port is at the revolt line, so cut.
Options: down = cut the rate one point (calms unrest, less income); hold = keep the rate; up = raise the rate one point (more income, more unrest).
Briefing on you (validated, at most 1,024 bytes): {…}.
Reply as JSON with a reason of at most 12 words, then the choice: {"reason":"...","choice":"<option>"}.
```

User-message size at the eight points: v1 776–896 bytes, v2 1,176–1,303 bytes.

Showing the scorer's choice risks the model copying it. That is acceptable here: an override should come with a reason, and the check measures agreement.

## 3. Offline check (done, no network)

On `d14323b` with the v2 patch, in a scratch worktree, Node v24.22.1 / ICU 78.3 (24.21 was no longer on the box):

- `npm test`: 529 tests, 528 passed, 1 failed. The failure is the `tests/ai-providers.test.ts` assertion that `max_tokens` is 32; the build would change it to 64. No other test moved.
- 1,200 ticks, flag off and stubs (`stubAgree` + `stubContextEcho`), base `d14323b` against v2:

| Seed | Base flag off | v2 flag off | Base stubs | v2 stubs |
| --- | --- | --- | --- | --- |
| 1847 | `c4d99822` / 163679 | `c4d99822` / 163679 | `c4d99822` / 163679 | `c4d99822` / 163679 |
| 2718 | `738181c0` / 159177 | `738181c0` / 159177 | `738181c0` / 159177 | `738181c0` / 159177 |
| 4096 | `cbd66565` / 161386 | `cbd66565` / 161386 | `cbd66565` / 161386 | `cbd66565` / 161386 |

Byte-identical. The prompt is read only by the vendor provider, which no test, stub run or flag-off run builds.

## 4. Cheap live check: NOT TO BE RUN until Micah approves the spend

Three runs of 240 ticks with v2, on seeds 1847, 2718 and 4096, each with `--ai-vendor --ticks 240 --max-calls 10 --cap-usd 0.02`. A 240-tick run has at most 10 tax clock points (240 / 24).

Estimated cost per run, at peak prices (estimate):

- Brain input: the live run used 290–334 input tokens for 776–896-byte prompts. Scaled to the v2 sizes: 334 × 1,303 / 896 ≈ **486 tokens** per call at most.
- Brain per call: 486 × $1.32 / M + 64 × $3.96 / M = $0.000642 + $0.000253 = **$0.000895**, assuming the full 64 output tokens.
- Reader per call: the live Jev lines show 742–747 input tokens; 750 × $0.042 / M = **$0.0000315**.
- Per run: 10 × ($0.000895 + $0.0000315) = **$0.0093**. Three runs: **$0.028**. Off-peak halves the DeepSeek part.
- For scale, the live run spent $0.00196 for 8 calls, off-peak.

Hard cap: **$0.02 per run** through the existing `--cap-usd`, checked before every call, so the three runs cannot pass **$0.06** in total.

What it decides: seed 1847 repeats the live run's first tax points (24 and 48 share inputs until a step changes the world). Pass if, at pressed or short points, the brain no longer holds every time, and any override of the scorer comes with a reason. Record raw answers, reasons, `finish_reason` and the cost lines.

## 5. Who decides

Running the check, the keys and the spend need Micah's go-ahead.

## 6. Defaults

1. Prompt v2 as in section 2; `max_tokens` 64; a reason of at most 12 words before the choice.
2. Show the scorer's choice and its reason.
3. Log `finish_reason` on every brain cost line.
4. No change to the request, the `inputHash` schema, stubs, rules or events.
5. Check: 3 runs × 240 ticks, cap $0.02 per run, `--max-calls 10`, only after approval.
