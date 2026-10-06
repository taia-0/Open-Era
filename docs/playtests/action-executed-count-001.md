# Playtest plan: action executed count

This is the plan for a blind operator. It is not a completed session. Do not fill Session, Findings, or Verdict while writing the plan. Do not open `src/`, `tests/`, the branch diff, or `docs/design/` during the session. Use only the dashboard HTTP JSON, this plan, and `progress.md`.

Three processes, one at a time. Seed 1847 each time. The seat is Mara Vane. Do not pass another character. Stop each process, and confirm port 4317 is free, before the next `--reset`.

The readings below were taken on this tree through `GET /api/state`, `POST /api/advance`, and `POST /api/commands` before the session. The operator confirms them. A match is the campaign. A miss is not a new reading to write into this file during the session.

The recruit sentence and the executed line both stay. They name the same count and the same payer. The resolved line stays `Mara Vane: action executed` and does not repeat the count.

## Session

Blind operator. Read this plan and `progress.md` only. Did not open `src/`, `tests/`, the branch diff, or `docs/design/`.

Before the first request, `git rev-parse HEAD` was `afe7c6d141664be0e5ea1b77741235441e9a0a83`. Node `v24.21.0`. Seed 1847. Seat Mara Vane, `character-01`, `playerId` `prototype-player`. Three processes, one at a time. Each process was stopped, and port 4317 was free, before the next `--reset`.

### Checkpoint 1 — recruit from the purse

`GET /api/health` HTTP 200 `{"ok":true,"tick":0,"events":0}`.

`POST /api/commands` with `{"playerId":"prototype-player","type":"character-action","action":"recruit","source":"purse"}`. HTTP 202. `command.id` `command-00001`. `command.action` `recruit`. `command.source` `purse`.

`GET /api/state?limit=200` before the advance. `tick` 0. `day` 0. `eventPage.total` 1. `oldestSequence` 1. `newestSequence` 1.

Sequence 1: `type` `player-command-accepted`, `actorId` `character-01`, `payloadWithheld` false. Summary `Command queued for Mara Vane: recruit at Crown Harbor (from the purse)`.

`POST /api/advance` `{"ticks":1}`. HTTP 200. `ticksAdvanced` 1. `attentionUpdated` false. `combatUpdated` false. `pausedForBattle` false. `tick` 1. `day` 0.17. `eventSequence` 186.

`GET /api/state?limit=200`. State `tick` 1. State `day` 0.17. `eventPage.total` 186. `oldestSequence` 1. `newestSequence` 186. Sequences 1, 10, 11, and 12 were on this page.

Mara Vane, `character-01`: `money` 12, `troops.count` 88, `allowanceCap` `no cap`, `allowanceRemaining` null, `allowanceNote` null.

`world-government` `treasury` 17947.16.

Sequence 10: `type` `player-action-executed`, `tick` 0, `actorId` `character-01`, `settlementId` `crown-harbor`, `payloadWithheld` false, `data.commandId` `command-00001`, `data.action` `recruit`. Summary `Mara Vane: recruited 8 at Crown Harbor for 96 from the purse`.

Sequence 11: `type` `recruited`, `tick` 0, `actorId` `character-01`, `settlementId` `crown-harbor`, `payloadWithheld` false, `data.quantity` 8, `data.cost` 96, `data.treasuryDrawn` 0, `data.purseDrawn` 96, `data.characterMoney` 12, `data.troopCount` 88. Summary `Mara Vane recruited 8 at Crown Harbor for 96 from the purse.`

Sequence 12: `type` `player-command-resolved`, `actorId` `character-01`, `payloadWithheld` false, `data.outcome` `action-executed`, `data.action` `recruit`. Summary `Mara Vane: action executed`.

Sequence 1 was still `Command queued for Mara Vane: recruit at Crown Harbor (from the purse)`. The executed line and the recruit line name 8, 96, and the purse. The resolved line does not name a count.

### Checkpoint 2 — a withheld row with no count and no cost

Same page as checkpoint 1.

Sequence 158, `recruited`, `actorId` `character-25`, `payloadWithheld` true, `data` null. Summary `Jun Ash recruited at Crown Harbor.`

Sequence 178, `recruited`, `actorId` `character-29`, `payloadWithheld` true, `data` null. Summary `Orin Frost recruited at Crown Harbor.`

Neither summary contains `8`, `96`, `18`, or `78`. `character-25` and `character-29` have `factionId` null. There is one `player-action-executed` on the page, sequence 10, and its `payloadWithheld` is false.

Sable Morrow, sequence 30, `actorId` `character-04`. Summary `Sable Morrow recruited 8 at Glassport for 96: 18 from the treasury and 78 from the purse.` `data` null.

Stopped this process. Port 4317 was free.

### Checkpoint 3 — recruit from the treasury

`npm run dashboard -- --reset --seed 1847 --host 127.0.0.1 --port 4317`. `GET /api/health` HTTP 200 `{"ok":true,"tick":0,"events":0}`.

`POST /api/commands` with `{"playerId":"prototype-player","type":"character-action","action":"recruit"}`. HTTP 202. `command.source` `treasury`.

`GET /api/state?limit=200` before the advance. `eventPage.total` 1. Sequence 1 summary `Command queued for Mara Vane: recruit at Crown Harbor (from the treasury)`.

`POST /api/advance` `{"ticks":1}`. HTTP 200. `tick` 1. `day` 0.17. `ticksAdvanced` 1. `attentionUpdated` false. `eventSequence` 186.

`GET /api/state?limit=200`. `eventPage.total` 186.

Mara's `money` 108. `troops.count` 88. `allowanceCap` `no cap`. `allowanceNote` null.

`world-government` `treasury` 17851.16.

Sequence 10 summary `Mara Vane: recruited 8 at Crown Harbor for 96 from the treasury`. `payloadWithheld` false. `data.action` `recruit`.

Sequence 11 summary `Mara Vane recruited 8 at Crown Harbor for 96 from the treasury.` `payloadWithheld` false. `data.quantity` 8. `data.cost` 96. `data.treasuryDrawn` 96. `data.purseDrawn` 0. `data.characterMoney` 108.

Sequence 12 summary `Mara Vane: action executed`.

Stopped this process. Port 4317 was free.

### Checkpoint 4 — a provision buy

`npm run dashboard -- --reset --seed 1847 --host 127.0.0.1 --port 4317`. `GET /api/health` HTTP 200 `{"ok":true,"tick":0,"events":0}`.

`POST /api/commands` with `{"playerId":"prototype-player","type":"character-action","action":"buy-provisions","source":"purse"}`. HTTP 202. `command.action` `buy-provisions`. `command.quantity` 12. `command.unitPrice` 1.47. `command.gross` 17.64. `command.source` `purse`.

`GET /api/state?limit=200` before the advance. Sequence 1 summary `Command queued for Mara Vane: 12 provisions at 1.47 each, 17.64 total`.

`POST /api/advance` `{"ticks":1}`. HTTP 200. `tick` 1. `day` 0.17. `ticksAdvanced` 1. `eventSequence` 186.

`GET /api/state?limit=200`. `eventPage.total` 186. Mara's `money` 90.36.

Sequence 10 summary `Mara Vane: bought 12 provisions at Crown Harbor for 17.64 from the purse`. `payloadWithheld` false. `data.action` `buy-provisions`.

Sequence 11, `market-trade`, summary `Mara Vane bought 12 provisions at Crown Harbor for 17.64 (1.47 each).` `data.quantity` 12. `data.gross` 17.64. `data.unitPrice` 1.47. `data.purseDrawn` 17.64. `data.treasuryDrawn` 0.

Sequence 12 summary `Mara Vane bought 12 provisions for 17.64 (1.47 each)`.

The hold's provisions after the tick are 47.424.

Stopped this process. Port 4317 was free.

## Hypothesis and ambition

**Hypothesis.** On seed 1847, Mara's purse recruit queues `Command queued for Mara Vane: recruit at Crown Harbor (from the purse)`, then the executed line is `Mara Vane: recruited 8 at Crown Harbor for 96 from the purse`, and the recruit line is `Mara Vane recruited 8 at Crown Harbor for 96 from the purse.` A fresh world with no `source` uses the treasury in those same three places. A provision buy names 12 provisions and 17.64 from the purse on the executed line. Two factionless recruits on the purse world's page name no count and no cost.

**Ambition.** Read the queued line, the executed line, and the recruit line for a purse recruit and a treasury recruit. Read one provision buy. Read two withheld recruits that must not name a count.

## Setup

- Node `v24.21.0` (`nvm use 24.21.0` if `node -v` is not that). `npm ci` first if `node_modules` is missing.
- Branch `fix/action-executed-count`. Record `git rev-parse HEAD` before the first request.
- One process. `npm run dashboard -- --reset --seed 1847 --host 127.0.0.1 --port 4317`. Do not start a second dashboard.
- `GET /api/health` should be HTTP 200 `{"ok":true,"tick":0,"events":0}`.
- The player is Mara Vane, `character-01`, `playerId` `prototype-player`. Do not pass another character.
- Read state with `GET /api/state?limit=200`. Omit `beforeSequence` on the first read of a checkpoint. The `events` array is newest-first. If the sequence you need is below `eventPage.oldestSequence`, the fallback is `GET /api/state?limit=200&beforeSequence=<cursor>`.
- Advance with `POST /api/advance`. Body `{"ticks":1}`.
- Commands are `POST /api/commands`. Send only the three bodies in the checkpoints.
- Do not pass the event log into anything other than these HTTP calls.

## Checkpoint 1 — recruit from the purse

`GET /api/health` is tick 0, events 0.

`POST /api/commands`

```json
{"playerId":"prototype-player","type":"character-action","action":"recruit","source":"purse"}
```

HTTP 202. `command.id` `command-00001`. `command.action` `recruit`. `command.source` `purse`.

`GET /api/state?limit=200` before the advance. `tick` 0. `day` 0. `eventPage.total` 1. `oldestSequence` 1. `newestSequence` 1.

Sequence 1:

- `type` `player-command-accepted`
- `actorId` `character-01`
- `payloadWithheld` false

Summary, exact:

`Command queued for Mara Vane: recruit at Crown Harbor (from the purse)`

`POST /api/advance` `{"ticks":1}`. HTTP 200. `ticksAdvanced` 1. `attentionUpdated` false. `combatUpdated` false. `pausedForBattle` false. `tick` 1. `day` 0.17. `eventSequence` 186.

`GET /api/state?limit=200`. State `tick` 1. State `day` 0.17. `eventPage.total` 186. `oldestSequence` 1. `newestSequence` 186. Sequences 1, 10, 11, and 12 are on this page.

Mara Vane, `character-01`:

- `money` 12
- `troops.count` 88
- `allowanceCap` `no cap`
- `allowanceRemaining` null
- `allowanceNote` null

`world-government` `treasury` is 17947.16.

Sequence 10:

- `type` `player-action-executed`
- `tick` 0
- `actorId` `character-01`
- `settlementId` `crown-harbor`
- `payloadWithheld` false
- `data.commandId` `command-00001`
- `data.action` `recruit`

Summary, exact:

`Mara Vane: recruited 8 at Crown Harbor for 96 from the purse`

Sequence 11:

- `type` `recruited`
- `tick` 0
- `actorId` `character-01`
- `settlementId` `crown-harbor`
- `payloadWithheld` false
- `data.quantity` 8
- `data.cost` 96
- `data.treasuryDrawn` 0
- `data.purseDrawn` 96
- `data.characterMoney` 12
- `data.troopCount` 88

Summary, exact:

`Mara Vane recruited 8 at Crown Harbor for 96 from the purse.`

Sequence 12:

- `type` `player-command-resolved`
- `actorId` `character-01`
- `payloadWithheld` false
- `data.outcome` `action-executed`
- `data.action` `recruit`

Summary, exact:

`Mara Vane: action executed`

Sequence 1 is still the queued line above. The executed line and the recruit line name 8, 96, and the purse. The resolved line does not name a count.

## Checkpoint 2 — a withheld row with no count and no cost

On the same page as checkpoint 1:

- Sequence 158, `recruited`, `actorId` `character-25`, `payloadWithheld` true, `data` null. Summary `Jun Ash recruited at Crown Harbor.`
- Sequence 178, `recruited`, `actorId` `character-29`, `payloadWithheld` true, `data` null. Summary `Orin Frost recruited at Crown Harbor.`

Neither summary contains `8`, `96`, `18`, or `78`. Both are factionless. There is one `player-action-executed` on the page, sequence 10, and its `payloadWithheld` is false.

Sable Morrow, sequence 30, is a different row. Her summary is `Sable Morrow recruited 8 at Glassport for 96: 18 from the treasury and 78 from the purse.` and `data` is null. That count is the recruit sentence already on an own-faction treasury draw. It is not the check for this checkpoint.

Stop this process. Confirm port 4317 is free.

## Checkpoint 3 — recruit from the treasury

`npm run dashboard -- --reset --seed 1847 --host 127.0.0.1 --port 4317`. `GET /api/health` is tick 0, events 0.

`POST /api/commands`

```json
{"playerId":"prototype-player","type":"character-action","action":"recruit"}
```

HTTP 202. `command.source` `treasury`.

`GET /api/state?limit=200` before the advance. `eventPage.total` 1.

Sequence 1 summary, exact:

`Command queued for Mara Vane: recruit at Crown Harbor (from the treasury)`

`POST /api/advance` `{"ticks":1}`. HTTP 200. `tick` 1. `day` 0.17. `ticksAdvanced` 1. `attentionUpdated` false. `eventSequence` 186.

`GET /api/state?limit=200`. `eventPage.total` 186.

Mara's `money` is 108. `troops.count` is 88. `allowanceCap` is `no cap`. `allowanceNote` is null.

`world-government` `treasury` is 17851.16.

Sequence 10 summary, exact:

`Mara Vane: recruited 8 at Crown Harbor for 96 from the treasury`

`payloadWithheld` false. `data.action` `recruit`.

Sequence 11 summary, exact:

`Mara Vane recruited 8 at Crown Harbor for 96 from the treasury.`

`payloadWithheld` false. `data.quantity` 8. `data.cost` 96. `data.treasuryDrawn` 96. `data.purseDrawn` 0. `data.characterMoney` 108.

Sequence 12 summary stays `Mara Vane: action executed`.

Stop this process. Confirm port 4317 is free.

## Checkpoint 4 — a provision buy

`npm run dashboard -- --reset --seed 1847 --host 127.0.0.1 --port 4317`. `GET /api/health` is tick 0, events 0.

`POST /api/commands`

```json
{"playerId":"prototype-player","type":"character-action","action":"buy-provisions","source":"purse"}
```

HTTP 202. `command.action` `buy-provisions`. `command.quantity` 12. `command.unitPrice` 1.47. `command.gross` 17.64. `command.source` `purse`.

`GET /api/state?limit=200` before the advance. Sequence 1 summary, exact:

`Command queued for Mara Vane: 12 provisions at 1.47 each, 17.64 total`

`POST /api/advance` `{"ticks":1}`. HTTP 200. `tick` 1. `day` 0.17. `ticksAdvanced` 1. `eventSequence` 186.

`GET /api/state?limit=200`. `eventPage.total` 186. Mara's `money` is 90.36.

Sequence 10 summary, exact:

`Mara Vane: bought 12 provisions at Crown Harbor for 17.64 from the purse`

`payloadWithheld` false. `data.action` `buy-provisions`.

Sequence 11, `market-trade`, summary exact:

`Mara Vane bought 12 provisions at Crown Harbor for 17.64 (1.47 each).`

`data.quantity` 12. `data.gross` 17.64. `data.unitPrice` 1.47. `data.purseDrawn` 17.64. `data.treasuryDrawn` 0.

Sequence 12 summary, exact:

`Mara Vane bought 12 provisions for 17.64 (1.47 each)`

The hold's provisions after the tick are 47.424. That is the hold after the rest of the tick, not the 12 on the executed line.

Stop this process. Confirm port 4317 is free.

## Criteria

`PROMOTE` when every summary in checkpoints 1, 3, and 4 matches, including the payer, and checkpoint 2's two factionless summaries still omit the count and the cost. The executed line and the recruit line must agree on 8 and 96, and on which purse paid.

`REVISE` when a listed summary, sequence, payer, or withheld flag disagrees, or when sequence 158 or 178 names a count or a cost.

`ABANDON` when the executed line is absent, when it contradicts the recruit line, or when a factionless recruit on that page names a count or a cost.

## Findings

Every summary in checkpoints 1, 3, and 4 matched, including the payer. The executed line and the recruit line agree on 8 and 96. The purse recruit names the purse on both lines (`purseDrawn` 96, `treasuryDrawn` 0). The treasury recruit names the treasury on both lines (`treasuryDrawn` 96, `purseDrawn` 0). The provision buy names 12 and 17.64 from the purse on the executed line, and sequence 11 names the same quantity, gross, and unit price.

Checkpoint 2's two factionless summaries omit the count and the cost. Sequence 158 is `Jun Ash recruited at Crown Harbor.` Sequence 178 is `Orin Frost recruited at Crown Harbor.` Both have `payloadWithheld` true and `data` null. Neither summary contains `8`, `96`, `18`, or `78`. One `player-action-executed` is on that page, sequence 10, and it is not withheld.

The recruit resolved line stays `Mara Vane: action executed` and does not repeat the count. No listed summary, sequence, payer, or withheld flag disagreed. The executed line is present and does not contradict the recruit line. No factionless recruit on that page names a count or a cost.

## Verdict

PROMOTE
