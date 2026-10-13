# Playtest plan: batch 1 wage, pay, and desertion

This is the plan for a blind operator. It is not a completed session. Do not run it as part of writing the change. Do not open `src/`, `tests/`, the branch diff, or `docs/design/` during the session. Use only the dashboard HTTP JSON.

One process. Seed 1847. Mara Vane stays the viewer. Issue no command. The pay term is on a card beside her. The desertion lines are on the advance that leaves tick 174. The wage line is later, after two pauses, and the amount stays off her JSON.

The values below were read from one process on this branch, seed 1847, `playerId` `prototype-player`, no command. A live session skips her autonomous tax step, so a tick after her capture is not the headless tape.

## Setup

- Node `v24.21.0` (`nvm use 24.21.0` if `node -v` is not that). `npm ci` first if `node_modules` is missing.
- Branch `feature/batch1-wage-morale`. Record `git rev-parse HEAD` before the first request.
- One process. `npm run dashboard -- --reset --seed 1847` on `http://127.0.0.1:4317`. Do not start a second seed.
- `GET /api/health` should be HTTP 200 `{"ok":true,"tick":0,"events":0}`.
- The player is already Mara Vane, `character-01`, `playerId` `prototype-player`. Do not pass another character. Do not post a command.
- Advance with `POST /api/advance`. At most 144 ticks per call. An advance stops early when she is captured or released. Read `ticksAdvanced`, `attentionUpdated`, and `tick` before the next call.
- The advance body includes every event that call produced, newest first. Do not page backward for the rows named below. They are in that body.
- Read cards with `GET /api/state?limit=1`.

## Hypothesis and ambition

**Hypothesis.** A short mate beside Mara shows that pay is short and morale loses 0.5 on upkeep. Her own card does not. A withheld upkeep sentence does not say `0.5`. After twelve short mornings, a mate whose roll is under 0.5 leaves, and the feed names the faction and the roll. A day's wage toward a captivity debt shows up as `met a debt.` The amount, the remainder, and the purse stay off her JSON. Her own faction's debt ledger stays empty when the creditor is the other faction.

**Ambition.** Read Mina Vale's pay note at tick 114. Leave tick 174 and read Finn Frost and Bram Tern leaving Free Tide Compact. Continue through the capture pause and the release pause. Read Corin Hale meeting a debt at tick 810, with `data` null.

**What you can see.** The pay note on a captain in the same port. The public desertion sentence, including the roll. The public debt sentence, without the amount. Not a rival's debt row. Not Free Tide's ledger (`debts` null). Not the coins on a withheld `debt-repaid`.

## Characters

| Name | Id | What to watch |
| --- | --- | --- |
| Mara Vane | `character-01` | The viewer. World Government holder. Her pay note stays null. |
| Mina Vale | `character-15` | Free Tide. At Crown Harbor on the tick-114 read. The pay note is on her card. |
| Finn Frost | `character-18` | Leaves Free Tide Compact at tick 174. The roll is 0.245. |
| Bram Tern | `character-22` | Leaves on the same tick. The roll is 0.034. |
| Corin Hale | `character-16` | The first debt line she can read. Tick 810. The amount is withheld. |

## Tick 0, before any advance

`GET /api/health`. HTTP 200.

```json
{"ok":true,"tick":0,"events":0}
```

`GET /api/state?limit=1`. HTTP 200.

- `tick` 0. `day` 0.
- `player.id` `prototype-player`. `player.displayName` `Mara Vane`. `player.characterId` `character-01`.
- `party.locationId` `crown-harbor`.

Mara Vane, `character-01`:

- `factionId` `world-government`. `locationId` `crown-harbor`.
- `morale` 93. `money` 108. `payNote` null.

Mina Vale, `character-15`: `factionId` `free-tide`. `locationId` `cinder-key`. `morale` null. `money` null. `payNote` null.

## Checkpoint 1. The pay term

`POST /api/advance`

```json
{"ticks":114}
```

HTTP 200.

- `ok` true. `tick` 114. `day` 19. `ticksAdvanced` 114.
- `combatUpdated` false. `attentionUpdated` false. `pausedForBattle` false.
- `eventSequence` 13444.

In that response, sequence 13380 is `character-upkeep`, actor `character-15`, tick 113. `payloadWithheld` true. `data` null. Summary:

`Mina Vale's upkeep was recorded.`

The summary does not contain `0.5` or `Pay was short`.

`GET /api/state?limit=1`. HTTP 200. `tick` 114. `day` 19.

Mina Vale, `character-15`:

- `factionId` `free-tide`. `locationId` `crown-harbor`.
- `morale` 57.6. `money` 35.17. `health` 90.
- `payNote` `Pay is short, so morale loses 0.5 on upkeep.`

Mara Vane is still at `crown-harbor`. `morale` 24.3. `money` 108. `health` 76.3. `payNote` null.

Zara Gale, `character-17`, is at `glassport`. `morale` null. `money` null. `payNote` null.

## Checkpoint 2. Tick 174, before the morning runs

`POST /api/advance`

```json
{"ticks":60}
```

HTTP 200.

- `ok` true. `tick` 174. `day` 29. `ticksAdvanced` 60.
- `combatUpdated` false. `attentionUpdated` false. `pausedForBattle` false.
- `eventSequence` 20819.
- No event in that body has type `character-deserted`.

`GET /api/state?limit=1`. HTTP 200. `tick` 174. `day` 29.

Finn Frost, `character-18`, and Bram Tern, `character-22`:

- `factionId` `free-tide`. `locationId` null.
- `morale` null. `money` null. `payNote` null.

Mara is still at `crown-harbor`. `morale` 0. `money` 108. `payNote` null.

The morning of tick 174 has not run. Both are still in the faction.

## Checkpoint 3. The desertion

`POST /api/advance`

```json
{"ticks":1}
```

HTTP 200.

- `ok` true. `tick` 175. `day` 29.17. `ticksAdvanced` 1.
- `combatUpdated` false. `attentionUpdated` false. `pausedForBattle` false.
- `eventSequence` 20945.
- The body has 126 events, newest first. The two desertions are the oldest rows.

Sequence 20820, tick 174, day 29, type `character-deserted`, actor `character-18`, target `free-tide`. `payloadWithheld` true. `data` null. Summary:

`Finn Frost left Free Tide Compact. The roll was 0.245.`

Sequence 20821, tick 174, day 29, type `character-deserted`, actor `character-22`, target `free-tide`. `payloadWithheld` true. `data` null. Summary:

`Bram Tern left Free Tide Compact. The roll was 0.034.`

`GET /api/state?limit=1`. HTTP 200. `tick` 175. `day` 29.17.

Finn Frost and Bram Tern:

- `factionId` null. `locationId` null.
- `morale` null. `money` null. `payNote` null.

Mara is still at `crown-harbor`. `morale` 0. `money` 108. `payNote` null.

`factions`: `free-tide` has `debts` null. `world-government` has `debts` `[]` and `treasury` 17592.63.

## Checkpoint 4. Two pauses on the way to the debt

From tick 175, the next calls stop early. Do not skip them. Issue no command while she is held.

`POST /api/advance`

```json
{"ticks":144}
```

HTTP 200.

- `ok` true. `tick` 317. `day` 52.83. `ticksAdvanced` 142.
- `attentionUpdated` true. `combatUpdated` false. `pausedForBattle` false.
- `eventSequence` 39523.

Sequence 39449, tick 316, type `character-captured`, actor `character-01`. `payloadWithheld` false. Summary:

`Free Tide Compact took Mara Vane on the dock at Crown Harbor after Pax Ash won there on a higher score. 80 troops were taken, power 175.568.`

`POST /api/advance`

```json
{"ticks":144}
```

HTTP 200.

- `ok` true. `tick` 401. `day` 66.83. `ticksAdvanced` 84.
- `attentionUpdated` true. `combatUpdated` false. `pausedForBattle` false.
- `eventSequence` 50573.

Sequence 50454, tick 400, type `captivity-released`, actor `character-01`. `payloadWithheld` false. Summary:

`Mara Vane was released from Crown Harbor. 108 was paid and 124.37 was recorded as debt. Loyalty fell. 108 went to the Free Tide Compact treasury. The balance is not visible to you. The ransom line covers only the ransom. Mara Vane holds the seat of World Government again.`

## Checkpoint 5. The wage line

Three more advances, 144 ticks each. The middle one carries another desertion. The last one carries the debt.

`POST /api/advance` `{"ticks":144}`

- `tick` 545. `day` 90.83. `ticksAdvanced` 144.
- `attentionUpdated` false. `combatUpdated` false. `pausedForBattle` false.
- `eventSequence` 70027.
- No `debt-repaid`. No `character-deserted`.

`POST /api/advance` `{"ticks":144}`

- `tick` 689. `day` 114.83. `ticksAdvanced` 144.
- `attentionUpdated` false. `combatUpdated` false. `pausedForBattle` false.
- `eventSequence` 90631.

One `character-deserted`, tick 630, actor `character-19`, target `free-tide`. `payloadWithheld` true. `data` null. Summary:

`Esme Dusk left Free Tide Compact. The roll was 0.407.`

No `debt-repaid` in that body.

`POST /api/advance` `{"ticks":144}`

- `tick` 833. `day` 138.83. `ticksAdvanced` 144.
- `attentionUpdated` false. `combatUpdated` false. `pausedForBattle` false.
- `eventSequence` 110882.

The oldest `debt-repaid` in that body is sequence 107676, tick 810, day 135, actor `character-16`, target `free-tide`. `payloadWithheld` true. `data` null. Summary:

`Corin Hale met a debt.`

The summary does not contain `paid`, `18.33`, or `352.33`. The same body also has `debt-repaid` at ticks 816, 822, and 828, the same actor, the same sentence, `data` null.

`GET /api/state?limit=1`. HTTP 200. `tick` 833. `day` 138.83.

- `world-government` `debts` is `[]`.
- `free-tide` `debts` is null.
- Corin Hale, `character-16`: `locationId` `cinder-key`. `debts` null. `money` null. `morale` null. `payNote` null.
- Mara: `locationId` `glassport`. `morale` 0. `money` 0. `payNote` null. `factionId` `world-government`.

Stop the process.

## Findings to check

- At tick 114 Mina Vale's card says pay is short and morale loses 0.5. Mara's pay note is null. Sequence 13380 does not say `0.5`.
- The advance that arrives at tick 174 has no desertion. Finn and Bram are still `free-tide`.
- The next advance names both rolls, 0.245 and 0.034, and the following read has `factionId` null on both cards.
- The first debt she can read is tick 810, `Corin Hale met a debt.`, with `data` null. Her faction ledger is empty. Free Tide's ledger is null.
