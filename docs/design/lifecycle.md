# Named-character lifecycle v1: promotion, retirement, return

Status: **Build-ready proposal** (option 3 of [next-after-layers.md](next-after-layers.md)), for the Lead's ruling. Source: [autonomous-characters.md:96-100](autonomous-characters.md), [roadmap.md](../roadmap.md) "Named-character lifecycle: Untracked".

Flag `LIFECYCLE`, default **off**. No AI and no RNG: every change is a deterministic function of world state and the tick's events. Flag off, the step never runs and `Character.lifecycle` never exists, so state hashes are byte-identical (pins 1847 `94de9c02`, 2718 `7a3741c9`, 4096 `af6eeaea` at t1200 reproduced).

Base: main `7834206` (#181). Defaults on that base: `EXILE_RECOVERY` on, `OCCUPATION` off, `ALLIANCES` off, `PORT_TRANSFER` off.

## 1. Causes and thresholds

All thresholds come from flag-off distributions on 13 seeds × 1,200 ticks (seeds 1847, 2718, 4096, 1000–10000 by 1000), measured by `lifecycle-proto/` (`flag-off-distributions.json`).

| Change | Material cause (recorded in `data.cause`) | Threshold | Justification |
| --- | --- | --- | --- |
| Watch opens | Captain's troops fall below `POWER_FLOOR` = 25 | 25 | The raid troop gate (`engine.ts` buildCandidates: `troops.count >= 25`). Below it a captain cannot raid, which is the game's own definition of lost fighting power. |
| **Retirement** | Troops < 25 continuously for `RETIRE_AFTER` ticks, and the captain is docked (not captive, not travelling) | 215 ticks | p90 of flag-off spells below 25 troops: 433 spells, p50 90, p75 92, p90 215, max 1,117. Ordinary dips (median 90) recover on their own; only the top decile counts as "substantial loss of power". |
| **Return: crisis** | While retired: an active battle at the character's port held by their faction, or their faction holds fewer ports than at retirement | none (state test) | "a crisis involving their home, faction" (autonomous-characters.md:100). Battle and port count are recorded material facts. |
| **Return: recovered** | While retired: troops ≥ 25 | 25 | "recovery of power". See §5: never fires in v1. |
| **Promotion** | An attacker victory this tick leaves the winning captain with ≥ `PROMOTE_TROOPS` troops, and the captain has not promoted in the last 240 ticks | 424 troops; cooldown 240 | p90 of the winner's troops after 783 flag-off attacker victories (p50 188, p75 316, max 799): "exceptional battle performance". Cooldown = the 240-tick promise window already used by exile recovery. |

Promotion creates a new named character: id `character-NN` (next free index), same faction, location and troop type as the captain, half the captain's troops (`floor(n/2)`), no money, no victories, no relationships, and `lifecycle.promotedFrom` = the captain. The captain keeps the other half. Not modelled in v1: promotion through a relationship or a town event, return through persuasion or a personal goal (need relationships/goals data that do not yet exist as material state).

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
| `character-retired` | captain | settlementId | `cause`, `watchSince`, `troops`, `portsAtRetire` |
| `character-returned` | captain | settlementId? | `cause` (`crisis: …` or `recovered: …`), `retiredTick`, `troops`, `factionPorts` |
| `character-promoted` | origin captain | targetId = new id, settlementId | `cause` (battle id/sequence and troops), `character` (full new record), `split`, `captainTroopsAfter` |

All state changes go through `applyEvent`, so replay from the log is exact. The step runs after alliance breaks and before `metrics-recorded` each tick, in id order.

## 4. Acceptance (gated)

1. Properties: every change carries a cause; retirement only with troops < 25 after ≥ 215 ticks of watch and not already retired; return only when retired, `recovered` only with troops ≥ 25; promotion ids never reused, faction kept, troops ≥ 424 split exactly, cooldown respected; no missed retirement when conditions hold; replay hash exact; flag-off pins match.
2. Liveness: claims and port changes > 0 on every seed, no new faction wipeouts (WG, Free Tide).
3. Secessions on at least 6 / 13 seeds.

Report only: counts per seed, active cast over time, claims / port changes / secessions off vs on.

## 5. Prototype results (13 seeds × 1,200 ticks, offline, $0)

Patch: `lifecycle-proto/prototype.patch` (adds `src/sim/lifecycle.ts`, hooks in `engine.ts`/`state.ts`, sweep and measurement scripts). Full table: `lifecycle-proto/sweep.txt`.

| Seed | Promotions | Retirements | Returns (all crisis) | Retired at t1200 | Active cast t0/300/600/900/1199 (off) | Claims off/on | Port changes off/on | Secessions off/on |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1847 | 1 | 12 | 9 | 3 | 30/28/28/29/27 (30/30/30/30/29) | 51/19 | 52/19 | 1/0 |
| 2718 | 1 | 7 | 4 | 3 | 30/26/26/24/26 (30/29/29/28/28) | 64/37 | 64/37 | 0/0 |
| 4096 | 2 | 3 | 3 | 0 | 30/30/29/30/31 (30/30/29/29/29) | 56/66 | 59/73 | 3/7 |
| 1000 | 4 | 7 | 5 | 2 | 30/28/26/27/29 (30/30/29/29/27) | 42/28 | 44/28 | 2/0 |
| 2000 | 5 | 8 | 6 | 2 | 30/25/28/29/31 (30/29/29/28/28) | 50/46 | 52/46 | 2/0 |
| 3000 | 0 | 6 | 1 | 5 | 30/26/25/24/24 (30/30/30/29/29) | 42/41 | 44/42 | 2/1 |
| 4000 | 3 | 9 | 8 | 1 | 30/29/28/29/30 (30/30/29/29/28) | 63/70 | 64/71 | 1/1 |
| 5000 | 3 | 5 | 3 | 2 | 30/28/27/28/28 (30/30/29/29/27) | 55/37 | 57/40 | 2/3 |
| 6000 | 1 | 12 | 8 | 3 | 30/23/26/25/26 (30/30/29/28/28) | 50/46 | 55/48 | 5/2 |
| 7000 | 2 | 1 | 1 | 0 | 30/30/29/29/30 (30/30/29/28/28) | 61/45 | 65/50 | 4/5 |
| 8000 | 1 | 6 | 2 | 4 | 30/28/24/25/25 (30/30/28/28/28) | 62/25 | 66/26 | 4/1 |
| 9000 | 5 | 4 | 4 | 0 | 30/30/30/33/35 (30/30/30/30/30) | 58/63 | 60/67 | 2/4 |
| 10000 | 2 | 10 | 7 | 3 | 30/27/27/26/28 (30/30/30/29/29) | 28/24 | 31/28 | 3/4 |
| **Total** | **30** | **90** | **61** | 28 | | **682/547** | **713/575** | **31/28** |

Gates: properties 0 violations, replay exact 13/13, pins match — **pass**. Liveness: min claims 19, min port changes 19, no new wipeouts — **pass**. Secessions on 9/13 seeds — **pass**.

Observations:
- Promotions on 12/13 seeds, retirements and returns on 13/13.
- Every return was a crisis return. `recovered` cannot fire: a retired captain does not act, so its troops never grow. 28 characters are still retired at t1200.
- Outcomes are sensitive to the retirement window, because retiring a captain switches the seed's trajectory. An earlier draft used 199 ticks (`sweep-retire199.txt`, a p90 computed without death-ended spells): claims 646, port changes 663, secessions 17 on 6/13 seeds. At the measured 215: claims 547, port changes 575, secessions 28 on 9/13. Both pass; neither is a tuning target.
- Claims drop 20 % (682 → 547), the same kind of emergent effect as occupation and alliances: fewer active weak captains.

## 6. Open decisions for the Lead

1. **Recovery return:** drop `recovered` from v1, or let a retired captain's port garrison or recruits refill them so it can fire?
2. **Retirement window:** accept p90 215 (death-ended spells included) or another percentile; the result is trajectory-sensitive.
3. **Promoted character name:** v1 uses `"<captain>'s lieutenant (character-NN)"`; a deterministic name list is a content decision.
4. **Promoting from a retired or captive captain's crew, and relationship / town-event promotion and persuasion / goal returns:** deferred until relationships and goals are material state.
5. **Governor retirement:** should a retiring governor vacate the office (feeding secession and offices), or keep it as in v1?
