# Playtest plan: batch 1 wording

This is the plan for a blind operator. It is not a completed session. Do not open `src/`, `tests/`, the branch diff, or `docs/design/` during the session. Use only the dashboard HTTP JSON, this plan, and `progress.md`.

One process. Seed 1847. The seat is Mara Vane, `character-01`, `playerId` `prototype-player`. Issue no command. Advance at most 144 ticks per call. An advance stops early when she is captured or released. Read `ticksAdvanced` and `tick` before the next call.

The advance body includes every event that call produced, newest first. Do not page backward for the rows named below. They are in that body. Read cards with `GET /api/state?limit=1`.

The readings below were taken on this branch through `GET /api/health`, `GET /api/state?limit=1`, and `POST /api/advance`. Node v24.21.0. One process, seed 1847, live session, no command. A match is the campaign. A miss is not a new reading to write into this file during the session.

## Hypothesis and ambition

**Hypothesis.** A desertion line names the faction and does not name the roll. `data` on that row stays null for Mara. A debt line names the creditor. The amount is on the row when she is the debtor or her faction is the creditor, and off the row otherwise. Mina Vale's upkeep, read by Mara, stays `Mina Vale's upkeep was recorded.` Mara holds World Government, so a Free Tide short-pay clause is not on her feed. No World Government upkeep row in this session adds `Pay was short`.

**Ambition.** Read Mina's pay note at tick 114 and the withheld upkeep line. Leave tick 174, then read the desertions on the advance that arrives at tick 175. Continue through the capture pause and the release pause. Read Corin Hale's hidden debt line at tick 810, then Mina Vale's amount line at tick 930.

**What you can see.** The pay note on a captain in the same port. The public desertion sentence, without a roll. A debt sentence that names the creditor. The amount when the creditor is World Government. Not Free Tide's ledger (`debts` null). Not the coins on a withheld `debt-repaid`. Not `Pay was short` on Mina's upkeep row.

## Setup

```text
npm run dashboard -- --reset --seed 1847
```

Bind `127.0.0.1:4317`. Record `git rev-parse HEAD` before the first request. Confirm port 4317 is free before `--reset`.

`GET /api/health` HTTP 200.

```json
{"ok":true,"tick":0,"events":0}
```

`GET /api/state?limit=1` HTTP 200. `tick` 0. `day` 0. `player.id` `prototype-player`. `player.displayName` `Mara Vane`. `player.characterId` `character-01`. `party.locationId` `crown-harbor`.

Mara Vane, `character-01`: `factionId` `world-government`. `locationId` `crown-harbor`. `morale` 93. `money` 108. `payNote` null.

Mina Vale, `character-15`: `factionId` `free-tide`. `locationId` `cinder-key`. `morale` null. `money` null. `payNote` null.

## Checkpoint 1. Mina's upkeep stays the public line

`POST /api/advance`

```json
{"ticks":114}
```

HTTP 200.

- `ok` true. `tick` 114. `day` 19. `ticksAdvanced` 114.
- `combatUpdated` false. `attentionUpdated` false. `pausedForBattle` false.
- `eventSequence` 13444.
- The body has 13444 events.

Sequence 13380, tick 113, day 18.83, type `character-upkeep`, actor `character-15`. `payloadWithheld` true. `data` null. Summary:

`Mina Vale's upkeep was recorded.`

The summary does not contain `0.5` or `Pay was short`. No event in that body has a summary containing `Pay was short`.

`GET /api/state?limit=1`. HTTP 200. `tick` 114. `day` 19.

Mina Vale, `character-15`:

- `factionId` `free-tide`. `locationId` `crown-harbor`.
- `morale` 57.6. `money` 35.17. `health` 90.
- `payNote` `Pay is short, so morale loses 0.5 on upkeep.`

Mara Vane is still at `crown-harbor`. `morale` 24.3. `money` 108. `health` 76.3. `payNote` null.

She is the only character whose `payNote` is set. World Government `treasury` is 17456.14. `debts` is `[]`. Free Tide `treasury` is null. `debts` is null.

The card note is the co-located reading. The feed line is the separate sentence, and it is not on this row. Nothing in this body is the holder's short-pay line.

## Checkpoint 2. Tick 174, before the morning runs

`POST /api/advance`

```json
{"ticks":60}
```

HTTP 200.

- `ok` true. `tick` 174. `day` 29. `ticksAdvanced` 60.
- `combatUpdated` false. `attentionUpdated` false. `pausedForBattle` false.
- `eventSequence` 20819.
- No event in that body has type `character-deserted`.
- No summary contains `Pay was short`.

`GET /api/state?limit=1`. HTTP 200. `tick` 174. `day` 29.

Finn Frost, `character-18`, and Bram Tern, `character-22`:

- `factionId` `free-tide`. `locationId` null.
- `morale` null. `money` null. `payNote` null.

Mara is still at `crown-harbor`. `morale` 0. `money` 108. `payNote` null.

## Checkpoint 3. The desertion line at tick 175

`POST /api/advance`

```json
{"ticks":1}
```

HTTP 200.

- `ok` true. `tick` 175. `day` 29.17. `ticksAdvanced` 1.
- `combatUpdated` false. `attentionUpdated` false. `pausedForBattle` false.
- `eventSequence` 20945.
- The body has 126 events.

Sequence 20820, tick 174, day 29, type `character-deserted`, actor `character-18`, target `free-tide`. `payloadWithheld` true. `data` null. Summary:

`Finn Frost left Free Tide Compact.`

Sequence 20821, tick 174, day 29, type `character-deserted`, actor `character-22`, target `free-tide`. `payloadWithheld` true. `data` null. Summary:

`Bram Tern left Free Tide Compact.`

Neither summary contains `roll` or `0.245` or `0.034`.

`GET /api/state?limit=1`. HTTP 200. `tick` 175. `day` 29.17.

Finn Frost and Bram Tern: `factionId` null. `locationId` null. `payNote` null.

Mara is still at `crown-harbor`. `morale` 0. `money` 108. `payNote` null.

`factions`: `free-tide` has `debts` null and `treasury` null. `world-government` has `debts` `[]` and `treasury` 17592.63.

## Checkpoint 4. Two pauses

From tick 175 the next calls stop early. Do not skip them. Issue no command while she is held.

`POST /api/advance`

```json
{"ticks":144}
```

HTTP 200.

- `ok` true. `tick` 317. `day` 52.83. `ticksAdvanced` 142.
- `attentionUpdated` true. `combatUpdated` false. `pausedForBattle` false.
- `eventSequence` 39523.
- No `character-deserted`. No `debt-repaid`. No summary contains `Pay was short`.

`POST /api/advance`

```json
{"ticks":144}
```

HTTP 200.

- `ok` true. `tick` 401. `day` 66.83. `ticksAdvanced` 84.
- `attentionUpdated` true. `combatUpdated` false. `pausedForBattle` false.
- `eventSequence` 50573.
- No `character-deserted`. No `debt-repaid`. No summary contains `Pay was short`.

## Checkpoint 5. The hidden debt line

`POST /api/advance` `{"ticks":144}`

- `tick` 545. `day` 90.83. `ticksAdvanced` 144.
- `attentionUpdated` false. `combatUpdated` false. `pausedForBattle` false.
- `eventSequence` 70027.
- No `debt-repaid`. No `character-deserted`. No summary contains `Pay was short`.

`POST /api/advance` `{"ticks":144}`

- `tick` 689. `day` 114.83. `ticksAdvanced` 144.
- `attentionUpdated` false. `combatUpdated` false. `pausedForBattle` false.
- `eventSequence` 90631.

One `character-deserted`, sequence 82206, tick 630, day 105, actor `character-19`, target `free-tide`. `payloadWithheld` true. `data` null. Summary:

`Esme Dusk left Free Tide Compact.`

The summary does not contain `roll` or `0.407`. No `debt-repaid` in that body. No summary contains `Pay was short`.

`POST /api/advance` `{"ticks":144}`

- `tick` 833. `day` 138.83. `ticksAdvanced` 144.
- `attentionUpdated` false. `combatUpdated` false. `pausedForBattle` false.
- `eventSequence` 110882.
- The body has 20251 events. Four `debt-repaid` rows. All have `payloadWithheld` true and `data` null.

The oldest is sequence 107676, tick 810, day 135, actor `character-16`, target `free-tide`. Summary:

`Corin Hale paid toward a debt to Free Tide Compact.`

The same body also has `debt-repaid` at ticks 816, 822, and 828, the same actor, the same sentence, `data` null. None of those summaries contains `18.33` or `352.33`. No summary contains `Pay was short`.

`GET /api/state?limit=1`. HTTP 200. `tick` 833. `day` 138.83.

- `world-government` `treasury` 13580.8. `debts` is `[]`.
- `free-tide` `treasury` null. `debts` null.
- Corin Hale, `character-16`: `locationId` `cinder-key`. `factionId` `secession-character-16-cinder-key-653`. `payNote` null.
- Mara: `locationId` `glassport`. `morale` 0. `money` 0. `payNote` null. `factionId` `world-government`.

## Checkpoint 6. The amount, because she is the creditor

`POST /api/advance`

```json
{"ticks":144}
```

HTTP 200.

- `ok` true. `tick` 977. `day` 162.83. `ticksAdvanced` 144.
- `attentionUpdated` false. `combatUpdated` false. `pausedForBattle` false.
- `eventSequence` 131375.
- The body has 20493 events.
- No summary contains `Pay was short`.

Eight rows have `payloadWithheld` false and type `debt-repaid`. The oldest is sequence 124572, tick 930, day 155, actor `character-15`, target `world-government`. Summary:

`Mina Vale paid 15.26 toward a debt to World Government.`

`data.paid` is 15.26. `data.remainingValue` is 516.51. `data.originalValue` is 531.77. `data.closed` is false. `data.debtId` is `debt-123260`.

The same shape, newest first in that set:

| sequence | tick | summary |
| ---: | ---: | --- |
| 130650 | 972 | `Mina Vale paid 15.37 toward a debt to World Government.` |
| 129771 | 966 | `Mina Vale paid 15.34 toward a debt to World Government.` |
| 128904 | 960 | `Mina Vale paid 15.34 toward a debt to World Government.` |
| 128047 | 954 | `Mina Vale paid 15.34 toward a debt to World Government.` |
| 127194 | 948 | `Mina Vale paid 15.34 toward a debt to World Government.` |
| 126337 | 942 | `Mina Vale paid 15.34 toward a debt to World Government.` |
| 125455 | 936 | `Mina Vale paid 15.32 toward a debt to World Government.` |
| 124572 | 930 | `Mina Vale paid 15.26 toward a debt to World Government.` |

Corin Hale's rows in that body stay `Corin Hale paid toward a debt to Free Tide Compact.` with `data` null. The oldest of those is sequence 111033, tick 834.

Stop the process.

## Findings to check

- Sequence 13380 reads `Mina Vale's upkeep was recorded.` and does not contain `Pay was short` or `0.5`. Her card at tick 114 still carries the pay note. Mara's `payNote` is null. No advance in this plan adds `Pay was short` to a summary she can read.
- The advance that arrives at tick 174 has no desertion. Finn and Bram are still `free-tide`.
- The next advance names both departures and does not name a roll. The following read has `factionId` null on both cards.
- Sequence 107676 is `Corin Hale paid toward a debt to Free Tide Compact.` with `data` null.
- Sequence 124572 is `Mina Vale paid 15.26 toward a debt to World Government.` with `payloadWithheld` false and `data.paid` 15.26.

## Session

Blind session on `feature/batch1-polish` at `1f1081854d547775ba752d3cc38ffaca55802ded`. `git rev-parse HEAD` before the first request was `1f1081854d547775ba752d3cc38ffaca55802ded`. Node v24.21.0, ICU 78.3. Seed 1847. One process: `npm run dashboard -- --reset --seed 1847` on `http://127.0.0.1:4317`. Port 4317 was free before `--reset`. Viewer Mara Vane, `character-01`, `playerId` `prototype-player`. No command was posted. `beforeSequence` was omitted on every event read. The named rows were taken from the advance body that produced them. Each body was newest first. The process was stopped after the tick 977 advance. `golden:update` was not run.

### Setup

`GET /api/health` HTTP 200.

```json
{"ok":true,"tick":0,"events":0}
```

`GET /api/state?limit=1` HTTP 200.

- `tick` 0. `day` 0.
- `player.id` `prototype-player`. `player.displayName` `Mara Vane`. `player.characterId` `character-01`.
- `party.locationId` `crown-harbor`.

Mara Vane, `character-01`:

- `factionId` `world-government`. `locationId` `crown-harbor`.
- `morale` 93. `money` 108. `payNote` null.

Mina Vale, `character-15`: `factionId` `free-tide`. `locationId` `cinder-key`. `morale` null. `money` null. `payNote` null.

### Checkpoint 1. Mina's upkeep stays the public line

`POST /api/advance` `{"ticks":114}` HTTP 200.

- `ok` true. `tick` 114. `day` 19. `ticksAdvanced` 114.
- `combatUpdated` false. `attentionUpdated` false. `pausedForBattle` false.
- `eventSequence` 13444.
- The body has 13444 events.

Sequence 13380, tick 113, day 18.83, type `character-upkeep`, actor `character-15`. `payloadWithheld` true. `data` null. Summary:

`Mina Vale's upkeep was recorded.`

The summary does not contain `0.5` or `Pay was short`. No event in that body has a summary containing `Pay was short`.

`GET /api/state?limit=1` HTTP 200. `tick` 114. `day` 19.

Mina Vale, `character-15`:

- `factionId` `free-tide`. `locationId` `crown-harbor`.
- `morale` 57.6. `money` 35.17. `health` 90.
- `payNote` `Pay is short, so morale loses 0.5 on upkeep.`

Mara Vane is still at `crown-harbor`. `morale` 24.3. `money` 108. `health` 76.3. `payNote` null.

She is the only character whose `payNote` is set. World Government `treasury` is 17456.14. `debts` is `[]`. Free Tide `treasury` is null. `debts` is null.

### Checkpoint 2. Tick 174, before the morning runs

`POST /api/advance` `{"ticks":60}` HTTP 200.

- `ok` true. `tick` 174. `day` 29. `ticksAdvanced` 60.
- `combatUpdated` false. `attentionUpdated` false. `pausedForBattle` false.
- `eventSequence` 20819.
- No event in that body has type `character-deserted`.
- No summary contains `Pay was short`.

`GET /api/state?limit=1` HTTP 200. `tick` 174. `day` 29.

Finn Frost, `character-18`, and Bram Tern, `character-22`:

- `factionId` `free-tide`. `locationId` null.
- `morale` null. `money` null. `payNote` null.

Mara is still at `crown-harbor`. `morale` 0. `money` 108. `payNote` null.

### Checkpoint 3. The desertion line at tick 175

`POST /api/advance` `{"ticks":1}` HTTP 200.

- `ok` true. `tick` 175. `day` 29.17. `ticksAdvanced` 1.
- `combatUpdated` false. `attentionUpdated` false. `pausedForBattle` false.
- `eventSequence` 20945.
- The body has 126 events.

Sequence 20820, tick 174, day 29, type `character-deserted`, actor `character-18`, target `free-tide`. `payloadWithheld` true. `data` null. Summary:

`Finn Frost left Free Tide Compact.`

Sequence 20821, tick 174, day 29, type `character-deserted`, actor `character-22`, target `free-tide`. `payloadWithheld` true. `data` null. Summary:

`Bram Tern left Free Tide Compact.`

Neither summary contains `roll` or `0.245` or `0.034`.

`GET /api/state?limit=1` HTTP 200. `tick` 175. `day` 29.17.

Finn Frost and Bram Tern: `factionId` null. `locationId` null. `payNote` null.

Mara is still at `crown-harbor`. `morale` 0. `money` 108. `payNote` null.

`factions`: `free-tide` has `debts` null and `treasury` null. `world-government` has `debts` `[]` and `treasury` 17592.63.

### Checkpoint 4. Two pauses

No command was posted while she was held.

`POST /api/advance` `{"ticks":144}` HTTP 200.

- `ok` true. `tick` 317. `day` 52.83. `ticksAdvanced` 142.
- `attentionUpdated` true. `combatUpdated` false. `pausedForBattle` false.
- `eventSequence` 39523.
- No `character-deserted`. No `debt-repaid`. No summary contains `Pay was short`.

`POST /api/advance` `{"ticks":144}` HTTP 200.

- `ok` true. `tick` 401. `day` 66.83. `ticksAdvanced` 84.
- `attentionUpdated` true. `combatUpdated` false. `pausedForBattle` false.
- `eventSequence` 50573.
- No `character-deserted`. No `debt-repaid`. No summary contains `Pay was short`.

### Checkpoint 5. The hidden debt line

`POST /api/advance` `{"ticks":144}` HTTP 200.

- `ok` true. `tick` 545. `day` 90.83. `ticksAdvanced` 144.
- `attentionUpdated` false. `combatUpdated` false. `pausedForBattle` false.
- `eventSequence` 70027.
- No `debt-repaid`. No `character-deserted`. No summary contains `Pay was short`.

`POST /api/advance` `{"ticks":144}` HTTP 200.

- `ok` true. `tick` 689. `day` 114.83. `ticksAdvanced` 144.
- `attentionUpdated` false. `combatUpdated` false. `pausedForBattle` false.
- `eventSequence` 90631.

One `character-deserted`, sequence 82206, tick 630, day 105, actor `character-19`, target `free-tide`. `payloadWithheld` true. `data` null. Summary:

`Esme Dusk left Free Tide Compact.`

The summary does not contain `roll` or `0.407`. No `debt-repaid` in that body. No summary contains `Pay was short`.

`POST /api/advance` `{"ticks":144}` HTTP 200.

- `ok` true. `tick` 833. `day` 138.83. `ticksAdvanced` 144.
- `attentionUpdated` false. `combatUpdated` false. `pausedForBattle` false.
- `eventSequence` 110882.
- The body has 20251 events. Four `debt-repaid` rows. All have `payloadWithheld` true and `data` null.

The oldest is sequence 107676, tick 810, day 135, actor `character-16`, target `free-tide`. Summary:

`Corin Hale paid toward a debt to Free Tide Compact.`

The same body also has `debt-repaid` at ticks 816, 822, and 828, the same actor, the same sentence, `data` null. Those rows are sequences 108523, 109354, and 110181. None of those summaries contains `18.33` or `352.33`. No summary contains `Pay was short`.

`GET /api/state?limit=1` HTTP 200. `tick` 833. `day` 138.83.

- `world-government` `treasury` 13580.8. `debts` is `[]`.
- `free-tide` `treasury` null. `debts` null.
- Corin Hale, `character-16`: `locationId` `cinder-key`. `factionId` `secession-character-16-cinder-key-653`. `payNote` null.
- Mara: `locationId` `glassport`. `morale` 0. `money` 0. `payNote` null. `factionId` `world-government`.

### Checkpoint 6. The amount, because she is the creditor

`POST /api/advance` `{"ticks":144}` HTTP 200.

- `ok` true. `tick` 977. `day` 162.83. `ticksAdvanced` 144.
- `attentionUpdated` false. `combatUpdated` false. `pausedForBattle` false.
- `eventSequence` 131375.
- The body has 20493 events.
- No summary contains `Pay was short`.

Eight rows have `payloadWithheld` false and type `debt-repaid`. The oldest is sequence 124572, tick 930, day 155, actor `character-15`, target `world-government`. Summary:

`Mina Vale paid 15.26 toward a debt to World Government.`

`data.paid` is 15.26. `data.remainingValue` is 516.51. `data.originalValue` is 531.77. `data.closed` is false. `data.debtId` is `debt-123260`.

The same shape, newest first in that set:

| sequence | tick | summary |
| ---: | ---: | --- |
| 130650 | 972 | `Mina Vale paid 15.37 toward a debt to World Government.` |
| 129771 | 966 | `Mina Vale paid 15.34 toward a debt to World Government.` |
| 128904 | 960 | `Mina Vale paid 15.34 toward a debt to World Government.` |
| 128047 | 954 | `Mina Vale paid 15.34 toward a debt to World Government.` |
| 127194 | 948 | `Mina Vale paid 15.34 toward a debt to World Government.` |
| 126337 | 942 | `Mina Vale paid 15.34 toward a debt to World Government.` |
| 125455 | 936 | `Mina Vale paid 15.32 toward a debt to World Government.` |
| 124572 | 930 | `Mina Vale paid 15.26 toward a debt to World Government.` |

Corin Hale's rows in that body stay `Corin Hale paid toward a debt to Free Tide Compact.` with `data` null. The oldest of those is sequence 111033, tick 834.

The process was stopped.

## Findings

The hypothesis holds. Sequence 13380 reads `Mina Vale's upkeep was recorded.` and does not contain `Pay was short` or `0.5`. Her card at tick 114 still carries `Pay is short, so morale loses 0.5 on upkeep.` Mara's `payNote` is null, and she is the only character whose `payNote` is set at that tick. No advance in this session adds `Pay was short` to a summary she can read. The advance that arrives at tick 174 has no desertion. Finn Frost and Bram Tern are still `free-tide`. The next advance names both departures and does not name a roll. The following read has `factionId` null on both cards. Sequence 107676 is `Corin Hale paid toward a debt to Free Tide Compact.` with `data` null. Sequence 124572 is `Mina Vale paid 15.26 toward a debt to World Government.` with `payloadWithheld` false and `data.paid` 15.26.

| Checkpoint | Expected | Observed |
| --- | --- | --- |
| Health at tick 0 | HTTP 200 `{"ok":true,"tick":0,"events":0}` | Same |
| Viewer at tick 0 | Mara Vane, `character-01`, `prototype-player`, `crown-harbor` | Same |
| Mara at tick 0 | `world-government`, `crown-harbor`, morale 93, money 108, `payNote` null | Same |
| Mina at tick 0 | `free-tide`, `cinder-key`, morale null, money null, `payNote` null | Same |
| Advance 114 | `tick` 114, `day` 19, `ticksAdvanced` 114, `eventSequence` 13444, 13444 events, no combat, no attention, not paused | Same |
| Sequence 13380 | `Mina Vale's upkeep was recorded.` Payload withheld. `data` null. No `0.5`. No `Pay was short` | Same |
| Short-pay summaries through tick 114 | None | None |
| Mina at tick 114 | `crown-harbor`, morale 57.6, money 35.17, health 90, `Pay is short, so morale loses 0.5 on upkeep.` | Same |
| Mara at tick 114 | `crown-harbor`, morale 24.3, money 108, health 76.3, `payNote` null | Same |
| Pay notes at tick 114 | Only Mina's is set | Same |
| Ledgers at tick 114 | World Government treasury 17456.14, `debts` `[]`. Free Tide treasury null, `debts` null | Same |
| Advance to 174 | `tick` 174, `day` 29, `ticksAdvanced` 60, `eventSequence` 20819, no `character-deserted`, no `Pay was short` | Same |
| Finn and Bram at 174 | `free-tide`, `locationId` null, morale null, money null, `payNote` null | Same |
| Mara at 174 | `crown-harbor`, morale 0, money 108, `payNote` null | Same |
| Advance 1 | `tick` 175, `day` 29.17, `ticksAdvanced` 1, `eventSequence` 20945, 126 events | Same |
| Sequence 20820 | `Finn Frost left Free Tide Compact.` `data` null. No `roll`, `0.245`, or `0.034` | Same |
| Sequence 20821 | `Bram Tern left Free Tide Compact.` `data` null. No `roll`, `0.245`, or `0.034` | Same |
| Finn and Bram at 175 | `factionId` null, `locationId` null, `payNote` null | Same |
| Mara at 175 | `crown-harbor`, morale 0, money 108, `payNote` null | Same |
| Ledgers at 175 | `free-tide` `debts` null, treasury null. `world-government` `debts` `[]`, treasury 17592.63 | Same |
| First pause | `tick` 317, `day` 52.83, `ticksAdvanced` 142, `attentionUpdated` true, `eventSequence` 39523. No desertion, no debt, no `Pay was short` | Same |
| Second pause | `tick` 401, `day` 66.83, `ticksAdvanced` 84, `attentionUpdated` true, `eventSequence` 50573. No desertion, no debt, no `Pay was short` | Same |
| Advance to 545 | `tick` 545, `day` 90.83, `ticksAdvanced` 144, `eventSequence` 70027, no `debt-repaid`, no `character-deserted`, no `Pay was short` | Same |
| Advance to 689 | `tick` 689, `day` 114.83, `ticksAdvanced` 144, `eventSequence` 90631 | Same |
| Esme Dusk | tick 630, sequence 82206, `Esme Dusk left Free Tide Compact.` `data` null. No `roll` or `0.407`. No `debt-repaid`. No `Pay was short` | Same |
| Advance to 833 | `tick` 833, `day` 138.83, `ticksAdvanced` 144, `eventSequence` 110882, 20251 events, four `debt-repaid`, all withheld, `data` null | Same |
| Sequence 107676 | tick 810, `Corin Hale paid toward a debt to Free Tide Compact.` `data` null. No `18.33` or `352.33` | Same |
| Later Corin debts | ticks 816, 822, and 828, same actor, same sentence, `data` null | Same |
| State at 833 | World Government treasury 13580.8, `debts` `[]`. Free Tide treasury null, `debts` null. Corin at `cinder-key`, faction `secession-character-16-cinder-key-653`, `payNote` null. Mara at `glassport`, morale 0, money 0, `payNote` null, `world-government` | Same |
| Advance to 977 | `tick` 977, `day` 162.83, `ticksAdvanced` 144, `eventSequence` 131375, 20493 events, no `Pay was short` | Same |
| Visible `debt-repaid` | Eight rows, `payloadWithheld` false. Oldest sequence 124572, tick 930, `Mina Vale paid 15.26 toward a debt to World Government.` `data.paid` 15.26, `remainingValue` 516.51, `originalValue` 531.77, `closed` false, `debtId` `debt-123260` | Same |
| The eight summaries | 15.37, 15.34, 15.34, 15.34, 15.34, 15.34, 15.32, 15.26 at sequences 130650 through 124572 | Same |
| Corin in that body | `Corin Hale paid toward a debt to Free Tide Compact.` `data` null. Oldest sequence 111033, tick 834 | Same |

### What worked

- Standing next to Mina Vale showed the short-pay sentence on her card. The feed line stayed `Mina Vale's upkeep was recorded.`
- Mara's own card never carried a pay note. No summary she could read said `Pay was short`.
- Finn and Bram were still in Free Tide at tick 174. The next morning named both departures and did not name a roll.
- Corin Hale's debt lines named Free Tide Compact and left the amount off the JSON.
- Mina Vale's payments to World Government named the coins, because that faction is the creditor.

### Implementation defects

- None observed.

### Follow-up experiments

- None for this plan.

## Verdict

`PROMOTE`

Every reading listed in this plan matched at `1f1081854d547775ba752d3cc38ffaca55802ded`. Mina Vale's upkeep line stayed the public sentence, and her card still said pay was short. The desertion lines named Free Tide Compact and did not name a roll. Corin Hale's debt to Free Tide Compact stayed a sentence with `data` null. Mina Vale's debt to World Government showed the amount, starting at `15.26` on sequence 124572. No World Government upkeep row in this session added `Pay was short`.
