# Secession aftermath v1: peace, protection, membership

Status: **Revision 2** (Lead rulings 1–5 applied). **Build-ready proposal** (#186 option 1, Lead ruling: peace is bilateral). Source: [world-simulation.md:95](world-simulation.md): "If the settlement survives a time threshold or makes peace, the owner may remain independent, found a new faction, or seek protection or membership elsewhere." Draft: [after-lifecycle.md](after-lifecycle.md) §4.1.

Flag `SECESSION_AFTERMATH` (run option `secessionAftermath`), default **off**. No AI, no RNG. Flag off, nothing runs and `world.secessionAftermath` never exists; pins 1847 `94de9c02`, 2718 `7a3741c9`, 4096 `af6eeaea` at t1200 reproduce. Base: main `433cbb4` (#186).

## 1. Measured baseline (flag off, 13 seeds × 1,200 ticks)

`secession-aftermath-proto/flag-off-holds.json`. 31 secessions; **all 31 seceded ports were lost**, none was still held at t1200. Hold (declaration → port leaves the seceded faction), sorted: 1, 1, 2, 2, 3, 3, 4, 5, 7, 7, 9, 11, 14, 22, 22, 22, 22, 35, 36, 40, 41, 44, 46, 47, 51, 55, 62, 67, 73, 86, 97. Median 22, p75 47, p90 67, max 97. 8 of 31 were retaken by the old faction, 23 taken by another faction. 29 of 31 saw exactly one raid before falling.

Port distances (scenario positions): cinder-key–glassport 23.345, glassport–verdant-cay 25.807, then 43.829 and above.

## 2. Rules (revision 2)

**Survival window `AFTERMATH_WINDOW` = 67 ticks**: the p90 flag-off hold (ruled). "Held long enough" means longer than almost every seceded port that was lost (28 of 31 fell sooner); not chosen for counts. Rev 1's median (22) put 16 of 37 outcomes on the window tick.

**Two radii, explicitly:**
- `PATRON_NEAR` = 43.829 (ruled): the next inter-port distance (Crown Harbor–Glassport). Used for **patron search only**, for both protection and join.
- `ALLIANCE_NEAR` = 30, unchanged, for everything else: the threat's "near" test here, and all alliance uses (causes, joint-battle joiners). The threat stays at 30 because widening it would make every Glassport and Crown Harbor port permanently "threatened", which is a different rule from finding a patron.

**Hostile**: there is no war table; hostility = different faction (`engine.ts` `hostileTerritory`). v1 *friendly(a, b)* = same faction, a live `faction-peace` record, or an alliance pact; hostile = not friendly. The raid and claim gate treats live peace like a pact.

**Threat** to seceded faction S at port P: the latest hostile raider of S within `ALLIANCE_RAID_WINDOW` = 152, else the hostile holder of the nearest port within 30 of P.

**Patrons** for S: alive, holding a port within 43.829 of P, not S, not the old faction O, not the threat, hostile to both O and the threat, and **surplus over reserve ≥ 0** (ruled: a broke faction cannot protect). Ranked by surplus (#182 rule), then id.

Every tick, for each seceded faction still holding its port with age ≥ 67, in declaration order:

1. **Peace break** (first, for every live peace): if either party raided the other after the peace tick (the raid ledger, `battle-started` or an immediate `battle-resolved`), emit `faction-peace-broken` with the raider, target and raid tick. No choice-break in v1.
2. **Peace** (once per secession): O alive, earned grievance of S's owner at O's command holder < 0.12 (the reused secession "hated" gate: a guard, ruled kept), and no O raid on S within 152.
3. **Protection** (once, S in no pact): threat and patron exist, S's own surplus ≥ 0. Pact S + top patron against the threat.
4. **Join**: same, S's own surplus < 0. Members, ports and treasury move to the top patron.

## 3. State

```ts
WorldState.secessionAftermath?: {
  records: { factionId; settlementId; oldFactionId; ownerId; declaredTick; peaceTick?; protectionTick?; joinedTick? }[];
  peace: { factionIds: [string, string]; tick: number; cause: string }[];
}
```

Protection and join events also carry `patron {factionId, port, distance, surplus}` and `ownSurplus`.

Protection uses the alliances module's `Alliance` record (`world.alliances`), with id `protection-<tick>-<S>-<patron>`. Cleaner than a second record: joint battles, joiner losses and the three break rules (ally-gone, enemy-portless, ally-attack) apply unchanged. With alliances off, `allianceBreaks` and the joint-battle and hostility checks run when either flag is on (`alliancesOn || aftermathOn`); `allianceForms` still runs only under `ALLIANCES`, so with alliances off the only pacts are protection pacts.

## 4. Events

| Type | Fields | Effect |
| --- | --- | --- |
| `aftermath-ledger-opened` | — | creates the empty state (first flag-on tick) |
| `aftermath-watch` | settlementId; `record` | one per `secession-declared` |
| `faction-peace-broken` | `factionIds`, `peaceTick`, `reason: "raid"`, `evidence {raiderFactionId, targetFactionId, raidTick}`, `cause` | removes that peace record; the pair is hostile again |
| `faction-peace` | settlementId; `peace {factionIds [S, O], tick, cause}`, `grievance`, `lastOldRaid`, `age` | adds the peace record. Only S and O become non-hostile; every other war of each continues |
| `alliance-formed` with `aftermath: "protection"` | the `Alliance`, `causes[S]` (held, threat, own surplus) and `causes[patron]` (port, distance, hostility, surplus) | the pact, via `applyAllianceEvent` |
| `secession-joined` | actorId owner, targetId patron, settlementId; `factionId`, `joinedFactionId`, `oldFactionId`, `memberIds`, `ports`, `treasury`, `cause` | members' and ports' `factionId` → patron, S treasury → patron, occupation cleared. An owner change without a battle; counted as a port change |

## 5. Acceptance (gated)

1. Every outcome is caused and has age ≥ 67. Peace is exactly [S, O], grievance < 0.12, and bilateral: no other pair becomes friendly. Every raid across a live peace emits `faction-peace-broken` in the same tick, with evidence that matches. Protection: a patron ≠ O with surplus ≥ 0 within 43.829, and both causes. Join: the patron holds a port within 43.829, is ≠ O, hostile to O, has surplus ≥ 0, and every member and port moved.
2. Flag-off pins match; replay is exact.
3. Liveness: claims and port changes > 0 on every seed, no new wipeouts.
4. Secessions on ≥ 6 / 13 seeds.

## 6. Prototype results, revision 2 (13 seeds × 1,200 ticks, offline)

Patch: `secession-aftermath-proto/prototype.patch` on `433cbb4`. Tables: `sweep-defaults.txt`, `sweep-all-flags.txt`. Port changes "on" include joins.

**Main defaults** (exile recovery on, others off):

| Seed | Peace | Peace broken | Protection | Join | Age at outcome | Secessions off/on | Claims off/on | Port changes off/on | Battles off/on |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1847 | 1 | 0 | 0 | 0 | 274 | 1/1 | 51/51 | 52/52 | 74/74 |
| 2718 | 0 | 0 | 0 | 0 | — | 0/0 | 64/64 | 64/64 | 81/81 |
| 4096 | 3 | 0 | 0 | 0 | 71, 170, 351 | 3/3 | 56/54 | 59/57 | 81/78 |
| 1000 | 0 | 0 | 0 | 0 | — | 2/2 | 42/42 | 44/44 | 69/69 |
| 2000 | 1 | 0 | 0 | 0 | 340 | 2/2 | 50/50 | 52/52 | 72/72 |
| 3000 | 1 | 0 | 0 | 0 | 157 | 2/1 | 42/38 | 44/39 | 58/55 |
| 4000 | 1 | 0 | 0 | 0 | 189 | 1/1 | 63/61 | 64/62 | 79/77 |
| 5000 | 1 | 0 | 0 | 0 | 67 | 2/2 | 55/57 | 57/59 | 71/73 |
| 6000 | 2 | 0 | 0 | 0 | 295, 345 | 5/4 | 50/47 | 55/51 | 65/63 |
| 7000 | 2 | 0 | 0 | 0 | 141, 269 | 4/4 | 61/61 | 65/65 | 78/78 |
| 8000 | 2 | 0 | 0 | 0 | 67, 133 | 4/2 | 62/33 | 66/35 | 76/47 |
| 9000 | 2 | 0 | 0 | 1 | 67, 93, 130 | 2/3 | 58/47 | 60/51 | 78/67 |
| 10000 | 3 | 0 | 1 | 1 | 135, 135, 205, 315, 350 | 3/3 | 28/23 | 31/27 | 45/40 |
| **Total** | **19** | **0** | **1** | **2** | | **31/28** | **682/628** | **713/658** | **927/874** |

Seed spread: secessions on 12/13 off, 12/13 on. The one protection pact later broke (alliance rules).

**Combined** (occupation + alliances + portTransfer + lifecycle, off vs plus `secessionAftermath`): claims 421 → 414, port changes 461 → 457, secessions 27 → 29 on 7/13 seeds (7/13 off), battles 766 → 757; 16 peace, 0 broken, 3 protection (all 3 later broke), 1 join.

Ages at outcome (defaults): 67 ×3, 71, 93, 130, 133, 135, 135, 141, 157, 170, 189, 205, 269, 274, 295, 315, 340, 345, 350, 351. Combined: 67 ×11, then 85–708.

**Gates, both runs:** 0 violations, replay exact 13/13, pins 1847 `94de9c02`, 2718 `7a3741c9`, 4096 `af6eeaea` match, min claims 23 (13 combined), min port changes 27 (15), no new wipeouts, secessions on 12/13 (7/13) — **pass**.

### Joins: they fire (2 on defaults, 1 combined)

Joins fired on seeds 9000 and 10000 (defaults). Where they didn't, the per-evaluation counters (one count per eligible faction per tick, defaults run) show why:

| Stage | Defaults | Combined |
| --- | --- | --- |
| Evaluations (S holds its port, age ≥ 67, no pact) | 3,174 | 1,367 |
| Threatened | 2,139 | 1,080 |
| With an in-range (≤ 43.829) faction | 901 | 523 |
| … left after the hostility rule (≠ O, ≠ threat, hostile to both) | 4 | 12 |
| … left after surplus ≥ 0 | 3 | 4 |
| S insolvent (surplus < 0) and threatened | 272 | 145 |
| … no faction in range | 251 | 101 |
| … killed by the hostility rule | 19 | 42 |
| … killed by the patron-surplus rule | 0 | 1 |

So the binding filter is mostly **no insolvent neighbour in range** (an insolvent S at Crown Harbor or Cinder Key whose only neighbour within 43.829 is Glassport, held by O or the threat), then **the hostility rule**. The 43.829 radius did unlock the joins that fired.

## 7. Open decisions for the Lead

1. **Peace never broke (0 / 19 and 0 / 16).** Live peace removes the pair from the autonomous raid gate (`hostileTerritory`), so only a path that skips that gate can raid across it; player-command attacks (`engine.ts` player raid at ~2860 checks only "different faction") are the only one. Either accept this (the break is a guard for players and future AI), or let peace not block raids, so that a break is possible and observable autonomously.
2. **The hostility rule** removes 897 of 901 in-range candidate evaluations, because the in-range port is usually held by O or the threat. That is the rule as written; flag it only if the Lead wants third parties to be the rare case.
3. Peace and protection: only one each per secession in v1 (no re-peace after a break).
