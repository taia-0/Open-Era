# Playtest plan: contract feed polish, folded offers, merged orders, and refusal reasons

This is the plan for a blind operator. It is not a completed session. Do not run it as part of writing the change. Do not open `src/`, `tests/`, the branch diff, or `docs/design/` during the session. Use only the dashboard HTTP JSON.

One process. Seed 1847. Mara Vane stays the viewer. Issue no command. Contract rows are easier to read:
- An acceptance and its order on the same tick are one line.
- A refusal says why, without figures Mara cannot see.
- Repeated identical offers between the same pair, all ending the same way, fold into one line with a count.

The values below were read from one process on branch `fix/contract-feed-polish`, seed 1847, `playerId` `prototype-player`, no command.

## Setup

- Node `v24.21.0`. `npm ci` first if `node_modules` is missing.
- Branch `fix/contract-feed-polish`. Record `git rev-parse HEAD` before the first request. A later commit that does not change `src/` should match.
- One process. `npm run dashboard -- --reset --seed 1847` on `http://127.0.0.1:4317`. Do not start a second seed.
- `GET /api/health` should be HTTP 200 `{"ok":true,"tick":0,"events":0}`.
- Advance with `POST /api/advance`. The advance body includes every event that call produced, newest first.

## Hypothesis and ambition

**Hypothesis.** Each acceptance in the Iris Stone and Bram Quill Crown Harbor sequence is one line naming the order. Bram's tick-161 refusal gives a reason. Within one advance, the feed folds Iris's two identical offers to Toma Reef.

**Ambition.** Follow the haul cycle from tick 136 to 168 with fewer lines and no unexplained refusal.

**What you can see.** Public contract sentences, and a treasury draw where your faction paid. Not the price, the deadline, the score, or the stored refusal text.

## Characters

| Name | Id | What to watch |
| --- | --- | --- |
| Mara Vane | `character-01` | The viewer. |
| Bram Quill | `character-02` | Buyer at tick 136; carrier from tick 154. Refuses on tick 161. |
| Iris Stone | `character-06` | Carrier at tick 137; buyer from tick 145. |
| Toma Reef | `character-07` | Carrier of Iris's offers on ticks 194 and 209. |

## Checkpoint 1. To tick 144

`POST /api/advance` with `{"ticks":72}`, then `{"ticks":24}` three times. The calls end at ticks 72, 96, 120, and 144, `eventSequence` 8496, 11366, 14219, and 16958. None returns `attentionUpdated` or `pausedForBattle` true. The first three calls have no `contract-` row.

The tick-144 call has three contract rows, all `payloadWithheld` true:

- 16039, `contract-offered`, tick 136: `Bram Quill offered Iris Stone a contract to carry 10 provisions to Crown Harbor.`
- 16163, `contract-accepted`, tick 137: `Iris Stone accepted the contract and took the order to carry 10 provisions to Crown Harbor.` `foldedSequences` is `[16164]`. There is no row with sequence 16164.
- 16723, `contract-fulfilled`, tick 142: `Iris Stone fulfilled a contract.`

## Checkpoint 2. To tick 168

`POST /api/advance` with `{"ticks":24}`. The call ends at tick 168, `eventSequence` 19796. It has 20 `contract-` rows, all `payloadWithheld` true, including:

- 17666, tick 150: `Iris Stone accepted the contract and took the order to carry 10 provisions to Crown Harbor.`
- 18264, tick 155: `Bram Quill accepted the contract and took the order to carry 10 provisions to Crown Harbor.` The same line appears at 18495 (tick 157) and 18750 (tick 159).
- 18148 (tick 154) and 18624 (tick 158): `Iris Stone offered Bram Quill a contract to carry 10 provisions to Crown Harbor.` 18376 (tick 156) adds `Iris Stone drew 18 from the treasury and paid 38.25 from the purse.` These three are not folded, because the middle line reads differently for Mara.
- 18876, tick 160: the same offer line, unfolded. That offer was refused, which is a different ending.
- 18994, `contract-refused`, tick 161: `Bram Quill refused a contract: they could not make the voyage.`
- 17788, `contract-cancelled`, tick 151: `Lio Crow's contract was cancelled because the port no longer needs it.`
- No row has sequence 16164, 17202, 17547, 17667, 18265, 18496, or 18751. Those orders were merged into their acceptances.

## Checkpoint 3. A folded offer

`POST /api/advance` with `{"ticks":24}` twice. The calls end at ticks 192 and 216, `eventSequence` 22556 and 25265.

The tick-216 call has, all `payloadWithheld` true:

- 24468, `contract-offered`, tick 209: `Iris Stone offered Toma Reef (World Government) a contract to carry 10 provisions to Crown Harbor (2 times).` `count` 2, `foldedSequences` `[22795]`. There is no row with sequence 22795.
- 24591, tick 210: `Toma Reef (World Government) accepted the contract and took the order to carry 10 provisions to Crown Harbor.`
- 22906, tick 195: the same acceptance line.

## Outcome

Not yet run.

## Recommendation

Pending the blind session.
