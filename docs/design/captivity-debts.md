# Captivity debts

**Status: Open.** Proposal for the owner to accept, change, or reject. This tree is `2918554`, the merge of PR #27, which includes M23. The headless runs below are that unmodified tree. The collection rule was patched in locally to measure it, then reverted. This note is not decided until it moves into [world simulation](world-simulation.md). It follows the last paragraph of [order confirmation](order-confirmation.md): a debt is owed to a faction, and the order-confirmation hook is the wrong place to collect it.

**Correction (M34.2).** The release-day coins no longer arrive nowhere. [Ransom split](ransom-split.md) is the rule. Half of what was paid goes to the captor faction's treasury and half to that faction's party leader. The odd cent goes to the treasury. When the captor has no faction, the leader receives every cent. The debt is still the unpaid remainder. The tables below were measured on `2918554`, before that split, and they are not rewritten.

**Correction (2026-10-01).** The half-and-half sentence above is superseded. A captor with a faction receives the whole payment in that faction's treasury. The party leader receives 0. A captor with no faction still receives the whole payment on the party leader. The debt is still the unpaid remainder. [Ransom split](ransom-split.md).

Runs are `createPrototypeWorld` plus `runTick`, no player commands, seeds 1847 / 2718 / 4096, Node v24.21.0, ICU 78.3. Tick numbers on events are the `tick` field. `npm test` on this tree passes, 170 tests. The 72-tick hashes match `tests/fixtures/golden-hashes.json` (`d7eb02eb…`, `d0b4b449…`, `d5d9da8b…`; 8275, 8489, 8003 events). M23 did not change that fixture. The same three seeds at tick 1200 also match `6d7badb`, the tree before M23, including every release row and debt id below. Long runs are 1200 ticks. Median is the average of the two central values when the count is even.

M18 through M23 are in this tree. M24 (ration floor), M25 (one open order per issuer and recipient), M26 (a paid provisions delivery, with the price held outside both purses), and M27 (an unanswered completion report closes itself) are accepted and not built. M24 and M25 do not read a debt.

## How a debt is created

`processCaptivityDeadlines` (`src/sim/engine.ts`) is the only writer. `runTick` calls it after `processPlayerCommands` and before `progressTroopRecoveries`. For each character, sorted by id, it runs when `captivity` is set and `world.tick >= mandatoryReleaseTick`.

That tick is set at capture. `attemptCapture` stores `captorFactionId: world.settlements[settlementId].factionId` and `mandatoryReleaseTick: world.tick + 14 * world.ticksPerDay`. `ticksPerDay` is 6, so the term is 84 ticks, fourteen days. Every release in these runs is that tick: `capturedTick + 84`.

The demand is one RNG draw, `rng.between(0.55, 1)`, and then no further draw:

```
physicalAverage = the mean of the four attributes
systemMaximum   = round(clamp(50 + scatteredTroops.count * 2 + physicalAverage * 0.5, 75, 600), 2)
demandedValue   = round(systemMaximum * that draw, 2)
moneyPaid       = round(min(character.money, demandedValue), 2)
debtValue       = round(demandedValue - moneyPaid, 2)
```

`round` to 2 digits is the money helper. The system maximum sits between 75 and 600, so the demand sits between 41.25 and 600. Measured demands on the debt rows run from 71.58 to 537.44.

If `debtValue > 0`, the function builds a `DebtObligation` and puts it on the `captivity-released` event. `applyEvent` (`src/sim/state.ts`) sets `actor.money` to `characterMoney` and pushes the object onto `actor.debts`. On this measured tree it did not write a treasury, so the coins in `moneyPaid` left the purse and arrived nowhere. That is no longer the rule: see the correction above and [ransom split](ransom-split.md). Escapes write no debt: `escapeCaptivity` emits `captivity-escaped` and never builds one. These runs have 0 escapes.

The id is `debt-` plus `nextEventSequence` padded to 6 digits, read before `emit`. That sequence is the release event's own sequence.

`DebtObligation` (`src/sim/types.ts`) is six fields. Nothing in `src/` reads `remainingValue` by name. The self projection copies the whole array, so the debtor's API includes every field, and no system acts on them.

| Field | What is written | What reads it |
| --- | --- | --- |
| `id` | `debt-` plus the release sequence | The object is copied onto the debtor's own projection. No lookup. |
| `creditorFactionId` | The captor faction at capture, or null if that port had no faction | Same. Not read again at release, so a port that changed hands does not move the creditor. |
| `originalValue` | `debtValue` | Same. |
| `remainingValue` | The same number as `originalValue` | Nothing. It stays equal to `originalValue` for the rest of the run. |
| `incurredTick` | The release tick | Same. |
| `reason` | Always `"prisoner-release"` | Same. |

The debtor is the character. The row lives on `character.debts`. The creditor is a faction id, or null. The treasury is a number on the faction, not a party to the row. No row in these runs has a null creditor, an unaffiliated debtor, or a debtor whose faction is the creditor.

## Measured on this tree

Twenty-two releases, sixteen debts, six paid in full, two still held at tick 1200. `remainingValue` equals `originalValue` on every row. Repayments under the current code: 0. Defaults: 0.

| Seed | Captures | Releases | Debts | Paid in full | Still held | Debt total | min | median | max |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1847 | 10 | 10 | 8 | 2 | 0 | 2254.16 | 58.18 | 285.55 | 490.26 |
| 2718 | 3 | 3 | 2 | 1 | 0 | 332.62 | 30.13 | 166.31 | 302.49 |
| 4096 | 11 | 9 | 6 | 3 | 2 | 1043.79 | 53.91 | 191.525 | 253.98 |

Coins that left purses at release (`moneyPaid`, including the six full payments): 798.46, 281.34, 597.43. Direction of the sixteen debts: Free Tide owes World Government 1982.47, 332.62, and 1043.79. World Government owes Free Tide 271.69, and only on seed 1847 (Sable Morrow 58.18, Niko Wren 213.51).

On every debt row the purse before the release is less than the demand, and the purse on the event is 0. The character cannot cover the remainder at that moment. The faction treasury can. The smallest debtor-faction treasury at a release that created a debt is 3686.95 (Free Tide, Dax Pike, tick 275). The largest debt is 490.26. Every creditor treasury at those ticks is also in the thousands, including Free Tide at 3363.89 on the tick it held no port.

The six full payments are Finn Frost at 410 (79.72 from a purse of 5410.52) and 838 (191.65 from 1094.3), Zara Gale at 480 (134.75 from 4868.23), and on 4096 Sable Morrow at 96 (94.15 from 130.34), Dax Pike at 102 (79.88 from 175.13), and Esme Dusk at 123 (60.28 from 60.35, leaving 0.07). Still held on 4096, so no new debt yet: Pax Ash, captured at 1121, release due at 1205, purse 46.44, already carrying two debts; Finn Frost, captured at 1147, release due at 1231, purse 16.35, no earlier debt.

After the release the purse often refills and is spent again. A lump equal to the debt is in the purse at least once for five of the sixteen rows: Sable at tick 135, Dax at 350, Corin Hale at 212, Finn Frost at 862, Mina Vale at 1015. The other eleven never hold it through tick 1200. Fourteen days after the debt, the unmodified purse covers three of the fifteen rows that have had fourteen days: Corin 686.34 against 30.13, Finn 1526.36 against 302.49, Mina 667.42 against 53.91. Niko's debt is tick 1186, so day 14 falls past the run; at tick 1200 his purse is 112.36 against 213.51.

Wages pass through. Esme Dusk's first debt on 1847 is 453.85. She works 130 ticks after it for 1860.89 net, and the purse peaks at 127.61. Sable works 237 ticks for 3629.95 net and does hold her 58.18 by tick 135. A due-date lump sees the balance. It misses the wages that were earned and spent.

Five rows name a creditor that no longer holds the prison port at release. The creditor stays the faction from the capture.

| Tick | Who | Debt | Creditor | Port at release | Creditor's ports at release |
| ---: | --- | ---: | --- | --- | --- |
| 118 | Sable Morrow | 58.18 | free-tide | cinder-key, now world-government | none |
| 635 | Pax Ash | 490.26 | world-government | glassport, now free-tide | cinder-key, crown-harbor |
| 1030 | Pax Ash | 325.05 | world-government | crown-harbor, now free-tide | cinder-key |
| 1186 | Niko Wren | 213.51 | free-tide | glassport, now world-government | crown-harbor |
| 382 | Esme Dusk, seed 4096 | 175.17 | world-government | glassport, now free-tide | cinder-key, crown-harbor |

Free Tide holds no port at Sable's release, and on 331 ticks from that release through tick 1199. The debt stays. That treasury is 3363.89 at the release and 10365.49 at tick 1200. Debtors' own factions are also without a port on many of those ticks (Dax on 218, Esme's tick-634 debt on 170, the 4096 debtors on 196 to 289). The faction record and the treasury remain. [Landless faction](landless-faction.md) already keeps both.

Pax Ash holds three debts on 1847 (635, 921, 1030) and two on 4096 (394, 506). Esme holds two on each of those seeds (634 and 802; 382 and 481). Recapture while a debt is open: Esme at 718 on 1847, Pax at 837 and 946 on 1847, Esme at 397 on 4096, Pax at 422 and 1121 on 4096. The rows are not cleared when they are taken again.

The sixteen rows:

| Seed | Tick | Id | Debtor | Debt | Purse before | Max purse after | Day-14 purse | First tick the purse could cover it |
| ---: | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1847 | 118 | debt-013651 | Sable Morrow, character-04 | 58.18 | 13.4 | 1493.67 | 37.78 | 135 |
| 1847 | 275 | debt-032791 | Dax Pike, character-20 | 86.16 | 60.48 | 1787.77 | 41.91 | 350 |
| 1847 | 634 | debt-081942 | Esme Dusk, character-19 | 453.85 | 4.43 | 127.61 | 31.25 | — |
| 1847 | 635 | debt-082082 | Pax Ash, character-14 | 490.26 | 39 | 118.16 | 26.64 | — |
| 1847 | 802 | debt-105423 | Esme Dusk | 246.05 | 31.25 | 96.43 | 15.47 | — |
| 1847 | 921 | debt-122227 | Pax Ash | 381.1 | 49.2 | 118.16 | 5.4 | — |
| 1847 | 1030 | debt-137710 | Pax Ash | 325.05 | 5.4 | 118.16 | 118.16 | — |
| 1847 | 1186 | debt-160360 | Niko Wren, character-03 | 213.51 | 323.93 | 152.04 | — | — |
| 2718 | 202 | debt-024335 | Corin Hale, character-16 | 30.13 | 49 | 1422.08 | 686.34 | 212 |
| 2718 | 840 | debt-113558 | Finn Frost, character-18 | 302.49 | 97.59 | 2091.79 | 1526.36 | 862 |
| 4096 | 382 | debt-046725 | Esme Dusk | 175.17 | 11.2 | 76.14 | 1.55 | — |
| 4096 | 394 | debt-048285 | Pax Ash | 242.17 | 16.65 | 99.9 | 7.36 | — |
| 4096 | 481 | debt-059444 | Esme Dusk | 110.68 | 1.55 | 76.14 | 18.86 | — |
| 4096 | 487 | debt-060233 | Corin Hale | 207.88 | 45.16 | 168.44 | 141.66 | — |
| 4096 | 506 | debt-062860 | Pax Ash | 253.98 | 7.36 | 99.9 | 0 | — |
| 4096 | 1004 | debt-134282 | Mina Vale, character-15 | 53.91 | 281.2 | 1257.86 | 667.42 | 1015 |

At tick 1200 the thirty purses run from 0 to 17114.07, 19615.48, and 16664.66. Medians are 102.215, 83.73, and 110.895. Treasuries, World Government then Free Tide: 50208.42 / 10365.49, 50180.84 / 11790.23, 56300.3 / 8000.26. Sums of purses, then treasuries: 117165.75 and 60573.91, 131877.83 and 61971.07, 127048.86 and 64300.56.

## What was weighed

Four ways to make `remainingValue` move, and a default. No new RNG draw in any of them.

**The purse, one day's wages, each world day.** `workGross` (`src/sim/engine.ts`) is already `round(10 + leadership * 0.08 + trade * 0.07, 2)`, the gross of one `worked` tick before tax. Take `min(purse, remaining, that wage)` from the debtor and add it to the creditor faction's treasury. The balance above a day's wage stays, so a passage quote and a recruit can still be paid when the purse holds them. A missed day is skipped. The wages measured above are why this can finish a debt the balance never covers.

**The whole purse, each world day.** Same schedule, cap removed. On a day the purse holds more than the wage, this takes the trading float as well. Recruit already scores −1000 below 30 (`buildCandidates`), and a voyage the quote cannot cover scores −1000. Emptying the purse every morning grounds those choices until the debt is gone.

**A lump on a due date.** Fourteen days is the term the capture already uses. On the unmodified purses that lump finds enough money on 3 of the 15 debts that have had fourteen days, and on 5 of 16 if it waits until the first tick the purse can cover it. The other rows would need a default. Those five figures are balances on the unmodified run. They are not a second simulation: paying the lump would change the purse from that tick on, the way the prototype below does.

**The debtor's faction treasury, or its income.** Every measured treasury can pay the debt on the release tick. That clears the sixteen rows without touching a purse. It also sends the bill to the faction. The row is on the character, and the ransom already took the character's coins first. An unaffiliated character has no treasury; these runs have no such debtor, and the type allows one. Skimming tax or wages at `tradeTax` is a second writer on every sale and every `worked` event. `buildCandidates`, combat, and the ransom do not read `faction.treasury`. `tradeTax` adds `gross * taxRate` and then stores the new total. `factionPower` and `metrics-recorded` are the readers. A treasury payment would change those numbers. It was not run.

**A default.** The defeat deltas in `recordBattleConsequences` are a character-to-character write: trust −0.025, respect −0.008, fear +0.018, grievance +0.035, obligation +0.015. The creditor here is a faction. There is no faction relationship to attach them to, and the capture does not store a captor character. There is no reputation stat. The distant tier's source label is the string `"reputation"`. `settlement-claimed` is a surrender after a battle, not a debt. A missed installment emits nothing. The row stays open.

## The rule

Call it `collectCaptivityDebts`, from `runTick`, immediately after `processCaptivityDeadlines`. No new RNG call.

A world day is `world.tick % world.ticksPerDay === 0`. On that tick, for each character sorted by id, skip the character when `captivity` is set. Otherwise take the open debt with `remainingValue > 0` and `incurredTick < world.tick`, oldest `incurredTick`, then `id`. One payment per character per world day, toward that debt only. The next debt waits for a later day.

The creditor faction has to be in `world.factions`. If `creditorFactionId` is null or the record is gone, skip. Leave the purse and the row. These runs never hit that case. The rule is there so a debt from an unowned port does not delete coins.

```
paid            = round(min(character.money, remainingValue, workGross(character)), 2)
remainingValue  = round(remainingValue - paid, 2)
characterMoney  = round(character.money - paid, 2)
factionTreasury = round(faction.treasury + paid, 2)
```

Skip when `paid` is 0. A day the purse is empty emits nothing, and that day is not added on later. A day spent captive is the same: the next free world day pays one installment, not the backlog.

Emit `debt-repaid`. `actorId` is the debtor. `targetId` is the creditor faction. No `settlementId`. The data is `debtId`, `paid`, `remainingValue`, `originalValue`, `characterMoney`, `factionTreasury`, and `closed` (true when `remainingValue` is 0). `applyEvent` sets the purse and the treasury. While `closed` is false it writes `remainingValue`. When `closed` is true it removes the row. A paid debt is not kept at zero. No `relationship-changed`. No goal event. The release-day `moneyPaid` on this measured tree left the purse and did not enter the treasury. That sentence is stale. The current rule puts the whole payment in the captor treasury when the captor has a faction, and gives the whole payment to the party leader when the captor has no faction. [Ransom split](ransom-split.md).

A second capture does not clear an open row. Payments pause while `captivity` is set. A later release can push another `prisoner-release` row. The older one is first in the sort. Losing the last port does not close the debt and does not stop the credit. The landless faction still has its treasury, and the payment adds to it.

The same tick as the release does not pay. The release empties the purse whenever a debt is created (`moneyPaid` is the whole purse), and the day check also requires `world.tick > incurredTick`. A release that falls on a world day still only creates the row.

## Who can see it

Tiers are `characterVisibilityTier` in `src/dashboard/visibility.ts`: self, co-located, faction, distant. Co-located is the same port with neither party travelling, or any port the commander's faction holds. `projectCharacter` sets `debts` to the array for self and to null for everyone else, including a faction mate and a co-located rival. `projectFactions` shows treasury and power only for the commander's own faction. `eventPayloadVisible` returns true for the commander's own `actorId` and false for every other character-attributed event, whatever port it happened on. `projectEvent` still copies `type`, `actorId`, `targetId`, and `settlementId` when the payload is withheld, and replaces the summary with `Name: captivity released`. The rich summary in `eventSummary` (`src/dashboard/view-model.ts`) interpolates `moneyPaid` and `debtValue`, and it is used only when the payload is visible. The debtor sees the amount. Everyone else sees that a release happened, and `targetId` is the captor faction, which the capture event already carried.

Survey and party sightings do not copy a debt. `partySightingsAt` stores troops and `partyPower`. It does not copy `captivity` or `debts`. A targeted explore delivers that list and no ransom.

The collection event follows the same gate, plus one creditor line, because the treasury that receives the coins is already visible to that faction.

The debtor, self tier, sees the row: id, creditor, original, remaining, incurred tick, reason. Source `own-character`. They see the `debt-repaid` payload.

A member of the creditor faction, including a landless one, sees a ledger row on their own faction projection: debtor id, original, remaining, incurred tick, reason. They do not see the debtor's purse, cargo, or other debts. They see the `debt-repaid` payload, because `commander.factionId === targetId`. Their treasury number already moves in `projectFactions`.

A faction mate of the debtor who is not in the creditor faction sees `debts: null`. A co-located rival sees the live purse, the way any purse is exact at that tier, and `debts: null`. A distant character sees `debts: null` and money null. Survey and an officer's explore report gain no debt field.

A bystander still sees the event type and `targetId`. The summary stays `Name: debt repaid`. The amount stays in the payload.

**Anti-leak test.** `tests/redaction.test.ts`, beside "a character outside the commander's observation exposes identity only" and "only the commander's own orders are projected". A distant commander has `debts: null`, and the string of `remainingValue` is absent from that JSON. A co-located rival has live money and `debts: null`; editing `remainingValue` does not change their JSON. A faction mate of the debtor, in the other faction, has `debts: null`. The creditor faction's commander sees the ledger row and does not see `character.money` on it. `debt-repaid` has `data: null` for a bystander, and the summary does not contain `paid`. It is visible to the debtor and to a member of `targetId`. A `knowledge-updated` survey and a party sighting do not contain the debt id.

## M26 and M27

M26 holds the contract price on the contract, in neither purse and in no treasury, until the grain lands. This collector reads `character.money` and the creditor `faction.treasury`. It does not read a contract. Escrow cannot be seized for a ransom. Taking it would spend the delivery to pay a different faction.

M27's `confirmUnansweredOrders` closes one character's standing order. It signs a report. It does not read `debts`, a purse, or a treasury. The issuer-judgment path is the officer and the issuer. The debt is the prisoner and a faction. The two loops do not share a judgment. A contract can be fulfilled, and an order can close, while a ransom is still open.

Inside `runTick` the order is `produceSettlements`, `processPlayerCommands`, `processCaptivityDeadlines`, this collector, `progressTroopRecoveries`, `progressActiveBattles`, `expireStandingOrders`, then the character loop (upkeep, decisions, work, trade), then `metrics-recorded` and `tick-advanced`. M27 sits immediately after `expireStandingOrders`, so a confirm or a cancel queued for this tick still wins over the silent close, and both of those run after the ransom payment. A player command already queued spends before the collector, because `processPlayerCommands` is earlier. An autonomous recruit or voyage is chosen after the collector, so the installment has already left the purse. That is the tick-127 recruit below.

## Hash impact

The rule is hash-neutral inside 72 ticks. The first release on these seeds is tick 96, and the first debt is tick 118. Both are outside the fixture, whose events are ticks 0 through 71. The patched run emits 0 `debt-repaid` in that window. State hashes and event counts match the fixture. `rngState` matches (`1404827802`, `3536473515`, `382409966`).

| Seed | State hash | Events |
| ---: | --- | ---: |
| 1847 | `d7eb02eb0e6b835ee923147b855d0a91969a416115d0c3bd5c2650ff0e2b6a3f` | 8275 |
| 2718 | `d0b4b449ce9bc3fc27f0cfa15a5cc8ef04d5a2e6a9cdded2c2b11b6c4ca6583d` | 8489 |
| 4096 | `d5d9da8bb1e9c9bd86c93ccbaa570f04ea9052ea1b5d4b48f3452e2db6f0c0c7` | 8003 |

Over 1200 ticks the histories match until the first payment, then the lower purse changes a decision, and battles, claims, trades, and `rngState` move with it. The rule itself emits only `debt-repaid`. It writes no relationship. The relationship counts below are the later world.

The first new event is `debt-repaid`, inserted before that tick's `character-upkeep`.

| Seed | Tick | Who | Paid | Wage | Purse after the payment | Debt | Closed |
| ---: | ---: | --- | ---: | ---: | ---: | --- | --- |
| 1847 | 126 | Sable Morrow | 17.1 | 17.1 | 11.11 | debt-013651, was 58.18 | tick 156, six payments, 58.18 |
| 2718 | 210 | Corin Hale | 13.3 | 14.46 | 0 | debt-024335, was 30.13 | tick 222, three payments, 30.13 |
| 4096 | 390 | Esme Dusk | 13.55 | 13.55 | 0 | debt-046725, was 175.17 | tick 582, seventeen payments, 175.17 |

Tick 120 is a world day and Sable's debt already exists. There is no `debt-repaid` that tick: the purse at the collector could not pay a positive amount. The same is true of the world days between each of the other two releases and the first payment.

On 1847 tick 126 Sable still chooses `work`. The work score moves from 39.14 to 41.88. The gap is 2.74, which is 17.1 × 0.16, the money term in that candidate (`22 + max(0, 120 - money) * 0.16`). Tick 127 the baseline recruits and the prototype buys a local surplus. Recruit scores −1000 when `character.money < 30`. Her `worked` purse on tick 126 is 45.31 in the baseline and 28.21 in the prototype, 17.1 apart. On 2718 the first changed action is tick 215: Corin rests instead of working. On 4096 it is the payment tick itself: Esme works instead of buying provisions.

Those three baseline debts are the only baseline rows the prototype still contains. Later baseline debts do not occur, because the wars have moved. The payment totals below are the prototype's own history.

| Seed | `debt-repaid` | Money moved | Closed | Still open at 1200 | Events | `rngState` |
| ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1847 | 59 | 669.59 | 3 | 1 | 166425 | 4123845377 |
| 2718 | 34 | 496.02 | 2 | 0 | 166176 | 1443026878 |
| 4096 | 140 | 1901.16 | 6 | 2 | 161876 | 305352439 |

Baseline `rngState` at tick 1200 was `3051708422`, `659453473`, `1803987453`. Baseline event counts were 162418, 166192, 162558. Deltas are +4007, −16, −682.

End purses and treasuries, prototype then baseline. The payment is a transfer. The end totals also move because trade and ports move.

| Seed | Purses | Treasuries | Baseline purses | Baseline treasuries |
| ---: | ---: | ---: | ---: | ---: |
| 1847 | 116185.95 | 57480.85 | 117165.75 | 60573.91 |
| 2718 | 125911.45 | 59512.4 | 131877.83 | 61971.07 |
| 4096 | 129055.51 | 65945.05 | 127048.86 | 64300.56 |

`market-trade`: 5050, 5264, 5822 against 5132, 5507, 5847. `relationship-changed`: 4173, 4249, 4111 against 4075, 4231, 4146 (+98, +18, −35). `character-captured`: 4, 3, 16 against 10, 3, 11. `battle-resolved`: 33, 33, 37 against 34, 32, 32. `settlement-claimed`: 12, 12, 9 against 12, 11, 9.

The battle lists match until the first mismatched row. On 1847 that is baseline tick 191, Dax Pike at Crown Harbor, `defender-victory`, against the prototype's tick 230, Pax Ash at Glassport, `attacker-victory`. On 2718 it is baseline tick 553, Iris Stone at Glassport, `attacker-victory`, against tick 549, Corin Hale at Crown Harbor, `attacker-victory`. On 4096 it is baseline tick 397, Esme at Crown Harbor, `defender-victory`, `battle-048763`, against tick 398, the same person and port and outcome, `battle-048905`. Compared in order, 23, 16, and 19 battle rows differ, and 8, 6, and 5 claim rows differ. Battle ids are `battle-${nextEventSequence}`. The inserted payments advance that counter, and from the first changed decision the people and the outcomes move too.

Event-type deltas at tick 1200, prototype minus baseline. A missing type changed by 0.

| Event type | 1847 | 2718 | 4096 |
| --- | ---: | ---: | ---: |
| arrived | −8 | −58 | −1 |
| battle-phase-resolved | −21 | −8 | 0 |
| battle-resolved | −1 | +1 | +5 |
| battle-retreated | −7 | −1 | −1 |
| battle-started | −12 | −4 | +4 |
| captivity-released | −6 | 0 | +4 |
| character-captured | −6 | 0 | +5 |
| character-upkeep | +516 | +5 | −260 |
| debt-repaid | +59 | +34 | +140 |
| decision-made | +448 | +77 | +8 |
| goal-evolved | −11 | −1 | −6 |
| goal-progressed | +448 | +77 | +8 |
| knowledge-updated | +73 | −36 | −16 |
| market-trade | −82 | −243 | −25 |
| plan-reconsidered | +1905 | +24 | +30 |
| post-defeat-withdrawal-started | 0 | 0 | +1 |
| recruited | +35 | −9 | −20 |
| relationship-changed | +98 | +18 | −35 |
| rested | +1053 | +447 | +403 |
| scattered-troops-returned | −35 | 0 | +24 |
| settlement-claimed | 0 | +1 | 0 |
| settlement-produced | +18 | +5 | +4 |
| settlement-shortage | +429 | +500 | 0 |
| settlement-upkeep | −411 | −495 | +4 |
| standing-order-completion-reported | −1 | 0 | +1 |
| standing-order-deviated | +35 | 0 | −116 |
| standing-order-resumed | +35 | 0 | −115 |
| travel-progressed | +68 | −72 | −268 |
| travel-started | +3 | −54 | −6 |
| worked | −615 | −224 | −454 |

`npm run golden:update` stays unrun. The fixture already matches, because nothing in the window pays.

## Tests

- `tests/captivity.test.ts`, beside "the fourteen-day deadline forces release on bounded terms". With the purse set to 10, the release tick pushes one debt and does not emit `debt-repaid`. On the next world day, with the purse set to twice `workGross`, the event pays exactly that wage, `remainingValue` drops by it, the creditor treasury rises by it, and `rngState` is unchanged across the payment. A second, older debt on the same character is the one that is paid; the newer row is untouched that day. Setting `captivity` again emits nothing on the next world day, and the row is still there. A debt whose `creditorFactionId` is null leaves the purse and the row unchanged.
- `tests/redaction.test.ts`. The anti-leak test above. "a character outside the commander's observation exposes identity only" already requires distant `debts` to be null. Extend it so a non-zero `remainingValue` cannot appear in that JSON.
- `tests/golden.test.ts`. "pinned seeds reproduce their committed state hash and event count" stays on `d7eb02eb…`, `d0b4b449…`, `d5d9da8b…` (8275, 8489, 8003). The pin is not regenerated.

The local prototype was not left in the tree, so this note does not record a test run against it. The 72-tick comparison above is the golden assertion the patch would meet.

## Playtest

Follow `docs/playtests/TEMPLATE.md`. Dashboard HTTP JSON only, as in [informed-commitment-002](../playtests/informed-commitment-002.md). Seed 1847, Mara Vane (`character-01`), ticks 118–127. She starts at Crown Harbor. No commands. Sable Morrow (`character-04`) is released at tick 118 owing 58.18 to Free Tide, then at sea toward Glassport. The first `debt-repaid` is tick 126, while Sable is at Verdant Cay. Mara is not the debtor and not in the creditor faction, so she should see the event and not the amount.

**Hypothesis.** A ransom she does not owe is collected from the prisoner's purse on a world day, and the amount stays off her feed.

**Ambition.** Advance to tick 118 and read Sable's release. Advance to tick 126 and read the payment. Do not issue a command.

**Success.** At tick 118 the log has `captivity-released` for Sable, `payloadWithheld` true, and the summary has no `58.18`. Her projected `debts` is null. Mara's own `debts` is empty. At tick 126 the log has `debt-repaid` for Sable, `targetId` `free-tide`, `payloadWithheld` true, and the summary has no `17.1`. There is no `relationship-changed` whose trigger is the debt.

`PROMOTE` if the release and the payment show up that way and the amounts stay out of Mara's JSON. `REVISE` if she can read `58.18` or `17.1`, or if Sable's `debts` is filled in on Mara's projection. `ABANDON` if tick 132 still has no `debt-repaid` for Sable, or if the tick-118 release does not happen.

## Questions for Micah

1. **The prisoner cannot pay the whole ransom. Who pays the rest, and how often?** Default: the prisoner, from the coins they are carrying, up to what one day of work pays them, once each day. Their faction's treasury does not pay it for them.
2. **Who receives that money?** Default: the faction that held them when they were captured, into its treasury. This stays true after that faction loses its last port.
3. **On release day, the coins they do have leave their purse and do not arrive anywhere. Should those coins go to the captor too?** Default: leave them as they are for now. This change moves only the later daily payments.
4. **The purse is empty on the day a payment is due. What happens?** Default: that day passes. The debt stays. There is no extra penalty, no mark against their name, and no new reason to fight.
5. **They are captured again while the first ransom is unpaid. What happens to it?** Default: payments wait until they are free. The first debt remains. A second short ransom is a second debt. The older one is paid first.
6. **They have already set money aside to pay for a grain delivery. Can the ransom take it?** Default: no. That money is waiting for the grain. It is not in the purse, and collection only reads the purse.
7. **An officer says a job is done, and the report is waiting. Does signing it, or ignoring it, pay a ransom?** Default: no. The signature closes a job. The ransom is owed to a faction.
8. **Who is allowed to see the size of the debt?** Default: the prisoner sees their own. The faction that is owed sees who owes it and how much, and does not see the purse. Anyone else can see that a payment happened and which faction was paid, and cannot see the amount.

## Appendix

Baseline rows, on Node v24.21.0, ICU 78.3. `npm test` was run with that binary (`v24.21.0`, `process.versions.icu === "78.3"`). The 72-tick check is `npm test`, which includes `tests/golden.test.ts`.

```bash
node --experimental-strip-types --eval '
import { runTick } from "./src/sim/engine.ts";
import { createPrototypeWorld } from "./src/sim/scenario.ts";
import { stateHash } from "./src/sim/state.ts";
for (const seed of [1847, 2718, 4096]) {
  const world = createPrototypeWorld(seed);
  const rows = [];
  for (let i = 0; i < 1200; i++) {
    for (const event of runTick(world).events) {
      if (event.type !== "captivity-released") continue;
      const terms = event.data.terms;
      const debt = event.data.debt;
      rows.push({ tick: event.tick, actorId: event.actorId, demanded: terms.demandedValue, paid: terms.moneyPaid, debt: terms.debtValue, id: debt?.id ?? null, creditor: debt?.creditorFactionId ?? null });
    }
  }
  const amounts = rows.filter((row) => row.debt > 0).map((row) => row.debt);
  console.log(seed, stateHash(world), world.rngState, rows.length, amounts.length, rows);
}
'
```

The prototype inserted `collectCaptivityDebts` after `processCaptivityDeadlines` and a `debt-repaid` case in `applyEvent`, then deleted both. The case set `actor.money`, the creditor `treasury`, and either `remainingValue` or spliced the row when `closed` was true. The measured run also put `wage` on the event data. `applyEvent` did not store it. The world-state hash is `canonicalJson` of the world, so that extra event field is not part of it. Re-running the 1200 ticks and comparing event type, actor, and payload against the unmodified tree puts the first difference on the `debt-repaid` event at ticks 126, 210, and 390.
