# Port transfer v1: purchase of a neutral port

Status: Build-ready spec (Researcher, 2026-11-01). It is option 2 of [next after the layers](next-after-layers.md) (#178), and it follows the Verdant Cay diagnosis in [alliances §9](alliances.md).
- **Flag:** `PORT_TRANSFER`, default off.
- **Determinism:** no RNG and no AI.
- **Prototype:** [port-transfer-proto/prototype.patch](port-transfer-proto/prototype.patch), applied to `main` `6feb930`, with its sweep and the measurement script. It ran offline on 13 seeds (1847, 2718, 4096, 1000, 2000, …, 10000) × 1,200 ticks with the main defaults: EXILE_RECOVERY on, OCCUPATION off, ALLIANCES off. ALLIANCES and OCCUPATION are both off by default on main. Spend: $0.

## 1. Route chosen: purchase

**Why something is needed.** No autonomous character can raid or claim a neutral port. The raid and claim rows require `hostileTerritory`, which needs `factionId !== null` (alliances §9). As a result, Verdant Cay had 0 battles and 0 claims on 13 / 13 seeds.

There were three candidate routes.

| Route | Design record | Verdict |
|---|---|---|
| **Purchase** | `world-simulation.md:85` lists "purchasing it" among the legal ways to own a settlement. `roadmap.md:26` says "only conquest plus claim exists" (Untracked) | **Chosen.** It is a listed legal route that has not been built. It is paid from a treasury, which is a material condition (`game-vision.md:39`) |
| Negotiated transfer | `world-simulation.md:85`; `roadmap.md:28` is Tracked deferred; full negotiation is a later milestone (`world-simulation.md:169`) | Deferred. It needs two parties and negotiation, and a neutral port has no owner to negotiate with |
| Neutral-raid rule | Not listed as a route. Conquest is already the route to *faction* ports | Not chosen. It adds conquest of a port with no faction to resist, and it changes the raid gate for everyone |

A neutral port has no seller, so the price is paid to its garrison for their service.

## 2. Conditions, price and cause

**When.** On the 24-tick faction clock (`t > 0`, `t % 24 === 0`), after secessions and alliances, ports in id order.

**Eligible port.** `factionId === null`, and no battle active there.

**Agent.** The first character by id who is docked at the port and is:
- alive, free (no captivity) and not travelling;
- a member of a faction F.

**Price** = **12 × garrison**.
- 12 is the recruit cost per soldier (`engine.ts` recruit: `cost = quantity * 12`), so the buyer pays to take the garrison into service.
- The measured garrison at Verdant Cay is p10 75, median 92, p90 103, max 103 (13 seeds, 650 clock ticks, flag off). That puts the price at 900 – 1,236 over a run. At the first clock it is 840 (garrison 70).

**Reserve** = **18 × (F's free mates + ports F holds)**. This is the governor stipend's own solvency rule (`governor.ts` `payGovernorStipends`: 18 for every free mate and every seat).

**Payer.** F's treasury, which must satisfy treasury ≥ price + reserve.

| Treasury at the clock (flag off) | p10 | Median | p90 |
|---|---|---|---|
| World Government | 11,527 | 15,581 | 17,991 |
| Free Tide | 1.11 | 57.77 | 811 |
| Breakaways | 0 | 224 | 875 |

Only World Government routinely covers the price. Free Tide and the breakaways cover it in their top tail at most.

**Cause** (the first that holds; none means no purchase):
1. **`adjacent`:** F holds a port within 30 of this port. The 30 is the adjacency from alliances §2: the measured distances fall into two groups, 23.35 – 25.81 and 43.83 – 55.08. Glassport is 25.807 from Verdant Cay.
2. **`landless`:** F holds no port.

On the flag-off runs, Glassport's holder at the clock was World Government 257, Free Tide 260 and breakaways 133 of 650 clocks.

**Effect.** The port's `factionId` becomes F, `ownerId` becomes the agent, and `surrender` is cleared. F's treasury falls by the price. The garrison, stability, population and stocks are unchanged. From then on the port is an ordinary faction port: raidable, claimable, and able to secede.

## 3. State and events

**State.** No new field. The event writes existing ones: `Settlement.factionId`, `Settlement.ownerId`, `Settlement.surrender`, `Faction.treasury`.

**Event** `settlement-purchased` (flag on only):

```json
{ "type": "settlement-purchased", "actorId": "<agent>", "settlementId": "verdant-cay", "targetId": "<F>",
  "data": { "factionId": "<F>", "ownerId": "<agent>", "payerFactionId": "<F>", "price": 840,
            "priceBasis": { "garrison": 70, "perSoldier": 12 }, "reserve": 216,
            "treasuryBefore": 0, "treasuryAfter": 0, "cause": "adjacent: … holds glassport at 25.807",
            "stability": 0, "population": 0 } }
```

The figures above illustrate the shape; the real values are on the tape. `applyEvent` writes the fields, so replay rebuilds the purchase.

**Run option** `portTransfer: true`, with `PORT_TRANSFER_DEFAULT = false`.

**Follow-up for the Engineer.** `dynamismReadout` should count a purchase as a port ownership change. In the prototype it does not, so the port-change figures below exclude the 13 purchases.

## 4. Acceptance

**Gated properties**, checked on every `settlement-purchased`:
1. The port was neutral before the tick.
2. The event is on a clock tick.
3. The payer faction exists.
4. price = 12 × the garrison recorded on the event, and price > 0.
5. treasuryBefore ≥ price + reserve, and treasuryAfter = treasuryBefore − price.
6. The cause is recorded.
7. The agent is a member of the buyer.

There is no purchase when these conditions don't hold: the writer emits only when cause and cover both hold.

**Gated liveness**
- Claims > 0 and port changes > 0 on every seed.
- No new wipeouts.
- Secessions on at least 6 / 13 seeds.

**Pins.** Flag off is byte-identical: 72 ticks `7f76e474` / `976c40bd` / `08943ea5`, and 1,200 ticks `94de9c02` / `7a3741c9` / `af6eeaea`.

**Report only:** transfer frequency, Verdant Cay ownership by seed, and claims, port changes and secessions with the flag off vs on.

## 5. Prototype results (13 seeds × 1,200 ticks)

| Seed | Off hash | Purchases (tick) | Buyer, price | VC owned ticks (on) | VC owner at t1200 | VC battles / claims (on) | Claims off → on | Port changes off → on | Secessions off → on |
|---|---|---|---|---|---|---|---|---|---|
| 1847 | `94de9c02` pin | 1 (t24) | World Government, 840 | 1,176 | World Government | 3 / 7 | 51 → 55 | 52 → 56 | 1 → 1 |
| 2718 | `7a3741c9` pin | 1 (t24) | World Government, 840 | 1,176 | a Crown Harbor breakaway | 0 / 6 | 64 → 34 | 64 → 38 | 0 → 4 |
| 4096 | `af6eeaea` pin | 1 (t24) | World Government, 840 | 1,176 | a Crown Harbor breakaway | 4 / 6 | 56 → 63 | 59 → 67 | 3 → 4 |
| 1000 | `5f303e45` | 1 (t24) | World Government, 840 | 1,176 | World Government | 2 / 6 | 42 → 55 | 44 → 55 | 2 → 0 |
| 2000 | `3dec6c14` | 1 (t24) | World Government, 840 | 1,176 | World Government | 1 / 4 | 50 → 40 | 52 → 40 | 2 → 0 |
| 3000 | `945a5b23` | 1 (t24) | World Government, 840 | 1,176 | World Government | 2 / 2 | 42 → 26 | 44 → 29 | 2 → 3 |
| 4000 | `05583438` | 1 (t24) | World Government, 840 | 1,176 | World Government | 7 / 8 | 63 → 66 | 64 → 67 | 1 → 1 |
| 5000 | `ad712dfa` | 1 (t24) | World Government, 840 | 1,176 | World Government | 1 / 6 | 55 → 47 | 57 → 51 | 2 → 4 |
| 6000 | `020028d7` | 1 (t24) | World Government, 840 | 1,176 | a Crown Harbor breakaway | 3 / 8 | 50 → 62 | 55 → 68 | 5 → 6 |
| 7000 | `9638fa13` | 1 (t24) | World Government, 840 | 1,176 | World Government | 2 / 4 | 61 → 58 | 65 → 58 | 4 → 0 |
| 8000 | `6e74df8b` | 1 (t24) | World Government, 840 | 1,176 | World Government | 4 / 6 | 62 → 24 | 66 → 24 | 4 → 0 |
| 9000 | `450acb6b` | 1 (t48) | World Government, 852 | 1,152 | a Glassport breakaway | 6 / 6 | 58 → 52 | 60 → 57 | 2 → 5 |
| 10000 | `a1567d5f` | 1 (t24) | World Government, 840 | 1,176 | a Crown Harbor breakaway | 3 / 6 | 28 → 59 | 31 → 64 | 3 → 5 |
| **Total** | | **13** | all World Government | | WG 8, breakaways 5 | **38 / 75** | **682 → 641** | **713 → 674** | **31 → 33** |

Flag off also reproduces the 72-tick pins with the patch applied.

| Check | Result | Pass |
|---|---|---|
| Flag off = pins (72 and 1,200 ticks) | match on 1847 / 2718 / 4096 | yes |
| Purchase properties 1–7 | 13 / 13 valid, 0 violations; every cause is `adjacent` | yes |
| Claims and port changes > 0 on every seed | minimum 24 and 24 (8000) | yes |
| No new wipeouts | none | yes |
| Secessions on at least 6 / 13 | 9 / 13 | yes |

**Readings, report only**
- **One purchase per seed, almost at once.** World Government holds Glassport at the start, and Glassport is adjacent. Its treasury (p10 11,527) covers 840 many times over, so it buys at the first clock (t24) on 12 seeds and at t48 on 9000. After that, Verdant Cay is never neutral again, so there are no further purchases.
- **Verdant Cay enters the war.** It goes from 0 battles and 0 claims to 38 battles and 75 claims with the flag on. It changes hands, and 5 seeds end with it held by a breakaway.
- **The totals move both ways.** Seeds 8000, 2718 and 3000 fall a lot; 10000, 1000 and 6000 rise. That is a trajectory switch, not a target. Secessions are 31 → 33.

## 6. Open decisions for the Lead

1. Should the purchase be the faction's alone? A treasury-rich faction always wins the race, which is material, not tuned. The alternative is to wait for the treasury to clear a larger reserve.
2. A sale or transfer between factions (negotiated transfer), and a faction grant to a member. These are deferred; they need a seller's consent model.
3. Should the price also reflect stability or population? v1 uses garrison only. Population never changes (occupation.md §1), so it would add a constant.
4. Purchase news, and a player command `buy-settlement`. Both are deferred.
