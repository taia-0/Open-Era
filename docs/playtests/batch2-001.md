# Playtest plan: batch 2 offices, news, levy, contracts, and a declaration

This is the plan for a blind operator. It is not a completed session. Do not run it as part of writing the change. Do not open `src/`, `tests/`, the branch diff, or `docs/design/` during the session. Use only the dashboard HTTP JSON.

One process. Seed 1847. Mara Vane stays the viewer. Issue no command. The first tick's treasury line is the morning spending. The tax sentence on that same tick names one figure and does not add a second line. Tick 72 still has two factions and no contract. A later advance names unrest on a Free Tide cut. The advance after that offers a contract and does not print the price. The advance that ends at tick 864 declares Glassport and names no leader.

The values below were read from one process on this branch after the buyer-as-carrier fix and the batch 2 re-pin, seed 1847, `playerId` `prototype-player`, no command. A live session skips her autonomous tax step. World Government's rate stays 0.14 through this plan. A headless run is a different tape after tick 72.

## Setup

- Node `v24.21.0` (`nvm use 24.21.0` if `node -v` is not that). `npm ci` first if `node_modules` is missing.
- Branch `feature/batch2`. Record `git rev-parse HEAD` before the first request. These readings are from the batch 2 re-pin. A later commit that does not change `src/` should match.
- One process. `npm run dashboard -- --reset --seed 1847` on `http://127.0.0.1:4317`. Do not start a second seed.
- `GET /api/health` should be HTTP 200 `{"ok":true,"tick":0,"events":0}`.
- The player is already Mara Vane, `character-01`, `playerId` `prototype-player`. Do not pass another character. Do not post a command.
- Advance with `POST /api/advance`. At most 144 ticks per call. An advance stops early when she is captured, released, or in her own battle. Read `ticksAdvanced`, `attentionUpdated`, `pausedForBattle`, and `tick` before the next call. On this reading none of those calls paused.
- The advance body includes every event that call produced, newest first. Do not page backward for the rows named below. They are in that body.
- Read the world with `GET /api/state?limit=1`.

## Hypothesis and ambition

**Hypothesis.** The first morning's treasury line shows spending of 54 beside tax income of 1.58. A withheld trade on that tick says the tax was 1.58 and does not add a levy sentence. At tick 72 World Government is still 0.14, the treasury is 17904.84, there is no third faction, and `contracts` is empty. The advance that ends at tick 120 says Pax Ash lowered Free Tide to 7% because of unrest, and the row withholds the payload. The advance that ends at tick 144 offers a contract and does not print 56.25. The advance that ends at tick 864 says Dax Pike declared Glassport, the new treasury starts empty, and there is no leader yet.

**Ambition.** Read the tick-1 treasury line and Zara Gale's tax sentence. Read tick 72. Read the unrest cut. Read Bram Quill's offer. Read the Glassport declaration.

**What you can see.** World Government's treasury, rate, and treasury line. The public tax sentence. The public contract sentence, without the price. The public declaration, without the payload. Not Free Tide's treasury (`treasury` null). Not a contract price or quantity on her JSON.

## Characters

| Name | Id | What to watch |
| --- | --- | --- |
| Mara Vane | `character-01` | The viewer. World Government holder. She stays at Crown Harbor with 108. Her rate stays 0.14. |
| Zara Gale | `character-17` | The tick-0 trade whose tax sentence is 1.58. |
| Pax Ash | `character-14` | Lowers Free Tide to 7% on the tick-120 advance, reason unrest. |
| Bram Quill | `character-02` | Offers a contract on the tick-144 advance. The summary does not name the price. |
| Dax Pike | `character-20` | Declares Glassport on the tick-864 advance. |

## Tick 0, before any advance

`GET /api/health`. HTTP 200.

```json
{"ok":true,"tick":0,"events":0}
```

`GET /api/state?limit=1`. HTTP 200.

- `tick` 0. `day` 0.
- `player.id` `prototype-player`. `player.displayName` `Mara Vane`. `player.characterId` `character-01`.
- `party.locationId` `crown-harbor`. `party.hold.money` 108.

World Government:

- `taxRate` 0.14. `treasury` 18000. `actingCommanderId` null.
- `treasuryLine` `Tax income 0, spending 0, over the last 180 ticks.`

Free Tide Compact: `taxRate` 0.08. `treasury` null. `treasuryLine` null.

`factions` has those two names and no other. `contracts` is `[]`.

Mara Vane, `character-01`: `morale` 93. `money` 108. `locationId` `crown-harbor`.

## Checkpoint 1. The first tick

`POST /api/advance`

```json
{"ticks":1}
```

HTTP 200.

- `ok` true. `tick` 1. `day` 0.17. `ticksAdvanced` 1.
- `combatUpdated` false. `attentionUpdated` false. `pausedForBattle` false.
- `eventSequence` 182.

In that response, sequence 108 is `market-trade`, actor `character-17`, tick 0. `payloadWithheld` true. Summary:

`Zara Gale traded at Crown Harbor. Tax of 1.58 went to the treasury.`

The summary does not contain `levy`.

`GET /api/state?limit=1`. HTTP 200. `tick` 1.

World Government:

- `treasury` 17911.58. `taxRate` 0.14.
- `treasuryLine` `Tax income 1.58, spending 54, over the last 180 ticks.`

Mara is still at `crown-harbor`. `party.hold.money` 108. `contracts` is still `[]`.

## Checkpoint 2. Tick 72

`POST /api/advance`

```json
{"ticks":71}
```

HTTP 200.

- `ok` true. `tick` 72. `day` 12. `ticksAdvanced` 71.
- `combatUpdated` false. `attentionUpdated` false. `pausedForBattle` false.
- `eventSequence` 8496.

`GET /api/state?limit=1`. HTTP 200. `tick` 72. `day` 12.

- `party.locationId` `crown-harbor`. `party.hold.money` 108.
- World Government `treasury` 17904.84. `taxRate` 0.14.
- `treasuryLine` `Tax income 2547.49, spending 2210.65, over the last 180 ticks.`
- Free Tide Compact `taxRate` 0.08. `treasury` null.
- `factions` is still only Free Tide Compact and World Government.
- `contracts` is `[]`.

## Checkpoint 3. The unrest cut

`POST /api/advance`

```json
{"ticks":24}
```

HTTP 200. `tick` 96. `ticksAdvanced` 24. No pause.

`POST /api/advance`

```json
{"ticks":24}
```

HTTP 200.

- `ok` true. `tick` 120. `day` 20. `ticksAdvanced` 24.
- `combatUpdated` false. `attentionUpdated` false. `pausedForBattle` false.
- `eventSequence` 14219.

In that response, sequence 11375 is `tax-rate-set`, actor `character-14`, tick 96. `payloadWithheld` true. `data` null. Summary:

`Pax Ash lowered the Free Tide Compact tax to 7% (unrest).`

The summary does not name a port.

## Checkpoint 4. An offer, without the price

`POST /api/advance`

```json
{"ticks":24}
```

HTTP 200.

- `ok` true. `tick` 144. `day` 24. `ticksAdvanced` 24.
- `combatUpdated` false. `attentionUpdated` false. `pausedForBattle` false.
- `eventSequence` 16956.

In that response, sequence 16039 is `contract-offered`, actor `character-02`, tick 136. `payloadWithheld` true. Summary:

`Bram Quill offered a contract.`

The summary does not contain `56.25`.

## Checkpoint 5. Glassport

From tick 144, `POST /api/advance` with `{"ticks":24}` thirty times. The thirtieth call ends at tick 864. None of these calls paused on this reading. If one returns `attentionUpdated` true or `pausedForBattle` true, stop and record that call. Do not issue a command to get past it.

The call that ends at tick 864:

- `ok` true. `tick` 864. `ticksAdvanced` 24.
- `combatUpdated` false. `attentionUpdated` false. `pausedForBattle` false.
- `eventSequence` 118034.

In that response, sequence 116792 is `secession-declared`, tick 856, `settlementId` `glassport`. `payloadWithheld` true. `data` null. Summary:

`Dax Pike declared Glassport separate from Free Tide Compact. Free Glassport starts with an empty treasury. (no leader yet)`

Sequence 114296, same response, is `tax-rate-set`, tick 840. Summary:

`Pax Ash lowered the Free Tide Compact tax to 21% (unrest at Glassport).`

`GET /api/state?limit=1`. HTTP 200. `tick` 864.

- World Government `taxRate` 0.14.
- Free Tide Compact `taxRate` 0.21. `treasury` null.
- A faction named `Free Glassport` is present. Its `taxRate` is 0.08. Its `treasury` is null.

## Session

Blind operator, 2026-10-26 (PT). Node v24.21.0. HEAD before the first request `e2e3d53233ddcad8dafdbb410a6cab4a97ba0140`. One process, `npm run dashboard -- --reset --seed 1847`. No command posted. No advance paused (all `attentionUpdated`/`pausedForBattle` false).

- Tick 0: health `{"ok":true,"tick":0,"events":0}`. Player Mara Vane `character-01`, `crown-harbor`, money 108, morale 93. WG 0.14 / 18000 / `Tax income 0, spending 0, over the last 180 ticks.` FT 0.08 / null / null. Two factions. `contracts` `[]`.
- Checkpoint 1: tick 1, day 0.17, eventSequence 182. Seq 108 `market-trade` character-17 tick 0, withheld: `Zara Gale traded at Crown Harbor. Tax of 1.58 went to the treasury.` No `levy`. WG 17911.58, `Tax income 1.58, spending 54, over the last 180 ticks.` Money 108, contracts `[]`.
- Checkpoint 2: tick 72, day 12, eventSequence 8496. WG 17904.84, 0.14, `Tax income 2547.49, spending 2210.65, over the last 180 ticks.` FT 0.08/null. Two factions. `contracts` `[]`. Mara morale 82.4.
- Checkpoint 3: tick 96 (seq 11366), then tick 120, day 20, eventSequence 14219. Seq 11375 `tax-rate-set` character-14 tick 96, withheld, data null: `Pax Ash lowered the Free Tide Compact tax to 7% (unrest).`
- Checkpoint 4: tick 144, day 24, eventSequence 16956. Seq 16039 `contract-offered` character-02 tick 136, withheld: `Bram Quill offered a contract.` No `56.25`.
- Checkpoint 5: 30 calls, no pause. Tick 864, eventSequence 118034. Seq 116792 `secession-declared` tick 856 glassport, withheld, data null: `Dax Pike declared Glassport separate from Free Tide Compact. Free Glassport starts with an empty treasury. (no leader yet)`. Seq 114296 tick 840: `Pax Ash lowered the Free Tide Compact tax to 21% (unrest at Glassport).` State: WG 0.14; FT 0.21/null; Free Glassport 0.08/null. Contract rows on her JSON show `quantity`, `price`, `escrow` null.

## Findings

Every checkpoint matched the plan verbatim. No mismatch. Observation outside the criteria: the tick-840 line says "lowered ... to 21%" while FT was at 7% earlier in this plan (rate rose in between, unobserved); a reader may find "lowered to 21%" surprising.

## Outcome

Hypothesis confirmed on every point.

## Recommendation

PROMOTE.
