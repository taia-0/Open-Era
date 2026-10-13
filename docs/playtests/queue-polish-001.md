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

## Session

Blind session on `feature/queue-polish` at `d248e56db90f81aaddbf5dc0aa1b1d229d8fbf52`. `git rev-parse HEAD` before the first request was `d248e56db90f81aaddbf5dc0aa1b1d229d8fbf52`. Node v24.21.0, ICU 78.3. Seed 1847. One process: `npm run dashboard -- --reset --seed 1847` on `http://127.0.0.1:4317`. Port 4317 was free before `--reset`. Viewer Mara Vane, `character-01`, `playerId` `prototype-player`. No command was posted. `beforeSequence` was omitted. The named rows were taken from the advance body that produced them. Each body was newest first. The process was stopped after the tick 401 reading. `golden:update` was not run.

### Setup

`GET /api/health` HTTP 200.

```json
{"ok":true,"tick":0,"events":0}
```

`GET /api/state?limit=1` HTTP 200. `tick` 0. `day` 0. `player.id` `prototype-player`. `player.displayName` `Mara Vane`. `player.characterId` `character-01`. `party.locationId` `crown-harbor`.

Mara Vane, `character-01`: `factionId` `world-government`. `locationId` `crown-harbor`. `morale` 93. `money` 108. `payNote` null.

Mina Vale, `character-15`: `factionId` `free-tide`. `locationId` `cinder-key`. `morale` null. `money` null. `payNote` null.

No character has `payNote` set.

### Checkpoint 1. Mina is alongside, and the pay note stays off

`POST /api/advance` `{"ticks":114}` HTTP 200.

- `ok` true. `tick` 114. `day` 19. `ticksAdvanced` 114.
- `combatUpdated` false. `attentionUpdated` false. `pausedForBattle` false. `pauseNote` null.
- `eventSequence` 13444.
- The body has 13444 events.

`GET /api/state?limit=1` HTTP 200. `tick` 114. `day` 19.

Mina Vale, `character-15`:

- `factionId` `free-tide`. `locationId` `crown-harbor`.
- `morale` 57.6. `money` 35.17. `health` 90.
- `payNote` null.

Mara Vane is still at `crown-harbor`. `morale` 24.3. `money` 108. `health` 76.3. `payNote` null.

No character has `payNote` set.

### Checkpoint 2. Mara at morale 0, still with money

`POST /api/advance` `{"ticks":60}` HTTP 200.

- `ok` true. `tick` 174. `day` 29. `ticksAdvanced` 60.
- `combatUpdated` false. `attentionUpdated` false. `pausedForBattle` false. `pauseNote` null.
- `eventSequence` 20819.
- The body has 7375 events.

`GET /api/state?limit=1` HTTP 200. `tick` 174. `day` 29.

Mara is still at `crown-harbor`. `morale` 0. `money` 108. `payNote` null.

`POST /api/advance` `{"ticks":1}` HTTP 200. `tick` 175. `day` 29.17. `ticksAdvanced` 1. `combatUpdated` false. `attentionUpdated` false. `pausedForBattle` false. `pauseNote` null. `eventSequence` 20945. The body has 126 events.

### Checkpoint 3. The capture stops the clock

`POST /api/advance` `{"ticks":144}` HTTP 200.

- `ok` true. `tick` 317. `day` 52.83. `ticksAdvanced` 142.
- `attentionUpdated` true. `combatUpdated` false. `pausedForBattle` false.
- `eventSequence` 39523.
- The body has 18578 events.
- `pauseNote` `Time stopped. Free Tide Compact took Mara Vane on the dock at Crown Harbor after Pax Ash won there on a higher score.`

Sequence 39449, tick 316, type `character-captured`, `actorId` `character-01`. Summary:

`Free Tide Compact took Mara Vane on the dock at Crown Harbor after Pax Ash won there on a higher score. 80 troops were taken, power 175.568.`

`pauseNote` is `Time stopped.` plus that summary's first sentence.

`GET /api/state?limit=1` HTTP 200. `tick` 317.

Mara: `locationId` `crown-harbor`. `morale` 0. `money` 108. `payNote` null. `captivity` is set.

### Checkpoint 4. The release stops the clock

`POST /api/advance` `{"ticks":144}` HTTP 200.

- `ok` true. `tick` 401. `day` 66.83. `ticksAdvanced` 84.
- `attentionUpdated` true. `combatUpdated` false. `pausedForBattle` false.
- `eventSequence` 50573.
- The body has 11050 events.
- `pauseNote` `Time stopped. Mara Vane was released from Crown Harbor.`

Sequence 50454, tick 400, type `captivity-released`, `actorId` `character-01`. Summary:

`Mara Vane was released from Crown Harbor. 108 was paid and 124.37 was recorded as debt. Loyalty fell. 108 went to the Free Tide Compact treasury. The balance is not visible to you. The ransom line covers only the ransom. Mara Vane holds the seat of World Government again.`

The summary starts `Mara Vane was released from Crown Harbor.` `pauseNote` is `Time stopped.` plus that first sentence.

`GET /api/state?limit=1` HTTP 200. `tick` 401.

Mara: `locationId` null. `morale` 0. `money` 0. `payNote` null. `factionId` `world-government`. `captivity` is null. `travel.toId` `glassport`.

No character has `payNote` set.

The process was stopped.

## Findings

The hypothesis holds. Mina Vale is in the same port at tick 114 and her card shows morale and money while `payNote` stays null. The note is not on her card. Mara holds World Government. Her own `payNote` stays null at morale 0 with money 108, and again at morale 0 with money 0. No character in this session has `payNote` set. An advance that runs the ticks it was given leaves `pauseNote` null. Each early stop puts the cause in `pauseNote`, and that sentence is `Time stopped.` plus the first sentence of the feed row that stopped the clock.

| Checkpoint | Expected | Observed |
| --- | --- | --- |
| Health at tick 0 | HTTP 200 `{"ok":true,"tick":0,"events":0}` | Same |
| Viewer at tick 0 | Mara Vane, `character-01`, `prototype-player`, `crown-harbor` | Same |
| Mara at tick 0 | `world-government`, `crown-harbor`, morale 93, money 108, `payNote` null | Same |
| Mina at tick 0 | `free-tide`, `cinder-key`, morale null, money null, `payNote` null | Same |
| Pay notes at tick 0 | None set | None set |
| Advance 114 | `tick` 114, `day` 19, `ticksAdvanced` 114, no combat, no attention, not paused, `pauseNote` null, `eventSequence` 13444 | Same |
| Mina at tick 114 | `free-tide`, `crown-harbor`, morale 57.6, money 35.17, health 90, `payNote` null | Same |
| Mara at tick 114 | `crown-harbor`, morale 24.3, money 108, health 76.3, `payNote` null | Same |
| Pay notes at tick 114 | None set | None set |
| Advance to 174 | `tick` 174, `day` 29, `ticksAdvanced` 60, no combat, no attention, not paused, `pauseNote` null, `eventSequence` 20819 | Same |
| Mara at 174 | `crown-harbor`, morale 0, money 108, `payNote` null | Same |
| Advance 1 | `tick` 175, `day` 29.17, `ticksAdvanced` 1, `pauseNote` null, `eventSequence` 20945 | Same |
| Capture pause | `tick` 317, `day` 52.83, `ticksAdvanced` 142, `attentionUpdated` true, `combatUpdated` false, `pausedForBattle` false, `eventSequence` 39523 | Same |
| Capture `pauseNote` | `Time stopped. Free Tide Compact took Mara Vane on the dock at Crown Harbor after Pax Ash won there on a higher score.` | Same |
| Sequence 39449 | tick 316, `character-captured`, actor `character-01`. Summary starts `Free Tide Compact took Mara Vane on the dock at Crown Harbor after Pax Ash won there on a higher score.` and continues `80 troops were taken, power 175.568.` | Same. The JSON key is `actorId` |
| Mara at 317 | `crown-harbor`, morale 0, money 108, `payNote` null, `captivity` set | Same |
| Release pause | `tick` 401, `day` 66.83, `ticksAdvanced` 84, `attentionUpdated` true, `combatUpdated` false, `pausedForBattle` false, `eventSequence` 50573 | Same |
| Release `pauseNote` | `Time stopped. Mara Vane was released from Crown Harbor.` | Same |
| Sequence 50454 | tick 400, `captivity-released`, actor `character-01`. Summary starts `Mara Vane was released from Crown Harbor.` | Same. The JSON key is `actorId` |
| Mara at 401 | `locationId` null, morale 0, money 0, `payNote` null, `world-government`, `captivity` null, `travel.toId` `glassport` | Same |
| Pay notes at tick 401 | None set | None set |

### What worked

- Standing next to Mina Vale showed her morale and her money. Her card did not carry a pay note.
- Mara's own card never carried a pay note, including at morale 0 with 108 still in hand, and again at morale 0 with money 0.
- No card in these readings had `payNote` set.
- The capture stop named the dock, Free Tide Compact, and Pax Ash's higher score. The feed row kept the troop clause after that first sentence.
- The release stop named Crown Harbor. The same row said the Free Tide Compact balance is not visible.

### Implementation defects

- None observed.

### Follow-up experiments

- None for this plan.

## Verdict

`PROMOTE`

Every reading listed in this plan matched at `d248e56db90f81aaddbf5dc0aa1b1d229d8fbf52`. Mina Vale, in the same port, showed morale and money with `payNote` null. Mara's own `payNote` stayed null at morale 0, with money 108 and later with money 0. No character had `payNote` set. The calls that ran their full ticks left `pauseNote` null. The capture stop and the release stop each put `Time stopped.` plus the first sentence of the stopping feed row into `pauseNote`.
