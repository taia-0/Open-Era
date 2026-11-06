# Secession aftermath v1: peace, protection, membership

Status: **Build-ready proposal** (#186 option 1, Lead ruling: peace is bilateral). Source: [world-simulation.md:95](world-simulation.md): "If the settlement survives a time threshold or makes peace, the owner may remain independent, found a new faction, or seek protection or membership elsewhere." Draft: [after-lifecycle.md](after-lifecycle.md) §4.1.

Flag `SECESSION_AFTERMATH` (run option `secessionAftermath`), default **off**. No AI, no RNG. Flag off, nothing runs and `world.secessionAftermath` never exists; pins 1847 `94de9c02`, 2718 `7a3741c9`, 4096 `af6eeaea` at t1200 reproduce. Base: main `433cbb4` (#186).

## 1. Measured baseline (flag off, 13 seeds × 1,200 ticks)

`secession-aftermath-proto/flag-off-holds.json`. 31 secessions; **all 31 seceded ports were lost**, none was still held at t1200. Hold (declaration → port leaves the seceded faction), sorted: 1, 1, 2, 2, 3, 3, 4, 5, 7, 7, 9, 11, 14, 22, 22, 22, 22, 35, 36, 40, 41, 44, 46, 47, 51, 55, 62, 67, 73, 86, 97. Median 22, p75 47, p90 67, max 97. 8 of 31 were retaken by the old faction, 23 taken by another faction. 29 of 31 saw exactly one raid before falling.

Port distances (scenario positions): cinder-key–glassport 23.345, glassport–verdant-cay 25.807, then 43.829 and above.

## 2. Rules

**Survival window `AFTERMATH_WINDOW` = 22 ticks**: the median flag-off hold. A seceded port that is still held when half of all seceded ports have already fallen has, by the data, survived. It is not chosen for frequency. p75 (47) and p90 (67) are listed in §6 as alternatives.

**Nearby**: a port within `ALLIANCE_NEAR` = 30 (alliances.md, the gap between 25.807 and 43.829). It still fits: the distances are unchanged. Consequence: only Glassport has neighbours (Cinder Key; Verdant Cay, neutral unless purchased), so a Crown Harbor secession can make peace but cannot find a protector or a faction to join.

**Hostile**: there is no war table in the code; hostility is "different faction" (`engine.ts` `hostileTerritory`), minus alliance pacts when alliances are on. v1 defines *friendly(a, b)* = same faction, or a `faction-peace` record between them, or an alliance pact. Hostile = not friendly. The raid and claim gate in `engine.ts` treats peace exactly like a pact.

**Threat** to a seceded faction S at port P: the latest hostile faction to raid S within `ALLIANCE_RAID_WINDOW` = 152 (alliances.md, p90 raid gap), else the hostile holder of the nearest port within 30 of P.

**Patron candidates** for S: alive, holding a port within 30 of P, not S, not the old faction O, not the threat, and hostile to both O and the threat. Ranked by surplus over reserve (#182 rule: treasury − 18 × (free mates + ports)), then id.

Every tick, for each seceded faction still holding its port with age ≥ 22, in declaration order:

1. **Peace** (once): O is alive, S's owner's *earned* grievance at O's command holder is < 0.12, and O has not raided S within 152 ticks. 0.12 is the existing secession "hated" gate (`secession.ts`), so a grievance that could justify seceding also blocks peace. Measured at the window (probe, 19 records on 7 seeds): earned grievance −0.030 to 0.090, so the gate did not bind in this sample; the raid test did.
2. **Protection** (once, S in no pact): a threat and at least one patron exist, and S's own surplus ≥ 0 (it can pay its own reserve). Forms an alliance pact S + top patron against the threat.
3. **Membership (join)**: same, but S's surplus < 0 (it cannot carry its own reserve). S's members and ports join the top patron. Measured at the window: surplus −36.29 to 227.96; 2 of 19 negative, and neither had a patron.

Peace and protection can both happen to one faction; a join ends it.

## 3. State

```ts
WorldState.secessionAftermath?: {
  records: { factionId; settlementId; oldFactionId; ownerId; declaredTick; peaceTick?; protectionTick?; joinedTick? }[];
  peace: { factionIds: [string, string]; tick: number; cause: string }[];
}
```

Protection uses the alliances module's `Alliance` record (`world.alliances`), with id `protection-<tick>-<S>-<patron>`. Cleaner than a second record: joint battles, joiner losses and the three break rules (ally-gone, enemy-portless, ally-attack) apply unchanged. With alliances off, `allianceBreaks` and the joint-battle and hostility checks run when either flag is on (`alliancesOn || aftermathOn`); `allianceForms` still runs only under `ALLIANCES`, so with alliances off the only pacts are protection pacts.

## 4. Events

| Type | Fields | Effect |
| --- | --- | --- |
| `aftermath-ledger-opened` | — | creates the empty state (first flag-on tick) |
| `aftermath-watch` | settlementId; `record` | one per `secession-declared` |
| `faction-peace` | settlementId; `peace {factionIds [S, O], tick, cause}`, `grievance`, `lastOldRaid`, `age` | adds the peace record. Only S and O become non-hostile; every other war of each continues |
| `alliance-formed` with `aftermath: "protection"` | the `Alliance`, `causes[S]` (held, threat, own surplus) and `causes[patron]` (port, distance, hostility, surplus) | the pact, via `applyAllianceEvent` |
| `secession-joined` | actorId owner, targetId patron, settlementId; `factionId`, `joinedFactionId`, `oldFactionId`, `memberIds`, `ports`, `treasury`, `cause` | members' and ports' `factionId` → patron, S treasury → patron, occupation cleared. An owner change without a battle; counted as a port change |

## 5. Acceptance (gated)

1. Every outcome carries a cause and age ≥ 22. Peace: exactly [S, O], grievance < 0.12, and no raid between S and O after it. Peace is bilateral: no other pair becomes friendly. Protection: the pact holds S and a patron ≠ O, with both causes. Join: the patron holds a port within 30, is ≠ O and hostile to O, and every member and port has moved.
2. Flag-off pins match; replay from the log is exact.
3. Liveness: claims and port changes > 0 on every seed, and no new wipeouts.
4. Secessions on ≥ 6 / 13 seeds.

## 6. Prototype results

Patch: `secession-aftermath-proto/prototype.patch`, which adds `src/sim/secession-aftermath.ts` and `scripts/diag/aftermath-{measure,sweep}.ts`, with hooks in `engine.ts` and `state.ts`. Main defaults (exile recovery on, the other flags off); the all-flags table is in `sweep-all-flags.txt`.

| Seed | Peace | Protection | Join | Age at each outcome | Secessions off/on | Claims off/on | Port changes off/on | Battles off/on |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1847 | 1 | 0 | 0 | 274 | 1/1 | 51/51 | 52/52 | 74/74 |
| 2718 | 0 | 0 | 0 | — | 0/0 | 64/64 | 64/64 | 81/81 |
| 4096 | 5 | 1 | 0 | 22, 22, 22, 65, 22, 36 | 3/6 | 56/42 | 59/48 | 81/69 |
| 1000 | 0 | 0 | 0 | — | 2/2 | 42/42 | 44/44 | 69/69 |
| 2000 | 2 | 0 | 0 | 43, 43 | 2/2 | 50/53 | 52/55 | 72/74 |
| 3000 | 1 | 0 | 0 | 157 | 2/1 | 42/38 | 44/39 | 58/55 |
| 4000 | 1 | 0 | 0 | 189 | 1/1 | 63/61 | 64/62 | 79/77 |
| 5000 | 1 | 0 | 0 | 22 | 2/2 | 55/57 | 57/59 | 71/73 |
| 6000 | 1 | 0 | 0 | 22 | 5/2 | 50/36 | 55/38 | 65/52 |
| 7000 | 3 | 1 | 0 | 22, 262, 269, 124 | 4/4 | 61/57 | 65/61 | 78/76 |
| 8000 | 3 | 2 | 0 | 22, 22, 500, 95, 355 | 4/4 | 62/33 | 66/37 | 76/47 |
| 9000 | 6 | 1 | 0 | 22, 22, 22, 44, 158, 22, 348 | 2/6 | 58/65 | 60/71 | 78/84 |
| 10000 | 4 | 4 | 0 | 22, 22, 33, 22, 29, 427, 546, 552 | 3/4 | 28/26 | 31/30 | 45/45 |
| **Total** | **28** | **9** | **0** | | **31/35** | **682/625** | **713/660** | **927/876** |

Secession seed spread: 12/13 off, 12/13 on. 8 of the 9 protection pacts later broke under the alliance rules. Ages at an outcome: 16 at exactly 22; the longest was 552, because flag-on ports now survive far past the flag-off maximum of 97.

All four slice flags plus this one (`sweep-all-flags.txt`): claims 421 → 396, port changes 461 → 431, secessions 27 → 22 on 7/13 seeds (7/13 off), 18 peace, 4 protection, 0 joins; all gates pass.

Gates, both runs: 0 violations, replay exact 13/13, pins match, min claims 26 (13 with all flags), min port changes 30 (15), no new wipeouts, secessions on 12/13 (7/13) — **pass**.

## 7. Open decisions for the Lead

1. **Join never fires.** A seceded faction that cannot meet its reserve has never had a hostile-to-old neighbour within 30: the only neighbour pairs involve Glassport, and the Cinder Key holder is usually the old faction or the threat itself. Options: accept (a property of the map); widen "nearby" for joins only (the next distance is 43.829); or trigger a join on another cause (for example, the threat raided S and S's garrison is below the raid floor).
2. **Window percentile:** median 22 (v1), or p75 47 / p90 67. Choose by meaning, not by count.
3. **Grievance gate** 0.12 never bound at the window in the probe (max 0.090). Keep it as the reuse of the secession gate, or measure grievance later in the hold.
4. **Protector with a negative surplus** (seen: Cinder Key secession factions at −36 and −28.81 protecting Glassport). Should a patron need surplus ≥ 0?
5. Peace is permanent in v1, with no break rule. Should a later raid by either side, or a choice, break it?
