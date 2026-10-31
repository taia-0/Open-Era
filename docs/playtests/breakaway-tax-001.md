# Playtest plan: breakaway tax, the founder's seat

This is the plan for a blind operator. It is not a completed session. Do not run it as part of writing the change. Do not open `src/`, `tests/`, the branch diff, or `docs/design/` during the session. Use only the dashboard HTTP JSON.

One process. Seed 4096. Mara Vane stays the viewer. Issue no command. A breakaway used to sit at 8% forever because nobody held its seat. Now its founder steps the rate until someone issues an order. A breakaway whose founder is alone does not raise the rate for a short treasury.

The values below were read from one process on branch `feature/breakaway-tax`, seed 4096, `playerId` `prototype-player`, no command.

## Setup

- Node `v24.21.0`. `npm ci` first if `node_modules` is missing.
- Branch `feature/breakaway-tax`. Record `git rev-parse HEAD` before the first request. A later commit that does not change `src/` should match.
- One process. `npm run dashboard -- --reset --seed 4096` on `http://127.0.0.1:4317`. Do not start a second seed.
- `GET /api/health` should be HTTP 200 `{"ok":true,"tick":0,"events":0}`.
- Advance with `POST /api/advance`. The advance body includes every event that call produced, newest first.

## Hypothesis and ambition

**Hypothesis.** Corin Hale declares Cinder Key separate on tick 1088. On tick 1104, the next tax clock point after the declaration, he lowers the Free Cinder Key rate from 8% to 7% because the port is unsettled.

**Ambition.** Watch a breakaway use its tax lever for the first time.

**What you can see.** The public declaration and the public tax sentence. Not Free Cinder Key's treasury.

## Characters

| Name | Id | What to watch |
| --- | --- | --- |
| Mara Vane | `character-01` | The viewer. |
| Corin Hale | `character-16` | Founds Free Cinder Key on tick 1088 and steps its rate on tick 1104. |

## Checkpoint 1. To tick 980

`POST /api/advance` with `{"ticks":144}` until the world reaches tick 980. Two calls stop early with `attentionUpdated` true; keep going with `{"ticks":144}` after each. The calls end at:

| Ticks asked | Ends at | `eventSequence` | `attentionUpdated` |
| ---: | ---: | ---: | --- |
| 144 | 144 | 17459 | false |
| 144 | 288 | 36330 | false |
| 144 | 320 | 40710 | true |
| 144 | 404 | 52249 | true |
| 144 | 548 | 73133 | false |
| 144 | 692 | 93205 | false |
| 144 | 836 | 112675 | false |
| 144 | 980 | 132600 | false |

No call returns `pausedForBattle` true. If a call ends elsewhere, stop and record it.

## Checkpoint 2. The declaration

`POST /api/advance` with `{"ticks":24}` five times. The calls end at ticks 1004, 1028, 1052, 1076, and 1100, `eventSequence` 136002, 139445, 142882, 146271, and 149659.

The call that ends at tick 1100 has sequence 147966, `secession-declared`, tick 1088, `payloadWithheld` true:

`Corin Hale declared Cinder Key separate from Free Tide Compact. Free Cinder Key starts with an empty treasury. (no leader yet)`

## Checkpoint 3. The first breakaway step

`POST /api/advance` with `{"ticks":24}`. The call ends at tick 1124, `eventSequence` 152972.

It has sequence 150201, `tax-rate-set`, tick 1104, `payloadWithheld` true:

`Corin Hale lowered the Free Cinder Key tax from 8% to 7% (unrest).`

One more `{"ticks":24}` ends at tick 1148, `eventSequence` 156347, with no Free Cinder Key `tax-rate-set` row.

## Outcome

Run 2026-10-26 by a blind operator on `0f02352` (fresh clone), Node v24.21.0, one process, seed 4096, no command. `GET /api/health` returned HTTP 200 `{"ok":true,"tick":0,"events":0}`.

**Checkpoint 1 — matched.** Calls ended at 144/17459, 288/36330, 320/40710 (attentionUpdated true), 404/52249 (attentionUpdated true), 548/73133, 692/93205, 836/112675, 980/132600. No `pausedForBattle` true. Pause notes: `Time stopped. Free Tide Compact took Mara Vane on the dock at Crown Harbor after Esme Dusk won there on a higher score.` (320) and `Time stopped. Mara Vane was released from Crown Harbor.` (404).

**Checkpoint 2 — matched.** Calls ended at 1004/136002, 1028/139445, 1052/142882, 1076/146271, 1100/149659. Sequence 147966, `secession-declared`, tick 1088, actor `character-16`, `payloadWithheld` true: `Corin Hale declared Cinder Key separate from Free Tide Compact. Free Cinder Key starts with an empty treasury. (no leader yet)`

**Checkpoint 3 — matched.** Call ended at 1124/152972 with sequence 150201, `tax-rate-set`, tick 1104, actor `character-16`, `payloadWithheld` true: `Corin Hale lowered the Free Cinder Key tax from 8% to 7% (unrest).` Next call ended at 1148/156347 with no `tax-rate-set` row.

**Findings.** No mismatch. The hypothesis holds: the breakaway uses its tax lever on the first clock point after the declaration. Player-facing oddity: the declaration says "(no leader yet)" while Corin Hale sets the tax 16 ticks later, which reads as a contradiction to a first-time player.

## Recommendation

**Verdict: PROMOTE.** Every checkpoint matched verbatim. Optional feed follow-up: reword "(no leader yet)" to make clear the founder holds the tax seat.
