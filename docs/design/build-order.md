# Build order

**Status: Open / scheduling note.** No slice below is in the tree. The Lead's rulings stand. This note only orders the ones that are still unbuilt. The harness was local and was restored.

Checked on `origin/main` at `01b2d880d22d41d39205ae8daedee2e2593c7d3e` (PR #116). Node v24.21.0, ICU 78.3. `npm test` passed, 439 tests. The 72-tick fixture passed, including the golden recovery replay of 600 events on seed 1847 split at tick 47. A headless run reproduced the fixture and the current 1200-tick baseline. `src/` and `tests/` are unchanged from `5107d7811abf87ed5775c9f774a29845ea046d72` (PR #115), which is the tree [money at sea](money-at-sea.md) measured.

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

These were ruled, and they do not enter either batch.

[Fleet](fleet.md) slices 3–7 wait until income can carry them. The levy does not start them. Slice 2 is the one-voyage limit already in the code.

[Income](income.md) lands the 0.05 governor levy only. Port dues, the sale tariff, the buy duty, the passage credit, the contract fee, the pay-first order, and the reserve floor do not land.

[Morale](morale.md) slice 3, certain desertion, does not land. [Contracts](contracts.md) at 45 does not land. [Money at sea](money-at-sea.md) slices 2 and 3 do not land. [Offices](offices.md) does not add a treasurer or an admiral. [Aging](aging.md) does not store ages at setup and does not inherit to the cover.

## Slices

A readout that writes nothing is not a slice here. "Doc" means the hash in that note, measured on an older baseline, not remeasured on this tip. "Measured" means this tip, the harness below, then restored.

### Contracts, slice 4

[Contracts](contracts.md) ruling. One autonomous captain of the faction that holds an empty shelf offers 10 provisions at 56.25. The carrier is the lowest id who passes `carrierBlocked`. The deadline is `max(travelTicks + 1, 2)`, never past 720. Free Tide pays by the quoted spend already in the tree.

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

[Negotiation](negotiation.md) is still an open brief. The defaults are not a Lead ruling. Listed because the order has to say where they would sit.

Slices 2, 4, and 7 are reducer cases with no autonomous caller. A headless run emits none of those types. Neutral. Taken from the doc. Not compiled here.

Slice 3, the ransom reply, pays `min(purse, demand)`, the coins the release already writes. The note says a reducer that omits the offer key keeps the baseline. A key stored at capture was not measured. The first capture on this class of tape was inside the fixture only on 4096. Not remeasured.

Slice 5, an autonomous buyer on an empty shelf, is the offer the contracts ruling rejected at 45 and replaced at 56.25. It does not land beside slice 4 of the contracts addendum. They would write the same contract.

Slice 6, the pact shortlist, needs a third faction on the ledger and the alliances rule. Slice 8, the autonomous tribute, was not run. The note's first tribute shape is after tick 72, so the fixture would stay and tick 1200 would move. That hash was not measured.

### Morale

[Morale](morale.md) ruling. The −0.5 term is slice 2. Desertion is slice 4: 12 short mornings, then one side-stream roll, leaving when the roll is under 0.5. Certain desertion does not land.

The term depends on the mate cap already in `memberAllowanceCap`. Desertion depends on that cap and on `personality.loyalty + loyaltyAdjustment`, the line secession already uses. Neither waits on an unbuilt slice. Patronage would move who sits under 0.75. Patronage is not ruled, so desertion does not wait for it.

The term writes `morale` on `character-upkeep`. Desertion writes `factionId` null on `character-deserted`. Place, travel, and troops stay. The same `factionId` as a death. The same cap as the stipend's headroom. The morale field is what decisions already read, so the term moves later actions without a new event type.

On the morale note's older baseline both slices keep the fixture and move tick 1200. Remeasured on this tip. The fixture still stays. The 1200 hashes are in the measurement section. They are not the hashes in that note.

### Alliances

[Alliances](alliances.md) is still an open brief. The defaults are not a Lead ruling.

Slice 2, the propose and break commands with no autonomous caller, is neutral on a headless run. Taken from the doc. Not compiled here.

The autonomous accept (slice 3), the no-raid rule (slice 4), the sighting copy (slice 5), and the break cost (slice 7) were neutral on that note because the tape never founded a third faction. This tip does. The first secession is event tick 477, 574, and 609, all after the fixture, so a writer that waits for a third faction does not enter the 72-tick window. Tick 1200 would move. That hash was not measured. Slice 6, a second attacker, is out of the brief.

The break cost writes `breakAdjustment` on the same loyalty sum as `loyaltyAdjustment` and `patronageAdjustment`. The no-raid rule writes battles and claims.

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

[Aging](aging.md) ruling. A year is 180 ticks. The run stays 1200. Death draws use a side stream. The other defaults stand. The calendar of 2190 ticks does not land. Ages are not stored at setup. The heir is not the cover.

The slices that do land are `character-aged` when the integer year increases, the read-time penalty inside `personalPower` once an age is stored, certain death at 120, and the chance from 80 to 120 on the side stream, roll stored only on the killing event. Succession is vacant. Debts pay the creditor treasury from the purse. Sailors and troops stay on the body. Ports' `ownerId` becomes null.

No unbuilt dependency. The first death in the remeasure is tick 180, 180, and 540, all after the fixture. The chance was accepted and was not remeasured. The remeasure that was run is span ages, a fixed death at 120, vacant succession, and a year of 180, on an older baseline. The fixture stayed. Tick 1200 event counts were 159664, 156271, and 159974. World Government ended at 13652.48, 14355.47, and 13799.49. Free Tide ended at 12.3, 45.66, and 150.72. Taken from the doc. Not remeasured here. The personal-power penalty was not part of that resim.

Writes `factionId`, the purse, the creditor treasury, and `ownerId`. The same `factionId` as desertion. The same purse and treasury as the wage collector. A dead governor is an empty seat, which is the offices clear.

### Offices and patronage

The roster addendum is ruled. The posts stay the command holder, the acting commander, and the port governor. A breakaway appoints nobody. The stipend is 18 from headroom, and only when the morning covers every held port. The seat clears when the port's faction changes, the officer leaves the faction, the officer becomes the holder, or on capture, death, and desertion. Secession reads the governor. `ownerId` stays the claimant.

The questions in section 8 of the port-governor brief, including patronage, were left as a separate decision. Patronage is not ruled. It is unbuilt: there is no `patronageAdjustment` under `src/`.

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
| Loyalty sum | The scar already in the tree, patronage if it is ruled, alliance `breakAdjustment` if that brief is ruled |
| Governor seat | Offices appointment, the levy's read, the secession declarer, desertion and death as the clear |
| Ledger | News slices 2 and 3 store it. Slices 4, 5, and 6 read it. A negotiation pact would read it too |
| Contract | Contracts slice 4. Negotiation slice 5 would write the same offer and does not land beside it |
| Battles and claims | Alliances' no-raid rule, if that brief is ruled. News slice 4 moves travel targets, which moves who fights |

## Order

Two re-pin batches. One batch would be fewer, and its pin was not measured: the news ledger, the levy, the stipend, the contract writer, and the death are not a small harness. The split keeps the measured pin on the current baseline and puts every other hash-moving slice in one later golden re-pin.

Batch 0 does not exist for the ruled slices. None of them is hash-neutral. The neutral reducers are in the open briefs, and question 1 asks whether they land at all.

### Batch 1 — tick 1200 only

The wage collector, the −0.5 term, and the desertion roll, in one commit, on today's baseline. No unbuilt dependency. The 72-tick fixture stays, so the golden file is not regenerated. Tick 1200 is the stack in the measurement section. Free Tide ends at 0.00 on every seed.

Aging keeps the fixture on its own older remeasure. It is not in this batch. Stacking it here would replace the measured pin, and that stack was not run.

### Batch 2 — one golden re-pin

After batch 1. One commit, one `golden:update`, one new 1200-tick record. The pin was not measured. Inside the commit, this order:

1. Offices appointment, the 18 stipend from headroom, breakaway appoints nobody, and the governor is the secession declarer. No treasurer, no admiral, no patronage unless question 2 says yes.
2. The 0.05 levy, reading that seat.
3. News slices 2 and 3, then slice 4, then slice 5 at the 24-tick cap, then slice 6. The declarer is the governor from step 1. The stability and loyalty he reads are the ledger, under the cap.
4. Contracts slice 4, the 56.25 offer.
5. Aging: the 180-tick year, `character-aged`, the personal-power penalty once an age is stored, certain death at 120, the side-stream chance from 80 to 120, vacant succession.

Desertion and death are already the seat-clear by the time the stipend is in this commit. The levy, the stipend, the wage collector, and the contract writer share the treasury, so they are not given separate re-pins.

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

Batch 1 is the three together. That row is the re-pin if batch 1 lands on this baseline. It is not the re-pin of batch 2.

Desertion alone leaves Esme Dusk at tick 546 (0.245) and Bram Tern at tick 930 (0.034) on 1847, Finn Frost at tick 282 (0.244) and Bram Tern at tick 882 (0.085) on 2718, and Mina Vale (0.160) and Esme Dusk (0.238) at tick 312 on 4096.

Batch 1 leaves Finn Frost (0.245) and Bram Tern (0.034) at tick 174 and Esme Dusk (0.407) at tick 390 on 1847. Finn Frost (0.244) at tick 282 on 2718. On 4096: Zara Gale (0.160) and Dax Pike (0.238) at tick 312, Bram Tern (0.449) at tick 438, Mina Vale (0.483) at tick 456, and Finn Frost (0.245) and Esme Dusk (0.179) at tick 672.

`debt-repaid` on the batch 1 row is 121, 19, and 54. Open debts at tick 1200 are 6, 3, and 1. The wage-only open counts, 5, 4, and 3, are the money-at-sea row and were matched by this harness.

## Questions

1. **Do the neutral reducers land before batch 1?** Negotiation slices 2, 4, and 7, the alliance propose and break commands, and an offices appoint command with no autonomous caller. A headless run would emit none of them. Default: no. They are not ruled slices, and the event types can land inside the commit that first emits them.

2. **Does patronage join batch 2?** Default: no. The offices ruling left the port-governor brief's questions as a separate decision. The addendum accepted the stipend and rejected the treasurer and the admiral.

3. **Do negotiation and alliances join the order?** Default: no. Both briefs are still open. The unprompted contract offer is already settled by the contracts ruling, at 56.25, and does not need a second writer. An alliances writer on this tip would see the first secession at event tick 477, 574, and 609, so the fixture would stay and tick 1200 would move. That hash was not measured.

4. **Merge batch 1 into batch 2 so there is one re-pin?** Default: no. Batch 1's tick-1200 pin is the batch 1 row above, and the golden file stays. Folding it into the fixture-movers would replace that pin with one that was not measured.

5. **Does the aging chance from 80 to 120 land with the fixed death?** Default: yes. The ruling accepted both. The chance was not remeasured, on this tip or in the aging remeasure, so batch 2's pin is unknown either way.

6. **Who declares, and what does he read?** Default: the governor declares, and the stability and loyalty he reads are the news ledger under the 24-tick cap. The offices addendum names the declarer. The news ruling names the read. A port the holder is standing in stays live for the tax step. That live exception was not extended to the secession read.

7. **Do fleet slices 3–7 start once the levy is in?** Default: no. The fleet ruling still says they wait until income can carry them. The levy does not by itself carry a hull price, a crew bill, a repair, or the per-ship wage.
