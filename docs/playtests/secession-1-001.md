# Playtest plan: secession readout

This is the plan for a blind operator. It is not a completed session. Do not fill Session, Findings, or Verdict while writing the plan. Do not open `src/`, `tests/`, the branch diff, or `docs/design/` during the session. Use only the dashboard HTTP JSON, this plan, and `progress.md`.

One process per checkpoint. Seed 1847 each time. The seat is Mara Vane, `character-01`, `playerId` `prototype-player`. Do not pass another character. Stop the process, and confirm port 4317 is free, before the next `--reset`.

Issue no command the checkpoint does not name. Advance at most 144 ticks per call. This plan uses 72, then 5.

Omit `beforeSequence` on event reads. An empty `beforeSequence=` returns the newest page. Do not send `beforeSequence=0`. That bound returns no events. Do not page backward. The secession figures are on the settlement rows.

The readings below were taken on this tree through `GET /api/state?limit=200`, `POST /api/advance`, and `POST /api/commands`. A match is the campaign. A miss is not a new reading to write into this file during the session.

```text
npm run dashboard -- --reset --seed 1847
```

Bind `127.0.0.1:4317`. Node v24.21.0.

## Hypothesis and ambition

**Milestone hypothesis:** The settlement panel reads whether an owner could declare and who would leave with them. The reading is not a command, and nothing in a headless advance writes it into the world. On a World Government port the count is a number. On a port that faction does not hold, the reading is absent until Mara is standing there, and even then the follower counts stay null.

**Player ambition:** Mara Vane reads Crown Harbor and Glassport at the open, sails to Cinder Key and reads that dock, then on a fresh world reads Cinder Key again after 72 ticks, when Jun Marrow owns it and the owner gate still does not pass.

**Success signal:** Every named `secession` key is present. Tick 0 Crown Harbor and Glassport show follower count 0 and a tax-open garrison that would follow. Cinder Key at tick 5 shows `followerCount` null. Cinder Key at tick 72 names Jun Marrow, `ownerGate` false, and follower count 0. `commandTypes` does not include `declare-secession`.

## Setup

Both checkpoints start from a fresh process. Tick 0, before any command, matches this block.

- `GET /api/health` HTTP 200 `{"ok":true,"tick":0,"events":0}`.
- `GET /api/state?limit=200` HTTP 200. `tick` 0. `day` 0. `eventPage.total` 0. `eventPage.count` 0. `eventPage.hasMore` false. `eventPage.oldestSequence` null. `eventPage.newestSequence` null.
- `GET /api/state?limit=200&beforeSequence=` is the same page: `eventPage.total` 0 and `eventPage.count` 0.
- `GET /api/state?limit=200&beforeSequence=0` is HTTP 200 with `events` length 0 and `eventPage.count` 0.
- `player.id` `prototype-player`. `player.characterId` `character-01`. `player.displayName` `Mara Vane`. `party.locationId` `crown-harbor`.
- `capabilities.commandTypes` is `character-action`, `issue-order`, `confirm-order`, `amend-order`, `cancel-order`, `retreat-battle`, `escape-captivity`, `offer-contract`, `cancel-contract`, `set-tax-rate`. It does not include `declare-secession`.

| Faction | taxRate | taxRateSetTick | treasury | power | commanderId | actingCommanderId |
| --- | ---: | --- | ---: | ---: | --- | --- |
| `free-tide`, Free Tide Compact | 0.08 | null | null (`treasuryNote` `not visible to you`) | null | `character-14` | null |
| `world-government`, World Government | 0.14 | null | 18000 | 2335.44 | `character-01` | null |

| Settlement | factionId | ownerId | stability | garrison | taxRate | secession |
| --- | --- | --- | ---: | ---: | ---: | --- |
| `crown-harbor` | `world-government` | null | 91 | 260 | 0.14 | object below |
| `glassport` | `world-government` | null | 86 | 155 | 0.14 | object below |
| `cinder-key` | `free-tide` | null | null | 96 | 0.08 | null |
| `verdant-cay` | null | null | null | 61 | 0 | null |

Crown Harbor `secession` keys are `ownerId`, `ownerGate`, `followerCount`, `garrisonFollows`, `taxOpen`. `taxOpen` keys are `followerCount` and `garrisonFollows`.

| Port | ownerId | ownerGate | followerCount | garrisonFollows | taxOpen.followerCount | taxOpen.garrisonFollows |
| --- | --- | --- | ---: | --- | ---: | --- |
| `crown-harbor` | null | false | 0 | false | 3 | true |
| `glassport` | null | false | 0 | false | 3 | true |

`cinder-key` and `verdant-cay` have the key `secession` and the value null. They do not carry `ownerGate` or `followerCount`.

## Checkpoint 1. No command, then 72 ticks

Fresh process. Do not post a command.

1. Confirm the setup block.
2. `POST /api/advance` `{"ticks":72}`. HTTP 200. `ok` true. `tick` 72. `day` 12. `ticksAdvanced` 72. `eventSequence` 8413.
3. `GET /api/state?limit=200`. Omit `beforeSequence`. `tick` 72. `day` 12. `party.locationId` `crown-harbor`. `player.displayName` `Mara Vane`. `player.characterId` `character-01`. `eventPage.total` 8413. `eventPage.count` 200. `eventPage.limit` 200. `eventPage.hasMore` true. `eventPage.oldestSequence` 8214. `eventPage.newestSequence` 8413. `eventPage.cursor` 8214.
4. `GET /api/state?limit=200&beforeSequence=` returns that same page (`eventPage.total` 8413, `eventPage.count` 200, `eventPage.oldestSequence` 8214). `GET /api/state?limit=200&beforeSequence=0` returns `events` length 0. Do not page backward.

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

`characters` includes `character-05` with `name` `Jun Marrow`.

| Port | ownerId | ownerGate | followerCount | garrisonFollows | taxOpen.followerCount | taxOpen.garrisonFollows |
| --- | --- | --- | ---: | --- | ---: | --- |
| `crown-harbor` | null | false | 0 | false | 1 | true |
| `cinder-key` | `character-05` | false | 0 | false | 1 | true |

`glassport.secession` is null. `verdant-cay.secession` is null. Both rows still have the key `secession`.

## Checkpoint 2. Stand on Cinder Key

Fresh process. Confirm the setup block before the command. `cinder-key` `travelTicks` is 5, `travelDays` is 0.83, and `passageCost` is 15.

1. `POST /api/commands` `{"playerId":"prototype-player","type":"character-action","action":"travel","targetId":"cinder-key"}`. HTTP 202.

```json
{"ok":true,"command":{"id":"command-00001","playerId":"prototype-player","issuedTick":0,"type":"character-action","action":"travel","targetId":"cinder-key","source":"treasury"}}
```

2. `GET /api/state?limit=200` before the advance. `tick` 0. `eventPage.total` 1. Sequence 1: `type` `player-command-accepted`, `tick` 0, `actorId` `character-01`, `payloadWithheld` false. Summary `Command queued for Mara Vane: travel at Crown Harbor (from the treasury)`.
3. `POST /api/advance` `{"ticks":5}`. HTTP 200. `ok` true. `tick` 5. `day` 0.83. `ticksAdvanced` 5. `eventSequence` 596.
4. `GET /api/state?limit=200`. Omit `beforeSequence`. `tick` 5. `day` 0.83. `party.locationId` `cinder-key`. `player.displayName` `Mara Vane`. `player.characterId` `character-01`. `eventPage.total` 596. `eventPage.count` 200. `eventPage.limit` 200. `eventPage.hasMore` true. `eventPage.oldestSequence` 397. `eventPage.newestSequence` 596. `eventPage.cursor` 397.
5. `beforeSequence=` returns that same page. `beforeSequence=0` returns `events` length 0. Sequence 1 is older than this page. Do not follow it.

| Faction | taxRate | taxRateSetTick | treasury | power | commanderId | actingCommanderId |
| --- | ---: | --- | ---: | ---: | --- | --- |
| `free-tide` | 0.08 | null | null | null | `character-14` | null |
| `world-government` | 0.14 | null | 17878.39 | 2346.5 | `character-01` | null |

Free Tide `treasuryNote` is `not visible to you`.

| Settlement | factionId | ownerId | stability | garrison | taxRate | intelligence.exact | intelligence.present | secession |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| `crown-harbor` | `world-government` | null | 90.12 | 250 | 0.14 | true | false | object below |
| `glassport` | `world-government` | null | 85.12 | 150 | 0.14 | true | false | object below |
| `cinder-key` | `free-tide` | null | 72.15 | 111 | 0.08 | false | true | object below |
| `verdant-cay` | null | null | null | 61 | 0 | false | false | null |

| Port | ownerId | ownerGate | followerCount | garrisonFollows | taxOpen.followerCount | taxOpen.garrisonFollows |
| --- | --- | --- | --- | --- | --- | --- |
| `crown-harbor` | null | false | 0 | false | 0 | true |
| `glassport` | null | false | 0 | false | 2 | true |
| `cinder-key` | null | false | null | false | null | true |

Cinder Key's `secession` keys are `ownerId`, `ownerGate`, `followerCount`, `garrisonFollows`, and `taxOpen`. `followerCount` and `taxOpen.followerCount` are null. `taxOpen.garrisonFollows` is true. `verdant-cay.secession` is null.

`capabilities.commandTypes` still does not include `declare-secession`.
