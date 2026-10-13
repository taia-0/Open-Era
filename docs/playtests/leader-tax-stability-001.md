# Playtest plan: leader tax stability

This is the plan for a blind operator. It is not a completed session. Do not fill Session, Findings, or Verdict while writing the plan. Do not open `src/`, `tests/`, the branch diff, or `docs/design/` during the session. Use only the dashboard HTTP JSON, this plan, and `progress.md`.

One process per checkpoint. Seed 1847 each time. The seat is Mara Vane, `character-01`, `playerId` `prototype-player`. Do not pass another character. Stop the process, and confirm port 4317 is free, before the next `--reset`.

Issue no command the checkpoint does not name. Advance at most 144 ticks per call. This plan uses 1, then 2.

Omit `beforeSequence`, or leave it empty (`beforeSequence=` or a blank value). Both return the newest page. Do not send `beforeSequence=0`. That bound returns no events. Do not page backward. The stability figures are on the settlement rows of the newest page.

The readings below were taken on this tree through `GET /api/state?limit=200`, `POST /api/advance`, and `POST /api/commands`. A match is the campaign. A miss is not a new reading to write into this file during the session.

```text
npm run dashboard -- --reset --seed 1847
```

Bind `127.0.0.1:4317`.

## Hypothesis and ambition

**Milestone hypothesis:** A World Government rate above 0.15 lowers stability at Crown Harbor and Glassport on the peaceful upkeeps after the set. The drop is graded. 0.16 and 0.20 are one step, 0.21 and 0.25 are the next, and 0.26 and 0.30 are the one after that. A rate of 0.15 does not lower them. Free Tide stays at 0.08, and Verdant Cay and Cinder Key do not show a stability number on this seat.

**Player ambition:** Mara Vane, free holder of World Government, sets the tax above the line and reads the two ports she can see.

**Success signal:** At state tick 1 the rate is on the faction row and both ports still show the pre-drift stability. At state tick 3 Crown Harbor and Glassport show the band in the table below. Free Tide's rate, treasury, and power do not change.

## Setup

- Node `v24.21.0`. Seed 1847. Seat Mara Vane.
- `GET /api/health` is HTTP 200 `{"ok":true,"tick":0,"events":0}`.
- `GET /api/state?limit=200` and `GET /api/state?limit=200&beforeSequence=` are each HTTP 200. At tick 0 both have `eventPage.total` 0. `GET /api/state?limit=200&beforeSequence=0` is HTTP 200 with `events` length 0.
- `player.id` `prototype-player`. `player.characterId` `character-01`. `player.displayName` `Mara Vane`. `party.locationId` `crown-harbor`. `capabilities.commandTypes` includes `set-tax-rate`.

Opening rows, every checkpoint:

| Faction | taxRate | taxRateSetTick | treasury | power | commanderId | actingCommanderId |
| --- | ---: | --- | ---: | ---: | --- | --- |
| `free-tide`, Free Tide Compact | 0.08 | null | null (`treasuryNote` `not visible to you`) | null | `character-14` | null |
| `world-government`, World Government | 0.14 | null | 18000 | 2335.44 | `character-01` | null |

| Settlement | stability | battleInProgress | taxRate |
| --- | ---: | --- | ---: |
| `crown-harbor` | 91 | false | 0.14 |
| `glassport` | 86 | false | 0.14 |
| `verdant-cay` | null | false | 0 |
| `cinder-key` | null | false | 0.08 |

## Procedure

Each checkpoint is a fresh process.

1. `POST /api/commands` with `{"playerId":"prototype-player","type":"set-tax-rate","taxRate":<rate>}`. HTTP 202. `command.id` `command-00001`. `command.playerId` `prototype-player`. `command.issuedTick` 0. `command.type` `set-tax-rate`. `command.factionId` `world-government`. `command.taxRate` is the number in the table.
2. `GET /api/state?limit=200` before the advance. `tick` 0. `eventPage.total` 1. World Government `taxRate` is still 0.14, `taxRateSetTick` is still null, `treasury` is still 18000, `power` is still 2335.44. Sequence 1 is `player-command-accepted`, `tick` 0, `actorId` `character-01`, `targetId` `world-government`, `payloadWithheld` false. Summary `Command queued for Mara Vane: set tax rate to <percent>`.
3. `POST /api/advance` `{"ticks":1}`. HTTP 200. `tick` 1. `day` 0.17. `ticksAdvanced` 1. `eventSequence` 185.
4. `GET /api/state?limit=200`. Omit `beforeSequence`. `tick` 1. `day` 0.17. `eventPage.total` 185. `count` 185. `oldestSequence` 1. `newestSequence` 185. `hasMore` false. The same page comes back from `beforeSequence=` empty. `beforeSequence=0` comes back with `events` length 0 and `eventPage.count` 0.
5. World Government `taxRate` is the new rate, `taxRateSetTick` 0. Free Tide stays 0.08, `taxRateSetTick` null, `treasury` null, `power` null. Crown Harbor `stability` 90.03, `battleInProgress` true, `taxRate` the new rate. Glassport `stability` 86.03, `battleInProgress` false, `taxRate` the new rate. Verdant Cay and Cinder Key `stability` stay null.
6. Sequence 10: `type` `tax-rate-set`, `tick` 0, `actorId` `character-01`, `targetId` `world-government`, `payloadWithheld` false. `data.factionId` `world-government`. `data.previousTaxRate` 0.14. `data.taxRateSetTick` 0. `data.taxRate` is the new rate. Summary `Mara Vane set the World Government tax rate to <percent>.`
7. `POST /api/advance` `{"ticks":2}`. HTTP 200. `tick` 3. `day` 0.5. `ticksAdvanced` 2. `eventSequence` 362.
8. `GET /api/state?limit=200`. `tick` 3. `day` 0.5. `eventPage.total` 362. `count` 200. `oldestSequence` 163. `newestSequence` 362. `hasMore` true. Sequence 10 is older than this page. Do not follow it. Read stability on the settlement rows.
9. Crown Harbor and Glassport `battleInProgress` false. Their `taxRate` is still the new rate. World Government `taxRateSetTick` is still 0. Free Tide is unchanged. Verdant Cay and Cinder Key `stability` are still null.

Tick 1 stability is the same on every rate. The band is the tick 3 pair.

## Checkpoints

JSON writes 0.20 as `0.2` and 0.30 as `0.3`. Send either spelling. The body below is what the server returns.

| Checkpoint | Send | Returned `taxRate` | Percent | Tick 1 treasury | Tick 1 power | Tick 3 treasury | Tick 3 power | Tick 3 Crown Harbor | Tick 3 Glassport |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Threshold, no drift | 0.15 | 0.15 | 15% | 17947.25 | 2346.56 | 17898.79 | 2355.88 | 90.06 | 86.09 |
| First band, low edge | 0.16 | 0.16 | 16% | 17947.33 | 2346.56 | 17899.04 | 2355.88 | 90.03 | 86.03 |
| First band, high edge | 0.20 | 0.2 | 20% | 17947.66 | 2346.57 | 17900.05 | 2355.9 | 90.03 | 86.03 |
| Second band, low edge | 0.21 | 0.21 | 21% | 17947.75 | 2346.57 | 17900.31 | 2355.9 | 90 | 85.97 |
| Second band, high edge | 0.25 | 0.25 | 25% | 17948.08 | 2346.57 | 17901.32 | 2355.91 | 90 | 85.97 |
| Third band, low edge | 0.26 | 0.26 | 26% | 17948.16 | 2346.57 | 17901.57 | 2355.91 | 89.97 | 85.91 |
| Third band, high edge | 0.30 | 0.3 | 30% | 17948.49 | 2346.58 | 17902.58 | 2355.93 | 89.97 | 85.91 |

The six rows above 0.15 are the graded checkpoints. The 0.15 row is the line they sit against: Crown Harbor 90.06 and Glassport 86.09. One band holds Crown Harbor at 90.03 and Glassport at 86.03. Two bands leave 90 and 85.97. Three bands leave 89.97 and 85.91. The two edges of one band match each other.

### First band, 20%

`POST /api/commands` `{"playerId":"prototype-player","type":"set-tax-rate","taxRate":0.2}`. HTTP 202.

```json
{"ok":true,"command":{"id":"command-00001","playerId":"prototype-player","issuedTick":0,"type":"set-tax-rate","factionId":"world-government","taxRate":0.2}}
```

Before the advance, sequence 1 summary `Command queued for Mara Vane: set tax rate to 20%.` World Government `taxRate` 0.14.

After `{"ticks":1}`: World Government `taxRate` 0.2, `taxRateSetTick` 0, `treasury` 17947.66, `power` 2346.57. Crown Harbor `stability` 90.03, `battleInProgress` true. Glassport `stability` 86.03, `battleInProgress` false.

Sequence 10 summary `Mara Vane set the World Government tax rate to 20%.` `data.taxRate` 0.2. `data.previousTaxRate` 0.14. `data.taxRateSetTick` 0. `data.factionId` `world-government`.

After `{"ticks":2}`: `tick` 3, `day` 0.5, `eventSequence` 362, `eventPage.total` 362, `oldestSequence` 163, `newestSequence` 362, `hasMore` true. World Government `treasury` 17900.05, `power` 2355.9, `taxRate` 0.2, `taxRateSetTick` 0. Crown Harbor `stability` 90.03. Glassport `stability` 86.03. Both `battleInProgress` false. Free Tide `taxRate` 0.08, `treasury` null, `power` null.

The other six checkpoints use the same steps. Only the rate, the percent, the treasury, the power, and the tick 3 stability change, as the table says.

## Recommendation

`PROMOTE` when every checkpoint matches the table, tick 1 stability is 90.03 at Crown Harbor and 86.03 at Glassport on every rate, sequence 10 names the percent that was sent, Free Tide stays 0.08 with treasury and power null, and Verdant Cay and Cinder Key stability stay null.

`REVISE` when the set lands and Free Tide stays hidden, but a tick 3 stability, a treasury, or a summary differs.

`ABANDON` when a rate above 0.15 leaves tick 3 stability on the 0.15 figures, when 0.16 and 0.20 disagree, when 0.21 and 0.25 disagree, when 0.26 and 0.30 disagree, or when a rival treasury or power becomes a number.
