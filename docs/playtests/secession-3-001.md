# Playtest plan: autonomous secession

This is the plan for a blind operator. It is not a completed session. Do not fill Session, Findings, or Verdict while writing the plan. Do not open `src/`, `tests/`, the branch diff, or `docs/design/` during the session. Use only the dashboard HTTP JSON, this plan, and `progress.md`.

One process per checkpoint. Seed 1847 each time. The seat is Mara Vane, `character-01`, `playerId` `prototype-player`. Do not pass another character. Stop the process, and confirm port 4317 is free, before the next `--reset`.

Issue no command the checkpoint does not name. Advance at most 144 ticks per call. Checkpoint 1 uses one tick at a time through the raids. Checkpoint 2 uses 144, then 144, then 144, then 6, then 1.

Omit `beforeSequence` on event reads. An empty `beforeSequence=` returns the newest page. Do not send `beforeSequence=0`. That bound returns no events. Do not page backward. The declaration lines are on the newest page after the last advance, and on that advance's own `events`. The claim line is on the claim advance's `events` and is older than the last page.

The readings below were taken on this tree through `GET /api/state?limit=200`, `POST /api/advance`, and `POST /api/commands`. A match is the campaign. A miss is not a new reading to write into this file during the session.

```text
npm run dashboard -- --reset --seed 1847
```

Bind `127.0.0.1:4317`. Node v24.21.0.

## Hypothesis and ambition

**Milestone hypothesis:** Mara can declare a port she owns, and the faction she leaves names a successor in the same step. An autonomous owner declares without a command when that owner is present and free, is not the command holder, the holding rate is above 0.15, and stability is at or below 55. A human owner is not declared by the advance.

**Player ambition:** Mara is refused when she does not own the port. She then takes Cinder Key and declares it Breakwater, and the feed names who takes World Government's seat. On a second world she issues no command and reads the first autonomous declarations.

**Success signal:** The declaration is HTTP 202. The next tick's `secession-declared` summary names Jun Marrow, `data.successorId` is `character-05`, Breakwater's `commanderId` is null, and World Government's `commanderId` is `character-05`. A no-command advance to tick 438 has no `secession-declared`. The following one-tick advance has two, Corin Hale at Crown Harbor and Mina Vale at Glassport, and Mara is still in World Government.

## Setup

Every checkpoint starts from a fresh process.

- `GET /api/health` HTTP 200 `{"ok":true,"tick":0,"events":0}`.
- `GET /api/state?limit=200` HTTP 200. `tick` 0. `player.displayName` `Mara Vane`. `player.characterId` `character-01`. `party.locationId` `crown-harbor`.
- `capabilities.commandTypes` includes `declare-secession`.

## Checkpoint 1. The holder declares, and Jun Marrow takes the seat

Fresh process. Confirm the setup block.

Post only these five commands. Each is HTTP 400. The body is `{"playerId":"prototype-player","type":"declare-secession","settlementId":"…"}`, plus `name` only on the last two. The response shape is `{"ok":false,"code":"…","error":"…"}`.

| Body `settlementId` | Body `name` | code | error |
| --- | --- | --- | --- |
| `crown-harbor` | omitted | `not-owner` | Only the owner of this port may declare it separate. |
| `verdant-cay` | omitted | `no-faction` | A neutral port has no faction to leave. |
| `no-such-port` | omitted | `unknown-settlement` | That port is not on the chart. |
| `crown-harbor` | `" "` | `invalid-name` | The faction name has to be a non-empty string. |
| `crown-harbor` | `""` | `invalid-name` | The faction name has to be a non-empty string. |

After all five, `tick` is still 0, `eventPage.total` is still 0, and `pendingCommands` is empty.

1. `POST /api/commands` `{"playerId":"prototype-player","type":"character-action","action":"travel","targetId":"cinder-key"}`. HTTP 202. `command.id` `command-00001`. `command.issuedTick` 0.
2. `POST /api/advance` `{"ticks":6}`. HTTP 200. `ok` true. `tick` 6. `day` 1. `ticksAdvanced` 6. `eventSequence` 715. `pausedForBattle` false. `combatUpdated` false.
3. `GET /api/state?limit=200`. Omit `beforeSequence`. `tick` 6. `party.locationId` `cinder-key`. `eventPage.total` 715.
4. `POST /api/commands` `{"playerId":"prototype-player","type":"character-action","action":"raid"}`. HTTP 202. `command.id` `command-00002`. `command.issuedTick` 6.
5. `POST /api/advance` `{"ticks":1}` three times. Stop when `pausedForBattle` is false.

| Call | tick | day | ticksAdvanced | eventSequence | pausedForBattle | combatUpdated |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| 1 | 7 | 1.17 | 1 | 840 | true | true |
| 2 | 8 | 1.33 | 1 | 946 | true | true |
| 3 | 9 | 1.5 | 1 | 1057 | false | true |

The third response's `events` include `battle-resolved` with `summary` `Mara Vane won the fight at Cinder Key on a higher score.` `GET /api/state?limit=200`. `tick` 9. Cinder Key: `factionId` `free-tide`, `ownerId` null, `stability` 60.18, `garrison` 52, `stocks.provisions` 146.34, `taxRate` 0.08, `surrenderOffered` false. `secession.ownerId` null. `secession.ownerGate` false. `secession.followerCount` null. `secession.garrisonFollows` false. `secession.taxOpen.followerCount` null. `secession.taxOpen.garrisonFollows` true.

6. `POST /api/commands` the same raid body. HTTP 202. `command.id` `command-00003`. `command.issuedTick` 9.
7. `POST /api/advance` `{"ticks":1}` three times.

| Call | tick | day | ticksAdvanced | eventSequence | pausedForBattle | combatUpdated |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| 1 | 10 | 1.67 | 1 | 1177 | true | true |
| 2 | 11 | 1.83 | 1 | 1301 | true | true |
| 3 | 12 | 2 | 1 | 1430 | false | true |

The third response's `events` include two `battle-resolved` rows. One `summary` is `Rook Tern won the fight at Cinder Key on a higher score. 2 captains won a fight here on this tick: Mara Vane, Rook Tern. This fight left the garrison standing. A surrender was offered.` The other is `Mara Vane won the fight at Cinder Key on a higher score. 2 captains won a fight here on this tick: Mara Vane, Rook Tern. This fight left the garrison standing.` Do not claim yet. `GET /api/state?limit=200`. `tick` 12. Cinder Key: `stability` 36.21, `garrison` 9, `stocks.provisions` 153.76, `surrenderOffered` false. `secession.garrisonFollows` true. `secession.followerCount` null.

8. `POST /api/commands` the same raid body. HTTP 202. `command.id` `command-00004`. `command.issuedTick` 12.
9. `POST /api/advance` `{"ticks":1}` once. HTTP 200. `ok` true. `tick` 13. `day` 2.17. `ticksAdvanced` 1. `eventSequence` 1560. `pausedForBattle` false. `combatUpdated` true. The response `events` include `battle-resolved` with `summary` `Mara Vane won the fight at Cinder Key on a higher score. A surrender was offered.`

`GET /api/state?limit=200`. `tick` 13. Cinder Key: `factionId` `free-tide`, `ownerId` null, `stability` 24.24, `garrison` 3, `stocks.provisions` 154.57, `taxRate` 0.08, `surrenderOffered` true. `secession.followerCount` null. `secession.garrisonFollows` true.

10. `POST /api/commands` `{"playerId":"prototype-player","type":"character-action","action":"claim-settlement"}`. HTTP 202. `command.id` `command-00005`. `command.issuedTick` 13.
11. `POST /api/advance` `{"ticks":1}`. HTTP 200. `ok` true. `tick` 14. `day` 2.33. `ticksAdvanced` 1. `eventSequence` 1685. `pausedForBattle` false. `combatUpdated` false.

On that response's `events`, one row is `type` `settlement-claimed`, `sequence` 1569, `tick` 13, `actorId` `character-01`, `targetId` `free-tide`, `settlementId` `cinder-key`, `payloadWithheld` false, `summary` `Mara Vane claimed Cinder Key.` Its `data` keys are `basis`, `factionId`, `garrison`, `ownerId`, `previousFactionId`, `previousOwnerId`, `stability`. The values are `previousFactionId` `free-tide`, `previousOwnerId` null, `ownerId` `character-01`, `factionId` `world-government`, `garrison` 3, `stability` 55, `basis` `accepted-surrender`. This row is not on the newest page after the declaration. Do not page backward to find it again.

12. `GET /api/state?limit=200`. `tick` 14. `day` 2.33. `eventPage.total` 1685. `eventPage.count` 200. `eventPage.oldestSequence` 1486. `eventPage.newestSequence` 1685. `eventPage.cursor` 1486. `characters` `character-01` has `factionId` `world-government` and `locationId` `cinder-key`.

Cinder Key: `factionId` `world-government`, `ownerId` `character-01`, `stability` 55, `garrison` 3, `population` 6400, `stocks.provisions` 155.265, `taxRate` 0.14, `intelligence.exact` true.

| ownerId | ownerGate | followerCount | garrisonFollows | taxOpen.followerCount | taxOpen.garrisonFollows |
| --- | --- | ---: | --- | ---: | --- |
| `character-01` | true | 1 | true | 1 | true |

`secession` keys are `followerCount`, `garrisonFollows`, `ownerGate`, `ownerId`, `taxOpen`. `taxOpen` keys are `followerCount` and `garrisonFollows`.

13. `POST /api/commands` `{"playerId":"prototype-player","type":"declare-secession","settlementId":"cinder-key","name":"Breakwater"}`. HTTP 202.

```json
{"ok":true,"command":{"id":"command-00006","playerId":"prototype-player","issuedTick":14,"type":"declare-secession","settlementId":"cinder-key","name":"Breakwater"}}
```

14. `GET /api/state?limit=200` before the advance. `tick` 14. `eventPage.total` 1686. `pendingCommands` has one row: `id` `command-00006`, `type` `declare-secession`, `settlementId` `cinder-key`, `name` `Breakwater`. Sequence 1686: `type` `player-command-accepted`, `tick` 14, `day` 2.33, `actorId` `character-01`, `targetId` `cinder-key`, `settlementId` `cinder-key`, `payloadWithheld` false, `summary` `Command queued for Mara Vane: declare Cinder Key separate as Breakwater`. `data.command.name` is `Breakwater`. `data.command.type` is `declare-secession`.
15. `POST /api/advance` `{"ticks":1}`. HTTP 200. `ok` true. `tick` 15. `day` 2.5. `ticksAdvanced` 1. `eventSequence` 1803. `pausedForBattle` false. `combatUpdated` false.

On that response's `events`, one row is `type` `secession-declared`, `sequence` 1695, `tick` 14, `day` 2.33, `actorId` `character-01`, `targetId` `world-government`, `settlementId` `cinder-key`, `payloadWithheld` false, `summary` `Mara Vane declared Cinder Key separate from World Government. Jun Marrow takes the seat.`

`data` keys are `actingCommanderId`, `commandId`, `faction`, `followerIds`, `garrison`, `garrisonFollowed`, `ownerId`, `previousActingCommanderId`, `previousFactionId`, `stability`, `successorId`.

| data field | value |
| --- | --- |
| `commandId` | `command-00006` |
| `previousFactionId` | `world-government` |
| `ownerId` | `character-01` |
| `followerIds` | `[]` |
| `garrisonFollowed` | false |
| `garrison` | 0 |
| `stability` | 55.03 |
| `previousActingCommanderId` | null |
| `actingCommanderId` | null |
| `successorId` | `character-05` |

`data.faction` keys are `id`, `name`, `color`, `treasury`, `taxRate`. `id` `secession-character-01-cinder-key-14`. `name` `Breakwater`. `color` `#2f6f4e`. `treasury` 0. `taxRate` 0.08. There is no `actingCommanderId` on `data.faction` and no `taxRateSetTick`.

16. `GET /api/state?limit=200`. Omit `beforeSequence`. `tick` 15. `day` 2.5. `party.locationId` `cinder-key`. `eventPage.total` 1803. `eventPage.count` 200. `eventPage.limit` 200. `eventPage.hasMore` true. `eventPage.oldestSequence` 1604. `eventPage.newestSequence` 1803. `eventPage.cursor` 1604.

The newest page includes sequence 1695 (`secession-declared`, the same summary, `payloadWithheld` false) and sequence 1686 (the queued declare line). It does not include sequence 1569. `player-command-resolved` is not on the page.

`characters` `character-01`: `name` `Mara Vane`, `factionId` `secession-character-01-cinder-key-14`, `locationId` `cinder-key`. `characters` `character-05`: `name` `Jun Marrow`, `factionId` `world-government`.

| Faction | name | taxRate | treasury | treasuryNote | power | commanderId | actingCommanderId | color | seatSummary |
| --- | --- | ---: | ---: | --- | ---: | --- | --- | --- | --- |
| `free-tide` | Free Tide Compact | 0.08 | null | `not visible to you` | null | `character-14` | null | `#d05a47` | null |
| `secession-character-01-cinder-key-14` | Breakwater | 0.08 | 2.69 | null | 274.92 | null | null | `#2f6f4e` | null |
| `world-government` | World Government | 0.14 | null | `not visible to you` | null | `character-05` | null | `#345995` | null |

The event's `data.faction.treasury` is 0. The faction row after the tick is 2.69. Breakwater's `commanderId` is null. World Government's `commanderId` is `character-05`.

Cinder Key: `factionId` `secession-character-01-cinder-key-14`, `ownerId` `character-01`, `stability` 55.03, `garrison` 0, `population` 6400, `stocks.provisions` 156.255, `taxRate` 0.08, `intelligence.exact` true, `intelligence.present` true, `surrenderOffered` false.

| ownerId | ownerGate | followerCount | garrisonFollows | taxOpen.followerCount | taxOpen.garrisonFollows |
| --- | --- | ---: | --- | ---: | --- |
| `character-01` | true | 0 | `none` | 0 | `none` |

`garrisonFollows` and `taxOpen.garrisonFollows` are the string `none`.

## Checkpoint 2. No command, then two declarations

Fresh process. Confirm the setup block. Do not post a command.

1. `POST /api/advance` `{"ticks":144}`. HTTP 200. `ok` true. `tick` 144. `day` 24. `ticksAdvanced` 144. `eventSequence` 16898. `pausedForBattle` false. `combatUpdated` false. That response's `events` include no `secession-declared`.
2. `POST /api/advance` `{"ticks":144}`. HTTP 200. `tick` 288. `day` 48. `ticksAdvanced` 144. `eventSequence` 34686. `pausedForBattle` false. `combatUpdated` false. No `secession-declared`.
3. `POST /api/advance` `{"ticks":144}`. HTTP 200. `tick` 432. `day` 72. `ticksAdvanced` 144. `eventSequence` 53840. `pausedForBattle` false. `combatUpdated` false. No `secession-declared`.
4. `POST /api/advance` `{"ticks":6}`. HTTP 200. `tick` 438. `day` 73. `ticksAdvanced` 6. `eventSequence` 54697. `pausedForBattle` false. `combatUpdated` false. No `secession-declared`.
5. `GET /api/state?limit=200`. Omit `beforeSequence`. `tick` 438. `day` 73. `party.locationId` `crown-harbor`. `player.displayName` `Mara Vane`. `eventPage.total` 54697. `eventPage.count` 200. `eventPage.limit` 200. `eventPage.hasMore` true. `eventPage.oldestSequence` 54498. `eventPage.newestSequence` 54697. `eventPage.cursor` 54498.

The newest page has no `secession-declared` event.

| Faction | taxRate | taxRateSetTick | commanderId | actingCommanderId |
| --- | ---: | ---: | --- | --- |
| `free-tide` | 0.17 | 408 | `character-14` | null |
| `world-government` | 0.14 | null | `character-01` | null |

| Settlement | factionId | ownerId | stability | garrison | taxRate | intelligence.exact | intelligence.present | secession |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| `crown-harbor` | `free-tide` | `character-16` | 55 | 10 | 0.17 | false | true | object below |
| `verdant-cay` | null | null | null | 61 | 0 | false | false | null |
| `cinder-key` | `free-tide` | null | null | 96 | 0.17 | false | false | null |
| `glassport` | `world-government` | null | null | 143 | 0.14 | false | false | null |

Crown Harbor `population` is 18000. `stocks.provisions` is 0. `secession` keys are `ownerId`, `ownerGate`, `followerCount`, `garrisonFollows`, `taxOpen`.

| ownerId | ownerGate | followerCount | garrisonFollows | taxOpen.followerCount | taxOpen.garrisonFollows |
| --- | --- | --- | ---: | --- | ---: |
| `character-16` | true | null | true | null | true |

`verdant-cay`, `cinder-key`, and `glassport` have the key `secession` and the value null.

6. `POST /api/advance` `{"ticks":1}`. HTTP 200. `ok` true. `tick` 439. `day` 73.17. `ticksAdvanced` 1. `eventSequence` 54848. `pausedForBattle` false. `combatUpdated` false.

The response `events` are newest first. Two rows are `secession-declared`. Both have `payloadWithheld` true and `data` null.

| sequence | tick | day | actorId | targetId | settlementId | summary |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 54705 | 438 | 73 | `character-15` | `free-tide` | `glassport` | Mina Vale declared Glassport separate from Free Tide Compact. |
| 54704 | 438 | 73 | `character-16` | `free-tide` | `crown-harbor` | Corin Hale declared Crown Harbor separate from Free Tide Compact. |

Neither summary names a successor.

7. `GET /api/state?limit=200`. Omit `beforeSequence`. `tick` 439. `day` 73.17. `party.locationId` `crown-harbor`. `eventPage.total` 54848. `eventPage.count` 200. `eventPage.limit` 200. `eventPage.hasMore` true. `eventPage.oldestSequence` 54649. `eventPage.newestSequence` 54848. `eventPage.cursor` 54649.

The newest page includes sequences 54704 and 54705, both `payloadWithheld` true, `data` null, with the summaries above.

| Character | name | factionId | locationId |
| --- | --- | --- | --- |
| `character-01` | Mara Vane | `world-government` | `crown-harbor` |
| `character-14` | Pax Ash | `free-tide` | `glassport` |
| `character-15` | Mina Vale | `secession-character-15-glassport-438` | `glassport` |
| `character-16` | Corin Hale | `secession-character-16-crown-harbor-438` | null |
| `character-18` | Finn Frost | `secession-character-16-crown-harbor-438` | `crown-harbor` |

| Faction | name | taxRate | taxRateSetTick | treasury | treasuryNote | power | commanderId | actingCommanderId | color | seatSummary |
| --- | --- | ---: | ---: | ---: | --- | ---: | --- | --- | --- | --- |
| `free-tide` | Free Tide Compact | 0.17 | 408 | null | `not visible to you` | null | `character-14` | null | `#d05a47` | null |
| `secession-character-15-glassport-438` | Mina Vale | 0.08 | null | null | `not visible to you` | null | null | null | `#2f6f4e` | null |
| `secession-character-16-crown-harbor-438` | Corin Hale | 0.08 | null | null | `not visible to you` | null | null | null | `#2f6f4e` | null |
| `world-government` | World Government | 0.14 | null | 17385.19 | null | 2533.8 | `character-01` | null | `#345995` | null |

| Settlement | factionId | ownerId | stability | garrison | taxRate | intelligence.exact | intelligence.present | secession |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| `crown-harbor` | `secession-character-16-crown-harbor-438` | `character-16` | 51 | 8 | 0.08 | false | true | object below |
| `verdant-cay` | null | null | null | 61 | 0 | false | false | null |
| `cinder-key` | `free-tide` | null | null | 96 | 0.17 | false | false | null |
| `glassport` | `world-government` | null | null | 143 | 0.14 | false | false | null |

Crown Harbor `population` is 18000. `stocks.provisions` is 0. Glassport keeps the key `secession` and the value null. The Mina Vale faction row is still in `factions`.

| ownerId | ownerGate | followerCount | garrisonFollows | taxOpen.followerCount | taxOpen.garrisonFollows |
| --- | --- | --- | ---: | --- | ---: |
| `character-16` | false | null | true | null | true |
