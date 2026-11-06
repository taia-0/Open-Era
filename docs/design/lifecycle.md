# Named-character lifecycle v1: promotion, retirement, return

Status: **Revision 2** (Lead rulings 1–5 applied). **Build-ready proposal** (option 3 of [next-after-layers.md](next-after-layers.md)), for the Lead's ruling. Source: [autonomous-characters.md:96-100](autonomous-characters.md), [roadmap.md](../roadmap.md) "Named-character lifecycle: Untracked".

Flag `LIFECYCLE`, default **off**. No AI and no RNG: every change is a deterministic function of world state and the tick's events. Flag off, the step never runs and `Character.lifecycle` never exists, so state hashes are byte-identical (pins 1847 `94de9c02`, 2718 `7a3741c9`, 4096 `af6eeaea` at t1200 reproduced).

Base: main `3b6178d` (#182, merged into this branch). Defaults on that base: `EXILE_RECOVERY` on, `OCCUPATION` off, `ALLIANCES` off, `PORT_TRANSFER` off.

## 1. Causes and thresholds

All thresholds come from flag-off distributions on 13 seeds × 1,200 ticks (seeds 1847, 2718, 4096, 1000–10000 by 1000), measured by `lifecycle-proto/` (`flag-off-distributions.json`).

| Change | Material cause (recorded in `data.cause`) | Threshold | Justification |
| --- | --- | --- | --- |
| Watch opens | Captain's troops fall below `POWER_FLOOR` = 25 | 25 | The raid troop gate (`engine.ts` buildCandidates: `troops.count >= 25`). Below it a captain cannot raid, which is the game's own definition of lost fighting power. |
| **Retirement** | Troops < 25 continuously for `RETIRE_AFTER` ticks, and the captain is docked (not captive, not travelling) | 215 ticks | p90 of flag-off spells below 25 troops: 433 spells, p50 90, p75 92, p90 215, max 1,117. Ordinary dips (median 90) recover on their own; only the top decile counts as "substantial loss of power". Ruled (rev 2): kept at 215 as the p90 of prolonged weakness, not moved to tune claims or secessions. |
| **Office vacated** | A retiring captain who holds a port governor seat | — | Ruled (rev 2). Reuses `governor.ts` `syncSeats`: a retired governor is cleared like one who left the faction, and `appointGovernor` skips retired characters. The seat then refills by the existing succession (best leadership + loyalty, anchored, not the holder) or stays empty when nobody eligible is docked. |
| **Return: crisis** | While retired: an active battle at the character's port held by their faction, or their faction holds fewer ports than at retirement | none (state test) | "a crisis involving their home, faction" (autonomous-characters.md:100). Battle and port count are recorded material facts. |
| **Promotion** | An attacker victory this tick leaves the winning captain with ≥ `PROMOTE_TROOPS` troops, and the captain has not promoted in the last 240 ticks | 424 troops; cooldown 240 | p90 of the winner's troops after 783 flag-off attacker victories (p50 188, p75 316, max 799): "exceptional battle performance". Cooldown = the 240-tick promise window already used by exile recovery. |

Ruled (rev 2): crisis is the **only** return path. "Recovery of power" is not in v1: a retired captain takes no actions, so its troops never grow, and it needs a recruit or garrison path for retired captains that the game does not have yet. No refill rule is invented for it.

Promotion creates a new named character: id `character-NN` (next free index), visible name from the scenario's own naming formula (`scenario.ts` `firstNames`/`lastNames`, `name = first[i % 20] + last[(7i + 3·floor(i/20)) % 20]`, now exported) continued at the new index, taking the first name in that sequence not already used by any character. No RNG, so replay is exact. Same faction, location and troop type as the captain, half the captain's troops (`floor(n/2)`), no money, no victories, no relationships, and `lifecycle.promotedFrom` = the captain. The captain keeps the other half. Deferred (ruled): promotion through a relationship or a town event, and return through persuasion or a personal goal, until relationships and goals exist in game state.

A retired character is skipped in the per-character planning loop (no plans, raids or claims) but stays alive, in its faction and at its port. The human commander is never watched, retired or promoted from.

## 2. State

```ts
Character.lifecycle?: {
  watchSince?: number;                                   // tick troops fell below 25
  retired?: { tick: number; cause: string; portsAtRetire: number };
  lastPromotionTick?: number;
  promotedFrom?: string;                                 // origin captain id
}
```

The field is deleted when empty, so flag-off and "nothing happened" states hash the same.

## 3. Events

| Type | actorId | Other | data |
| --- | --- | --- | --- |
| `lifecycle-watch` | captain | | `since`, `troops` |
| `lifecycle-watch-cleared` | captain | | `since`, `troops` |
| `character-retired` | captain | settlementId | `cause`, `watchSince`, `troops`, `portsAtRetire`, `office` (port id of the seat held, or null) |
| `character-returned` | captain | settlementId? | `cause` (`crisis: …`), `retiredTick`, `troops`, `factionPorts` |
| `character-promoted` | origin captain | targetId = new id, settlementId | `cause` (battle id/sequence and troops), `character` (full new record), `split`, `captainTroopsAfter` |

All state changes go through `applyEvent`, so replay from the log is exact. The step runs after alliance breaks and before `metrics-recorded` each tick, in id order.

## 4. Acceptance (gated)

1. Properties: every change carries a cause; retirement only with troops < 25 after ≥ 215 ticks of watch and not already retired; return only when retired and only with a `crisis:` cause; promoted names are real names (`First Last` from the roster, unique, never a lieutenant template); a retiring governor's seat is no longer theirs on the next tick; promotion ids never reused, faction kept, troops ≥ 424 split exactly, cooldown respected; no missed retirement when conditions hold; replay hash exact; flag-off pins match.
2. Liveness: claims and port changes > 0 on every seed, no new faction wipeouts (WG, Free Tide).
3. Secessions on at least 6 / 13 seeds.

Report only: counts per seed, active cast over time, claims / port changes / secessions off vs on.

## 5. Prototype results, revision 2 (13 seeds × 1,200 ticks, offline, $0)

Patch on `3b6178d`: `lifecycle-proto/prototype.patch` (adds `src/sim/lifecycle.ts`; hooks in `engine.ts`, `state.ts`, `governor.ts`; exports the name lists in `scenario.ts`; sweep and measurement scripts). Full table with names: `lifecycle-proto/sweep.txt`. `sweep-retire199.txt` is the superseded rev-1 draft at 199 ticks.

| Seed | Promotions | Retirements | Returns (all crisis) | Retired at t1200 | Active cast t0/300/600/900/1199 (off) | Claims off/on | Port changes off/on | Secessions off/on | Offices vacated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1847 | 1 | 12 | 9 | 3 | 30/28/28/29/27 (30/30/30/30/29) | 51/19 | 52/19 | 1/0 | 0 |
| 2718 | 1 | 7 | 3 | 4 | 30/26/26/24/25 (30/29/29/28/28) | 64/35 | 64/35 | 0/0 | 0 |
| 4096 | 2 | 3 | 3 | 0 | 30/30/29/30/31 (30/30/29/29/29) | 56/66 | 59/73 | 3/7 | 0 |
| 1000 | 4 | 7 | 5 | 2 | 30/28/26/27/29 (30/30/29/29/27) | 42/28 | 44/28 | 2/0 | 0 |
| 2000 | 5 | 8 | 6 | 2 | 30/25/28/29/31 (30/29/29/28/28) | 50/46 | 52/46 | 2/0 | 0 |
| 3000 | 0 | 6 | 1 | 5 | 30/26/25/24/24 (30/30/30/29/29) | 42/41 | 44/42 | 2/1 | 0 |
| 4000 | 3 | 7 | 5 | 2 | 30/29/28/27/29 (30/30/29/29/28) | 63/65 | 64/69 | 1/4 | 0 |
| 5000 | 4 | 5 | 3 | 2 | 30/28/28/30/29 (30/30/29/29/27) | 55/50 | 57/50 | 2/0 | 0 |
| 6000 | 2 | 12 | 8 | 3 | 30/23/26/25/27 (30/30/29/28/28) | 50/58 | 55/60 | 5/2 | 1 (seat left empty) |
| 7000 | 2 | 1 | 1 | 0 | 30/30/29/29/30 (30/30/29/28/28) | 61/45 | 65/50 | 4/5 | 0 |
| 8000 | 1 | 6 | 2 | 4 | 30/28/24/25/25 (30/30/28/28/28) | 62/25 | 66/26 | 4/1 | 0 |
| 9000 | 5 | 5 | 5 | 0 | 30/30/30/33/35 (30/30/30/30/30) | 58/57 | 60/63 | 2/6 | 0 |
| 10000 | 2 | 10 | 7 | 3 | 30/27/27/26/28 (30/30/30/29/29) | 28/24 | 31/28 | 3/4 | 0 |
| **Total** | **32** | **89** | **58** | 30 | | **682/559** | **713/589** | **31/30** | **1** |

Names given, in order of promotion within a seed: Rook Pike, Lio Vane, Ada Quill, Pax Wren, Mina Morrow (the formula at indices 30–34; none clash with the starting cast).

Gates: properties 0 violations (names, crisis-only returns, seat vacated, ids, cooldown, no missed retirement), replay exact 13/13, flag-off pins 1847 `94de9c02`, 2718 `7a3741c9`, 4096 `af6eeaea` match on `3b6178d` — **pass**. Liveness: min claims 19, min port changes 19, no new wipeouts — **pass**. Secessions on 8/13 seeds — **pass**.

Observations:
- Only 1 of 89 retirements held a governor seat (seed 6000); nobody eligible was docked there, so it stayed empty. Weak captains are rarely seated governors.
- Claims drop 18 % (682 → 559) as an emergent effect; seeds 1847 and 8000 lose most.

## 6. Open decisions for the Lead

1. Promoted names repeat across seeds (the first promotion is always Rook Pike), because the formula is index-based and the cast starts identical on every seed. Accept, or offset the roster by seed (still deterministic)?
2. An emptied governor seat refills only when an eligible captain is docked at the port; should a returning governor reclaim it, or compete like anyone else (v1: like anyone else)?
3. Deferred, unchanged: recovered return (needs a recruit/garrison path), relationship/town-event promotion, persuasion/goal returns.
