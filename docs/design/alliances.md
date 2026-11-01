# Alliances

Status: Build-ready spec, v1 (Researcher, 2026-11-01). It is option 1 of [next after the layers](next-after-layers.md) (#178), chosen by the Lead. It replaces the earlier Open brief: read that at `178662c:docs/design/alliances.md`, which was measured when only two factions ever existed. Behind `ALLIANCES`, default off. Deterministic: no RNG draw and no AI.

**Prototype.** The prototype is [alliances-proto/prototype.patch](alliances-proto/prototype.patch): `src/sim/alliances.ts`, plus hooks in `engine.ts` and `state.ts`, plus `scripts/diag/alliance-sweep.ts`, applied to `main` `9457107`. It ran offline on 13 seeds (1847, 2718, 4096, 1000, 2000, …, 10000) × 1,200 ticks, with the defaults (EXILE_RECOVERY on, OCCUPATION off), alliances off and then on. Output: [alliances-proto/sweep.txt](alliances-proto/sweep.txt). Spend: $0.

## 1. Why

[Next after the layers](next-after-layers.md) measured the world on `115561e`:
- 25 of 57 factions are portless at t1200, holding 45 living members;
- there are 0 alliance events, so every war has two sides;
- secessions fade to 2–4 per 200 ticks.

The vision names alliances directly: `game-vision.md:13`, "creating a faction, breaking an alliance, enabling a rebellion". `roadmap.md:23` lists them as Untracked.

## 2. Cause to pact (formation)

**When.** On the faction clock: `t > 0` and `t % 24 === 0`, after `declareAutonomousSecessions`. Factions are taken in id order. Only factions with at least one living member take part.

**Who.** Pairs (P, Q) with P < Q by id. Neither may already be in a pact (v1: at most one pact per faction). The pair must not be in a cooldown (§4).

**The shared enemy E.**
- Candidates are the other living factions that hold at least one port, ordered by port count descending, then by id.
- The first E for which **both** P and Q have a cause forms the pact. Nothing else forms one.

**Causes** (cause(F, E), checked in this order; the first that holds is recorded as a string):
1. **`landless`:** F holds no port while E holds at least one.
2. **`near`:** F and E each hold a port, and some E port is within 23.345 of an F port. 23.345 is the closest port pair, Cinder Key to Glassport (`178662c` brief §4).

No treasury test, no raid-history test and no holder vote in v1. Each would need new stored history or a holder model; they are listed under §7.

## 3. Effects

- **No raids or claims between allies.** In `buildCandidates`, `hostileTerritory` is false when the port's faction is allied to the actor's faction. Neither the raid row nor the claim row is offered.
- **Battles already open finish.** A battle that started before the pact is not rewound (see `ally-attack` in §4).
- **Unchanged:** no joint battles, no shared sightings and no treasury transfer. Those are later slices.

## 4. Break conditions

Breaks are evaluated at the **end of every tick**, just before `metrics-recorded`, for each pact in order. The first condition that holds breaks the pact:

| Reason | Measured condition at that point |
|---|---|
| `ally-gone` | One allied faction has no living member |
| `enemy-portless` | E holds no port. The reason the pair allied is gone |
| `ally-attack` | An active battle has an attacker from one ally at a port held by the other. This can only be a battle that started before the pact |

**Cooldown.** After a break, the pair may not re-form for 240 ticks (`allianceMemory`). This is the promise window and exile half-life already used elsewhere.

There is no timer break, and no break because one side became stronger (`game-vision.md:39`).

## 5. State and events

**State**, all on `WorldState` and omitted while empty, so a flag-off world hashes as before:
- `alliances?: Array<{ id, factionIds: [P, Q], enemyFactionId, formedTick, causes: { [factionId]: string } }>`
- `allianceMemory?: Array<{ factionIds: [P, Q], brokenTick }>`

The Engineer should prune memory entries older than 240 ticks. The prototype keeps them all.

**Events**, flag on only:
- **`alliance-formed`:** `data.alliance` is the full record above. The id is `alliance-<tick>-<P>-<Q>`.
- **`alliance-broken`:** `data: { allianceId, factionIds, enemyFactionId, reason, evidence }`. The evidence depends on the reason:
  - `ally-gone`: `{ aliveX, aliveY }`;
  - `enemy-portless`: `{ enemyFactionId, enemyPorts: 0 }`;
  - `ally-attack`: `{ battleId, attackerId, settlementId }`.

`applyEvent` stores and removes the records, so replay rebuilds them from the tape.

**Run option** `alliances: true`, with `ALLIANCES_DEFAULT = false`. Add CLI flags `--alliances` / `ALLIANCES=1` when built.

## 6. Acceptance (properties; floors are liveness only, not tuning targets)

1. **Flag off is byte-identical** to the default pins: 72 ticks `7f76e474` / `976c40bd` / `08943ea5`, and 1,200 ticks `94de9c02` / `7a3741c9` / `af6eeaea`.
2. **Every pact has a recorded cause** for both factions.
3. **Every break follows its specified condition.** The condition is re-checked on the world at the break, and no pact is ever alive at a tick's end while its break condition holds.
4. **No raid starts between allies** while a pact is in force.
5. **Liveness floors:**
   - pacts form on at least 7 / 13 seeds, and at least one pact breaks on at least 5 / 13;
   - claims > 0 and port changes > 0 on every seed, with no new wipeouts;
   - secessions on at least 6 / 13 seeds.

## 7. Prototype results (13 seeds × 1,200 ticks)

| Seed | Off end hash | Forms | Breaks (reasons) | Claims off / on | Port changes off / on | Battles off / on | Secessions off / on | Violations |
|---|---|---|---|---|---|---|---|---|
| 1847 | `94de9c02` (pin) | 1 | 1 (enemy-portless 1) | 51 / 51 | 52 / 52 | 73 / 73 | 1 / 1 | 0 |
| 2718 | `7a3741c9` (pin) | 0 | 0 | 64 / 64 | 64 / 64 | 62 / 62 | 0 / 0 | 0 |
| 4096 | `af6eeaea` (pin) | 11 | 9 (enemy-portless 9) | 56 / 58 | 59 / 61 | 63 / 64 | 3 / 3 | 0 |
| 1000 | `5f303e45` | 2 | 2 (enemy-portless 1, ally-gone 1) | 42 / 42 | 44 / 44 | 72 / 72 | 2 / 2 | 0 |
| 2000 | `3dec6c14` | 6 | 6 (enemy-portless 6) | 50 / 50 | 52 / 52 | 74 / 74 | 2 / 2 | 0 |
| 3000 | `945a5b23` | 2 | 1 (enemy-portless 1) | 42 / 42 | 44 / 44 | 50 / 50 | 2 / 2 | 0 |
| 4000 | `05583438` | 1 | 1 (enemy-portless 1) | 63 / 63 | 64 / 64 | 74 / 74 | 1 / 1 | 0 |
| 5000 | `ad712dfa` | 4 | 4 (enemy-portless 4) | 55 / 49 | 57 / 51 | 60 / 55 | 2 / 2 | 0 |
| 6000 | `020028d7` | 5 | 4 (enemy-portless 4) | 50 / 51 | 55 / 54 | 41 / 43 | 5 / 3 | 0 |
| 7000 | `9638fa13` | 7 | 5 (enemy-portless 4, ally-gone 1) | 61 / 61 | 65 / 65 | 67 / 67 | 4 / 4 | 0 |
| 8000 | `6e74df8b` | 16 | 14 (enemy-portless 14) | 62 / 55 | 66 / 59 | 60 / 55 | 4 / 4 | 0 |
| 9000 | `450acb6b` | 6 | 6 (enemy-portless 6) | 58 / 58 | 60 / 60 | 71 / 71 | 2 / 2 | 0 |
| 10000 | `a1567d5f` | 2 | 1 (enemy-portless 1) | 28 / 25 | 31 / 28 | 35 / 33 | 3 / 3 | 0 |
| **Total** | | **63** | **54** | **682 / 669** | **713 / 698** | **802 / 793** | **31 / 29** | **0** |

Flag off also reproduces the 72-tick pins `7f76e474` / `976c40bd` / `08943ea5` with the patch applied.

| Check | Result | Pass |
|---|---|---|
| 1. Flag off = pins | 1,200- and 72-tick pins match on 1847 / 2718 / 4096 | yes |
| 2. Cause recorded | 63 / 63 pacts; 126 / 126 causes are `landless` | yes |
| 3. Breaks match their condition | 0 violations; enemy-portless 52, ally-gone 2, ally-attack 0 | yes |
| 4. No raid on an ally | 0 | yes |
| 5. Forms on at least 7 / 13 | 12 / 13 (none on 2718) | yes |
| 5. Breaks on at least 5 / 13 | 12 / 13 | yes |
| 5. Claims and port changes > 0 | minimum 25 claims and 28 port changes (10000) | yes |
| 5. No new wipeouts | none | yes |
| 5. Secessions on at least 6 / 13 | 12 / 13 | yes |

Pact duration has n = 54 broken pacts, min 4, median 53 and max 301 ticks. 9 pacts are still in force at t1200.

**Readings**
- **Every pact so far is two landless factions against a port holder.** Mostly these are portless breakaways and Free Tide. `near` never fired: with four ports, both sides being near the same enemy while each holds a port did not occur.
- **The no-raid effect is therefore rarely in play.** Two portless allies have no port to spare each other. The totals move a little, from a few seeds: claims 682 → 669 and battles 802 → 793. This is emergent, not a target.
- **The pacts do give the portless breakaways a recorded political relationship, and they end on a measured cause.** In most cases that cause is that the shared enemy lost its last port.

## 8. Open decisions for the Lead

1. Add a raid-history cause, for example "E started a battle at F's port in the last 240 ticks". It needs a stored per-pair tick.
2. Let allies join battles, or share sightings (old brief §2), as a slice 2.
3. Player commands `propose-alliance` / `break-alliance` (old brief §1), and whether a pact is public news.
4. Should a break carry a loyalty or grievance cost (old brief §3, 0.04)? It is not in v1.

## 9. Diagnosis for the port-transfer slice: why Verdant Cay is never raided or claimed

**By construction, no autonomous character can raid or claim a neutral port.** In `buildCandidates` (`engine.ts`, the `hostileTerritory` line), `hostileTerritory` requires `settlement.factionId !== null`. Both the `raid` row and the `claim-settlement` row require `hostileTerritory`. Verdant Cay starts with `factionId: null` (`createPrototypeWorld`), so it never gets either row. Its garrison of 70 is not the reason.

The measurements agree:
- Over the 13 seeds × 1,200 ticks on main defaults, Verdant Cay had 0 battles, 0 claims and 0 ticks with an owner ([verdant-cay.ts](alliances-proto/verdant-cay.ts)).
- Its garrison only rose, from 70 to a max of 103. The M20 regrowth counts neutral ports.
- It was not ignored: 12,803 character-ticks were spent docked there, 8,129 of them by faction members with at least 25 troops, which meets the raid troop gate.

So the port is outside conquest entirely. A port-transfer or purchase slice, or an explicit rule for raiding neutral ports, is the only route into play. Changing its garrison would do nothing.
