# Playtest plan: progression skill step

This is the plan for a blind operator. It is not a completed session. Do not run it as part of writing the change. Do not open `src/`, `tests/`, the branch diff, or `docs/design/` during the session. Use only the dashboard HTTP JSON.

One process. Seed 1847. Mara Vane stays the viewer. She works twice. A faction mate's voyage is on the same opening tick, so the card can be read beside her own event.

## Setup

- Node `v24.21.0` (`nvm use 24.21.0` if `node -v` is not that). `npm ci` first if `node_modules` is missing.
- Branch `feature/progression-skill-step`. Record `git rev-parse HEAD` before the first request. The readings below were taken at `0372d2d1fdb8353511aacf67e0ea7edc1bbb6236`.
- One process. `npm run dashboard -- --reset --seed 1847` on `http://127.0.0.1:4317`. Do not start a second seed.
- `GET /api/health` should be HTTP 200 `{"ok":true,"tick":0,"events":0}`.
- The player is already Mara Vane, `character-01`, `playerId` `prototype-player`. Do not pass another character.
- Read state with `GET /api/state?limit=200`. The `events` array is newest first. `characters` is the card list.
- Queue work with `POST /api/commands`. Advance with `POST /api/advance` and body `{"ticks":1}`.

## Hypothesis and ambition

**Hypothesis.** A use of a skill closes a small gap toward 100, and the player can see the new number. Her own work stores the new leadership and trade on the event and on her card. The feed sentence does not talk about skills. A World Government mate's voyage stores the new navigation on his card. His feed sentence does not, and his payload stays withheld. A later sea tick does not take another navigation step.

**Ambition.** Read Mara's four skills and Bram Quill's four skills at tick 0. Order work, advance one tick, and read her event beside both cards. Order work again, advance one tick, and read the second step. Bram is still at sea, and his navigation is the same number as the tick before.

**What you can see.** Skills on Mara's card and on a World Government mate's card. On her own `worked` row, `data.leadership`, `data.trade`, and `data.gross`. The sentence `Mara Vane worked at Crown Harbor. Tax of 2.82 went to the treasury.` Bram's sentence `Bram Quill departed for Cinder Key.` His `travel` and his `skills.navigation`. Not a skill word in either sentence. Not Bram's event payload.

## Characters

| Name | Id | What to watch |
| --- | --- | --- |
| Mara Vane | `character-01` | The viewer. Work practices leadership and trade. Strategy and navigation stay. |
| Bram Quill | `character-02` | World Government. Departs Verdant Cay for Cinder Key. Navigation steps once. |

## Tick 0, before the order

`GET /api/health`. HTTP 200.

```json
{"ok":true,"tick":0,"events":0}
```

`GET /api/state?limit=200`. HTTP 200.

- `tick` 0. `day` 0. `commanderId` `character-01`.
- `player.id` `prototype-player`. `player.displayName` `Mara Vane`. `player.characterId` `character-01`.
- `eventPage` count 0, limit 200, total 0, `hasMore` false, `oldestSequence` null, `newestSequence` null.

Mara Vane, `character-01`:

- `locationId` `crown-harbor`. `money` 108. `morale` 93. `skillsNote` null.
- `skills` strategy 72, leadership 77, navigation 38, trade 57.

Bram Quill, `character-02`:

- `factionId` `world-government`. `locationId` `verdant-cay`. `travel` null. `skillsNote` null.
- `intelligence.tier` `faction`. `source` `faction-record`. `capabilityExact` true. `conditionExact` false.
- `skills` strategy 56, leadership 52, navigation 28, trade 74.

## The first work

`POST /api/commands`

```json
{"playerId":"prototype-player","type":"character-action","action":"work"}
```

HTTP 202.

```json
{"ok":true,"command":{"id":"command-00001","playerId":"prototype-player","issuedTick":0,"type":"character-action","action":"work","source":"treasury"}}
```

`POST /api/advance`

```json
{"ticks":1}
```

HTTP 200.

- `ok` true. `tick` 1. `day` 0.17. `ticksAdvanced` 1.
- `combatUpdated` false. `attentionUpdated` false. `pausedForBattle` false.
- `eventSequence` 186.

`GET /api/state?limit=200`. HTTP 200.

- `tick` 1. `day` 0.17.
- `eventPage` count 184, limit 200, total 184, `hasMore` false, `oldestSequence` 1, `newestSequence` 186, `cursor` 1.

Mara's card:

- `locationId` `crown-harbor`. `money` 125.33. `morale` 92.7.
- `skills` strategy 72, leadership 77.023, navigation 38, trade 57.043.

Sequence 11 is `worked`, actor `character-01`, settlement `crown-harbor`, tick 0. `payloadWithheld` false. Summary:

`Mara Vane worked at Crown Harbor. Tax of 2.82 went to the treasury.`

`data`:

- `gross` 20.15. `tax` 2.82. `characterMoney` 125.33. `factionTreasury` 18002.82. `morale` 92.65.
- `leadership` 77.023. `trade` 57.043.
- The summary does not contain `leadership`, `trade`, `77.023`, or `57.043`.

The pay is the gross from the skills she had before the step. The card and `data` hold the skills after the step. Strategy and navigation are the same numbers as tick 0.

Bram's card:

- `locationId` null.
- `travel` `fromId` `verdant-cay`, `toId` `cinder-key`, `totalTicks` 4, `remainingTicks` 4.
- `skills` strategy 56, leadership 52, navigation 28.072, trade 74. `skillsNote` null.
- `intelligence.tier` `faction`. `capabilityExact` true.

Sequence 18 is `travel-started`, actor `character-02`, target `cinder-key`, tick 0. `payloadWithheld` true. `data` null. Summary:

`Bram Quill departed for Cinder Key.`

The summary does not contain `navigation` or `28.072`. The new navigation is on his card.

## The second work

`POST /api/commands`

```json
{"playerId":"prototype-player","type":"character-action","action":"work"}
```

HTTP 202.

```json
{"ok":true,"command":{"id":"command-00002","playerId":"prototype-player","issuedTick":1,"type":"character-action","action":"work","source":"treasury"}}
```

`POST /api/advance`

```json
{"ticks":1}
```

HTTP 200.

- `ok` true. `tick` 2. `day` 0.33. `ticksAdvanced` 1.
- `combatUpdated` false. `attentionUpdated` false. `pausedForBattle` false.
- `eventSequence` 276.

`GET /api/state?limit=200`. HTTP 200.

- `tick` 2. `day` 0.33.
- Mara's `money` is 142.66.
- Mara's `skills` are strategy 72, leadership 77.046, navigation 38, trade 57.086.

Sequence 195 is `worked`, actor `character-01`, settlement `crown-harbor`, tick 1. `payloadWithheld` false. Summary, the same words as sequence 11:

`Mara Vane worked at Crown Harbor. Tax of 2.82 went to the treasury.`

`data.gross` 20.15. `data.tax` 2.82. `data.characterMoney` 142.66. `data.factionTreasury` 17952.8. `data.morale` 92.34. `data.leadership` 77.046. `data.trade` 57.086.

The sentence and the gross stay on the previous cent. The step is the two skill fields and the card.

Bram is still at sea. `locationId` null. `travel.remainingTicks` 3. `travel.totalTicks` 4. `skills.navigation` is still 28.072. Leadership, strategy, and trade are still 52, 56, and 74.

Stop this process.
