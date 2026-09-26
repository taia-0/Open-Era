# Playtest: a voyage that pays for itself

## Session

- **Candidate commit:** `4ff6512` (the trade verbs and the two fill/refusal fixes). Two docs-only commits, `d653916` and `c7045e3`, followed and leave the served code identical.
- **Date:** 2026-09-25 UTC
- **Operator:** Cursor general-purpose agent acting as an adaptive player, deliberately given no repository knowledge. It was forbidden from reading any repository file, opening any database, or inspecting source, and it ran no `git` command. It was told the world was on one named port and that other ports on the machine ran older builds it must not touch, and it was required to prove which build it had reached before playing.
- **Interface:** HTTP JSON API only, on `127.0.0.1:4410`, seed `1847`, `--reset`
- **Starting tick:** `0`
- **Ending tick:** `13` (day 2.2)
- **Player character:** Mara Vane (`character-01`), World Government, at Crown Harbor

## Hypothesis and ambition

**Milestone hypothesis:** A voyage can pay for itself. A commander can name a good and a quantity, see the price before paying it, buy where a resource is cheap, carry it, and sell it where it is dear, ending with more money than they started with — using only the public command surface, and without the voyage depending on pacing changes that would alter the simulation.

**Player ambition:** Buy a resource cheap, sail it to where it is dear, sell it, and finish strictly richer, with the arithmetic recorded so it can be checked afterwards. `work` and `recruit` were forbidden so the voyage had to stand on its own.

**Success signal:** A completed round trip whose ending money exceeds its starting money, with every transaction recorded at the price it was echoed at.

## Adaptive decision log

| Tick | Player-visible observation | Reasoning | Action | Outcome |
| ---: | --- | --- | --- | --- |
| 0 | At Crown Harbor: money 108, hold 48/74, arms 3.25 with stock 155 against target 90, `maxBuy(arms) 26`. Glassport (own faction, `exact`) arms 6.63, 4 ticks away. Cinder Key rumor arms 4.60, Verdant Cay rumor arms 11.89 | The widest spread backed by a record the commander owns is arms, Crown Harbor → Glassport. Crown Harbor produces arms and is glutted; Glassport is short. The rumour boards advertise better numbers but at confidence 0.18–0.35 | `buy-resource` arms 26 | Accepted at 3.25. Money 108 → 23.50 |
| 1 | Medicine is dearer here (6.16) than at Glassport (4.07) | Liquidate the medicine already in the hold before sailing | `sell-resource` medicine 4 | Accepted at 6.16. Gross 24.64, tax 3.45, net 21.19. Money → 44.69 |
| 2 | 5 units of hold left; arms margin per unit of hold beats provisions and ship materials | Fill the hold with the best good per unit of space | `buy-resource` arms 5 | Accepted at 4.01. Money → 24.64. Hold free 0.728 |
| 3 | Glassport 4 ticks away; destination `taxRate` unknown, `market` is `null` remotely | Sail | `travel` glassport | Arrived tick 7; provisions fell 2.304 (4 × 0.576 demand) |
| 7 | Glassport actual arms **6.06**, against the 6.63 the panel showed at tick 0. `taxRate` now visible: 14% | The direction survived even though the magnitude did not. Sell the whole holding | `sell-resource` arms 34 | Accepted at 6.06. Gross 206.04, tax 28.85, net 177.19. Money → 201.83 |
| 7–8 | Every return leg has the wrong direction: medicine net margin +0.34/unit but decaying ~0.1/tick, so it crosses zero inside a 4-tick sail; ship materials and provisions are cheaper at home than here | Decline the return cargo | — | The counterfactual was checked later: at tick 13 the medicine margin was **−0.08/unit**. Declining was correct |
| 8 | Last freight is worth more here (4.52) than at home (3.05) | Sell it so the ledger settles | `sell-resource` shipMaterials 5 | Accepted at 4.52. Gross 22.60, tax 3.16, net 19.44. Money → **221.27**. Cargo empty |
| 9 | Voyage complete. Provoked five refusals on purpose | Test that each refusal names the limit that bound it | five malformed or over-sized requests | All refused with distinct codes: `hold-full`, `invalid-quantity`, `insufficient-cargo`, `party-reserve`, `invalid-resource` |
| 9–13 | It had queued a real travel command while probing | Elapsed ticks cost the same provisions whether sailing or standing, and money cannot move without a trade, so resolving it makes the voyage a literal round trip at no money cost | `advance` 4 | Back at Crown Harbor, tick 13, money unchanged at 221.27 |

## Outcome

Mara Vane filled her hold with arms at Crown Harbor, where the island produces arms and is glutted against its own target stock, and carried them to Glassport, which is short of them and belongs to her own faction. She sold the hold there and finished with 221.27 money against the 108 she started with.

Direction was readable before sailing from production focus and stock against target, and the trade paid. Magnitude was not: the panel quoted 6.63 for Glassport arms at tick 0 and the island paid 6.06 on arrival, an 8.6% miss over a four-tick voyage, and the two rumour boards advertised *better* numbers at confidence 0.18–0.35, so a greedy player would have been drawn toward prices nobody could verify. The commander's protection was choosing the widest spread in the cheapest-to-verify direction and sizing so that being badly wrong still paid.

The return leg is where the economy stopped behaving like a merchant's world. Nothing was worth carrying home: the only positive direction was thin and decaying, and it inverted within five ticks. A rational merchant never sails home, which is why the return trip is roleplay in this record rather than a second trade.

## Evidence review

- **World report:** The recovered world reached tick 13 (day 2.2) with 29 autonomous characters and 1 human-controlled character, 1,527 persisted events across 4 snapshots, 83 journeys, 58 market trades, 0 completed battles and 3 successful retreats. 7 player commands were accepted and 7 resolved, with 0 failures. Report and map at `simulation-output/playtests/trade-voyage-001/`.
- **Ledger, independently reconstructed from the recorded events rather than from the player's own log.** All five of the commander's trades resolve to the cent, and every total is quantity times unit price:

  | Tick | Direction | Resource | Qty | Unit | Gross | Tax | Money |
  | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: |
  | 0 | bought | arms | 26 | 3.25 | 84.50 | 0 | 23.50 |
  | 1 | sold | medicine | 4 | 6.16 | 24.64 | 3.45 | 44.69 |
  | 2 | bought | arms | 5 | 4.01 | 20.05 | 0 | 24.64 |
  | 7 | sold | arms | 34 | 6.06 | 206.04 | 28.85 | 201.83 |
  | 8 | sold | shipMaterials | 5 | 4.52 | 22.60 | 3.16 | 221.27 |

  Net: 108 → **221.27**, i.e. **+113.27** over 13 ticks (8 sailing, 5 standing), or **+8.71/tick elapsed**. Every sale paid exactly 14% of gross in tax. No `work`, no `recruit`, no `rest`.
- **Metrics:** World Government finished at 2,356.59 power, 18,100.47 treasury and 2 settlements; Free Tide Compact at 1,065.35 power and 1 settlement. 7 relationship changes and 50 plan reviews were recorded.
- **Map:** Generated from the recovered world; the commander's route is legible between Crown Harbor and Glassport.
- **Decision and agency traces:** 87 direct knowledge updates and 50 explicit plan reviews; 24 plan-time order assessments with 14 accepted and 6 refused; 9 order deviations, resumptions and completion reports, all matched.
- **Conversation traces:** No player messages were sent, so this session does not exercise reply timing.
- **Recovery and determinism:** Recovering the world at tick 13 replayed to state hash `2923ca0495e24259a0bfbd3a20123a81891e4357808b8c8112c2d871614ba08f`, matching the live world and the generated report. It differs from the headless gate hash because 7 player commands legitimately changed history.

## Findings

### What worked

- **The quoted price is the charged price.** Every trade the playtest made reconciled to the cent, in both directions, including the sale tax. This is the property the `tradeQuote`/`tradeAmounts` split was built for, and a session that could not read the source verified it from the outside.
- **Every refusal named the limit that actually bound.** Five deliberate failures produced five distinct codes with the ceiling quoted, and none of them part-filled.
- **The provisions reserve is exact.** At the reserve, `maxSell(provisions)` was 0, so a commander cannot sell the food the party needs. The playtest specifically tried.
- **A market is quoted only where the commander is standing.** `market` was `null` at every settlement the commander was not in, while prices remained visible as estimates. The actionable part was correctly local.
- **Direction was legible before committing.** Production focus plus stock against target told the player which way a good should travel without any price knowledge.

### Implementation defects

- **The `market` block carries the player's own figures and is read as the market's.** `GET /api/state` → `settlements[].market` contains `money`, `load`, `free` and `capacity`, and every one of them is the *commander's* purse and hold, not the settlement's. At tick 0 `market.money` read 108 — the player's own money — and after buying it read 23.5. A player reasonably reads `market.money` as the counterparty's cash and concludes there is a credit limit that does not exist. The block also sits under `settlementId`, which reinforces the misreading. Not yet fixed; it is pure projection and can be renamed without touching simulation behavior.
- **A player order has no depth limit while an autonomous order has one.** `resolveTrade` caps an autonomous purchase at `settlement.stocks[resource] * 0.16`, a stock proxy for how much a market can absorb. The player path has no equivalent, so a commander can move `min(stock, hold, money)` — here **34 units against 83 of stock, +41%**, and it filled entirely at the pre-trade 6.06 with the price only collapsing to 4.05 afterwards. The design record says the two paths are deliberately not required to agree, but this is an asymmetry in the player's favour, and it is the single mechanic that made the voyage pay as well as it did. Fixing it is a balance decision, not a defect fix, so it belongs to the deferred economy milestone.
- **The trade body fields are undocumented in `capabilities.requests`.** The published `commands.body` lists `playerId`, `type`, `action`, `targetId`, `characterId`, `directive`, `priority`, `expiresInTicks`, `orderId` and `battleId` — but not `resource` or `quantity`, which `buy-resource` and `sell-resource` both require. The `actions[]` entry states the preconditions without naming the fields. The player had to guess both names. Not yet fixed.
- **`observedTick` leaks negative values to the player.** `characters[].knowledge[].observedTick` read `-11` for Verdant Cay at tick 0. Reports seeded before the world began are described as observed on a tick that does not exist. The defect sweep fixed this for briefing item ids but not for this raw field.
- **`eventFeed` is a metadata envelope that contains no events.** `eventFeed` carries `count`, `cursor`, `hasMore`, `limit`, `total`, `oldestSequence` and `newestSequence`, while the events themselves live under a sibling `events` key. A client that pages `eventFeed` for new events gets nothing. Ergonomic rather than incorrect, but the name invites the wrong call.

**Two claims in the player's own report were checked and do not hold.** The reported "money-limit refusal cannot be elicited" is a misreading: the request needed 814 money against 221 held, but the hold's free space was 43.184, which is *smaller* than the ~54 units the purse allowed, so `hold-full` was the correct limit to name and the smallest-ceiling rule was working. The reported "distant intel is stale but labelled exact" is also not a staleness defect: for a settlement of the commander's own faction the panel shows the *current* price, and the 6.63 → 6.06 move is the economy drifting, not a stale record. The real finding behind it is listed below.

### Design risks and opportunities

- **An `exact` price is only good for one tick, and nothing says so.** Prices drift every tick in this world, and a voyage takes four, so a number the panel correctly labels `exact` and `confidence: 1` is materially wrong by the time the commander arrives. Describing *knowledge* as exact is honest; presenting a price without an expiry is not. This is the single largest source of unpriceable risk the player reported.
- **The destination's tax is invisible until arrival.** `taxRate` lives under `market`, which is `null` remotely, so the player must compare gross spreads while the largest single deduction — 35.46 of 253.28 gross here — is hidden. Remote `taxRate` is public knowledge in a way a remote *price* is not, and it is the natural candidate for a fix that does not leak the market.
- **Travel is nearly free, so every positive spread is worth chasing.** Provisions are consumed at 0.576/tick whether the party sails or stands, and money only moves on trades. A voyage therefore costs elapsed time and about 0.5 money/tick of food, which removes the "is this trip worth it" decision entirely.
- **The road is one-way, so a rational merchant never sails home.** No good flowed homeward profitably in this world, and the one candidate inverted within five ticks. A round trip is currently roleplay; there is no design reason to complete one. If trade is meant to be a loop, something must make the return leg worth sailing.
- **Dumping a whole market at the pre-trade price is dominant.** With no depth limit, "buy 100% of the hold in the widest-margin good and sell it all at once" strictly beats staging, diversifying or holding back, and the cost lands on the next trader rather than the dumper.
- **Rumour and fact share one table shape.** A confidence 0.18 rumour and an owned board render identically in the JSON `prices` array. The dashboard prefixes estimates with `~` and labels the section, which the JSON does not, so a client reading the API alone is invited to treat a rumour as a quote.
- **`work` cannot be compared against a voyage from player-visible data.** No work yield is published and no other character's money is visible, so the player could not compute the counterfactual the milestone's own open question is about. The pacing comparison has to be made from simulation output, not by a player.

### Follow-up experiments

- Give a price an expiry or an age, then repeat this voyage and ask the player whether they could price the risk of being wrong.
- Publish a destination's `taxRate` remotely and re-run, to test whether net margins become computable before committing.
- Add a depth limit to the player path matching the autonomous `* 0.16` stock cap, then re-measure voyage solvency. Expect it to fall, which is the point.
- Make one resource flow homeward profitably at the world level, then test whether a rational player chooses to complete a loop rather than strand themselves abroad.

## Recommendation

`PROMOTE` for this branch's hypothesis, on the playtest as run.

The hypothesis was that a voyage can pay for itself without forcing pacing changes, and the session proved it: **+113.27 on 108 starting money**, with the arms leg alone clearing +72.64 before food, every transaction reconciled to the cent by an outside observer, and no `work`, `recruit` or rest used to fund it. The success condition was solvency, and solvency held.

The defects found do not touch that hypothesis. One is an asymmetry in the player's favour that made the voyage *more* profitable than a depth-limited trade would be, so it cannot rescue a failing result; the rest are projection naming, documentation and ergonomics, and none of them is a simulation transition — the three golden hashes are byte-identical. The findings that matter are about what trade is *for*: a price with no expiry, a hidden tax, free travel, and a one-way road are all economy-design questions, and they are the next milestone rather than a reason to revise this one.

Promotion is for this branch's hypothesis only, and the record above exists now, so the branch is no longer blocked on it. Assembling a `promotion/main-vN` candidate requires the owner's explicit approval of that exact commit per the pipeline.
