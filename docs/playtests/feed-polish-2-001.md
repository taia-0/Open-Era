# Playtest plan: feed polish 2

This is the plan for a blind operator. It is not a completed session. Do not fill Session, Findings, or Verdict while writing the plan. Do not open `src/`, `tests/`, the branch diff, or `docs/design/` during the session. Use only the dashboard HTTP JSON, this plan, and `progress.md`.

One process per checkpoint. Seed 1847 each time. The seat is Mara Vane, `character-01`, `playerId` `prototype-player`. Do not pass another character. Stop the process, and confirm port 4317 is free, before the next `--reset`.

Issue no command the checkpoint does not name. Advance at most 144 ticks per call. Omit `beforeSequence` on event reads. An empty `beforeSequence=` returns the newest page. Do not send `beforeSequence=0`. That bound returns no events.

The readings below were taken on this tree through `GET /api/state?limit=200`, `POST /api/advance`, and `POST /api/commands`. A match is the campaign. A miss is not a new reading to write into this file during the session.

`eventPage.count` is `events.length`. `eventPage.total` is the stored events the projection keeps. `player-action-executed` and `player-command-resolved` are in neither, so a gap in the sequence numbers is one of those rows. `GET /api/health` `events` stays the raw log, which still holds them. A `command-refused` row is not stored. It is included in `count` and it is not included in `total`. It is prepended on every newest-page read, and it is absent when `beforeSequence` is set. `oldestSequence`, `newestSequence`, and `cursor` are stored sequences on the page. A refusal has `sequence` null and does not move the cursor.

```text
npm run dashboard -- --reset --seed 1847
```

Bind `127.0.0.1:4317`. Node v24.21.0.

## Hypothesis and ambition

**Milestone hypothesis:** A command refused at submit appears in the feed, and the HTTP body stays the refusal. A queued voyage names the port left and the port aimed at. The events page counts the rows it returns. The viewer's faction shows tax income against spending over the last 180 ticks. A new faction's declaration says the treasury starts empty, because the event stores 0 and the faction row's 2.69 is tax taken later in that same tick. An autonomous tax line says why the rate moved, and the row has `settlementId` null. An autonomous declaration with no successor ends with ` (no leader yet)`.

**Player ambition:** Mara Vane queues a voyage and is refused a rest while underway. She buys provisions and reads a page whose count matches the rows. She sets her own tax once. She takes Cinder Key and declares it Breakwater. On later worlds she issues no command and reads Free Tide's tax lines and the first autonomous declarations.

**Success signal:** Each checkpoint's summary, count, and treasury line matches the string in that checkpoint. `GET /api/health` `events` stays the raw log. A refusal does not change `eventPage.total`.

## Setup

Every checkpoint starts from a fresh process.

- `GET /api/health` HTTP 200 `{"ok":true,"tick":0,"events":0}`.
- `GET /api/state?limit=200` HTTP 200. `tick` 0. `day` 0. `player.displayName` `Mara Vane`. `player.characterId` `character-01`. `party.locationId` `crown-harbor`.
- `eventPage` keys are `count`, `limit`, `total`, `hasMore`, `oldestSequence`, `newestSequence`, `cursor`. `count` 0. `limit` 200. `total` 0. `hasMore` false. `oldestSequence` null. `newestSequence` null. `cursor` null. `events` length 0.
- `capabilities.requests.state.response.eventPage` is `describes that page. count is the rows in events, including a dashboard-only refusal on the newest page. total is the stored events the projection keeps. player-action-executed and player-command-resolved are in neither, so a gap in sequence numbers is one of those rows and is not a skipped page. A refusal is not stored, so it is not in total. oldestSequence, newestSequence, and cursor are stored sequences on this page`.
- World Government, `id` `world-government`, `name` `World Government`: `treasury` 18000, `treasuryNote` null, `treasuryLine` `Tax income 0, spending 0, over the last 180 ticks.`, `taxRate` 0.14, `taxRateSetTick` null. The key `treasuryLine` is present.
- Free Tide Compact, `id` `free-tide`: `treasury` null, `treasuryNote` `not visible to you`, `treasuryLine` null. The key `treasuryLine` is present.

There is no wage figure on the faction row. Spending on the line is treasury draws already published on events, net of refunds. Ransom is named only when that window credited some.

## Checkpoint 1. The voyage names both ports, then the rest is refused

Fresh process. Confirm the setup block.

1. `POST /api/commands` `{"playerId":"prototype-player","type":"character-action","action":"travel","targetId":"glassport"}`. HTTP 202.

```json
{"ok":true,"command":{"id":"command-00001","playerId":"prototype-player","issuedTick":0,"type":"character-action","action":"travel","targetId":"glassport","source":"treasury"}}
```

2. `GET /api/state?limit=200` before the advance. `tick` 0. `eventPage.count` 1. `eventPage.total` 1. `events` length 1. Sequence 1: `type` `player-command-accepted`, `tick` 0, `actorId` `character-01`, `targetId` `glassport`, `payloadWithheld` false, `summary` `Command queued for Mara Vane: travel from Crown Harbor to Glassport (from the treasury)`.

3. `POST /api/advance` `{"ticks":1}`. HTTP 200. `ok` true. `tick` 1. `day` 0.17. `ticksAdvanced` 1. `eventSequence` 187. `pausedForBattle` false.

4. `GET /api/health` HTTP 200. `events` 187. `GET /api/state?limit=200`. `tick` 1. `eventPage.count` 185. `eventPage.total` 185. `eventPage.hasMore` false. `eventPage.oldestSequence` 1. `eventPage.newestSequence` 187. `eventPage.cursor` 1. `events` length 185. Sequences 10 and 12 are absent. No row has `type` `player-action-executed` or `player-command-resolved`.

5. `POST /api/commands` `{"playerId":"prototype-player","type":"character-action","action":"rest"}`. HTTP 400.

```json
{"ok":false,"code":"character-traveling","error":"The character is already traveling"}
```

6. `GET /api/health`. `tick` 1. `events` 187. `GET /api/state?limit=200`. `tick` 1. `eventPage.total` 185. `eventPage.count` 186. `events` length 186. `events[0]` is the refusal. No new `player-command-accepted`.

The refusal keys are `sequence`, `tick`, `day`, `type`, `actorId`, `targetId`, `settlementId`, `summary`, `details`, `data`, `payloadWithheld`.

| key | value |
| --- | --- |
| `sequence` | null |
| `tick` | 1 |
| `day` | 0.17 |
| `type` | `command-refused` |
| `actorId` | `character-01` |
| `targetId` | null |
| `settlementId` | null |
| `summary` | `Mara Vane's command failed: The character is already traveling` |
| `details` | null |
| `data` | null |
| `payloadWithheld` | false |

`eventPage.oldestSequence` is still 1. `eventPage.newestSequence` is still 187. `eventPage.cursor` is still 1. The refusal did not move them.

## Checkpoint 2. A buy's page count is the rows returned

Fresh process. Confirm the setup block.

1. `POST /api/commands` `{"playerId":"prototype-player","type":"character-action","action":"buy-provisions","source":"purse"}`. HTTP 202. `command.id` `command-00001`. `command.action` `buy-provisions`. `command.source` `purse`.
2. `POST /api/advance` `{"ticks":1}`. HTTP 200. `tick` 1. `day` 0.17. `ticksAdvanced` 1. `eventSequence` 186.
3. `GET /api/health`. `events` 186.
4. `GET /api/state?limit=200`. `eventPage.count` 184. `eventPage.total` 184. `eventPage.hasMore` false. `events` length 184. `eventPage.count` equals `events.length`. Sequences 10 and 12 are absent. `eventPage.oldestSequence` is the last row's `sequence`. `eventPage.newestSequence` is the first row's `sequence`. No row has `type` `player-action-executed` or `player-command-resolved`.

`character-01` has one `market-trade`, sequence 11, `summary` `Mara Vane bought 12 provisions at Crown Harbor for 17.64 from the purse (hold now 47.42).` Sequence 1 summary is `Command queued for Mara Vane: 12 provisions at 1.47 each, 17.64 total`.

## Checkpoint 3. A player tax set keeps its sentence, and settlementId is null

Fresh process. Confirm the setup block.

1. `POST /api/commands` `{"playerId":"prototype-player","type":"set-tax-rate","taxRate":0.12}`. HTTP 202. `command.id` `command-00001`. `command.taxRate` 0.12. `command.factionId` `world-government`.
2. `POST /api/advance` `{"ticks":1}`. HTTP 200. `tick` 1. `day` 0.17. `ticksAdvanced` 1. `eventSequence` 185.
3. `GET /api/health`. `events` 185.
4. `GET /api/state?limit=200`. `eventPage.count` 184. `eventPage.total` 184. `events` length 184. Sequence 11 is absent.

Sequence 10: `type` `tax-rate-set`, `tick` 0, `actorId` `character-01`, `payloadWithheld` false. The key `settlementId` is present and the value is null. Summary `Mara Vane set the World Government tax rate to 12%.` The summary does not say `raised` or `treasury short`.

## Checkpoint 4. Breakwater starts empty, and the row shows the same-tick tax

Fresh process. Confirm the setup block. Do not send the five declaration refusals from the earlier secession plan. Those would stay on the newest page and change the counts below. The advance `eventSequence` values match the earlier declaration path. Do not treat an intermediate `eventPage.total` as the raw `eventSequence`. The projected total drops the executed and resolved rows.

1. `POST /api/commands` `{"playerId":"prototype-player","type":"character-action","action":"travel","targetId":"cinder-key"}`. HTTP 202. `command.id` `command-00001`. `command.issuedTick` 0.
2. `POST /api/advance` `{"ticks":6}`. HTTP 200. `tick` 6. `day` 1. `ticksAdvanced` 6. `eventSequence` 715. `pausedForBattle` false.
3. `GET /api/state?limit=200`. `party.locationId` `cinder-key`.
4. `POST /api/commands` `{"playerId":"prototype-player","type":"character-action","action":"raid"}`. HTTP 202. `command.id` `command-00002`. `command.issuedTick` 6.
5. `POST /api/advance` `{"ticks":1}` three times. Stop when `pausedForBattle` is false.

| Call | tick | day | eventSequence | pausedForBattle |
| --- | ---: | ---: | ---: | --- |
| 1 | 7 | 1.17 | 840 | true |
| 2 | 8 | 1.33 | 946 | true |
| 3 | 9 | 1.5 | 1057 | false |

6. `POST /api/commands` the same raid body. HTTP 202. `command.id` `command-00003`. `command.issuedTick` 9.
7. `POST /api/advance` `{"ticks":1}` three times.

| Call | tick | day | eventSequence | pausedForBattle |
| --- | ---: | ---: | ---: | --- |
| 1 | 10 | 1.67 | 1177 | true |
| 2 | 11 | 1.83 | 1301 | true |
| 3 | 12 | 2 | 1430 | false |

8. `POST /api/commands` the same raid body. HTTP 202. `command.id` `command-00004`. `command.issuedTick` 12.
9. `POST /api/advance` `{"ticks":1}` once. HTTP 200. `tick` 13. `day` 2.17. `eventSequence` 1560. `pausedForBattle` false.
10. `POST /api/commands` `{"playerId":"prototype-player","type":"character-action","action":"claim-settlement"}`. HTTP 202. `command.id` `command-00005`. `command.issuedTick` 13.
11. `POST /api/advance` `{"ticks":1}`. HTTP 200. `tick` 14. `day` 2.33. `eventSequence` 1685. `pausedForBattle` false.

`GET /api/state?limit=200`. `tick` 14. Cinder Key `factionId` `world-government`, `ownerId` `character-01`. `characters` `character-01` has `factionId` `world-government` and `locationId` `cinder-key`.

12. `POST /api/commands` `{"playerId":"prototype-player","type":"declare-secession","settlementId":"cinder-key","name":"Breakwater"}`. HTTP 202.

```json
{"ok":true,"command":{"id":"command-00006","playerId":"prototype-player","issuedTick":14,"type":"declare-secession","settlementId":"cinder-key","name":"Breakwater"}}
```

13. `GET /api/state?limit=200` before the advance. `tick` 14. `eventPage.count` 200. `eventPage.total` 1676. `eventPage.hasMore` true. `eventPage.oldestSequence` 1485. `eventPage.newestSequence` 1686. `eventPage.cursor` 1485. `events` length 200. Sequence 1686: `type` `player-command-accepted`, `summary` `Command queued for Mara Vane: declare Cinder Key separate as Breakwater`. No `command-refused` row is on the page.
14. `POST /api/advance` `{"ticks":1}`. HTTP 200. `tick` 15. `day` 2.5. `ticksAdvanced` 1. `eventSequence` 1803. `pausedForBattle` false.
15. `GET /api/health`. `events` 1803.
16. `GET /api/state?limit=200`. `tick` 15. `day` 2.5. `eventPage.count` 200. `eventPage.total` 1792. `eventPage.limit` 200. `eventPage.hasMore` true. `eventPage.oldestSequence` 1603. `eventPage.newestSequence` 1803. `eventPage.cursor` 1603. `events` length 200. `eventPage.total` is not 1803. The health count is the raw log.

On that page, one row is `type` `secession-declared`, `sequence` 1695, `tick` 14, `day` 2.33, `actorId` `character-01`, `targetId` `world-government`, `settlementId` `cinder-key`, `payloadWithheld` false, `summary` `Mara Vane declared Cinder Key separate from World Government. Breakwater starts with an empty treasury. Jun Marrow takes the seat.`

`data.faction` keys are `id`, `name`, `color`, `treasury`, `taxRate`. `treasury` is 0. `name` is `Breakwater`. `id` is `secession-character-01-cinder-key-14`. `data.successorId` is `character-05`.

| Faction | name | treasury | treasuryLine | commanderId |
| --- | --- | ---: | --- | --- |
| `secession-character-01-cinder-key-14` | Breakwater | 2.69 | `Tax income 2.69, spending 0, over the last 180 ticks.` | null |
| `world-government` | World Government | null | null | `character-05` |
| `free-tide` | Free Tide Compact | null | null | `character-14` |

Breakwater's `treasuryNote` is null. World Government and Free Tide have `treasuryNote` `not visible to you`. Each row has the key `treasuryLine`. The declaration's `data.faction.treasury` stays 0. The faction row's 2.69 is tax credited after the declaration, and the line says which figure is the start.

## Checkpoint 5. Pax Ash raises the rate, and settlementId is null

Fresh process. Confirm the setup block. Do not post a command.

1. `POST /api/advance` `{"ticks":72}`. HTTP 200. `ok` true. `tick` 72. `day` 12. `ticksAdvanced` 72. `eventSequence` 8413. `pausedForBattle` false.
2. `GET /api/health`. `events` 8413. `GET /api/state?limit=200`. `eventPage.count` 200. `eventPage.total` 8413. `eventPage.hasMore` true. `eventPage.oldestSequence` 8214. `eventPage.newestSequence` 8413. `eventPage.cursor` 8214. No `tax-rate-set` on the page.

World Government `treasury` 17559.72. `treasuryLine` `Tax income 1716.72, spending 2157, over the last 180 ticks.` Free Tide `treasuryLine` null. The key is present.

3. `POST /api/advance` `{"ticks":49}`. HTTP 200. `tick` 121. `day` 20.17. `ticksAdvanced` 49. `eventSequence` 14211. `pausedForBattle` false.
4. `GET /api/health`. `events` 14211. `GET /api/state?limit=200`. `eventPage.count` 200. `eventPage.total` 14211. `eventPage.hasMore` true. `eventPage.oldestSequence` 14012. `eventPage.newestSequence` 14211. `eventPage.cursor` 14012.

One row on that page is `type` `tax-rate-set`, `sequence` 14112, `tick` 120, `day` 20, `actorId` `character-14`, `targetId` `free-tide`, `payloadWithheld` true, `data` null. The key `settlementId` is present and the value is null. Summary `Pax Ash raised the Free Tide Compact tax to 9% (treasury short).` The summary does not print a treasury balance.

Free Tide `taxRate` 0.09. `taxRateSetTick` 120. World Government `treasuryLine` `Tax income 3221.19, spending 3698.67, over the last 180 ticks.` Free Tide `treasuryLine` null.

## Checkpoint 6. Two autonomous declarations end with no leader yet

Fresh process. Confirm the setup block. Do not post a command.

1. `POST /api/advance` `{"ticks":144}`. HTTP 200. `tick` 144. `day` 24. `ticksAdvanced` 144. `eventSequence` 16898. No `secession-declared` in that response's `events`.
2. `POST /api/advance` `{"ticks":144}`. HTTP 200. `tick` 288. `day` 48. `eventSequence` 34686. No `secession-declared`.
3. `POST /api/advance` `{"ticks":144}`. HTTP 200. `tick` 432. `day` 72. `eventSequence` 53840. No `secession-declared`.
4. `POST /api/advance` `{"ticks":6}`. HTTP 200. `tick` 438. `day` 73. `ticksAdvanced` 6. `eventSequence` 54697. No `secession-declared`.
5. `GET /api/state?limit=200`. `tick` 438. `eventPage.total` 54697. `eventPage.count` 200. `eventPage.oldestSequence` 54498. `eventPage.newestSequence` 54697. `eventPage.cursor` 54498. The page has no `secession-declared`.
6. `POST /api/advance` `{"ticks":1}`. HTTP 200. `tick` 439. `day` 73.17. `ticksAdvanced` 1. `eventSequence` 54848. `pausedForBattle` false.
7. `GET /api/health`. `events` 54848. `GET /api/state?limit=200`. `tick` 439. `eventPage.count` 200. `eventPage.total` 54848. `eventPage.hasMore` true. `eventPage.oldestSequence` 54649. `eventPage.newestSequence` 54848. `eventPage.cursor` 54649.

Two rows are `secession-declared`. Both have `payloadWithheld` true and `data` null. Each summary ends with ` (no leader yet)`, including the space before the parenthesis.

| sequence | tick | day | actorId | settlementId | summary |
| ---: | ---: | ---: | --- | --- | --- |
| 54705 | 438 | 73 | `character-15` | `glassport` | Mina Vale declared Glassport separate from Free Tide Compact. Mina Vale starts with an empty treasury. (no leader yet) |
| 54704 | 438 | 73 | `character-16` | `crown-harbor` | Corin Hale declared Crown Harbor separate from Free Tide Compact. Corin Hale starts with an empty treasury. (no leader yet) |

`characters` `character-01` has `factionId` `world-government` and `locationId` `crown-harbor`. World Government `treasury` 17385.19. `treasuryLine` `Tax income 2790.91, ransom 64.38, spending 4298.69, over the last 180 ticks.` Free Tide, Mina Vale, and Corin Hale each have `treasuryLine` null and the key present.

## Checkpoint 7. Pax Ash lowers the rate and names the port

Fresh process. Confirm the setup block. Do not post a command.

1. `POST /api/advance` `{"ticks":144}` three times, then `POST /api/advance` `{"ticks":121}`. The fourth response is HTTP 200. `tick` 553. `day` 92.17. `ticksAdvanced` 121. `eventSequence` 70168. `pausedForBattle` false.

That fourth response's `events` include these `tax-rate-set` rows. Each has the key `settlementId` and the value null, `payloadWithheld` true, and `data` null. `actorId` is `character-14`. `targetId` is `free-tide`.

| sequence | tick | day | summary |
| ---: | ---: | ---: | --- |
| 70016 | 552 | 92 | Pax Ash lowered the Free Tide Compact tax to 19% (unrest at Glassport). |
| 66491 | 528 | 88 | Pax Ash raised the Free Tide Compact tax to 20% (treasury short). |
| 63234 | 504 | 84 | Pax Ash raised the Free Tide Compact tax to 19% (treasury short). |
| 60069 | 480 | 80 | Pax Ash raised the Free Tide Compact tax to 18% (treasury short). |

2. `GET /api/health`. `events` 70168. `GET /api/state?limit=200`. `eventPage.count` 200. `eventPage.total` 70168. `eventPage.oldestSequence` 69969. `eventPage.newestSequence` 70168. `eventPage.cursor` 69969. Sequence 70016 is on this page, with the lowered summary above. Sequences 66491, 63234, and 60069 are not on this page.

World Government `treasuryLine` `Tax income 3801.68, ransom 242.23, spending 4407.88, over the last 180 ticks.` Free Tide `treasuryLine` null.

## Session

Blind session on `feature/feed-polish-2` at `a119a4a4a9ba2b379333771c16d8f2ba0650e6fe`. Node v24.21.0, ICU 78.3. Seed 1847. Seat Mara Vane, `character-01`, `playerId` `prototype-player`. Seven processes, one per checkpoint. Each was `npm run dashboard -- --reset --seed 1847` on `127.0.0.1:4317`. The process was stopped, and port 4317 was free, before the next `--reset`. No command other than the ones the checkpoint names. Advances were at most 144 ticks. `beforeSequence` was omitted on every event read. `golden:update` was not run.

### Setup, every checkpoint

`GET /api/health` HTTP 200 `{"ok":true,"tick":0,"events":0}`.

`GET /api/state?limit=200` HTTP 200. `tick` 0. `day` 0. `player.displayName` `Mara Vane`. `player.characterId` `character-01`. `party.locationId` `crown-harbor`. `eventPage` keys `count`, `limit`, `total`, `hasMore`, `oldestSequence`, `newestSequence`, `cursor`. `count` 0. `limit` 200. `total` 0. `hasMore` false. `oldestSequence` null. `newestSequence` null. `cursor` null. `events` length 0.

`capabilities.requests.state.response.eventPage` was `describes that page. count is the rows in events, including a dashboard-only refusal on the newest page. total is the stored events the projection keeps. player-action-executed and player-command-resolved are in neither, so a gap in sequence numbers is one of those rows and is not a skipped page. A refusal is not stored, so it is not in total. oldestSequence, newestSequence, and cursor are stored sequences on this page`.

World Government, `id` `world-government`, `name` `World Government`: `treasury` 18000, `treasuryNote` null, `treasuryLine` `Tax income 0, spending 0, over the last 180 ticks.`, `taxRate` 0.14, `taxRateSetTick` null. The key `treasuryLine` was present. Free Tide Compact, `id` `free-tide`: `treasury` null, `treasuryNote` `not visible to you`, `treasuryLine` null. The key `treasuryLine` was present.

### Checkpoint 1. The voyage names both ports, then the rest is refused

Fresh process. The setup block was confirmed.

`POST /api/commands` `{"playerId":"prototype-player","type":"character-action","action":"travel","targetId":"glassport"}` HTTP 202.

```json
{"ok":true,"command":{"id":"command-00001","playerId":"prototype-player","issuedTick":0,"type":"character-action","action":"travel","targetId":"glassport","source":"treasury"}}
```

`GET /api/state?limit=200` before the advance. `tick` 0. `eventPage.count` 1. `eventPage.total` 1. `events` length 1. Sequence 1: `type` `player-command-accepted`, `tick` 0, `actorId` `character-01`, `targetId` `glassport`, `payloadWithheld` false, `summary` `Command queued for Mara Vane: travel from Crown Harbor to Glassport (from the treasury)`.

`POST /api/advance` `{"ticks":1}` HTTP 200. `ok` true. `tick` 1. `day` 0.17. `ticksAdvanced` 1. `eventSequence` 187. `pausedForBattle` false.

`GET /api/health` HTTP 200. `events` 187. `GET /api/state?limit=200`. `tick` 1. `eventPage.count` 185. `eventPage.total` 185. `eventPage.hasMore` false. `eventPage.oldestSequence` 1. `eventPage.newestSequence` 187. `eventPage.cursor` 1. `events` length 185. Sequences 10 and 12 were absent. No row had `type` `player-action-executed` or `player-command-resolved`.

`POST /api/commands` `{"playerId":"prototype-player","type":"character-action","action":"rest"}` HTTP 400.

```json
{"ok":false,"code":"character-traveling","error":"The character is already traveling"}
```

`GET /api/health`. `tick` 1. `events` 187. `GET /api/state?limit=200`. `tick` 1. `eventPage.total` 185. `eventPage.count` 186. `events` length 186. `events[0]` was the refusal. One `player-command-accepted` remained. No new one.

| key | value |
| --- | --- |
| `sequence` | null |
| `tick` | 1 |
| `day` | 0.17 |
| `type` | `command-refused` |
| `actorId` | `character-01` |
| `targetId` | null |
| `settlementId` | null |
| `summary` | `Mara Vane's command failed: The character is already traveling` |
| `details` | null |
| `data` | null |
| `payloadWithheld` | false |

`eventPage.oldestSequence` was 1. `eventPage.newestSequence` was 187. `eventPage.cursor` was 1.

### Checkpoint 2. A buy's page count is the rows returned

Fresh process. The setup block was confirmed.

`POST /api/commands` `{"playerId":"prototype-player","type":"character-action","action":"buy-provisions","source":"purse"}` HTTP 202. `command.id` `command-00001`. `command.action` `buy-provisions`. `command.source` `purse`.

`POST /api/advance` `{"ticks":1}` HTTP 200. `tick` 1. `day` 0.17. `ticksAdvanced` 1. `eventSequence` 186.

`GET /api/health`. `events` 186.

`GET /api/state?limit=200`. `eventPage.count` 184. `eventPage.total` 184. `eventPage.hasMore` false. `events` length 184. `eventPage.count` equaled `events.length`. Sequences 10 and 12 were absent. `eventPage.oldestSequence` was 1, the last row's `sequence`. `eventPage.newestSequence` was 186, the first row's `sequence`. No row had `type` `player-action-executed` or `player-command-resolved`.

`character-01` had one `market-trade`, sequence 11, `summary` `Mara Vane bought 12 provisions at Crown Harbor for 17.64 from the purse (hold now 47.42).` Sequence 1 summary was `Command queued for Mara Vane: 12 provisions at 1.47 each, 17.64 total`.

### Checkpoint 3. A player tax set keeps its sentence, and settlementId is null

Fresh process. The setup block was confirmed.

`POST /api/commands` `{"playerId":"prototype-player","type":"set-tax-rate","taxRate":0.12}` HTTP 202. `command.id` `command-00001`. `command.taxRate` 0.12. `command.factionId` `world-government`.

`POST /api/advance` `{"ticks":1}` HTTP 200. `tick` 1. `day` 0.17. `ticksAdvanced` 1. `eventSequence` 185.

`GET /api/health`. `events` 185.

`GET /api/state?limit=200`. `eventPage.count` 184. `eventPage.total` 184. `events` length 184. Sequence 11 was absent.

Sequence 10: `type` `tax-rate-set`, `tick` 0, `actorId` `character-01`, `payloadWithheld` false. The key `settlementId` was present and the value was null. Summary `Mara Vane set the World Government tax rate to 12%.` The summary did not say `raised` or `treasury short`.

### Checkpoint 4. Breakwater starts empty, and the row shows the same-tick tax

Fresh process. The setup block was confirmed. No declaration refusal was sent.

`POST /api/commands` `{"playerId":"prototype-player","type":"character-action","action":"travel","targetId":"cinder-key"}` HTTP 202. `command.id` `command-00001`. `command.issuedTick` 0.

`POST /api/advance` `{"ticks":6}` HTTP 200. `tick` 6. `day` 1. `ticksAdvanced` 6. `eventSequence` 715. `pausedForBattle` false.

`GET /api/state?limit=200`. `party.locationId` `cinder-key`.

`POST /api/commands` `{"playerId":"prototype-player","type":"character-action","action":"raid"}` HTTP 202. `command.id` `command-00002`. `command.issuedTick` 6.

`POST /api/advance` `{"ticks":1}` three times. The third had `pausedForBattle` false.

| Call | tick | day | eventSequence | pausedForBattle |
| --- | ---: | ---: | ---: | --- |
| 1 | 7 | 1.17 | 840 | true |
| 2 | 8 | 1.33 | 946 | true |
| 3 | 9 | 1.5 | 1057 | false |

`POST /api/commands` the same raid body. HTTP 202. `command.id` `command-00003`. `command.issuedTick` 9.

`POST /api/advance` `{"ticks":1}` three times. The third had `pausedForBattle` false.

| Call | tick | day | eventSequence | pausedForBattle |
| --- | ---: | ---: | ---: | --- |
| 1 | 10 | 1.67 | 1177 | true |
| 2 | 11 | 1.83 | 1301 | true |
| 3 | 12 | 2 | 1430 | false |

`POST /api/commands` the same raid body. HTTP 202. `command.id` `command-00004`. `command.issuedTick` 12.

`POST /api/advance` `{"ticks":1}` once. HTTP 200. `tick` 13. `day` 2.17. `eventSequence` 1560. `pausedForBattle` false.

`POST /api/commands` `{"playerId":"prototype-player","type":"character-action","action":"claim-settlement"}` HTTP 202. `command.id` `command-00005`. `command.issuedTick` 13.

`POST /api/advance` `{"ticks":1}` HTTP 200. `tick` 14. `day` 2.33. `eventSequence` 1685. `pausedForBattle` false.

`GET /api/state?limit=200`. `tick` 14. Cinder Key `factionId` `world-government`, `ownerId` `character-01`. `characters` `character-01` had `factionId` `world-government` and `locationId` `cinder-key`.

`POST /api/commands` `{"playerId":"prototype-player","type":"declare-secession","settlementId":"cinder-key","name":"Breakwater"}` HTTP 202.

```json
{"ok":true,"command":{"id":"command-00006","playerId":"prototype-player","issuedTick":14,"type":"declare-secession","settlementId":"cinder-key","name":"Breakwater"}}
```

`GET /api/state?limit=200` before the advance. `tick` 14. `eventPage.count` 200. `eventPage.total` 1676. `eventPage.hasMore` true. `eventPage.oldestSequence` 1485. `eventPage.newestSequence` 1686. `eventPage.cursor` 1485. `events` length 200. Sequence 1686: `type` `player-command-accepted`, `summary` `Command queued for Mara Vane: declare Cinder Key separate as Breakwater`. No `command-refused` row was on the page.

`POST /api/advance` `{"ticks":1}` HTTP 200. `tick` 15. `day` 2.5. `ticksAdvanced` 1. `eventSequence` 1803. `pausedForBattle` false.

`GET /api/health`. `events` 1803.

`GET /api/state?limit=200`. `tick` 15. `day` 2.5. `eventPage.count` 200. `eventPage.total` 1792. `eventPage.limit` 200. `eventPage.hasMore` true. `eventPage.oldestSequence` 1603. `eventPage.newestSequence` 1803. `eventPage.cursor` 1603. `events` length 200. `eventPage.total` was 1792, not 1803. The health count was the raw log.

On that page, one row was `type` `secession-declared`, `sequence` 1695, `tick` 14, `day` 2.33, `actorId` `character-01`, `targetId` `world-government`, `settlementId` `cinder-key`, `payloadWithheld` false, `summary` `Mara Vane declared Cinder Key separate from World Government. Breakwater starts with an empty treasury. Jun Marrow takes the seat.`

`data.faction` keys were `id`, `name`, `color`, `treasury`, `taxRate`. `treasury` was 0. `name` was `Breakwater`. `id` was `secession-character-01-cinder-key-14`. `data.successorId` was `character-05`.

| Faction | name | treasury | treasuryLine | commanderId |
| --- | --- | ---: | --- | --- |
| `secession-character-01-cinder-key-14` | Breakwater | 2.69 | `Tax income 2.69, spending 0, over the last 180 ticks.` | null |
| `world-government` | World Government | null | null | `character-05` |
| `free-tide` | Free Tide Compact | null | null | `character-14` |

Breakwater's `treasuryNote` was null. World Government and Free Tide had `treasuryNote` `not visible to you`. Each row had the key `treasuryLine`. The declaration's `data.faction.treasury` stayed 0.

### Checkpoint 5. Pax Ash raises the rate, and settlementId is null

Fresh process. The setup block was confirmed. No command was posted.

`POST /api/advance` `{"ticks":72}` HTTP 200. `ok` true. `tick` 72. `day` 12. `ticksAdvanced` 72. `eventSequence` 8413. `pausedForBattle` false.

`GET /api/health`. `events` 8413. `GET /api/state?limit=200`. `eventPage.count` 200. `eventPage.total` 8413. `eventPage.hasMore` true. `eventPage.oldestSequence` 8214. `eventPage.newestSequence` 8413. `eventPage.cursor` 8214. No `tax-rate-set` on the page.

World Government `treasury` 17559.72. `treasuryLine` `Tax income 1716.72, spending 2157, over the last 180 ticks.` Free Tide `treasuryLine` null. The key was present.

`POST /api/advance` `{"ticks":49}` HTTP 200. `tick` 121. `day` 20.17. `ticksAdvanced` 49. `eventSequence` 14211. `pausedForBattle` false.

`GET /api/health`. `events` 14211. `GET /api/state?limit=200`. `eventPage.count` 200. `eventPage.total` 14211. `eventPage.hasMore` true. `eventPage.oldestSequence` 14012. `eventPage.newestSequence` 14211. `eventPage.cursor` 14012.

One row on that page was `type` `tax-rate-set`, `sequence` 14112, `tick` 120, `day` 20, `actorId` `character-14`, `targetId` `free-tide`, `payloadWithheld` true, `data` null. The key `settlementId` was present and the value was null. Summary `Pax Ash raised the Free Tide Compact tax to 9% (treasury short).` The summary did not print a treasury balance.

Free Tide `taxRate` 0.09. `taxRateSetTick` 120. World Government `treasuryLine` `Tax income 3221.19, spending 3698.67, over the last 180 ticks.` Free Tide `treasuryLine` null.

### Checkpoint 6. Two autonomous declarations end with no leader yet

Fresh process. The setup block was confirmed. No command was posted.

`POST /api/advance` `{"ticks":144}` HTTP 200. `tick` 144. `day` 24. `ticksAdvanced` 144. `eventSequence` 16898. No `secession-declared` in that response's `events`.

`POST /api/advance` `{"ticks":144}` HTTP 200. `tick` 288. `day` 48. `eventSequence` 34686. No `secession-declared`.

`POST /api/advance` `{"ticks":144}` HTTP 200. `tick` 432. `day` 72. `eventSequence` 53840. No `secession-declared`.

`POST /api/advance` `{"ticks":6}` HTTP 200. `tick` 438. `day` 73. `ticksAdvanced` 6. `eventSequence` 54697. No `secession-declared`.

`GET /api/state?limit=200`. `tick` 438. `eventPage.total` 54697. `eventPage.count` 200. `eventPage.oldestSequence` 54498. `eventPage.newestSequence` 54697. `eventPage.cursor` 54498. The page had no `secession-declared`.

`POST /api/advance` `{"ticks":1}` HTTP 200. `tick` 439. `day` 73.17. `ticksAdvanced` 1. `eventSequence` 54848. `pausedForBattle` false.

`GET /api/health`. `events` 54848. `GET /api/state?limit=200`. `tick` 439. `eventPage.count` 200. `eventPage.total` 54848. `eventPage.hasMore` true. `eventPage.oldestSequence` 54649. `eventPage.newestSequence` 54848. `eventPage.cursor` 54649.

Two rows were `secession-declared`. Both had `payloadWithheld` true and `data` null. Each summary ended with ` (no leader yet)`, including the space before the parenthesis.

| sequence | tick | day | actorId | settlementId | summary |
| ---: | ---: | ---: | --- | --- | --- |
| 54705 | 438 | 73 | `character-15` | `glassport` | Mina Vale declared Glassport separate from Free Tide Compact. Mina Vale starts with an empty treasury. (no leader yet) |
| 54704 | 438 | 73 | `character-16` | `crown-harbor` | Corin Hale declared Crown Harbor separate from Free Tide Compact. Corin Hale starts with an empty treasury. (no leader yet) |

`characters` `character-01` had `factionId` `world-government` and `locationId` `crown-harbor`. World Government `treasury` 17385.19. `treasuryLine` `Tax income 2790.91, ransom 64.38, spending 4298.69, over the last 180 ticks.` Free Tide, Mina Vale, and Corin Hale each had `treasuryLine` null and the key present.

### Checkpoint 7. Pax Ash lowers the rate and names the port

Fresh process. The setup block was confirmed. No command was posted.

`POST /api/advance` `{"ticks":144}` three times, then `POST /api/advance` `{"ticks":121}`. The fourth response was HTTP 200. `tick` 553. `day` 92.17. `ticksAdvanced` 121. `eventSequence` 70168. `pausedForBattle` false.

That fourth response's `events` included these `tax-rate-set` rows. Each had the key `settlementId` and the value null, `payloadWithheld` true, and `data` null. `actorId` was `character-14`. `targetId` was `free-tide`.

| sequence | tick | day | summary |
| ---: | ---: | ---: | --- |
| 70016 | 552 | 92 | Pax Ash lowered the Free Tide Compact tax to 19% (unrest at Glassport). |
| 66491 | 528 | 88 | Pax Ash raised the Free Tide Compact tax to 20% (treasury short). |
| 63234 | 504 | 84 | Pax Ash raised the Free Tide Compact tax to 19% (treasury short). |
| 60069 | 480 | 80 | Pax Ash raised the Free Tide Compact tax to 18% (treasury short). |

`GET /api/health`. `events` 70168. `GET /api/state?limit=200`. `eventPage.count` 200. `eventPage.total` 70168. `eventPage.oldestSequence` 69969. `eventPage.newestSequence` 70168. `eventPage.cursor` 69969. Sequence 70016 was on this page, with the lowered summary above. Sequences 66491, 63234, and 60069 were not on this page.

World Government `treasuryLine` `Tax income 3801.68, ransom 242.23, spending 4407.88, over the last 180 ticks.` Free Tide `treasuryLine` null.

## Findings

Every named checkpoint matched. The success signal held. The rest while traveling was HTTP 400 `{"ok":false,"code":"character-traveling","error":"The character is already traveling"}`. The newest page then carried `Mara Vane's command failed: The character is already traveling`. Health `events` stayed 187. `eventPage.total` stayed 185. The queued voyage said `Command queued for Mara Vane: travel from Crown Harbor to Glassport (from the treasury)`. The buy page's `eventPage.count` was 184 and `events` length was 184. The tax set said `Mara Vane set the World Government tax rate to 12%.` and `settlementId` was null. Sequence 1695 said `Mara Vane declared Cinder Key separate from World Government. Breakwater starts with an empty treasury. Jun Marrow takes the seat.` `data.faction.treasury` was 0. The Breakwater row was 2.69, line `Tax income 2.69, spending 0, over the last 180 ticks.` Sequence 14112 said `Pax Ash raised the Free Tide Compact tax to 9% (treasury short).` and `settlementId` was null. A no-command advance reached tick 438 with no `secession-declared`. The next tick's feed had Mina Vale at Glassport, sequence 54705, and Corin Hale at Crown Harbor, sequence 54704. Both summaries ended with ` (no leader yet)`. Sequence 70016 said `Pax Ash lowered the Free Tide Compact tax to 19% (unrest at Glassport).` Health `events` matched the raw `eventSequence` on every named read. No mismatch.

## Verdict

`PROMOTE`

A match is the campaign. Every named summary, count, and treasury line matched. `GET /api/health` `events` stayed the raw log. The refusal did not change `eventPage.total`.
