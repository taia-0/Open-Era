# Playtest plan: feed polish

This is the plan for a blind operator. It is not a completed session. Do not fill Session, Findings, or Verdict while writing the plan. Do not open `src/`, `tests/`, the branch diff, or `docs/design/` during the session. Use only the dashboard HTTP JSON, this plan, and `progress.md`.

One process at a time. Seed 1847 each time. The seat is Mara Vane, `character-01`, `playerId` `prototype-player`. Do not pass another character. Stop the process, and confirm port 4317 is free, before the next `--reset`.

Issue no command the checkpoints do not name. Advance at most 144 ticks per call. This plan uses 1.

## Session

Not run.

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

Not run.

## Verdict

Not run.

## Recommendation criteria

`PROMOTE` when every exact summary above matches, each named action has exactly one result line for `character-01`, that page has no `player-action-executed` and no `player-command-resolved` for her, the queued rest line and the traveling refusal match, an empty `beforeSequence=` and a blank `beforeSequence` return the same events as the omitted read, and `beforeSequence=0` returns none.

`REVISE` when the action still happens and a refusal still changes nothing the player asked for, but a summary, the number of result lines, or the empty cursor differs.

`ABANDON` when a named action has no result line, a buy or a sale omits `(hold now N)`, the refusal is dropped, or an empty `beforeSequence=` returns no events.
