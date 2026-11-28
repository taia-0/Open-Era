# Negotiated port transfer and grant

**Status:** Open. Rev 2 was merged as #197 (`main` `e2508bd`). Prototype for the Lead to accept, change or reject. Post-#197 rulings: the capture drop is accepted as emergent and will not be tuned (mechanism: [negotiated-transfer-captures.md](negotiated-transfer-captures.md)); `negotiatedTransferTriggers` stays harness-only.
- **Author and date:** Researcher, 2026-11-27. Rev 2, same day.
- **Base:** `main` `e2508bd` (#197 merged the rev-2 spec; #196 was `4eb16ee`). `src` is unchanged since `e7ec840`, and every layer `*_DEFAULT` is still `false`, so all flags are passed explicitly.
- **Spend and runs:** offline, $0, no AI.
- **Prototype:** [negotiated-transfer/negotiated-transfer.patch](negotiated-transfer/negotiated-transfer.patch). It is not committed to `src`. It stacks on [protection-pact-fix/fix.patch](protection-pact-fix/fix.patch) and also applies cleanly on bare `main`.

This is option 2 of [after-lifecycle.md](after-lifecycle.md) §4. It covers the route `world-simulation.md:85` lists beside conquest and purchase, and `roadmap.md:28`. [port-transfer.md](port-transfer.md) §1 deferred it because a neutral port has no owner to negotiate with. This layer is for **held** ports, so there is always a seller.

## 0. Rulings (Lead, 2026-11-27, on #196)

1. **Seller-visible ranking stays.** Knowledge is earned, and declines are a feature. The #182 surplus rule is not used.
2. **World Government buying Free Tide's ports is emergent and acceptable.** Do not tune it. §7 explains why Free Tide is the chronic seller, with measured numbers.
3. **Remember declines, but the seller cannot see the receiver's treasury.** After a decline, the seller does not re-offer that port to the same receiver for **152** ticks, reusing `THREAT_WINDOW`. This replaces the rev-1 spell-keyed memory. Prototyped in the patch, with a property check.
4. **A holder granting a port to its own governor is out of scope** (intra-faction).
5. **Player accept, decline and offer commands are a v2 item**, after the engine version lands. A live session still skips a human-held faction as seller or receiver, as in rev 1.
6. **No one-port cession in v1.** The join path covers a single-port breakaway under threat.
7. **Default off** until the ATL and S default-on flips are in code. Before any default-on, diagnose the capture drop (221→155 in rev 1 under ATLS with the flag on). That diagnosis is §6 (rev 2: 221→156). Exile-off does not show the drop (157→159).

### Rulings after #197 (Lead, 2026-11-27)

1. **The capture drop is accepted as emergent and will not be tuned.** Default-on still needs the off-port mechanism explained in one paragraph. That note is [negotiated-transfer-captures.md](negotiated-transfer-captures.md), traced from seed 3000 under ATLS + fix.
2. **`negotiatedTransferTriggers` stays harness-only.** It is not a product flag.

## 1. Rule

### 1.1 Flag, clock and order

- **Flag:** `negotiatedTransfer` (`NEGOTIATED_TRANSFER_DEFAULT = false`), a `TickOptions` field. With the flag off nothing runs and `world.negotiatedTransfer` never exists, so flag-off worlds hash as before (§5). No CLI switch is added in the prototype. Ruling 7: it stays default off until the ATL and S flips are in code.
- **When:** every tick, the step runs right after `portPurchases` (`engine.ts`, after secessions and alliance forms).
  - Each tick it opens the ledger if needed and updates the shortage watch.
  - Offers are made only on the purchase clock: `t > 0`, `t % 24 === 0` (`PURCHASE_CLOCK`).
  - Sellers are taken in faction-id order.
- **Determinism:** no RNG draw and no AI.
- **Diagnosis hook only:** `TickOptions.negotiatedTransferTriggers` may omit `cession` or `sale` for leave-one-trigger-out runs. Unset means both fire. This is not a product flag. After #197 it stays harness-only.

### 1.2 Who offers, and why

A **seller** is any faction that holds **at least 2 ports** at the clock (ruling 6: no one-port cession). A faction never offers its last port, so no transfer can leave the seller portless. A seller whose command holder is human is skipped in a live session (`liveSession`, the same rule as the autonomous tax step). Player offer, accept and decline commands are v2 (ruling 5).

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
- R has not declined this port from this seller within the last 152 ticks (ruling 3, §1.6).

The seller ranks receivers using only what it can see in its own port (ruling 1):
1. pact partners first;
2. then peace partners (secession aftermath);
3. then the rest;
4. within each group, by more docked troops at P;
5. then by faction id.

This is not the #182 surplus rule. A rival treasury is private since #192, and declines are a feature: the seller offers, the receiver applies its own accept rule, and a decline is remembered without revealing figures.

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
- the port's raid-ledger entry is cleared. Decline memory is not cleared (it expires at 152 ticks, and it is keyed by seller, so a later seller is not blocked).

**Governor seat.** Nothing in `governor.ts` changes. At the next morning sync, `syncSeats` sees `factionChanged` and vacates the seller's governor. R's holder then appoints from R's members docked at P, and R's agent is one of them. A breakaway receiver gets no seat (`syncSeats` skips `secession-*`, as today). Under the docked-governor amendment ([offices-docked-governor.md](offices-docked-governor.md)), the old governor simply loses the seat. A holder granting a port to its own governor is out of scope (ruling 4).

### 1.6 Coexistence with purchase: precedence, mutual exclusion and cooldowns

- **Precedence.** `portPurchases` runs first on the same clock tick. It only touches neutral ports (`factionId === null`), and negotiation only touches held ports, so the two never compete for a port. A treasury spent on a purchase is already spent when the negotiation step's accept rule reads it.
- **Mutual exclusion within one tick:**
  - one ownership change per port per tick;
  - a faction is party to at most one transfer per clock tick, as seller or as receiver;
  - a port with an active battle is not offered;
  - a port claimed earlier in the tick no longer belongs to the seller, so it cannot be offered.
- **Cooldowns:**
  - **No return within 152 ticks.** A port given by agreement is not offered back to the faction that gave it within `THREAT_WINDOW`.
  - **Decline block (rev 2, ruling 3).** After a decline, the seller does not re-offer **that port** to **that receiver** for 152 ticks. The memory key is `(seller, port, receiver)` plus the decline tick. It does not depend on the trigger or the shortage/raid spell. The seller never reads the receiver's treasury; it only remembers that an offer was declined. A new raid or a new shortage spell does not reopen the offer inside the window (that was the rev-1 behaviour, and it produced 29 repeated `reserve` declines on 1847 exile-off). Entries expire when `tick - declined.tick > 152`.
  - **No new constant.** The 24-tick clock is port-transfer's; 152 is `THREAT_WINDOW`.

### 1.7 Interactions

| Layer | Interaction |
|---|---|
| **Alliances** | Pact partners are offered first, and a cession to a pact partner is a grant. A transfer cannot leave anyone portless (seller ≥ 2 ports; the receiver gains), so it cannot by itself create an `enemy-portless` or `ally-gone` break. Breaks run after the transfer in the same tick, plus the fix.patch second check after aftermath. The rev-2 break-condition property passes (§5). |
| **Protection pacts** | A patron is a pact partner, so a breakaway under threat grants to its patron, and a patron under threat grants to its protégé. Protection formation and join are unchanged. |
| **Secession aftermath (breakaways)** | A breakaway can sell or cede only once it holds ≥ 2 ports (ruling 6). The join path covers a one-port breakaway under threat. A breakaway can receive like any faction. An aftermath record whose port changed hands is already skipped by the aftermath step. Peace partners rank second. |
| **Lifecycle** | Seats are handled in §1.5. Retirement and return read `ports held` at the time, unchanged. The `character-retired.office` gap ruled for the Engineer is untouched. |
| **Occupation (off)** | A transfer is not a conquest. It clears any occupation record and does not start one. Untested here because occupation is off. |
| **Purchase** | §1.6. |

## 2. Thresholds and their sources

Every number is an existing rule or a measured percentile. No constant was tuned toward a target, including in rev 2. The probe is [negotiated-transfer/probe.ts](negotiated-transfer/probe.ts), and the summaries are [raw/probe-off.summary.json](negotiated-transfer/raw/probe-off.summary.json) and [raw/probe-ATLS.summary.json](negotiated-transfer/raw/probe-ATLS.summary.json). Both runs are 13 seeds × 1,200 ticks, flag-free: main defaults, and ATLS + fix.

| Constant | Value | Source |
|---|---|---|
| `THREAT_WINDOW` | 152 | `ALLIANCE_RAID_WINDOW`: p90 of the gap between successive raids by one faction on another (alliances.md, 959 gaps, flag off). In the probe, a raided held port was lost within 152 ticks 540 / 720 times (ATLS) and 708 / 802 times (flag off). Ruling 3 reuses this for the decline block. |
| `CESSION_GARRISON` | 15 | The surrender line, `world-simulation.md:97`: surrender is offered at garrison ≤ 15, and a port-holding raider needs garrison ≥ 15. Measured loss within 152 ticks of a raid: **garrison ≤ 15: 330 / 394 (ATLS), 511 / 519 (flag off). Garrison > 15: 210 / 326 (ATLS), 197 / 283 (flag off).** |
| `SHORTAGE_SPELL` | 41 | p90 of closed below-reserve spells of factions holding ≥ 2 ports, ATLS + fix: n 148, p50 5, p75 13, p90 41, max 113. Flag off gives p90 20 (n 129). ATLS is the set this layer runs on. |
| Price, reserve, adjacency, clock | 12 × garrison, 18 × (mates + ports), 30, 24 | port-transfer.md §2 (recruit cost, stipend rule, alliances adjacency, faction clock). |
| Seller ≥ 2 ports | — | Structural: no transfer can make the seller portless (ruling 6). Measured share of holder-clocks with ≥ 2 ports: 748 / 1,552 (ATLS) and 477 / 1,372 (flag off). |

Context from the same probe:
- held-port garrison at the clock is ≤ 15 in 2,019 / 2,534 samples (ATLS) and 1,633 / 1,899 (flag off);
- a holder is below reserve at 332 / 1,552 clocks (ATLS) and 292 / 1,372 (flag off).

## 3. Events, state and visibility

**State** (flag on only): `world.negotiatedTransfer`, which is replayed from events:
- `raids`: per port, the last raid against its holder (same raid test as `noteRaid`);
- `shortage`: faction → spell start;
- `declined`: `(settlementId, sellerFactionId, factionId, tick)` — the ruling-3 block;
- `returned`: port → giver and tick.

| Event | Fields | Who reads the payload | Feed and news |
|---|---|---|---|
| `transfer-ledger-opened` | — | parties only (none) | bookkeeping, never in a feed |
| `transfer-watch` / `transfer-watch-cleared` | factionId, since | that faction | bookkeeping, never in a feed |
| `transfer-offered` | offerId, sellerFactionId, factionId, kind, trigger, since, price, priceBasis, cause, receiverStanding | **seller and receiver only** | the row is shown only to the two parties (`showInPlayerFeed`) |
| `transfer-declined` | offerId, sellerFactionId, factionId, trigger, since, reason | **seller and receiver only** | the two parties only |
| `settlement-transferred` | the offer terms, plus ownerId, previousOwnerId, payerFactionId, reserve | **seller and receiver only**. For anyone else `data` is null, and `stripPlayerEventData` also drops the terms as a second guard | **public:** in `PUBLIC_NEWS_TYPES`, so a `news-posted` follows at the port; in `OWNERSHIP_NEWS`, so `learnedHolder` updates; not a status reading (`countsAsPortStatus`); counted as a port change in `dynamism.ts` |

The public line is: "*Agent* took over *Port* for *Receiver* from *Seller* by agreement." It names no price, no kind and no terms. A party's line adds: "Terms: a sale for N (sale)" or "Terms: a grant (cession)". The news item has its usual fields only: id, type, observedTick, factionId (the new holder).

## 4. Results: 13 seeds × 1,200 ticks, ATLS + fix.patch, flags explicit (rev 2)

The set is `{occupation:false, alliances:true, portTransfer:true, lifecycle:true, secessionAftermath:true}`, plus `negotiatedTransfer` on or off and `exileRecovery:false` for the opt-out rows. Leave-one-trigger-out rows are diagnosis only (§6). All figures are report-only. Raw rows are in [raw/](negotiated-transfer/raw/), with per-seed tables in [summary.txt](negotiated-transfer/summary.txt). Rev-1 rows are kept under [rev1/](negotiated-transfer/rev1/).

| Set | Offers (cession / sale) | Accepts | Sales / grants | Declines (reason) | Price paid | Claims | Port changes | Battles | Captures | Secessions (seeds) | Peaces | Pacts (prot.) | Pact breaks | Purchases | Portless at end | Wipeouts | Lowest claims / port changes | Replay |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ATLS | 0 | 0 | 0 / 0 | 0 | 0 | 488 | 539 | 895 | 221 | 37 (11/13) | 24 | 59 (1) | 39 | 13 | 27 | none | 25 (8000) / 28 (1000) | 13/13 exact |
| **ATLS + NT, rev 2** | 48 (15 / 33) | 42 | 32 / 10 | 6 (reserve 6) | 3,048 | 464 | 551 | 840 | 156 | 32 (11/13) | 20 | 55 (2) | 37 | 13 | 23 | none | 18 (3000) / 22 (3000) | 13/13 exact |
| ATLS exile off | 0 | 0 | 0 / 0 | 0 | 0 | 374 | 421 | 778 | 157 | 33 (11/13) | 24 | 50 (2) | 33 | 13 | 27 | none | 12 (1847) / 14 (1000) | 13/13 exact |
| **ATLS + NT exile off, rev 2** | 47 (19 / 28) | 33 | 30 / 3 | 14 (reserve 14) | 3,864 | 377 | 459 | 800 | 159 | 34 (13/13) | 21 | 61 (2) | 41 | 14 | 26 | none | 11 (1000) / 15 (1847) | 13/13 exact |

The flag-off rows reproduce the #194 ATLS totals exactly (488 / 539 / 895 / 221 / 37 / 27, and 374 / 421 / 778 / 157 / 33 / 27).

### 4.1 Rev 1 → rev 2

Ruling 3 is the only rule change. It cuts repeat offers after a `reserve` decline; accepted transfers are almost unchanged.

| Set | Offers (cession / sale) | Accepts (sales / grants) | Declines | Price paid | Claims | Port changes | Battles | Captures | Peaces | Pacts (prot.) | Pact breaks |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ATLS + NT, rev 1 | 52 (20 / 32) | 43 (32 / 11) | 9 | 3,048 | 468 | 556 | 842 | 155 | 21 | 58 (2) | 40 |
| ATLS + NT, rev 2 | 48 (15 / 33) | 42 (32 / 10) | 6 | 3,048 | 464 | 551 | 840 | 156 | 20 | 55 (2) | 37 |
| ATLS + NT exile off, rev 1 | 80 (52 / 28) | 33 (30 / 3) | 47 | 3,864 | 377 | 459 | 800 | 159 | 21 | 61 (2) | 41 |
| ATLS + NT exile off, rev 2 | 47 (19 / 28) | 33 (30 / 3) | 14 | 3,864 | 377 | 459 | 800 | 159 | 21 | 61 (2) | 41 |

- **Exile off:** every accepted transfer is the same list as rev 1. Offers fall 80 → 47 and declines 47 → 14, almost all of it cession repeats (1847 alone was 29 offers and 29 declines, all `reserve`, and is now 7 / 7). Captures, battles, claims, price paid and secessions do not move.
- **Exile on:** one behavioural change, on seed 2000: rev 1 had a grant of Cinder Key from World Government to Free Tide at t696 and a grant of Crown Harbor the other way at t720; rev 2 drops the first (it was reached after a string of `reserve` declines) and moves Crown Harbor to t792. Offers 11 → 7, accepts 3 → 2. The other twelve seeds keep the same transfer list. Seed 7000 has the same transfers and the same 6 / 5 / 1 counts; its hash still moves because the declined record now stores `tick` instead of `trigger` and `since`.

**Who trades with whom, rev 2:**

| Set | Direction of accepted transfers | Trigger / kind | Receiver standing | Sale price min / median / max | Seeds with a transfer |
|---|---|---|---|---|---|
| ATLS + NT | Free Tide → WG 31; FT → breakaway 1; plus 10 grants (pact) | sale/sale 32, cession/grant 10 | adjacent 32, pact 10 | 36 / 84 / 168 | 13/13 |
| ATLS + NT exile off | FT → WG 26; WG → breakaway 2; breakaway → WG 2 | sale/sale 28, cession/grant 3, cession/sale 2 | adjacent 29, pact 4 | 60 / 144 / 180 | 12/13 |

31 of the 32 sales under ATLS, and 26 of the 30 under exile-off, are Free Tide → World Government. That is the same shape as rev 1 (ruling 2: acceptable; §7 explains it).

## 5. Property checks, checkers and pins

**Negotiation properties** (`measure-nt.ts`; each is checked on a replay world just before the event):

| Property | ATLS + NT | ATLS + NT exile off |
|---|---|---|
| No transfer without acceptance: every `settlement-transferred` immediately follows its own same-tick `transfer-offered`, with no decline for that offer. Every decline has an offer. | pass (0) | pass (0) |
| The seller held the port; the seller keeps ≥ 2 ports before (never portless after); every offer comes from the holder | pass | pass |
| The buyer can pay: treasury ≥ price + 18 × (mates + ports + 1); grant price 0; no negative price | pass | pass |
| The receiver is alive (has a living member); the agent is a free docked member of the receiver; no battle at the port | pass | pass |
| Mutual exclusion: no faction in two transfers in one tick; no return to the giver within 152 | pass | pass |
| **Ruling 3:** after a decline, no re-offer of that port by that seller to that receiver at a tick T with T − decline.tick ≤ 152 | pass | pass |
| Public news: a `news-posted` for `settlement-transferred` at the port follows every transfer, names the new holder, and carries no term key | pass | pass |
| Projection through `projectEventFeed`, one viewer per faction: non-parties never see offer or decline rows; on the transfer row their `data` carries no term and the summary has no price or kind; parties see price and terms | pass (362 projections) | pass (396) |
| Exact replay | 13/13 | 13/13 |

The leave-one-trigger-out sets also had 0 property violations and exact replay on 13/13.

**Existing checkers, with the flag on in the base** ([props-out/](negotiated-transfer/props-out/)):

| Checker | ATLS + NT | ATLS + NT exile off |
|---|---|---|
| `protection-pact-fix/props-alliances.ts` (rev 2; includes the break-condition property, the protection-cause/step/window assertions, and liveness) | **PASSED**, 0 violations | **PASSED**, 0 violations |
| `defaults-on/props-secession-aftermath.ts` | **PASSED** | **PASSED** |
| `defaults-on/props-lifecycle.ts` | **PASSED** | **PASSED** |
| `defaults-on/props-port-transfer.ts` | **PASSED** | **PASSED** |
| Liveness (claims and port changes > 0 every seed), secessions ≥ 6/13, no new wipeouts | pass (11/13, none) | pass (13/13, none) |
| `npm test` with fix.patch + this patch | **690 / 690 pass** ([npm-test-with-patch.txt](negotiated-transfer/npm-test-with-patch.txt)) | — |

**Pins, flag off.** Nothing moves. Every pin below was re-run with fix.patch and this patch applied, 72 / 1,200 ticks ([raw/pins-*.jsonl](negotiated-transfer/raw/)):

| Set | 1847 | 2718 | 4096 |
|---|---|---|---|
| main default | 7f76e474/94de9c02 | 976c40bd/7a3741c9 | 08943ea5/af6eeaea |
| main exile off | 66e8ccb7/b51aa07a | b4ccedab/091f7628 | b04c5ac4/25bdbf15 |
| ATL (post-#192) | e8963d15/77d4697d | a08fbf46/2c7809db | 21de6a8b/c61988f4 |
| ATL exile off | 4283d504/33dc6c8d | 6103f94b/270e722d | 4612e9d4/4fc72064 |
| ATLS with fix | 85658e53/5367691c | aa54ada1/faf5798a | e4361ee1/7e93eab2 |
| ATLS exile off with fix | 296b11bc/4c1555e9 | 9f8b2f2b/c897ea88 | 93e6bfeb/226bad48 |
| S alone / S exile off / A+S | 427a7650/06c00949, 2c3f2d2d/af520ae9, 427a7650/571ae2c0 | d263dcf7/b06a3ecc, bd1473e7/eb0db5d9, d263dcf7/b06a3ecc | b83ce14c/799161cc, 9a8c815c/4f0da6cd, b83ce14c/7eb8be56 |

All 27 pins match #194 / protection-pact-fix §7, and the golden test passes inside `npm test`.

**Flag-on pins, rev 1 → rev 2** (72 / 1,200). The three pin seeds with exile on are unchanged, because they had no declines. With exile off, 1847 and 4096 move (they had declines); 2718 does not.

| Set | 1847 | 2718 | 4096 |
|---|---|---|---|
| ATLS + NT, rev 1 and rev 2 | fd8d2637/80767d69 | a21c1263/90d9f435 | 0402aeab/8a2448fb |
| ATLS + NT exile off, rev 1 | bf9b8852/15b789f4 | c4f1516f/21175258 | c09a2fc3/b0d7c4d9 |
| ATLS + NT exile off, rev 2 | bf9b8852/**66ddc056** | c4f1516f/21175258 | c09a2fc3/**0af2f809** |

Across all 13 seeds, hashes also move on ATLS + NT 2000 (the one transfer-list change; t72 stays 174c8548, t1200 1b3745ad) and 7000 (same transfers, declined-record shape; t72 stays 7993efac, t1200 f52bc98a), and on exile-off 1000 and 2000 (same transfers; fewer repeats on 1000).

## 6. Capture diagnosis

The off-port mechanism (who stopped raiding whom in seed 3000, and why the exile-off knock-on runs the other way) is [negotiated-transfer-captures.md](negotiated-transfer-captures.md). The tables below are the 13-seed attribution from rev 2.

The question was: the capture drop under ATLS with the flag on (rev 1: 221 → 155; rev 2: 221 → 156) — is it cessions pre-empting raids, or fewer raidable targets? And why does exile-off not show it (157 → 159)? Captures here are `character-captured` events, not port claims. Full tables: [raw/capture-diagnosis.txt](negotiated-transfer/raw/capture-diagnosis.txt). Leave-one-trigger-out uses the diagnosis hook, both triggers otherwise. Nothing was tuned.

### 6.1 Leave-one-trigger-out (the attribution)

| Set | Offers (cession / sale) | Accepts (sales / grants) | Captures | Battles | Captures / battle | Claims | Battle starts |
|---|---|---|---|---|---|---|---|
| ATLS (flag off) | 0 | 0 | **221** | 895 | 0.247 | 488 | 721 |
| ATLS + NT (both) | 48 (15 / 33) | 42 (32 / 10) | **156** | 840 | 0.186 | 464 | 642 |
| **Cession only** | 16 (16 / 0) | 6 (0 / 6) | **203** | 912 | 0.223 | 512 | 724 |
| **Sale only** | 41 (0 / 41) | 40 (40 / 0) | **158** | 847 | 0.187 | 473 | 658 |
| ATLS exile off | 0 | 0 | **157** | 778 | 0.202 | 374 | 595 |
| ATLS + NT exile off | 47 (19 / 28) | 33 (30 / 3) | **159** | 800 | 0.199 | 377 | 612 |
| Cession only, exile off | 22 (22 / 0) | 10 (3 / 7) | **156** | 774 | 0.202 | 389 | 587 |
| Sale only, exile off | 28 (0 / 28) | 28 (28 / 0) | **158** | 798 | 0.198 | 372 | 607 |

Under ATLS, **the drop is a sale effect, not a cession effect.** Sale-only is 221 → 158, which is 63 of the 65-capture drop and 48 of the 55-battle drop, and it also carries the captures-per-battle fall (0.247 → 0.187, vs 0.186 with both triggers). Cession-only is 221 → 203 (−18) and battles **rise** 895 → 912. Cessions are not pre-empting the raid volume that accounts for the drop.

Per seed, ATLS flag off → both triggers (cession-only, sale-only):

| Seed | Captures | Battles | Notes |
|---|---|---|---|
| 1847 | 21 → 17 (17, 20) | 65 → 59 (67, 68) | |
| 2718 | 22 → 17 (22, 17) | 77 → 63 (77, 63) | sale-only matches the on run; no cessions accepted |
| 4096 | 18 → 6 (6, 6) | 87 → 76 (73, 76) | sale-only matches |
| 1000 | 17 → 19 (17, 19) | 58 → 67 (58, 67) | captures rise; sale-only matches |
| 2000 | 15 → 11 (15, 9) | 71 → 68 (71, 62) | cession-only unchanged at 15 |
| 3000 | **21 → 1 (21, 1)** | 65 → 47 (65, 47) | one sale of Verdant Cay at t120; cession-only unchanged |
| 4000 | 25 → 19 (25, 19) | 79 → 88 (79, 88) | |
| 5000 | 14 → 7 (17, 7) | 61 → 48 (80, 48) | |
| 6000 | 5 → 7 (5, 7) | 55 → 60 (55, 60) | captures rise |
| 7000 | 22 → 12 (22, 16) | 73 → 70 (73, 79) | |
| 8000 | 7 → 12 (7, 10) | 43 → 56 (43, 56) | captures rise |
| 9000 | 18 → 18 (16, 17) | 81 → 83 (88, 78) | |
| 10000 | 16 → 10 (13, 10) | 80 → 55 (83, 55) | |
| **total** | **221 → 156 (203, 158)** | **895 → 840 (912, 847)** | |

The drop is uneven. Seed 3000 alone is 21 → 1, and sale-only reproduces it. In that seed the only transfer is Verdant Cay, Free Tide → World Government at t120, price 120 (garrison 10). Verdant Cay itself had 0 captures in both runs. The missing 20 captures are at the other three ports (Cinder Key 7 → 0, Crown Harbor 5 → 1, Glassport 9 → 0). That is a knock-on, not a raid avoided on the transferred port.

### 6.2 Transferred ports versus the rest, and 152-tick windows

Captures and battles at the ports the flag-on run actually transfers, versus every other port, flag off → on:

| Set | Captures at transferred ports | Battles at those ports | Starts at those ports | Captures at other ports | Battles at other ports |
|---|---|---|---|---|---|
| ATLS | 71 → 57 (−14) | 373 → 357 (−16) | 248 → 239 (−9) | **150 → 99 (−51)** | **522 → 483 (−39)** |
| ATLS exile off | 42 → 55 (**+13**) | 267 → 300 (+33) | 177 → 196 (+19) | 115 → 104 (−11) | 511 → 500 (−11) |

Under ATLS, **51 of the 65 missing captures are at ports that were never transferred.** Raid opportunities lost at the sold or granted port are the smaller part.

152-tick windows around each flag-on transfer, compared with the same numeric window in the flag-off run of the same seed (a loose counterfactual; the worlds have already diverged):

| Set / kind | N | Garrison min / median / max | Starts on, before → after | Starts off, before → after | Captures on, before → after | Captures off, before → after |
|---|---|---|---|---|---|---|
| ATLS, cession/grant | 10 | 5 / 8 / 14 | 14 → 5 | 13 → 10 | 5 → 2 | 4 → 6 |
| ATLS, sale/sale | 32 | 3 / 7 / 14 | 36 → 30 | 38 → 30 | 3 → 12 | 6 → 15 |
| Exile off, cession/grant | 3 | 8 / 14 / 14 | 6 → 2 | 1 → 1 | 2 → 1 | 0 → 0 |
| Exile off, cession/sale | 2 | 12 / 12 | 5 → 1 | 2 → 0 | 2 → 1 | 0 → 0 |
| Exile off, sale/sale | 28 | 5 / 12 / 15 | 14 → 24 | 9 → 26 | 3 → 13 | 5 → 9 |

Cessions do cut follow-up starts at that port (14 → 5 on, vs 13 → 10 off), but that is 10 grants and a handful of captures. After a sale under ATLS, starts fall only slightly (36 → 30, and the flag-off window does the same), and **captures at the sold port rise** in the next 152 ticks (3 → 12). Sales are not pre-empting captures on the transferred port.

### 6.3 World Government–bought garrisons

All 31 ATLS sales to World Government, and 26 of 28 exile-off sales to World Government, are from Free Tide. Garrison at the moment of sale (from `priceBasis`):

| Set | WG-bought sales | Garrison 0–7 | 8–14 | 15 | Starts in the 152 ticks after, by band | Captures after, by band |
|---|---|---|---|---|---|---|
| ATLS | 31 (price sum 2,916) | 19 | 12 | 0 | 23 / 4 / 0 | 10 / 1 / 0 |
| Exile off | 28 (price sum 3,576) | 6 | 21 | 1 | 1 / 21 / 2 | 0 / 12 / 1 |

Under ATLS every bought port is at garrison ≤ 14, median 7, so it sits below the port-holder raid floor of 15 (`world-simulation.md:97`) at the moment of sale. Under exile-off the median is 12 and one port is at 15: more of the sold ports remain in the band where a port-holding attacker can still be offered a raid, and starts after the sale rise (14 → 24) rather than fall.

### 6.4 Why exile-off does not drop (157 → 159)

- Sale-only is 158 and cession-only is 156, both within 1–2 of the flag-off 157. Neither trigger removes captures under exile-off.
- Battles rise 778 → 800 (sale-only 798). Captures per battle stay flat (0.202 → 0.199).
- Captures at transferred ports **rise** 42 → 55, which more than offsets the −11 at other ports. Under ATLS the other-port term was −51 and dominated.
- The ports WG buys under exile-off are healthier (median garrison 12 vs 7), and the 152-tick window after a sale sees more starts, not fewer.
- Cessions stay rare (3 grants and 2 cession-sales) and do not move the total.

The same sale mechanic therefore has opposite knock-on signs in the two exile settings, and the sign tracks the garrison of the sold port and where the missing captures would have been (other ports vs the sold port itself). This is report-only. Event diffs for seed 3000 (ATLS, exile on) and seed 2718 (ATLS, exile off) are in [negotiated-transfer-captures.md](negotiated-transfer-captures.md).

## 7. Why Free Tide is the chronic seller

Ruling 2 asked for an explanation, with numbers, and no tuning. The figures below are from the ATLS + fix, **flag-off** runs (13 seeds × 1,200 ticks), unless noted. They are the conditions the sale trigger reads. The accounting is in `measure-nt.ts` and [raw/ft-explain.txt](negotiated-transfer/raw/ft-explain.txt).

**It is not a low tax rate, and it is not settlement upkeep.** It is a thin starting treasury, recruit-heavy treasury draws that outrun tax and ransom, and a reserve test that Free Tide fails for long stretches while it still holds two ports — a test World Government never fails.

### 7.1 Starting endowments, not the running tax rate

`scenario.ts` opens World Government at treasury 18,000 and tax 0.14, Free Tide at 2,800 and 0.08.

Over the run Free Tide **raises** tax (276 `tax-rate-set` events, time-average rate 0.11, end-average 0.15). World Government **cuts** (96 sets, time-average 0.10, end-average 0.07). Free Tide's time-average rate is not lower. Tax take per holder-tick is also not lower: 9.089 vs 8.891. Free Tide simply holds less ground (19,959 holder-ticks vs 30,167) and therefore collects less tax in total (181,405.03 vs 268,202.95). End treasury: Free Tide averages 67.73 (0 on 5 of 13 seeds, max 499.10); World Government averages 6,065.01.

### 7.2 Shortage spells, not provision shortages

The sale trigger is treasury below the stipend reserve, 18 × (free mates + ports), for ≥ 41 ticks while holding at least two ports.

| | World Government | Free Tide | Breakaways (aggregated) |
|---|---|---|---|
| Ticks below reserve (of 13 × 1,200 = 15,600) | **0** | **6,990 (44.8 %)** | 1,228 |
| …of which while holding ≥ 2 ports | 0 | **3,726** | 116 |
| Shortage spells (closed or still open at the end) | 0 | 355 (141 with ≥ 2 ports) | 84 |
| Clock samples below reserve | 0 / 637 | **391 / 637** | — |
| Clock surplus p10 / p50 / p90 (mean of per-seed percentiles) | 7,182.09 / 13,182.64 / 17,119.33 | **−104.63 / −20.80 / 740** | — |
| Clock treasury avg / reserve avg / ports / mates | 12,878.03 / 222.13 / 1.92 / 10.43 | **262.07 / 101.98 / 1.29 / 4.37** | — |
| Settlement-upkeep shortage ticks (provisions) | 0 | **0** | 0 |
| Garrison lost to provision shortage | 0 | 0 | 0 |

Free Tide is below reserve on every seed (318 to 775 of 1,200 ticks). World Government is below reserve on none. That is why the seller is Free Tide: only it (and occasionally a two-port breakaway) ever satisfies the sale trigger. Provision upkeep is not involved. There was no `settlement-shortage` and no garrison loss from shortage for any of these factions.

Exile-off is the same shape: Free Tide is below reserve for 6,456 / 15,600 ticks (3,052 with ≥ 2 ports); World Government again 0; provision shortages again 0.

### 7.3 Where the coins go

Summed over the 13 flag-off ATLS seeds, treasury flow for Free Tide vs World Government:

| | Free Tide | World Government |
|---|---|---|
| Start | 2,800 × 13 = 36,400 | 18,000 × 13 = 234,000 |
| Tax | +181,405.03 | +268,202.95 |
| Ransom | +7,008.94 | +13,596.46 |
| Treasury draws | **−209,584.53** | −353,932.89 |
| Neutral-port purchases | 0 | −10,932 (the 13 Verdant Cay buys at 840) |
| Residual (no event; the silent stipend in `payGovernorStipends`) | −14,348.94 | −72,089.35 |
| End (sum) | 880.50 (avg 67.73) | 78,845.17 (avg 6,065.01) |

Draws exceed tax for both, but World Government can absorb that from the opening 18,000 and still stay above reserve. Free Tide cannot. Of Free Tide's draws, **recruit is 119,830.68 (57.2 %)**. The rest is `market-trade` 45,122.19, `character-upkeep` (party provisions charged to the treasury) 35,197.69, and `contract-offered` 9,433.97. World Government's largest draw is market-trade (156,175.92), then recruit 105,078.12 (29.7 % of its draws), character-upkeep 81,191.22, and contracts 11,487.63.

So: Free Tide starts with a sixth of World Government's treasury, spends a majority of its draws on recruiting, falls below the stipend reserve for nearly half the run — including 3,726 ticks while it still holds two ports — and then the sale rule offers its fullest port to the adjacent faction that can pay, which is World Government. Tax policy and provision shortages are not what trips the trigger. The residual stipend is real (World Government pays more of it because it is always solvent and holds more seats) but is not the reason Free Tide is short: even before that residual, tax + ransom − draws is already negative for Free Tide (−21,170.56 across the 13 seeds).

With the flag on, the picture is the same mechanism plus the sales themselves: Free Tide receives 3,048 from those sales, holds fewer ports (clocks with ≥ 2 ports 270 → 193), and World Government's holder-ticks rise 30,167 → 33,025. World Government still has 0 ticks below reserve.

## 8. Open questions for the Lead

Rulings 1–7 are recorded above. After #197 the Lead also ruled: the capture drop is accepted as emergent and will not be tuned (item 1), and `negotiatedTransferTriggers` stays harness-only (item 3). The mechanism, including why exile-off runs the other way (item 2), is [negotiated-transfer-captures.md](negotiated-transfer-captures.md). Nothing else is proposed as a tune.

1. **The ATLS capture drop is a sale knock-on, concentrated off the transferred port, and uneven across seeds.** Seed 3000 alone is 21 → 1 from one t120 sale of Verdant Cay. ~~Is that acceptable in the same sense as ruling 2, before any default-on?~~ **Ruled after #197:** accepted as emergent; will not be tuned. The off-port mechanism is in [negotiated-transfer-captures.md](negotiated-transfer-captures.md).
2. **Sold garrisons are lower with exile on (median 7, all ≤ 14) than with exile off (median 12, one at 15).** That is the measured difference that tracks the opposite knock-on signs in §6.4. The same look is in [negotiated-transfer-captures.md](negotiated-transfer-captures.md): selling a quiet rear port lets the war at the other ports die; selling a contested front-line port (the typical exile-off case) raises starts and captures at that port.
3. **The diagnosis hook** `negotiatedTransferTriggers` is harness-only. ~~Keep it out of any product flag set?~~ **Ruled after #197:** it stays harness-only.

## 9. Reproduce

```bash
git worktree add /tmp/nt2 origin/docs/negotiated-transfer-rev2 && cd /tmp/nt2 && npm ci   # or link node_modules
git apply docs/design/protection-pact-fix/fix.patch
git apply docs/design/negotiated-transfer/negotiated-transfer.patch
./docs/design/negotiated-transfer/run-all.sh        # 4 main sets, 4 leave-one-trigger-out, 27 pins, 8 checker runs
PERSEED=1 node --experimental-strip-types docs/design/negotiated-transfer/summarize.ts ATLS ATLS-NT ATLS-exile-off ATLS-NT-exile-off ATLS-NT-cession ATLS-NT-sale ATLS-NT-exile-off-cession ATLS-NT-exile-off-sale
node --experimental-strip-types docs/design/negotiated-transfer/compare-captures.ts
node --experimental-strip-types docs/design/negotiated-transfer/summarize-ft.ts ATLS ATLS-NT ATLS-exile-off ATLS-NT-exile-off
npm test
```
