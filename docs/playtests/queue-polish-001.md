# Playtest plan: queue polish

This is the plan for a blind operator. It is not a completed session. Do not fill Session, Findings, or Verdict while writing the plan. Do not open `src/`, `tests/`, the branch diff, or `docs/design/` during the session. Use only the dashboard HTTP JSON, this plan, and `progress.md`.

One process. Seed 1847. The seat is Mara Vane, `character-01`, `playerId` `prototype-player`. Issue no command. Advance at most 144 ticks per call. An advance stops early when she is captured, escapes, or released, and when a battle of hers resolves. Read `ticksAdvanced`, `tick`, and `pauseNote` before the next call.

The advance body includes every event that call produced, newest first. Do not page backward for the rows named below. They are in that body. Read cards with `GET /api/state?limit=1`.

The readings below were taken on this branch through `GET /api/health`, `GET /api/state?limit=1`, and `POST /api/advance`. Node v24.21.0. One process, seed 1847, live session, no command. A match is the campaign. A miss is not a new reading to write into this file during the session.

## Hypothesis and ambition

**Hypothesis.** A captain in the same port can show morale and money while `payNote` stays null. The note is not on a rival's card. Mara holds World Government, so her own `payNote` stays null at morale 0, including when her money is 0. No character in this session has `payNote` set on her reading. An advance that stops early puts the cause in `pauseNote`, and that sentence is the first sentence of the feed row that stopped the clock.

**Ambition.** Read Mina Vale beside Mara at tick 114 and confirm the pay note is absent. Leave tick 174 with Mara at morale 0 and money 108. Continue through the capture pause and the release pause. Read `pauseNote` on each stop, and the feed row it comes from.

**What you can see.** Morale and money for a captain in the same port. `payNote` null on every card in this session. `pauseNote` null when the call runs the ticks it was given. `pauseNote` naming the capture, then the release. Not Free Tide's ledger. Not a pay note on Mina's card.

## Setup

```text
npm run dashboard -- --reset --seed 1847
```

Bind `127.0.0.1:4317`. Record `git rev-parse HEAD` before the first request. Confirm port 4317 is free before `--reset`.

`GET /api/health` HTTP 200.

```json
{"ok":true,"tick":0,"events":0}
```

`GET /api/state?limit=1` HTTP 200. `tick` 0. `day` 0. `player.id` `prototype-player`. `player.displayName` `Mara Vane`. `player.characterId` `character-01`. `party.locationId` `crown-harbor`.

Mara Vane, `character-01`: `factionId` `world-government`. `locationId` `crown-harbor`. `morale` 93. `money` 108. `payNote` null.

Mina Vale, `character-15`: `factionId` `free-tide`. `locationId` `cinder-key`. `morale` null. `money` null. `payNote` null.

No character has `payNote` set.

## Checkpoint 1. Mina is alongside, and the pay note stays off

`POST /api/advance`

```json
{"ticks":114}
```

HTTP 200.

- `ok` true. `tick` 114. `day` 19. `ticksAdvanced` 114.
- `combatUpdated` false. `attentionUpdated` false. `pausedForBattle` false. `pauseNote` null.
- `eventSequence` 13444.

`GET /api/state?limit=1`. HTTP 200. `tick` 114. `day` 19.

Mina Vale, `character-15`:

- `factionId` `free-tide`. `locationId` `crown-harbor`.
- `morale` 57.6. `money` 35.17. `health` 90.
- `payNote` null.

Mara Vane is still at `crown-harbor`. `morale` 24.3. `money` 108. `health` 76.3. `payNote` null.

No character has `payNote` set.

## Checkpoint 2. Mara at morale 0, still with money

`POST /api/advance`

```json
{"ticks":60}
```

HTTP 200.

- `ok` true. `tick` 174. `day` 29. `ticksAdvanced` 60.
- `combatUpdated` false. `attentionUpdated` false. `pausedForBattle` false. `pauseNote` null.
- `eventSequence` 20819.

`GET /api/state?limit=1`. HTTP 200. `tick` 174. `day` 29.

Mara is still at `crown-harbor`. `morale` 0. `money` 108. `payNote` null.

`POST /api/advance` `{"ticks":1}`. HTTP 200. `tick` 175. `day` 29.17. `ticksAdvanced` 1. `pauseNote` null. `eventSequence` 20945.

## Checkpoint 3. The capture stops the clock

`POST /api/advance`

```json
{"ticks":144}
```

HTTP 200.

- `ok` true. `tick` 317. `day` 52.83. `ticksAdvanced` 142.
- `attentionUpdated` true. `combatUpdated` false. `pausedForBattle` false.
- `eventSequence` 39523.
- `pauseNote` `Time stopped. Free Tide Compact took Mara Vane on the dock at Crown Harbor after Pax Ash won there on a higher score.`

Sequence 39449, tick 316, type `character-captured`, actor `character-01`. Summary:

`Free Tide Compact took Mara Vane on the dock at Crown Harbor after Pax Ash won there on a higher score. 80 troops were taken, power 175.568.`

`pauseNote` is that summary's first sentence, after `Time stopped.`

`GET /api/state?limit=1`. HTTP 200. `tick` 317.

Mara: `locationId` `crown-harbor`. `morale` 0. `money` 108. `payNote` null. `captivity` is set.

## Checkpoint 4. The release stops the clock

`POST /api/advance`

```json
{"ticks":144}
```

HTTP 200.

- `ok` true. `tick` 401. `day` 66.83. `ticksAdvanced` 84.
- `attentionUpdated` true. `combatUpdated` false. `pausedForBattle` false.
- `eventSequence` 50573.
- `pauseNote` `Time stopped. Mara Vane was released from Crown Harbor.`

Sequence 50454, tick 400, type `captivity-released`, actor `character-01`. The summary starts `Mara Vane was released from Crown Harbor.`

`GET /api/state?limit=1`. HTTP 200. `tick` 401.

Mara: `locationId` null. `morale` 0. `money` 0. `payNote` null. `factionId` `world-government`. `captivity` is null. `travel.toId` `glassport`.

No character has `payNote` set.

Stop the process.
