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

Session run by a blind operator on 2026-10-26 on branch `fix/batch2-polish` at `73479d078cf9821a159a5e7087344c37a96f86a0`. Node `v24.21.0`. One process, seed 1847, viewer `prototype-player`, no command. `GET /api/health` returned `{"ok":true,"tick":0,"events":0}`.

Checkpoint 1 (dry hold): match. Advance 72 ended at tick 72, `eventSequence` 8496, `attentionUpdated` false, `pausedForBattle` false. Seq 7191 tick 61 `character-upkeep`, withheld false: "Mara Vane's upkeep was recorded." Seq 7314 tick 62: "Mara Vane's upkeep was recorded. The hold was short 0.288 provisions, so morale fell to 94.79 and health to 99.77." Seq 7443 tick 63: "Mara Vane's upkeep was recorded. The hold was short 0.576 provisions, so morale fell to 93.41 and health to 99.31." Mara's `morale` at tick 72: 82.4.

Checkpoint 2 (offer): match. Calls ended at ticks 96/120/144, `eventSequence` 11366/14219/16956. Seq 16039 `contract-offered`, tick 136, withheld true: "Bram Quill offered Iris Stone a contract to carry 10 provisions to Crown Harbor." No `56.25`.

Checkpoint 3 (rate history): match. 30 calls from 144 to 864, none with `attentionUpdated` or `pausedForBattle` true. Tick 840 call `eventSequence` 114287 holds seq 110580 tick 816: "Pax Ash raised the Free Tide Compact tax from 21% to 22% (treasury short)." Tick 864 call `eventSequence` 118034 holds seq 114296 tick 840: "Pax Ash lowered the Free Tide Compact tax from 22% to 21% (unrest at Glassport)." Raises seen from tick 336 onward, each one point and "(treasury short)": 7→8 (336), 8→9 (360), 9→10 (384), 10→11 (408), 11→12 (528), 12→13 (552), 13→14 (576), 14→15 (648), 15→16 (672), 16→17 (696), 17→18 (720), 18→19 (744), 19→20 (768), 20→21 (792), 21→22 (816).

Findings: no mismatch. Every string, sequence and value matched the plan word for word.

## Recommendation

PROMOTE. All three checkpoints matched exactly. The hypothesis holds: the dry hold explains morale, the offer names carrier and cargo without the price, and every tax step names the rate before and after.
