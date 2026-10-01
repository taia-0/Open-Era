# Playtest plan: treasury allowance

This is the plan for a blind operator. It is not a completed session. Do not run it as part of writing the change. Do not open `src/`, `tests/`, the branch diff, or `docs/design/` during the session. Use only the dashboard HTTP JSON, this plan, and `progress.md`.

One session. One process. Seed 1847. Send no commands. The seat is Mara Vane. Do not pass another character. Changing the player would be a different world.

Nothing in this campaign draws on an allowance. No event carries `treasuryDrawn`, `purseDrawn`, or `allowanceRemaining`. A capped member's `allowanceRemaining` is absent. Absent means full. The cap on the row is 18.

## Setup

- Node `v24.21.0` (`nvm use 24.21.0` if `node -v` is not that). `npm ci` first if `node_modules` is missing.
- Branch `feature/treasury-allowance`. Record `git rev-parse HEAD` before the first request.
- One process. `npm run dashboard -- --reset --seed 1847` on `http://127.0.0.1:4317`. Do not start a second dashboard.
- `GET /api/health` should be HTTP 200 `{"ok":true,"tick":0,"events":0}`.
- The player is Mara Vane, `character-01`. Do not pass another character.
- Read state with `GET /api/state?limit=200`. Omit `beforeSequence` on the first read of a checkpoint. The `events` array is newest-first. If the sequence you need is below `eventPage.oldestSequence`, the fallback is `GET /api/state?limit=200&beforeSequence=<cursor>`.
- Advance with `POST /api/advance`. Body `{"ticks":N}`. `N` is an integer from 1 to 144.
- An advance stops early when Mara is captured or released. Read `ticksAdvanced`, `attentionUpdated`, and `tick`. Do not assume a request of 144 lands 144 ticks later.
- Advance `day` and state `day` are both rounded to two places.
- Do not pass the event log into anything other than these HTTP calls.

## Hypothesis and ambition

**Hypothesis.** A World Government member shows an allowance cap of 18. The remainder is omitted while nothing has been drawn that day. It resets on the day boundary, which is a world tick divisible by 6, and it does not carry. Mara, while free, is uncapped. While she is held, she cannot spend, and the acting commander stays on the cap of 18. A Free Tide row shows none of the allowance. A Free Tide treasury balance is not a number on her screen. Where a line names that treasury, the balance reads `not visible to you`, and `data` stays null when the payload is withheld. Sequence 43 names `Toma Reef (World Government)`.

**Ambition.** Read Bram Quill at tick 0, tick 3, and tick 6. Read sequence 43 at tick 1. Read Sable Morrow's release at tick 119. Read Jun Marrow's cover at tick 595, when Mara is held.

## Checkpoint 1 — day boundary, state tick 0

`GET /api/state?limit=200` before any advance. HTTP 200. `tick` 0. `day` 0. `eventPage.total` 0.

Bram Quill, `character-02`:

- `allowanceCap` 18
- `allowanceRemaining` is absent
- `allowanceUncapped` false
- `allowanceRole` `member`
- `allowanceOnDayBoundary` true
- `allowanceDayStart` 0
- `allowanceResetsOnTick` 6
- `allowanceNote` null

Mara Vane, `character-01`:

- `allowanceCap` null
- `allowanceRemaining` null
- `allowanceUncapped` true
- `allowanceRole` `holder`
- `allowanceOnDayBoundary` null
- `allowanceNote` null

Mina Vale, `character-15`, and Pax Ash, `character-14`, are Free Tide. On each of them `allowanceCap`, `allowanceRemaining`, `allowanceUncapped`, `allowanceRole`, and `allowanceNote` are null.

Factions:

- `world-government` `treasury` 18000. `treasuryNote` null. `commanderId` `character-01`. `actingCommanderId` null.
- `free-tide` `treasury` null. `treasuryNote` `not visible to you`. `commanderId` `character-14`. `actingCommanderId` null.

## Checkpoint 2 — sequence 43, state tick 1

`POST /api/advance` `{"ticks":1}`. HTTP 200. `ticksAdvanced` 1. `attentionUpdated` false. `tick` 1. `day` 0.17.

`GET /api/state?limit=200`. State `tick` 1. State `day` 0.17.

Sequence 43 is on this page. `type` `standing-order-accepted`. `tick` 0. `payloadWithheld` false.

Summary, exact:

`Toma Reef (World Government) accepted the trade supplies order.`

`data.summary` stays:

`Toma Reef accepted the trade supplies order.`

Toma Reef, `character-07`: `name` `Toma Reef`. `displayName` `Toma Reef (World Government)`. `allowanceRole` `member`. `allowanceCap` 18. `allowanceRemaining` is absent.

Bram Quill is mid-day: `allowanceOnDayBoundary` false. `allowanceDayStart` 0. `allowanceResetsOnTick` 6. `allowanceCap` 18. `allowanceRemaining` is absent. `allowanceUncapped` false.

## Checkpoint 3 — mid-day, state tick 3

`POST /api/advance` `{"ticks":2}`. HTTP 200. `ticksAdvanced` 2. `attentionUpdated` false. `tick` 3. `day` 0.5.

`GET /api/state?limit=200`.

Bram Quill: `allowanceCap` 18. `allowanceRemaining` absent. `allowanceUncapped` false. `allowanceRole` `member`. `allowanceOnDayBoundary` false. `allowanceDayStart` 0. `allowanceResetsOnTick` 6.

Mara: `allowanceUncapped` true. `allowanceRole` `holder`. `allowanceCap` null.

Mina Vale: `allowanceCap` null. `allowanceUncapped` null. `allowanceRole` null.

## Checkpoint 4 — next day boundary, state tick 6

`POST /api/advance` `{"ticks":3}`. HTTP 200. `ticksAdvanced` 3. `attentionUpdated` false. `tick` 6. `day` 1.

`GET /api/state?limit=200`.

Bram Quill: `allowanceOnDayBoundary` true. `allowanceDayStart` 6. `allowanceResetsOnTick` 12. `allowanceCap` 18. `allowanceRemaining` absent. `allowanceUncapped` false.

The cap did not grow. Nothing carried from the previous day, because nothing was drawn.

## Checkpoint 5 — Free Tide balance, state tick 119

`POST /api/advance` `{"ticks":113}`. HTTP 200. `ticksAdvanced` 113. `attentionUpdated` false. `tick` 119. `day` 19.83.

`GET /api/state?limit=200`. State `tick` 119. State `day` 19.83.

Sequence 13680 is on this page. `type` `captivity-released`. `actorId` `character-04`. `tick` 118. `payloadWithheld` true. `data` null.

Summary, exact:

`Sable Morrow was released from Cinder Key. 13.4 was paid and 103.21 was recorded as debt. Loyalty fell. 13.4 went to the Free Tide Compact treasury. The balance is not visible to you. The ransom line covers only the ransom.`

`details`, in order:

1. `Sable Morrow was released from Cinder Key.`
2. `13.4 was paid and 103.21 was recorded as debt.`
3. `Loyalty fell.`
4. `13.4 went to the Free Tide Compact treasury. The balance is not visible to you.`
5. `The ransom line covers only the ransom.`

The summary contains `not visible to you`. It does not contain a Free Tide balance. `13.4` is the amount paid.

Briefing `event:13680`. Title `A captain was released`. Summary that same sentence.

Factions: `world-government` `treasury` `21553.01`. `treasuryNote` null. `free-tide` `treasury` null. `treasuryNote` `not visible to you`.

Bram Quill: `allowanceCap` 18. `allowanceRemaining` absent. `allowanceDayStart` 114. `allowanceResetsOnTick` 120. `allowanceOnDayBoundary` false.

Mara: `allowanceUncapped` true. `allowanceRole` `holder`. She is not held.

Pax Ash: `allowanceCap` null. `allowanceUncapped` null. `allowanceRole` null.

## Checkpoint 6 — acting commander, state tick 595

From tick 119:

1. `{"ticks":144}` → `ticksAdvanced` 144. `attentionUpdated` false. `tick` 263. `day` `43.83`.
2. `{"ticks":144}` → `ticksAdvanced` 144. `attentionUpdated` false. `tick` 407. `day` `67.83`.
3. `{"ticks":144}` → `ticksAdvanced` 144. `attentionUpdated` false. `tick` 551. `day` `91.83`.
4. `{"ticks":144}` → `ticksAdvanced` 44. `attentionUpdated` true. `tick` 595. `day` `99.17`.

`GET /api/state?limit=200`. State `tick` 595. State `day` 99.17.

Mara Vane is held at `crown-harbor`:

- `allowanceRole` `captive-holder`
- `allowanceUncapped` false
- `allowanceCap` null
- `allowanceRemaining` null
- `allowanceNote` `Cannot spend while held.`

Jun Marrow, `character-05`:

- `allowanceRole` `acting-commander`
- `allowanceUncapped` false
- `allowanceCap` 18
- `allowanceRemaining` absent
- `allowanceOnDayBoundary` false
- `allowanceDayStart` 594
- `allowanceResetsOnTick` 600
- `allowanceNote` null

`world-government` `actingCommanderId` `character-05`. `treasury` `34008.89`. `treasuryNote` null. `seatSummary`:

`Jun Marrow covers Mara Vane's seat in World Government while Mara Vane is held. The orders stay Mara Vane's.`

`free-tide` `treasury` null. `treasuryNote` `not visible to you`. `actingCommanderId` null.

Pax Ash still has `allowanceRole` null and `allowanceCap` null. This seat does not show his allowance.

## Criteria

`PROMOTE` when every checkpoint matches, including the absent `allowanceRemaining`, the uncapped free holder, the bound acting commander, the null rival rows, sequence 43's qualified summary with the stored summary unchanged, and sequence 13680 with `data` null and `not visible to you`.

`REVISE` when a checkpoint's text or field is present but wrong, or when `allowanceRemaining` appears as 18 while nothing has been drawn, or when a rival row shows a cap, a remainder, or a treasury number.

`ABANDON` when the world tick, the event count, or a later decision differs from this campaign, or when sequence 13680's `data` contains a Free Tide balance, or when the acting commander is uncapped.

## Session

- Date: 2026-10-01.
- HEAD before the first request: `03d54be48ad225577195b7d187eb7cef0fcac476`.
- Node `v24.21.0`. One process. Seed 1847. Seat Mara Vane, `character-01`. No commands.
- `npm run dashboard -- --reset --seed 1847` on `http://127.0.0.1:4317`.

`GET /api/health` HTTP 200. Body `{"ok":true,"tick":0,"events":0}`.

### Checkpoint 1 — state tick 0

`GET /api/state?limit=200` HTTP 200. `tick` 0. `day` 0. `eventPage.total` 0.

Bram Quill, `character-02`: `allowanceCap` 18. `allowanceRemaining` absent. `allowanceUncapped` false. `allowanceRole` `member`. `allowanceOnDayBoundary` true. `allowanceDayStart` 0. `allowanceResetsOnTick` 6. `allowanceNote` null.

Mara Vane, `character-01`: `allowanceCap` null. `allowanceRemaining` null. `allowanceUncapped` true. `allowanceRole` `holder`. `allowanceOnDayBoundary` null. `allowanceNote` null.

Mina Vale, `character-15`, and Pax Ash, `character-14`: `allowanceCap`, `allowanceRemaining`, `allowanceUncapped`, `allowanceRole`, and `allowanceNote` are null.

`world-government`: `treasury` 18000. `treasuryNote` null. `commanderId` `character-01`. `actingCommanderId` null.

`free-tide`: `treasury` null. `treasuryNote` `not visible to you`. `commanderId` `character-14`. `actingCommanderId` null.

### Checkpoint 2 — sequence 43, state tick 1

`POST /api/advance` `{"ticks":1}` HTTP 200. `ticksAdvanced` 1. `attentionUpdated` false. `tick` 1. `day` 0.17.

`GET /api/state?limit=200` HTTP 200. State `tick` 1. State `day` 0.17.

Sequence 43 is on this page. `type` `standing-order-accepted`. `tick` 0. `payloadWithheld` false.

Summary, exact:

`Toma Reef (World Government) accepted the trade supplies order.`

`data.summary`, exact:

`Toma Reef accepted the trade supplies order.`

Toma Reef, `character-07`: `name` `Toma Reef`. `displayName` `Toma Reef (World Government)`. `allowanceRole` `member`. `allowanceCap` 18. `allowanceRemaining` absent.

Bram Quill: `allowanceOnDayBoundary` false. `allowanceDayStart` 0. `allowanceResetsOnTick` 6. `allowanceCap` 18. `allowanceRemaining` absent. `allowanceUncapped` false.

### Checkpoint 3 — state tick 3

`POST /api/advance` `{"ticks":2}` HTTP 200. `ticksAdvanced` 2. `attentionUpdated` false. `tick` 3. `day` 0.5.

`GET /api/state?limit=200` HTTP 200. State `tick` 3. State `day` 0.5.

Bram Quill: `allowanceCap` 18. `allowanceRemaining` absent. `allowanceUncapped` false. `allowanceRole` `member`. `allowanceOnDayBoundary` false. `allowanceDayStart` 0. `allowanceResetsOnTick` 6.

Mara: `allowanceUncapped` true. `allowanceRole` `holder`. `allowanceCap` null.

Mina Vale: `allowanceCap` null. `allowanceUncapped` null. `allowanceRole` null.

### Checkpoint 4 — state tick 6

`POST /api/advance` `{"ticks":3}` HTTP 200. `ticksAdvanced` 3. `attentionUpdated` false. `tick` 6. `day` 1.

`GET /api/state?limit=200` HTTP 200. State `tick` 6. State `day` 1.

Bram Quill: `allowanceOnDayBoundary` true. `allowanceDayStart` 6. `allowanceResetsOnTick` 12. `allowanceCap` 18. `allowanceRemaining` absent. `allowanceUncapped` false.

The cap stayed 18. `allowanceRemaining` stayed absent.

### Checkpoint 5 — state tick 119

`POST /api/advance` `{"ticks":113}` HTTP 200. `ticksAdvanced` 113. `attentionUpdated` false. `tick` 119. `day` 19.83.

`GET /api/state?limit=200` HTTP 200. State `tick` 119. State `day` 19.83.

Sequence 13680 is on this page. `type` `captivity-released`. `actorId` `character-04`. `tick` 118. `payloadWithheld` true. `data` null.

Summary, exact:

`Sable Morrow was released from Cinder Key. 13.4 was paid and 103.21 was recorded as debt. Loyalty fell. 13.4 went to the Free Tide Compact treasury. The balance is not visible to you. The ransom line covers only the ransom.`

`details`, in order:

1. `Sable Morrow was released from Cinder Key.`
2. `13.4 was paid and 103.21 was recorded as debt.`
3. `Loyalty fell.`
4. `13.4 went to the Free Tide Compact treasury. The balance is not visible to you.`
5. `The ransom line covers only the ransom.`

The summary contains `not visible to you`. The money figures in it are `13.4` and `103.21`.

Briefing `event:13680`. Title `A captain was released`. Summary that same sentence.

`world-government` `treasury` `21553.01`. `treasuryNote` null. `free-tide` `treasury` null. `treasuryNote` `not visible to you`.

Bram Quill: `allowanceCap` 18. `allowanceRemaining` absent. `allowanceDayStart` 114. `allowanceResetsOnTick` 120. `allowanceOnDayBoundary` false.

Mara: `allowanceUncapped` true. `allowanceRole` `holder`. `captivity` null.

Pax Ash: `allowanceCap` null. `allowanceUncapped` null. `allowanceRole` null.

### Checkpoint 6 — state tick 595

From tick 119, four `POST /api/advance` bodies `{"ticks":144}`:

1. HTTP 200. `ticksAdvanced` 144. `attentionUpdated` false. `tick` 263. `day` 43.83.
2. HTTP 200. `ticksAdvanced` 144. `attentionUpdated` false. `tick` 407. `day` 67.83.
3. HTTP 200. `ticksAdvanced` 144. `attentionUpdated` false. `tick` 551. `day` 91.83.
4. HTTP 200. `ticksAdvanced` 44. `attentionUpdated` true. `tick` 595. `day` 99.17.

`GET /api/state?limit=200` HTTP 200. State `tick` 595. State `day` 99.17.

Mara Vane is held at `crown-harbor` (`captivity.settlementId` `crown-harbor`):

- `allowanceRole` `captive-holder`
- `allowanceUncapped` false
- `allowanceCap` null
- `allowanceRemaining` null
- `allowanceNote` `Cannot spend while held.`

Jun Marrow, `character-05`:

- `allowanceRole` `acting-commander`
- `allowanceUncapped` false
- `allowanceCap` 18
- `allowanceRemaining` absent
- `allowanceOnDayBoundary` false
- `allowanceDayStart` 594
- `allowanceResetsOnTick` 600
- `allowanceNote` null

`world-government` `actingCommanderId` `character-05`. `treasury` `34008.89`. `treasuryNote` null. `seatSummary`:

`Jun Marrow covers Mara Vane's seat in World Government while Mara Vane is held. The orders stay Mara Vane's.`

`free-tide` `treasury` null. `treasuryNote` `not visible to you`. `actingCommanderId` null.

Pax Ash: `allowanceRole` null. `allowanceCap` null.

## Findings

Every checkpoint matched the plan. No field was present and wrong. `allowanceRemaining` stayed absent on capped members and was null on Mara. Rival rows stayed null. Sequence 43's visible summary names `Toma Reef (World Government)` and `data.summary` stays `Toma Reef accepted the trade supplies order.` Sequence 13680 has `data` null, and the sentence says `The balance is not visible to you`. Jun Marrow's `allowanceUncapped` is false and his cap is 18. The world tick, the advance lengths, and the day figures matched this campaign.

Player notes:

- Bram's card shows a cap of 18 and no remaining amount, so I cannot tell from the row whether he has spent any of it.
- The next morning the cap is still 18, the day start moved to 6, and the reset moved to 12.
- While I am free my row says I am the holder and my cap is blank.
- Mina and Pax show no allowance. Free Tide's treasury reads `not visible to you`.
- Toma's feed line says `Toma Reef (World Government)`, and the line stored under it still says `Toma Reef`.
- Sable's release says 13.4 went to the Free Tide treasury and that the balance is not visible to me.
- At Crown Harbor the note says `Cannot spend while held.` My cap stays blank.
- Jun covers my seat and his cap is 18. The seat line says the orders stay mine.

## Verdict

PROMOTE
