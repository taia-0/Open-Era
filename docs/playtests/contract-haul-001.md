# Playtest plan: contract haul, the order, the landing, and a cancellation

This is the plan for a blind operator. It is not a completed session. Do not run it as part of writing the change. Do not open `src/`, `tests/`, the branch diff, or `docs/design/` during the session. Use only the dashboard HTTP JSON.

One process. Seed 1847. Mara Vane stays the viewer. Issue no command. A carrier who accepts a supply contract now takes an order, buys and sails, and lands the grain. A contract whose port has been refilled is cancelled, and the feed says the port no longer needs it.

The values below were read from one process on branch `feature/contract-haul`, seed 1847, `playerId` `prototype-player`, no command.

## Setup

- Node `v24.21.0` (`nvm use 24.21.0` if `node -v` is not that). `npm ci` first if `node_modules` is missing.
- Branch `feature/contract-haul`. Record `git rev-parse HEAD` before the first request. A later commit that does not change `src/` should match.
- One process. `npm run dashboard -- --reset --seed 1847` on `http://127.0.0.1:4317`. Do not start a second seed.
- `GET /api/health` should be HTTP 200 `{"ok":true,"tick":0,"events":0}`.
- Advance with `POST /api/advance`. At most 144 ticks per call. The advance body includes every event that call produced, newest first. Do not page backward for the rows named below.

## Hypothesis and ambition

**Hypothesis.** Bram Quill's tick-136 offer to Iris Stone is followed on tick 137 by her acceptance and a row saying she took the order to carry 10 provisions to Crown Harbor. She lands it on tick 142. On tick 151 Lio Crow's contract is cancelled because Crown Harbor no longer needs it.

**Ambition.** Follow one haul from offer to landing, and read why a later one ended without a landing or a breach.

**What you can see.** The public sentences for the offer, the acceptance, the order, the landing, and the cancellation. Not the price, the deadline, or the escrow: Mara is not a party.

## Characters

| Name | Id | What to watch |
| --- | --- | --- |
| Mara Vane | `character-01` | The viewer. |
| Bram Quill | `character-02` | Offers Iris Stone a haul on tick 136. |
| Iris Stone | `character-06` | Takes the order on tick 137 and lands it on tick 142. |
| Lio Crow | `character-12` | Takes an order on tick 149 that is cancelled on tick 151. |

## Checkpoint 1. The opening

`POST /api/advance` with `{"ticks":72}`. HTTP 200. `tick` 72. `eventSequence` 8496. `attentionUpdated` false. `pausedForBattle` false. No row in that response has a `type` starting with `contract-`.

## Checkpoint 2. One haul, offer to landing

`POST /api/advance` with `{"ticks":24}` three times. The calls end at ticks 96, 120, and 144, `eventSequence` 11366, 14219, and 16958. None returns `attentionUpdated` true or `pausedForBattle` true.

In the third response, all `payloadWithheld` true:

- Sequence 16039, `contract-offered`, tick 136: `Bram Quill offered Iris Stone a contract to carry 10 provisions to Crown Harbor.` The summary does not contain `56.25`.
- Sequence 16163, `contract-accepted`, tick 137: `Iris Stone accepted a contract.`
- Sequence 16164, `contract-order-issued`, tick 137: `Iris Stone took the order to carry 10 provisions to Crown Harbor.`
- Sequence 16723, `contract-fulfilled`, tick 142: `Iris Stone fulfilled a contract.`

## Checkpoint 3. A cancellation

`POST /api/advance` with `{"ticks":24}`. The call ends at tick 168, `eventSequence` 19796, with `attentionUpdated` false and `pausedForBattle` false.

In that response, all `payloadWithheld` true:

- Sequence 17546, `contract-accepted`, tick 149: `Lio Crow accepted a contract.`
- Sequence 17547, `contract-order-issued`, tick 149: `Lio Crow took the order to carry 10 provisions to Crown Harbor.`
- Sequence 17788, `contract-cancelled`, tick 151: `Lio Crow's contract was cancelled because the port no longer needs it.`
- No `contract-fulfilled` or `contract-breached` row for Lio Crow in that response.

## Outcome

Not yet run.

## Recommendation

Pending the blind session.
