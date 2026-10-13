# Playtest plan: progression readout

This is the plan for a blind operator. It is not a completed session. Do not run it as part of writing the change. Do not open `src/`, `tests/`, the branch diff, or `docs/design/` during the session. Use only the dashboard HTTP JSON.

One process. Seed 1847. Mara Vane stays the viewer. Issue no command. Advance 21 ticks, read the feed, then advance 1 tick. The first whole-number crossing is on that second read.

## Setup

- Node `v24.21.0` (`nvm use 24.21.0` if `node -v` is not that). `npm ci` first if `node_modules` is missing.
- Branch `feature/progression-readout`. Record `git rev-parse HEAD` before the first request.
- One process. `npm run dashboard -- --reset --seed 1847` on `http://127.0.0.1:4317`. Do not start a second seed.
- `GET /api/health` should be HTTP 200 `{"ok":true,"tick":0,"events":0}`.
- The player is already Mara Vane, `character-01`, `playerId` `prototype-player`. Do not pass another character. Do not post a command.
- Read state with `GET /api/state?limit=200`. The `events` array is newest first. Omit `beforeSequence`. Do not page backward. Both rows below are on the newest page after the second advance.
- Advance with `POST /api/advance`. At most 144 ticks per call. This plan uses 21, then 1.

## Hypothesis and ambition

**Hypothesis.** The feed stays quiet while a skill moves inside a whole number. It adds one sentence when a stored skill on `worked`, `travel-started`, or `battle-resolved` crosses a whole number, and only when that character's skills are already on the card. The sentence names the whole number. The card keeps the 3-decimal absolute. Nothing new is stored.

**Ambition.** Read Kessa Calder's trade at the open and again after 21 ticks, while it is still under 24 and no feed row says `rose`. Advance one more tick. Read the row that says her trade rose to 24, and read the card at 24.071. Read Jun Ash, whose skills are withheld, and confirm his worked rows do not say `rose`.

**What you can see.** Skills on Mara's card and on a World Government mate's card. Kessa's `progression.skills.trade`. The sentences below. Not Kessa's event payload (`data` null, `payloadWithheld` true). Not Jun Ash's skills after he leaves Crown Harbor.

## Characters

| Name | Id | What to watch |
| --- | --- | --- |
| Mara Vane | `character-01` | The viewer. She does not work. Her trade stays 57. |
| Kessa Calder | `character-10` | World Government, at Verdant Cay. Her trade crosses 24. |
| Jun Ash | `character-25` | Unaffiliated. Skills are on the card at Crown Harbor, then withheld at Glassport. |

## Tick 0, before any advance

`GET /api/health`. HTTP 200.

```json
{"ok":true,"tick":0,"events":0}
```

`GET /api/state?limit=200`. HTTP 200.

- `tick` 0. `day` 0. `commanderId` `character-01`.
- `player.id` `prototype-player`. `player.displayName` `Mara Vane`. `player.characterId` `character-01`.
- `eventPage` count 0, limit 200, total 0, `hasMore` false, `oldestSequence` null, `newestSequence` null, `cursor` null.
- `party.locationId` `crown-harbor`.

Mara Vane, `character-01`:

- `locationId` `crown-harbor`. `skillsNote` null. `intelligence.tier` `self`. `capabilityExact` true.
- `skills` strategy 72, leadership 77, navigation 38, trade 57.
- `troops` count 80, experience 0.668, discipline 0.76.
- `progression.skills` the same four numbers. `progression.troopQuality.band` `veteran`. `progression.feedCounts` worked 0, voyages 0, battles 0. `progression.battleTotals` victories 0, defeats 0.

Kessa Calder, `character-10`:

- `factionId` `world-government`. `locationId` `verdant-cay`. `travel` null. `skillsNote` null.
- `intelligence.tier` `faction`. `capabilityExact` true. `conditionExact` false.
- `skills` strategy 29, leadership 67, navigation 32, trade 23. `troops` null.
- `progression.troopQuality` null. `progression.feedCounts` worked 0, voyages 0, battles 0.

Jun Ash, `character-25`:

- `factionId` null. `locationId` `crown-harbor`. `skillsNote` null.
- `intelligence.tier` `co-located`. `capabilityExact` true.
- `skills` strategy 40, leadership 66, navigation 20, trade 24.
- `progression.troopQuality.band` `ordinary`. Experience 0.25. Discipline 0.652.
- `progression.feedCounts` worked 0, voyages 0, battles 0.

## Checkpoint 1. Twenty-one ticks, no crossing line

`POST /api/advance`

```json
{"ticks":21}
```

HTTP 200.

- `ok` true. `tick` 21. `day` 3.5. `ticksAdvanced` 21.
- `combatUpdated` false. `attentionUpdated` false. `pausedForBattle` false.
- `eventSequence` 2408.

`GET /api/state?limit=200`. HTTP 200.

- `tick` 21. `day` 3.5. `party.locationId` `crown-harbor`.
- `eventPage` count 200, limit 200, total 2408, `hasMore` true, `oldestSequence` 2209, `newestSequence` 2408, `cursor` 2209.
- No event summary contains `rose`.

Kessa Calder:

- `locationId` `verdant-cay`. `capabilityExact` true. `troops` null. `progression.troopQuality` null.
- `skills` strategy 29, leadership 67.429, navigation 32, trade 23.995.
- `progression.feedCounts` worked 13, voyages 0, battles 0.

Sequence 2342 is `worked`, actor `character-10`, tick 20. `payloadWithheld` true. `data` null. Summary:

`Kessa Calder worked at Verdant Cay.`

The summary does not contain `rose`, `trade`, or `23.995`. Her card is still under 24.

Jun Ash:

- `locationId` `glassport`. `skills` null. `capabilityExact` false.
- `skillsNote` `Jun Ash's leadership is withheld on this card. The reading is distant (reputation), so skills stay off the card.`
- `progression.skills` null. `progression.troopQuality` null.
- `progression.feedCounts` worked 6, voyages 2, battles 0.

His worked rows do not contain `rose`.

Mara's skills are unchanged: strategy 72, leadership 77, navigation 38, trade 57. `progression.feedCounts` is still 0, 0, 0. `progression.troopQuality.band` is still `veteran`.

## Checkpoint 2. The crossing

`POST /api/advance`

```json
{"ticks":1}
```

HTTP 200.

- `ok` true. `tick` 22. `day` 3.67. `ticksAdvanced` 1.
- `combatUpdated` false. `attentionUpdated` false. `pausedForBattle` false.
- `eventSequence` 2520.

`GET /api/state?limit=200`. HTTP 200.

- `tick` 22. `day` 3.67.
- `eventPage` count 200, limit 200, total 2520, `hasMore` true, `oldestSequence` 2321, `newestSequence` 2520, `cursor` 2321.

Sequence 2342 is still on this page. The summary is still `Kessa Calder worked at Verdant Cay.`

Sequence 2449 is `worked`, actor `character-10`, settlement `verdant-cay`, tick 21, `day` 3.5. `payloadWithheld` true. `data` null. Summary:

`Kessa Calder worked at Verdant Cay. Kessa Calder's trade rose to 24.`

That is the only summary on the log that contains `rose`. It does not contain `24.071`.

Kessa Calder:

- `skills` strategy 29, leadership 67.462, navigation 32, trade 24.071.
- `progression.skills.trade` 24.071. `progression.feedCounts.worked` 14. `progression.troopQuality` null.

The card holds the 3-decimal trade. The feed names the whole number she crossed. Leadership moved from 67.429 to 67.462 and the row does not mention leadership.

Jun Ash is still distant. `skills` null. `progression.feedCounts` worked 7, voyages 2, battles 0. Sequence 2501, tick 21, `payloadWithheld` true, summary:

`Jun Ash worked at Glassport. Tax of 2.38 went to the treasury.`

That summary does not contain `rose`.

Stop this process.
