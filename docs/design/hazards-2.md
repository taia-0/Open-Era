# Hazards 4 and 5

**Status: Built.** Slices 2 and 3 are in `src/dashboard/visibility.ts`. The Lead accepted the defaults: drop the port clause, null `travel` on every card except the viewer's own, keep a docked rival's `locationId`, and no roll and no event. The census below is the baseline those slices were measured against. It describes the tree before the slices, not the cards after them.

Checked on `origin/main` at `6c0033335c199a851e6d3107d622af26b8e2192c` (PR #105). Node v24.21.0, ICU 78.3. `npm test` passed, 421 tests. The 72-tick fixture passed, including the golden recovery replay of 600 events on seed 1847 split at tick 47. A headless run reproduced the fixture and the 1200-tick baseline:

| Seed | Tick 72 state hash | Events | Tick 1200 state hash | Events |
| --- | --- | ---: | --- | ---: |
| 1847 | `4ea893a485b05ce6eab599919765903ade9a0ce45f383437f4698064faa7a297` | 8413 | `b302e1af1cdd4dfe7ba2ea3371bf35dd64d770c1a7c8692a0a0ed6fac20e07e9` | 164732 |
| 2718 | `d376ad02c6e7c9b03dd0eb4db1c3c137ac7a00d61a096673e12ae4fdabbdfef2` | 8456 | `e81f5ba4a3036f40f94ca02e48d856b3cf6572709277a303a718f4c273237056` | 162127 |
| 4096 | `ac780b3999c3da53f38c0cd16301dfa7f60562a35796f5fa0451c969c9ed08de` | 8261 | `f6b6aea414d205bebd264d8d2c8efba66c6287448414df7359e7a90c910c31db` | 159900 |

Runs are `createPrototypeWorld` plus `runTick`, no player commands. Seeds 1847, 2718, and 4096. A figure at tick 0 is the world before any `runTick`. A figure at tick 72 or tick 1200 is the world after that many calls. Tick numbers on events are the `tick` field. Counts below, unless they say tick 0, are snapshots at `world.tick` 1 through 1200. Tick 0 hashes are `f4411b174c7da0bd4b4c8a2e2dc6cc58b3caed7592f1854af04c28acb2ca5698`, `2a041b435821447be7426b5db5f51bf9985bf88638e07b9d0981f03f95b39142`, and `bb73f7fbb6dc3410458e9ce21128e227510d2f4d1e3331ca673aff8d8d150412`.

[Reconnaissance](reconnaissance.md) lists five hazards found while reading. The survey slices took the first three: a targeted explore delivers the officer's report to the issuer, a settlement with no report projects null rather than zero, and remote hostility for `forecastAvailable` comes from `knowledge.factionId`. Hazards 4 and 5 are still open questions 3 and 5 in that brief. [Party sightings](party-sightings.md) names the faction-port clause as hazard 4. [Sea sightings](sea-sightings.md) names the public course as hazard 5 and leaves it up. [News](news.md) is the ledger a ship would carry, and it is not in this tree. [Morale](morale.md) is the number upkeep already writes. Foreign `treasury` stays null in `projectFactions`. `sailors` is the crew on the character, and one character has one `travel`.

A mean is rounded to 3 decimals. A median is the value at linear index `(n − 1) / 2`, interpolated when that index falls between two samples, then rounded to 3 decimals. Seeds below are 1847, 2718, and 4096, in that order. A pair-tick is one commander and one other character on one snapshot.

## Summary

Hazard 4 is the second clause of `isDirectlyObserved`. A rival anchored in any port the commander's faction holds is co-located even when the commander is on another island. The card then copies condition and capability. Motive stays null. On Mara Vane's card that is 4549, 4100, and 4816 pair-ticks, across 782, 860, and 1004 snapshots.

Hazard 5 is `projectCharacter` copying `travel` on every tier. Mara's card copies another ship's course on 6634, 6929, and 7683 snapshots. Condition stays null on a distant ship. The course is still there.

Neither hazard draws. Neither emits. `applyEvent` does not read the card. Patching each slice and re-running the 1200 ticks left both hashes on the table above. The world has no `news` field. Ending treasuries stay World Government 5501.03, 6885.06, and 3608.30, and Free Tide 0, 666.09, and 0. Every `sailors` field is the same at tick 1200 as at tick 0.

## 1. What each hazard is

`characterVisibilityTier` in `src/dashboard/visibility.ts` returns self, co-located, faction, or distant. Co-located sets `conditionExact` and `capabilityExact`. Faction sets capability only. Distant sets neither. `projectCharacter` copies `locationId` and `travel` before that switch matters. Money, cargo, health, morale, sailors, troops, captivity, scars, troop recovery, and `partyPower` follow `conditionExact`. Attributes and skills follow `capabilityExact`. Plan, goal, knowledge, and personality stay on self.

`isDirectlyObserved` is true in two cases. The parties share a settlement and neither is travelling. Or the subject is anchored in a settlement the commander's faction holds. The second case is hazard 4. A ship at sea fails it, because the clause returns false when `character.travel !== null`. Standing in Crown Harbor, Mara reads a rival anchored in Glassport as co-located.

Hazard 5 is the travel object on every card: `fromId`, `toId`, `totalTicks`, `remainingTicks`. The redaction test says the course is already public. `eventPayloadVisible` still withholds another character's `travel-progressed` payload. The live object is the leak. `locationId` is copied on the same line and is question 5. It is not this hazard.

These are not world events. The dashboard calls them when it builds a card. `src/sim` does not import `visibility.ts`. There is no side stream. `DeterministicRng` is not consulted. A roll stored on an event and replayed through `applyEvent` is the wrong shape. The aging and morale notes use that shape for a chance that writes the world. This projection does not write the world.

## 2. The census

Thirty characters. Mara Vane (`character-01`) is the human, World Government, and the commander the counts in the player rows use. At the first hit she is in Crown Harbor.

Tick 0, before any `runTick`: rival hazard-4 pair-ticks are 120, of which Mara has 4. Sea character-ticks are 0.

A hazard-4 rival pair is the port clause, not the same settlement, and the subject's faction differs from the commander's. An unaffiliated subject counts. A same-faction subject in another held port is the mate upgrade, counted apart. Same-settlement rivals are ordinary co-location and stay if the clause goes.

| | All commanders | Mara |
| --- | ---: | ---: |
| Hazard 4, rival | 97260 / 88959 / 102089 | 4549 / 4100 / 4816 |
| Snapshots with at least one |  | 782 / 860 / 1004 |
| Mate upgrade | 50952 / 51416 / 48924 | 2406 / 2888 / 2961 |
| Same-settlement rivals | 155564 / 189132 / 141262 | 3671 / 3137 / 4097 |

Mara's first rival hit:

| Seed | Tick | Subject | Faction | Port | Morale | Money | Sailors | Troops | Health | Party power |
| --- | ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1847 | 3 | Mina Vale (`character-15`) | Free Tide | Glassport | 99.1 | 213 | 19 | 47 | 100 | 94.352 |
| 2718 | 1 | Sable Sorn (`character-24`) | none | Glassport | 75 | 47 | 15 | 28 | 100 | 74.918 |
| 4096 | 3 | Finn Frost (`character-18`) | Free Tide | Glassport | 91.1 | 105 | 15 | 24 | 100 | 94.145 |

On each of those cards `projectCharacter` copied skills and attributes, `travel` was null, and `stateHash` was unchanged. Plan is copied only on the commander's own card.

Mara's hazard-4 values, one row per pair-tick:

| | Morale | Money | Sailors | Troops | Health | Party power |
| --- | --- | --- | --- | --- | --- | --- |
| Mean | 24.124 / 27.371 / 23.979 | 1359.561 / 2405.765 / 2208.128 | 15.905 / 16.854 / 15.729 | 175.238 / 141.672 / 139.036 | 98.094 / 97.103 / 97.207 | 225.067 / 192.035 / 200.789 |
| Median | 6.7 / 14.6 / 13.45 | 344.09 / 527.935 / 950.895 | 17 / 19 / 16 | 144 / 49 / 83 | 100 / 100 / 99.7 | 214.842 / 113.385 / 151.522 |
| Min | 0 / 0 / 0 | 0 / 0 / 0 | 9 / 8 / 8 | 0 / 0 / 0 | 70 / 60.3 / 65.8 | 0 / 0 / 0 |
| Max | 100 / 100 / 100 | 17093.58 / 20986.85 / 14965.85 | 20 / 22 / 22 | 543 / 516 / 451 | 100 / 100 / 100 | 585.134 / 538.939 / 598.669 |

The same rows across every commander, which repeat a subject once per viewer: morale mean 32.581 / 34.666 / 32.909, median 25.2 / 25 / 28.9; money mean 1480.622 / 2029.787 / 1850.54, median 330.51 / 447.92 / 502.58; sailors mean 15.433 / 16.579 / 15.804, median 15 / 18 / 17; troops mean 150.093 / 135.474 / 140.751, median 110 / 66 / 83.

Hazard 5. Sea character-ticks, anyone with `travel` set, are 6637, 6932, and 7687. Every other character receives that object, 192473, 201028, and 222923 pair-ticks. Mara receives 6634, 6929, and 7683. The gap is her own release voyage: 3, 3, and 4 snapshots. The first of each is the snapshot at `world.tick` 1163, 921, and 844, and the events applied on that call include `captivity-released`. She does not decide to sail. Of her views, 2837, 3168, and 3182 are faction mates and 3797, 3761, and 4501 are distant. A ship at sea is never co-located.

Mara's first distant course, Crown Harbor, tick 1. Skills, morale, money, sailors, troops, health, and party power were null. The travel object matched, and the hash did not move.

| Seed | Subject | From | To | Total | Remaining |
| --- | --- | --- | --- | ---: | ---: |
| 1847 | Mina Vale | Cinder Key | Glassport | 2 | 2 |
| 2718 | Corin Hale (`character-16`) | Glassport | Cinder Key | 2 | 2 |
| 4096 | Corin Hale | Glassport | Cinder Key | 2 | 2 |

Docked distant `locationId` copies on Mara's card, travel null and tier distant, are 8383, 9402, and 6986. That is presence, which the distant redaction test keeps for the map. It is not the travel object.

## 3. What the slices would change

Slices are measured from the baseline, not stacked. A slice that does not write keeps the hash.

The readout writes nothing. It is the census above. Tick 72 and tick 1200 are the baseline table.

The hazard-4 slice makes `isDirectlyObserved` return false after the same-settlement test. The faction-port clause is gone. Rival remote pair-ticks become 0. Mate upgrades become 0. Same-settlement rivals stay 3671, 3137, and 4097 on Mara's card. A mate in another held port falls back to the faction tier: skills and attributes stay, and money, morale, sailors, and troops become null. That is the same hiding the open item already records for a mate who is not co-located. The patched file was re-run for 1200 ticks on each seed. Tick 72 and tick 1200 matched the baseline table, hashes and event counts. `projectCharacter` on the unpatched tree also left `stateHash` unchanged at those two ticks.

The hazard-5 slice copies `travel` only when the card is the commander's own. Every other card gets null. Mara's 6634, 6929, and 7683 courses come off the card. Faction and distant are both included. `locationId` stays. `seaRow` still reads `subject.travel` for a ship whose span meets the commander's, so a sea sighting can still carry a leg the commander is on. This slice does not change that function, and this run did not recount sea rows. The patched file was re-run the same way. Tick 72 and tick 1200 matched the baseline table.

News stays absent. The world object has no `news` field, and neither slice adds one. A course coming off the card does not post a ledger item, and it does not move the `travel-progressed` payload rule. Morale stays the upkeep number. The slice stops copying it for a rival who is only visible because the faction holds the port. It does not change the upkeep formula, and the minimum on Mara's leaked rows is already 0. Treasury stays the faction field `projectFactions` already nulls for a rival. The leaked money is the purse. The endings above are the baseline endings, because the hash did not move. The fleet tie is `sailors` on that same card, and the single `travel` on the character. Crews do not change across the 1200 ticks. Taking the course off the card does not change a crew.

## 4. Determinism

`stateHash` is sha256 of the canonical world. `applyEvent` throws on an unknown type and never reads a projected card. Recovery replays later events through `applyEvent` only. The golden replay is 600 events, seed 1847, split at tick 47, and it matched the continuous hash. A card rebuilt after that replay sees whatever the world stored. It does not need a new event to agree with itself.

No slice draws. A side stream was not forked, and the tick rng was not touched. One discarded draw on the tick rng is the failure the aging note already measured, and it does not belong here. `WorldState.version` stays 5. There is no new key.

The 72-tick fixture stays for both edits. Tick 1200 stays. The harness restored `src/dashboard/visibility.ts` after each run.

## 5. Slice plan

The slices are in the order they would land. Each one is measured from the baseline, not stacked.

| Slice | What lands | Hash on these three seeds |
| --- | --- | --- |
| 1 | A readout. Hazard-4 pair-ticks, the mate upgrade, same-settlement rivals, sea courses, the purse and morale and sailors those cards copy. Not written. | Neutral. The baseline table at the top. |
| 2 | `isDirectlyObserved` keeps the shared settlement and drops the faction-port clause. Remote rivals and remote mates lose co-located condition. Same-settlement rivals stay. | Tick 72 and tick 1200 stay the baseline table. Mara's hazard-4 rows become 0. Same-settlement rivals stay 3671, 3137, and 4097. |
| 3 | `travel` is copied on the commander's own card and null on every other card. `locationId` stays. Sea-sighting rows are unchanged. | Tick 72 and tick 1200 stay the baseline table. Mara's copied courses become 0. |

Slice 3 is the measured course edit. It is not required for slice 2. A faction exception, mates keeping one another's courses, was not patched.

## 6. Questions for the Lead

The Lead rules on these against [game vision](game-vision.md) and the principles in [reconnaissance](reconnaissance.md). Defaults are what this brief would build.

1. **Do rivals anchored in a held port keep exact condition and capability when the commander is elsewhere?** Default: no. That is hazard 4, and it is the "ground does not imply insight" principle. Slice 2. Mara's counts are 4549, 4100, and 4816. The first hits are Mina Vale, Sable Sorn, and Finn Frost in Glassport while she is in Crown Harbor. Same-settlement rivals stay.

2. **Does that same edit hide a mate's condition in another held port?** Default: yes. It is one clause. Mara's mate upgrades are 2406, 2888, and 2961. After the edit those cards are the faction tier: skills stay, and money, morale, sailors, and troops are null. The open item already treats own-faction money as hidden when the mate is not co-located.

3. **Does travel stay on every card?** Default: no. That is hazard 5. Slice 3. Mara's card loses 6634, 6929, and 7683 courses. Her own release voyage stays on her own card. A sea sighting can still name a leg she is actually on.

4. **Do faction mates keep one another's courses?** Default: no. Slice 3 nulls those too. The faction sea views are 2837, 3168, and 3182. Capability on the faction tier stays. An exception that left mate courses up was not patched.

5. **Does a docked rival's location stay public?** Default: yes. Hazard 5 is the travel object. Mara's docked distant location copies are 8383, 9402, and 6986. The distant test keeps `locationId` because the map depends on it. This brief does not take it down.

6. **Does either slice draw, or write through `applyEvent`?** Default: no. No side stream, no new event, no new world key. The reducer does not see the card. The fixture and the 1200-tick hashes stay the baseline table. A stored last-seen course was not measured on this tree.
