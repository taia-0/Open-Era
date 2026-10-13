# Playtest plan: income levy

This is the plan for a blind operator. It is not a completed session. Do not fill Session, Findings, or Verdict while writing or running the plan. Do not open `src/`, `tests/`, the branch diff, or `docs/design/` during the session. Use only the dashboard HTTP JSON.

One process. Seed 1847. Mara Vane stays the viewer. She works once at Crown Harbor, then sells 2 arms there. Both credits land in the World Government treasury on the event that earned them.

## Setup

- Node `v24.21.0` (`nvm use 24.21.0` if `node -v` is not that). `npm ci` first if `node_modules` is missing.
- Branch `feature/income-levy`. Record `git rev-parse HEAD` before the first request. The readings below were taken on the tree this file ships with, parent `28928f665feb10b51feae639921eb2963e18703c`.
- One process. Stop any dashboard already bound to the port and confirm the port is free before the first `--reset`. Do not start a second seed.

```text
npm run dashboard -- --reset --seed 1847
```

- Bind `http://127.0.0.1:4317`.
- `GET /api/health` should be HTTP 200 `{"ok":true,"tick":0,"events":0}`.
- The player is already Mara Vane, `character-01`, `playerId` `prototype-player`. Do not pass another character.
- Read state with `GET /api/state?limit=200`. Omit `beforeSequence` on every read. An empty `beforeSequence=` is read as 0 and the page comes back empty.
- The `events` array is newest first. Queue with `POST /api/commands`. Advance with `POST /api/advance` and body `{"ticks":1}`.
- The two orders run on the same process, in this order. A second `--reset` drops the work credit.

## Hypothesis and ambition

**Hypothesis.** While she stands at Crown Harbor, a sale quote carries `levyRate` 0.05 beside the faction `taxRate` 0.14. Her work and her sale each pay both, taken from her, and the event's `factionTreasury` rises by that combined tax. The feed still says `Tax of X went to the treasury.` The buy path is not this session. Her purse is not the treasury.

**Ambition.** Read the Crown Harbor market and the World Government treasury at tick 0. Order work, advance one tick, and read her `worked` row beside the treasury. Order a sale of 2 arms, advance one tick, and read her `market-trade` row. The tax on each row is the faction rate plus 0.05, each rounded to a cent, then added.

**What you can see.** `market.levyRate` and `market.taxRate` at Crown Harbor. On her own `worked` row, `data.gross`, `data.tax`, `data.characterMoney`, and `data.factionTreasury`. On her own `market-trade` row, the same four plus `data.quantity` and `data.unitPrice`. The World Government `treasury` after each tick, which is lower than the event figure because later draws in that tick spend. Free Tide's treasury stays null. The sentence `Tax of X went to the treasury.`

## Characters

| Name | Id | What to watch |
| --- | --- | --- |
| Mara Vane | `character-01` | The viewer. World Government command holder, docked at Crown Harbor. Her work and her sale pay the levy. |

## Tick 0, before the order

`GET /api/health`. HTTP 200.

```json
{"ok":true,"tick":0,"events":0}
```

`GET /api/state?limit=200`. HTTP 200.

- `tick` 0. `day` 0. `commanderId` `character-01`.
- `player.id` `prototype-player`. `player.displayName` `Mara Vane`. `player.characterId` `character-01`.
- `eventPage` total 0. `hasMore` false. `oldestSequence` null. `newestSequence` null.

Mara Vane, `character-01`:

- `locationId` `crown-harbor`. `money` 108.
- `skills` strategy 72, leadership 77, navigation 38, trade 57.
- Cargo: provisions 35.424, arms 3, medicine 4, ship materials 5.

Factions:

| Faction | taxRate | treasury |
| --- | ---: | --- |
| `free-tide`, Free Tide Compact | 0.08 | null, `treasuryNote` `not visible to you` |
| `world-government`, World Government | 0.14 | 18000 |

Crown Harbor `market`, the only market while she stands there:

- `levyRate` 0.05. `taxRate` 0.14. `taxAppliesTo` `sell`. `settlementId` `crown-harbor`.
- Keys: `expiresTick`, `levyRate`, `quotedTick`, `resources`, `settlementId`, `taxAppliesTo`, `taxRate`.

Verdant Cay, Cinder Key, and Glassport each have `market` null.

## The work

`POST /api/commands`

```json
{"playerId":"prototype-player","type":"character-action","action":"work"}
```

HTTP 202.

```json
{"ok":true,"command":{"id":"command-00001","playerId":"prototype-player","issuedTick":0,"type":"character-action","action":"work","source":"treasury"}}
```

`GET /api/state?limit=200` before the advance. `tick` 0. `eventPage.total` 1. World Government `treasury` is still 18000.

Sequence 1 summary:

`Command queued for Mara Vane: work at Crown Harbor (from the treasury)`

`POST /api/advance`

```json
{"ticks":1}
```

HTTP 200.

- `ok` true. `tick` 1. `day` 0.17. `ticksAdvanced` 1.
- `eventSequence` 186.

`GET /api/state?limit=200`. HTTP 200.

- `tick` 1. `day` 0.17.
- `eventPage` total 184, `oldestSequence` 1, `newestSequence` 186, `hasMore` false.

Sequence 11 is `worked`, actor `character-01`, settlement `crown-harbor`, tick 0. `payloadWithheld` false. Summary:

`Mara Vane worked at Crown Harbor. Tax of 3.83 went to the treasury.`

`data`:

- `gross` 20.15. `tax` 3.83. `characterMoney` 124.32. `factionTreasury` 18003.83.
- No `treasuryDrawn`.
- Keys include `characterMoney`, `factionTreasury`, `gross`, `leadership`, `morale`, `tax`, `trade`.

The 3.83 is `round(20.15 × 0.14, 2)` plus `round(20.15 × 0.05, 2)`: 2.82 + 1.01. The event treasury is the opening 18000 plus that 3.83. The credit is on this row, before later spending in the same tick.

After the tick, World Government `treasury` is 17951.41. `treasuryLine`:

`Tax income 5.41, spending 54, over the last 180 ticks.`

5.41 is her 3.83 plus another Crown Harbor trade in the same tick, `Tax of 1.58`. Free Tide stays `taxRate` 0.08 and `treasury` null.

## The sale

Still the same process, at tick 1. Crown Harbor arms: price 3.29, stock 153.22, `maxSell` 3. `market.levyRate` is still 0.05. World Government `treasury` is still 17951.41.

`POST /api/commands`

```json
{"playerId":"prototype-player","type":"character-action","action":"sell-resource","resource":"arms","quantity":2}
```

HTTP 202. `command.id` `command-00002`. `issuedTick` 1. `unitPrice` 3.29. `source` `treasury`.

`GET /api/state?limit=200` before the advance. Sequence 187 summary:

`Command queued for Mara Vane: sell-resource at Crown Harbor (from the treasury)`

`POST /api/advance`

```json
{"ticks":1}
```

HTTP 200.

- `ok` true. `tick` 2. `day` 0.33. `ticksAdvanced` 1.
- `eventSequence` 276.

`GET /api/state?limit=200`. HTTP 200.

- `tick` 2. `day` 0.33.
- `eventPage` count 200, total 272, `hasMore` true, `oldestSequence` 75, `newestSequence` 276.
- The tick-0 work row has scrolled off this page. It was sequence 11 at tick 1.

Sequence 195 is `market-trade`, actor `character-01`, settlement `crown-harbor`, tick 1. `payloadWithheld` false. Summary:

`Mara Vane sold 2 arms at Crown Harbor (hold now 1). Tax of 1.25 went to the treasury.`

`data`:

- `direction` `sold`. `resource` `arms`. `quantity` 2. `unitPrice` 3.29.
- `gross` 6.58. `tax` 1.25. `characterMoney` 129.65. `factionTreasury` 17952.66.

The 1.25 is `round(6.58 × 0.14, 2)` plus `round(6.58 × 0.05, 2)`: 0.92 + 0.33. The event treasury is the treasury at the moment of the sale, 17951.41, plus that 1.25.

After the tick, World Government `treasury` is 17931.88. `treasuryLine`:

`Tax income 9.88, spending 78, over the last 180 ticks.`

Mara's `money` is 129.65. Her arms cargo is 1. Passage and upkeep in the same tick also move the hold: provisions are 34.848. Sequence 201 is her upkeep.

Stop this process. Confirm the port is free.

## Session

Blind operator. Not filled. One process. Seed 1847. Viewer Mara Vane, `character-01`, `playerId` `prototype-player`. Record the HEAD you started from. The only commands are the work order and then the sale of 2 arms. Omit `beforeSequence` on every read. Stop the process after the tick-2 state read.
