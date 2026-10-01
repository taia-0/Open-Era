# Playtest plan: treasury wording

This is the plan for a blind operator. It is not a completed session. Do not fill Session, Findings, or Verdict while writing the plan. Do not open `src/`, `tests/`, the branch diff, or `docs/design/` during the session. Use only the dashboard HTTP JSON, this plan, and `progress.md`.

Three processes, one at a time. Seed 1847 each time. The seat is Mara Vane. Do not pass another character. Stop each process, and confirm port 4317 is free, before the next `--reset`.

The readings below were taken on this tree through `GET /api/state`, `POST /api/advance`, and `POST /api/commands` before the session. The operator confirms them. A match is the campaign. A miss is not a new reading to write into this file during the session.

A recruit that draws the treasury is one sentence. It is not also the draw sentence. Seed 1847 sequence 26, read by Mara, is the example: `Sable Morrow recruited 8 at Glassport for 96: 18 from the treasury and 78 from the purse.`

## Setup

- Node `v24.21.0` (`nvm use 24.21.0` if `node -v` is not that). `npm ci` first if `node_modules` is missing.
- Branch `fix/treasury-wording`. Record `git rev-parse HEAD` before the first request.
- One process. `npm run dashboard -- --reset --seed 1847 --host 127.0.0.1 --port 4317`. Do not start a second dashboard.
- `GET /api/health` should be HTTP 200 `{"ok":true,"tick":0,"events":0}`.
- The player is Mara Vane, `character-01`, `playerId` `prototype-player`. Do not pass another character.
- Read state with `GET /api/state?limit=200`. Omit `beforeSequence` on the first read of a checkpoint. The `events` array is newest-first. If the sequence you need is below `eventPage.oldestSequence`, the fallback is `GET /api/state?limit=200&beforeSequence=<cursor>`.
- Advance with `POST /api/advance`. Body `{"ticks":N}`. `N` is an integer from 1 to 144.
- Commands are `POST /api/commands`. Send only the two bodies in the later processes.
- Do not pass the event log into anything other than these HTTP calls.

## Hypothesis and ambition

**Hypothesis.** After one tick with no command, sequence 26 names Sable's count and both payers in one sentence, and the payload stays withheld. Her remainder is 0 and the note is `cap used`. A factionless recruit on the same page does not name a count or a cost. On a fresh world, Mara's recruit with `source` `"purse"` queues `Command queued for Mara Vane: recruit at Crown Harbor (from the purse)` and then reads `Mara Vane recruited 8 at Crown Harbor for 96 from the purse.` On a third world, omitting `source` queues the treasury line and the recruit reads `from the treasury`.

**Ambition.** Read sequence 26 and Sable's note. Read one factionless recruit. Then, on two reset worlds, recruit from the purse and from the treasury, and read the queued summary and the recruit line.

## Checkpoint 1 — sequence 26 and the spent cap, state tick 1

No command. `POST /api/advance` `{"ticks":1}`. HTTP 200. `ticksAdvanced` 1. `attentionUpdated` false. `tick` 1. `day` 0.17.

`GET /api/state?limit=200`. State `tick` 1. State `day` 0.17. `eventPage.total` 182. `oldestSequence` 1. `newestSequence` 182. Sequence 26 is on this page.

Sequence 26:

- `type` `recruited`
- `tick` 0
- `actorId` `character-04`
- `settlementId` `glassport`
- `payloadWithheld` true
- `data` null

Summary, exact:

`Sable Morrow recruited 8 at Glassport for 96: 18 from the treasury and 78 from the purse.`

Sable Morrow, `character-04`:

- `money` 182
- `allowanceCap` 18
- `allowanceRemaining` 0
- `allowanceNote` `cap used`
- `allowanceUncapped` false
- `allowanceRole` `member`

Mara's `money` is still 108. `allowanceCap` is still `no cap`. `allowanceNote` null.

`world-government` `treasury` is 17947.16. `treasuryNote` null.

## Checkpoint 2 — a withheld recruit with no count and no cost

On the same page:

- Sequence 174, `recruited`, `actorId` `character-29`, `payloadWithheld` true, `data` null. Summary `Orin Frost recruited at Crown Harbor.`
- Sequence 154, `recruited`, `actorId` `character-25`, `payloadWithheld` true, `data` null. Summary `Jun Ash recruited at Crown Harbor.`

Neither summary contains `8`, `96`, `18`, or `78`.

Stop this process. Confirm port 4317 is free.

## Checkpoint 3 — recruit from the purse

`npm run dashboard -- --reset --seed 1847 --host 127.0.0.1 --port 4317`. `GET /api/health` is tick 0, events 0.

`POST /api/commands`

```json
{"playerId":"prototype-player","type":"character-action","action":"recruit","source":"purse"}
```

HTTP 202. `command.id` `command-00001`. `command.action` `recruit`. `command.source` `purse`.

`GET /api/state?limit=200` before the advance. Still `tick` 0. `eventPage.total` 1.

Sequence 1 summary, exact:

`Command queued for Mara Vane: recruit at Crown Harbor (from the purse)`

`payloadWithheld` false. `data.command.action` `recruit`. `data.command.source` `purse`.

`POST /api/advance` `{"ticks":1}`. HTTP 200. `tick` 1. `day` 0.17.

`GET /api/state?limit=200`.

Mara Vane:

- `money` 12
- `troops.count` 88
- `allowanceCap` `no cap`
- `allowanceRemaining` null
- `allowanceNote` null

`world-government` `treasury` is 17947.16. That is the same treasury as checkpoint 1. Her 96 did not leave the treasury.

Sequence 11:

- `type` `recruited`
- `actorId` `character-01`
- `payloadWithheld` false
- `data.quantity` 8
- `data.cost` 96
- `data.treasuryDrawn` 0
- `data.purseDrawn` 96
- `data.characterMoney` 12
- `data.troopCount` 88

Summary, exact:

`Mara Vane recruited 8 at Crown Harbor for 96 from the purse.`

Sequence 1 is still `Command queued for Mara Vane: recruit at Crown Harbor (from the purse)`.

Stop this process. Confirm port 4317 is free.

## Checkpoint 4 — recruit from the treasury

`npm run dashboard -- --reset --seed 1847 --host 127.0.0.1 --port 4317`. Health is tick 0, events 0.

`POST /api/commands`

```json
{"playerId":"prototype-player","type":"character-action","action":"recruit"}
```

HTTP 202. `command.source` `treasury`. The free holder echoes that when the request omits it.

`GET /api/state?limit=200` before the advance. Sequence 1 summary, exact:

`Command queued for Mara Vane: recruit at Crown Harbor (from the treasury)`

`POST /api/advance` `{"ticks":1}`. HTTP 200. `tick` 1.

Mara's `money` is still 108. `troops.count` is 88. `allowanceCap` is still `no cap`.

`world-government` `treasury` is 17851.16. That is 96 under the no-command tick.

Sequence 11 summary, exact:

`Mara Vane recruited 8 at Crown Harbor for 96 from the treasury.`

`payloadWithheld` false. `data.quantity` 8. `data.cost` 96. `data.treasuryDrawn` 96. `data.purseDrawn` 0. `data.characterMoney` 108.

## Criteria

`PROMOTE` when every checkpoint matches: sequence 26 is `Sable Morrow recruited 8 at Glassport for 96: 18 from the treasury and 78 from the purse.` with `data` null; Sable's remainder is 0 and her note is `cap used`; sequences 174 and 154 name no count and no cost; the purse command is HTTP 202 and its queued summary is `Command queued for Mara Vane: recruit at Crown Harbor (from the purse)`; sequence 11 on that world is `Mara Vane recruited 8 at Crown Harbor for 96 from the purse.` with money 12, troops 88, and treasury 17947.16; the omitted-source command echoes `treasury`, queues `Command queued for Mara Vane: recruit at Crown Harbor (from the treasury)`, and sequence 11 is `Mara Vane recruited 8 at Crown Harbor for 96 from the treasury.` with money 108 and treasury 17851.16.

`REVISE` when a listed sentence is present but wrong, when sequence 26 still says `their` or drops the count, when Sable's note is blank at remainder 0, when a factionless recruit names a count or a cost, when the queued line omits the order, or when the purse recruit and the treasury recruit use the same payer.

`ABANDON` when sequence 26 is not Sable Morrow's recruit, when either recruit command is not HTTP 202, or when the world tick after the one-tick advance is not 1.

## Session

Blind operator. Head before the first request: `e2d314d928246b072ea543ddd09400ba0db2c9d5`. Node `v24.21.0`. Seed 1847. Seat Mara Vane (`character-01`, `playerId` `prototype-player`). No other character. Three processes, one at a time. No commands except the two bodies in checkpoints 3 and 4.

### Checkpoint 1 — sequence 26 and the spent cap, state tick 1

`GET /api/health` HTTP 200 `{"ok":true,"tick":0,"events":0}`.

`POST /api/advance` `{"ticks":1}` HTTP 200. `ticksAdvanced` 1. `attentionUpdated` false. `tick` 1. `day` 0.17.

`GET /api/state?limit=200`. State `tick` 1. State `day` 0.17. `eventPage.total` 182. `oldestSequence` 1. `newestSequence` 182. Sequence 26 is on this page.

Sequence 26:

- `type` `recruited`
- `tick` 0
- `actorId` `character-04`
- `settlementId` `glassport`
- `payloadWithheld` true
- `data` null

Summary, exact:

`Sable Morrow recruited 8 at Glassport for 96: 18 from the treasury and 78 from the purse.`

Sable Morrow, `character-04`:

- `money` 182
- `allowanceCap` 18
- `allowanceRemaining` 0
- `allowanceNote` `cap used`
- `allowanceUncapped` false
- `allowanceRole` `member`

Mara's `money` is 108. `allowanceCap` is `no cap`. `allowanceNote` null.

`world-government` `treasury` is 17947.16. `treasuryNote` null.

### Checkpoint 2 — a withheld recruit with no count and no cost

On the same page:

- Sequence 174, `recruited`, `actorId` `character-29`, `payloadWithheld` true, `data` null. Summary `Orin Frost recruited at Crown Harbor.`
- Sequence 154, `recruited`, `actorId` `character-25`, `payloadWithheld` true, `data` null. Summary `Jun Ash recruited at Crown Harbor.`

Neither summary contains `8`, `96`, `18`, or `78`.

Process stopped. Port 4317 free.

### Checkpoint 3 — recruit from the purse

Fresh process. `GET /api/health` `{"ok":true,"tick":0,"events":0}`.

`POST /api/commands` `{"playerId":"prototype-player","type":"character-action","action":"recruit","source":"purse"}` HTTP 202. `command.id` `command-00001`. `command.action` `recruit`. `command.source` `purse`.

`GET /api/state?limit=200` before the advance. `tick` 0. `eventPage.total` 1.

Sequence 1 summary, exact:

`Command queued for Mara Vane: recruit at Crown Harbor (from the purse)`

`payloadWithheld` false. `data.command.action` `recruit`. `data.command.source` `purse`.

`POST /api/advance` `{"ticks":1}` HTTP 200. `tick` 1. `day` 0.17.

`GET /api/state?limit=200`.

Mara Vane:

- `money` 12
- `troops.count` 88
- `allowanceCap` `no cap`
- `allowanceRemaining` null
- `allowanceNote` null

`world-government` `treasury` is 17947.16.

Sequence 11:

- `type` `recruited`
- `actorId` `character-01`
- `payloadWithheld` false
- `data.quantity` 8
- `data.cost` 96
- `data.treasuryDrawn` 0
- `data.purseDrawn` 96
- `data.characterMoney` 12
- `data.troopCount` 88

Summary, exact:

`Mara Vane recruited 8 at Crown Harbor for 96 from the purse.`

Sequence 1 is still `Command queued for Mara Vane: recruit at Crown Harbor (from the purse)`.

Process stopped. Port 4317 free.

### Checkpoint 4 — recruit from the treasury

Fresh process. Health `{"ok":true,"tick":0,"events":0}`.

`POST /api/commands` `{"playerId":"prototype-player","type":"character-action","action":"recruit"}` HTTP 202. `command.source` `treasury`.

`GET /api/state?limit=200` before the advance. Sequence 1 summary, exact:

`Command queued for Mara Vane: recruit at Crown Harbor (from the treasury)`

`POST /api/advance` `{"ticks":1}` HTTP 200. `tick` 1.

Mara's `money` is 108. `troops.count` is 88. `allowanceCap` is `no cap`.

`world-government` `treasury` is 17851.16.

Sequence 11 summary, exact:

`Mara Vane recruited 8 at Crown Harbor for 96 from the treasury.`

`payloadWithheld` false. `data.quantity` 8. `data.cost` 96. `data.treasuryDrawn` 96. `data.purseDrawn` 0. `data.characterMoney` 108.

## Findings

Every listed reading matched. Sequence 26 is one sentence naming the count and both payers, and `data` is null. Sable's remainder is 0 and the note is `cap used`. The two factionless recruits name no count and no cost. The purse command is HTTP 202, the queued line names the purse, and the recruit line says she paid from the purse, with money 12, troops 88, and treasury 17947.16. Omitting `source` echoes `treasury`, the queued line names the treasury, and the recruit line says she paid from the treasury, with money 108 and treasury 17851.16. The two recruits do not use the same payer.

## Verdict

PROMOTE
