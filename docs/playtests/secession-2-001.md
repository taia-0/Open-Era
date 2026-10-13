# Playtest plan: declare secession

This is the plan for a blind operator. It is not a completed session. Do not fill Session, Findings, or Verdict while writing the plan. Do not open `src/`, `tests/`, the branch diff, or `docs/design/` during the session. Use only the dashboard HTTP JSON, this plan, and `progress.md`.

One process per checkpoint. Seed 1847 each time. The seat is Mara Vane, `character-01`, `playerId` `prototype-player`. Do not pass another character. Stop the process, and confirm port 4317 is free, before the next `--reset`.

Issue no command the checkpoint does not name. Advance at most 144 ticks per call. This plan uses 72, then 6, then one tick at a time through the raids.

Omit `beforeSequence` on event reads. An empty `beforeSequence=` returns the newest page. Do not send `beforeSequence=0`. That bound returns no events. Do not page backward. The declaration line is on the newest page after the last advance, and on that advance's own `events`. The claim line is on the claim advance's `events` and is older than the last page.

The readings below were taken on this tree through `GET /api/state?limit=200`, `POST /api/advance`, and `POST /api/commands`. A match is the campaign. A miss is not a new reading to write into this file during the session.

```text
npm run dashboard -- --reset --seed 1847
```

Bind `127.0.0.1:4317`. Node v24.21.0.

## Hypothesis and ambition

**Milestone hypothesis:** Mara can declare a port she owns separate from the faction that holds it. The command is refused, with a reason, when she is not the owner or the port has no faction. A headless advance never declares on its own. A port her faction holds shows the secession readout wherever she is standing. A neutral port's readout is null. A garrison of 0 reads `none`.

**Player ambition:** Mara reads Crown Harbor, Glassport, and Verdant Cay at the open and is refused when she tries to declare. On a fresh world she reads the same ports after 72 ticks, while she is still at Crown Harbor. On a third world she sails to Cinder Key, takes it, and declares it separate as Breakwater.

**Success signal:** Tick 0 Glassport shows a secession object and Verdant Cay's is null. The named refusals are HTTP 400 and write no event. Tick 72 Glassport's `secession` is null and Cinder Key's is an object naming Jun Marrow. The declaration returns HTTP 202, the next tick founds Breakwater, and the feed says Mara declared Cinder Key separate from World Government. Cinder Key's garrison is 0 and `garrisonFollows` is `none`.

## Setup

Every checkpoint starts from a fresh process. Tick 0, before any command, matches this block.

- `GET /api/health` HTTP 200 `{"ok":true,"tick":0,"events":0}`.
- `GET /api/state?limit=200` HTTP 200. `tick` 0. `day` 0. `eventPage.total` 0. `eventPage.count` 0. `eventPage.limit` 200. `eventPage.hasMore` false. `eventPage.oldestSequence` null. `eventPage.newestSequence` null. `eventPage.cursor` null.
- `player.id` `prototype-player`. `player.characterId` `character-01`. `player.displayName` `Mara Vane`. `party.locationId` `crown-harbor`.
- `capabilities.commandTypes` includes `declare-secession`, after `set-tax-rate`.
- `capabilities.requests.commands.body.settlementId` is present. `capabilities.requests.commands.body.name` is present.

| Faction | name | taxRate | taxRateSetTick | treasury | power | commanderId | actingCommanderId |
| --- | --- | ---: | --- | ---: | ---: | --- | --- |
| `free-tide` | Free Tide Compact | 0.08 | null | null (`treasuryNote` `not visible to you`) | null | `character-14` | null |
| `world-government` | World Government | 0.14 | null | 18000 (`treasuryNote` null) | 2335.44 | `character-01` | null |

| Settlement | factionId | ownerId | stability | garrison | stocks.provisions | taxRate | intelligence.exact | secession |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| `crown-harbor` | `world-government` | null | 91 | 260 | 220 | 0.14 | true | object below |
| `glassport` | `world-government` | null | 86 | 155 | 145 | 0.14 | true | object below |
| `cinder-key` | `free-tide` | null | null | 96 | 80 | 0.08 | false | null |
| `verdant-cay` | null | null | null | 61 | 269 | 0 | false | null |

No settlement has `garrison` 0. `garrisonFollows` on the two objects below is the boolean `false`, not `none`.

Crown Harbor and Glassport `secession` keys are `ownerId`, `ownerGate`, `followerCount`, `garrisonFollows`, `taxOpen`. `taxOpen` keys are `followerCount` and `garrisonFollows`.

| Port | ownerId | ownerGate | followerCount | garrisonFollows | taxOpen.followerCount | taxOpen.garrisonFollows |
| --- | --- | --- | ---: | --- | ---: | --- |
| `crown-harbor` | null | false | 0 | false | 3 | true |
| `glassport` | null | false | 0 | false | 3 | true |

`cinder-key` and `verdant-cay` have the key `secession` and the value null. They do not carry `ownerGate` or `followerCount`. Glassport is not where Mara is standing. Its readout is present because the row is an exact World Government reading.

`cinder-key` `travelTicks` is 5, `travelDays` is 0.83, and `passageCost` is 15.

## Checkpoint 1. Readout and refusals

Fresh process. Confirm the setup block. Then post only these commands. Each is HTTP 400. After all of them, `tick` is still 0, `eventPage.total` is still 0, and `pendingCommands` is empty.

| Body `settlementId` | Body `name` | code | error |
| --- | --- | --- | --- |
| `crown-harbor` | omitted | `not-owner` | Only the owner of this port may declare it separate. |
| `glassport` | omitted | `not-owner` | Only the owner of this port may declare it separate. |
| `cinder-key` | omitted | `not-owner` | Only the owner of this port may declare it separate. |
| `verdant-cay` | omitted | `no-faction` | A neutral port has no faction to leave. |
| `no-such-port` | omitted | `unknown-settlement` | That port is not on the chart. |
| `crown-harbor` | `" "` | `invalid-name` | The faction name has to be a non-empty string. |
| `crown-harbor` | `""` | `invalid-name` | The faction name has to be a non-empty string. |

Each body is `{"playerId":"prototype-player","type":"declare-secession","settlementId":"…"}` plus `name` only on the last two. The response shape is `{"ok":false,"code":"…","error":"…"}`.

This checkpoint does not put Mara at sea, in captivity, or on a port she owns. It does not queue two declarations. Those refusals are not part of this session.

## Checkpoint 2. Seventy-two ticks, no command

Fresh process. Confirm the setup block. Do not post a command.

1. `POST /api/advance` `{"ticks":72}`. HTTP 200. `ok` true. `tick` 72. `day` 12. `ticksAdvanced` 72. `eventSequence` 8413. `pausedForBattle` false. `combatUpdated` false.
2. `GET /api/state?limit=200`. Omit `beforeSequence`. `tick` 72. `day` 12. `party.locationId` `crown-harbor`. `player.displayName` `Mara Vane`. `player.characterId` `character-01`. `eventPage.total` 8413. `eventPage.count` 200. `eventPage.limit` 200. `eventPage.hasMore` true. `eventPage.oldestSequence` 8214. `eventPage.newestSequence` 8413. `eventPage.cursor` 8214.

The newest page has no `secession-declared` event.

| Faction | taxRate | taxRateSetTick | treasury | power | commanderId | actingCommanderId |
| --- | ---: | --- | ---: | ---: | --- | --- |
| `free-tide` | 0.08 | null | null | null | `character-14` | null |
| `world-government` | 0.14 | null | 17559.72 | 2224.31 | `character-01` | null |

Free Tide `treasuryNote` is `not visible to you`. World Government `treasuryNote` is null.

| Settlement | factionId | ownerId | stability | garrison | stocks.provisions | taxRate | intelligence.exact | secession |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| `crown-harbor` | `world-government` | null | 91.1 | 247 | 114.057 | 0.14 | true | object below |
| `cinder-key` | `world-government` | `character-05` | 55.15 | 10 | 186.134 | 0.14 | true | object below |
| `glassport` | `world-government` | null | null | 143 | 134 | 0.14 | false | null |
| `verdant-cay` | null | null | null | 61 | 269 | 0 | false | null |

`characters` includes `character-05` with `name` `Jun Marrow`. No settlement has `garrison` 0.

| Port | ownerId | ownerGate | followerCount | garrisonFollows | taxOpen.followerCount | taxOpen.garrisonFollows |
| --- | --- | --- | ---: | --- | ---: | --- |
| `crown-harbor` | null | false | 0 | false | 1 | true |
| `cinder-key` | `character-05` | false | 0 | false | 1 | true |

Mara is at Crown Harbor. Cinder Key's readout is present anyway: the row is exact, `factionId` is `world-government`, and she is a member of that faction. Glassport's row still says `world-government`, but `intelligence.exact` is false, `stability` is null, and `garrison` is 143. That row is a stored report. `secession` is null. `verdant-cay.secession` is null. Both rows still have the key `secession`.

## Checkpoint 3. Declare Cinder Key separate

Fresh process. Confirm the setup block before the first command.

1. `POST /api/commands` `{"playerId":"prototype-player","type":"character-action","action":"travel","targetId":"cinder-key"}`. HTTP 202.

```json
{"ok":true,"command":{"id":"command-00001","playerId":"prototype-player","issuedTick":0,"type":"character-action","action":"travel","targetId":"cinder-key","source":"treasury"}}
```

2. `GET /api/state?limit=200` before the advance. `tick` 0. `eventPage.total` 1. Sequence 1: `type` `player-command-accepted`, `tick` 0, `day` 0, `actorId` `character-01`, `targetId` `cinder-key`, `payloadWithheld` false. Summary `Command queued for Mara Vane: travel at Crown Harbor (from the treasury)`.
3. `POST /api/advance` `{"ticks":6}`. HTTP 200. `ok` true. `tick` 6. `day` 1. `ticksAdvanced` 6. `eventSequence` 715. `pausedForBattle` false. `combatUpdated` false.
4. `GET /api/state?limit=200`. Omit `beforeSequence`. `tick` 6. `day` 1. `party.locationId` `cinder-key`. `eventPage.total` 715. `eventPage.count` 200. `eventPage.limit` 200. `eventPage.hasMore` true. `eventPage.oldestSequence` 516. `eventPage.newestSequence` 715. `eventPage.cursor` 516.

Cinder Key at tick 6: `factionId` `free-tide`, `ownerId` null, `garrison` 111, `intelligence.exact` false, `secession.ownerId` null, `secession.ownerGate` false, `secession.followerCount` null, `secession.garrisonFollows` false, `secession.taxOpen.followerCount` null, `secession.taxOpen.garrisonFollows` true. She is standing on another faction's port, so the follower counts stay null.

5. `POST /api/commands` `{"playerId":"prototype-player","type":"character-action","action":"raid"}`. HTTP 202. `command.id` `command-00002`. `command.issuedTick` 6. `command.action` `raid`. `command.targetId` `cinder-key`. `command.source` `treasury`. The port's `garrison` before this post is 111. `surrenderOffered` is false. `surrender` is null.
6. `POST /api/advance` `{"ticks":1}` three times. Stop when `pausedForBattle` is false.

| Call | tick | day | ticksAdvanced | eventSequence | pausedForBattle | combatUpdated |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| 1 | 7 | 1.17 | 1 | 840 | true | true |
| 2 | 8 | 1.33 | 1 | 946 | true | true |
| 3 | 9 | 1.5 | 1 | 1057 | false | true |

`GET /api/state?limit=200`. `tick` 9. `party.locationId` `cinder-key`. Cinder Key: `factionId` `free-tide`, `stability` 60.18, `garrison` 52, `stocks.provisions` 146.34, `taxRate` 0.08, `surrenderOffered` false, `surrender` null. `secession.followerCount` null. `secession.garrisonFollows` false. `secession.taxOpen.garrisonFollows` true.

7. `POST /api/commands` the same raid body. HTTP 202. `command.id` `command-00003`. `command.issuedTick` 9. Garrison before the post is 52. `surrenderOffered` is false.
8. `POST /api/advance` `{"ticks":1}` three times.

| Call | tick | day | ticksAdvanced | eventSequence | pausedForBattle | combatUpdated |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| 1 | 10 | 1.67 | 1 | 1177 | true | true |
| 2 | 11 | 1.83 | 1 | 1301 | true | true |
| 3 | 12 | 2 | 1 | 1430 | false | true |

The third response's `events` include a `battle-resolved` whose `summary` is `Mara Vane won the fight at Cinder Key on a higher score. 2 captains won a fight here on this tick: Mara Vane, Rook Tern. This fight left the garrison standing.` Do not claim yet. `GET /api/state?limit=200`. `tick` 12. Cinder Key: `stability` 36.21, `garrison` 9, `stocks.provisions` 153.76, `surrenderOffered` false, `surrender` null. `secession.garrisonFollows` true. `secession.followerCount` null.

9. `POST /api/commands` the same raid body. HTTP 202. `command.id` `command-00004`. `command.issuedTick` 12. Garrison before the post is 9.
10. `POST /api/advance` `{"ticks":1}` once. HTTP 200. `ok` true. `tick` 13. `day` 2.17. `ticksAdvanced` 1. `eventSequence` 1560. `pausedForBattle` false. `combatUpdated` true. The response `events` include `battle-resolved` with `summary` `Mara Vane won the fight at Cinder Key on a higher score. A surrender was offered.`

`GET /api/state?limit=200`. `tick` 13. `party.locationId` `cinder-key`. Cinder Key: `factionId` `free-tide`, `ownerId` null, `stability` 24.24, `garrison` 3, `stocks.provisions` 154.57, `taxRate` 0.08, `surrenderOffered` true, `surrender` null. `secession.followerCount` null. `secession.garrisonFollows` true.

11. `POST /api/commands` `{"playerId":"prototype-player","type":"character-action","action":"claim-settlement"}`. HTTP 202.

```json
{"ok":true,"command":{"id":"command-00005","playerId":"prototype-player","issuedTick":13,"type":"character-action","action":"claim-settlement","targetId":"cinder-key","source":"treasury"}}
```

12. `POST /api/advance` `{"ticks":1}`. HTTP 200. `ok` true. `tick` 14. `day` 2.33. `ticksAdvanced` 1. `eventSequence` 1685. `pausedForBattle` false. `combatUpdated` false.

On that response's `events`, one row is `type` `settlement-claimed`, `sequence` 1569, `tick` 13, `actorId` `character-01`, `targetId` `free-tide`, `settlementId` `cinder-key`, `payloadWithheld` false, `summary` `Mara Vane claimed Cinder Key.` Its `data` keys are `previousFactionId`, `previousOwnerId`, `ownerId`, `factionId`, `garrison`, `stability`, `basis`. The values are `previousFactionId` `free-tide`, `previousOwnerId` null, `ownerId` `character-01`, `factionId` `world-government`, `garrison` 3, `stability` 55, `basis` `accepted-surrender`. This row is not on the newest page after the declaration. Do not page backward to find it again.

13. `GET /api/state?limit=200`. `tick` 14. `day` 2.33. `eventPage.total` 1685. `eventPage.count` 200. `eventPage.oldestSequence` 1486. `eventPage.newestSequence` 1685. `eventPage.cursor` 1486. `characters` `character-01` has `factionId` `world-government` and `locationId` `cinder-key`.

Cinder Key: `factionId` `world-government`, `ownerId` `character-01`, `stability` 55, `garrison` 3, `population` 6400, `stocks.provisions` 155.265, `taxRate` 0.14, `intelligence.exact` true, `surrenderOffered` false, `surrender` null.

| ownerId | ownerGate | followerCount | garrisonFollows | taxOpen.followerCount | taxOpen.garrisonFollows |
| --- | --- | ---: | --- | ---: | --- |
| `character-01` | true | 1 | true | 1 | true |

14. `POST /api/commands` `{"playerId":"prototype-player","type":"declare-secession","settlementId":"cinder-key","name":"Breakwater"}`. HTTP 202.

```json
{"ok":true,"command":{"id":"command-00006","playerId":"prototype-player","issuedTick":14,"type":"declare-secession","settlementId":"cinder-key","name":"Breakwater"}}
```

15. `GET /api/state?limit=200` before the advance. `tick` 14. `eventPage.total` 1686. `pendingCommands` has one row: `id` `command-00006`, `type` `declare-secession`, `settlementId` `cinder-key`, `name` `Breakwater`. Sequence 1686: `type` `player-command-accepted`, `tick` 14, `day` 2.33, `actorId` `character-01`, `targetId` `cinder-key`, `settlementId` `cinder-key`, `payloadWithheld` false, `summary` `Command queued for Mara Vane: declare Cinder Key separate as Breakwater`. `data.command.name` is `Breakwater`. `data.command.type` is `declare-secession`.

16. `POST /api/advance` `{"ticks":1}`. HTTP 200. `ok` true. `tick` 15. `day` 2.5. `ticksAdvanced` 1. `eventSequence` 1801. `pausedForBattle` false. `combatUpdated` false.

On that response's `events`, one row is `type` `secession-declared`, `sequence` 1695, `tick` 14, `actorId` `character-01`, `targetId` `world-government`, `settlementId` `cinder-key`, `payloadWithheld` false, `summary` `Mara Vane declared Cinder Key separate from World Government.` `data` keys are `commandId`, `previousFactionId`, `ownerId`, `followerIds`, `garrisonFollowed`, `garrison`, `stability`, `faction`, `previousActingCommanderId`, `actingCommanderId`.

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

`data.faction` keys are `id`, `name`, `color`, `treasury`, `taxRate`. `id` `secession-character-01-cinder-key-14`. `name` `Breakwater`. `color` `#2f6f4e`. `treasury` 0. `taxRate` 0.08. There is no `actingCommanderId` on `data.faction` and no `taxRateSetTick`.

17. `GET /api/state?limit=200`. Omit `beforeSequence`. `tick` 15. `day` 2.5. `party.locationId` `cinder-key`. `eventPage.total` 1801. `eventPage.count` 200. `eventPage.limit` 200. `eventPage.hasMore` true. `eventPage.oldestSequence` 1602. `eventPage.newestSequence` 1801. `eventPage.cursor` 1602.

The newest page includes sequence 1695 (`secession-declared`, `day` 2.33, `payloadWithheld` false, the same summary and the same `data`) and sequence 1686 (the queued declare line). It does not include sequence 1569. `player-command-resolved` is not on the page. The confirmation the page shows is the `secession-declared` line.

`characters` `character-01`: `name` `Mara Vane`, `factionId` `secession-character-01-cinder-key-14`, `locationId` `cinder-key`.

| Faction | name | taxRate | treasury | treasuryNote | power | commanderId | actingCommanderId | color |
| --- | --- | ---: | ---: | --- | ---: | --- | --- | --- |
| `free-tide` | Free Tide Compact | 0.08 | null | `not visible to you` | null | `character-14` | null | `#d05a47` |
| `secession-character-01-cinder-key-14` | Breakwater | 0.08 | 2.69 | null | 274.92 | `character-01` | null | `#2f6f4e` |
| `world-government` | World Government | 0.14 | null | `not visible to you` | null | null | null | `#345995` |

The event's `data.faction.treasury` is 0. The faction row after the tick is 2.69. Both figures are the reading.

Cinder Key: `factionId` `secession-character-01-cinder-key-14`, `ownerId` `character-01`, `stability` 55.03, `garrison` 0, `population` 6400, `stocks.provisions` 156.255, `taxRate` 0.08, `intelligence.exact` true, `intelligence.present` true, `surrenderOffered` false, `surrender` null.

| ownerId | ownerGate | followerCount | garrisonFollows | taxOpen.followerCount | taxOpen.garrisonFollows |
| --- | --- | ---: | --- | ---: | --- |
| `character-01` | true | 0 | `none` | 0 | `none` |

`garrisonFollows` and `taxOpen.garrisonFollows` are the string `none`, not the boolean `false`. That is the garrison-of-0 shape. The settlement panel draws that value as `no garrison.` The JSON has no sentence field. `population` is still 6400.

## Session

Blind session on `feature/secession-2` at `3d8619052afed64b7682b64c056888991bfc161b`. Node v24.21.0, ICU 78.3. Seed 1847. Seat Mara Vane, `character-01`, `playerId` `prototype-player`. Three processes, one per checkpoint. Each was `npm run dashboard -- --reset --seed 1847` on `127.0.0.1:4317`. The process was stopped, and port 4317 was free, before the next `--reset`. No command other than the ones the checkpoint names. Advances were 72, then 6, then one tick at a time through the raids. `beforeSequence` was omitted on the event reads. Nothing was paged backward.

### Setup, all three checkpoints

`GET /api/health` HTTP 200 `{"ok":true,"tick":0,"events":0}`.

`GET /api/state?limit=200` HTTP 200. `tick` 0. `day` 0. `eventPage.total` 0. `eventPage.count` 0. `eventPage.limit` 200. `eventPage.hasMore` false. `eventPage.oldestSequence` null. `eventPage.newestSequence` null. `eventPage.cursor` null.

`player.id` `prototype-player`. `player.characterId` `character-01`. `player.displayName` `Mara Vane`. `party.locationId` `crown-harbor`.

`capabilities.commandTypes` included `declare-secession`, after `set-tax-rate`. `capabilities.requests.commands.body.settlementId` was present. `capabilities.requests.commands.body.name` was present.

| Faction | name | taxRate | taxRateSetTick | treasury | power | commanderId | actingCommanderId |
| --- | --- | ---: | --- | ---: | ---: | --- | --- |
| `free-tide` | Free Tide Compact | 0.08 | null | null (`treasuryNote` `not visible to you`) | null | `character-14` | null |
| `world-government` | World Government | 0.14 | null | 18000 (`treasuryNote` null) | 2335.44 | `character-01` | null |

| Settlement | factionId | ownerId | stability | garrison | stocks.provisions | taxRate | intelligence.exact | secession |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| `crown-harbor` | `world-government` | null | 91 | 260 | 220 | 0.14 | true | object below |
| `glassport` | `world-government` | null | 86 | 155 | 145 | 0.14 | true | object below |
| `cinder-key` | `free-tide` | null | null | 96 | 80 | 0.08 | false | null |
| `verdant-cay` | null | null | null | 61 | 269 | 0 | false | null |

No settlement had `garrison` 0. `garrisonFollows` on the two objects below was the boolean `false`.

| Port | ownerId | ownerGate | followerCount | garrisonFollows | taxOpen.followerCount | taxOpen.garrisonFollows |
| --- | --- | --- | ---: | --- | ---: | --- |
| `crown-harbor` | null | false | 0 | false | 3 | true |
| `glassport` | null | false | 0 | false | 3 | true |

`cinder-key` and `verdant-cay` had the key `secession` and the value null. They did not carry `ownerGate` or `followerCount`. `cinder-key` `travelTicks` was 5, `travelDays` was 0.83, and `passageCost` was 15. The third process's tick-0 state matched the first process's tick-0 state.

### Checkpoint 1. Readout and refusals

The setup block above was confirmed. Each post was HTTP 400. The body was `{"ok":false,"code":"…","error":"…"}`.

| Body `settlementId` | Body `name` | HTTP | code | error |
| --- | --- | --- | --- | --- |
| `crown-harbor` | omitted | 400 | `not-owner` | Only the owner of this port may declare it separate. |
| `glassport` | omitted | 400 | `not-owner` | Only the owner of this port may declare it separate. |
| `cinder-key` | omitted | 400 | `not-owner` | Only the owner of this port may declare it separate. |
| `verdant-cay` | omitted | 400 | `no-faction` | A neutral port has no faction to leave. |
| `no-such-port` | omitted | 400 | `unknown-settlement` | That port is not on the chart. |
| `crown-harbor` | `" "` | 400 | `invalid-name` | The faction name has to be a non-empty string. |
| `crown-harbor` | `""` | 400 | `invalid-name` | The faction name has to be a non-empty string. |

After all seven, `GET /api/state?limit=200` was HTTP 200. `tick` 0. `eventPage.total` 0. `pendingCommands` was empty. `events` length was 0.

### Checkpoint 2. Seventy-two ticks, no command

Fresh process. The setup block was confirmed. No command was posted.

`POST /api/advance` `{"ticks":72}` HTTP 200. `ok` true. `tick` 72. `day` 12. `ticksAdvanced` 72. `eventSequence` 8413. `pausedForBattle` false. `combatUpdated` false. That response's `events` included no `secession-declared`.

`GET /api/state?limit=200`, `beforeSequence` omitted, HTTP 200. `tick` 72. `day` 12. `party.locationId` `crown-harbor`. `player.displayName` `Mara Vane`. `player.characterId` `character-01`. `eventPage.total` 8413. `eventPage.count` 200. `eventPage.limit` 200. `eventPage.hasMore` true. `eventPage.oldestSequence` 8214. `eventPage.newestSequence` 8413. `eventPage.cursor` 8214.

The newest page had no `secession-declared` event.

| Faction | taxRate | taxRateSetTick | treasury | power | commanderId | actingCommanderId |
| --- | ---: | --- | ---: | ---: | --- | --- |
| `free-tide` | 0.08 | null | null | null | `character-14` | null |
| `world-government` | 0.14 | null | 17559.72 | 2224.31 | `character-01` | null |

Free Tide `treasuryNote` was `not visible to you`. World Government `treasuryNote` was null.

| Settlement | factionId | ownerId | stability | garrison | stocks.provisions | taxRate | intelligence.exact | secession |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| `crown-harbor` | `world-government` | null | 91.1 | 247 | 114.057 | 0.14 | true | object below |
| `cinder-key` | `world-government` | `character-05` | 55.15 | 10 | 186.134 | 0.14 | true | object below |
| `glassport` | `world-government` | null | null | 143 | 134 | 0.14 | false | null |
| `verdant-cay` | null | null | null | 61 | 269 | 0 | false | null |

`characters` included `character-05` with `name` `Jun Marrow`. No settlement had `garrison` 0.

| Port | ownerId | ownerGate | followerCount | garrisonFollows | taxOpen.followerCount | taxOpen.garrisonFollows |
| --- | --- | --- | ---: | --- | ---: | --- |
| `crown-harbor` | null | false | 0 | false | 1 | true |
| `cinder-key` | `character-05` | false | 0 | false | 1 | true |

`glassport.secession` was null. `verdant-cay.secession` was null. Both rows still had the key `secession`.

### Checkpoint 3. Declare Cinder Key separate

Fresh process. The setup block was confirmed before the first command.

`POST /api/commands` `{"playerId":"prototype-player","type":"character-action","action":"travel","targetId":"cinder-key"}` HTTP 202.

```json
{"ok":true,"command":{"id":"command-00001","playerId":"prototype-player","issuedTick":0,"type":"character-action","action":"travel","targetId":"cinder-key","source":"treasury"}}
```

`GET /api/state?limit=200` before the advance. `tick` 0. `eventPage.total` 1. Sequence 1: `type` `player-command-accepted`, `tick` 0, `day` 0, `actorId` `character-01`, `targetId` `cinder-key`, `payloadWithheld` false. Summary `Command queued for Mara Vane: travel at Crown Harbor (from the treasury)`.

`POST /api/advance` `{"ticks":6}` HTTP 200. `ok` true. `tick` 6. `day` 1. `ticksAdvanced` 6. `eventSequence` 715. `pausedForBattle` false. `combatUpdated` false.

`GET /api/state?limit=200`, `beforeSequence` omitted. `tick` 6. `day` 1. `party.locationId` `cinder-key`. `eventPage.total` 715. `eventPage.count` 200. `eventPage.limit` 200. `eventPage.hasMore` true. `eventPage.oldestSequence` 516. `eventPage.newestSequence` 715. `eventPage.cursor` 516.

Cinder Key at tick 6: `factionId` `free-tide`, `ownerId` null, `garrison` 111, `intelligence.exact` false, `secession.ownerId` null, `secession.ownerGate` false, `secession.followerCount` null, `secession.garrisonFollows` false, `secession.taxOpen.followerCount` null, `secession.taxOpen.garrisonFollows` true. `surrenderOffered` false. `surrender` null.

`POST /api/commands` `{"playerId":"prototype-player","type":"character-action","action":"raid"}` HTTP 202. `command.id` `command-00002`. `command.issuedTick` 6. `command.action` `raid`. `command.targetId` `cinder-key`. `command.source` `treasury`.

`POST /api/advance` `{"ticks":1}` three times. The third had `pausedForBattle` false, and that was the stop.

| Call | HTTP | ok | tick | day | ticksAdvanced | eventSequence | pausedForBattle | combatUpdated |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| 1 | 200 | true | 7 | 1.17 | 1 | 840 | true | true |
| 2 | 200 | true | 8 | 1.33 | 1 | 946 | true | true |
| 3 | 200 | true | 9 | 1.5 | 1 | 1057 | false | true |

`GET /api/state?limit=200`. `tick` 9. `party.locationId` `cinder-key`. Cinder Key: `factionId` `free-tide`, `stability` 60.18, `garrison` 52, `stocks.provisions` 146.34, `taxRate` 0.08, `surrenderOffered` false, `surrender` null. `secession.followerCount` null. `secession.garrisonFollows` false. `secession.taxOpen.garrisonFollows` true.

`POST /api/commands` the same raid body. HTTP 202. `command.id` `command-00003`. `command.issuedTick` 9. Garrison before the post was 52. `surrenderOffered` was false.

`POST /api/advance` `{"ticks":1}` three times. The third had `pausedForBattle` false.

| Call | HTTP | ok | tick | day | ticksAdvanced | eventSequence | pausedForBattle | combatUpdated |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| 1 | 200 | true | 10 | 1.67 | 1 | 1177 | true | true |
| 2 | 200 | true | 11 | 1.83 | 1 | 1301 | true | true |
| 3 | 200 | true | 12 | 2 | 1 | 1430 | false | true |

The third response's `events` included a `battle-resolved` whose `summary` was `Mara Vane won the fight at Cinder Key on a higher score. 2 captains won a fight here on this tick: Mara Vane, Rook Tern. This fight left the garrison standing.`

`GET /api/state?limit=200`. `tick` 12. Cinder Key: `stability` 36.21, `garrison` 9, `stocks.provisions` 153.76, `surrenderOffered` false, `surrender` null. `secession.garrisonFollows` true. `secession.followerCount` null.

`POST /api/commands` the same raid body. HTTP 202. `command.id` `command-00004`. `command.issuedTick` 12. Garrison before the post was 9.

`POST /api/advance` `{"ticks":1}` once. HTTP 200. `ok` true. `tick` 13. `day` 2.17. `ticksAdvanced` 1. `eventSequence` 1560. `pausedForBattle` false. `combatUpdated` true. The response `events` included `battle-resolved` with `summary` `Mara Vane won the fight at Cinder Key on a higher score. A surrender was offered.`

`GET /api/state?limit=200`. `tick` 13. `party.locationId` `cinder-key`. Cinder Key: `factionId` `free-tide`, `ownerId` null, `stability` 24.24, `garrison` 3, `stocks.provisions` 154.57, `taxRate` 0.08, `surrenderOffered` true, `surrender` null. `secession.followerCount` null. `secession.garrisonFollows` true.

`POST /api/commands` `{"playerId":"prototype-player","type":"character-action","action":"claim-settlement"}` HTTP 202.

```json
{"ok":true,"command":{"id":"command-00005","playerId":"prototype-player","issuedTick":13,"type":"character-action","action":"claim-settlement","targetId":"cinder-key","source":"treasury"}}
```

`POST /api/advance` `{"ticks":1}` HTTP 200. `ok` true. `tick` 14. `day` 2.33. `ticksAdvanced` 1. `eventSequence` 1685. `pausedForBattle` false. `combatUpdated` false.

On that response's `events`, one row was `type` `settlement-claimed`, `sequence` 1569, `tick` 13, `actorId` `character-01`, `targetId` `free-tide`, `settlementId` `cinder-key`, `payloadWithheld` false, `summary` `Mara Vane claimed Cinder Key.` Its `data` keys were `previousFactionId`, `previousOwnerId`, `ownerId`, `factionId`, `garrison`, `stability`, `basis`. The values were `previousFactionId` `free-tide`, `previousOwnerId` null, `ownerId` `character-01`, `factionId` `world-government`, `garrison` 3, `stability` 55, `basis` `accepted-surrender`.

`GET /api/state?limit=200`. `tick` 14. `day` 2.33. `eventPage.total` 1685. `eventPage.count` 200. `eventPage.oldestSequence` 1486. `eventPage.newestSequence` 1685. `eventPage.cursor` 1486. `characters` `character-01` had `factionId` `world-government` and `locationId` `cinder-key`.

Cinder Key: `factionId` `world-government`, `ownerId` `character-01`, `stability` 55, `garrison` 3, `population` 6400, `stocks.provisions` 155.265, `taxRate` 0.14, `intelligence.exact` true, `surrenderOffered` false, `surrender` null.

| ownerId | ownerGate | followerCount | garrisonFollows | taxOpen.followerCount | taxOpen.garrisonFollows |
| --- | --- | ---: | --- | ---: | --- |
| `character-01` | true | 1 | true | 1 | true |

`POST /api/commands` `{"playerId":"prototype-player","type":"declare-secession","settlementId":"cinder-key","name":"Breakwater"}` HTTP 202.

```json
{"ok":true,"command":{"id":"command-00006","playerId":"prototype-player","issuedTick":14,"type":"declare-secession","settlementId":"cinder-key","name":"Breakwater"}}
```

`GET /api/state?limit=200` before the advance. `tick` 14. `eventPage.total` 1686. `pendingCommands` had one row: `id` `command-00006`, `type` `declare-secession`, `settlementId` `cinder-key`, `name` `Breakwater`. Sequence 1686: `type` `player-command-accepted`, `tick` 14, `day` 2.33, `actorId` `character-01`, `targetId` `cinder-key`, `settlementId` `cinder-key`, `payloadWithheld` false, `summary` `Command queued for Mara Vane: declare Cinder Key separate as Breakwater`. `data.command.name` was `Breakwater`. `data.command.type` was `declare-secession`.

`POST /api/advance` `{"ticks":1}` HTTP 200. `ok` true. `tick` 15. `day` 2.5. `ticksAdvanced` 1. `eventSequence` 1801. `pausedForBattle` false. `combatUpdated` false.

On that response's `events`, one row was `type` `secession-declared`, `sequence` 1695, `tick` 14, `actorId` `character-01`, `targetId` `world-government`, `settlementId` `cinder-key`, `payloadWithheld` false, `summary` `Mara Vane declared Cinder Key separate from World Government.` `data` keys were `commandId`, `previousFactionId`, `ownerId`, `followerIds`, `garrisonFollowed`, `garrison`, `stability`, `faction`, `previousActingCommanderId`, `actingCommanderId`.

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

`data.faction` keys were `id`, `name`, `color`, `treasury`, `taxRate`. `id` `secession-character-01-cinder-key-14`. `name` `Breakwater`. `color` `#2f6f4e`. `treasury` 0. `taxRate` 0.08. There was no `actingCommanderId` on `data.faction` and no `taxRateSetTick`.

`GET /api/state?limit=200`, `beforeSequence` omitted. `tick` 15. `day` 2.5. `party.locationId` `cinder-key`. `eventPage.total` 1801. `eventPage.count` 200. `eventPage.limit` 200. `eventPage.hasMore` true. `eventPage.oldestSequence` 1602. `eventPage.newestSequence` 1801. `eventPage.cursor` 1602.

The newest page included sequence 1695 (`secession-declared`, `day` 2.33, `payloadWithheld` false, the same summary and the same `data`) and sequence 1686 (the queued declare line). It did not include sequence 1569. `player-command-resolved` was not on the page.

`characters` `character-01`: `name` `Mara Vane`, `factionId` `secession-character-01-cinder-key-14`, `locationId` `cinder-key`.

| Faction | name | taxRate | treasury | treasuryNote | power | commanderId | actingCommanderId | color |
| --- | --- | ---: | ---: | --- | ---: | --- | --- | --- |
| `free-tide` | Free Tide Compact | 0.08 | null | `not visible to you` | null | `character-14` | null | `#d05a47` |
| `secession-character-01-cinder-key-14` | Breakwater | 0.08 | 2.69 | null | 274.92 | `character-01` | null | `#2f6f4e` |
| `world-government` | World Government | 0.14 | null | `not visible to you` | null | null | null | `#345995` |

The event's `data.faction.treasury` was 0. The faction row after the tick was 2.69.

Cinder Key: `factionId` `secession-character-01-cinder-key-14`, `ownerId` `character-01`, `stability` 55.03, `garrison` 0, `population` 6400, `stocks.provisions` 156.255, `taxRate` 0.08, `intelligence.exact` true, `intelligence.present` true, `surrenderOffered` false, `surrender` null.

| ownerId | ownerGate | followerCount | garrisonFollows | taxOpen.followerCount | taxOpen.garrisonFollows |
| --- | --- | ---: | --- | ---: | --- |
| `character-01` | true | 0 | `none` | 0 | `none` |

`garrisonFollows` and `taxOpen.garrisonFollows` were the string `none`.

## Findings

Every named checkpoint matched. The success signal held. Tick 0 Glassport showed a secession object and Verdant Cay's was null. The seven named refusals were HTTP 400 and wrote no event: after them `tick` was 0 and `eventPage.total` was 0. Tick 72, with no command, left Glassport's `secession` null and Cinder Key's an object naming Jun Marrow (`character-05`). The newest page had no `secession-declared`. The declaration returned HTTP 202. The next tick founded Breakwater (`secession-character-01-cinder-key-14`). Sequence 1695 said `Mara Vane declared Cinder Key separate from World Government.` Cinder Key's garrison was 0 and `garrisonFollows` was `none`. The event treasury was 0 and the faction row after that tick was 2.69. No mismatch.

## Verdict

`PROMOTE`

A match is the campaign. Every named reading matched, including the success signal: Glassport's secession object and Verdant Cay's null at tick 0, the named HTTP 400 refusals with no event, Glassport null and Jun Marrow's Cinder Key object at tick 72 with no headless declaration, HTTP 202 for Breakwater, the feed line that Mara declared Cinder Key separate from World Government, garrison 0, and `garrisonFollows` `none`.
