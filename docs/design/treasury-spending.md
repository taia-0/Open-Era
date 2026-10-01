# Treasury spending

**Status: Open.** Design note. The allowance and the ruler's spend are not built. Question 24 in [owner questions](owner-questions.md) is still recorded there as settled 50/50. The questions file is unchanged.

**Correction (2026-10-01).** The ransom routing in slice 1 is built. A faction captor's treasury receives the whole payment, `leaderShare` is 0, and `leaderId` and `leaderMoney` are omitted. The measured 1200-tick hashes below are the 50/50 campaign. The new baseline is the addendum in [ransom split](ransom-split.md).

Runs below are `createPrototypeWorld` plus `runTick`, no player commands, seeds 1847 / 2718 / 4096, 1200 ticks, on this tree (`f87beb5`), Node v24.21.0, ICU 78.3. Tick numbers on events are the `tick` field. A figure at tick 72 or tick 1200 is the world after that many `runTick` calls. `npm test` passed, 301 tests, including the golden pin and its recovery replay of 572 events. The harness was local and was not committed.

The 72-tick hashes and counts matched `tests/fixtures/golden-hashes.json`:

| Seed | State hash | Events |
| ---: | --- | ---: |
| 1847 | `cb04ba5d392d8b1c868cc97e54cb21b21ec171edd546bb70d0d7aba86cc69c11` | 8301 |
| 2718 | `bd7d8cc44d5fa21022ecb8f8086e13dfbb9475eb025b5ae53f87e2991f90035c` | 8513 |
| 4096 | `20975bf480e5aa11eeafe1ce39c36cf5ba0fa8e2d5de2bb5887a35d7b3aecc9f` | 8031 |

Tick 1200 on the same runs: hashes `dac1ee50de935be4ea4bd9499ee9f49fb738909f4032b327ebb52d367cca6ded` / `6adbadbb35c81126930e5b46d5e9233166d3f63a0726a95c68dda082f9b57f0c` / `e4d66a14a2455d693cf659082b13c2558d01315f3a1dee39fd14422fce56066c`, events 162392 / 165428 / 162285. Captures 16 / 10 / 16. Releases 16 / 8 / 12.

## 1. Ruler and officer

There is no office and no rank. `Faction` (`src/sim/types.ts`) is `id`, `name`, `color`, `treasury`, `taxRate`, and an optional `actingCommanderId`. Membership is `character.factionId`. Setup (`src/sim/scenario.ts`) puts `character-01`–`character-13` in World Government, `character-14`–`character-22` in Free Tide, and `character-23`–`character-30` in no faction.

**Ruler** means the command holder. `commandHolderId` (`src/sim/state.ts`) is the single `issuerId` on that faction's standing orders. Two issuers, or none, leave the seat unnamed. The id is not stored on the faction. `orderFor` mints every opening order from `character-01` (World Government) or `character-14` (Free Tide), and the issuer receives no order. On these three runs that seat is still Mara Vane and Pax Ash at tick 1200.

Mara is the human controller (`controller.kind === "human"`). `runTick` still gives her upkeep, then skips plan review and decisions. Pax is autonomous. He spends his purse. She does not, except the passage charge while she is already at sea.

**Acting commander** is `faction.actingCommanderId`, written by the `character-captured` reducer and deleted by `captivity-released` or `captivity-escaped` when the freed character is the holder (`assignActingCommander`, `clearActingCommander`). The cover is the free faction mate with the highest leadership plus scarred loyalty times 50. The holder is skipped. A captive is skipped. A lower id wins a tie. No draw. The cover does not receive the orders, and `reviewPlan` does not read the field. While the holder is captive, `submitCommand` rejects every command except `escape-captivity` (`character-captive` in `src/sim/commands.ts`).

At tick 72 every `actingCommanderId` is absent. At tick 1200 the only cover is Free Tide on seed 2718: Zara Gale (`character-17`, merchant), and Pax is still captive. The other five faction rows are uncovered.

**Officer**, for spending, is not the archetype and not the reporting officer. The archetype cycles `officer`, `merchant`, `explorer`, `raider`, `steward`. `reportingOfficerId` is a player briefing job (`src/sim/briefing.ts`). The people who already carry the holder's orders are the other faction members. That is the proposed spender class. Unaffiliated characters have no treasury.

## 2. What a purse pays for today

The treasury is only credited. `tradeTax` (`src/sim/engine.ts`) adds `round(gross * taxRate, 2)` on `worked` and on a sale, to the faction that holds the settlement. A buy pays no tax. A neutral port pays none. `applyRansomCredit` sets the treasury from `ransom.factionTreasury` when `treasuryShare > 0`. Nothing subtracts from `faction.treasury`. Garrison regrowth does not read it.

Personal `character.money` is debited in these places. File references are `src/sim/engine.ts` unless noted.

| Spend | Event | Rule |
| --- | --- | --- |
| Recruit | `recruited` | `quantity * 12`, quantity `max(1, min(8, floor(money / 12), floor(arms / 0.35)))`. Autonomous score −1000 and the player refusal `insufficient-money` both require 30, and 2 arms (`buildCandidates`, `validateCharacterAction` in `src/sim/commands.ts`). |
| Passage | `character-upkeep` | `PASSAGE_COST_PER_TICK` is 3. Before leaving, `quotedPassage` requires `money >= passageCost(ticks)`. Underway, each sea tick charges `min(money, 3)`, including a human. `travel-started` itself moves no coins. |
| Buy provisions | `market-trade` `bought` | Autonomous fill is `min(resupply gap, stock, money / price)`, tax 0, score −1000 when `money < 2` or stock `< 1`. A player order is quoted at accept, capped by `marketDepth`, and refused `insufficient-money` against the purse. |
| Buy goods | `market-trade` `bought` | Player `buy-resource` charges the quoted price, tax 0. Autonomous `trade-local` buys when the hold is not worth selling, quantity capped by `money / price`. |
| Contract escrow | `contract-offered`, `contract-amended` | The buyer's purse pays `price`, or the increase. Refunds and fulfilment return it. Only a player command offers. Headless runs do not. |

These credit a purse. They are not spends, and the proposal leaves them on the purse:

- `worked`: `workGross` is `round(10 + leadership * 0.08 + trade * 0.07, 2)`, then tax.
- A sale: gross minus tax.
- `battle-resolved`: an attacker victory adds `35 + lootArms * 2`.
- `contract-fulfilled`: the carrier receives the escrow.
- `rested` spends medicine, not money.

**Ransom payment** is the prisoner's purse, not a planner buy. `processCaptivityDeadlines` sets `moneyPaid` to `min(money, demandedValue)` unless nobody can receive it, in which case it stays 0. Question 22 still says the faction treasury does not pay that debt. This note does not change the outbound payment.

**Ransom receipt** is the part the owner changed. `splitRansom` gives a faction captor `ceil` of half the cents to the treasury and `floor` of half to the party leader (`captorPartyLeader`: the command holder, or the highest leadership plus seeded loyalty times 50 if that seat is the prisoner or unnamed). The odd cent goes to the treasury. No faction: the leader receives every cent. The event stays `captivity-released` and carries `ransom.treasuryShare`, `leaderShare`, `factionTreasury`, and `leaderMoney`.

On these runs the first release, and the coins, are:

| Seed | Event tick | Prisoner | Paid | Treasury | Leader |
| ---: | ---: | --- | ---: | ---: | --- |
| 1847 | 118 | Sable Morrow | 13.4 | 6.7 Free Tide | 6.7 Pax Ash |
| 2718 | 155 | Mina Vale | 58.13 | 29.07 World Government | 29.06 Mara Vane |
| 4096 | 96 | Sable Morrow | 106.84 | 53.42 Free Tide | 53.42 Pax Ash |

No release has `tick < 72`. Over 1200 ticks the paid sums are 1381.10 / 741.80 / 854.67. The treasury shares are 690.58 / 370.92 / 427.37. The leader shares are 690.52 / 370.88 / 427.30. The new rule puts the whole paid sum in the treasury and leaves the leader share at 0. A captor with no faction is unchanged. None of these three seeds needs that branch through tick 1200; that is the existing split's claim, and this harness did not search for a null `captorFactionId`.

## 3. Allowance

Proposed default, not built.

The cap is `ticksPerDay * PASSAGE_COST_PER_TICK` = 6 × 3 = 18. That is one day of the passage charge already in the code. It is not a fitted balance number.

Measured purse debits of the 20 non-holder members, 1200 ticks, median then that median divided by 200 days: 7417.61 → 37.09, 6796.73 → 33.98, 7210.09 → 36.05. The median single debit is 3, because passage ticks dominate the count. The largest single debit is 207.20 / 211.95 / 207.20. An allowance of 18 covers a day at sea or one soldier (12) and does not cover a large buy or a full recruit gate of 30. The purse pays the rest.

Refresh when `tick-advanced` sets `nextTick % ticksPerDay === 0`. Unused allowance does not carry. The field is `allowanceRemaining` on the character, omitted while it equals 18, the same omission `loyaltyAdjustment` uses at 0. Omitted means full. The reset deletes the field. It does not emit an event. Tick 0 starts full because the field is absent.

A quoted bill (passage quote, recruit cost, trade gross, contract price) is drawn in whole cents: allowance first, then the purse, never more than the treasury. The two shares sum to the bill. A shortfall refuses the whole quote. Autonomous travel and recruit stay at score −1000. The player keeps `insufficient-passage` and `insufficient-money`. An underway voyage still charges `min(spendable, 3)` per sea tick and is not turned around. There is no request to the ruler. That would be a new event and a new decision.

The command holder, while free, has no cap. The acting commander does not inherit that. They keep the 18. A captive holder cannot spend. Unaffiliated characters stay on the purse.

Free Tide cannot fund today's member spending. Opening treasury is 2800 (`createPrototypeWorld`). Tick-72 treasuries are 19741.96 / 19615.14 / 19902.94 and 3267.77 / 3460.72 / 3248.06. Fixture-window debits (`tick < 72`) of Free Tide members plus Pax are 5097.26, 5572.36, and 3771.20. World Government member debits in that window are 7331.97, 7435.92, and 6666.61, against an opening 18000. Over 1200 ticks the non-holder member sums are 148191.44 / 157503.47 / 146310.38, against tick-1200 treasuries 44757.67 / 42097.00 / 45522.66 and 14252.98 / 14972.74 / 14512.02. The fallback to the purse is what keeps recruit, travel, and trade possible after the treasury is busy.

## 4. The player

Mara is the World Government holder, so she spends as the ruler: the bill draws the treasury while she is free. She uses the same `character-action` verbs she already has (`travel`, `recruit`, `buy-provisions`, `buy-resource`, and the escrow on `offer-contract`). `work`, `sell-resource`, `rest`, `raid`, `survey`, `claim-settlement`, and `decline-surrender` do not spend. Her headless passage, when a release puts her at sea, is the same charge: four sea ticks of 3 on 2718 (ticks 1118–1121) and on 4096 (ticks 818–821). Seed 1847 has none. That is upkeep, not a command.

Command shape. Optional `source` on `character-action` and `offer-contract`:

- Absent, and she is the free holder: `"treasury"`.
- `"purse"`: her purse, today's check.
- A member who is not the holder draws the allowance, then the purse. `"purse"` skips the allowance.

`POST /api/commands` already requires `type` and `action` (`src/sim/commands.ts`). `source` is the only new field. The accept event echoes it. The sim event, not the command event, carries the absolutes (`characterMoney`, `factionTreasury`, `allowanceRemaining`, and the two drawn amounts). While she is captive the existing `character-captive` refusal stands. The cover does not become the player and does not gain her commands.

## 5. Visibility

`projectFactions` (`src/dashboard/visibility.ts`) already shows `treasury` and `power` for the commander's own faction and null for a rival. `taxRate`, `commanderId`, and `actingCommanderId` are public. Keep that split.

`eventPayloadVisible` hides another character's `recruited`, `market-trade`, `worked`, and `character-upkeep`. The own-port tax sentence (`ownedPortTaxSentence` in `src/dashboard/wording.ts`) is the exception: the faction that holds the port is told the tax, and not the purse. A treasury draw uses that shape. The faction sees who paid and how much left the treasury. The officer's cargo, motives, and remaining purse stay withheld. A rival sees neither the balance nor the draw.

Allowance cap and remaining are own-faction, on the character row, the way loyalty is. A rival row leaves them null. The ransom sentence is already readable by both sides when the payload is withheld (`summaryStaysWhenWithheld`). A faction payment with `leaderShare` 0 and no `leaderId` already falls through to the treasury-only sentence. `ransomIncomeNote` already ignores a share of 0.

## 6. Determinism and events

No new RNG. Money stays at two decimal places via `round(..., 2)`. The allowance draw uses whole cents so the treasury share and the purse share sum to the bill. Recruit costs are already whole coins (`quantity * 12`). Passage is 3. Trade gross is already rounded.

No new event type. The same events gain fields:

- `recruited`, `market-trade` (buys), `contract-offered`, `contract-amended`: `characterMoney`, `factionTreasury` when the treasury moved, `allowanceRemaining` when a member drew it, `treasuryDrawn`, `purseDrawn`.
- `character-upkeep`: the same, beside the existing `passageCost` and `characterMoney`.
- `captivity-released`: `treasuryShare` becomes the whole `moneyPaid` when the captor has a faction, `leaderShare` is 0, `leaderId` and `leaderMoney` are omitted. `factionTreasury` stays the absolute the reducer writes. `terms` is unchanged. The debt and the loyalty scar still key off `debtValue`.

`applyRansomCredit` already skips a share of 0. `applyEvent` for trades and work already assigns absolute `characterMoney` and `factionTreasury`. The allowance must follow that pattern. The M33 release record is the lesson: a write that exists only on the live character is on the snapshot taken after the tick, and replay from an earlier snapshot drops it, because `WorldStore.recover` applies events through `applyEvent` only. The daily reset is safe only because it runs inside the `tick-advanced` reducer and sets a constant (delete the field). A remaining balance that is not on the spend event, and not recomputed there from fields on that event, will not survive recovery.

Ordering inside the tick does not change. Characters are still walked in id order. The reset happens when the tick advances onto a day boundary, which is before the next tick's spends. `WorldState.version` stays 5. Old events have no allowance fields. The reset deletes a field that is absent, so an old log does not grow one.

## 7. Hashes, counts, census

| Slice | Tick-72 hash | Tick-72 count | Tick 1200 |
| --- | --- | --- | --- |
| Ransom, 100% to the faction treasury | Unchanged. Measured: 0 releases with `tick < 72`. The first credits are event ticks 118, 155, and 96. | Unchanged. Same event type, and that event is outside the window. | State hash moves. The leader purses lose 690.52 / 370.88 / 427.30 and the treasuries gain those coins on top of the shares they already receive. Recruit, travel, and trade read the leader purse, so later decisions can change. The new hash, the new event count, and the new capture census are unmeasured. |
| Projection of the cap, no spend | Unchanged. The cap is not on `WorldState`. | Unchanged. | Unchanged, for the same reason. |
| Allowance and ruler spending | Moves. The window already contains purse debits: recruits 77 / 88 / 90 (costs 4836 / 5412 / 5316), passage charges 906 / 858 / 779 (2718.00 / 2573.73 / 2337.00), buys 170 / 196 / 171 (gross 9621.95 / 10284.17 / 8331.43). | Unmeasured. The same actions keep the count. A ruler who can recruit once the purse is under 30, or an officer whose quote now uses allowance plus purse, can add or drop events. Pax ends at 27.67 / 7.90 / 21.27, under the recruit gate of 30, with a treasury still in the thousands. | Moves. Unmeasured. |

The spend census over 1200 ticks, all characters:

| Seed | Recruits | Recruit cost | Passage events | Passage | Buys | Buy gross | Sales tax | Work tax | Victory credits |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1847 | 1551 | 100884 | 6724 | 20172.00 | 3641 | 90055.04 | 25092.13 | 12427.94 | 25, summing to 1592.11 |
| 2718 | 1456 | 101532 | 6125 | 18367.85 | 3515 | 87635.74 | 22934.45 | 12964.37 | 35, summing to 2347.66 |
| 4096 | 1468 | 94608 | 6627 | 19881.00 | 3832 | 94972.49 | 25524.81 | 13282.50 | 34, summing to 2734.35 |

Buys by good, count then gross. 1847: provisions 2371 / 27334.59, arms 349 / 16071.18, medicine 724 / 37960.68, ship materials 197 / 8688.59. 2718: provisions 2270 / 29985.22, arms 391 / 17894.00, medicine 559 / 27568.73, ship materials 295 / 12187.79. 4096: provisions 2452 / 33884.33, arms 444 / 20674.08, medicine 666 / 30532.01, ship materials 270 / 9882.07. All four goods are purse purchases. Victory credits use the event formula `35 + lootArms * 2` on `attacker-victory`. They are income.

Debits by role over 1200 ticks (recruit cost + passage + buy gross). World Government members 85067.12 / 99587.85 / 94113.93. Free Tide members 63124.32 / 57915.62 / 52196.45. Pax, the Free Tide holder, 6632.55 / 5852.12 / 6910.27. Mara, the World Government holder, 0 / 12 / 12, and that 12 is the four passage ticks above. Unaffiliated 56287.05 / 44168.00 / 56228.84. They have no treasury to draw.

## 8. Slice plan

1. **Ransom routing.** Faction captor: `treasuryShare = moneyPaid`, `leaderShare = 0`, omit `leaderId` and `leaderMoney`. No faction: keep `splitRansom` as it is, the whole payment to the party leader. No new event. The odd-cent rule stops mattering for a faction captor because there is no split. This is the hash-neutral first slice. The 72-tick fixture has no release. `npm run golden:update` stays unrun. Wording follows the existing treasury-only sentence. Tick 1200 must be remeasured before anyone quotes a new hash.
2. **Projection only.** Own-faction character rows gain the cap, 18, and a remaining figure that reads as full until a draw exists. Rivals stay null. Nothing is written onto `WorldState`. Hash-neutral. It can ship with slice 1 or wait.
3. **Spending.** Holder draws the treasury without a cap. Every other member draws 18 per day, then the purse. The events in section 6 carry the absolutes. The reset is in the `tick-advanced` reducer. This rewrites the tick-72 hash. Regenerate the fixture with `npm run golden:update` on Node v24.21.0, ICU 78.3, after the rule is accepted. The event-count effect is unmeasured.
4. **Player `source`.** The field in section 4, published on `capabilities.requests`. Headless history does not send commands. The hash effect is slice 3's, not this field's, as long as the autonomous path and the command path share one draw.

## 9. Owner questions

Each default is what the slice plan uses. None of them blocks the note.

1. **Who spends the allowance?** Default: every faction member except the command holder. That includes the acting commander and the reporting officer. The `officer` archetype is not the list. Unaffiliated characters stay on their purses.
2. **Does the person covering a captive ruler spend without a cap?** Default: no. They keep 18. The holder spends without a cap only while free. Prison still blocks Mara's commands.
3. **How big is the allowance, and does the unused part carry?** Default: 18 per world day, refreshed on the day boundary, no carry. The measured member medians are about 34 to 37 a day, so the purse still pays most of a large buy.
4. **The allowance is short. Then what?** Default: the rest of that bill comes from the purse. If the two together cannot cover the quote, the action is refused the way a short purse is refused today. No message to the ruler.
5. **Does the treasury pay someone's ransom for them?** Default: no. Question 22 stands. Only the coins the prisoner actually pays change destination, and a faction captor's treasury receives all of them.
6. **A captor with no faction?** Default: the party leader still receives the whole payment. There is no treasury on that release.
7. **May Mara pay from her own purse instead?** Default: yes, by `source: "purse"`. The ordinary command draws the treasury.
8. **Who sees the balance, the draws, and the allowances?** Default: her faction sees the treasury, the draws, and each remaining allowance. A rival sees none of the three. The rival still sees who holds the seat.
9. **Do wages, sale proceeds, and battle loot move into the treasury?** Default: no. Tax on work and on sales already does.
