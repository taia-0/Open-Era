# Playtest plan: AI pilot A, the tax-step seam stays off

This is the plan for a blind operator. It is not a completed session. Do not run it as part of writing the change. Do not open `src/`, `tests/`, the branch diff, or `docs/design/` during the session. Use only the dashboard HTTP JSON.

The brief (`docs/design/ai-pilot-a.md`) gives no way to turn the stubs on from the dashboard: `TickOptions.ai` is a run option the dashboard never passes. So this plan covers the flag-off run only. It checks that a live session on this branch reads exactly as on `fix/breakaway-polish`: the same event sequence numbers, the same Free Tide tax line, and no new field. The stub-on runs are covered by `tests/ai-pilot-a.test.ts`, not here.

The values below were read from one process on branch `feature/ai-pilot-a`, seed 1847, `playerId` `prototype-player`, no command.

## Setup

- Node `v24.21.0`. `npm ci` first if `node_modules` is missing.
- Branch `feature/ai-pilot-a`. Record `git rev-parse HEAD` before the first request.
- One process. `npm run dashboard -- --reset --seed 1847` on `http://127.0.0.1:4317`.
- `GET /api/health` should be HTTP 200 `{"ok":true,"tick":0,"events":0}`.

## Hypothesis and ambition

**Hypothesis.** With no AI option, Free Tide's tax step is the scorer's: on tick 96 Pax Ash cuts the rate from 8% to 7%, and nothing in the responses mentions a model.

**Ambition.** Trust that the AI seam changes nothing until someone switches it on.

## Checkpoint 1. To tick 144

`POST /api/advance` with `{"ticks":144}`. The call ends at tick 144, `eventSequence` 16958, `attentionUpdated` false, `pausedForBattle` false. It has sequence 11375, `tax-rate-set`, tick 96, `payloadWithheld` true, `data` null:

`Pax Ash lowered the Free Tide Compact tax from 8% to 7% (unrest at Glassport).`

It is the only `tax-rate-set` in the call.

## Checkpoint 2. To tick 168

`POST /api/advance` with `{"ticks":24}`. The call ends at tick 168, `eventSequence` 19796. It has no `tax-rate-set`.

Then `GET /api/state?limit=1`. The `free-tide` faction row has `taxRate` 0.07, `taxRateSetTick` 96, `treasury` null, `treasuryNote` `not visible to you`.

## Checkpoint 3. No model in sight

Search both advance bodies and the state body for `"ai"`, `brain`, `stub`, and `model`. None appears as a key or a value.

## Session

Blind operator, 2026-10-26 (PT). HEAD `7a52452f3f9c57354ed3b3859d8c571517057d50`, Node v24.21.0, fresh clone, one process, seed 1847, no commands.
- Health: `{"ok":true,"tick":0,"events":0}`.
- Advance 144: tick 144, `eventSequence` 16958, `attentionUpdated` false, `pausedForBattle` false. Only `tax-rate-set`: sequence 11375, tick 96, actor `character-14`, target `free-tide`, `payloadWithheld` true, `data` null, summary `Pax Ash lowered the Free Tide Compact tax from 8% to 7% (unrest at Glassport).`
- Advance 24: tick 168, `eventSequence` 19796, no `tax-rate-set`.
- State limit=1: `free-tide` `taxRate` 0.07, `taxRateSetTick` 96, `treasury` null, `treasuryNote` `not visible to you`.
- Search of all three bodies for `"ai"`, `brain`, `stub`, `model`: zero hits.

## Findings

All three checkpoints matched verbatim. No mismatch. No AI wording or new field visible.

## Outcome

Hypothesis confirmed: with no AI option the flag-off run reads exactly as planned.

## Recommendation

**Verdict: PROMOTE.** Every checkpoint matched and no model wording appears.
