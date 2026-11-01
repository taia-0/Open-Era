# Playtest plan: AI providers (A5), flag off and stubs only

This is the plan for a blind operator. It is not a completed session. Do not run it as part of writing the change. Do not open `src/`, `tests/`, the branch diff, or `docs/design/` during the session.

**No vendor.** Do not pass `--ai-vendor`. Before every command below, clear the two keys in that shell: `unset DEEPSEEK_API_KEY JEV_API_KEY`. Spending needs Micah's go-ahead, and this plan spends nothing.

The values below were read on branch `feature/ai-providers`, Node v24.21.0, with both keys unset.

## Setup

- Node `v24.21.0`. `npm ci` first if `node_modules` is missing.
- Branch `feature/ai-providers`. Record `git rev-parse HEAD`.

## Hypothesis and ambition

**Hypothesis.** With no vendor flag, the game and the AI runner behave exactly as before A5: the dashboard reads the same, and the stub runner reproduces the pinned hashes with zero spend.

**Ambition.** Trust that the real vendors are switched off until someone deliberately turns them on.

## Checkpoint 1. Dashboard, flag off

`npm run dashboard -- --reset --seed 1847` on `http://127.0.0.1:4317`. `POST /api/advance` with `{"ticks":144}`. The call ends at tick 144, `eventSequence` 16958, `attentionUpdated` false, `pausedForBattle` false. It has sequence 11375, `tax-rate-set`, tick 96, `payloadWithheld` true, `data` null:

`Pax Ash lowered the Free Tide Compact tax from 8% to 7% (unrest at Glassport).`

The body contains none of `deepseek`, `jev`, or the key `"ai"`. Stop the process.

## Checkpoint 2. The stub runner, short

`npm run ai-pilot -- --seed 1847 --ticks 240`. It prints one JSON line:

- `mode` `stub`, `stateHash` `a30b4361229cf8736238e50411523ab06454445edc0478ae8b57a0524b2b7ab7`, `events` 28211, `calls` 6, `spendUsd` 0, `costLines` 0, `costLog` null, `fallbacks` 0.

`simulation-output/ai-providers/stub-1847-240/` has `summary.json` and `trace.json` and no `cost.jsonl`.

## Checkpoint 3. The stub runner, full length

`npm run ai-pilot -- --seed <seed> --ticks 1200` for each seed:

| Seed | `stateHash` starts | `events` | `calls` |
| --- | --- | ---: | ---: |
| 1847 | `c4d99822` | 163679 | 33 |
| 2718 | `738181c0` | 159177 | 27 |
| 4096 | `cbd66565` | 161386 | 30 |

Every line has `spendUsd` 0 and `fallbacks` 0.

## Outcome

Not yet run.

## Recommendation

Pending the blind session.
