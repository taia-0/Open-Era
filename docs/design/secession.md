# Secession

**Status: Open.** Design brief for the Lead. Nothing in this note is in the tree. The census below is a local readout of the unmodified simulation. `src/` was not changed.

Checked on `origin/main` at `c2a812d8c3c3280931069db00f92839c1dd2f6fe`. Node v24.21.0, ICU 78.3. `npm test` passed, 358 tests. The 72-tick fixture passed, including the golden recovery replay of 600 events:

| Seed | Tick 72 state hash | Events | Tick 1200 state hash | Events |
| --- | --- | --- | --- | --- |
| 1847 | `4ea893a485b05ce6eab599919765903ade9a0ce45f383437f4698064faa7a297` | 8413 | `90dacc2dfcd199ab720ade191bd3fdf8742632a36f19216bd53ce0e3a3294fef` | 160268 |
| 2718 | `d376ad02c6e7c9b03dd0eb4db1c3c137ac7a00d61a096673e12ae4fdabbdfef2` | 8456 | `226bf6257a86b233d197bd77747a10fe64b33dd7ac1e94bc27c11ff3ddf50cd8` | 161850 |
| 4096 | `ac780b3999c3da53f38c0cd16301dfa7f60562a35796f5fa0451c969c9ed08de` | 8261 | `30e9994387b2c9a2d8c0e16e27042797599188a105992cb7a9f8d2e924a8b0a6` | 162459 |

Runs are `createPrototypeWorld` plus `runTick`, no player commands. A figure at tick 72 or tick 1200 is the world after that many calls. Samples are the state after ticks 0, 72, 100, and every 100 ticks through 1200.

This brief assumes the stability response in the [leader tax](leader-tax.md) addendum on `origin/docs/leader-tax-stability`: a holding rate above 0.15 drifts each faction-held settlement's stability down by 0.03 on each peaceful upkeep. That response is not in this tree. The census did not resimulate it.

## Summary

A port leaves its faction only when the person who owns it declares the break. The world does not schedule a rebellion, and a low stability number does not start one by itself. The owner is already a real person: a claim writes `ownerId`. There is no governor. On these three seeds that owner is often present at the moment of the claim and often away afterward, and the only command holder who owns a port is Pax Ash. The scenario tax rates are 0.14 and 0.08. Both sit at or under 0.15, so the autonomous rule in this note declares zero times. A player can still declare. The garrison and the named people on the dock then follow by a fixed reading of tax, stability, provisions, and loyalty. The population number stays on the port, because it is one count, not a set of people. The old faction hears a public line. Taking the port back uses the raid and the claim that already exist, which means the break has to leave a faction id in place. A neutral port cannot be raided today.

## 1. The declaration is the trigger

[Game vision](game-vision.md) wants resistance to come from characters, material conditions, opportunities, and player action. It refuses a rebellion manufactured to restore balance. [World simulation](world-simulation.md) says separation happens when the owner declares it, succeeds immediately, notifies the former faction, and then lets population, garrison, local characters, and other assets decide separately whether to follow. [Political layer](political-layer.md) already records the same cut: loyalty is not the trigger, the declaration is, and that slice does not add it.

The rule here is the same cut. One new command, one new event. No tick rolls a revolt. No shortage, no stability floor, and no tax rate emits `secession-declared` on its own. The material numbers are the autonomous owner's reason to declare, and the test for who comes along after someone has declared.

## 2. Who may declare

`Settlement` stores two different facts. `factionId` is the faction that holds the port and collects its tax. `ownerId` is a character id, or null. `makeSettlement` sets `ownerId` to null. The only writer after that is the `settlement-claimed` reducer, which copies `event.data.ownerId` and `event.data.factionId`. The claim emitter sets those to the claimant and to `character.factionId`. Nothing else assigns either field. Nothing assigns `character.factionId` after setup, so the owner's membership does not drift away from the port's faction unless a later secession moves it.

There is no governor. [Roadmap](../roadmap.md) already notes that `governor` does not occur under `src/`. A local character is someone whose `locationId` is the port, whose `travel` is null, and whose `captivity` is null. That person can follow. They cannot declare.

The owner and the faction holder are different kinds of id. Before any claim the four ports are unowned: Crown Harbor and Glassport are World Government, Cinder Key is Free Tide, Verdant Cay is neutral. After a claim the owner is a member of the faction just written onto the port, or unaffiliated if the claimant was. On these runs every ownership spell has `owner.factionId === settlement.factionId`. Unaffiliated owners: 0. Verdant Cay owners: 0.

A spell is one owner on one port, from the tick of the claim through the tick before the next owner.

| Seed | Spells | Crown Harbor | Cinder Key | Glassport | Verdant Cay | Spells whose owner is the command holder |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1847 | 24 | 9 | 5 | 10 | 0 | 3, all Pax Ash |
| 2718 | 25 | 9 | 7 | 9 | 0 | 4, all Pax Ash |
| 4096 | 30 | 12 | 7 | 11 | 0 | 2, all Pax Ash |

Mara Vane issues World Government's orders and never owns a port in these runs. Pax Ash (`character-14`) is the only command holder who does. The other owners are members: raiders, explorers, merchants, stewards, and officers of whichever faction just took the port.

**Default.** The declarer is `settlement.ownerId`. The settlement's `factionId` is non-null. The owner's `factionId` equals it. The owner is anchored on that port and is not captive. A player who is also the command holder may declare. An autonomous command holder may not. A character who is merely standing there may not.

## 3. Who follows

The decision is one pass, in character id order, with no `rng.next`. It runs only inside the declaration. Loyalty is `personality.loyalty + (loyaltyAdjustment ?? 0)`, the same sum the cover sort reads. The M31 scar is that adjustment, −0.04 per unpaid release, omitted at 0.

**Population.** It is one integer on the settlement (`18000`, `7200`, `6400`, `10500` at setup). There is no per-person population to split. The count stays on the port. Sampled owned ports keep 18000, 6400, and 10500. Verdant Cay's 7200 is never owned.

**Garrison.** The whole integer follows, or none of it does. It follows when the port is pressed: the holding `taxRate` is above 0.15, or stability is at or below 55 (`CLAIM_STABILITY_FLOOR`), or `stocks.provisions` is below the ration `round(population / 3600, 3)`. Otherwise the event stores garrison 0. There is no faction troop pool to receive the soldiers who stay loyal, so they are removed rather than marched home. No partial stack, no roll.

**Local characters.** A character follows when all of these hold:

- anchored on the port, not captive, and not the owner
- `factionId` equals the holding faction
- not `commandHolderId` of that faction
- loyalty is below 0.75
- the port is pressed, or `cargo.provisions` is below `provisionDemand`

0.75 is the floor of the officer band in `personalityFor`. An officer follows only when the seed was low enough, or a scar has pulled the reading under 0.75. The command holder stays with the old faction. Unaffiliated bystanders stay unaffiliated.

**Enough.** The declaration still succeeds with nobody following. That is the world-simulation line. "Viable" in the census means at least one character follows and the garrison follows. It is a readout, not a veto.

## 4. What the old faction is told, and how it answers

New event `secession-declared`. `actorId` is the owner. `targetId` is the previous faction id. `settlementId` is the port.

`eventPayloadVisible` hides every event that has an `actorId` from everyone except that actor. `settlement-claimed` is already on `summaryStaysWhenWithheld`, so the feed keeps a public sentence while `data` stays null. The secession event joins that list. The sentence is "{owner} declared {settlement} separate from {old faction}." Follower names stay out of the sentence.

The payload is visible to the actor and to members of the previous faction, so the faction that lost the port can see who left. A rival who is in neither faction gets the sentence only. Treasury and power stay hidden. `projectFactions` already publishes a rival's name, `commanderId`, `actingCommanderId`, and `taxRate`. A new faction appears there on the same terms. `ownerId` on the settlement panel is already live only while the commander is standing on the port.

**Accept.** Do nothing. No new command. The new faction keeps the port.

**Retake.** The existing raid, battle, surrender, and claim. `hostileTerritory` is true only when the port's `factionId` is non-null and different from the attacker's. A neutral port is not hostile, which is why Verdant Cay is never claimed. The break therefore has to write a faction id, or the old faction cannot raid it.

The autonomous raid still requires garrison at least 15 while the attacker holds any port, or at least 8 when the attacker holds none. Garrison on these claims is the remainder of the fight, 3 to 12 at the first tick the tax-open readout would declare. An old faction that still holds another port will not raid until regrowth crosses 15. A player raid is not garrison-gated. The claim, the surrender line, and the stability floor of 55 stay as they are.

**Negotiate.** Conversation threads exist. No treaty writes `factionId` or `ownerId`. Negotiation is outside this brief.

## 5. Independence and founding a faction

The world-simulation note allows independence first, and a faction later if the port lasts. The raid gate makes a null `factionId` a port the old faction cannot attack. **Default: the declaration founds the faction in the same event.** Remaining unaffiliated waits until a raid can target a neutral break.

The new `Faction` is carried on the event, so replay does not invent it:

- `id`: `secession-{ownerId}-{settlementId}-{tick}`
- `name`: the name on the command, or the owner's name when the command omits it. An autonomous declaration passes no name. The faction is then `Free <port name>`, for example `Free Crown Harbor`. When that name is already taken, the next name adds a roman suffix, `Free Crown Harbor II`, then `III`. No draw.
- `color`: `#2f6f4e` for every founded faction in this prototype
- `treasury`: 0
- `taxRate`: 0.08, Free Tide's scenario rate, which is not above the 0.15 drift line
- `actingCommanderId`: omitted

The old treasury is not split. The landless-faction note left that split out, and this brief leaves it out. The owner's purse is unchanged.

Membership: the owner and each id in `followerIds` get the new `factionId`. Everyone else stays. `ownerId` stays the declarer. Stability is copied through. Garrison is the absolute on the event. Population is untouched.

The command seat is not a stored field. `commandHolderId` is whoever issues the faction's standing orders, and a second issuer leaves the seat unnamed. **Default: the declaration does not mint a standing order.** The new seat is unnamed until an `issue-order`. Minting a `protect` inside the reducer would hand the owner an order the planner would obey on the next tick.

## 6. The player command, and the autonomous decision

Player command, beside `claim-settlement`:

```json
{ "playerId": "…", "type": "declare-secession", "settlementId": "glassport", "name": "Finn Frost" }
```

`name` may be omitted. The boundary refuses, with a reason, when the player's character is not the owner, is away or at sea, is captive, or is not a member of the holding faction, and when the port has no faction. The player does not have to clear the tax and stability gate. The declaration is the act. A name the player passes is stored as given. An omitted player name is still the owner's name.

The autonomous walker passes no name. The new faction is `Free` plus the port's name. A name already held by a faction takes the next roman suffix, `II`, then `III`. The choice reads the factions already in the world and does not draw.

The autonomous rule runs once per tick, after settlement upkeep and player commands, before battles. Ports are walked in id order. No draw. An autonomous owner declares on the first tick all of these hold, and not again during that spell:

- the owner gate in section 2, and the owner is not the command holder
- the holding `taxRate` is above 0.15
- stability is at or below 55

On the scenario rates that second line is never true. World Government is 0.14. Free Tide is 0.08. The census in section 8 is that zero.

## 7. Determinism, the event, recovery, hashes

`secession-declared` carries the absolutes the reducer assigns. It does not carry a delta the reducer would add to whatever the live world happens to hold. `WorldStore.recover` replays through `applyEvent` only. A follower list computed beside `emit` and left off the event is on the next snapshot and gone when recovery starts from an earlier one. That is the M33 rule, already written up for the ransom credit and the release record.

```json
{
  "type": "secession-declared",
  "actorId": "character-18",
  "targetId": "free-tide",
  "settlementId": "glassport",
  "data": {
    "previousFactionId": "free-tide",
    "ownerId": "character-18",
    "followerIds": ["character-22"],
    "garrisonFollowed": true,
    "garrison": 11,
    "stability": 55,
    "faction": {
      "id": "secession-character-18-glassport-59",
      "name": "Finn Frost",
      "color": "#2f6f4e",
      "treasury": 0,
      "taxRate": 0.08
    },
    "previousActingCommanderId": null,
    "actingCommanderId": null
  }
}
```

`followerIds` is sorted. The reducer writes those characters and the owner onto the new faction, writes the faction, and writes garrison and `factionId` from the event. It does not re-test loyalty. A later change to the 0.75 line does not rewrite a declaration already in the log. If `actingCommanderId` of the old faction is the owner or a follower, the event carries the replacement, chosen by the existing cover sort over the members who remain, and the reducer assigns that id or deletes the key. Recomputing it from the world at apply time would also be deterministic. Carrying it means a later change to the cover sort does not rewrite the seat.

`stateHash` is sha256 of the canonical world. The event log is counted, not hashed. A declaration adds a faction, moves membership, retargets the port, and may clear a garrison or an acting id, so the state hash moves on that tick. `metrics-recorded` stores each faction's settlement count, so the census payload moves too, and the event count rises by one plus any row that the new membership changes later in the tick. No declaration means no new field and no new event. `loyaltyAdjustment` is only read. World `version` stays 5.

## 8. Measurement on today's runs

Scenario rates, live stability, owner present and free, command holder excluded. Eligible spells: **0 / 24, 0 / 25, 0 / 30**. Allowing the command holder as well: still **0 / 24, 0 / 25, 0 / 30**, because Pax's ports are Free Tide at 0.08. Eligible characters under this rule are those owners and nobody else. Inside the 72-tick window the same counts are 0.

Owners do exist. The first claims are tick 59 (1847, Glassport, Finn Frost), tick 47 (2718, Cinder Key, Kessa Calder), and tick 45 (4096, Cinder Key, Jun Marrow, replaced at tick 48 by Mara Calder). Ticks with at least one owner, out of 1201 ticks from 0 through 1200: **1142, 1154, 1156**. Port-ticks owned: **2869, 2698, 3087**. Of those, the owner is present **1459, 1214, 1305**, away **1410, 1484, 1782**, and captive **112, 209, 1**.

Claim stability is 55 on 77 of 79 spells. The two others are Pax Ash at Glassport on 1847 (56.1) and Corin Hale at Glassport on 4096 (56.7). While a spell lasts, stability ranges **40.92–64.87**, **43.03–66.1**, and **33.01–64.72**. Provisions touch 0 on **23/24, 25/25, and 28/30** spells. The rations are 5 at Crown Harbor, 1.778 at Cinder Key, and 2.917 at Glassport.

At tick 72:

| Seed | Port | Owner | Present | Stability | Garrison | Provisions / ration | Tax | Owner loyalty | Anchored |
| --- | --- | --- | --- | ---: | ---: | --- | ---: | ---: | ---: |
| 1847 | Cinder Key | Jun Marrow | no | 55.15 | 10 | 186.134 / 1.778 | 0.14 | 0.73 | 4 |
| 1847 | Glassport | Finn Frost | yes | 55.39 | 11 | 23.875 / 2.917 | 0.08 | 0.322 | 10 |
| 2718 | Cinder Key | Kessa Calder | no | 55.75 | 7 | 0.361 / 1.778 | 0.14 | 0.491 | 6 |
| 4096 | Cinder Key | Mara Calder | no | 55.72 | 5 | 62.321 / 1.778 | 0.08 | 0.796 | 7 |

At tick 1200 each seed has three owned ports. Crown Harbor's provisions are 0 against a ration of 5 on every seed. Stabilities are 56.29, 56.29, and 55.96. Garrisons are 12, 16, and 8. The owners are Zara Gale, Corin Hale, and Vale Drake. Cinder Key and Glassport are likewise owned, garrisons 5 to 11, provisions 0 or under 1, tax 0.14 or 0.08. Pax Ash owns Glassport on 2718 and is the command holder there.

**Sensitivity.** The tax gate is the binding one. Opening it in the readout, and still using live stability, is the stand-in for a rate of 0.20. It is not a resimulated world, and it is not the addendum's drifted run. Eligible means the owner is present, free, not the command holder, and stability is at or below 55.

| Seed | Eligible spells | Viable | Followers summed at the first eligible tick | Eligible in 72 ticks | Viable in 72 ticks |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1847 | 21 | 13 | 18 | 2 | 2 |
| 2718 | 21 | 10 | 17 | 1 | 0 |
| 4096 | 28 | 20 | 40 | 2 | 1 |

The garrison follows on every one of those spells, because an open tax gate presses the port. Viability is then "at least one anchored member under 0.75 loyalty." The spells that stay ineligible are the Pax Ash holder spells: 3, 4, and 2.

Lowering the live stability by 10, 20, or 30, or subtracting 0.03 times the peaceful upkeeps so far from the live stability, with the tax gate still open: the same eligible and viable counts. One tick moves. Corin Hale's Glassport spell on 4096 is claimed at stability 56.7. The live-stability readout waits until tick 393 (4 followers). Each lowered readout is eligible at the claim tick 344 (3 followers). Both are viable, so the 4096 follower sum is 40 on the live readout and 39 on the lowered ones.

A threshold of 0.10 instead of 0.15, live rates, live stability: World Government's 0.14 qualifies and Free Tide's 0.08 does not. Eligible / viable: **12/10, 12/5, 15/11**. Inside 72 ticks: **1/1, 1/0, 1/1**.

The addendum's resimulated world at uniform 0.20 with drift 0.03 was not rerun here. Who would own the ports in that world is unmeasured. The addendum already reports that a claimed port left in peace stays on the claim floor of 55 under that drift. On today's owners, stability at or below 55 is already true on the claim tick of 77 spells, which is why lowering it further does not add spells.

Sampled `loyaltyAdjustment` on people standing in a port is the scar, in steps of 0.04: Mina Vale, Esme Dusk, Bram Quill, and Mara Vane on 1847; Mina Vale, Esme Dusk, Mara Vane, and Vale Drake on 2718. The scenario gate closes before that scar can make a declaration.

## 9. Slice plan

| Slice | What lands | Hash on these three seeds |
| --- | --- | --- |
| 1 | A readout, computed when the settlement panel is built. Owner, whether the owner gate passes, how many characters would follow, whether the garrison would follow. Not written onto the world and not written onto an event. | Neutral. `stateHash` and the event count stay on the table above. |
| 2 | `declare-secession`, the reducer, and `secession-declared`. No autonomous caller. A headless run never queues the command. | Neutral, for the same reason a headless run emits no `tax-rate-set`. A session that declares moves the state hash and the event count on that tick, and moves `metrics-recorded`. That session was not run. The expectation was not re-measured with the command compiled in. |
| 3 | The autonomous rule in section 6. | The "eligible spells are 0" line predates leader-tax autonomy (#94). Free Tide now raises its rate above 0.15, so the walker fires. 72 ticks stay on the table above: the first declaration is past that window. At 1200 ticks the walker fires 6 / 5 / 4 times. First events, all `secession-declared`: 1847 sequence 54705 tick 438, 2718 sequence 90617 tick 705, 4096 sequence 50341 tick 400. |

Slice 1 can show the tax-open column as a second line, still without storing it. Slice 3's zero-spell sentence assumed the scenario rates 0.14 and 0.08 for the whole run. That census predates leader-tax autonomy (#94). A line above 0.10 would still let World Government's opening 0.14 through and would move the 72-tick fixture: the first qualifying claims are ticks 67, 47, and 45.

## 10. Questions for the Lead

The Lead rules on these against [game vision](game-vision.md). Defaults are what this brief would build.

1. **Who declares?** Default: the settlement owner, present and free, and a member of the faction that holds the port. There is no governor, and a neighbour on the dock cannot declare. Measured owners are claimers. Their faction matches the port on all 79 spells.

2. **May the command holder declare?** Default: a player may. An autonomous holder may not. Pax Ash is the only holder-owner in these runs, on 3, 4, and 2 spells. Letting him declare still yields no scenario-rate declaration, because Free Tide's rate is 0.08.

3. **Does a player have to wait for the tax and the stability line?** Default: no. The player's declaration is the trigger. Autonomous owners wait for a rate above 0.15 and stability at or below 55.

4. **Who comes along?** Default: the whole population count stays. The garrison follows as a whole when the port is pressed, and is removed when it does not. An anchored member follows when loyalty is under 0.75 and the port or their own hold is short, and the command holder does not follow. Success does not require followers.

5. **Independence, or a new faction immediately?** Default: a new faction in the same event, treasury 0, tax 0.08, seat unnamed. A player declaration keeps the name the player gives, and an omitted player name is still the owner's. An autonomous declaration is `Free <port name>`, with a roman suffix when that name is taken. A null faction id cannot be raided. No split of the old treasury.

6. **What does the old faction see, and what can it do?** Default: the public sentence, and the payload for its own members. Retake is the existing raid and claim. No accept command and no treaty in this slice. Autonomous raids wait until the garrison reaches 15 while the old faction still holds another port.

7. **Which tax line opens an autonomous declaration?** Default: above 0.15, the addendum's line. These seeds then declare zero times, and slice 3 holds the fixture. A line above 0.10 would let World Government's 0.14 through and would move the 72-tick hashes.
