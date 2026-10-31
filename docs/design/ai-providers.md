# AI providers (step A5): a real DeepSeek brain and a Jev context reader

Status: **Open / build brief.** Docs only. No code, no API call, no sign-up, no key was used to write it. Built on `main` at `c659a30`, where pilot A (`src/sim/ai-provider.ts`) and pilot B (`src/sim/ai-context.ts`) are stubs only.

**Who decides.** Turning on a real vendor, every sign-up, both keys, and any spend need Micah's go-ahead. Until he gives it, the stubs stay the only providers in use, and nothing in this brief is switched on.

## Sources, checked 2026-10-31

| What | URL | Used for |
| --- | --- | --- |
| DeepSeek Models & Pricing | https://api-docs.deepseek.com/quick_start/pricing | Model names, versions, prices, peak hours, JSON output |
| DeepSeek Chat Completions API | https://api-docs.deepseek.com/api/create-chat-completion | Request and response shape, `thinking`, `response_format`, `max_tokens`, `usage` |
| DeepSeek first call | https://api-docs.deepseek.com/ | Base URL, `Authorization: Bearer ${DEEPSEEK_API_KEY}` |
| TypeSafe Models | https://docs.typesafe.ai/models | Jev model ids, price, context limits |
| TypeSafe System One API | https://docs.typesafe.ai/api/system-one.md (OpenAPI `https://api.typesafe.ai/openapi.json`) | Endpoint, request and response shape, `usage` |
| TypeSafe request rules and errors | https://docs.typesafe.ai/api/errors.md | Status codes, retry advice |

"Jev" is the TypeSafe model `ai-brain.md` already names and cites (`docs.typesafe.ai/models`).

## 1. Model per role

The multi-role design in `ai-brain.md` stands. A5 wires real vendors only for the two roles that are built:

| Role (`ai-brain.md`) | Built hook on main | A5 provider | Model id | Why |
| --- | --- | --- | --- | --- |
| Brain, `brain.taxStep` | `TaxStepProvider` (pilot A) | `DeepSeekBrain` | `deepseek-v4-pro`, **non-thinking** (default 8 in `ai-brain.md`) | Big decision; JSON Output supported |
| Context reader, `context.taxStep` | `ContextReader` (pilot B) | `JevContextReader` | `jev-1.14.0`, versioned id, not the alias | Typed Choice answers fit the briefing's enums; input-only pricing |
| Action picker, triage, voice, speech | Not built | None in A5 | — | Stay as designed in `ai-brain.md`; no hook to wire |

The Jev models page says an alias "moves when a new release ships"; the brief pins `jev-1.14.0` so `model` on `data.ai.context` is exact. `deepseek-v4-pro` is the documented model name; the pricing page lists its version as `DeepSeek-V4-Pro-0813`, and the provider records the response's `model` and `system_fingerprint` field in the cost log (not in `data.ai`; section 5).

## 2. Endpoints and request shape

### DeepSeek brain

`POST https://api.deepseek.com/chat/completions`, headers `Content-Type: application/json`, `Authorization: Bearer <DEEPSEEK_API_KEY>`.

```json
{
  "model": "deepseek-v4-pro",
  "messages": [
    { "role": "system", "content": "Answer as JSON: {\"choice\":\"<option>\"}." },
    { "role": "user", "content": "<TAX_STEP_PROMPT_TEMPLATE_BRIEFED, filled>" }
  ],
  "thinking": { "type": "disabled" },
  "response_format": { "type": "json_object" },
  "max_tokens": 32,
  "temperature": 0,
  "stream": false
}
```

- `thinking` must be sent as `disabled`: the API reference says that when `thinking` and `reasoning_effort` are both omitted, **thinking is enabled**, which would bill reasoning tokens.
- JSON Output requires the prompt itself to ask for JSON (the reference says so); the pilot template already does.
- `max_tokens: 32` bounds the output; the legal answer `{"choice":"down"}` is short. If `finish_reason` is `length`, the answer is treated as `illegal`.
- Read: `choices[0].message.content` → `TaxStepAnswer.raw`, parsed by the existing `parseTaxChoice`; `usage.prompt_cache_hit_tokens`, `usage.prompt_cache_miss_tokens`, `usage.completion_tokens` → cost log.
- Prices, per million tokens: input cache miss $1.32 peak / $0.66 off-peak, cache hit $0.044 / $0.022, output $3.96 / $1.98. Peak is 01:00–04:00 and 06:00–10:00 UTC, Monday–Friday, excluding Chinese public holidays. That is 18:00–21:00 and 23:00–03:00 the next day in America/Los_Angeles while it is on UTC−7, Sunday evening through Friday.

### Jev context reader

`POST https://api.typesafe.ai/v1/systemone`, headers `Content-Type: application/json`, `Authorization: Bearer <JEV_API_KEY>`. (TypeSafe's own examples name the variable `TYPESAFE_API_KEY`; this project reads `JEV_API_KEY` as the Lead specified, and the header is the same.)

```json
{
  "model": "jev-1.14.0",
  "state": { "holderId": "…", "factionId": "free-tide", "tick": 0, "serializer": { "…": "buildTaxStepBriefing output" } },
  "questions": {
    "loyaltyRead": { "type": "choice", "instructions": "How firm is the holder's loyalty to their faction?",
                     "criteria": { "firm": "…", "wavering": "…", "breaking": "…" } },
    "grudge_0": { "type": "choice", "instructions": "How heavy is the holder's grudge against <id>?",
                  "criteria": { "low": "…", "mid": "…", "high": "…" } }
  }
}
```

- One `choice` question for `loyaltyRead` and one per grudge in the serializer output (at most 3, `BRIEFING_TOP`). Jev returns only the enum values offered, so ids and numbers are never model output: the provider copies them from the serializer and sets `loyaltyRead` and each `weight` from `answers.<name>.choice`.
- The assembled object goes through the existing `validateBriefing`, so the 1,024-byte cap and id dropping apply unchanged.
- Read `usage.input_tokens` and `usage.output_tokens` for the cost log. Price: $0.042 per million input tokens, output free (models page). Limits: 64k per request, 32k per question without the long-context header; the request never sends that header.
- Errors per the errors page: `400`, `401`, `413`, `415`, `422` → `error`; `429` and `529` → `error` too (no retry inside a tick; see section 3).

## 3. Timeouts and fallbacks

Unchanged from the specs and the code on main:

| Role | Timeout | Constant | On timeout, error, illegal or cap |
| --- | --- | --- | --- |
| Brain | 30,000 ms | `TAX_STEP_TIMEOUT_MS` | The scorer's choice (`finalChoice = scorerChoice`, `outcome: "fallback"`) |
| Context reader | 2,000 ms | `CONTEXT_TIMEOUT_MS` | The deterministic serializer briefing (`buildTaxStepBriefing`) |

- **Synchronous seam.** Both seams are synchronous (`decide`, `read`). A real HTTP call is async, so the real provider runs `fetch` in a `worker_threads` worker and the main thread blocks on `Atomics.wait` over a `SharedArrayBuffer` with the role's timeout. The engine and the tick order do not change. The worker is aborted (`AbortController`) at the timeout and the answer is `{ raw: null, error: "timeout" }`.
- No retry inside a tick: a `429` or `529` is an `error` and falls back. A retry would stretch a tick past the timeout.
- A missing key is `error` on every call, so a run with the flag on and no key behaves as `stubFail("error")`.

## 4. Keys

- Read once from `process.env.DEEPSEEK_API_KEY` and `process.env.JEV_API_KEY` when the provider is constructed, and held only in the provider closure and the worker's request headers.
- Never written to `data.ai`, the trace, the cost log, `promptVersion`, `inputHash`, an error message, or any hash. `inputHash` stays sha256 of `canonicalJson(request)`, and the request has no key field.
- Errors are logged by status code and vendor error type only, never the request headers.
- A test asserts that a fake key string set in the environment appears in no event, trace entry, or cost-log line (section 7).

## 5. Cost logging

One JSON line per vendor call, written to a run-local log beside `aiTrace` (outside the world and outside every hash), for example `TickResult.aiCost`, and optionally to a file the runner names. Format:

```json
{
  "tick": 24,
  "role": "brain.taxStep",
  "provider": "deepseek",
  "model": "deepseek-v4-pro",
  "responseModel": "deepseek-v4-pro",
  "tokensIn": 412,
  "tokensInCacheHit": 0,
  "tokensOut": 7,
  "pricePeriod": "peak",
  "estimatedCostUsd": 0.00057156,
  "runSpendUsd": 0.0123,
  "outcome": "model",
  "priceSource": "https://api-docs.deepseek.com/quick_start/pricing",
  "priceCheckedOn": "2026-10-31"
}
```

The figures in the example are placeholders for shape only. Cost = miss tokens × miss price + hit tokens × hit price + output tokens × output price, from the vendor's `usage`, for the period at the call's wall-clock UTC time. For Jev, `tokensOut` is logged but priced at zero, `pricePeriod` is `"flat"`, and `priceSource` is `https://docs.typesafe.ai/models`. The price table is a constant in the provider module carrying its source URL and check date; a price change is a code change. A call that never reached the vendor (cap or missing key) logs `tokensIn: 0` and `estimatedCostUsd: 0`.

## 6. Spend cap

**Hard per-run cap: $0.25, default.** Estimate, not measured: pilot A as built makes 33 / 27 / 30 brain calls (`ai-pilot-a.md` correction), and `ai-brain.md` assumes 2,000 input and 400 output tokens, so 33 × $0.004224 = **$0.139** at peak; the reader's 33 × 1,500 assumed tokens × $0.042 / M = **$0.0021**. $0.25 is the peak estimate plus about 75% headroom. With `max_tokens: 32` the real output cost is far below the 400-token assumption.

- Checked **before** each call: if `runSpendUsd` plus the call's worst case would pass the cap, the call is not made and the role falls back with reason `cap` (scorer for the brain, serializer for the reader), like the existing call cap. Worst case per brain call = prompt UTF-8 bytes × peak miss price + `max_tokens` × peak output price; the byte count as a token ceiling is an **assumption** to confirm on the first approved run. Worst case per reader call = request bytes × $0.042 / M.
- The existing per-run call cap (`TAX_STEP_DEFAULT_CAP = 50`) stays; whichever binds first wins.
- The cap lives in run memory (`TickAiOptions`), not on the world, like `calls`; it does not survive recovery (same limit pilot A states).
- Micah may set a different cap when he approves spend.

## 7. Offline tests

- Stubs stay the default. `DeepSeekBrain` and `JevContextReader` are only constructed by an explicit runner flag (for example `--ai-vendor`), never by `TickOptions` defaults, tests, or the golden fixture.
- Flag off stays byte-identical: the 72-tick fixture and the pilot A/B 1,200-tick hashes as on main.
- The test suite never touches the network and needs no key. Vendor providers are tested with an injected `fetch` that returns recorded-shape JSON built from the documented examples (the DeepSeek `chat.completion` object and the TypeSafe `choice` answer), plus `401`, `429`, `529`, a hang past the timeout, `finish_reason: "length"`, and empty-content JSON Output.
- A guard test replaces `globalThis.fetch` with one that throws, and runs the whole suite's AI tests under it.
- Tests: parse and fallback per error; cost line fields and arithmetic against the price constants; spend cap blocks the call that would cross it and falls back with `cap`; key never appears in any output (section 4); replay and `WorldStore.recover` call neither vendor (counting injected `fetch` stays at zero).

## 8. Could not verify

- **Latency.** DeepSeek publishes none on the pages above. TypeSafe's launch post (cited in `ai-brain.md`) says 70–500 ms; the models and API pages do not restate it. The timeouts are therefore not tuned to measurements.
- **Rate limits.** DeepSeek lists concurrency 500 for `deepseek-v4-pro`; TypeSafe says rate limits are set per organization in the console, which needs an account. Not checked.
- **Token counts for our prompts.** No call was made, so tokens per brain and reader call are still the `ai-brain.md` assumptions (2,000 / 400 and 1,500).
- **Determinism of answers.** Neither vendor documents a seed. `temperature: 0` is sent to DeepSeek; repeat answers are not guaranteed, which is why answers are recorded and replay never calls a vendor.
- **Jev context-reader quality.** No public measure for this use.

## 9. Defaults

1. Brain `deepseek-v4-pro`, non-thinking, `response_format: json_object`, `max_tokens: 32`, `temperature: 0`.
2. Reader `jev-1.14.0`, versioned, choice questions only, no long-context header.
3. Keys from `DEEPSEEK_API_KEY` and `JEV_API_KEY` only; never logged, recorded or hashed.
4. Timeouts 30,000 ms and 2,000 ms, as on main; no in-tick retries.
5. Spend cap $0.25 per run, checked before each call; call cap 50 also stands.
6. One cost line per call, outside the world, with role, model, tokens in and out, estimated cost, price source and check date.
7. Stubs default; vendors only by an explicit runner flag and only after Micah's go-ahead.
