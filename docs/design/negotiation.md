# Negotiation

**Status: Open.** Design brief for the Lead. Nothing in this note is in the tree. The census is a local readout of the baseline tape. The harness was not left in the tree.

Checked on `origin/main` at `8ff578c4a9ed26cf71b4e92eada83b43cf042626` (PR #99). Node v24.21.0, ICU 78.3. `npm test` passed, 405 tests. The 72-tick fixture passed, including the golden recovery replay of 600 events on seed 1847 split at tick 47. A separate headless run reproduced the fixture and the 1200-tick baseline:

| Seed | Tick 72 state hash | Events | Tick 1200 state hash | Events |
| --- | --- | ---: | --- | ---: |
| 1847 | `4ea893a485b05ce6eab599919765903ade9a0ce45f383437f4698064faa7a297` | 8413 | `28866eb80bd48798c78791dd8f0c4093b9ffecfb8009421db7dd2c109d4f1e47` | 161658 |
| 2718 | `d376ad02c6e7c9b03dd0eb4db1c3c137ac7a00d61a096673e12ae4fdabbdfef2` | 8456 | `712b60edc75c313f17e774951f43aa84fcd487fbc29c422215cd602b19665be8` | 161613 |
| 4096 | `ac780b3999c3da53f38c0cd16301dfa7f60562a35796f5fa0451c969c9ed08de` | 8261 | `b0ac72fe452697010e58570136737e4dd8ed12770a2e86863bfdaa76ee07e114` | 162327 |

Runs are `createPrototypeWorld` plus `runTick`, no player commands. Seeds 1847, 2718, and 4096. A figure at tick 0 is the world before any `runTick`. A figure at tick 72 or tick 1200 is the world after that many calls. Tick numbers on events are the `tick` field. Samples below are every state from tick 0 through tick 1200, 1201 states.

[Ransom split](ransom-split.md) pays a faction captor's treasury every cent of the coins that leave the purse. [Contracts](contracts.md) is the paid provisions haul; the command and the scorer are in the tree now, and a headless run still does not offer one. [Alliances](alliances.md) is the pact this note does not re-simulate. [Offices](offices.md) and [leader tax](leader-tax.md) are the holder and the rate. [Treasury spending](treasury-spending.md) and [treasury balance](treasury-balance.md) are whose coins move. [News](news.md) is the ledger each side is allowed to know. [Small agents](../research/small-agents.md) is the hook: a scorer builds a legal shortlist, and `candidates[0]` is the pick when the model is off.

## Summary

This tape pays ransoms and does not bargain. Captures are 16, 14, and 9. Releases are 16, 13, and 9. Escapes are 0. One prisoner is still held at tick 1200, on 2718. Every release writes `leaderShare` 0. Paid coins are 2559.28, 1619.21, and 737.07, all of them `treasuryShare`. Debts left on the release are 2392.77, 1485.82, and 1852.50. There is no accept event and no refuse event for a ransom.

Contract events are 0. `offer-contract` exists and was not queued. Pact, alliance, treaty, and tribute events are 0. `secession-declared` is 0. No state has more than two factions. Standing orders are the scored yes/no that already runs: accepted 14, 14, and 16, refused 6, 6, and 4, all of them event tick 0. Claims are 32, 24, and 22. `settlement-surrender-declined` is 0.

## 1. What is settled today

`processCaptivityDeadlines` is the ransom. Fourteen days after capture, `CAPTIVITY_MAX_DAYS` times `ticksPerDay`, the prisoner pays `min(purse, demand)` and the remainder is a `DebtObligation`. A faction captor's treasury receives every cent. The party leader receives 0. Nothing reads `remainingValue` again. The prisoner does not accept or refuse.

| Seed | Captures | Releases | Still held | Paid in full | Partial | Paid nothing | Coins paid | Debt left |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1847 | 16 | 16 | 0 | 8 | 7 | 1 | 2559.28 | 2392.77 |
| 2718 | 14 | 13 | 1 | 7 | 6 | 0 | 1619.21 | 1485.82 |
| 4096 | 9 | 9 | 0 | 3 | 5 | 1 | 737.07 | 1852.50 |

Paid in full is `debtValue === 0`. Partial paid something and left a debt. Paid nothing is `moneyPaid === 0`. The first capture is tick 119, 119, and 20. The first release is tick 203, 203, and 104. The hold that is still open is Kessa Calder (`character-10`), captured at Crown Harbor on tick 1133. The mandatory release is 84 ticks later, tick 1217, which this run does not reach.

`assessSupplyContract` accepts or refuses an offer already on the world. It draws nothing. Hard gates refuse a carrier at sea, a voyage that misses the deadline, and a purse that cannot buy the shortfall. Past the gates the score uses commerce, margin, trust, respect, grievance, obligation, and caution, and the line is `0.54 + ambition * 0.08`. `resolveOfferedContracts` emits `contract-accepted` or `contract-refused`. Fulfilment pays the carrier from escrow. At `world.tick >= deadlineTick` the contract is `contract-breached`, the escrow returns to the sources it was drawn from, and both sides take the defeat relationship deltas. A headless run queued no offer, so those events are 0 on every seed.

A supply offer would have shelves to aim at. States where `stocks.provisions <= 0`:

| Port | 1847 | 2718 | 4096 |
| --- | --- | --- | --- |
| Crown Harbor | 630, first 101 | 630, first 58 | 747, first 74 |
| Glassport | 560, first 97 | 395, first 258 | 568, first 91 |
| Cinder Key | 822, first 143 | 963, first 43 | 831, first 118 |
| Verdant Cay | 0 | 0 | 0 |

The first empty state on 2718 is tick 43, inside the fixture. The first empty state on 1847 is tick 97 and on 4096 is tick 74, both after it. No proposer turned those states into offers.

A pact is not in the code. The word `alliance` is a conversation tag. [Alliances](alliances.md) already counted a third faction as the reason two holders would accept, and this tape does not found one. Faction count stays at most 2 on all 1201 states. Tick 1200 still has World Government and Free Tide.

A tribute is not in the code. `tax-rate-set` is the holder's own rate, 38, 29, and 37 steps, not a deal with the other faction. The shape this note counts as a tribute opportunity is a state where one faction is short and the other is not, and at least two factions hold a port. Short is the tax test: free mates exist, and the treasury cannot pay each of them one day of passage (`ticksPerDay * 3`, which is 18). Those states are 761, 563, and 786. The first are ticks 113, 377, and 109. All three sit after the fixture. Nothing accepts or declines them.

Surrender is a one-sided offer the claim already takes. Port-ticks with `surrender` set are 348, 184, and 22. Claims take 32, 24, and 22 of them. Declines are 0, because `decline-surrender` is a player command and these runs send none.

## 2. What each side knows

The news ledger in [news](news.md) is the foreign picture. A public item keeps `type`, `observedTick`, `factionId`, and `taxRate` on a tax item. It does not keep garrison, stability, stocks, prices, loyalty, cargo, purse, or treasury. A ship copies the ledger of the port it leaves and posts, on arrival, each item the destination does not yet hold, with the same `observedTick`.

A holder ashore reads the ledger of the port they are standing in. A holder at sea reads the bag they copied when they cast off. Their own purse and their own faction treasury stay live: they are holding them. The other side's treasury, the other side's remote stability, and anyone's motives are not on the item, so a deal does not read them live.

A prisoner and a captor are in the same port. The capture item does not carry the purse. The deadline formula reads the live purse because the prisoner is there. A faction mate who only has the ledger sees that a capture happened, and at which faction, and does not see the coins.

## 3. The hook

The shape is the one [small agents](../research/small-agents.md) already uses for `decision-made`.

The scorer builds a legal shortlist and does not draw. `candidates[0]` is the pick when the model flag is off, when the model throws, or when the model names a row that is not on the list. A legal pick is the row passed to the reducer. The event stores `shortlist` and `chosen`. `applyEvent` writes the absolutes on the event and does not call the model, the scorer, or the tick rng. Recovery replays the event. A choice that only changes `data` the reducer ignores leaves `stateHash` where it is. A choice that changes coins, escrow, or a stored offer moves the hash from that tick on.

`stateHash` is sha256 of the canonical world. The event log is counted, not hashed. `applyEvent` throws on an unknown type, so a new offer type has to be a case in the reducer. The tick rng is the wrong stream. One discarded draw on it moves the first decision of tick 0.

## 4. Rounds, deadlines, and a broken offer

One offer id, at most three rounds. Round 1 is the offer. Round 2 is the counter, and only a counter. Round 3 accepts or breaks. A fourth round is refused before a score. No draw. The same id is not opened twice while it is still `offered` or `accepted`.

| Kind | Who may open it | Deadline | What a break does |
| --- | --- | --- | --- |
| Ransom | The captor, at capture | `mandatoryReleaseTick`, 84 ticks after the capture | The deadline still runs today's formula. Coins are `min(purse, demand)`. The debt is the rest. No new relationship write. |
| Contract | The buyer, the existing `offer-contract` | `deadlineTick`, a duration from 1 to 720 | `contract-breached`. Escrow returns to treasury and purse by source. Both sides take the defeat deltas. |
| Pact | A free command holder | None. It stands until a break. | The break in [alliances](alliances.md): the holder, a raid across the pact, or a shared enemy with no port. |
| Tribute | The free holder of a short faction | 24 ticks, the tax clock | No coins move. An existing relationship adds 0.04 grievance and subtracts 0.04 trust. A missing relationship is not created. |

The ransom shortlist is `pay`, `counter`, and `refuse`, dropping any row the purse cannot perform. `pay` is `min(purse, demand)`. `counter` is that same purse figure when it is below the demand, offered as a lower price the captor must accept on round 3. `refuse` pays nothing at the reply and leaves the deadline in place. `candidates[0]` is `pay`. That is the coins already on the release. A counter the captor accepts, or a refuse that also stopped the deadline, was not run.

The contract shortlist is the gate result. A hard gate or a score under the line leaves only `refuse`. A score on or over the line puts `accept` first and `refuse` second, so `candidates[0]` accepts. That is today's `assessSupplyContract`. An autonomous counter-offer was not run. The player amendment path, `contract-amended`, already restates an offer that is still `offered`.

The pact shortlist is `accept` and `refuse`. `candidates[0]` is `refuse` unless a third faction holds a port on the ledger the holder can read, and one of the alliance conditions holds for a fact that ledger carries: a raid by that faction, or a port of theirs within 23.345 of a port this faction holds. Own treasury under 216 or 144 stays a live read. The other faction's treasury does not. Both sides must accept. One acceptance stores nothing. On this tape the third faction is absent, so the shortlist's first row is `refuse` and nothing is stored.

The tribute shortlist is `ask`, `accept`, and `refuse`. The ask is the cent gap `mates * 18 - treasury`, capped at the payer's live treasury, which the payer knows because it is theirs. The payer's `candidates[0]` is `refuse`. Asking is legal. Paying is legal only when the payer's treasury covers the ask. The writer is off in the default below.

Event body, one shape for every kind:

```json
{
  "type": "offer-made",
  "actorId": "character-14",
  "targetId": "character-01",
  "data": {
    "offerId": "offer-000001",
    "kind": "ransom",
    "round": 1,
    "deadlineTick": 203,
    "terms": { "amount": 47.24 },
    "shortlist": ["pay", "counter", "refuse"],
    "chosen": "pay"
  }
}
```

`offer-countered` is round 2. `offer-accepted` and `offer-broken` close it. The reducer stores the offer on the world only while it is open, and omits the key when the list is empty, so a world with no open offer hashes as it does now. The coins, the escrow, and the relationship absolutes are fields on the closing event, the same way `captivity-released` already carries `terms` and `ransom`.

## 5. Determinism

A headless run with the model flag off follows `candidates[0]` and draws nothing for the choice. Replay of the log through `applyEvent` does not rebuild the shortlist. Two runs with the same seed and no commands stay on one hash for as long as `candidates[0]` is the row the current release, contract, and tax code already produce and the offer record stays omitted while empty.

The model flag is off in the golden test. A provider that picks a different legal row moves the hash at the first disagreement. The first capture inside the fixture is tick 20 on 4096, Dax Pike (`character-20`) at Crown Harbor. Seeds 1847 and 2718 have no capture before tick 119.

## 6. Slice plan

The slices are in the order they would land. A slice that does not write keeps the hash of the world it is read from. Hashes below are from this tip. A slice marked not run was not given a second world.

| Slice | What lands | Hash on these three seeds |
| --- | --- | --- |
| 1 | A readout. Captures, releases, empty shelves, the tribute shape, faction count. Not written. | Neutral. The baseline table at the top. |
| 2 | `offer-made`, `offer-countered`, `offer-accepted`, and `offer-broken` through `applyEvent`. No autonomous caller. A headless run queues no command. | Neutral. Not compiled. This tape has none of those types. The baseline hashes stand. |
| 3 | The ransom reply. `candidates[0]` is `pay`, the coins the release already writes. The offer key is omitted once the deadline closes. | Not run as a second world. Those coins are the table in section 1. A reducer that writes them and omits a new key keeps the baseline. A key stored at capture was not measured. The first capture is tick 119, 119, and 20, so that key would enter the fixture only on 4096. |
| 4 | Contract rounds on an offer that already exists. The carrier's shortlist is section 4. | Neutral on this tape. Offers, acceptances, and refusals are 0. The baseline hashes stand. |
| 5 | An autonomous buyer offers when a shelf is empty. | Not run. The first empty states are tick 97, 43, and 74. Seed 2718 is inside the fixture, so a writer there moves tick 72. No hash was produced. |
| 6 | The pact shortlist. Both holders must accept. A third faction has to be on the ledger. | Neutral. No state has more than two factions, and `secession-declared` is 0, so the writer stores nothing. The baseline hashes stand. |
| 7 | `offer-made` for a tribute, no autonomous caller. | Neutral, for the same reason as slice 2. The baseline hashes stand. |
| 8 | The autonomous tribute on the shape in section 1. | Not run. The shape is open on 761, 563, and 786 states, first at 113, 377, and 109. Those states are after tick 72, so the fixture would stay and tick 1200 would move. That hash was not measured. |

## 7. Questions for the Lead

The Lead rules on these against [game vision](game-vision.md). Defaults are what this brief would build.

1. **Which deals use the offer events?** Default: ransom, contract, pact, and tribute. Standing orders stay on `standing-order-accepted` and `standing-order-refused`. Those are 14/6, 14/6, and 16/4, all at event tick 0. Claims stay `settlement-claimed`. Declared surrenders are not declined on this tape.

2. **How many rounds?** Default: three. Offer, one counter, then accept or break. A fourth round is refused. The scorer draws nothing.

3. **What is the deadline?** Default: a ransom closes at `mandatoryReleaseTick`, 84 ticks after capture. A contract keeps the command bound, 1 to 720 ticks. A pact has no deadline. A tribute closes after 24 ticks.

4. **What may a side know?** Default: the news ledger that has reached the port they stand in, or the bag they carry at sea. Own purse and own treasury stay live. The other treasury, remote stability, garrison, and motives stay off the item and are not read live. A capture on the ledger names the faction and does not name the purse.

5. **Who picks the row?** Default: the scorer builds the legal shortlist, the model or `candidates[0]` picks, and the choice is stored on the offer event. `applyEvent` replays that row and does not call the model. The golden test leaves the model off. The tick rng is the wrong stream.

6. **What does a ransom `candidates[0]` pay?** Default: `min(purse, demand)`, the coins already on the release. Paid in full is 8, 7, and 3. Partial is 7, 6, and 5. Paid nothing is 1, 0, and 1. Still held at tick 1200 is 0, 1, and 0. `leaderShare` is 0 on every release. A counter the captor accepts was not run.

7. **What happens when an offer is broken?** Default: a ransom deadline still collects today's coins and today's debt, and writes no new relationship. A contract breach returns the escrow by source and writes the defeat deltas. A pact breaks by the alliances rule. A tribute moves no coins. An existing relationship adds 0.04 grievance and subtracts 0.04 trust. That tribute delta was not run. A missing relationship is not created.

8. **Does anyone offer a contract unprompted?** Default: no. Empty-shelf states are the table in section 1. The first are ticks 97, 43, and 74. Seed 2718 would move the fixture. The player command stays the only opener. Accepted and refused contracts on this tape are 0.

9. **Does anyone offer a pact or a tribute unprompted?** Default: no. A pact needs a third faction on the ledger, and this tape never has one, so slice 6 keeps the baseline. The tribute shape is open on 761, 563, and 786 states, first at 113, 377, and 109. Slice 8 was not run. Turning it on would leave tick 72 and move tick 1200.
