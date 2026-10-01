# Playtest plan: treasury source

This is the plan for a blind operator. It is not a completed session. Do not fill Session, Findings, or Verdict while writing the plan. Do not open `src/`, `tests/`, the branch diff, or `docs/design/` during the session. Use only the dashboard HTTP JSON, this plan, and `progress.md`.

Two processes, one at a time. Seed 1847 both times. The seat is Mara Vane. Do not pass another character.

The first process sends no commands. It reads the draw sentence, the allowance labels, the officer at sea, and the rival rows. Stop that process before the second starts. The second process is a fresh `--reset`. It is the only process that posts commands.

The readings below were taken on this tree through `GET /api/state`, `POST /api/advance`, and `POST /api/commands` before the session. The operator confirms them. A match is the campaign. A miss is not a new reading to write into this file during the session.

Own-faction money at sea stays null. That item was stopped. A party under way is not directly observed, so the purse is not on the card. The campaign is that Sable's `money` at tick 6 is null, beside the allowance reset.

## Setup

- Node `v24.21.0` (`nvm use 24.21.0` if `node -v` is not that). `npm ci` first if `node_modules` is missing.
- Branch `feature/treasury-source`. Record `git rev-parse HEAD` before the first request.
- One process. `npm run dashboard -- --reset --seed 1847 --host 127.0.0.1 --port 4317`. Do not start a second dashboard. Stop the first process, and confirm the port is free, before the purse-command process.
- `GET /api/health` should be HTTP 200 `{"ok":true,"tick":0,"events":0}`.
- The player is Mara Vane, `character-01`, `playerId` `prototype-player`. Do not pass another character.
- Read state with `GET /api/state?limit=200`. Omit `beforeSequence` on the first read of a checkpoint. The `events` array is newest-first. If the sequence you need is below `eventPage.oldestSequence`, the fallback is `GET /api/state?limit=200&beforeSequence=<cursor>`.
- Advance with `POST /api/advance`. Body `{"ticks":N}`. `N` is an integer from 1 to 144.
- Commands are `POST /api/commands`. Send only the three bodies in the second process.
- An advance stops early when Mara is captured or released. Read `ticksAdvanced` and `tick`. Do not assume a request of 144 lands 144 ticks later.
- Do not pass the event log into anything other than these HTTP calls.

## Hypothesis and ambition

**Hypothesis.** Sable Morrow's tick-0 recruit, read at tick 1, says she drew 18 from the treasury and paid 78 from their purse. The payload stays withheld. At tick 0 a capped officer of World Government with no remainder reads `none spent today`, and Mara's cap reads `no cap`. At tick 6 Sable is at sea, the remainder is gone again, the note is `none spent today`, and her money stays null. A Free Tide row shows no allowance. Free Tide's treasury reads `not visible to you`. On a fresh world, Mara's recruit with `source` `"purse"` takes 96 from her purse, leaves the treasury on the same path as a tick with no command, and leaves her cap `no cap`.

**Ambition.** Read Sable at tick 0, sequence 26 at tick 1, and Sable again at tick 6. Read Pax, Mina, and the Free Tide treasury at tick 1. Then, on a reset world, refuse a bad source, recruit from the purse, and read the purse, the treasury, and the recruit event.

## Checkpoint 1 — labels before the spend, state tick 0

`GET /api/state?limit=200` before any advance. HTTP 200. `tick` 0. `day` 0. `eventPage.total` 0.

`capabilities.requests.commands.body.source` is this sentence:

`optional on character-action and offer-contract; "purse" pays the purse and skips the allowance. Omitted, the free command holder draws the treasury and a member draws the allowance, then the purse`

Sable Morrow, `character-04`:

- `locationId` `glassport`
- `money` 260
- `allowanceCap` 18
- `allowanceRemaining` is absent
- `allowanceUncapped` false
- `allowanceRole` `member`
- `allowanceOnDayBoundary` true
- `allowanceDayStart` 0
- `allowanceResetsOnTick` 6
- `allowanceNote` `none spent today`

Bram Quill, `character-02`, is at `verdant-cay`. `money` is null. `allowanceCap` 18. `allowanceRemaining` is absent. `allowanceNote` `none spent today`.

Mara Vane, `character-01`:

- `money` 108
- `troops.count` 80
- `allowanceCap` `no cap`
- `allowanceRemaining` null
- `allowanceUncapped` true
- `allowanceRole` `holder`
- `allowanceNote` null

Pax Ash, `character-14`, is at `crown-harbor` with Mara, so `money` is 247. `allowanceCap`, `allowanceRemaining`, `allowanceUncapped`, `allowanceRole`, and `allowanceNote` are null.

Mina Vale, `character-15`: `money` null. The same five allowance fields are null.

Factions:

- `world-government` `treasury` 18000. `treasuryNote` null.
- `free-tide` `treasury` null. `treasuryNote` `not visible to you`.

## Checkpoint 2 — the purse part on the recruit card, state tick 1

`POST /api/advance` `{"ticks":1}`. HTTP 200. `ticksAdvanced` 1. `attentionUpdated` false. `tick` 1. `day` 0.17.

`GET /api/state?limit=200`. State `tick` 1. State `day` 0.17. `eventPage.total` 182. `oldestSequence` 1. `newestSequence` 182. Sequence 26 is on this page.

Sequence 26:

- `type` `recruited`
- `tick` 0
- `actorId` `character-04`
- `settlementId` `glassport`
- `payloadWithheld` true
- `data` null

Summary, exact:

`Sable Morrow drew 18 from the treasury and paid 78 from their purse.`

The clause says `their`. Characters have no pronoun on the card.

Sable Morrow after the tick:

- `money` 182
- `allowanceCap` 18
- `allowanceRemaining` 0
- `allowanceUncapped` false
- `allowanceRole` `member`
- `allowanceOnDayBoundary` false
- `allowanceDayStart` 0
- `allowanceResetsOnTick` 6
- `allowanceNote` null

Purse before is 260. Purse after is 182. The drop is 78. The sentence names 18 from the treasury and 78 from the purse. 18 plus 78 is the 96 quote. The payload does not carry the quote. The card does.

`world-government` `treasury` is 17947.16 after the tick, not 18000 minus only her 18. Other officers draw in the same tick. Her row is the one that isolates her 18. `treasuryNote` null.

Mara's `money` is still 108. `allowanceCap` is still `no cap`. `allowanceUncapped` true. `allowanceRole` `holder`. `allowanceRemaining` null.

## Checkpoint 3 — at sea over the day reset, state tick 6

From tick 1, `POST /api/advance` `{"ticks":5}`. HTTP 200. `ticksAdvanced` 5. `attentionUpdated` false. `tick` 6. `day` 1.

`GET /api/state?limit=200`. State `tick` 6. State `day` 1. `eventPage.total` 704.

Sable Morrow:

- `locationId` null
- `travel.fromId` `cinder-key`
- `travel.toId` `glassport`
- `travel.totalTicks` 2
- `travel.remainingTicks` 2
- `money` null
- `allowanceRemaining` is absent
- `allowanceCap` 18
- `allowanceUncapped` false
- `allowanceRole` `member`
- `allowanceOnDayBoundary` true
- `allowanceDayStart` 6
- `allowanceResetsOnTick` 12
- `allowanceNote` `none spent today`

The 0 did not carry. She is at sea, so `money` stays null. The reset on the card is the missing remainder and `none spent today`. Do not expect a purse figure beside it.

Mara: `money` 108. `allowanceCap` `no cap`. `allowanceRole` `holder`. `allowanceUncapped` true. `allowanceRemaining` null.

Bram Quill is in port at `cinder-key`, not at sea. `money` is still null. `allowanceNote` is `none spent today`. He is the in-port contrast: distance hides the purse, and the note still reads.

## Checkpoint 4 — rival reader, state tick 1

Use the tick-1 page from checkpoint 2. Do not advance again for this check.

Pax Ash, `character-14`:

- `money` 247
- `allowanceCap` null
- `allowanceRemaining` null
- `allowanceUncapped` null
- `allowanceRole` null
- `allowanceNote` null

`free-tide` `treasury` null. `treasuryNote` `not visible to you`.

Mina Vale, `character-15`, is Free Tide. Her allowance fields are null. Her tick-0 lines on this page do not say she drew from a treasury. Sequence 96, exact:

`Mina Vale departed for Glassport.`

`payloadWithheld` true. `data` null.

Stop this process. Do not post a command on it.

## Checkpoint 5 — purse command, fresh tick 0

Start one new process with the same `--reset --seed 1847` command. `GET /api/health` is HTTP 200 `{"ok":true,"tick":0,"events":0}`.

`GET /api/state?limit=200` before any command. HTTP 200. `tick` 0. `day` 0. `eventPage.total` 0.

Mara Vane:

- `money` 108
- `troops.count` 80
- `allowanceCap` `no cap`
- `allowanceRemaining` null
- `allowanceNote` null

`world-government` `treasury` 18000. `treasuryNote` null.

`free-tide` `treasury` null. `treasuryNote` `not visible to you`.

## Checkpoint 6 — refused source

`POST /api/commands`

```json
{"playerId":"prototype-player","type":"character-action","action":"recruit","source":"wallet"}
```

HTTP 400. Body, punctuation exact:

```json
{"ok":false,"code":"invalid-source","error":"source is \"purse\" or omitted; \"wallet\" was requested"}
```

`POST /api/commands`

```json
{"playerId":"prototype-player","type":"issue-order","characterId":"character-03","directive":"protect","targetId":"crown-harbor","source":"purse"}
```

HTTP 400. Body, punctuation exact:

```json
{"ok":false,"code":"invalid-source","error":"source is \"purse\" or omitted; \"purse\" was requested"}
```

`GET /api/state?limit=200`. Still `tick` 0. `eventPage.total` 0. Mara's `money` is still 108. The treasury is still 18000.

## Checkpoint 7 — recruit from the purse, state tick 1

`POST /api/commands`

```json
{"playerId":"prototype-player","type":"character-action","action":"recruit","source":"purse"}
```

HTTP 202. `command.id` `command-00001`. `command.action` `recruit`. `command.source` `purse`.

`GET /api/state?limit=200` before the advance. Still `tick` 0. Mara's `money` is still 108. `troops.count` is still 80. The treasury is still 18000. The accept event may already be on the page. Its `data.command.source` is `purse`. The summary is `Command queued for Mara Vane`.

`POST /api/advance` `{"ticks":1}`. HTTP 200. `ticksAdvanced` 1. `attentionUpdated` false. `tick` 1. `day` 0.17.

`GET /api/state?limit=200`. State `tick` 1. State `day` 0.17.

Mara Vane:

- `money` 12
- `troops.count` 88
- `allowanceCap` `no cap`
- `allowanceRemaining` null
- `allowanceNote` null
- `allowanceUncapped` true
- `allowanceRole` `holder`

108 minus 96 is 12. 80 plus 8 is 88. The cap did not become a number.

`world-government` `treasury` is 17947.16. That is the same treasury as checkpoint 2, the tick with no command. Her 96 did not leave the treasury. `treasuryNote` null.

`free-tide` `treasury` null. `treasuryNote` `not visible to you`.

Sequence 1:

- `type` `player-command-accepted`
- summary `Command queued for Mara Vane`
- `data.command.source` `purse`
- `data.command.action` `recruit`
- `data.command.id` `command-00001`

Sequence 11:

- `type` `recruited`
- `actorId` `character-01`
- `payloadWithheld` false
- `data.quantity` 8
- `data.cost` 96
- `data.characterMoney` 12
- `data.troopCount` 88
- `data.treasuryDrawn` 0
- `data.purseDrawn` 96

Summary, exact:

`Mara Vane recruited at Crown Harbor.`

Her own recruit is the visible line. It is not the withheld draw sentence. Sequence 26 on this world is not the checkpoint. The purse share is on sequence 11's `data`.

Sequence 12:

- `type` `player-command-resolved`
- summary `Mara Vane: action executed`

## Criteria

`PROMOTE` when every checkpoint matches: sequence 26 is `Sable Morrow drew 18 from the treasury and paid 78 from their purse.` with `data` null; tick 0 Sable's note is `none spent today` and Mara's cap is `no cap`; tick 6 Sable's remainder is absent, her note is `none spent today`, and her `money` is null; Pax's allowance stays null; Free Tide reads `not visible to you`; Mina's departure line has no treasury draw; the two bad sources are HTTP 400 `invalid-source` with the errors above; Mara's purse recruit leaves her at money 12 and troops 88, `treasuryDrawn` 0, `purseDrawn` 96, cap still `no cap`, and the treasury at 17947.16.

`REVISE` when a listed field or sentence is present but wrong, when sequence 26 omits the purse clause or names a pronoun other than `their`, when `allowanceRemaining` is still 0 at tick 6, when it is present at tick 0, when Sable's `money` at tick 6 is a number, when Mara's cap is null or a number, when the purse recruit moves her money by anything other than 96 or moves the treasury off 17947.16, or when Pax or Mina shows a cap, a remainder, or a Free Tide number.

`ABANDON` when sequence 26 is not Sable Morrow's recruit, when her purse does not move from 260 to 182 on the first process, when the purse command is not HTTP 202, or when the world tick after the first advance of either process is not 1.

## Session

HEAD before the first request: `7725c0bf57a7de02d5c5c0a8f30fb835ec2397d3`. Node `v24.21.0`. Seed `1847`. Seat Mara Vane, `character-01`, `playerId` `prototype-player`. Two processes, one at a time. The first sent no commands. It was stopped, and port `4317` was free, before the second `--reset`.

### Process 1 — no commands

`GET /api/health` HTTP 200 `{"ok":true,"tick":0,"events":0}`.

**Checkpoint 1.** `GET /api/state?limit=200` HTTP 200. `tick` 0. `day` 0. `eventPage.total` 0.

`capabilities.requests.commands.body.source`:

`optional on character-action and offer-contract; "purse" pays the purse and skips the allowance. Omitted, the free command holder draws the treasury and a member draws the allowance, then the purse`

Sable Morrow, `character-04`: `locationId` `glassport`, `money` 260, `allowanceCap` 18, `allowanceRemaining` absent, `allowanceUncapped` false, `allowanceRole` `member`, `allowanceOnDayBoundary` true, `allowanceDayStart` 0, `allowanceResetsOnTick` 6, `allowanceNote` `none spent today`.

Bram Quill, `character-02`: `locationId` `verdant-cay`, `money` null, `allowanceCap` 18, `allowanceRemaining` absent, `allowanceNote` `none spent today`.

Mara Vane, `character-01`: `money` 108, `troops.count` 80, `allowanceCap` `no cap`, `allowanceRemaining` null, `allowanceUncapped` true, `allowanceRole` `holder`, `allowanceNote` null.

Pax Ash, `character-14`: `locationId` `crown-harbor`, `money` 247. `allowanceCap`, `allowanceRemaining`, `allowanceUncapped`, `allowanceRole`, and `allowanceNote` are null.

Mina Vale, `character-15`: `money` null. The same five allowance fields are null.

`world-government` `treasury` 18000, `treasuryNote` null. `free-tide` `treasury` null, `treasuryNote` `not visible to you`.

**Checkpoint 2.** `POST /api/advance` `{"ticks":1}` HTTP 200. `ticksAdvanced` 1. `attentionUpdated` false. `tick` 1. `day` 0.17.

`GET /api/state?limit=200`. `tick` 1. `day` 0.17. `eventPage.total` 182. `oldestSequence` 1. `newestSequence` 182.

Sequence 26: `type` `recruited`, `tick` 0, `actorId` `character-04`, `settlementId` `glassport`, `payloadWithheld` true, `data` null. Summary:

`Sable Morrow drew 18 from the treasury and paid 78 from their purse.`

Sable after the tick: `money` 182, `allowanceCap` 18, `allowanceRemaining` 0, `allowanceUncapped` false, `allowanceRole` `member`, `allowanceOnDayBoundary` false, `allowanceDayStart` 0, `allowanceResetsOnTick` 6, `allowanceNote` null.

`world-government` `treasury` 17947.16, `treasuryNote` null.

Mara: `money` 108, `allowanceCap` `no cap`, `allowanceUncapped` true, `allowanceRole` `holder`, `allowanceRemaining` null.

**Checkpoint 3.** From tick 1, `POST /api/advance` `{"ticks":5}` HTTP 200. `ticksAdvanced` 5. `attentionUpdated` false. `tick` 6. `day` 1.

`GET /api/state?limit=200`. `tick` 6. `day` 1. `eventPage.total` 704.

Sable Morrow: `locationId` null, `travel.fromId` `cinder-key`, `travel.toId` `glassport`, `travel.totalTicks` 2, `travel.remainingTicks` 2, `money` null, `allowanceRemaining` absent, `allowanceCap` 18, `allowanceUncapped` false, `allowanceRole` `member`, `allowanceOnDayBoundary` true, `allowanceDayStart` 6, `allowanceResetsOnTick` 12, `allowanceNote` `none spent today`.

Mara: `money` 108, `allowanceCap` `no cap`, `allowanceRole` `holder`, `allowanceUncapped` true, `allowanceRemaining` null.

Bram Quill: `locationId` `cinder-key`, `travel` null, `money` null, `allowanceNote` `none spent today`.

**Checkpoint 4.** Tick-1 page, no further advance.

Pax Ash: `money` 247. `allowanceCap`, `allowanceRemaining`, `allowanceUncapped`, `allowanceRole`, and `allowanceNote` are null.

`free-tide` `treasury` null, `treasuryNote` `not visible to you`.

Mina Vale: the five allowance fields are null. Sequence 96, exact: `Mina Vale departed for Glassport.` `payloadWithheld` true. `data` null. Her other tick-0 lines on that page do not say she drew from a treasury.

Process stopped. No command posted.

### Process 2 — purse command, fresh `--reset --seed 1847`

`GET /api/health` HTTP 200 `{"ok":true,"tick":0,"events":0}`.

**Checkpoint 5.** `GET /api/state?limit=200` HTTP 200. `tick` 0. `day` 0. `eventPage.total` 0.

Mara: `money` 108, `troops.count` 80, `allowanceCap` `no cap`, `allowanceRemaining` null, `allowanceNote` null.

`world-government` `treasury` 18000, `treasuryNote` null. `free-tide` `treasury` null, `treasuryNote` `not visible to you`.

**Checkpoint 6.**

`POST /api/commands` `{"playerId":"prototype-player","type":"character-action","action":"recruit","source":"wallet"}` HTTP 400:

`{"ok":false,"code":"invalid-source","error":"source is \"purse\" or omitted; \"wallet\" was requested"}`

`POST /api/commands` `{"playerId":"prototype-player","type":"issue-order","characterId":"character-03","directive":"protect","targetId":"crown-harbor","source":"purse"}` HTTP 400:

`{"ok":false,"code":"invalid-source","error":"source is \"purse\" or omitted; \"purse\" was requested"}`

`GET /api/state?limit=200`. `tick` 0. `eventPage.total` 0. Mara `money` 108. `world-government` `treasury` 18000.

**Checkpoint 7.**

`POST /api/commands` `{"playerId":"prototype-player","type":"character-action","action":"recruit","source":"purse"}` HTTP 202. `command.id` `command-00001`. `command.action` `recruit`. `command.source` `purse`.

`GET /api/state?limit=200` before the advance. `tick` 0. Mara `money` 108. `troops.count` 80. `world-government` `treasury` 18000. Sequence 1 is already on the page: `type` `player-command-accepted`, summary `Command queued for Mara Vane`, `data.command.source` `purse`, `data.command.action` `recruit`, `data.command.id` `command-00001`.

`POST /api/advance` `{"ticks":1}` HTTP 200. `ticksAdvanced` 1. `attentionUpdated` false. `tick` 1. `day` 0.17.

`GET /api/state?limit=200`. `tick` 1. `day` 0.17.

Mara: `money` 12, `troops.count` 88, `allowanceCap` `no cap`, `allowanceRemaining` null, `allowanceNote` null, `allowanceUncapped` true, `allowanceRole` `holder`.

`world-government` `treasury` 17947.16, `treasuryNote` null. `free-tide` `treasury` null, `treasuryNote` `not visible to you`.

Sequence 1: `type` `player-command-accepted`, summary `Command queued for Mara Vane`, `data.command.source` `purse`, `data.command.action` `recruit`, `data.command.id` `command-00001`.

Sequence 11: `type` `recruited`, `actorId` `character-01`, `payloadWithheld` false, `data.quantity` 8, `data.cost` 96, `data.characterMoney` 12, `data.troopCount` 88, `data.treasuryDrawn` 0, `data.purseDrawn` 96. Summary:

`Mara Vane recruited at Crown Harbor.`

Sequence 12: `type` `player-command-resolved`, summary `Mara Vane: action executed`.

## Findings

Every checkpoint matched the listed sentences and values. Sequence 26 is Sable Morrow's recruit, the purse clause uses `their`, and `data` is null. Tick 0 leaves her note `none spent today` and Mara's cap `no cap`. Tick 6 drops her remainder, restores `none spent today`, and leaves `money` null. Pax's allowance stays null. Free Tide stays `not visible to you`. Mina's departure line does not name a treasury. Both bad sources are HTTP 400 `invalid-source` with the listed errors, and neither moves the purse or the treasury. The purse recruit is HTTP 202, then money 12, troops 88, `treasuryDrawn` 0, `purseDrawn` 96, cap still `no cap`, treasury 17947.16. No listed field was present but wrong. No mismatch.

## Verdict

PROMOTE
