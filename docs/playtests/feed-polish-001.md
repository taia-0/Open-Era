# Playtest plan: feed polish

This is the plan for a blind operator. It is not a completed session. Do not fill Session, Findings, or Verdict while writing the plan. Do not open `src/`, `tests/`, the branch diff, or `docs/design/` during the session. Use only the dashboard HTTP JSON, this plan, and `progress.md`.

One process at a time. Seed 1847 each time. The seat is Mara Vane, `character-01`, `playerId` `prototype-player`. Do not pass another character. Stop the process, and confirm port 4317 is free, before the next `--reset`.

Issue no command the checkpoints do not name. Advance at most 144 ticks per call. This plan uses 1.

## Session

Blind operator. Read this plan and `progress.md` only. Did not open `src/`, `tests/`, the branch diff, or `docs/design/`.

Before the first request, `git rev-parse HEAD` was `f1f718575f28fca4ee01d78e7f8bf2e486871fbe`. Node `v24.21.0`. Seed 1847. Seat Mara Vane, `character-01`, `playerId` `prototype-player`. `player.displayName` `Mara Vane`. Eight processes, one at a time. Each process was stopped, and port 4317 was free, before the next `--reset`.

### Checkpoint 1 — an empty beforeSequence returns events

No command. `POST /api/advance` `{"ticks":1}`. HTTP 200. `tick` 1. `day` 0.17. `ticksAdvanced` 1. `eventSequence` 182. `attentionUpdated` false. `combatUpdated` false. `pausedForBattle` false.

`GET /api/state?limit=200`, `GET /api/state?limit=200&beforeSequence=`, and `GET /api/state?limit=200&beforeSequence=%20` were each HTTP 200. Each `events` length was 182. The three sequence lists were identical, newest-first, from 182 down to 1. Each `eventPage.count` was 182, `total` 182, `oldestSequence` 1, `newestSequence` 182, `hasMore` false.

`GET /api/state?limit=200&beforeSequence=0` was HTTP 200. `events` length 0. `eventPage.count` 0, `total` 182, `oldestSequence` null, `newestSequence` null, `hasMore` false.

Stopped this process. Port 4317 was free.

### Checkpoint 2 — set a tax rate, one result line

`GET /api/health` HTTP 200 `{"ok":true,"tick":0,"events":0}`.

`POST /api/commands` `{"playerId":"prototype-player","type":"set-tax-rate","taxRate":0.12}`. HTTP 202. Body `{"ok":true,"command":{"id":"command-00001","playerId":"prototype-player","issuedTick":0,"type":"set-tax-rate","factionId":"world-government","taxRate":0.12}}`.

`GET /api/state?limit=200` before the advance. `tick` 0. `day` 0. `eventPage.total` 1. `count` 1. `oldestSequence` 1. `newestSequence` 1.

Sequence 1: `type` `player-command-accepted`, `tick` 0, `actorId` `character-01`, `targetId` `world-government`, `payloadWithheld` false. Summary `Command queued for Mara Vane: set tax rate to 12%`.

`POST /api/advance` `{"ticks":1}`. HTTP 200. `tick` 1. `day` 0.17. `ticksAdvanced` 1. `eventSequence` 185.

`GET /api/state?limit=200`. `tick` 1. `day` 0.17. `eventPage.total` 185. `count` 185. `oldestSequence` 1. `newestSequence` 185. `hasMore` false. The `events` array held 184 rows. Sequence 11 was not in the array.

`character-01` rows:

- Sequence 12, `character-upkeep`, summary `Mara Vane's upkeep was recorded.`
- Sequence 10, `tax-rate-set`, `tick` 0, `payloadWithheld` false. Summary `Mara Vane set the World Government tax rate to 12%.`
- Sequence 1, `player-command-accepted`. Summary `Command queued for Mara Vane: set tax rate to 12%`.

Among her rows whose type or summary contains `tax`, the only one is sequence 10. No `character-01` row is `player-action-executed` or `player-command-resolved`. No summary is `Mara Vane: tax rate set`.

Stopped this process. Port 4317 was free.

### Checkpoint 3 — buy provisions, one line ending with the hold

`GET /api/health` HTTP 200 `{"ok":true,"tick":0,"events":0}`.

`POST /api/commands` `{"playerId":"prototype-player","type":"character-action","action":"buy-provisions","source":"purse"}`. HTTP 202. Body `{"ok":true,"command":{"id":"command-00001","playerId":"prototype-player","issuedTick":0,"type":"character-action","action":"buy-provisions","resource":"provisions","quantity":12,"unitPrice":1.47,"gross":17.64,"source":"purse"}}`.

`GET /api/state?limit=200` before the advance. Sequence 1 summary `Command queued for Mara Vane: 12 provisions at 1.47 each, 17.64 total`.

`POST /api/advance` `{"ticks":1}`. HTTP 200. `tick` 1. `day` 0.17. `ticksAdvanced` 1. `eventSequence` 186.

`GET /api/state?limit=200`. `eventPage.total` 186. `count` 186. `oldestSequence` 1. `newestSequence` 186. `hasMore` false. The array held 184 rows. Sequences 10 and 12 were not in the array.

`character-01` has one `market-trade`, sequence 11, `tick` 0, `payloadWithheld` false. Summary `Mara Vane bought 12 provisions at Crown Harbor for 17.64 from the purse (hold now 47.42).`

Her other rows are sequence 13 `Mara Vane's upkeep was recorded.` and sequence 1, the queued line above. No `character-01` row is `player-action-executed` or `player-command-resolved`.

Stopped this process. Port 4317 was free.

### Checkpoint 4 — sell, the hold suffix and the tax clause

`GET /api/health` HTTP 200 `{"ok":true,"tick":0,"events":0}`.

`POST /api/commands` `{"playerId":"prototype-player","type":"character-action","action":"sell-resource","resource":"arms","quantity":2,"source":"purse"}`. HTTP 202. Body `{"ok":true,"command":{"id":"command-00001","playerId":"prototype-player","issuedTick":0,"type":"character-action","action":"sell-resource","resource":"arms","quantity":2,"unitPrice":3.25,"source":"purse"}}`.

`POST /api/advance` `{"ticks":1}`. HTTP 200. `tick` 1. `day` 0.17. `ticksAdvanced` 1. `eventSequence` 186.

`GET /api/state?limit=200`. `eventPage.total` 186. `count` 186. The array held 184 rows. Sequences 10 and 12 were absent.

`character-01` has one `market-trade`, sequence 11. Summary `Mara Vane sold 2 arms at Crown Harbor (hold now 1). Tax of 0.91 went to the treasury.`

Sequence 1 summary `Command queued for Mara Vane: sell-resource at Crown Harbor (from the purse)`. Sequence 13 summary `Mara Vane's upkeep was recorded.` No `character-01` row is `player-action-executed` or `player-command-resolved`.

Stopped this process. Port 4317 was free.

### Checkpoint 5 — recruit, one line

`GET /api/health` HTTP 200 `{"ok":true,"tick":0,"events":0}`.

`POST /api/commands` `{"playerId":"prototype-player","type":"character-action","action":"recruit","source":"purse"}`. HTTP 202. Body `{"ok":true,"command":{"id":"command-00001","playerId":"prototype-player","issuedTick":0,"type":"character-action","action":"recruit","source":"purse"}}`.

`POST /api/advance` `{"ticks":1}`. HTTP 200. `tick` 1. `day` 0.17. `ticksAdvanced` 1. `eventSequence` 186.

`GET /api/state?limit=200`. `eventPage.total` 186. `count` 186. The array held 184 rows. Sequences 10 and 12 were absent.

Among `character-01` rows whose summary contains `recruit`, there is one result line. Sequence 11, `type` `recruited`. Summary `Mara Vane recruited 8 at Crown Harbor for 96 from the purse.`

Sequence 1 summary `Command queued for Mara Vane: recruit at Crown Harbor (from the purse)`. No `character-01` row is `player-action-executed` or `player-command-resolved`.

Stopped this process. Port 4317 was free.

### Checkpoint 6 — work, one line

`GET /api/health` HTTP 200 `{"ok":true,"tick":0,"events":0}`.

`POST /api/commands` `{"playerId":"prototype-player","type":"character-action","action":"work"}`. HTTP 202. Body `{"ok":true,"command":{"id":"command-00001","playerId":"prototype-player","issuedTick":0,"type":"character-action","action":"work","source":"treasury"}}`.

`POST /api/advance` `{"ticks":1}`. HTTP 200. `tick` 1. `day` 0.17. `ticksAdvanced` 1. `eventSequence` 186.

`GET /api/state?limit=200`. `eventPage.total` 186. `count` 186. The array held 184 rows. Sequences 10 and 12 were absent.

`character-01` has one `worked` event, sequence 11. Summary `Mara Vane worked at Crown Harbor. Tax of 2.82 went to the treasury.`

Sequence 1 summary `Command queued for Mara Vane: work at Crown Harbor (from the treasury)`. No `character-01` row is `player-action-executed` or `player-command-resolved`.

Stopped this process. Port 4317 was free.

### Checkpoint 7 — rest, one line, and the queued line unchanged

`GET /api/health` HTTP 200 `{"ok":true,"tick":0,"events":0}`.

`POST /api/commands` `{"playerId":"prototype-player","type":"character-action","action":"rest"}`. HTTP 202. Body `{"ok":true,"command":{"id":"command-00001","playerId":"prototype-player","issuedTick":0,"type":"character-action","action":"rest","source":"treasury"}}`.

`GET /api/state?limit=200` before the advance. `tick` 0. `eventPage.total` 1. `count` 1. The one event is sequence 1, `player-command-accepted`, `actorId` `character-01`. Summary `Command queued for Mara Vane: rest at Crown Harbor (from the treasury)`.

`POST /api/advance` `{"ticks":1}`. HTTP 200. `tick` 1. `day` 0.17. `ticksAdvanced` 1. `eventSequence` 186.

`GET /api/state?limit=200`. `eventPage.total` 186. `count` 186. The array held 184 rows. Sequences 10 and 12 were absent.

`character-01` has one `rested` event, sequence 11. Summary `Mara Vane rested at Crown Harbor.`

The queued line is still sequence 1. No `character-01` row is `player-action-executed` or `player-command-resolved`.

Stopped this process. Port 4317 was free.

### Checkpoint 8 — travel, one line, then a refusal unchanged

`GET /api/health` HTTP 200 `{"ok":true,"tick":0,"events":0}`.

`POST /api/commands` `{"playerId":"prototype-player","type":"character-action","action":"travel","targetId":"glassport"}`. HTTP 202. Body `{"ok":true,"command":{"id":"command-00001","playerId":"prototype-player","issuedTick":0,"type":"character-action","action":"travel","targetId":"glassport","source":"treasury"}}`.

`POST /api/advance` `{"ticks":1}`. HTTP 200. `tick` 1. `day` 0.17. `ticksAdvanced` 1. `eventSequence` 187.

`GET /api/state?limit=200`. `eventPage.total` 187. `count` 187. The array held 185 rows. Sequences 10 and 12 were absent.

`character-01` has one `travel-started`, sequence 11, `tick` 0, `payloadWithheld` false. Summary `Mara Vane departed for Glassport`.

Her other rows on this page: sequence 14 `Mara Vane continued toward Glassport.`, sequence 13 `Mara Vane paid 3 passage. 3 came from the treasury. 108 left.`, sequence 1 `Command queued for Mara Vane`. No `character-01` row is `player-action-executed` or `player-command-resolved`.

`POST /api/commands` `{"playerId":"prototype-player","type":"character-action","action":"rest"}`. HTTP 400.

```json
{"ok":false,"code":"character-traveling","error":"The character is already traveling"}
```

`GET /api/state?limit=200` after that refusal. `tick` still 1. `eventPage.total` still 187. No new `player-command-accepted`. No `player-command-failed`.

The plan then expected HTTP 202 and a feed line. This call was not 202, so that line was not produced. One further `POST /api/advance` `{"ticks":1}` was sent anyway. HTTP 200. `tick` 2. `day` 0.33. `ticksAdvanced` 1. `eventSequence` 274. `GET /api/state?limit=200` at tick 2: `eventPage.total` 274, `count` 200, `oldestSequence` 75, `newestSequence` 274, `hasMore` true. `character-01` rows on that page are sequence 199 `Mara Vane continued toward Glassport.` and sequence 198 `Mara Vane paid 3 passage. 3 came from the treasury. 108 left.` There is no `player-command-failed`, no new `rested`, and no `player-command-resolved`.

The expected refusal summary `Mara Vane's command failed: controlled character cannot act while traveling` was not returned.

Stopped this process. Port 4317 was free.

## Hypothesis and ambition

**Milestone hypothesis:** Each player action leaves one result sentence in the feed. A tax set, a provision buy, a sale, a recruit, work, rest, and travel do not also keep `player-action-executed` or `player-command-resolved`. A buy and a sale end with the live hold. A sale also keeps its tax clause. The queued accept line and the refusal line stay as they were. `GET /api/state` with an empty `beforeSequence=` returns events.

**Player ambition:** Mara Vane, at Crown Harbor on seed 1847, sets the tax rate once, buys provisions, sells arms, recruits, works, rests, and sails. She also queues a rest and is refused a rest while already underway.

**Success signal:** The feed shows the one result sentence named in each checkpoint, the queued rest line and the traveling refusal are unchanged, and an empty `beforeSequence=` returns the same events as a read that omits the parameter.

## Setup

- Node `v24.21.0` (`nvm install 24.21.0 && nvm use 24.21.0` if `node -v` is not that). `npm ci` first if `node_modules` is missing.
- Branch `feature/feed-polish`. Record `git rev-parse HEAD` before the first request.
- One process. `npm run dashboard -- --reset --seed 1847`. It serves on `127.0.0.1:4317`. Do not start a second dashboard.
- `GET /api/health` should be HTTP 200 `{"ok":true,"tick":0,"events":0}`.
- The player is Mara Vane, `character-01`, `playerId` `prototype-player`. Do not pass another character.
- Read state with `GET /api/state?limit=200`. The `events` array is newest-first. Count a result only when `actorId` is `character-01`.
- Advance with `POST /api/advance`. Body `{"ticks":1}`.
- Commands are `POST /api/commands`. Send only the bodies in the checkpoints.
- Do not pass the event log into anything other than these HTTP calls.

A result line is one event for `character-01` whose `type` is the result type below. `player-action-executed` and `player-command-resolved` for that command are not result lines. They must be absent for `character-01` on that resolution page. Other captains' rows are not this check.

## Checkpoint 1 — an empty beforeSequence returns events

No command. `POST /api/advance` `{"ticks":1}`. HTTP 200. `ticksAdvanced` 1.

Then three reads. The first omits `beforeSequence`. The second sends it empty. The third sends a blank.

- `GET /api/state?limit=200`
- `GET /api/state?limit=200&beforeSequence=`
- `GET /api/state?limit=200&beforeSequence=%20`

Each is HTTP 200. Each `events` array has a length greater than 0. The empty read and the blank read list the same `sequence` values, in the same order, as the omitted read. `eventPage.count` matches across the three.

`GET /api/state?limit=200&beforeSequence=0` is HTTP 200. `events` length is 0. `beforeSequence=0` is still a bound.

Stop this process. Confirm port 4317 is free.

## Checkpoint 2 — set a tax rate, one result line

`npm run dashboard -- --reset --seed 1847`. `GET /api/health` is tick 0, events 0.

`POST /api/commands`

```json
{"playerId":"prototype-player","type":"set-tax-rate","taxRate":0.12}
```

HTTP 202.

`GET /api/state?limit=200` before the advance. `tick` 0. `eventPage.total` 1. The one event is `player-command-accepted`, `actorId` `character-01`, `payloadWithheld` false. Summary, exact:

`Command queued for Mara Vane: set tax rate to 12%`

`POST /api/advance` `{"ticks":1}`. HTTP 200.

`GET /api/state?limit=200`. Among `character-01` events whose `type` or summary contains `tax`, there is exactly one result line:

- `type` `tax-rate-set`
- `actorId` `character-01`
- `payloadWithheld` false

Summary, exact:

`Mara Vane set the World Government tax rate to 12%.`

There is no `character-01` event `player-action-executed`. There is no `character-01` event `player-command-resolved`. There is no summary `Mara Vane: tax rate set`. The queued line above is still present.

Stop this process. Confirm port 4317 is free.

## Checkpoint 3 — buy provisions, one line ending with the hold

`npm run dashboard -- --reset --seed 1847`. `GET /api/health` is tick 0, events 0.

`POST /api/commands`

```json
{"playerId":"prototype-player","type":"character-action","action":"buy-provisions","source":"purse"}
```

HTTP 202.

`GET /api/state?limit=200` before the advance. Sequence 1 summary, exact:

`Command queued for Mara Vane: 12 provisions at 1.47 each, 17.64 total`

`POST /api/advance` `{"ticks":1}`. HTTP 200.

`GET /api/state?limit=200`. `character-01` has exactly one `market-trade` on this page. Summary, exact, and it ends with the hold suffix:

`Mara Vane bought 12 provisions at Crown Harbor for 17.64 from the purse (hold now 47.42).`

No `character-01` event is `player-action-executed` or `player-command-resolved`.

Stop this process. Confirm port 4317 is free.

## Checkpoint 4 — sell, the hold suffix and the tax clause

`npm run dashboard -- --reset --seed 1847`. `GET /api/health` is tick 0, events 0.

`POST /api/commands`

```json
{"playerId":"prototype-player","type":"character-action","action":"sell-resource","resource":"arms","quantity":2,"source":"purse"}
```

HTTP 202.

`POST /api/advance` `{"ticks":1}`. HTTP 200.

`GET /api/state?limit=200`. `character-01` has exactly one `market-trade` on this page. Summary, exact:

`Mara Vane sold 2 arms at Crown Harbor (hold now 1). Tax of 0.91 went to the treasury.`

The summary contains `(hold now 1)` and `Tax of 0.91 went to the treasury.` No `character-01` event is `player-action-executed` or `player-command-resolved`.

Stop this process. Confirm port 4317 is free.

## Checkpoint 5 — recruit, one line

`npm run dashboard -- --reset --seed 1847`. `GET /api/health` is tick 0, events 0.

`POST /api/commands`

```json
{"playerId":"prototype-player","type":"character-action","action":"recruit","source":"purse"}
```

HTTP 202.

`POST /api/advance` `{"ticks":1}`. HTTP 200.

`GET /api/state?limit=200`. Among `character-01` events whose summary contains `recruit`, there is exactly one result line. `type` `recruited`. Summary, exact:

`Mara Vane recruited 8 at Crown Harbor for 96 from the purse.`

No `character-01` event is `player-action-executed` or `player-command-resolved`.

Stop this process. Confirm port 4317 is free.

## Checkpoint 6 — work, one line

`npm run dashboard -- --reset --seed 1847`. `GET /api/health` is tick 0, events 0.

`POST /api/commands`

```json
{"playerId":"prototype-player","type":"character-action","action":"work"}
```

HTTP 202.

`POST /api/advance` `{"ticks":1}`. HTTP 200.

`GET /api/state?limit=200`. `character-01` has exactly one `worked` event. Summary, exact:

`Mara Vane worked at Crown Harbor. Tax of 2.82 went to the treasury.`

No `character-01` event is `player-action-executed` or `player-command-resolved`.

Stop this process. Confirm port 4317 is free.

## Checkpoint 7 — rest, one line, and the queued line unchanged

`npm run dashboard -- --reset --seed 1847`. `GET /api/health` is tick 0, events 0.

`POST /api/commands`

```json
{"playerId":"prototype-player","type":"character-action","action":"rest"}
```

HTTP 202.

`GET /api/state?limit=200` before the advance. `tick` 0. `eventPage.total` 1. The one event is `player-command-accepted`, `actorId` `character-01`. Summary, exact:

`Command queued for Mara Vane: rest at Crown Harbor (from the treasury)`

`POST /api/advance` `{"ticks":1}`. HTTP 200.

`GET /api/state?limit=200`. `character-01` has exactly one `rested` event. Summary, exact:

`Mara Vane rested at Crown Harbor.`

The queued line above is still present. No `character-01` event is `player-action-executed` or `player-command-resolved`.

Stop this process. Confirm port 4317 is free.

## Checkpoint 8 — travel, one line, then a refusal unchanged

`npm run dashboard -- --reset --seed 1847`. `GET /api/health` is tick 0, events 0.

`POST /api/commands`

```json
{"playerId":"prototype-player","type":"character-action","action":"travel","targetId":"glassport"}
```

HTTP 202.

`POST /api/advance` `{"ticks":1}`. HTTP 200.

`GET /api/state?limit=200`. `character-01` has exactly one `travel-started` event. Summary, exact:

`Mara Vane departed for Glassport`

No `character-01` event is `player-action-executed` or `player-command-resolved`.

She is underway. `POST /api/commands`

```json
{"playerId":"prototype-player","type":"character-action","action":"rest"}
```

HTTP 202. `GET /api/state?limit=200` before the next advance. Record the new `player-command-accepted` summary verbatim.

`POST /api/advance` `{"ticks":1}`. HTTP 200.

`GET /api/state?limit=200`. `character-01` has one `player-command-failed` from this rest. Summary, exact:

`Mara Vane's command failed: controlled character cannot act while traveling`

There is no new `character-01` `rested` event on this tick. There is no `character-01` `player-command-resolved`.

Stop this process. Confirm port 4317 is free.

## Findings

Checkpoints 1 through 7 matched, and the travel result in checkpoint 8 matched. The traveling refusal did not.

The empty `beforeSequence=` and the blank `beforeSequence` returned the same 182 events as the read that omitted the parameter. `beforeSequence=0` returned none.

Each named action left one result sentence for Mara, and the queued rest line was `Command queued for Mara Vane: rest at Crown Harbor (from the treasury)`. The tax confirmation did not keep `Mara Vane: tax rate set`. The buy ends with `(hold now 47.42)`. The sale ends with `(hold now 1)` and `Tax of 0.91 went to the treasury.`

On every resolution page, `eventPage.count` and `eventPage.total` still count sequences that are missing from `events`. After the tax set, sequence 11 is missing and the array length is 184 against `count` 185. After buy, sell, recruit, work, and rest, sequences 10 and 12 are missing and the array length is 184 against `count` 186. Those missing rows are not `player-action-executed` or `player-command-resolved` in the response. The result sentence is present.

The rest issued while Mara was already sailing was HTTP 400 `character-traveling`, `The character is already traveling`. It wrote no event. The feed sentence `Mara Vane's command failed: controlled character cannot act while traveling` did not appear.

Player notes, as a first-time player:

- I set the tax to 12%. The feed said the command was queued, and the next tick had one line: I set the World Government tax rate to 12%.
- I bought 12 provisions. The line said the purse paid 17.64 and the hold is now 47.42.
- I sold 2 arms. The line said the hold is now 1, and tax of 0.91 went to the treasury.
- Recruiting was one line: 8 at Crown Harbor for 96 from the purse.
- Work was one line, and it said tax of 2.82 went to the treasury.
- Rest queued as rest at Crown Harbor from the treasury, then the feed said I rested at Crown Harbor.
- Sailing said I departed for Glassport. The queued line only said the command was queued. It did not name the port.
- I tried to rest while already sailing. The answer was immediate: the character is already traveling. The feed did not grow a failure line.

## Verdict

**REVISE.** The tax set, the provision buy, the arms sale, the recruit, the work, the rest, and the departure each showed the one result sentence this plan names. The queued rest line matched. An empty `beforeSequence=` returned events, and `beforeSequence=0` returned none. The rest while traveling did not. It was refused at submit with `character-traveling` and never produced `Mara Vane's command failed: controlled character cannot act while traveling`.

## Recommendation criteria

`PROMOTE` when every exact summary above matches, each named action has exactly one result line for `character-01`, that page has no `player-action-executed` and no `player-command-resolved` for her, the queued rest line and the traveling refusal match, an empty `beforeSequence=` and a blank `beforeSequence` return the same events as the omitted read, and `beforeSequence=0` returns none.

`REVISE` when the action still happens and a refusal still changes nothing the player asked for, but a summary, the number of result lines, or the empty cursor differs.

`ABANDON` when a named action has no result line, a buy or a sale omits `(hold now N)`, the refusal is dropped, or an empty `beforeSequence=` returns no events.
