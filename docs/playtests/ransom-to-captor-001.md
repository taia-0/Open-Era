# Playtest plan: ransom to the captor

This is the plan for a blind operator. It is not a completed session. Run it later. Do not open `src/`, `tests/`, the branch diff, or `docs/design/` during the session. Use only the dashboard HTTP JSON.

## Setup

- Node `v24.21.0` (`nvm use 24.21.0` if `node -v` is not that). `npm ci` first.
- Branch `feature/ransom-to-captor`. The credit is `8392450`.
- `npm run dashboard -- --reset --seed 1847` on `http://127.0.0.1:4317`.
- `GET /api/health` should be HTTP 200 `{"ok":true,"tick":0,"events":0}`. The player is already Mara Vane, `character-01`, `playerId` `prototype-player`. Do not pass another character.
- Read state with `GET /api/state?limit=200&beforeSequence=<cursor>`. Omit `beforeSequence` on the first read. The next older page uses `eventPage.cursor`. This plan does not need a second page.
- Advance with `POST /api/advance`. Do not send `ticks` above 144.
- Commands are `POST /api/commands`. This plan sends none.

`tick` on an event is the tick the world was on while that event was written. `tick` on the state is the tick after that advance. They differ by one. The steps below use the state tick. Quoted event fields use the event's own `tick`.

## Hypothesis and ambition

**Hypothesis.** On release day the coins in the prisoner's purse are paid to the faction that captured them. Mara can see that payment in World Government's treasury when a prisoner held at her port is released. She cannot read the amount on the release event.

**Ambition.** Issue no commands. Advance to state tick 275 and read Dax Pike's purse while he is still held at Crown Harbor. Advance one tick and read World Government's treasury and his release.

**What you can see.** Mara is World Government, standing at `crown-harbor`. Dax Pike (`character-20`) is Free Tide. While he is in her port she can read his purse and his captivity. Once he sails, that purse is hidden. Free Tide's treasury stays `null`. World Government's treasury is a number. A release whose actor is not Mara has `payloadWithheld` true, `data` null, and the summary `Dax Pike: captivity released`. The strings `60.48` and `86.16` are not in the state JSON after the release.

The same tick also collects port tax she cannot itemize. The treasury does not rise by `60.48` alone. It rises from `29050.76` to `29131.89`. That difference is `81.13`. `60.48` of it is the purse she just read. The other `20.65` is tax on withheld `worked` and `market-trade` lines. Judge the treasury by the exact number, not by subtracting `60.48` yourself from a live total.

No ransom command exists. Do not raid, retreat, or escape.

## Characters

| Name | Id | What to watch |
| --- | --- | --- |
| Mara Vane | `character-01` | The player. Stays at `crown-harbor` with money `108`. |
| Dax Pike | `character-20` | Held at Crown Harbor by World Government. Released on event tick 275. |

## Steps

### Advance to state tick 275

`POST /api/advance` `{"ticks":144}`. HTTP 200. `tick` 144. `ticksAdvanced` 144. `combatUpdated` false. `attentionUpdated` false.

`POST /api/advance` `{"ticks":131}`. HTTP 200. `tick` 275. `ticksAdvanced` 131. `combatUpdated` false. `attentionUpdated` false.

If either response has `ticksAdvanced` below the number you sent, stop. The world paused on Mara, and this reading is not the one below.

`GET /api/state?limit=200`.

State tick 275, `day` 45.83:

- `party.name` `Mara Vane`. `party.locationId` `crown-harbor`. `party.hold.money` `108`.
- World Government, `factions` id `world-government`: `name` `World Government`, `treasury` `29050.76`, `taxRate` `0.14`, `power` `2799.96`. `intelligence.exact` true. `intelligence.source` `faction-record`.
- Free Tide, `factions` id `free-tide`: `name` `Free Tide Compact`, `treasury` null, `taxRate` `0.08`, `power` null. `intelligence.exact` false. `intelligence.source` `reputation`.
- Dax Pike, `character-20`: `locationId` `crown-harbor`. `factionId` `free-tide`. `money` `60.48`. `travel` null. `debts` null. `captivity` is present:
  - `captorFactionId` `world-government`
  - `settlementId` `crown-harbor`
  - `capturedTick` `191`
  - `mandatoryReleaseTick` `275`
  - `cause` `major-defeat`
  - `displayedRisk` `moderate`
  - `releaseDestinationId` `verdant-cay`
  - `scatteredTroops.count` `53`
  - `scatteredTroops.experience` `0.10580278076231481`
  - `scatteredTroops.discipline` `0.40910344365052875`
- No event in this page has `type` `captivity-released` and `actorId` `character-20`.
- The state JSON contains `60.48` (his purse). It does not contain `86.16`.

### Advance to state tick 276

`POST /api/advance` `{"ticks":1}`. HTTP 200. `tick` 276. `ticksAdvanced` 1. `combatUpdated` false. `attentionUpdated` false.

On that response, find the event with `sequence` `32817`. Do not match by position. The list is newest first, and this event is early in the tick.

- `sequence` `32817`
- `tick` `275`
- `day` `45.83`
- `type` `captivity-released`
- `actorId` `character-20`
- `targetId` `world-government`
- `settlementId` `crown-harbor`
- `payloadWithheld` true
- `data` null
- `summary` `Dax Pike: captivity released`

`GET /api/state?limit=200`.

State tick 276, `day` 46:

- `party.name` `Mara Vane`. `party.locationId` `crown-harbor`. `party.hold.money` `108`.
- World Government `treasury` `29131.89`. `taxRate` `0.14`. `power` `2802.32`. `name` `World Government`.
- Free Tide `treasury` null. `power` null. `taxRate` `0.08`.
- The same event `32817` is on this page (`eventPage.oldestSequence` `32735`, `eventPage.newestSequence` `32934`). Same fields as the advance response, including `summary` `Dax Pike: captivity released`, `data` null, and `payloadWithheld` true.
- Dax Pike: `locationId` null. `money` null. `captivity` null. `debts` null. `travel.fromId` `crown-harbor`. `travel.toId` `verdant-cay`. `travel.totalTicks` `4`. `travel.remainingTicks` `3`.
- The state JSON does not contain `60.48` or `86.16`.

## Criteria

`PROMOTE` if all of these hold:

- At state tick 275, Dax's `money` is `60.48`, his `captivity.captorFactionId` is `world-government`, his `mandatoryReleaseTick` is `275`, and World Government's `treasury` is `29050.76`.
- At state tick 276, event `32817` is `captivity-released` for `character-20` with `targetId` `world-government`, `payloadWithheld` true, `data` null, and summary `Dax Pike: captivity released`.
- World Government's `treasury` is `29131.89`. Free Tide's `treasury` is null.
- Dax's `captivity` is null, his `money` is null, and his `travel.toId` is `verdant-cay`.
- The state JSON at tick 276 does not contain `60.48` or `86.16`.

`REVISE` if the release is present but the treasury is not `29131.89`, or if `data` is not null, or if the summary is not `Dax Pike: captivity released`, or if `60.48` or `86.16` appears in the tick 276 JSON, or if Free Tide's `treasury` is a number.

`ABANDON` if state tick 276 has no `captivity-released` for `character-20`, or if Dax is not captive at `crown-harbor` at state tick 275, or if either long advance stops early (`ticksAdvanced` below `144` or below `131`).
