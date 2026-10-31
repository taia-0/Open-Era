# Playtest plan: AI pilot B, the context reader stays off

This is the plan for a blind operator. It is not a completed session. Do not run it as part of writing the change. Do not open `src/`, `tests/`, the branch diff, or `docs/design/` during the session. Use only the dashboard HTTP JSON.

The brief (`docs/design/ai-pilot-b.md`) gives no way to turn the reader or the brain on from the dashboard: `TickOptions.ai.context` and `TickOptions.ai.brainTaxStep` are run options the dashboard never passes. So this plan covers the flag-off run only. It checks that a live session on this branch reads exactly as on `fix/breakaway-polish`: the same event sequence numbers, the same Free Tide tax line, and no new field. The stub-on runs are covered by `tests/ai-pilot-b.test.ts`, not here.

The values below were read from one process on branch `feature/ai-pilot-b`, seed 1847, `playerId` `prototype-player`, no command.

## Setup

- Node `v24.21.0`. `npm ci` first if `node_modules` is missing.
- Branch `feature/ai-pilot-b`. Record `git rev-parse HEAD` before the first request.
- One process. `npm run dashboard -- --reset --seed 1847` on `http://127.0.0.1:4317`.
- `GET /api/health` should be HTTP 200 `{"ok":true,"tick":0,"events":0}`.

## Hypothesis and ambition

**Hypothesis.** With no AI option, Free Tide's tax step is the scorer's: on tick 96 Pax Ash cuts the rate from 8% to 7%, and nothing in the responses mentions a model.

**Ambition.** Trust that the context reader changes nothing until someone switches it on.

## Checkpoint 1. To tick 144

`POST /api/advance` with `{"ticks":144}`. The call ends at tick 144, `eventSequence` 16958, `attentionUpdated` false, `pausedForBattle` false. It has sequence 11375, `tax-rate-set`, tick 96, `payloadWithheld` true, `data` null:

`Pax Ash lowered the Free Tide Compact tax from 8% to 7% (unrest at Glassport).`

It is the only `tax-rate-set` in the call.

## Checkpoint 2. To tick 168

`POST /api/advance` with `{"ticks":24}`. The call ends at tick 168, `eventSequence` 19796. It has no `tax-rate-set`.

Then `GET /api/state?limit=1`. The `free-tide` faction row has `taxRate` 0.07, `taxRateSetTick` 96, `treasury` null, `treasuryNote` `not visible to you`.

## Checkpoint 3. No model in sight

Search both advance bodies and the state body for the keys `"ai"` and `"context"`, and for `stub` and `model`. None appears. (The word `briefing` does appear in the state body: that is the dashboard's own commander briefing, not the reader's.)

## Outcome

Blind session run at `d61cc6a7d70b992048c9f970f837ac885f1327af`, Node v24.21.0, one process, seed 1847, no commands. Health: HTTP 200 `{"ok":true,"tick":0,"events":0}`.

- **Checkpoint 1 — match.** Ended tick 144, `eventSequence` 16958, `attentionUpdated` false, `pausedForBattle` false (16839 events). Only `tax-rate-set`: sequence 11375, tick 96, actor `character-14`, target `free-tide`, `payloadWithheld` true, `data` null: `Pax Ash lowered the Free Tide Compact tax from 8% to 7% (unrest at Glassport).`
- **Checkpoint 2 — match.** Ended tick 168, `eventSequence` 19796, no `tax-rate-set` (2812 events). `free-tide`: `taxRate` 0.07, `taxRateSetTick` 96, `treasury` null, `treasuryNote` `not visible to you`.
- **Checkpoint 3 — match.** `"ai"`, `"context"`, `stub`, `model`: 0 hits in both advance bodies and the state body. `briefing` appears 7 times in the state body only (the dashboard commander briefing). Advance body keys unchanged: ok, tick, day, ticksAdvanced, combatUpdated, attentionUpdated, pausedForBattle, pauseNote, eventSequence, events.

Findings: no mismatch. The hypothesis holds; the flag-off session reads as on `fix/breakaway-polish`.

## Recommendation

**PROMOTE.** Every checkpoint matched verbatim and nothing in the responses mentions a model or reader.
