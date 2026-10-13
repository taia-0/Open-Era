# Playtest plan: hazards projection

This is the plan for a blind operator. It is not a completed session. Do not run it as part of writing the change. Do not open `src/`, `tests/`, the branch diff, or `docs/design/` during the session. Use only the dashboard HTTP JSON.

Two passes. One process at a time. Seed 1847. Mara Vane stays the viewer. Pass A issues no command. Pass B issues one travel command at tick 0. Restart between the passes. A no-command advance and a tick-0 voyage are different worlds, so they do not share a process.

## Setup

- Node `v24.21.0` (`nvm use 24.21.0` if `node -v` is not that). `npm ci` first if `node_modules` is missing.
- Branch `feature/hazards-projection`. Record `git rev-parse HEAD` before the first request.
- One process. `npm run dashboard -- --reset --seed 1847` on `http://127.0.0.1:4317`. Do not start a second seed. Kill that process and run the same command again before pass B.
- `GET /api/health` should be HTTP 200 `{"ok":true,"tick":0,"events":0}` at the start of each pass.
- The player is already Mara Vane, `character-01`, `playerId` `prototype-player`. Do not pass another character.
- Read state with `GET /api/state?limit=200`. The `events` array is newest first. `characters` is the card list.
- Advance with `POST /api/advance`. Body `{"ticks":N}`. Pass A uses 1. Pass B uses 2.
- Glassport and Crown Harbor are World Government. Cinder Key is Free Tide. Verdant Cay is neutral. Mara starts in Crown Harbor.

## Hypothesis and ambition

**Hypothesis.** A rival anchored in Glassport does not show purse, morale, sailors, or troops while Mara is in Crown Harbor, and that rival's `locationId` stays `glassport`. A ship at sea has `travel` null on every card except Mara's own. A sea sighting can still name the leg she is on.

**Ambition.** Read the tick-0 cards for Corin Hale, Sable Sorn, Sable Morrow, and Pax Ash. Advance one tick and read Mina Vale and Ada Sorn. On a fresh process, sail Crown Harbor to Glassport and read Mara's own course beside Ada's card.

**What you can see.** `locationId` on a docked card. `travel` only on Mara's card. Condition on a character standing in Crown Harbor with her. Skills on a World Government mate who is somewhere else. A `seaSighting` leg when she is on that leg. Not another ship's `fromId` / `toId` / `totalTicks` / `remainingTicks` on `travel`.

## Characters

| Name | Id | What to watch |
| --- | --- | --- |
| Mara Vane | `character-01` | The viewer. Her own `travel` stays. |
| Sable Morrow | `character-04` | World Government, docked at Glassport. Skills stay. Condition does not. |
| Pax Ash | `character-14` | Free Tide, standing in Crown Harbor with Mara. Condition stays. |
| Mina Vale | `character-15` | Free Tide. At sea on the tick-1 read. `travel` is null. |
| Corin Hale | `character-16` | Free Tide, docked at Glassport on tick 0. Location stays. Condition does not. |
| Ada Sorn | `character-13` | World Government. At sea on both later reads. The overtaking on pass B. |
| Sable Sorn | `character-24` | Unaffiliated, docked at Glassport on tick 0. Same hiding as Corin. |

## Pass A, state tick 0

`GET /api/health`. HTTP 200.

```json
{"ok":true,"tick":0,"events":0}
```

`GET /api/state?limit=200`. HTTP 200.

- `tick` 0. `day` 0. `commanderId` `character-01`.
- `player.id` `prototype-player`. `player.displayName` `Mara Vane`. `player.characterId` `character-01`.
- `eventPage` count 0, limit 200, total 0, `hasMore` false, `oldestSequence` null, `newestSequence` null.
- Settlements: `crown-harbor` and `glassport` are `world-government`. `cinder-key` is `free-tide`. `verdant-cay` is null. Every `ownerId` is null.
- Mara's `locationId` is `crown-harbor`. Her `travel` is null. Her `money` is 108. Her `morale` is 93. Her `sailors` is 17. Her `troops.count` is 80. Her `seaSightings` is null. `intelligence.tier` is `self`.

Corin Hale, `character-16`:

- `factionId` `free-tide`. `locationId` `glassport`. `travel` null.
- `intelligence.tier` `distant`. `intelligence.source` `reputation`. `conditionExact` false. `capabilityExact` false.
- `money`, `morale`, `sailors`, `health`, `troops`, `partyPower`, `skills`, `attributes`, and `cargo` are null.

Sable Sorn, `character-24`:

- `factionId` null. `locationId` `glassport`. `travel` null.
- `intelligence.tier` `distant`.
- `money`, `morale`, `sailors`, `troops`, and `skills` are null.

Sable Morrow, `character-04`:

- `factionId` `world-government`. `locationId` `glassport`. `travel` null.
- `intelligence.tier` `faction`. `source` `faction-record`. `conditionExact` false. `capabilityExact` true.
- `money`, `morale`, `sailors`, `troops`, and `partyPower` are null.
- `skills` is strategy 27, leadership 38, navigation 27, trade 58.

Pax Ash, `character-14`:

- `factionId` `free-tide`. `locationId` `crown-harbor`. `travel` null.
- `intelligence.tier` `co-located`. `source` `direct-observation`. `conditionExact` true.
- `money` 247. `morale` 80. `sailors` 19. `troops.count` 92. `partyPower` 253.751.
- `conditionNote` is `Learned at Crown Harbor. The hold and the purse are on this card because both ships are in port.`
- `plan` is null.

## Pass A, state tick 1

`POST /api/advance`

```json
{"ticks":1}
```

HTTP 200.

- `ok` true. `tick` 1. `day` 0.17. `ticksAdvanced` 1.
- `combatUpdated` false. `attentionUpdated` false. `pausedForBattle` false.
- `eventSequence` 182.

`GET /api/state?limit=200`. HTTP 200.

- `tick` 1. `day` 0.17.
- `eventPage`: count 182, limit 200, total 182, `hasMore` false, `oldestSequence` 1, `newestSequence` 182, `cursor` 1.
- Mara is still `crown-harbor`. Her `travel` is still null. Her `money` is still 108.
- Sequence 96 is `travel-started`, actor `character-15`, target `glassport`, summary `Mina Vale departed for Glassport.`, `payloadWithheld` true, `data` null.

Mina Vale, `character-15`:

- `locationId` null. `travel` null. `intelligence.tier` `distant`.
- `money`, `morale`, `sailors`, `troops`, `skills`, and `seaSighting` are null.

Ada Sorn, `character-13`:

- `locationId` null. `travel` null. `intelligence.tier` `faction`.
- `money`, `morale`, `sailors`, and `troops` are null. `seaSighting` is null, because Mara is still in port.
- `skills` is strategy 18, leadership 36, navigation 86, trade 46.

Sable Morrow is still `glassport`, `travel` null, `money` null, and the same four skills.

Stop this process.

## Pass B, the only command

Start the dashboard again with `--reset --seed 1847`. `GET /api/health` is HTTP 200 `{"ok":true,"tick":0,"events":0}`.

`POST /api/commands`

```json
{"playerId":"prototype-player","type":"character-action","action":"travel","targetId":"glassport"}
```

HTTP 202. `command.id` `command-00001`. `action` `travel`. `targetId` `glassport`. `issuedTick` 0.

`POST /api/advance` with `{"ticks":2}`. HTTP 200.

- `tick` 2. `day` 0.33. `ticksAdvanced` 2.
- `combatUpdated` false. `attentionUpdated` false. `pausedForBattle` false.
- `eventSequence` 274.

`GET /api/state?limit=200`. HTTP 200.

- `tick` 2. `day` 0.33.
- `eventPage`: count 200, limit 200, total 272, `hasMore` true, `oldestSequence` 75, `newestSequence` 274, `cursor` 75.

Mara Vane:

- `locationId` null.
- `travel` is `fromId` `crown-harbor`, `toId` `glassport`, `totalTicks` 4, `remainingTicks` 2.
- `seaSightings["character-13"].kind` is `overtaking`. `fromId` `crown-harbor`. `toId` `glassport`. `sailors` 18. `troops` 35. `partyPower` 81.529.
- That summary is `Ada Sorn is overtaking on this route, Crown Harbor to Glassport. 35 troops, 0 ticks old.`

Ada Sorn:

- `travel` null. `locationId` null. `troops` null. `money` null.
- `seaSighting.fromId` `crown-harbor`. `seaSighting.toId` `glassport`. `seaSighting.kind` `overtaking`. `seaSighting.troops` 35.
- `seaSightings` null.

Mina Vale:

- `travel` null. `locationId` null. `seaSighting` null. `skills` null. `money` null.

## Session

Played at `04ac9af56bb1671d9dd523521930672fd5c8ec9b`. Node v24.21.0, ICU 78.3. Seed 1847. Viewer Mara Vane, `character-01`, `playerId` `prototype-player`. Two processes, one at a time, on `http://127.0.0.1:4317`. Pass A issued no command. Pass B issued one travel command at tick 0. No `beforeSequence` on any event read.

### Pass A, state tick 0

`GET /api/health` HTTP 200.

```json
{"ok":true,"tick":0,"events":0}
```

`GET /api/state?limit=200` HTTP 200.

- `tick` 0. `day` 0. `commanderId` `character-01`.
- `player.id` `prototype-player`. `player.displayName` `Mara Vane`. `player.characterId` `character-01`.
- `eventPage` count 0, limit 200, total 0, `hasMore` false, `oldestSequence` null, `newestSequence` null.
- Settlements: `crown-harbor` `world-government`, `glassport` `world-government`, `cinder-key` `free-tide`, `verdant-cay` null. Every `ownerId` null.

Mara Vane, `character-01`: `locationId` `crown-harbor`. `travel` null. `money` 108. `morale` 93. `sailors` 17. `troops.count` 80. `seaSightings` null. `intelligence.tier` `self`.

Corin Hale, `character-16`: `factionId` `free-tide`. `locationId` `glassport`. `travel` null. `intelligence.tier` `distant`. `intelligence.source` `reputation`. `conditionExact` false. `capabilityExact` false. `money`, `morale`, `sailors`, `health`, `troops`, `partyPower`, `skills`, `attributes`, and `cargo` are null.

Sable Sorn, `character-24`: `factionId` null. `locationId` `glassport`. `travel` null. `intelligence.tier` `distant`. `money`, `morale`, `sailors`, `troops`, and `skills` are null.

Sable Morrow, `character-04`: `factionId` `world-government`. `locationId` `glassport`. `travel` null. `intelligence.tier` `faction`. `source` `faction-record`. `conditionExact` false. `capabilityExact` true. `money`, `morale`, `sailors`, `troops`, and `partyPower` are null. `skills` strategy 27, leadership 38, navigation 27, trade 58.

Pax Ash, `character-14`: `factionId` `free-tide`. `locationId` `crown-harbor`. `travel` null. `intelligence.tier` `co-located`. `source` `direct-observation`. `conditionExact` true. `money` 247. `morale` 80. `sailors` 19. `troops.count` 92. `partyPower` 253.751. `conditionNote` `Learned at Crown Harbor. The hold and the purse are on this card because both ships are in port.` `plan` null.

### Pass A, state tick 1

`POST /api/advance` `{"ticks":1}` HTTP 200.

- `ok` true. `tick` 1. `day` 0.17. `ticksAdvanced` 1.
- `combatUpdated` false. `attentionUpdated` false. `pausedForBattle` false.
- `eventSequence` 182.

`GET /api/state?limit=200` HTTP 200.

- `tick` 1. `day` 0.17.
- `eventPage` count 182, limit 200, total 182, `hasMore` false, `oldestSequence` 1, `newestSequence` 182, `cursor` 1.
- Mara `locationId` `crown-harbor`. `travel` null. `money` 108.
- Sequence 96: `type` `travel-started`, `actorId` `character-15`, `targetId` `glassport`, `summary` `Mina Vale departed for Glassport.`, `payloadWithheld` true, `data` null.

Mina Vale, `character-15`: `locationId` null. `travel` null. `intelligence.tier` `distant`. `money`, `morale`, `sailors`, `troops`, `skills`, and `seaSighting` are null.

Ada Sorn, `character-13`: `locationId` null. `travel` null. `intelligence.tier` `faction`. `money`, `morale`, `sailors`, and `troops` are null. `seaSighting` null. `skills` strategy 18, leadership 36, navigation 86, trade 46.

Sable Morrow: `locationId` `glassport`. `travel` null. `money` null. `skills` strategy 27, leadership 38, navigation 27, trade 58.

### Pass B, the only command

Fresh process, `--reset --seed 1847`. `GET /api/health` HTTP 200 `{"ok":true,"tick":0,"events":0}`.

`POST /api/commands` HTTP 202. `command.id` `command-00001`. `action` `travel`. `targetId` `glassport`. `issuedTick` 0.

`POST /api/advance` `{"ticks":2}` HTTP 200.

- `tick` 2. `day` 0.33. `ticksAdvanced` 2.
- `combatUpdated` false. `attentionUpdated` false. `pausedForBattle` false.
- `eventSequence` 274.

`GET /api/state?limit=200` HTTP 200.

- `tick` 2. `day` 0.33.
- `eventPage` count 200, limit 200, total 272, `hasMore` true, `oldestSequence` 75, `newestSequence` 274, `cursor` 75.

Mara Vane: `locationId` null. `travel.fromId` `crown-harbor`. `travel.toId` `glassport`. `travel.totalTicks` 4. `travel.remainingTicks` 2. `seaSightings["character-13"].kind` `overtaking`. `fromId` `crown-harbor`. `toId` `glassport`. `sailors` 18. `troops` 35. `partyPower` 81.529. Summary `Ada Sorn is overtaking on this route, Crown Harbor to Glassport. 35 troops, 0 ticks old.`

Ada Sorn: `travel` null. `locationId` null. `troops` null. `money` null. `seaSighting.fromId` `crown-harbor`. `seaSighting.toId` `glassport`. `seaSighting.kind` `overtaking`. `seaSighting.troops` 35. `seaSightings` null.

Mina Vale: `travel` null. `locationId` null. `seaSighting` null. `skills` null. `money` null.

## Outcome

On tick 0, Glassport still names Corin Hale and Sable Sorn, and neither card shows a purse or a troop count. Sable Morrow, in that same port and in Mara's faction, keeps her skills and loses the purse. Pax Ash, standing in Crown Harbor, still shows money 247. On tick 1, Mina Vale has left Cinder Key and her card has no course. On the voyage, Mara's own card still shows Crown Harbor to Glassport, 2 of 4, and Ada's card does not. Ada's sea row still names that leg and 35 troops.

## Findings

### What worked

- A held port did not publish a distant rival's condition.
- The docked `locationId` stayed.
- `travel` stayed on the viewer's card and was null on the others.
- The sea row still named the shared leg.

### Implementation defects

- None observed.

### Follow-up experiments

- None for this plan.

## Verdict

`PROMOTE`

The four readings above are the projection. A failure on any named null, or a `travel` object on Ada or Mina or Corin, is a revise. None of those failed. Every named reading matched.
