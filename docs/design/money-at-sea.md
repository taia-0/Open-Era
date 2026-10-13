# Money at sea

**Status: Ruled.** The Lead's answers are in [Ruling](#ruling). Nothing in this note is in the tree. The census is a local readout of the baseline tape. Each writing rule was applied by a local harness, measured alone, and restored.

Checked on `origin/main` at `5107d7811abf87ed5775c9f774a29845ea046d72` (PR #115). Node v24.21.0, ICU 78.3. `npm test` passed, 439 tests. The 72-tick fixture passed, including the golden recovery replay of 600 events on seed 1847 split at tick 47. A headless run reproduced the fixture and the current 1200-tick baseline:

| Seed | Tick 72 state hash | Events | Tick 1200 state hash | Events |
| --- | --- | ---: | --- | ---: |
| 1847 | `86507558d49cee305c5f663e1699aacc19d66356ce518d4c32ac1e07085d8687` | 8426 | `9c22f0fe85a923526bc94f2f840a722d7d758509f35dd8422b9247e1c03750ac` | 164969 |
| 2718 | `c6268c398c5b8a674a1bef8a675cd74c747392e3fb767a67e1ebd8bc1a4143f6` | 8335 | `5169b16f45f28edfde3b6e8f230652ba40651b5e336d9225992ea1606e901688` | 164659 |
| 4096 | `d62ab7f9c9e840b55c012fb1d8f2fe6929a61359178b4daf7b5eb10cbf7bca95` | 8266 | `ec5ec0af8d0adb1586b1022f8acdc2ce85f948348e069f67ca4847e9510ce4da` | 164118 |

Runs are `createPrototypeWorld` plus `runTick`, no player commands. Seeds 1847, 2718, and 4096. A figure at tick 0 is the world before any `runTick`. A figure at tick 72 or tick 1200 is the world after that many calls. Tick numbers on events are the `tick` field. State samples below are tick 0 through tick 1200, 1201 states. Seeds below are 1847, 2718, and 4096, in that order. Coins are exact cents. A median of an even count is the average of the two central values.

[Game vision](game-vision.md) says a faction that becomes overwhelmingly powerful may remain dominant. The simulation does not manufacture a rebellion or move one purse into another treasury to restore balance. Defeat changes a story: captivity and debt are already on that list. [Fleet](fleet.md) says the character is the ship. [Treasury spending](treasury-spending.md) and [treasury balance](treasury-balance.md) are the draw: allowance first, then the purse, and the holder is uncapped. The allowance shrinks when the treasury is short. [Income](income.md) adopts the governor levy on its own, and a holder who empties the treasury is working as intended. [Ransom split](ransom-split.md) is question 24: a faction captor's treasury receives every cent that leaves the purse. [Captivity debts](captivity-debts.md) is the unpaid remainder. [Loyalty drift](loyalty-drift.md) is the scar already stored on that remainder. [Negotiation](negotiation.md) pays the ransom without a bargain. [News](news.md) is the ledger, and that ledger is not in this tree. [Captive intelligence](captive-intelligence.md) reads the prison and leaves the purse off the row. [Contracts](contracts.md) hold a price outside both purses. A headless run offers none.

## Summary

The purse is on the character. When the ship sails, `locationId` is null and `travel` is set, and the coins go with the hull. Cargo is goods. The treasury is a number on the faction. It does not sail.

On the 1201 states, ships at sea sum to 6706, 6745, and 6633 character-states. The purses on those states sum to 27918995.11, 30763101.64, and 31742297.80. The same purse is counted once per state, so that sum is not a stock of coin. The largest purse afloat on one state is 75123.07, 85445.46, and 116071.27, on 26, 25, and 25 ships. Tick 0 has nobody at sea. Opening purses, all of them ashore, are 5277.00, 4759.00, and 4672.00. Opening treasuries are 18000 and 2800.

A raid victory mints `35 + lootArms * 2` onto the attacker's purse and takes arms from the port. It does not read another purse. Defender-faction coin is sitting on the dock at 46, 32, and 35 of the 61, 42, and 39 victories. Capture does not take the purse. Across every release the purse at capture equals the purse at release, 12, 11, and 13 times. The release then pays `min(purse, demand)` into the captor treasury. The rest of a full purse stays. A short purse becomes a debt, and `remainingValue` is still the original on every row.

Passage is the loss. It sinks 11114.13, 10517.93, and 11004.07 from purses and 9010.97, 9719.99, and 8884.23 from treasuries. A sea tick that pays less than 3 happens 8, 4, and 14 times. The voyage is not turned around, and the purse is not wiped.

Tax and ransom credit the faction treasury while the holder is at sea, in prison, or absent. Free Tide's holder is at sea for 1851.45, 997.00, and 989.54 of its work tax and 2457.59, 1271.73, and 1349.99 of its sale tax. Free Tide still ends at 0.00, 0.00, and 0.00.

Releases are 12, 11, and 13. Paid in full is 2, 8, and 8. Partial is 8, 2, and 5, short 2584.76, 833.85, and 1846.53. Paid nothing is 2, 1, and 0, short 559.26, 581.86, and 0.00, and each of those purses was already 0. The loyalty scar is already stored on a release with a debt. The release does not write morale. Nothing collects the debt. The wage collector, measured alone, pays 1140.21, 1155.31, and 579.60 and leaves Free Tide at 0.00. The 72-tick fixture stays. Seizing the dock, or the whole purse at capture, moves coin into treasuries and moves the hash.

## 1. Where the coin is

`character.money` is the purse. `applyEvent` on `travel-started` sets `locationId` to null and copies `travel`. The purse is not a field of `travel`, and it is not moved to the destination or to the faction. `character-upkeep` while `travel` is set charges up to `PASSAGE_COST_PER_TICK`, which is 3. Allowance first, then the purse. The free command holder draws the treasury and is uncapped. The coins leave the world. A party that cannot pay the 3 pays what it can and keeps sailing.

`cargo` is provisions, arms, and the other goods. There is no coin in the hold. [Fleet](fleet.md) stores `sailors` and no hull. One character is one ship and one voyage.

`faction.treasury` is the treasury. Work tax and sale tax add to the faction that holds the settlement, in `tradeTax`, whether or not the command holder is on that dock. A `captivity-released` ransom adds `treasuryShare` to `treasuryFactionId`. A faction captor receives the whole payment. `leaderShare` on this tape is 0 on every release. A captive skips the character loop, so the purse is not spent, worked, or sailed while they are held. `quotedPassage` draws nothing for a captive.

The projection is a separate fact. A ship at sea is not co-located, the faction tier sets `conditionExact` false, and `projectCharacter` then leaves `money` null. The test that records this is "own-faction money stays hidden at sea, which the Lead left as an open question." The coins are on the character either way. [Sea sightings](sea-sightings.md) leave the hold and the purse off the row. [Captive intelligence](captive-intelligence.md) leaves the purse off the prison row.

## 2. Purse and coin at sea

| | World Government | Free Tide | Unaffiliated | Holder, any faction |
| --- | ---: | ---: | ---: | ---: |
| Ship-states | 2938 / 3393 / 2795 | 1384 / 1190 / 1445 | 1894 / 1676 / 1745 | 249 / 173 / 216 |
| Purse summed over those states | 12145758.35 / 14875809.03 / 9843135.13 | 3874284.32 / 2913784.26 / 5720375.81 | 7275446.77 / 7810334.49 / 10246115.34 | 351487.82 / 169435.34 / 89076.56 |

The mean purse on a ship-state, the summed purse divided by the ship-states and rounded to the cent, is 4163.29, 4560.87, and 4785.51. States whose ships carry a positive purse are 1197, 1194, and 1197 of 1201. At tick 1200 the purse still at sea is 21869.63, 76293.78, and 29893.40, on 3, 7, and 3 ships. Ashore purses, captives included, are 88842.93, 51828.08, and 96002.02. The captive part of that is 1569.95, 0.00, and 11.23.

Passage charges are counted on the upkeep, which runs while `travel` is set. The ship can arrive later in the same tick, so the charge count is higher than the end-of-tick ship-states: 6715, 6749, and 6643 charges against 6706, 6745, and 6633 ship-states.

| | From purses | From treasuries | Paid under 3 | Paid 0 |
| --- | ---: | ---: | ---: | ---: |
| Passage | 11114.13 / 10517.93 / 11004.07 | 9010.97 / 9719.99 / 8884.23 | 8 / 4 / 14 | 4 / 3 / 10 |

Ending treasuries are World Government 4035.27, 6029.16, and 10851.38, Free Tide 0.00, 0.00, and 0.00, and the world 7818.21, 10479.49, and 13253.98.

## 3. What the treasury receives while the holder is away

The holder is `commandHolderId`. Away, in this section, is `travel` set, or `captivity` set. A faction with no holder is the breakaway case: [secession](secession.md) founds one with no command holder, and the tax still credits that treasury.

| | Holder at sea | Holder captive | Holder ashore | No holder |
| --- | ---: | ---: | ---: | ---: |
| World Government work | 4.93 / 0.00 / 0.00 | 272.62 / 0.00 / 0.00 | 4468.64 / 5305.73 / 6442.32 | 0 |
| World Government sale | 9.91 / 0.00 / 0.00 | 466.79 / 0.00 / 0.00 | 10483.36 / 13047.37 / 16410.08 | 0 |
| Free Tide work | 1851.45 / 997.00 / 989.54 | 0.00 / 650.56 / 1303.45 | 2268.62 / 2040.17 / 2112.51 | 0 |
| Free Tide sale | 2457.59 / 1271.73 / 1349.99 | 0.00 / 1411.26 / 1436.83 | 3566.46 / 1412.31 / 2887.97 | 0 |
| Breakaway work | 0 | 0 | 0 | 2438.74 / 2547.22 / 1936.80 |
| Breakaway sale | 0 | 0 | 0 | 6313.30 / 6042.27 / 5256.49 |

World Government's sea tax is 4 work events and 1 sale, all on seed 1847. Free Tide's sea tax is 807, 679, and 440 work events and 159, 116, and 88 sales. The credit does not wait for a landfall.

Ransom credited while the receiving faction's holder is at sea is 24.48, 0.00, and 7.58, one release on 1847 and one on 4096. While that holder is captive it is 0.00, 0.00, and 164.88, two releases on 4096. While the creditor has no holder it is 1236.01, 139.84, and 536.16. Contract events are 0. Escapes are 0.

## 4. Seizable moments

An attacker victory mints coin. The mint, the attacker's new purse minus the purse at the start of that tick, is 4720.00, 2736.38, and 2691.04 across 61, 42, and 39 victories. Defeats are 11, 9, and 13. The mint is new coin. It is not taken from a purse or a treasury.

The coin that is physically on the dock is someone else's purse: `locationId` is the port, `travel` is null, and the character is not the attacker. Two piles:

| | Victories with defender coin on the dock | People | Sum of those purses | Other people on the dock | Sum of their purses |
| --- | ---: | ---: | ---: | ---: | ---: |
| Attacker victory | 46 / 32 / 35 | 91 / 75 / 77 | 208390.79 / 122160.61 / 177325.42 | 297 / 181 / 180 | 672263.78 / 428355.78 / 558184.53 |

The sums count a purse again at the next victory if it is still there. They are not a stock, and they are not what a seizure would move once. The battle writes `attackerMoney` and the port's arms. It leaves every other purse where it is.

On a defeat the attacker's own purse is at the port. That purse is positive on 10, 9, and 12 defeats, summing to 6399.51, 6216.98, and 36802.84. The defeat does not take it. A rule that did was not run.

Captures are 13, 11, and 14. The purse is positive on 11, 10, and 14 of them, summing to 12182.10, 21095.17, and 33946.20. `character-captured` writes health, morale, troops 0, and the captivity. It does not write `money`. The two empty purses on 1847 are Mara Vane at tick 837 and Corin Hale at tick 899. The empty purse on 2718 is Kessa Calder at tick 868. Still held at tick 1200, so the ransom is not rolled yet: Bram Tern on 1847, captured at 1180, purse 1569.95, release due at 1264; Mina Vale on 4096, captured at 1140, purse 11.23, release due at 1224, already carrying two debts.

## 5. Full, partial, and unpaid

`processCaptivityDeadlines` is the only ransom. Fourteen days after capture, `CAPTIVITY_MAX_DAYS` times `ticksPerDay` (6), one draw sets the demand between 41.25 and 600. `moneyPaid` is `min(purse, demand)` when a faction or a factionless leader can receive it. `debtValue` is the rest. A faction captor's treasury receives `moneyPaid`. The debt, when `debtValue > 0`, is pushed onto `character.debts` with `remainingValue` equal to `originalValue`. Nothing in `src/` reads `remainingValue` again. Paid in full is `debtValue === 0`. Partial paid something and left a debt. Paid nothing is `moneyPaid === 0`.

| | Captures | Releases | Full | Partial | Paid nothing | Full paid | Partial paid | Partial short | Unpaid short |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1847 | 13 | 12 | 2 | 8 | 2 | 847.27 | 452.72 | 2584.76 | 559.26 |
| 2718 | 11 | 11 | 8 | 2 | 1 | 1664.42 | 94.80 | 833.85 | 581.86 |
| 4096 | 14 | 13 | 8 | 5 | 0 | 1715.51 | 386.91 | 1846.53 | 0.00 |

The debt on those rows runs from 74.92 to 460.01, from 338.08 to 581.86, and from 128.19 to 492.53. Medians are 350.685, 495.77, and 383.28. The three purses that paid nothing were already 0: Mara Vane at tick 921, debt 146.01 to a breakaway; Corin Hale at tick 983, debt 413.25 to Free Tide; Kessa Calder at tick 952 on 2718, debt 581.86 to a breakaway. A partial release empties the purse. The surplus on a full release stays. Bram Tern pays 446.97 from 9758.07 on 1847, and 103.32 from 16141.56 on 4096.

On all 12, 11, and 13 releases the purse at capture equals the purse just before the payment. A lock that only stopped the prisoner spending would write nothing: the captive already skips the loop. An escrow field was not stored.

At tick 1200 the open rows are 10, 3, and 5. `remainingValue` equals `originalValue` on every one. The sums are 3144.02, 1415.71, and 1846.53. Repayments are 0.

`applyUnpaidReleaseScar` runs on a release whose `debtValue` is above 0 and whose character has a faction. It subtracts 0.04 from the loyalty the cover sort already reads, clamps that reading to 0.05–0.98, and stores the gap from `personality.loyalty`. A second unpaid release subtracts again. The scarred releases are 10, 3, and 5. Two readings finish under 0.25: Finn Frost on 1847 at 0.242, from a seed of 0.322 and an adjustment of −0.08, and Mina Vale on 4096 at 0.231, from 0.311 and −0.08. The floor of 0.05 is not reached. Orders, plans, and work keep the seed. The cover sort is the reader. This note did not recount covers.

The release event does not write morale. `captivity-escaped` lowers morale by 4, and these runs have no escape. A missed later day has no collector, so it has no morale write either. [Loyalty drift](loyalty-drift.md) already separates the release-day scar from the missed daily payment, which passes with no mark.

[Negotiation](negotiation.md) still has no ransom offer on this tape. The payment is the formula. A counter the captor accepts was not run. `leaderShare` is 0. [Contracts](contracts.md) are absent here, so a ransom cannot reach an escrow.

The feed that is in the tree keeps the release sentence when the payload is withheld. `captivityReleasedParts` states the coins paid, the debt, and, when the debt is above 0, "Loyalty fell." `data` is null for everyone but the actor. `debts` on the character projection is the debtor's own array. `releaseDebtNote` repeats the amount and the port on the card. The news ledger in [news](news.md) would store the type, the tick, and the faction, and would leave the purse off. That ledger is not in this tree, and it was not run.

## 6. What the candidate rules do to treasuries

Each rule starts from the baseline. None is stacked on another.

**Raid.** On an attacker victory, every purse of the defender's faction that is at that port and not travelling is set to 0, and the sum is added to the attacker's faction treasury. The mint stays. Visitors of another faction are left. A defeat does not take the attacker's purse.

The resim moves 80024.42, 76818.44, and 95100.59 once. That is smaller than the moment-sums in section 4, because a purse taken at the first victory is 0 at the next. World Government ends at 35701.62, 39716.09, and 62332.88. Free Tide ends at 36878.56, 23786.95, and 23245.69. Every breakaway treasury ends at 0.00. Releases become 7, 13, and 8, and paid-nothing becomes 6, 10, and 6, because the dock was already stripped. The fixture moves.

**Capture.** At `character-captured`, a positive purse is added to the captor faction's treasury and the purse is set to 0. The release still rolls the demand. With a purse of 0 it pays nothing, books the whole demand as debt, and the scar runs. The resim moves 16762.80, 29494.89, and 6176.28. World Government ends at 7895.64, 16847.21, and 7677.10. Free Tide ends at 0.00, 326.27, and 0.00. Every measured release on this run pays 0. People who paid in full on the baseline are scarred here, because the purse was taken before the demand existed. Seed 1847's first capture is tick 558, so tick 72 stays on the fixture. Seeds 2718 and 4096 capture at tick 40 and tick 20. Their tick-72 event counts stay 8335 and 8266, and the hashes move.

**Wage.** The rule in [captivity debts](captivity-debts.md): on a world day, after the deadlines, a free character pays `min(purse, remaining, workGross)` toward the oldest open debt, into the creditor's treasury. A day that pays 0 emits nothing. No new draw. The first payments are tick 714, Esme Dusk, 17.82 of a 324.45 debt; tick 660, Jun Marrow, 16.33 of 495.77; tick 852, Pax Ash, 19.52 of 128.19. Those three debts are the baseline rows. Later debts are the prototype's own history. Payments are 73, 79, and 34, moving 1140.21, 1155.31, and 579.60. Closed rows are 1, 2, and 1. Still open at tick 1200: 5, 4, and 3 rows, remaining 1195.36, 682.37, and 644.16. World Government ends at 5009.67, 6647.14, and 12360.24. Free Tide ends at 0.00, 0.00, and 0.00. The 72-tick fixture stays, because the first debt is tick 704, 656, and 803.

## 7. Hash

A readout writes nothing. The purse does not move during a captivity, and no escrow field was stored, so that lock is the baseline table too.

Raid:

| Seed | Tick 72 | Events | Tick 1200 | Events |
| ---: | --- | ---: | --- | ---: |
| 1847 | `00529f2561e260acb5e6e24cace00da44a243effed279fa6703f2e69f13a8d2c` | 8466 | `9692b99d5dfcbc0e022b50776aaaaff4c255618e7305b6fe11b4f33c934bbaf1` | 164999 |
| 2718 | `b30ff7a6f3ccb1c0fa0a43a1479df8d643ae479f76f6fdbd0fd3d109941d322f` | 8326 | `dc8348fcd82fb9f4a0063759cffea69340e76a6b506ca66dba541ed566673436` | 162249 |
| 4096 | `4b786d5a30edf1a8ceac20b41c8088bd0fa1a897d23df1b80aa81527ab370f5d` | 8340 | `cc901d253134bd43bd3b1397bdb54d32837bcbaaa29dd82f585b571857ca68ab` | 164775 |

Capture:

| Seed | Tick 72 | Events | Tick 1200 | Events |
| ---: | --- | ---: | --- | ---: |
| 1847 | `86507558d49cee305c5f663e1699aacc19d66356ce518d4c32ac1e07085d8687` | 8426 | `add788c53583e5665c71fd696f9143948adb5d256364babefbea52324ded6dd0` | 164606 |
| 2718 | `2b64df96ea6616f3a9cbb13d50f12703f82b4a4d13c69b87d04ff094a08133ff` | 8335 | `906ef79bf46c50a74de0b917622fbf55ab4df02015a4ca3306f4f01cdfd17d13` | 162251 |
| 4096 | `ddd9cad8e1c69de4ed247585544dfc5bb722bdded571b7332a39f2e2095babe6` | 8266 | `cff48eb4c51cdbac870d5cb2db0812e723c3cad8993296847709bfb5db140768` | 165364 |

Wage collection. Tick 72 is the baseline table. Tick 1200 moves.

| Seed | Tick 1200 | Events |
| ---: | --- | ---: |
| 1847 | `d9fdc3775fe7ebfb803247b71b52d8e99aa3044e016a00c26908c4b484b19416` | 165201 |
| 2718 | `af357b111a50e0fa9368647f411a551fa2a4c122f59da1b1449dda20e91b1abb` | 161424 |
| 4096 | `068c480bbacd9de345afb329a3425334678b9a3a403650adb937ba8f00049997` | 164730 |

## 8. Slice plan

The slices are in the order they were measured. Each one starts from the baseline.

| Slice | What lands | Hash on these three seeds |
| --- | --- | --- |
| 1 | A readout. Purse at sea, passage sunk, tax and ransom while the holder is away, seizable moments, and the full, partial, and unpaid ransoms. The purse does not move during captivity, and no escrow field is stored. Not written. | Neutral. The baseline table. |
| 2 | An attacker victory takes the defender faction's purses that are on that dock and adds them to the attacker's faction treasury. The mint stays. Other factions on the dock are left. | The fixture moves. Tick 72 is the raid table, 8466, 8326, and 8340 events. Free Tide ends at 36878.56, 23786.95, and 23245.69. Every breakaway ends at 0.00. |
| 3 | A capture adds the prisoner's whole purse to the captor treasury and zeroes the purse. The release then pays 0 and books the whole demand. | Seed 1847 stays on the tick-72 fixture. Seeds 2718 and 4096 keep 8335 and 8266 events and move the hash. Free Tide ends at 0.00, 326.27, and 0.00. |
| 4 | The unpaid remainder is collected from the purse, up to one day's wages, once each world day, into the creditor treasury. | Tick 72 is the baseline table. Tick 1200 is the wage table, 165201, 161424, and 164730 events. The collector moves 1140.21, 1155.31, and 579.60. Free Tide ends at 0.00. |

## 9. Questions for the Lead

The Lead rules on these against [game vision](game-vision.md). Defaults are what this brief would build.

1. **Where is the coin when a ship sails?** Default: on the character. The purse sails with the hull. Cargo stays goods. The treasury stays a number on the faction. No second chest, and no new field. Own-faction `money` at sea stays null on the projection, which is the open question the treasury-wording test already records.

2. **Does a raid take the coin on the dock?** Default: no. The victory keeps the mint, 4720.00, 2736.38, and 2691.04, and the arms it already takes. Defender purses are present at 46, 32, and 35 victories. Taking them moved 80024.42, 76818.44, and 95100.59 into the attacker's treasury, ended Free Tide at 36878.56, 23786.95, and 23245.69, and ended every breakaway at 0.00. That piles purses into the two treasuries that win the raids. It is not a balance the vision asks for. The fixture moves.

3. **Does a capture take the purse before the ransom is set?** Default: no. The purse stays on the prisoner. It is unchanged on all 12, 11, and 13 releases, because a captive already skips the loop. The release pays `min(purse, demand)`, and [ransom split](ransom-split.md) credits that payment. Taking the whole purse moved 16762.80, 29494.89, and 6176.28, and every release on that run paid 0 and took the scar, including prisoners who had covered the demand. Bram Tern's 9758.07 against a demand of 446.97, and 16141.56 against 103.32, would leave the purse under today's rule and would enter a treasury under the seizure.

4. **Can the coin be lost at sea?** Default: the passage already sinks what it can. Purses pay 11114.13, 10517.93, and 11004.07. Treasuries pay 9010.97, 9719.99, and 8884.23. Ticks that pay under 3 are 8, 4, and 14, of which 4, 3, and 10 pay nothing. The ship keeps going. The purse is not wiped, and the hull is not sunk. A wreck rule was not run. On a defeat the attacker's purse stays, positive on 10, 9, and 12 defeats.

5. **How does the treasury get coin while the holder is away?** Default: the way it already does. Work tax, sale tax, and ransom credit the faction that is owed them. Free Tide's holder is at sea for 1851.45, 997.00, and 989.54 of work tax and 2457.59, 1271.73, and 1349.99 of sale tax, and the treasury still receives it. A captive holder's faction receives its tax the same way. Breakaways have no holder and still receive 2438.74, 2547.22, and 1936.80 of work tax. The credit does not wait for a landfall.

6. **A ransom is only partly paid, or not paid. Does the debt stay owed?** Default: yes. Partial shortfalls are 2584.76, 833.85, and 1846.53. Unpaid shortfalls are 559.26, 581.86, and 0.00, each from a purse of 0. Open rows at tick 1200 are 10, 3, and 5, and `remainingValue` still equals `originalValue`. The faction treasury does not pay the prisoner's debt. Question 22 already says the prisoner owes it.

7. **Does the day's-wage collector run?** Default: no. It is the rule in [captivity debts](captivity-debts.md), and question 73 parked it. Measured alone, it pays 1140.21, 1155.31, and 579.60, closes 1, 2, and 1 rows, and leaves 1195.36, 682.37, and 644.16 open. Free Tide still ends at 0.00. The 72-tick fixture stays. Tick 1200 moves. Collecting it would not be a balance, and it is not required for the drama of a debt that remains.

8. **What does the shortfall do to loyalty and morale?** Default: the scar that is already stored, and no morale write. Scarred releases are 10, 3, and 5. Finn Frost ends at 0.242 and Mina Vale at 0.231. The release event does not assign morale. A missed later day still passes with no mark. Negotiation does not bargain this tape: the payment stays `min(purse, demand)`, and a counter was not run. The feed sentence already states the coins paid, the debt, and that loyalty fell. The stored debt row stays on the debtor. A news ledger that drops the amount was not run.

9. **What moves the hash?** Default: slice 1 stays on the baseline table, tick 72 `86507558d49cee305c5f663e1699aacc19d66356ce518d4c32ac1e07085d8687`, `c6268c398c5b8a674a1bef8a675cd74c747392e3fb767a67e1ebd8bc1a4143f6`, and `d62ab7f9c9e840b55c012fb1d8f2fe6929a61359178b4daf7b5eb10cbf7bca95`, with 8426, 8335, and 8266 events, and tick 1200 `9c22f0fe85a923526bc94f2f840a722d7d758509f35dd8422b9247e1c03750ac`, `5169b16f45f28edfde3b6e8f230652ba40651b5e336d9225992ea1606e901688`, and `ec5ec0af8d0adb1586b1022f8acdc2ce85f948348e069f67ca4847e9510ce4da`, with 164969, 164659, and 164118 events. Slice 4 stays on that tick-72 fixture and moves tick 1200. Slice 2 moves both horizons. Slice 3 leaves seed 1847 on the tick-72 fixture and moves the other two hashes without changing their event counts. No new draw on the wage. The raid and the capture write purses and treasuries, and the later world follows.

## Ruling

The Lead has ruled.

The defaults in section 9 are accepted, except question 7. The day's-wage collector is the build slice. Purse seizure stays out entirely and is not scaled down. Whole-purse capture is rejected.

Slice 2 does not land. Slice 3 does not land. Slice 4 does. The 72-tick fixture stays. Tick 1200 moves. The collector's hashes are the wage table in section 7.
