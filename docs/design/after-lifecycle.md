# After lifecycle: what is quieter, what is missing, next slice

Status: **Open / proposal** for the Lead. Base: main `d6e51a9` (#185). Offline, no AI, $0.

## 1. Combined readout: defaults vs all four slice flags on

13 seeds × 1,200 ticks. "Off" is main defaults (exile recovery on; `occupation`, `alliances`, `portTransfer`, `lifecycle` off). "On" sets those four `TickOptions` to `true`. Script and raw rows: `after-lifecycle/combo-flags.ts`, `after-lifecycle/combo.jsonl`.

| Seed | Claims off/on | Port changes off/on | Secessions off/on | Battles off/on | Pacts formed | Purchases | Promotions / retirements / returns |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1847 | 51/14 | 52/19 | 1/4 | 74/33 | 2 | 1 | 1/4/2 |
| 2718 | 64/37 | 64/38 | 0/0 | 81/59 | 0 | 1 | 2/6/4 |
| 4096 | 56/35 | 59/42 | 3/6 | 81/80 | 15 | 1 | 1/3/2 |
| 1000 | 42/40 | 44/41 | 2/0 | 69/72 | 0 | 1 | 2/4/0 |
| 2000 | 50/20 | 52/21 | 2/0 | 72/44 | 0 | 1 | 0/3/1 |
| 3000 | 42/29 | 44/30 | 2/0 | 58/49 | 0 | 1 | 2/6/0 |
| 4000 | 63/46 | 64/52 | 1/5 | 79/72 | 14 | 1 | 3/6/4 |
| 5000 | 55/13 | 57/15 | 2/1 | 71/41 | 1 | 1 | 0/4/3 |
| 6000 | 50/28 | 55/33 | 5/4 | 65/60 | 7 | 1 | 0/7/1 |
| 7000 | 61/48 | 65/49 | 4/0 | 78/64 | 0 | 1 | 3/3/3 |
| 8000 | 62/41 | 66/42 | 4/0 | 76/64 | 0 | 1 | 1/5/3 |
| 9000 | 58/31 | 60/37 | 2/5 | 78/69 | 9 | 1 | 1/6/3 |
| 10000 | 28/39 | 31/42 | 3/2 | 45/59 | 4 | 1 | 1/11/8 |
| **Total** | **682/421** | **713/461** | **31/27** | **927/766** | **52** | **13** | **17/68/34** |

Battles by 400-tick third: off 362 / 283 / 282, on 353 / 184 / 229. Claims by third: off 137 / 265 / 280, on 104 / 147 / 170. Captures 247 → 179. Liveness with all flags on still holds (min claims 13, min port changes 15, no wipeouts), but secessions occur on 7/13 seeds (off 12/13), one above the floor.

Per-slice 13-seed tables already on main, each against 682 claims off: occupation re-spec 445; alliances 599; port purchase 641 (Verdant Cay 0/0 → 38 battles, 75 claims); lifecycle rev 2 559. Combined, the effects stack: 421.

## 2. What is quieter now

- **Claims −38 %, port changes −35 %, battles −17 %** with all layers on. The mid-game is quietest: battles in t401–800 drop 283 → 184 (−35 %).
- **Secessions spread to fewer seeds** (12 → 7 of 13) though the total barely moves (31 → 27): they concentrate where alliances form.
- **Alliances form on only 7/13 seeds combined** (52 pacts), against 124 alone (#180): occupation and lifecycle remove the raided or weak partners the causes need.
- **Wars never end.** Every slice adds a reason to fight or hold; nothing ends hostility. `src/sim` has no peace, membership or protection path (grep of engine/commands/agency). 21 of 53 factions finish portless with all flags on (off 25/57) and stay in permanent war.

## 3. What the vision still lacks

- `world-simulation.md:95`: "If the settlement survives a time threshold or makes peace, the owner may remain independent, found a new faction, or seek protection or membership elsewhere." None of this exists; a seceded port is at war with its old faction forever.
- `world-simulation.md:85`: "receiving a negotiated transfer or faction grant". Only conquest and (neutral) purchase exist.
- `game-vision.md:11`: "relationships change"; `autonomous-characters.md:21`, "Directed relationships". Also blocks lifecycle's deferred relationship promotion and persuasion return (lifecycle.md §1).
- Also open, lower: shared sightings and player alliance commands and news (alliances.md deferred list), purchase news, inter-faction sale.

## 4. Ranked options

### 1 (recommended). Secession aftermath: peace, protection and membership

- **Cite:** `world-simulation.md:95`; `game-vision.md:13` ("creating a faction … enabling a rebellion").
- **Evidence:** secession spread 12 → 7 / 13 seeds combined; 21/53 factions portless and at permanent war; no peace path in `src/sim`.
- **Scope:** a seceded faction that has held its port for a survival window (threshold from the flag-off distribution of secession hold lengths) gets one of three material outcomes: *independence* recorded (war with the old faction ends, `faction-peace` event), *protection* (an alliance pact with a third faction via the existing `alliances.ts` causes), or *membership* (the port and members join a faction that is hostile to the old one and adjacent, a port change without a battle). Choice deterministic from treasury, grievance and threat; no AI, no RNG.
- **Flag:** `SECESSION_AFTERMATH`, default off, byte-identical pins.
- **Acceptance:** every outcome has a recorded cause and a held-window ≥ threshold; peace ends exactly the war between the two named factions; membership moves only that port and willing members; replay exact; pins; liveness (claims and port changes > 0 every seed, no new wipeouts); secessions on ≥ 6/13. Report only: outcome counts, port changes from membership, war-pairs over time.

### 2. Negotiated transfer and faction grant between factions

- **Cite:** `world-simulation.md:85`; `roadmap.md:26–28`.
- **Evidence:** claims and port changes are the metrics that fell most (−38 % / −35 %); purchase covers only neutral ports (one per seed, Verdant Cay).
- **Scope:** a faction that cannot hold a port (garrison below the raid floor, harsh occupation, treasury short of stipend reserve) cedes or sells it to an ally or the adjacent faction with the largest surplus over reserve (the #182 rule), payer, price and reason recorded. Grants: a holder grants an owned port to a governor. Reuses `port-transfer.ts`.
- **Flag:** extend `PORT_TRANSFER` with `transfer: "neutral" | "all"` or new `PORT_CESSION`, default off.
- **Acceptance:** every transfer valid (seller owns, buyer pays from treasury, price recorded), caused; replay; pins; liveness; secessions ≥ 6/13.

### 3. Directed relationships (goals and grudges) as material state

- **Cite:** `game-vision.md:11`; `autonomous-characters.md:17–21, 45`; lifecycle.md deferred items.
- **Evidence:** unblocks relationship promotion and persuasion return; nothing in the current layers changes between characters.
- **Scope:** larger: a per-pair score written by battles, captures, ransoms, shared pacts; read by lifecycle return and alliance causes. Needs a separate spec pass; lowest immediate dynamism.
- **Flag:** `RELATIONSHIPS`, default off. Acceptance: properties (every change from a recorded event), replay, pins, liveness, secessions ≥ 6/13.

**Recommendation:** option 1. It is the vision's own next step after secession, it creates port changes and power shifts without needing more battles, and it targets the one gate the combined flags have moved closest to the floor (secessions on 7/13).
