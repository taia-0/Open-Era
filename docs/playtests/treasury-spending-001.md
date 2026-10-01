# Playtest plan: treasury spending

This is the plan for a blind operator. It is not a completed session. Do not fill Session, Findings, or Verdict while writing the plan. Do not open `src/`, `tests/`, the branch diff, or `docs/design/` during the session. Use only the dashboard HTTP JSON, this plan, and `progress.md`.

One session. One process. Seed 1847. Send no commands. The seat is Mara Vane. Do not pass another character.

The readings below were taken on this tree through `GET /api/state` and `POST /api/advance` before the session. The operator confirms them. A match is the campaign. A miss is not a new reading to write into this file during the session.

## Setup

- Node `v24.21.0` (`nvm use 24.21.0` if `node -v` is not that). `npm ci` first if `node_modules` is missing.
- Branch `feature/treasury-spending`. Record `git rev-parse HEAD` before the first request.
- One process. `npm run dashboard -- --reset --seed 1847 --host 127.0.0.1 --port 4317`. Do not start a second dashboard.
- `GET /api/health` should be HTTP 200 `{"ok":true,"tick":0,"events":0}`.
- The player is Mara Vane, `character-01`. Do not pass another character.
- Read state with `GET /api/state?limit=200`. Omit `beforeSequence` on the first read of a checkpoint. The `events` array is newest-first. If the sequence you need is below `eventPage.oldestSequence`, the fallback is `GET /api/state?limit=200&beforeSequence=<cursor>`.
- Advance with `POST /api/advance`. Body `{"ticks":N}`. `N` is an integer from 1 to 144.
- An advance stops early when Mara is captured or released. Read `ticksAdvanced` and `tick`. Do not assume a request of 144 lands 144 ticks later.
- Do not pass the event log into anything other than these HTTP calls.

## Hypothesis and ambition

**Hypothesis.** A World Government officer who is not the holder spends past the 18 cap in one day. The treasury pays 18. The purse pays the rest. The row then shows `allowanceRemaining` 0. At the next day boundary that field is gone again, and nothing carries. Mara, while free, stays the uncapped holder and her purse does not pay this recruit. A Free Tide row shows no allowance. Free Tide's treasury reads `not visible to you`.

**Ambition.** Read Sable Morrow at tick 0 and at tick 1, including sequence 26. Read her row again at tick 6. Read Pax Ash and the Free Tide treasury at tick 1, and Mina Vale's tick-0 lines.

## Checkpoint 1 — before the spend, state tick 0

`GET /api/state?limit=200` before any advance. HTTP 200. `tick` 0. `day` 0. `eventPage.total` 0.

Sable Morrow, `character-04`:

- `locationId` `glassport`
- `money` 260
- `allowanceCap` 18
- `allowanceRemaining` is absent
- `allowanceUncapped` false
- `allowanceRole` `member`
- `allowanceOnDayBoundary` true
- `allowanceDayStart` 0
- `allowanceResetsOnTick` 6

Mara Vane, `character-01`:

- `money` 108
- `allowanceCap` null
- `allowanceRemaining` null
- `allowanceUncapped` true
- `allowanceRole` `holder`

Pax Ash, `character-14`: `allowanceCap` null, `allowanceRemaining` null, `allowanceUncapped` null, `allowanceRole` null.

Factions:

- `world-government` `treasury` 18000. `treasuryNote` null.
- `free-tide` `treasury` null. `treasuryNote` `not visible to you`.

## Checkpoint 2 — the officer spend, state tick 1

`POST /api/advance` `{"ticks":1}`. HTTP 200. `ticksAdvanced` 1. `attentionUpdated` false. `tick` 1. `day` 0.17.

`GET /api/state?limit=200`. State `tick` 1. State `day` 0.17. `eventPage.total` 182. Sequence 26 is on this page.

Sequence 26:

- `type` `recruited`
- `tick` 0
- `actorId` `character-04`
- `settlementId` `glassport`
- `payloadWithheld` true
- `data` null

Summary, exact:

`Sable Morrow drew 18 from the treasury.`

That sentence is the allowance. The payload does not carry the quote, `purseDrawn`, or the treasury absolute. The card does.

Sable Morrow after the tick:

- `money` 182
- `allowanceCap` 18
- `allowanceRemaining` 0
- `allowanceUncapped` false
- `allowanceRole` `member`
- `allowanceOnDayBoundary` false
- `allowanceDayStart` 0
- `allowanceResetsOnTick` 6
- `allowanceNote` null

Purse before is 260. Purse after is 182. The drop is 78. The sentence names 18 from the treasury. 18 plus 78 is the 96 quote. Her other tick-0 rows are upkeep, a plan, the standing-order refusal, a decision, and a goal. None of those is a second purse debit.

`world-government` `treasury` is 17947.16 after the tick, not 18000 minus only her 18. Other officers draw in the same tick. Her row is the one that isolates her 18. `treasuryNote` null.

Mara's `money` is still 108. She is still `holder` and `allowanceUncapped` true.

## Checkpoint 3 — day boundary, state tick 6

From tick 1, `POST /api/advance` `{"ticks":5}`. HTTP 200. `ticksAdvanced` 5. `attentionUpdated` false. `tick` 6. `day` 1.

`GET /api/state?limit=200`.

Sable Morrow:

- `allowanceRemaining` is absent
- `allowanceCap` 18
- `allowanceUncapped` false
- `allowanceRole` `member`
- `allowanceOnDayBoundary` true
- `allowanceDayStart` 6
- `allowanceResetsOnTick` 12

The 0 did not carry. She is at sea on this tick, so `locationId` and `money` are null. The reset is the missing remainder, not her purse.

Mara: `money` 108. `allowanceRole` `holder`. `allowanceUncapped` true. `allowanceRemaining` null.

## Checkpoint 4 — rival reader, state tick 1

Use the tick-1 page from checkpoint 2. Do not advance again for this check.

Pax Ash, `character-14`:

- `allowanceCap` null
- `allowanceRemaining` null
- `allowanceUncapped` null
- `allowanceRole` null

`free-tide` `treasury` null. `treasuryNote` `not visible to you`.

Mina Vale, `character-15`, is Free Tide. Her tick-0 lines on this page do not say she drew from a treasury. Sequence 96, exact:

`Mina Vale departed for Glassport.`

`payloadWithheld` true. `data` null.

## Criteria

`PROMOTE` when every checkpoint matches: Sable's purse 260 then 182, sequence 26 the draw sentence with `data` null, `allowanceRemaining` 0 at tick 1 and absent at tick 6, Mara's purse still 108, Pax's allowance null, Free Tide `not visible to you`, and Mina's departure line with no treasury draw.

`REVISE` when a listed field or sentence is present but wrong, when `allowanceRemaining` is still 0 at tick 6, when it is present at tick 0, when sequence 26 prints a purse or a treasury balance, or when Pax or Mina shows a cap, a remainder, or a Free Tide number.

`ABANDON` when sequence 26 is not Sable Morrow's recruit, when her purse does not move, or when the world tick after the first advance is not 1.

## Session

Blind operator. One process. Seed 1847. No commands. Seat Mara Vane, `character-01`.

HEAD before the first request: `34476b4b80f4804563a87959def302dc43a76574`. Node `v24.21.0`. Dashboard `npm run dashboard -- --reset --seed 1847 --host 127.0.0.1 --port 4317` on `127.0.0.1:4317`.

`GET /api/health` HTTP 200 `{"ok":true,"tick":0,"events":0}`.

### Checkpoint 1 — before the spend, state tick 0

`GET /api/state?limit=200` HTTP 200. `tick` 0. `day` 0. `eventPage.total` 0.

Sable Morrow, `character-04`: `locationId` `glassport`. `money` 260. `allowanceCap` 18. `allowanceRemaining` absent. `allowanceUncapped` false. `allowanceRole` `member`. `allowanceOnDayBoundary` true. `allowanceDayStart` 0. `allowanceResetsOnTick` 6.

Mara Vane, `character-01`: `money` 108. `allowanceCap` null. `allowanceRemaining` null. `allowanceUncapped` true. `allowanceRole` `holder`.

Pax Ash, `character-14`: `allowanceCap` null. `allowanceRemaining` null. `allowanceUncapped` null. `allowanceRole` null.

`world-government` `treasury` 18000. `treasuryNote` null. `free-tide` `treasury` null. `treasuryNote` `not visible to you`.

Match.

### Checkpoint 2 — the officer spend, state tick 1

`POST /api/advance` `{"ticks":1}` HTTP 200. `ticksAdvanced` 1. `attentionUpdated` false. `tick` 1. `day` 0.17.

`GET /api/state?limit=200` HTTP 200. State `tick` 1. State `day` 0.17. `eventPage.total` 182. Sequence 26 is on this page (`oldestSequence` 1, `newestSequence` 182).

Sequence 26: `type` `recruited`. `tick` 0. `actorId` `character-04`. `settlementId` `glassport`. `payloadWithheld` true. `data` null. Summary, exact: `Sable Morrow drew 18 from the treasury.`

Sable Morrow: `money` 182. `allowanceCap` 18. `allowanceRemaining` 0. `allowanceUncapped` false. `allowanceRole` `member`. `allowanceOnDayBoundary` false. `allowanceDayStart` 0. `allowanceResetsOnTick` 6. `allowanceNote` null.

Her other tick-0 rows, in order: sequence 22 `character-upkeep` `Sable Morrow's upkeep was recorded.` sequence 23 `plan-reconsidered` `Sable Morrow reconsidered a plan.` sequence 24 `standing-order-refused` `Sable Morrow refused the protect order after weighing loyalty, risk, and ambition.` sequence 25 `decision-made` `Sable Morrow made a decision.` sequence 27 `goal-progressed` `Sable Morrow's ambition moved.` None of those summaries is a second purse debit.

`world-government` `treasury` 17947.16. `treasuryNote` null.

Mara Vane: `money` 108. `allowanceRole` `holder`. `allowanceUncapped` true.

Match.

### Checkpoint 3 — day boundary, state tick 6

From tick 1, `POST /api/advance` `{"ticks":5}` HTTP 200. `ticksAdvanced` 5. `attentionUpdated` false. `tick` 6. `day` 1.

`GET /api/state?limit=200` HTTP 200. State `tick` 6. State `day` 1.

Sable Morrow: `allowanceRemaining` absent. `allowanceCap` 18. `allowanceUncapped` false. `allowanceRole` `member`. `allowanceOnDayBoundary` true. `allowanceDayStart` 6. `allowanceResetsOnTick` 12. `locationId` null. `money` null.

Mara Vane: `money` 108. `allowanceRole` `holder`. `allowanceUncapped` true. `allowanceRemaining` null.

Match.

### Checkpoint 4 — rival reader, state tick 1

Read from the tick-1 page. No further advance.

Pax Ash, `character-14`: `allowanceCap` null. `allowanceRemaining` null. `allowanceUncapped` null. `allowanceRole` null.

`free-tide` `treasury` null. `treasuryNote` `not visible to you`.

Mina Vale, `character-15`, tick-0 lines on this page: `Mina Vale's upkeep was recorded.` `Mina Vale reconsidered a plan.` `Mina Vale accepted an order.` `Mina Vale made a decision.` `Mina Vale left an order.` `Mina Vale departed for Glassport.` `Mina Vale's ambition moved.` None says she drew from a treasury.

Sequence 96, exact: `Mina Vale departed for Glassport.` `payloadWithheld` true. `data` null.

Match.

## Findings

- Sable started with 260 in her purse and a cap of 18, and there was no remaining figure, so it looked like she had not spent today.
- After one tick the card says `Sable Morrow drew 18 from the treasury.` Her purse is 182. The drop is 78, and the card does not show that, the 96 quote, or the treasury balance.
- The recruit row hides the payload. `data` is null. The sentence is the only number I get, and it is only the 18.
- Her remaining allowance is 0 right after that spend. At tick 6 that 0 is gone. The cap is 18 again and nothing carried.
- She is at sea on the day boundary, so her port and her purse are blank. I can see the allowance reset. I cannot see her money.
- My purse is still 108. I am the holder with no cap, and I did not pay for her recruit.
- The government treasury went from 18000 to 17947.16, which is not just her 18. The same tick also says `Orin Rill drew 18 from the treasury.` and `Kessa Calder drew 18 from the treasury.`
- Pax has no allowance. Free Tide's treasury reads `not visible to you`. Mina's line is `Mina Vale departed for Glassport.` She never says she drew from a treasury.

## Verdict

PROMOTE. Every checkpoint matched: Sable's purse 260 then 182, sequence 26 `Sable Morrow drew 18 from the treasury.` with `data` null, `allowanceRemaining` 0 at tick 1 and absent at tick 6, Mara's purse still 108, Pax's allowance null, Free Tide `not visible to you`, and Mina's departure line with no treasury draw.
