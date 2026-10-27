# Playtest plan: batch 2 polish, tax steps, contract offers, and a dry hold

This is the plan for a blind operator. It is not a completed session. Do not run it as part of writing the change. Do not open `src/`, `tests/`, the branch diff, or `docs/design/` during the session. Use only the dashboard HTTP JSON.

One process. Seed 1847. Mara Vane stays the viewer. Issue no command. When her hold runs dry before tick 72, her own upkeep rows say why morale fell. A contract offer names the carrier and the cargo and does not print the price. Every Free Tide tax step names the rate it came from, so the tick 840 cut reads as a cut from 22%.

The values below were read from one process on branch `fix/batch2-polish`, seed 1847, `playerId` `prototype-player`, no command.

## Setup

- Node `v24.21.0` (`nvm use 24.21.0` if `node -v` is not that). `npm ci` first if `node_modules` is missing.
- Branch `fix/batch2-polish`. Record `git rev-parse HEAD` before the first request. A later commit that does not change `src/` should match.
- One process. `npm run dashboard -- --reset --seed 1847` on `http://127.0.0.1:4317`. Do not start a second seed.
- `GET /api/health` should be HTTP 200 `{"ok":true,"tick":0,"events":0}`.
- Advance with `POST /api/advance`. At most 144 ticks per call. The advance body includes every event that call produced, newest first. Do not page backward for the rows named below.
- Read the world with `GET /api/state?limit=1`.

## Hypothesis and ambition

**Hypothesis.** Mara's own upkeep rows from tick 62 say the hold was short and give her new morale and health. A row on a fed tick adds nothing. Bram Quill's tick-136 offer says who carries what to where, without 56.25. The tick 816 raise and the tick 840 cut each name the rate before and after.

**Ambition.** Explain why her morale is 82.4 at tick 72. Read the offer. Follow Free Tide's rate from 7% to 21%.

**What you can see.** Her own upkeep clause. The public offer sentence. Public tax sentences. Not the contract price. Not Free Tide's treasury.

## Characters

| Name | Id | What to watch |
| --- | --- | --- |
| Mara Vane | `character-01` | The viewer. Her hold runs dry on tick 62. |
| Bram Quill | `character-02` | Offers Iris Stone a haul on tick 136. |
| Iris Stone | `character-06` | The named carrier. |
| Pax Ash | `character-14` | Steps the Free Tide rate. |

## Checkpoint 1. The dry hold

`POST /api/advance` with `{"ticks":72}`. HTTP 200. `tick` 72. `eventSequence` 8496. `attentionUpdated` false. `pausedForBattle` false.

In that response:

- Sequence 7191, `character-upkeep`, tick 61, `payloadWithheld` false: `Mara Vane's upkeep was recorded.`
- Sequence 7314, tick 62: `Mara Vane's upkeep was recorded. The hold was short 0.288 provisions, so morale fell to 94.79 and health to 99.77.`
- Sequence 7443, tick 63: `Mara Vane's upkeep was recorded. The hold was short 0.576 provisions, so morale fell to 93.41 and health to 99.31.`

`GET /api/state?limit=1`. Mara's `morale` is 82.4.

## Checkpoint 2. The offer

`POST /api/advance` with `{"ticks":24}` three times. The third call ends at tick 144, `eventSequence` 16956.

In that response, sequence 16039 is `contract-offered`, tick 136, `payloadWithheld` true:

`Bram Quill offered Iris Stone a contract to carry 10 provisions to Crown Harbor.`

The summary does not contain `56.25`.

## Checkpoint 3. The rate history

From tick 144, `POST /api/advance` with `{"ticks":24}` until the call that ends at tick 864. That is 30 calls. If a call returns `attentionUpdated` true or `pausedForBattle` true, stop and record it.

- The call that ends at tick 840, `eventSequence` 114287, has sequence 110580, `tax-rate-set`, tick 816: `Pax Ash raised the Free Tide Compact tax from 21% to 22% (treasury short).`
- The call that ends at tick 864, `eventSequence` 118034, has sequence 114296, tick 840: `Pax Ash lowered the Free Tide Compact tax from 22% to 21% (unrest at Glassport).`
- Each earlier raise from tick 336 onward says `raised ... from N% to N+1% (treasury short)`.

## Outcome

Leave this blank until the session.

## Recommendation

Leave this blank until the session. `PROMOTE`, `REVISE`, or `ABANDON` belongs to the operator.
