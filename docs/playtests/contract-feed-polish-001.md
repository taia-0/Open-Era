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

Run 2026-10-26 by the blind operator. HEAD `127a733e11e59f045ded656b805119bd101e8569`, Node v24.21.0, one process, seed 1847, no command issued. `/api/health` returned `{"ok":true,"tick":0,"events":0}`.

**Checkpoint 1: match.** Advances ended at ticks 72 / 96 / 120 / 144 with `eventSequence` 8496 / 11366 / 14219 / 16958. Every call returned `attentionUpdated` false and `pausedForBattle` false. The first three calls had no `contract-` rows. The tick-144 call had exactly three, all `payloadWithheld` true: 16039 (t136) "Bram Quill offered Iris Stone a contract to carry 10 provisions to Crown Harbor."; 16163 (t137) "Iris Stone accepted the contract and took the order to carry 10 provisions to Crown Harbor." with `foldedSequences` [16164] and no 16164 row; and 16723 (t142) "Iris Stone fulfilled a contract."

**Checkpoint 2: match.** The call ended at tick 168 with `eventSequence` 19796 and had 20 `contract-` rows, all withheld. The merged acceptances were 17666 (t150, Iris), and 18264 / 18495 / 18750 (t155 / 157 / 159, Bram), each with the order folded in. Iris's offers at 18148 (t154) and 18624 (t158) were not folded. 18376 (t156) carried "Iris Stone drew 18 from the treasury and paid 38.25 from the purse." 18876 (t160) was the offer line, unfolded. 18994 (t161) read "Bram Quill refused a contract: they could not make the voyage." 17788 (t151) read "Lio Crow's contract was cancelled because the port no longer needs it." None of 16164, 17202, 17547, 17667, 18265, 18496, or 18751 appeared.

**Checkpoint 3: match.** The calls ended at ticks 192 / 216 with `eventSequence` 22556 / 25265 (18 and 31 contract rows). 24468 (t209) read "Iris Stone offered Toma Reef (World Government) a contract to carry 10 provisions to Crown Harbor (2 times)." with `count` 2 and `foldedSequences` [22795], and there was no 22795 row. 24591 (t210) and 22906 (t195) carried the Toma Reef acceptance line, merged.

**Findings.** No mismatches. Side observations: "Bram Quill missed a contract." (t196, `contract-breached`) gives no reason, unlike refusals. Lio Crow refused three times with the same "could not make the voyage" (t182, t196, t213).

## Recommendation

**PROMOTE.** Every checkpoint matched verbatim, and the hypothesis held: acceptances read as one line naming the order, the tick-161 refusal gives a figure-free reason, and Iris's two offers to Toma fold within one advance. The ambition was met: ticks 136–168 have fewer lines and no unexplained refusal. A possible follow-up is a reason on `contract-breached` lines.
