# Negotiated port transfer and grant

**Status:** Open. This is a prototype spec for the Lead to accept, change or reject.
- **Author and date:** Researcher, 2026-11-27.
- **Base:** `main` `d3b5fa4`. `src` is unchanged since `e7ec840`, and every layer `*_DEFAULT` is still `false`, so all flags are passed explicitly.
- **Spend and runs:** offline, $0, no AI.
- **Prototype:** [negotiated-transfer/negotiated-transfer.patch](negotiated-transfer/negotiated-transfer.patch). It is not committed to `src`. It stacks on [protection-pact-fix/fix.patch](protection-pact-fix/fix.patch) and also applies cleanly on bare `main`.

This is option 2 of [after-lifecycle.md](after-lifecycle.md) §4: "negotiated transfer and faction grant between factions". It covers the route `world-simulation.md:85` lists beside conquest and purchase ("…or negotiated transfer"), and `roadmap.md:28` (Tracked, deferred). [port-transfer.md](port-transfer.md) §1 deferred it because "it needs two parties and negotiation, and a neutral port has no owner to negotiate with". This layer is for **held** ports, so there is always a seller.

## 1. Rule

### 1.1 Flag, clock and order

- **Flag:** `negotiatedTransfer` (`NEGOTIATED_TRANSFER_DEFAULT = false`), a `TickOptions` field. With the flag off nothing runs and `world.negotiatedTransfer` never exists, so flag-off worlds hash as before (§5). No CLI switch is added in the prototype.
- **When:** every tick, the step runs right after `portPurchases` (`engine.ts`, after secessions and alliance forms).
  - Each tick it opens the ledger if needed and updates the shortage watch.
  - Offers are made only on the purchase clock: `t > 0`, `t % 24 === 0` (`PURCHASE_CLOCK`).
  - Sellers are taken in faction-id order.
- **Determinism:** no RNG draw and no AI.

### 1.2 Who offers, and why

A **seller** is any faction that holds **at least 2 ports** at the clock. A faction never offers its last port, so no transfer can leave the seller portless. A seller whose command holder is human is skipped in a live session (`liveSession`, the same rule as the autonomous tax step); offers there would need a player command, which v1 does not have.

| Trigger | Condition (all must hold) | Port offered | Kind and price |
|---|---|---|---|
| **Cession under threat** | A hostile faction E raided port P while the seller held it, within the last **152** ticks (`THREAT_WINDOW`). P's garrison is **≤ 15** (`CESSION_GARRISON`). No battle is active at P. | Every such P, in id order | **Grant** (price 0) when the receiver is a pact partner (ally, or patron through a protection pact). Otherwise a **sale** at 12 × garrison |
| **Sale of a surplus port** | The seller's treasury has stayed below its reserve, 18 × (free mates + ports held), for **≥ 41** ticks (`SHORTAGE_SPELL`). No battle is active at P. | Its ports by garrison, highest first (the most cash), then id. Ports already listed for cession are not listed again | **Sale** at 12 × garrison, to any receiver, pact partners included |

- **Price** is port-transfer's: 12 × garrison (the recruit cost per soldier).
- **Reserve** is port-transfer's: 18 × (free mates + ports), the stipend solvency rule in `governor.ts`.
- Cessions are tried before sales.
- A seller makes **at most one transfer per clock tick**. It stops at the first accepted offer.

### 1.3 Receivers: who is offered, in what order

A receiver R must have a **free docked member at P**: alive, not captive, not travelling. That member is the agent who takes the port, the same agent rule as port-transfer ruling 2 (`freeDocked`). R must also meet all of the following:
- R is not the seller;
- R is not the faction that raided P within the window;
- R is a **pact partner** of the seller, or **adjacent**, meaning R holds a port within 30 of P (`ADJACENT`, the port-transfer and alliances adjacency);
- R has not already been party to a transfer this clock tick;
- R did not give P away by agreement within the last 152 ticks (the no-return cooldown, §1.6);
- R has not already declined this port from this seller in the current spell (§1.6).

The seller ranks receivers using only what it can see in its own port:
1. pact partners first;
2. then peace partners (secession aftermath);
3. then the rest;
4. within each group, by more docked troops at P;
5. then by faction id.

**This deliberately departs from the #182 surplus rule.** That rule ranks purchase buyers by treasury surplus. Since #192, a rival treasury is private (`withoutHiddenTreasury`), so the seller cannot rank by it. It would also mean an offer could never be declined. Open question 1 asks whether the Lead wants #182 here instead.

On a decline, the seller offers P to the next receiver in the same tick. When the list for P runs out, it moves to its next port.

### 1.4 The receiver's accept rule

R accepts if and only if its own treasury covers the price plus its reserve **with the new seat**:

`treasury ≥ price + 18 × (free mates + ports held + 1)`

The `+ 1` is the seat R takes on, which is the port-transfer `covers` test with one more port. A grant has price 0, but it still needs the reserve for the seat. Otherwise R declines with a recorded reason:
- `reserve`: the treasury is short even at price 0;
- `price`: the treasury covers the reserve but not price + reserve.

R reads only its own treasury. The seller learns only the reason, never R's figures.

### 1.5 Effect

On `settlement-transferred`:
- `factionId` becomes R and `ownerId` becomes the agent;
- `surrender` is cleared, and an occupation record is cleared if one exists (occupation stays off in every run here);
- the seller's treasury rises by the price and R's falls by the same amount;
- garrison, stability, population and stocks are unchanged;
- the port's raid-ledger entry and its declines are cleared.

**Governor seat.** Nothing in `governor.ts` changes. At the next morning sync, `syncSeats` sees `factionChanged` and vacates the seller's governor. R's holder then appoints from R's members docked at P, and R's agent is one of them. A breakaway receiver gets no seat (`syncSeats` skips `secession-*`, as today). Under the docked-governor amendment ([offices-docked-governor.md](offices-docked-governor.md)), the old governor simply loses the seat. Nothing is consulted, and the levy and stipend follow the seat as before.

### 1.6 Coexistence with purchase: precedence, mutual exclusion and cooldowns

- **Precedence.** `portPurchases` runs first on the same clock tick. It only touches neutral ports (`factionId === null`), and negotiation only touches held ports, so the two never compete for a port. A treasury spent on a purchase is already spent when the negotiation step's accept rule reads it.
- **Mutual exclusion within one tick:**
  - one ownership change per port per tick;
  - a faction is party to at most one transfer per clock tick, as seller or as receiver. This blocks receiving a port and then using it to give another away in the same tick, which happened in rev 0 on 9000;
  - a port with an active battle is not offered;
  - a port claimed earlier in the tick no longer belongs to the seller, so it cannot be offered.
- **Cooldowns:**
  - **No return within 152 ticks.** A port given by agreement is not offered back to the faction that gave it within `THREAT_WINDOW`. Rev 0 had no such rule and showed grant ping-pong between pact partners: 8000 exile-off passed Glassport back and forth 6 times between t504 and t720. The giver had just judged it could not hold P against a raid inside that same window.
  - **Declines are remembered for the spell that produced them.** The memory key is (port, seller, receiver, trigger, `since`):
    - for a cession, `since` is the raid's tick, so a new raid opens a new spell and a new offer;
    - for a sale, `since` is the start of the shortage spell, and the memory clears when the spell ends.
  - **No new constant.** The 24-tick clock is port-transfer's.

### 1.7 Interactions

| Layer | Interaction |
|---|---|
| **Alliances** | Pact partners are offered first, and a cession to a pact partner is a grant. A transfer cannot leave anyone portless (seller ≥ 2 ports; the receiver gains), so it cannot by itself create an `enemy-portless` or `ally-gone` break. Breaks run after the transfer in the same tick, plus the fix.patch second check after aftermath. The rev-2 break-condition property passes (§4). |
| **Protection pacts** | A patron is a pact partner, so a breakaway under threat grants to its patron, and a patron under threat grants to its protégé. Protection formation and join are unchanged. |
| **Secession aftermath (breakaways)** | A breakaway can sell or cede only once it holds ≥ 2 ports. It can receive like any faction. An aftermath record whose port changed hands is already skipped by the aftermath step (`port.factionId !== record.factionId`). Peace partners rank second. |
| **Lifecycle** | Seats are handled in §1.5. Retirement and return read `ports held` at the time, unchanged. The `character-retired.office` gap ruled for the Engineer is untouched. |
| **Occupation (off)** | A transfer is not a conquest. It clears any occupation record and does not start one. Untested here because occupation is off. |
| **Purchase** | §1.6. |

## 2. Thresholds and their sources

Every number is an existing rule or a measured percentile. No constant was tuned toward a target. The probe is [negotiated-transfer/probe.ts](negotiated-transfer/probe.ts), and the summaries are [raw/probe-off.summary.json](negotiated-transfer/raw/probe-off.summary.json) and [raw/probe-ATLS.summary.json](negotiated-transfer/raw/probe-ATLS.summary.json). Both runs are 13 seeds × 1,200 ticks, flag-free: main defaults, and ATLS + fix.

| Constant | Value | Source |
|---|---|---|
| `THREAT_WINDOW` | 152 | `ALLIANCE_RAID_WINDOW`: p90 of the gap between successive raids by one faction on another (alliances.md, 959 gaps, flag off). In the probe, a raided held port was lost within 152 ticks 540 / 720 times (ATLS) and 708 / 802 times (flag off). |
| `CESSION_GARRISON` | 15 | The surrender line, `world-simulation.md:97`: surrender is offered at garrison ≤ 15, and a port-holding raider needs garrison ≥ 15. Measured loss within 152 ticks of a raid: **garrison ≤ 15: 330 / 394 (ATLS), 511 / 519 (flag off). Garrison > 15: 210 / 326 (ATLS), 197 / 283 (flag off).** At or below the line a raided port is mostly lost. |
| `SHORTAGE_SPELL` | 41 | p90 of closed below-reserve spells of factions holding ≥ 2 ports, ATLS + fix: n 148, p50 5, p75 13, p90 41, max 113. Flag off gives p90 20 (n 129). All holders, ATLS: p90 54 (n 434). ATLS is the set this layer runs on. p90 matches the other "prolonged" cuts: lifecycle 215 and aftermath 67. |
| Price, reserve, adjacency, clock | 12 × garrison, 18 × (mates + ports), 30, 24 | port-transfer.md §2 (recruit cost, stipend rule, alliances adjacency, faction clock). |
| Seller ≥ 2 ports | — | Structural: no transfer can make the seller portless. Measured share of holder-clocks with ≥ 2 ports: 748 / 1,552 (ATLS) and 477 / 1,372 (flag off). |

Context from the same probe:
- held-port garrison at the clock is ≤ 15 in 2,019 / 2,534 samples (ATLS) and 1,633 / 1,899 (flag off);
- a holder is below reserve at 332 / 1,552 clocks (ATLS) and 292 / 1,372 (flag off).

## 3. Events, state and visibility

**State** (flag on only): `world.negotiatedTransfer`, which is replayed from events:
- `raids`: per port, the last raid against its holder (same raid test as `noteRaid`);
- `shortage`: faction → spell start;
- `declined`: the decline memory;
- `returned`: port → giver and tick.

| Event | Fields | Who reads the payload | Feed and news |
|---|---|---|---|
| `transfer-ledger-opened` | — | parties only (none) | bookkeeping, never in a feed |
| `transfer-watch` / `transfer-watch-cleared` | factionId, since | that faction | bookkeeping, never in a feed |
| `transfer-offered` | offerId, sellerFactionId, factionId, kind, trigger, since, price, priceBasis, cause, receiverStanding | **seller and receiver only** | the row is shown only to the two parties (`showInPlayerFeed`) |
| `transfer-declined` | offerId, sellerFactionId, factionId, trigger, since, reason | **seller and receiver only** | the two parties only |
| `settlement-transferred` | the offer terms, plus ownerId, previousOwnerId, payerFactionId, reserve | **seller and receiver only**. For anyone else `data` is null, and `stripPlayerEventData` also drops the terms as a second guard | **public:** in `PUBLIC_NEWS_TYPES`, so a `news-posted` follows at the port; in `OWNERSHIP_NEWS`, so `learnedHolder` updates; not a status reading (`countsAsPortStatus`); counted as a port change in `dynamism.ts` |

The public line is: "*Agent* took over *Port* for *Receiver* from *Seller* by agreement." It names no price, no kind and no terms. A party's line adds: "Terms: a sale for N (sale)" or "Terms: a grant (cession)". The news item has its usual fields only: id, type, observedTick, factionId (the new holder).

## 4. Results: 13 seeds × 1,200 ticks, ATLS + fix.patch, flags explicit

The set is `{occupation:false, alliances:true, portTransfer:true, lifecycle:true, secessionAftermath:true}`, plus `negotiatedTransfer` on or off and `exileRecovery:false` for the opt-out rows. All figures are report-only. Raw rows are in [raw/](negotiated-transfer/raw/), with per-seed tables in [summary.txt](negotiated-transfer/summary.txt).

| Set | Offers (cession / sale) | Accepts | Sales / grants | Declines (reason) | Price paid | Claims | Port changes | Battles | Captures | Secessions (seeds) | Peaces | Pacts (prot.) | Pact breaks | Purchases | Portless at end | Wipeouts | Lowest claims / port changes | Replay |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ATLS | 0 | 0 | 0 / 0 | 0 | 0 | 488 | 539 | 895 | 221 | 37 (11/13) | 24 | 59 (1) | 39 | 13 | 27 | none | 25 (8000) / 28 (1000) | 13/13 exact |
| **ATLS + NT** | 52 (20 / 32) | 43 | 32 / 11 | 9 (reserve 9) | 3,048 | 468 | 556 | 842 | 155 | 32 (11/13) | 21 | 58 (2) | 40 | 13 | 23 | none | 18 (3000) / 22 (3000) | 13/13 exact |
| ATLS exile off | 0 | 0 | 0 / 0 | 0 | 0 | 374 | 421 | 778 | 157 | 33 (11/13) | 24 | 50 (2) | 33 | 13 | 27 | none | 12 (1847) / 14 (1000) | 13/13 exact |
| **ATLS + NT exile off** | 80 (52 / 28) | 33 | 30 / 3 | 47 (reserve 47) | 3,864 | 377 | 459 | 800 | 159 | 34 (13/13) | 21 | 61 (2) | 41 | 14 | 26 | none | 11 (1000) / 15 (1847) | 13/13 exact |

The flag-off rows reproduce the #194 ATLS totals exactly (488 / 539 / 895 / 221 / 37 / 27, and 374 / 421 / 778 / 157 / 33 / 27).

**Who trades with whom** ([raw/transfer-breakdown.txt](negotiated-transfer/raw/transfer-breakdown.txt)):

| Set | Direction | Trigger / kind | Receiver standing | Sale price min / median / max | Seeds with a transfer |
|---|---|---|---|---|---|
| ATLS + NT | Free Tide → WG 32; breakaway → WG 4; FT → breakaway 3; WG → breakaway 3; WG → FT 1 | sale/sale 32, cession/grant 11 | adjacent 32, pact 11 | 36 / 84 / 168 | 13/13 |
| ATLS + NT exile off | FT → WG 26; breakaway → WG 4; WG → breakaway 2; breakaway → FT 1 | sale/sale 28, cession/grant 3, cession/sale 2 | adjacent 29, pact 4 | 60 / 144 / 180 | 12/13 |

Reading (report only, nothing tuned):
- **The sale trigger is mostly Free Tide.** It runs below reserve for over 41 ticks while holding 2+ ports, and sells its fullest port to World Government, the adjacent faction docked there that can pay.
- **Every accepted cession under ATLS was a grant to a pact partner.** The 20 cession offers ended as 11 grants and 9 declines, all on `reserve` (the receiver could not afford the seat). Every one of the 32 sale offers was accepted. Exile off, 2 cessions went through as sales to adjacent WG.
- **Exile off has more cession offers and declines** (52 offers, 47 declines). 29 of the declines are on 1847: a breakaway re-offering Crown Harbor and Glassport to its pact partner Free Tide after each new raid while Free Tide is below reserve.
- **Fewer captures under ATLS** (221 → 155). Secessions fall 37 → 32 (still 11/13) and portless-at-end falls 27 → 23.
- **Exile off rises:** secessions 33 → 34 on 13/13, port changes 421 → 459.

## 5. Property checks, checkers and pins

**Negotiation properties** (`measure-nt.ts`; each is checked on a replay world just before the event):

| Property | ATLS + NT | ATLS + NT exile off |
|---|---|---|
| No transfer without acceptance: every `settlement-transferred` immediately follows its own same-tick `transfer-offered`, with no decline for that offer. Every decline has an offer. | pass (0) | pass (0) |
| The seller held the port; the seller keeps ≥ 2 ports before (never portless after); every offer comes from the holder | pass | pass |
| The buyer can pay: treasury ≥ price + 18 × (mates + ports + 1); grant price 0; no negative price | pass | pass |
| The receiver is alive (has a living member); the agent is a free docked member of the receiver; no battle at the port | pass | pass |
| Mutual exclusion: no faction in two transfers in one tick; no return to the giver within 152 | pass | pass |
| Public news: a `news-posted` for `settlement-transferred` at the port follows every transfer, names the new holder, and carries no term key | pass | pass |
| Projection through `projectEventFeed`, one viewer per faction: non-parties never see offer or decline rows; on the transfer row their `data` carries no term and the summary has no price or kind; parties see price and terms | pass (394 projections) | pass (650) |
| Exact replay | 13/13 | 13/13 |

"No transfer to a dead or portless-forbidden party": receivers need a living docked member, so a dead faction cannot receive. No party is barred for being portless. A landless pact partner may receive a grant, as a landless faction may buy under port-transfer. The only portless rule is that the **seller** never goes portless.

**Existing checkers, with the flag on in the base** ([props-out/](negotiated-transfer/props-out/)):

| Checker | ATLS + NT | ATLS + NT exile off |
|---|---|---|
| `protection-pact-fix/props-alliances.ts` (rev 2; includes the break-condition property "no pact alive at a tick's end while its break condition holds", the protection-cause/step/window assertions, and liveness) | **PASSED**, 0 violations | **PASSED**, 0 violations |
| `defaults-on/props-secession-aftermath.ts` (pins default and opt-out, properties, replay, liveness, secessions ≥ 6/13) | **PASSED** | **PASSED** |
| `defaults-on/props-lifecycle.ts` | **PASSED** | **PASSED** |
| `defaults-on/props-port-transfer.ts` (purchases valid and caused, buyer/agent recomputed, liveness) | **PASSED** | **PASSED** |
| Liveness (claims and port changes > 0 every seed), secessions ≥ 6/13, no new wipeouts | pass (11/13, none) | pass (13/13, none) |
| `npm test` with fix.patch + this patch | **690 / 690 pass** ([npm-test-with-patch.txt](negotiated-transfer/npm-test-with-patch.txt)) | — |

**Pins.** With the flag off, nothing moves. Every pin below was re-run with fix.patch and this patch applied, 72 / 1,200 ticks ([raw/pins-*.jsonl](negotiated-transfer/raw/)):

| Set | 1847 | 2718 | 4096 |
|---|---|---|---|
| main default | 7f76e474/94de9c02 | 976c40bd/7a3741c9 | 08943ea5/af6eeaea |
| main exile off | 66e8ccb7/b51aa07a | b4ccedab/091f7628 | b04c5ac4/25bdbf15 |
| ATL (post-#192) | e8963d15/77d4697d | a08fbf46/2c7809db | 21de6a8b/c61988f4 |
| ATL exile off | 4283d504/33dc6c8d | 6103f94b/270e722d | 4612e9d4/4fc72064 |
| ATLS with fix | 85658e53/5367691c | aa54ada1/faf5798a | e4361ee1/7e93eab2 |
| ATLS exile off with fix | 296b11bc/4c1555e9 | 9f8b2f2b/c897ea88 | 93e6bfeb/226bad48 |
| S alone / S exile off / A+S | 427a7650/06c00949, 2c3f2d2d/af520ae9, 427a7650/571ae2c0 | d263dcf7/b06a3ecc, bd1473e7/eb0db5d9, d263dcf7/b06a3ecc | b83ce14c/799161cc, 9a8c815c/4f0da6cd, b83ce14c/7eb8be56 |

All 27 pins match #194 / protection-pact-fix §7, and the golden test passes inside `npm test`. With the flag on, the hashes are new from t72, because the ledger opens at tick 0. The ATLS + NT pins are 1847 fd8d2637/80767d69, 2718 a21c1263/90d9f435, 4096 0402aeab/8a2448fb. Exile off: bf9b8852/15b789f4, c4f1516f/21175258, c09a2fc3/b0d7c4d9.

**Rev 0** ([negotiated-transfer/rev0/](negotiated-transfer/rev0/)) had no no-return cooldown and no seller-side one-per-tick rule.
- It also passed every checker with 0 violations.
- It showed grant ping-pong: 8000 exile off passed Glassport between Free Tide and a breakaway 6 times in 216 ticks, and 2000 had three grants between WG and FT in 72 ticks.
- 9000 had a breakaway receive Cinder Key and give away Glassport in the same tick.
- Rev 1 adds the two §1.6 rules, and the tables above are rev 1.

## 6. Open questions for the Lead

1. **Receiver ranking.** Should it be the seller-visible order (pact, peace, docked troops) used here, or the #182 largest-surplus rule named in after-lifecycle.md? #182 reads a rival treasury that #192 made private, and it would make declines impossible.
2. **Sale direction.** 57 of the 62 sales across both sets are Free Tide → World Government (31 / 32 under ATLS, 26 / 30 exile off). Is WG consolidating Free Tide's surplus ports by sale acceptable as an emergent result? It is report-only, and nothing was tuned.
3. **Repeated declined cessions.** 1847 exile off has 29 offers, all declined `reserve`. Each new raid opens a new spell. Should a `reserve` decline instead be remembered until the receiver's own shortage watch clears? That needs no new constant.
4. **Grants outside cession.** A grant here is always a cession to a pact partner. after-lifecycle.md also lists "a holder grants an owned port to a governor". Governors are same-faction, so that would be an intra-faction seat change, not a transfer. Is it out of scope?
5. **Player seller or receiver.** In a live session the human holder's faction neither offers nor is offered. Should v2 add a player command to accept, decline or offer?
6. **Seller with one port.** Should a breakaway or faction with a single port under threat ever be allowed to cede to its patron, which would leave it portless and absorbed, much like a join? It is excluded here.
7. **Default.** Should this stay default off pending the ATL/S default-on code change, and is it a candidate to join S later?

## 7. Reproduce

```bash
git worktree add /tmp/nt origin/docs/negotiated-transfer && cd /tmp/nt && npm ci   # or link node_modules
git apply docs/design/protection-pact-fix/fix.patch
git apply docs/design/negotiated-transfer/negotiated-transfer.patch
./docs/design/negotiated-transfer/run-all.sh        # measure-nt × 4 sets, 27 pins, 8 checker runs
node --experimental-strip-types docs/design/negotiated-transfer/probe.ts off '{}'    # threshold probe (and the ATLS JSON)
node --experimental-strip-types docs/design/negotiated-transfer/summarize-probe.ts docs/design/negotiated-transfer/raw/probe-ATLS.jsonl
PERSEED=1 node --experimental-strip-types docs/design/negotiated-transfer/summarize.ts ATLS ATLS-NT ATLS-exile-off ATLS-NT-exile-off
node --experimental-strip-types docs/design/negotiated-transfer/breakdown.ts
npm test
```
