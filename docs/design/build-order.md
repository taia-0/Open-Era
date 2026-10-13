# Build order

**Status: Open / scheduling note.** Batch 1 is on `origin/main` at `f02ed4e`. The shelf gate and the landless freeze are ruled. The pin is the remeasure at the end of this note. The batch 2 contracts pin is the walk on that stack, in the section of that name. Batch 2 is still unbuilt. Batch 3 was not measured. The harness was local and was restored.

Checked after merging `origin/main` at `28928f6` (PR #117) into this branch. The merge commit is `1bc65e7`. Node v24.21.0, ICU 78.3. `npm test` passed, 447 tests. The 72-tick fixture passed, including the golden recovery replay of 600 events on seed 1847 split at tick 47. A headless run reproduced the fixture and the 1200-tick baseline below. `src/` and `tests/` are that merge. The progression readout is in. It does not move these hashes.

| Seed | Tick 72 state hash | Events | Tick 1200 state hash | Events |
| --- | --- | ---: | --- | ---: |
| 1847 | `86507558d49cee305c5f663e1699aacc19d66356ce518d4c32ac1e07085d8687` | 8426 | `9c22f0fe85a923526bc94f2f840a722d7d758509f35dd8422b9247e1c03750ac` | 164969 |
| 2718 | `c6268c398c5b8a674a1bef8a675cd74c747392e3fb767a67e1ebd8bc1a4143f6` | 8335 | `5169b16f45f28edfde3b6e8f230652ba40651b5e336d9225992ea1606e901688` | 164659 |
| 4096 | `d62ab7f9c9e840b55c012fb1d8f2fe6929a61359178b4daf7b5eb10cbf7bca95` | 8266 | `ec5ec0af8d0adb1586b1022f8acdc2ce85f948348e069f67ca4847e9510ce4da` | 164118 |

Runs are `createPrototypeWorld` plus `runTick`, no player commands. Seeds 1847, 2718, and 4096, in that order. Ending treasuries on that baseline are World Government 4035.27, 6029.16, and 10851.38, and Free Tide 0.00, 0.00, and 0.00. Secessions are 7, 5, and 5. The first `secession-declared` is event tick 477 (Finn Frost), 574 (Mina Vale), and 609 (Esme Dusk).

## Already built

Checked against [progress](../../progress.md) and the code. These are not in the order.

The progression skill step is in. `practicedSkill` is `src/sim/state.ts`, and `worked`, `travel-started`, and `battle-resolved` store the new absolutes. The fixture and the 1200-tick baseline above are that step's pin. Troop experience, the promotion label, and the rarity mark stay behind it, as the ruling said.

The hazards projection is in. `isDirectlyObserved` keeps the shared settlement and does not treat another held port as co-located. `projectCharacter` copies `travel` onto the viewer's own card and a faction mate's card, and leaves a rival's course null. That mate exception is the later ruling recorded in the progress log. [Hazards 4 and 5](hazards-2.md) still says a mate's course is null. The code is the later ruling. Nothing in that note is left to build.

## Not scheduled

These were ruled, and they stay out of the batches.

[Fleet](fleet.md) slices 3–7 stay parked. They wait until income can carry them. The levy does not start them. Slice 2 is the one-voyage limit already in the code.

[Income](income.md) lands the 0.05 governor levy only. Port dues, the sale tariff, the buy duty, the passage credit, the contract fee, the pay-first order, and the reserve floor do not land.

[Morale](morale.md) slice 3, certain desertion, does not land. [Contracts](contracts.md) at 45 does not land. [Money at sea](money-at-sea.md) slices 2 and 3 do not land. [Offices](offices.md) does not add a treasurer or an admiral. [Aging](aging.md) does not store ages at setup, does not inherit to the cover, and does not roll a per-tick chance. Death is certain at 120 only.

## Slices

A readout that writes nothing is not a slice here. "Doc" means the hash in that note, measured on an older baseline, not remeasured on this tip. "Measured" means this tip, the harness below, then restored.

### Contracts, slice 4

[Contracts](contracts.md) ruling, with the walk in [contract refusals](contract-refusals.md). One autonomous captain of the faction that holds a shelf with `stocks.provisions < 1` offers 10 provisions at 56.25. The carrier is the lowest id who passes `carrierBlocked` and whom `assessSupplyContract` would accept at 56.25 on the offer tick. If nobody would accept, the shelf offers nothing. The payout stays 56.25. The threshold stays `round(0.54 + ambition * 0.08)`. The deadline is `max(travelTicks + 1, 2)`, never past 720. Free Tide pays by the quoted spend already in the tree. The pin for that walk is the batch 2 contracts pin.

Depends on the contract resolver, which is in the tree. It does not depend on negotiation. Negotiation's default was that nobody offers a contract unprompted. This ruling replaces that default for this haul.

Moves the 72-tick fixture on 2718 only. Seeds 1847 and 4096 stay on the fixture, and tick 1200 moves on all three. Taken from the doc. The 2718 tick-72 hash there is `2f295c23dd35677d3dd9b8ba922badf97b323fb4fcf229591636d732e267bb50`, 8474 events, on the pre-skill-step fixture. Not remeasured here.

Writes purses, escrow, treasuries, and the contract events. The same coins as the levy, the stipend, the wage collector, and a death's debt payment.

### News, slices 2–6, with the 24-tick cap

[News](news.md) ruling. Slice 1 is a readout and does not land as code.

Slice 2 stores `news-posted` on the origin port. Slice 3 copies the item on arrival, `observedTick` unchanged. Neither has a reader. Slice 4 points `factionInterest` and the landless test at `knowledge.factionId`. Garrison, stocks, and the claim offer stay live. Slice 5 is the tax step's pressed test, as ruled: a port the holder is standing in stays live, and ledger news of an away port counts only while the tax tick minus `observedTick` is at most 24. Slice 6 points the secession read at a news item instead of live stability and live loyalty.

Slices 2 and 3 come before 4, 5, and 6. Slice 6 also needs the walker, which is now in `runTick`. The news note said the walker was absent and the baseline stood. That sentence does not transfer. Secessions on this tip are the counts above.

Hash, taken from the doc, not remeasured. Slices 2, 3, and 4 move the fixture. Slice 5 as the 24-tick cap keeps seeds 1847 and 2718 on that note's fixture and moves 4096 to `f780c3abc599f2d6011990e601fa2aab950dcb484e90ea16914938f58024c105`, 8262 events. Tick 1200 moves on all three. Slice 6 was not given a hash.

Writes the ledger on the settlement, then travel targets (slice 4), `taxRate` (slice 5), and `secession-declared` (slice 6). The levy and the tax step both write `taxRate`. The offices ruling and slice 6 both touch who declares: the governor is the declarer, and the stability he reads is the ledger figure. Those are one declaration, not two.

### Negotiation

[Negotiation](negotiation.md), PR #100. The Lead accepted the defaults.

Slices 2, 4, and 7 are reducer cases with no autonomous caller. A headless run emits none of those types. Hash-neutral. They fit in the commit that first emits the type. They are not a re-pin.

Slice 3, the ransom reply, pays `min(purse, demand)`, the coins the release already writes. The offer key stays omitted, which is the row the note says keeps the baseline. A key stored at capture was not measured and does not land.

Slice 5 does not land. The default is that nobody offers a contract unprompted. The contracts ruling already has that haul, at 56.25, in batch 2. Slice 8 does not land. The default is that nobody offers a tribute unprompted. Slice 6, the pact shortlist, does not offer on its own. The default is that nobody offers a pact unprompted. The alliances writer is the one that accepts.

### Morale

[Morale](morale.md) ruling. The −0.5 term is slice 2. Desertion is slice 4: 12 short mornings, then one side-stream roll, leaving when the roll is under 0.5. Certain desertion does not land.

The term depends on the mate cap already in `memberAllowanceCap`. Desertion depends on that cap and on `personality.loyalty + loyaltyAdjustment`, the line secession already uses. Neither waits on an unbuilt slice. Patronage would move who sits under 0.75. Patronage is not ruled, so desertion does not wait for it.

The term writes `morale` on `character-upkeep`. Desertion writes `factionId` null on `character-deserted`. Place, travel, and troops stay. The same `factionId` as a death. The same cap as the stipend's headroom. The morale field is what decisions already read, so the term moves later actions without a new event type.

On the morale note's older baseline both slices keep the fixture and move tick 1200. Remeasured on this tip. The fixture still stays. The 1200 hashes are in the measurement section. They are not the hashes in that note.

### Alliances

[Alliances](alliances.md), PR #92. The Lead accepted the defaults. Nothing is forced at tick 0. The forced two-faction pact in that note is not the build.

Slice 2, the propose and break commands with no autonomous caller, is hash-neutral on a headless run. It fits with the negotiation reducers, in the commit that first emits the type. Not a re-pin.

Slice 6, a second attacker, stays out of the brief.

The autonomous accept (slice 3), the no-raid rule (slice 4), the sighting copy (slice 5), and the break cost (slice 7) wait for a third faction that holds a port, and then only with the faction that is not that enemy and not the parent just left. Both sides accept. The founder speaks until the seat is named. This tip does found third factions, after the fixture, so tick 1200 would move and the fixture would stay. That hash was not measured. They are batch 3. They need the governor seat from batch 2, because the founder is the governor who declared, and they need the batch 2 pin first: the news ledger and the deaths change who secedes. The break cost writes `breakAdjustment` of 0.04 on the same loyalty sum as `loyaltyAdjustment`. Patronage's 0.04 stays unbuilt and is not added. The no-raid rule writes battles and claims.

### Wage collector

[Money at sea](money-at-sea.md) ruling, the rule in [captivity debts](captivity-debts.md). On a world day, after the deadlines, a free character pays `min(purse, remaining, workGross)` toward the oldest open debt, into the creditor's treasury. A day that pays 0 emits nothing. No new draw.

Depends on debts, purses, and treasuries already in the tree. No unbuilt dependency.

The fixture stays. Tick 1200 moves. Measured on this tip, and the result matches the wage table in that note: `d9fdc3775fe7ebfb803247b71b52d8e99aa3044e016a00c26908c4b484b19416` (165201), `af357b111a50e0fa9368647f411a551fa2a4c122f59da1b1449dda20e91b1abb` (161424), and `068c480bbacd9de345afb329a3425334678b9a3a403650adb937ba8f00049997` (164730). World Government ends at 5009.67, 6647.14, and 12360.24. Free Tide ends at 0.00. Payments are 73, 79, and 34.

Writes `character.money`, `remainingValue`, and `faction.treasury`. The same coins as the levy, the stipend, the contract escrow, and a death's debt payment.

### Governor levy

[Income](income.md) ruling. While a governor is seated at the start of the tick, work gross and sell gross each pay 0.05, taken from the worker or the seller and credited to the faction that holds the dock. The seat is the offices rule and is not stored. No pay-first order. No reserve floor.

Depends on the offices appointment rule for who is seated. The income ruling measured the seat without storing it, so the levy can land before `governorId` is a field. Once the stipend lands, both write the treasury, and the seat has to be the same captain.

Moves the fixture and tick 1200. Taken from the doc. Tick 72 there is `bb9a546263fd799a70c91505069f6f7c86c169b6fd3752a01bca09176cc18b4e`, `d2c9552adec5b7e9efe844e6167bf01a38078b945568435aa1c0d482c3b4dc1f`, and `41587a43d026e5d6ed914426c5e31f3399f2ad8598acd2ca4a460acde993e8dd`, with 8382, 8315, and 8408 events, on the pre-skill-step fixture. Not remeasured here.

Writes purses and treasuries, and the tax step then writes `taxRate` off the new treasury. The same treasury as the stipend, the wage collector, and the contract escrow. The same `taxRate` as news slice 5.

### Aging

[Aging](aging.md) ruling. A year is 180 ticks. The run stays 1200. Aging is a fixed death at 120 only, with no per-tick chance. Ages are not stored at setup. The heir is not the cover. The calendar of 2190 ticks does not land.

What lands is the certain death at 120, with vacant succession. Debts pay the creditor treasury from the purse. Sailors and troops stay on the body. Ports' `ownerId` becomes null. `character-aged` does not land. The personal-power penalty does not land. The side-stream chance does not land.

No unbuilt dependency. On this tip the deaths are tick 1080, ticks 180 and 720, and tick 540, all after the fixture. Tick 72 stays on the fixture when aging sits on batch 1 alone. The names are the batch 2 remeasure. The older fixed-death resim, on an older baseline, is the check-in row in the aging note: the same three deaths, tick-1200 event counts 159664, 156271, and 159974, World Government 13652.48, 14355.47, and 13799.49, Free Tide 12.3, 45.66, and 150.72. Taken from that note. The stack remeasure is below.

Writes `factionId`, the purse, the creditor treasury, and `ownerId`. The same `factionId` as desertion. The same purse and treasury as the wage collector. A dead governor is an empty seat, which is the offices clear.

### Offices and patronage

The roster addendum is ruled. The posts stay the command holder, the acting commander, and the port governor. A breakaway appoints nobody. The stipend is 18 from headroom, and only when the treasury covers 18 for every free mate and every seat. The seat clears when the port's faction changes, the governor leaves the faction, or the governor becomes the holder. Captivity does not clear the seat. Death and desertion clear it because `factionId` changes. Secession reads the governor. `ownerId` stays the claimant.

The questions in section 8 of the port-governor brief, including patronage, were left as a separate decision. Patronage stays unbuilt. The step is 0.04, and it is not in either re-pin. There is no `patronageAdjustment` under `src/`.

The appointment and the stipend depend on the holder and the mate cap already in the tree. The clear depends on desertion and on death if those have landed. The levy reads the same seat.

Taken from the doc, not remeasured. Storing the extra post ids moves the fixture at state tick 0 and does not change the event count. That store included a treasurer and an admiral, which the ruling rejected, so those hashes are not the governor-only store. The governor stipend keeps the event count and moves the tick-72 hash. The first event difference in that note is tick 110, 216, and 96. Tick 1200 is the governor row. Free Tide ends at 0, 0, and 0. Patronage, in the main brief, moves the fixture because the opening governors are named at state tick 0. That hash was not remeasured, and the slice is not ruled.

Writes `governorId`, the treasury (the stipend), and, if patronage is later ruled, `patronageAdjustment` on the same loyalty sum desertion and the cover sort read.

## Same state

| State | Slices that write it |
| --- | --- |
| Purse and treasury | Wage collector, levy, governor stipend, contracts slice 4, aging's debt payment |
| `taxRate` | News slice 5 (24-tick cap), and the tax step after the levy changes the treasury |
| `factionId` | Desertion, aging's death |
| `morale` | The −0.5 pay term. Decisions already read it |
| Loyalty sum | The scar already in the tree. Alliance `breakAdjustment` of 0.04 is batch 3. Patronage's 0.04 stays unbuilt |
| Governor seat | Offices appointment, the levy's read, the secession declarer, desertion and death as the clear |
| Ledger | News slices 2 and 3 store it. Slices 4, 5, and 6 read it |
| Contract | Contracts slice 4. Negotiation slice 5 would write the same offer and does not land beside it |
| Battles and claims | Alliances' no-raid rule, batch 3. News slice 4 moves travel targets, which moves who fights |

## Order

Three batches. Batch 1 is on `origin/main` at `f02ed4e`. Batch 2 is the golden re-pin at the end of this note, applied on top of batch 1. Batch 3 is the hash-moving alliance slices. That pin was not measured.

The hash-neutral slices are not a batch. Negotiation slices 2, 4, and 7, and alliance slice 2, fit in the commit that first emits the type. A headless run emits none of them. Negotiation's accepted defaults add no hash-moving slice.

### Batch 1 — on main

The wage collector, the −0.5 pay term, and the desertion roll, in one commit, on today's baseline. No unbuilt dependency. The 72-tick fixture stays, so the golden file is not regenerated. Tick 1200 is the batch 1 row in the measurement section. Free Tide ends at 0.00 on every seed. This batch is on `origin/main` at `f02ed4e`.

### Batch 2 — one golden re-pin

After batch 1. One commit, one `golden:update`, one new 1200-tick record. The pin is the remeasure at the end of this note. Inside the commit, this order:

1. Offices appointment, the 18 stipend from headroom, breakaway appoints nobody, and the governor is the secession declarer. No treasurer, no admiral. Patronage stays unbuilt at 0.04. Captivity does not clear the seat.
2. The 0.05 levy, reading that seat.
3. News slices 2 and 3, then slice 4, then slice 5 at the 24-tick cap, then slice 6. The declarer is the governor from step 1. The stability and the followers he reads are the ledger, under the cap. A port the holder is standing in stays live for the tax step. That live exception stays off the secession read. A faction that holds no port freezes its rate: no autonomous step up or down until it holds a port again.
4. Contracts slice 4, the 56.25 offer, when `stocks.provisions < 1`, to the lowest id who would already accept, or to nobody. The pin is the batch 2 contracts pin.
5. Aging: the 180-tick year, a fixed death at age 120 only, vacant succession. No per-tick chance. No `character-aged`. No personal-power penalty.

Desertion and death are already the seat-clear by the time the stipend is in this commit. The levy, the stipend, the wage collector, and the contract writer share the treasury, so they are not given separate re-pins. The fixture moves. Aging by itself does not move tick 72.

### Batch 3 — alliances

After batch 2. Alliance slices 3, 4, 5, and 7: the autonomous accept, the no-raid rule, the sighting copy, and the break cost. Nothing is forced at tick 0. Slice 6, a second attacker, stays out. The break cost is `breakAdjustment` of 0.04. Patronage's 0.04 is not added.

These wait on the governor seat, and on who secedes after the news ledger and the deaths. Batch 2 is already the large re-pin. Stacking the four alliance slices on it is not a small harness, so this run did not measure them. Fleet slices 3–7 stay parked. The levy does not start them.

## Measurement

The harness edited `src/sim/engine.ts` and `src/sim/state.ts`, ran, and was restored. Flags defaulted off. A world day is `tick % 6 === 0`.

The wage collector runs after `processCaptivityDeadlines`. A character who is not captive pays the oldest open debt, `incurredTick` then id, and only when the tick is after `incurredTick` and the creditor faction exists. The pay is `round(min(purse, remaining, workGross), 2)`. Zero emits nothing. `debt-repaid` stores the new purse, the new remainder, and the creditor treasury. A remainder of 0 drops the row. No draw.

The −0.5 term is on `character-upkeep`, after the hunger and travel terms already in the code. A member whose live `memberAllowanceCap` is under 18 loses 0.5, clamped to 0–100. The holder is not a member.

Desertion is read at the start of the morning, before production. A member whose cap is under 18 adds one to a short streak. Any other morning resets it. On the morning the streak becomes 12, if `personality.loyalty + (loyaltyAdjustment ?? 0)` is under 0.75, one `next()` is drawn from a `DeterministicRng` forked from `world.rngState` at the start of tick 0. The fork is not written back. A roll under 0.5 sets `factionId` null. The stored roll is `round(roll, 3)`. Place, travel, and troops stay.

Every row below kept the fixture. Tick 72 hashes and event counts are the baseline table. Free Tide ended at 0.00 on every row. The doc hashes for the morale term and for desertion are an older baseline and are not these.

| Run | Seed | Tick 1200 | Events | World Government |
| --- | ---: | --- | ---: | ---: |
| Wages | 1847 | `d9fdc3775fe7ebfb803247b71b52d8e99aa3044e016a00c26908c4b484b19416` | 165201 | 5009.67 |
| Wages | 2718 | `af357b111a50e0fa9368647f411a551fa2a4c122f59da1b1449dda20e91b1abb` | 161424 | 6647.14 |
| Wages | 4096 | `068c480bbacd9de345afb329a3425334678b9a3a403650adb937ba8f00049997` | 164730 | 12360.24 |
| Morale term | 1847 | `ff10e06cfdda7fe075015d7fd2aa4056fec78e52804c2dcd645c13016f8483c9` | 161455 | 6385.13 |
| Morale term | 2718 | `8367b953d7e26a575eb15242d862ea7b9bf6119063f3ad7a6ade6dade1336c46` | 163866 | 4680.72 |
| Morale term | 4096 | `0b51acf49de0e939067a77125e0d9c528fa20dd5ba07a50508938aab1d06c1fb` | 163772 | 8694.47 |
| Desertion | 1847 | `1275f053fc1e289442573c1da2039fffcaa72d9b7072f2c4f4b1691218c7daf1` | 166264 | 4892.97 |
| Desertion | 2718 | `421ae77c454caef2c66739caf11fadc2cd64dc8ec2c8b5f40a5c25bce9ec9519` | 166947 | 5664.19 |
| Desertion | 4096 | `80b55522ebbcfd4b6fcf7bf51c972055f7493c4995e6a811d016c2bb8177d021` | 168890 | 7933.37 |
| Wages + morale | 1847 | `92656733a6993db42a85eb02ed45c08575f92ff582292240e28a45d576e76c2e` | 162013 | 5437.93 |
| Wages + morale | 2718 | `145b0c802d90807ec4c72abde7686ee738a1f2bffebe43e4226bd215900ae9af` | 164480 | 5363.17 |
| Wages + morale | 4096 | `5125d4fca74a3e1237196472b5459d20431571fa131c4d76b028f71bf279b0a6` | 163587 | 8593.33 |
| Morale + desertion | 1847 | `29d4d4cb680af946b542a11239b505caa5b99bb0deb1c22f337057bacd6c46c1` | 163532 | 3759.53 |
| Morale + desertion | 2718 | `ddae73677423f61ab0483c9f36a551498ea9ff649e4da7abddef842f989a17f0` | 165157 | 3874.30 |
| Morale + desertion | 4096 | `3a76c8d54f66bf9ae672e30e6dfbb7fee33dc5bdaeb3316f7cb8125ae8ae833b` | 167462 | 13086.73 |
| Batch 1 | 1847 | `7314d632250b133a87b114668d8d972d65733734a17503fa02496747dc496fb7` | 163059 | 3756.08 |
| Batch 1 | 2718 | `b7015fced2f2b04e86e0877142aad82ae4f0b4ea5c54e66e2651edea33581d3e` | 165135 | 3897.32 |
| Batch 1 | 4096 | `7f0f865b7686a6e479e45b65406b1adc3b49326e0dd354f199b62bcd60bac214` | 168755 | 11953.82 |

Batch 1 is the three together. That row is the re-pin. It is the in-tree baseline on `origin/main` at `f02ed4e`. The batch 2 pin is the remeasure at the end of this note.

Desertion alone leaves Esme Dusk at tick 546 (0.245) and Bram Tern at tick 930 (0.034) on 1847, Finn Frost at tick 282 (0.244) and Bram Tern at tick 882 (0.085) on 2718, and Mina Vale (0.160) and Esme Dusk (0.238) at tick 312 on 4096.

Batch 1 leaves Finn Frost (0.245) and Bram Tern (0.034) at tick 174 and Esme Dusk (0.407) at tick 390 on 1847. Finn Frost (0.244) at tick 282 on 2718. On 4096: Zara Gale (0.160) and Dax Pike (0.238) at tick 312, Bram Tern (0.449) at tick 438, Mina Vale (0.483) at tick 456, and Finn Frost (0.245) and Esme Dusk (0.179) at tick 672.

`debt-repaid` on the batch 1 row is 121, 19, and 54. Open debts at tick 1200 are 6, 3, and 1. The wage-only open counts, 5, 4, and 3, are the money-at-sea row and were matched by this harness.

### Batch 2 stack

The same harness, with batch 1 still on, then offices, the levy, news slices 2–6, contracts at 56.25, and aging as a fixed death at 120. Flags defaulted off. The run was local and was restored. Node v24.21.0, ICU 78.3. Seeds 1847, 2718, and 4096. `origin/main` is `f7f3fa1`. That run's table is the fixed-death section. The remeasure at the end of this note supersedes it. A second run reproduced those hashes.

Appointment runs at the start of the tick, after aging and the morning desertion check. The cover sort names one anchored member who is not the holder, and only while `spendRole` is `"holder"`. A breakaway appoints nobody. `governorId` is omitted while the seat is empty. Captivity does not clear it. The stipend is silent: `seats × 18` from the treasury into the governors' purses, and only when the treasury covers 18 for every free mate and every seat. A morning that cannot pay emits nothing.

The levy is `round(gross × 0.05, 2)` inside the work tax and the sale tax. It applies when the dock was seated at the start of the tick and the dock still has a faction. The credit follows that faction.

News posts the public item on the port: id, type, `observedTick`, `factionId`, and `taxRate` on a tax item only. Stability and the scarred-follower list sit beside the item. A holder ashore reads the ledger of the port he stands in. A holder at sea reads the bag copied on departure. The tax step keeps the live stability of a port the holder is standing in. An away port counts only while the tax tick minus `observedTick` is at most 24. Secession does not use that live exception. The governor declares when he is anchored, autonomous, and not the holder, the rate is above 0.15, and the beside figure for that port is at or under 55 thousandths. No governor means nobody declares. The event's stability field is the live port stability, so the reducer does not overwrite the port with the news figure. The payload `ownerId` is the governor, so the reducer founds the faction with that captain. Followers are the item's scarred list, still anchored, and not the governor, the holder, or the acting commander.

The contract offer is the contracts ruling: one autonomous captain of the faction that holds an empty shelf, 10 provisions at 56.25, the lowest id who can pay, the carrier the lowest id who passes `carrierBlocked`, deadline `max(travelTicks + 1, 2)` and never past 720. A new offer waits until the next tick.

Aging uses span ages from `DeterministicRng(seed).integer(18, 119)`, in id order `character-01` through `character-30`, not from `world.rngState`. A year is 180 ticks. A character dies when the starting age plus `tick / 180` reaches 120. The death draws nothing. There is no per-tick chance, no `character-aged`, and no personal-power penalty. Succession is vacant. Debts pay the creditor treasury from the purse, in id order. Sailors, troops, and the remainder stay. Ports' `ownerId` becomes null. A holder death clears the acting commander. An acting-commander death writes the next cover or clears the seat.

An earlier run of this stack used a side-stream per-tick chance plus certain death at 120. That run is superseded. It killed 13, 5, and 8. Its `news-posted` counts were 441, 604, and 535. Its contract events were 2, 31, and 778. Free Tide's ending rate on 4096 was 0.30. Seed 1847's contract events were 2, against 839 with aging off, while 4096 kept 778. The hashes of that run:

| Seed | Tick 72 state hash | Events | Tick 1200 state hash | Events | WG | WG rate | FT | FT rate | Secessions | Deaths |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1847 | `f277b5586d18f3a81814f8827eec26e027f7289d541cc58e259690c3d007a682` | 8497 | `924694eb7631d6a8496c6f4df6721793c71f26030179d6310145761a0b88498a` | 112112 | 12021.06 | 0.10 | 1988.92 | 0.14 | 0 | 13 |
| 2718 | `10acbabbd427a909fb86828aadde45ea79b3a51cc31d0cb9177ec4f8af80db02` | 8548 | `3f682e91b7c9f41b18c3192d740f1bbf7a9f61eee88c17c97947e462f85f8a4f` | 149519 | 10474.79 | 0.08 | 0.00 | 0.23 | 5 | 5 |
| 4096 | `a8e6794dcddb18dbe67cef4c6038e4016096c073d978160ddcc3c851abbc4c7f` | 8467 | `52c2de69c97c9cbb73deec708a5fbb9b7ab16208647f39e2ac519b7450b699c2` | 138648 | 12758.79 | 0.08 | 0.00 | 0.30 | 2 | 8 |

### Fixed death at 120

Superseded. This table was the pin before the two rulings. It was measured on `origin/main` at `f7f3fa1`, before batch 1 was in the tree, with the shelf at `stocks.provisions <= 0` and with a landless short raise still stepping. The pin is the remeasure at the end of this note. The deaths in this table are the same names and ticks as that remeasure. Batch 1, then offices and the 18 stipend, the 0.05 levy, news slices 2–6 with the 24-tick cap, contracts at 56.25, and aging as a fixed death at 120 with vacant succession. Tick 72 moves on every seed. Aging off matches those tick-72 hashes, so the death is not what moves the fixture. The first death is tick 180, on 2718.

| Seed | Tick 72 state hash | Events | Tick 1200 state hash | Events | WG | WG rate | FT | FT rate | Secessions | Deaths | News | Contracts |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1847 | `711510cba582b5ee9ef64c38f33113fd02d0b8267d5808bffd1bcbcf20555ca8` | 8502 | `1cd5197a76fe5310704e91ee004f5881371ad4f7c0d2d44b3449f8784e98399f` | 163602 | 7811.39 | 0.06 | 0.00 | 0.17 | 4 | 1 | 544 | 1132 |
| 2718 | `f08bc429038cc308b18c5b6388aee877136ce033b5012dd6e877d0f8c2e52cc8` | 8553 | `9a0e76dab1baee4eac580b1a33b300aa0abdebe22636a2f6392d9006e8247ac1` | 158837 | 11147.39 | 0.11 | 492.79 | 0.08 | 0 | 2 | 384 | 16 |
| 4096 | `43da07200fec9f187c5158c1bb3db8d15093d02f04419b7427064fb2b3a5082e` | 8468 | `cdaa7e5f6c4b71df0f30d130bec2483ea180834c6d38bd0149cdc41f640d1ae0` | 160014 | 4950.77 | 0.10 | 0.00 | 0.16 | 5 | 1 | 612 | 724 |

Deaths, each at age 120. The same list appears on every row that includes aging: levy off, offices off, news off, and aging on batch 1 alone. Offices, the levy, the ledger, and the contract writer do not change who dies.

1847, tick 1080: Lio Crow (`character-12`), World Government. 2718, tick 180: Lio Crow (`character-12`), World Government. Tick 720: Esme Dusk (`character-19`), Free Tide. 4096, tick 540: Kessa Dusk (`character-30`), unaffiliated.

Secessions. 1847: Zara Gale at crown-harbor, tick 838; Dax Pike at cinder-key, tick 840; Esme Dusk at glassport, tick 857; Mara Calder at glassport, tick 863. 2718: none. 4096: Esme Dusk at crown-harbor, tick 651; Corin Hale at glassport, tick 723; Zara Gale at glassport, tick 729; Finn Frost at crown-harbor, tick 737; Mara Calder at crown-harbor, tick 757.

Contract events on the stack. 1847: offered 563, refused 555, accepted 7, breached 7. 2718: offered 8, refused 8. 4096: offered 356, refused 344, accepted 12, breached 8, fulfilled 4.

The comparisons are the same harness with one group off, and each slice alone on top of batch 1. They are not a second pin. Tick 72 with aging off matches the stack. Tick 72 with aging on batch 1 alone stays on the fixture. Those tick-1200 hashes are `892abdf0b46ac5de4ff71344a7c0d827dc0b96608fb8ddf35144a5bd05a23d4d`, `82e015aff002572b3303f5e3216046beda18967b544b5673e764b3d3bcc09b26`, and `d4bf0f55cfc98df424fbcf2e95b3b7710171c9baf5c4ac906bbf22c9d7bd5809`.

| Run | Seed | Events | WG | WG rate | FT | FT rate | Secessions | Deaths | News | Contracts |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Levy off | 1847 | 160526 | 53.45 | 0.05 | 0.00 | 0.20 | 5 | 1 | 668 | 446 |
| Levy off | 2718 | 151694 | 2004.50 | 0.07 | 0.00 | 0.27 | 4 | 2 | 614 | 767 |
| Levy off | 4096 | 157951 | 58.94 | 0.03 | 21.80 | 0.24 | 3 | 1 | 652 | 566 |
| Offices off | 1847 | 166965 | 18580.22 | 0.08 | 723.08 | 0.29 | 1 | 1 | 564 | 1143 |
| Offices off | 2718 | 160313 | 15801.95 | 0.04 | 27.87 | 0.20 | 2 | 2 | 636 | 945 |
| Offices off | 4096 | 162035 | 12143.43 | 0.08 | 0.00 | 0.16 | 4 | 1 | 621 | 1026 |
| News off | 1847 | 166487 | 20106.11 | 0.12 | 475.23 | 0.21 | 0 | 1 | 0 | 434 |
| News off | 2718 | 158351 | 16567.53 | 0.10 | 12.17 | 0.16 | 0 | 2 | 0 | 480 |
| News off | 4096 | 160811 | 14228.35 | 0.12 | 63.39 | 0.15 | 0 | 1 | 0 | 1120 |
| Aging off | 1847 | 164106 | 7680.89 | 0.06 | 0.00 | 0.17 | 4 | 0 | 544 | 1132 |
| Aging off | 2718 | 164614 | 11947.17 | 0.09 | 18.27 | 0.16 | 1 | 0 | 544 | 412 |
| Aging off | 4096 | 162421 | 10740.42 | 0.09 | 752.06 | 0.15 | 0 | 0 | 585 | 901 |
| Offices alone | 1847 | 163382 | 63.26 | 0.05 | 105.22 | 0.16 | 0 | 0 | 0 | 0 |
| Offices alone | 2718 | 163852 | 3302.37 | 0.12 | 3400.35 | 0.15 | 0 | 0 | 0 | 0 |
| Offices alone | 4096 | 163005 | 4070.98 | 0.10 | 14.74 | 0.16 | 0 | 0 | 0 | 0 |
| Levy alone | 1847 | 162989 | 11697.72 | 0.13 | 16.32 | 0.15 | 5 | 0 | 0 | 0 |
| Levy alone | 2718 | 165618 | 20217.96 | 0.13 | 3297.40 | 0.13 | 0 | 0 | 0 | 0 |
| Levy alone | 4096 | 160577 | 16277.48 | 0.09 | 348.07 | 0.17 | 4 | 0 | 0 | 0 |
| News alone | 1847 | 163777 | 9051.98 | 0.09 | 37.86 | 0.22 | 2 | 0 | 525 | 0 |
| News alone | 2718 | 162460 | 9611.46 | 0.10 | 46.83 | 0.15 | 2 | 0 | 608 | 0 |
| News alone | 4096 | 161887 | 6000.81 | 0.08 | 0.00 | 0.30 | 3 | 0 | 628 | 0 |
| Contracts alone | 1847 | 163513 | 4493.06 | 0.06 | 30.06 | 0.15 | 5 | 0 | 0 | 239 |
| Contracts alone | 2718 | 163467 | 10091.01 | 0.14 | 0.00 | 0.16 | 4 | 0 | 0 | 14 |
| Contracts alone | 4096 | 167565 | 13161.66 | 0.12 | 18.49 | 0.13 | 1 | 0 | 0 | 10 |
| Aging alone | 1847 | 162813 | 3952.73 | 0.07 | 0.00 | 0.17 | 5 | 1 | 0 | 0 |
| Aging alone | 2718 | 157857 | 6792.70 | 0.13 | 0.00 | 0.17 | 5 | 2 | 0 | 0 |
| Aging alone | 4096 | 164443 | 13960.87 | 0.14 | 0.00 | 0.16 | 2 | 1 | 0 | 0 |

With the deaths down to 1, 2, and 1, three interactions remain. On 1847 the late death changes nothing that this table counts: aging off matches the stack's 1132 contract events, the 4 secessions, Free Tide at 0.00, and the 0.17 rate. On 2718 the deaths still move the campaign. Contract events are 16 against 412 with aging off, Free Tide ends at 492.79 against 18.27, and the one secession with aging off (Zara Gale at crown-harbor, tick 1180) does not happen. On 4096, Kessa Dusk is unaffiliated, and the death still moves the campaign: contract events 724 against 901, Free Tide 0.00 against 752.06, secessions 5 against 0. News off declares nobody on any seed, because the governor has no figure inside the cap. Each slice alone leaves different treasuries from the stack. News alone is the row whose Free Tide rate on 4096 reaches 0.30.

### (a) Contract offers

The old collapse does not recur. On 1847 the stack and aging off are the same 1132 contract events, and the offer trace matches: 902 empty-shelf visits, 563 offers, 11 with no buyer, 81 who cannot pay, 0 with no carrier, 247 skipped because the pair is already open. Lio Crow dies at tick 1080. Seed 4096 stays healthy: 724 in the stack, 901 with aging off, 566 with the levy off, 1026 with offices off, 1120 with news off. The old stack had kept 778 there.

Contracts do disappear on 2718. The stack emits 16 contract events, 8 offers, and 8 refusals. Aging off emits 412. The levy off emits 767. Offices off emits 945. News off emits 480. Contracts on batch 1 alone emit 14.

The pay check and the carrier check are not the stop. On the stack's 2718 trace, empty-shelf visits are 10, offers are 8, visits with no buyer are 2, visits that cannot pay are 0, and visits with no carrier are 0. The gate in front of those checks is `stocks.provisions <= 0`. Across 4800 port-ticks (4 ports, 1200 ticks) that seed has 10 at or under 0 and 1384 strictly between 0 and 1. The other two seeds of the stack still hit empty shelves: 1847 has 902 at or under 0 and 671 between 0 and 1, and 4096 has 982 and 753.

It is a side effect of the stock sitting just above 0, and the levy and the offices are part of that side effect. They are not a defect in the offer's spend or carrier test. Removing any one of the levy, offices, news, or aging restores empty shelves on 2718: 687, 998, 740, and 529 visits at or under 0. The band between 0 and 1 stays large on those rows (856, 695, 740, and 1084). Contracts alone, with none of those four, already has 9 visits at or under 0 and 1447 between 0 and 1. The four together keep 2718 on that band. Each one removed lets a shelf hit 0, and the offers come back.

The smallest fix is the shelf threshold. Offer when `stocks.provisions < 1`, which is the `buy-provisions` gate the contracts note already counted and did not write. On this stack that adds the 671, 1384, and 753 port-ticks that sit strictly between 0 and 1. That writer was not hashed here.

### (b) Free Tide's rate on 4096

The stack does not reach 0.30. Free Tide ends at 0.16. The highest rate during the run is 0.17. Zero starts of tick are at 0.30. The treasury ends at 0.00, so the faction is short. Fourteen raises are unpressed and short. Six presses cut the rate: ticks 48, 72, 216, 312, and 528 read a fresh news figure at or under 55, and tick 1056 is the holder standing on a pressed port, which takes 0.17 down to 0.16. One raise, tick 504, is a step where Free Tide holds no port.

News alone does pin. It ends at 0.30, the max is 0.30, and 479 starts of tick are at 0.30, from tick 721 through tick 1199. The rate at tick 1200 is still 0.30. The last step is tick 720, from 0.29 to 0.30, unpressed and short, and Free Tide holds no port on that step. The cent stops at 30, so a later short step emits nothing. The treasury ends at 0.00. Presses land only at tick 48 (0.08 to 0.07) and tick 312 (0.15 to 0.14), both from a fresh news figure. After tick 312, fifteen raises find no held port and one raise (tick 384, 0.15 to 0.16) holds a port whose figure inside the cap is not at or under 55. There is no standing press. The cap is not hiding a low port on the climb that pins the rate. Free Tide holds nothing to read, the treasury stays short, and the short raise walks from 0.14 at tick 360 to the cap.

The other slices do not pin. On 4096, offices alone ends at 0.16 (max 0.19), the levy alone at 0.17 (max 0.18), contracts alone at 0.13 (max 0.21), aging alone at 0.16 (max 0.21), and batch 1 at 0.17 (max 0.21). News is the slice that reaches the cap.

The levy and the stipend do not create that shortage. The stack and news alone both end Free Tide at 0.00. With the levy removed from the stack the rate climbs higher, to a max of 0.25, and a standing press at tick 1152 cuts it to 0.24. The treasury on that row ends at 21.80. Offices off ends at 0.16. News off, which reads live stability, ends at 0.15 and is still being pressed at tick 1152. The per-slice cause of the pin is the news press going quiet once Free Tide holds no port, while the treasury-short raise is still eligible and the cent stops at 30.

Batch 3 was not measured.

## The pin

Checked after `git fetch origin`. `origin/main` is `f02ed4e` (`f02ed4ec30e1f10e5a2c59789cdd705c205dc869`), the merge of PR #119. Batch 1 is in that tree. This branch was `docs/batch2-remeasure` at `d29c181`, then `git merge origin/main`. The merge commit is `d2fb5e0`. Node v24.21.0, ICU 78.3. `npm test` passed, 453 tests, 0 failed. The 72-tick fixture matched: `86507558d49cee305c5f663e1699aacc19d66356ce518d4c32ac1e07085d8687` (8426), `c6268c398c5b8a674a1bef8a675cd74c747392e3fb767a67e1ebd8bc1a4143f6` (8335), `d62ab7f9c9e840b55c012fb1d8f2fe6929a61359178b4daf7b5eb10cbf7bca95` (8266). The 1200-tick batch 1 baseline matched the batch 1 row: `7314d632250b133a87b114668d8d972d65733734a17503fa02496747dc496fb7` (163059, World Government 3756.08, Free Tide 0.00 at 0.17), `b7015fced2f2b04e86e0877142aad82ae4f0b4ea5c54e66e2651edea33581d3e` (165135, 3897.32, Free Tide 0.00 at 0.30), `7f0f865b7686a6e479e45b65406b1adc3b49326e0dd354f199b62bcd60bac214` (168755, 11953.82, Free Tide 0.00 at 0.17).

The harness edited the sim, ran, and was restored. Flags defaulted off. With the flags off, tick 72 stayed on the fixture. A second run reproduced the 1200-tick hashes below. The only difference between the two runs was the clock time.

Two rulings, both applied.

Contracts are offered when `stocks.provisions < 1`. That is the `buy-provisions` gate the contracts note counted. It builds with the 56.25 offer in batch 2. The fixed-death table used `<= 0`.

A faction that holds no port freezes its rate. The autonomous step does not raise it and does not lower it until that faction holds a port again.

The Engineer's first batch-2 slice is not in this pin. That slice would store the desertion streak and the side-RNG position on the world. On `f02ed4e`, the progress log records both as process-local maps, absent from the hash. The fork is rebuilt from `createPrototypeWorld(seed).rngState` and is not written back. A stay emits nothing, so a restored process cannot replay a consumed stay. No field schema is in that entry, and none is on main. Storing invented fields would invent the hash. The pin is without that store.

What was measured is batch 1 as it sits in the tree, then offices and the 18 stipend, the 0.05 levy, news slices 2–6 with the 24-tick cap, contracts at 56.25 under the `< 1` gate, aging as a fixed death at 120 with vacant succession, and the landless freeze. Seeds 1847, 2718, and 4096. No player commands.

The deaths are the same names and ticks as the superseded table. 1847, tick 1080: Lio Crow (`character-12`), World Government. 2718, tick 180: Lio Crow, World Government; tick 720: Esme Dusk (`character-19`), Free Tide. 4096, tick 540: Kessa Dusk (`character-30`), unaffiliated.

### Tick 72

No freeze. No death. World Government does not set. Its rate stays 0.14.

| Seed | State hash | Events | WG | WG rate | FT | FT rate | Secessions | Deaths | News | Contracts |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1847 | `1f350990d9bfd9d3cd9458bf9bc59d23f1416e4fc1ea85a3163c739e7be3300e` | 8496 | 17904.84 | 0.14 | 1195.88 | 0.08 | 0 | 0 | 87 | 0 |
| 2718 | `9369a83530097e07c7b46873d775728bac78bfd7dab6f6260c839b96bdbddd8a` | 8580 | 17808.25 | 0.14 | 1401.19 | 0.08 | 0 | 0 | 76 | 27 |
| 4096 | `b1dd7e71be7a33d9229601fbb2015efc488a43376fd403ab3e8fde229c19ea08` | 8480 | 18239.37 | 0.14 | 1413.63 | 0.07 | 0 | 0 | 102 | 14 |

Free Tide on 4096 sets once, tick 48, from 0.08 to 0.07, and ends at 0.07. Seeds 1847 and 2718 do not set inside 72 ticks, and Free Tide stays at 0.08.

Seed 1847 offers nothing: 0 shelves under 1. Seed 2718 has 15 shelves, all strictly between 0 and 1, 0 at or under 0, 0 with no buyer, 1 that cannot pay, and 14 offers. The 27 contract events are offered 14, refused 11, accepted 1, breached 1. Seed 4096 has 11 shelves, all between 0 and 1, 4 with no buyer, and 7 offers. The 14 contract events are offered 7 and refused 7.

### Tick 1200

| Seed | State hash | Events | WG | WG rate | FT | FT rate | Secessions | Deaths | News | Contracts |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1847 | `a8395215c3c71ed5b896c76937861222ed095ec77f05891a512cd366cd5064b1` | 164059 | 16227.45 | 0.06 | 16.20 | 0.17 | 4 | 1 | 580 | 2510 |
| 2718 | `a4ccfe817476ffd2f657917e41fa51447e143a946ec140ba2095b47aae9b9a9e` | 158477 | 8197.81 | 0.04 | 0.00 | 0.18 | 3 | 2 | 533 | 1794 |
| 4096 | `210a73dc2487f94dc66763af4c891dcd8790966499c28be0fe3c35f1a2202c60` | 162522 | 12349.44 | 0.09 | 16.05 | 0.07 | 0 | 1 | 484 | 2509 |

Contract events. 1847: offered 1253, refused 1247, accepted 5, breached 4, fulfilled 1. 2718: offered 896, refused 894, accepted 2, breached 2, fulfilled 0. 4096: offered 1247, refused 1230, accepted 16, breached 12, fulfilled 4.

Secessions. 1847: Finn Frost (`character-18`) at crown-harbor, tick 829, Free Crown Harbor; Dax Pike (`character-20`) at glassport, tick 863, Free Glassport; Mara Calder (`character-21`) at glassport, tick 1047, Free Glassport II; Zara Gale (`character-17`) at crown-harbor, tick 1140, Free Crown Harbor II. 2718: Zara Gale at crown-harbor, tick 915, Free Crown Harbor; Dax Pike at cinder-key, tick 931, Free Cinder Key; Mara Calder at glassport, tick 974, Free Glassport. 4096: none.

### Contract health on 2718

The `< 1` gate puts the offers back. Shelves under 1 are 1475. Of those, 710 are at or under 0 and 765 are strictly between 0 and 1. Visits with no buyer are 359. Visits that cannot pay are 220. Visits with no carrier are 0. Visits skipped because the pair is already open are 0. Offers are 896, and contract events are 1794. The superseded stack emitted 16 contract events and 8 offers, with 10 port-ticks at or under 0 and 1384 strictly between. That collapse does not recur. Verdant Cay is never under 1, so 710 and 765 are the whole shelf count.

### Free Tide's rate

The stack does not reach 0.30. The maximum rate is 0.17, 0.18, and 0.10. Zero starts of tick are at 0.30. Ending rates are 0.17, 0.18, and 0.07. Ending treasuries are 16.20, 0.00, and 16.05. Every recorded freeze is Free Tide. World Government has none.

A freeze tick is a tax clock, `tick > 0` and `tick % 24 === 0`, on which the faction holds no port. The rate stays. `wouldRaise` is the short test the old step would have used on that same tick: free mates exist, the treasury cannot pay each 18, and the rate is under 0.30. Later `wouldRaise` ticks are this frozen tape. They are not a second run with the raise allowed.

1847 has 18 freezes. The one that would not raise is tick 72, at 0.08. The 17 that would raise are ticks 552 and 576 at 0.15, ticks 624, 648, 672, and 696 at 0.14, and ticks 864, 888, 912, 936, 960, 984, 1008, 1032, 1056, 1080, and 1104 at 0.16. The last set is tick 1128, from 0.16 to 0.17.

2718 has 13 freezes. The three that would not raise are ticks 936, 1008, and 1032, all at 0.18. The 10 that would raise are ticks 528 and 552 at 0.11, and ticks 960, 984, 1056, 1080, 1104, 1128, 1152, and 1176 at 0.18. The last set is tick 912, from 0.17 to 0.18.

4096 has 4 freezes, and each would raise: tick 240 at 0.08, ticks 576 and 600 at 0.10, and tick 1008 at 0.05. The last set is tick 1176, from 0.06 to 0.07. The maximum is 0.10, set at tick 384.

### News only, on 4096

News slices 2–6 and the landless freeze, with offices, the levy, contracts, and aging off. This is the check that the rate no longer pins at 0.30. It sits on batch 1 as it is in the tree.

Tick 1200, seed 4096: `a261ddfb05cdccc2c2a08e7920ce60afacc40cc89861b730ed8c46a29e9cd4dc`, 165546 events, World Government 8934.42 at 0.09, Free Tide 0.00 at 0.18. The maximum is 0.18. Zero starts of tick are at 0.30. News events are 460. Secessions are 2: Mina Vale (`character-15`) at crown-harbor, tick 545, Free Crown Harbor; Mara Calder (`character-21`) at crown-harbor, tick 729, Free Crown Harbor II. The last set is tick 648, from 0.17 to 0.18.

Freezes on that run. Ticks 360 and 432 are at 0.14, and both would raise. The faction holds a port again after those clocks, and the rate keeps stepping through tick 648. Ticks 816 and 840 are at 0.18, and neither would raise. Then ticks 864, 888, 912, 936, 960, 984, 1008, 1032, 1056, 1080, 1104, 1128, 1152, and 1176 are at 0.18, and each would raise. The first blocked short raise of that landless spell is tick 864, at 0.18. The sixteen clocks from 816 through 1176 stay at 0.18 because the freeze kept the rate. An unfrozen run was not measured. The world would diverge after the first raise, so those sixteen are this tape, not a count of raises an unfrozen run would have emitted.

The news-alone row in the superseded table ended Free Tide at 0.30, with 479 starts of tick at 0.30 from tick 721, and the last step at tick 720 from 0.29 to 0.30 while Free Tide held no port. That row is `f7f3fa1`, without batch 1 in the tree and without the freeze. This row is not that row.

The other two seeds of the same news-only run, tick 1200. 1847: `d749467e2ae0e71328ad716d5ab7026852d2194e29292b057daaa966745a1b3e`, 163386 events, World Government 10193.41 at 0.08, Free Tide 0.00 at 0.20, maximum 0.21, zero starts at 0.30, secessions 2, news 527. Freezes that would raise: ticks 936 and 960 at 0.19, and ticks 1104, 1128, 1152, and 1176 at 0.20. The one that would not raise is tick 1080, at 0.20. 2718: `ba41a8fa683203b70bb8fee4e69c34341ef7d39b803e6b8f4e46d83c1ec9af70`, 162447 events, World Government 9611.46 at 0.10, Free Tide 41.86 at 0.14, maximum 0.19, zero starts at 0.30, secessions 2, news 596. One freeze, tick 1176 at 0.14, and it would raise.

News only on 4096 at tick 72: `1241c1944cacbc72f11d47004356804af2537834d8cc85448dc7b9a34ed49869`, 8339 events, World Government 17650.28 at 0.14, Free Tide 965.77 at 0.07, news 78. One Free Tide set, tick 48, from 0.08 to 0.07. No freeze, no secession, no death.

## Batch 2 contracts pin

The stack in [The pin](#the-pin) is commit `2169bac`, on top of batch 1. This section adds the ruled walk and nothing else. Offer to the lowest id who passes `carrierBlocked` and whom `assessSupplyContract` would accept at 56.25 on the offer tick. If nobody would accept, offer nothing. The payout stays 56.25. The threshold stays `round(0.54 + ambition * 0.08)`. The deadline stays `min(720, max(travelTicks + 1, 2))`. A captain who sails away before the next morning can still refuse. The preview is the offer tick. The score is the next tick.

Checked after `git fetch origin`. `origin/main` is `b421c70` (`b421c7015227886a5733f19967cf4a9c1fc74083`), the merge of PR #122. Node v24.21.0, ICU 78.3. `npm test` passed, 456 tests, 0 failed. The 72-tick fixture matched: `86507558d49cee305c5f663e1699aacc19d66356ce518d4c32ac1e07085d8687` (8426), `c6268c398c5b8a674a1bef8a675cd74c747392e3fb767a67e1ebd8bc1a4143f6` (8335), `d62ab7f9c9e840b55c012fb1d8f2fe6929a61359178b4daf7b5eb10cbf7bca95` (8266). The harness edited the sim, ran, and was restored. Flags defaulted off. Seeds 1847, 2718, and 4096, in that order, in one process. The governor seats sit in a module map and are not cleared between seeds. That is how the stack pin was run. No player commands.

The tick-1200 hashes are the walk in [contract refusals](contract-refusals.md). A second run on this tip reproduced them.

### Tick 72

Seed 1847 offers nothing inside 72 ticks, and that row is the stack pin. Seeds 2718 and 4096 move.

| Seed | State hash | Events | Accepted | Fulfilled | Breached | WG | WG rate | FT | FT rate |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1847 | `1f350990d9bfd9d3cd9458bf9bc59d23f1416e4fc1ea85a3163c739e7be3300e` | 8496 | 0 | 0 | 0 | 17904.84 | 0.14 | 1195.88 | 0.08 |
| 2718 | `591add204c5a93dd363f1b91f0f7126bb80bd3c5a26973c5c046b0f2d1513616` | 8564 | 2 | 1 | 1 | 17755.75 | 0.14 | 1401.41 | 0.08 |
| 4096 | `895ede93add6e5c31a82f53562a97182270faaffbe5357723e5ccfdd971ae059` | 8435 | 4 | 1 | 2 | 18055.21 | 0.13 | 1190.79 | 0.08 |

Offers, refusals, and what is still open. 1847: offered 0, refused 0, and the acceptance row is closed. 2718: offered 7, refused 4, accepted 2. One offer is still unanswered. The two acceptances are one breach and one fulfilment. 4096: offered 5, refused 1, accepted 4. Every offer has been answered. One acceptance is still open. The other three are two breaches and one fulfilment. No secession. No death.

### Tick 1200

| Seed | State hash | Events | Accepted | Fulfilled | Breached | WG | WG rate | FT | FT rate |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1847 | `acde8d6b66b11d2bc8bbb89e2e92acf0aa5a555d8e9f515b74a5479189b79696` | 162137 | 208 | 36 | 172 | 13543.34 | 0.07 | 0.00 | 0.17 |
| 2718 | `633868b09e49911fe1bfe5a86a89d7d45e4093773863df6e683ef1c6b91f0a7e` | 159710 | 119 | 13 | 105 | 5158.06 | 0.09 | 18.91 | 0.17 |
| 4096 | `9d5cfc389cafd273d5d5bb86ac3180870be9ebb086fa32808585d1671a57843e` | 163464 | 235 | 60 | 175 | 12436.65 | 0.09 | 0.00 | 0.16 |

Offers are 268, 145, and 316. Refusals are 59, 26, and 81. One offer is still unanswered on 1847. On 2718 and 4096 every offer has been answered. The acceptances on 1847 and 4096 are closed: 172 breaches and 36 fulfilments, and 175 breaches and 60 fulfilments. On 2718 one of the 119 acceptances is still open. The other 118 are 105 breaches and 13 fulfilments. Shelves with a carrier in reach and nobody who would accept are 871, 990, and 889.

Secessions. 1847, five: Dax Pike (`character-20`) at cinder-key, tick 529, Free Cinder Key; Finn Frost (`character-18`) at crown-harbor, tick 552, Free Crown Harbor; Mara Calder (`character-21`) at cinder-key, tick 591, Free Cinder Key II; Esme Dusk (`character-19`) at glassport, tick 591, Free Glassport; Zara Gale (`character-17`) at crown-harbor, tick 628, Free Crown Harbor II. 2718, four: Mara Calder at glassport, tick 743, Free Glassport; Corin Hale (`character-16`) at glassport, tick 781, Free Glassport II; Dax Pike at cinder-key, tick 807, Free Cinder Key; Zara Gale at glassport, tick 862, Free Glassport III. 4096, one: Corin Hale at cinder-key, tick 809, Free Cinder Key.

Deaths are the same names and ticks as the stack pin. 1847, tick 1080: Lio Crow (`character-12`), World Government. 2718, tick 180: Lio Crow, World Government; tick 720: Esme Dusk (`character-19`), Free Tide. 4096, tick 540: Kessa Dusk (`character-30`), unaffiliated.

The follow-up, a carrier who has accepted buying the shortfall and sailing, is the haul slice below. The measurement is [contract fulfilment](contract-fulfilment.md). It is ruled. It is unbuilt.

## Haul slice

After the batch 2 pin. This is its own slice. It is not a step inside the pin's commit, and it does not replace contracts slice 4. Batch 3 stays the alliance slices.

Checked after `git fetch origin`. `origin/main` is `57bbb54` (`57bbb54f8b6ad253399b4e60a1d891b586643063`), the merge of PR #124. Node v24.21.0, ICU 78.3. `npm test` passed, 459 tests, 0 failed. The 72-tick fixture matched: `86507558d49cee305c5f663e1699aacc19d66356ce518d4c32ac1e07085d8687` (8426), `c6268c398c5b8a674a1bef8a675cd74c747392e3fb767a67e1ebd8bc1a4143f6` (8335), `d62ab7f9c9e840b55c012fb1d8f2fe6929a61359178b4daf7b5eb10cbf7bca95` (8266). The harness was local and was restored. The same run reproduced the stack pin, the walk, and the haul without cancellation. The tables are in [contract fulfilment](contract-fulfilment.md).

The Lead's rulings.

Build the haul with weight = score, as `round(score * 100, 2)`. On acceptance, emit `contract-order-issued` and keep that score. Buy the shortfall where the carrier stands. The 16% depth cap does not apply to that buy. Sail on that tick when the grain, the deadline, and the passage allow it. Pay a landing before the deadline breach. The weight of 1000 stays the measured alternative. It does not build.

Cancel only once the destination shelf holds the full contract quantity, `stocks.provisions >= 10`, before landing. The quantity is 10. Below 10 the haul continues. There is no breach, no loyalty hit, no reputation hit, and no payout. The carrier keeps any cargo it bought. The event is `contract-cancelled` with reason `no-longer-needed`. `choice` / `deadline-infeasible` stays a breach. The earlier bar, `stocks.provisions >= 1`, stays the recorded run in [contract fulfilment](contract-fulfilment.md).

Depends on the batch 2 contracts pin: the walk, the 56.25 payout, and the `< 1` offer gate. The cancellation test is the full quantity. The offer gate stays `< 1`.

Checked after `git fetch origin`. `origin/main` is still `57bbb54`. Node v24.21.0, ICU 78.3. `npm test` passed, 459 tests, 0 failed. The 72-tick fixture matched. The harness was local and was restored. The same run reproduced the stack pin (`a8395215`, `a4ccfe81`, `210a73dc`), the walk (`acde8d6b`, `633868b0`, `9d5cfc38`), and the haul without cancellation (`926490c5`, `f1bcc842`, `0709ed3f`).

Tick 1200 with cancellation at `>= 10`: `d8a222fbe4bf7fcd293ff7f8cb5e3e15d79c8653d5bd253eebac2342b2d406f8` (162633), `0df2fcc581874d724b04c81f86dbdc49330171d9a5b16fafff2bababc2ce689e` (158265), and `2b7906851ab91c9c025243066f3c35fd70120b04ed9452a7cfa0a57fa47df229` (164166). Accepted, fulfilled, breached, and cancelled are 260 / 60 / 197 / 3, 147 / 49 / 92 / 4, and 337 / 101 / 220 / 16. Two of the 147 acceptances on 2718 are still open. World Government ends at 8387.75, 12581.89, and 6244.37. Free Tide ends at 0.00, 0.00, and 0.00, rates 0.20, 0.17, and 0.17. Offers are 320, 186, and 430. The account of each acceptance is in [contract fulfilment](contract-fulfilment.md).

Cancellation at `>= 1` stays the comparison: `f92a0d8b` / `bb69fdfa` / `f6adf11f`, accepted, fulfilled, breached, and cancelled 379 / 36 / 101 / 242, 219 / 28 / 53 / 138, and 477 / 86 / 113 / 278. World Government there ends at 13673.38, 6045.56, and 6195.28. The haul without cancellation is `926490c5`, `f1bcc842`, and `0709ed3f`, fulfilments 63, 16, and 87, World Government 8308.59, 11281.75, and 12120.63. The walk is `acde8d6b`, `633868b0`, and `9d5cfc38`, World Government 13543.34, 5158.06, and 12436.65.

On seed 1847 the haul without cancellation ends 5234.75 below the walk. The account is in the fulfilment note. Sale tax and work tax are the loss. Contract coins are 285.89 of it. With cancellation at `>= 1`, that seed ends at 13673.38, above the walk, and it has no secession. The books close. The drop is the campaign. At `>= 10` the same seed ends at 8387.75, with three secessions.

Writes `contract-order-issued`, the buy, the cast-off, the landing, and `contract-cancelled`. The same escrow and the same purses as contracts slice 4. A cancellation writes no loyalty and no reputation. A deadline breach still does.

## Questions

Settled with this note.

1. **Where do the neutral reducers sit?** In the commit that first emits the type. Negotiation slices 2, 4, and 7, and the alliance propose and break commands. A headless run emits none of them. They are not a re-pin.

2. **Does patronage join a batch?** It stays unbuilt. The step is 0.04. It is not in batch 2 or batch 3. There is no `patronageAdjustment` under `src/`.

3. **Do negotiation and alliances join the order?** Yes, on the accepted defaults. [Negotiation](negotiation.md) is PR #100. [Alliances](alliances.md) is PR #92. Nothing is forced at tick 0. Negotiation adds no hash-moving slice. The hash-moving alliance slices are batch 3.

4. **Does batch 1 fold into batch 2?** No. Batch 1 is on `origin/main` at `f02ed4e`. Its tick-1200 pin is the batch 1 row, and the golden file stays. Batch 2 was measured on top of it. The pin is the remeasure, not the fixed-death table.

5. **Does the aging chance from 80 to 120 land with the fixed death?** No. Aging is a fixed death at 120 only, with no per-tick chance. The earlier stack used a side-stream per-tick chance plus certain death at 120 and killed 13, 5, and 8. That stack is superseded. This pin kills 1, 2, and 1.

6. **Who declares, and what does he read?** The governor declares. The stability and the followers he reads are the news ledger under the 24-tick cap. A port the holder is standing in stays live for the tax step. That live exception stays off the secession read. No governor means nobody declares.

7. **Do fleet slices 3–7 start once the levy is in?** They stay parked. The fleet ruling still says they wait until income can carry them. The levy does not by itself carry a hull price, a crew bill, a repair, or the per-ship wage.

8. **When does a shelf draw an offer?** When `stocks.provisions < 1`. That is the `buy-provisions` gate the contracts note counted. It builds with the 56.25 offer in batch 2. The `<= 0` gate is the superseded table.

9. **Does a landless faction still step its rate?** No. A faction that holds no port freezes its rate. No autonomous step up or down until it holds a port again.
