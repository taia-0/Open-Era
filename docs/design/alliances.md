# Alliances

Status: Build-ready spec, revision 2 (Researcher, 2026-11-01; revision 1 was `e674d4e`). It is option 1 of [next after the layers](next-after-layers.md) (#178), chosen by the Lead. It replaces the earlier Open brief: read that at `178662c:docs/design/alliances.md`, which was measured when only two factions ever existed. Behind `ALLIANCES`, default off. Deterministic: no RNG draw and no AI.

**Prototype.** The prototype is [alliances-proto/prototype.patch](alliances-proto/prototype.patch): `src/sim/alliances.ts`, plus hooks in `engine.ts` and `state.ts`, plus `scripts/diag/alliance-sweep.ts`, applied to `main` `9457107`. It ran offline on 13 seeds (1847, 2718, 4096, 1000, 2000, …, 10000) × 1,200 ticks, with the defaults (EXILE_RECOVERY on, OCCUPATION off), alliances off and then on. Output: [alliances-proto/sweep.txt](alliances-proto/sweep.txt). Diagnostics: [alliances-proto/ally-diag.ts](alliances-proto/ally-diag.ts). Spend: $0.

## 1. Why

[Next after the layers](next-after-layers.md) measured the world on `115561e`:
- 25 of 57 factions are portless at t1200, holding 45 living members;
- there are 0 alliance events, so every war has two sides;
- secessions fade to 2–4 per 200 ticks.

The vision names alliances directly: `game-vision.md:13`, "creating a faction, breaking an alliance, enabling a rebellion". `roadmap.md:23` lists them as Untracked.

## 2. Why `near` never fired in revision 1 (diagnosis)

**Distances between ports** (`createPrototypeWorld` positions):

| Pair | Distance |
|---|---|
| Cinder Key – Glassport | 23.3452 |
| Glassport – Verdant Cay | 25.8070 |
| Crown Harbor – Glassport | 43.829 |
| Crown Harbor – Verdant Cay | 47.508 |
| Cinder Key – Verdant Cay | 49.041 |
| Cinder Key – Crown Harbor | 55.082 |

Two causes. The one-pact limit was not one of them.

1. **The threshold was a rounded figure below the real distance.** Revision 1 used 23.345, the brief's rounded value, but the real distance is 23.34524. The only qualifying pair, Cinder Key – Glassport, failed `d ≤ 23.345`, so no pair could ever be near. With the threshold fixed and the same rule otherwise (the off-run diagnostic), a clock-tick check finds **874** pair-and-enemy checks where one side is near and the other side has another cause, and **0** where both sides are near.
2. **Both sides near the same enemy is structurally impossible.** That would need the enemy's port to be adjacent to two ports, one held by each ally. Only Glassport has two neighbours, Cinder Key and Verdant Cay, and Verdant Cay is never owned (§9). So `near` can only form a pact paired with a different cause on the other side.

**Fix.** Adjacency is **distance ≤ 30**. The measured distances fall into two groups, 23.35 – 25.81 and 43.83 – 55.08, and 30 sits in the gap. Any value from 25.81 to 43.83 selects the same pairs: Cinder Key – Glassport and Glassport – Verdant Cay. Each side needs **its own** cause; the causes do not have to match.

## 3. Cause to pact (formation)

**When.** On the faction clock: `t > 0` and `t % 24 === 0`, after `declareAutonomousSecessions`. Only factions with at least one living member take part.

**Who.**
- Pairs (P, Q) with P < Q by id.
- Neither may be in a pact (one pact per faction).
- The pair must not be in the 240-tick cooldown.

**The shared enemy E.**
- Candidates are the other living factions that hold at least one port, ordered by port count descending, then id.
- The first E for which both P and Q have a cause forms the pact.

**Causes**, in priority order. The first that holds is recorded as the side's cause:
1. **`raided` (threatened):** E started a raid on F (a `battle-started`, or an immediate `battle-resolved`, with E's captain attacking an F port) within the last **N = 152** ticks.
2. **`near`:** an E port is within 30 of an F port.
3. **`landless`:** F holds no port while E holds one.

**Why N = 152.** It is the p90 of the gap between successive raids by one faction on the same other faction. The run was flag off, 13 seeds × 1,200 ticks, with 959 gaps: p25 8, median 25, p75 76, p90 152, max 744. A raid within 152 ticks therefore means the same campaign is still running in 90 % of cases.

**Raid ledger.**
- `allianceRaids: { "<E>><F>": lastTick }` is kept only with the flag on.
- It opens with one `alliance-ledger-opened` event at the end of tick 0. After that, `applyEvent` updates it from `battle-started` and from immediate `battle-resolved` events.
- Replay rebuilds it from the tape.

## 4. Effects

1. **No raids or claims between allies.** `hostileTerritory` is false for an allied port.
2. **Joint battles.**
   - **Who joins:** every allied captain who is docked at the battle port or at an **adjacent** port (distance ≤ 30, the §2 grouping). The captain must also:
     - be alive, free (no captivity) and not travelling;
     - have troops > 0;
     - not be leading their own active battle.

     A captain allied to the attacker's faction joins the attacker. A captain allied to the port's faction joins the defender.
   - **Why adjacent counts:** major battles resolve within 0–2 ticks of starting (n = 650; median 0, p90 2, max 2). A joiner from an adjacent port is therefore support already in reach, not a voyage.
   - **Resolution change**, in `resolveImmediateBattle` and in every phase of `resolveBattlePhase`:
     - `attackerBase = partyPower(attacker) + Σ partyPower(attacker joiners)`;
     - `defenderBase = settlementDefensePower(port) + Σ partyPower(defender joiners)`.
   - **What stays the same:** the RNG draws (same two rolls, same order), the loss formulas, and the raid decision, which still uses the attacker's own perceived ratio.
   - **Joiners take no losses in v1.** Sharing losses is deferred (§8).
   - **Record:** `allyJoiners: [{ id, side, at, power }]` and `allyFlip` are added to the battle event, flag on only. `allyFlip` is true when the same rolls without the joiners' power would have given the other side the round.

## 5. Break conditions

Breaks are evaluated at the end of every tick, before `metrics-recorded`. The first condition that holds breaks the pact:

| Reason | Measured condition |
|---|---|
| `ally-gone` | One allied faction has no living member |
| `enemy-portless` | E holds no port |
| `ally-attack` | An active battle has an attacker from one ally at a port held by the other (it started before the pact) |

After a break, the pair waits 240 ticks before it can re-form. There is no choice-break in v1, and no break on a timer or on relative strength (`game-vision.md:39`).

## 6. State and events

**State**, all omitted while absent, so a flag-off world hashes as before:
- `alliances?: [{ id, factionIds, enemyFactionId, formedTick, causes, portsAtForm }]`
- `allianceMemory?: [{ factionIds, brokenTick }]`. The Engineer should prune entries older than 240.
- `allianceRaids?: Record<string, number>`.

**Events**, flag on only:
- `alliance-ledger-opened` `{}`.
- `alliance-formed` `{ alliance }`.
- `alliance-broken` `{ allianceId, factionIds, enemyFactionId, reason, evidence }`.
- `battle-resolved` and `battle-phase-resolved` gain `allyJoiners` and `allyFlip` when someone joins.

**Run option** `alliances: true`, with `ALLIANCES_DEFAULT = false`.

## 7. Acceptance

**Gated properties**
1. Flag off is byte-identical to the default pins: 72 ticks `7f76e474` / `976c40bd` / `08943ea5`, and 1,200 ticks `94de9c02` / `7a3741c9` / `af6eeaea`.
2. Every pact has a recorded cause for both factions.
3. Every break follows its condition, and no pact is alive at a tick's end while its break condition holds.
4. No raid starts between allies.

**Gated liveness**
- Forms on at least 7 / 13 seeds, and a break on at least 5 / 13. These are floors only, not targets.
- Claims > 0 and port changes > 0 on every seed.
- No new wipeouts.
- Secessions on at least 6 / 13 seeds.

**Report-only, untuned**
- The share of pacts with at least one port-holder at formation.
- Battles with an ally joining.
- Rounds where joining flipped the outcome against the same-roll counterfactual.

## 8. Deferred (not in v1)

- Shared sightings.
- A choice-break and its cost: there is no choice-break in v1, so the 0.04 loyalty and grievance step and `treatyMemory` from the old brief wait.
- Player commands `propose-alliance` / `break-alliance`.
- Alliance news.
- Joiner losses.
- A pact of more than two factions.

## 10. Prototype results, revision 2 (13 seeds × 1,200 ticks)

| Seed | Off hash | Forms | Breaks | Causes (raided / near / landless) | Pacts with a port-holder | Joined battles (rounds) | Flipped rounds | Claims off → on | Port changes off → on | Secessions off → on |
|---|---|---|---|---|---|---|---|---|---|---|
| 1847 | `94de9c02` pin | 4 | 4 | 6 / 1 / 1 | 4 / 4 | 5 (5) | 2 | 51 → 52 | 52 → 53 | 1 → 1 |
| 2718 | `7a3741c9` pin | 0 | 0 | — | — | 0 | 0 | 64 → 64 | 64 → 64 | 0 → 0 |
| 4096 | `af6eeaea` pin | 20 | 17 | 17 / 10 / 13 | 15 / 20 | 24 (30) | 9 | 56 → 52 | 59 → 57 | 3 → 5 |
| 1000 | `5f303e45` | 5 | 5 | 4 / 3 / 3 | 5 / 5 | 3 (3) | 0 | 42 → 44 | 44 → 46 | 2 → 2 |
| 2000 | `3dec6c14` | 9 | 8 | 13 / 1 / 4 | 7 / 9 | 8 (12) | 7 | 50 → 46 | 52 → 48 | 2 → 2 |
| 3000 | `945a5b23` | 8 | 8 | 8 / 3 / 5 | 8 / 8 | 14 (15) | 4 | 42 → 45 | 44 → 49 | 2 → 4 |
| 4000 | `05583438` | 4 | 4 | 5 / 0 / 3 | 3 / 4 | 18 (20) | 9 | 63 → 45 | 64 → 46 | 1 → 1 |
| 5000 | `ad712dfa` | 11 | 10 | 16 / 3 / 3 | 9 / 11 | 21 (25) | 9 | 55 → 51 | 57 → 53 | 2 → 2 |
| 6000 | `020028d7` | 11 | 10 | 10 / 6 / 6 | 9 / 11 | 25 (26) | 16 | 50 → 28 | 55 → 34 | 5 → 6 |
| 7000 | `9638fa13` | 3 | 1 | 3 / 2 / 1 | 2 / 3 | 20 (22) | 11 | 61 → 45 | 65 → 48 | 4 → 3 |
| 8000 | `6e74df8b` | 29 | 29 | 22 / 10 / 26 | 21 / 29 | 30 (36) | 9 | 62 → 59 | 66 → 64 | 4 → 5 |
| 9000 | `450acb6b` | 7 | 7 | 7 / 3 / 4 | 5 / 7 | 13 (15) | 7 | 58 → 52 | 60 → 53 | 2 → 1 |
| 10000 | `a1567d5f` | 3 | 1 | 1 / 3 / 2 | 3 / 3 | 26 (28) | 18 | 28 → 16 | 31 → 19 | 3 → 3 |
| **Total** | | **114** | **104** | **112 / 45 / 71** | **91 / 114 (80 %)** | **207 (237)** | **101** | **682 → 599** | **713 → 634** | **31 → 35** |

Flag off reproduces the 72-tick pins `7f76e474` / `976c40bd` / `08943ea5` with the patch applied.

Other measures:
- **Breaks:** enemy-portless 99, ally-gone 5, ally-attack 0.
- **Pact duration:** n = 104, min 1, median 67, max 571 ticks. 10 pacts are in force at t1200.
- **Joiners:** 258 joined the attacker and 247 the defender.
- **Flipped rounds:** 101 of the 237 joined rounds (43 %) went the other way from the same-roll counterfactual. Report only.

| Check | Result | Pass |
|---|---|---|
| Flag off = pins (72 and 1,200 ticks) | match on 1847 / 2718 / 4096 | yes |
| Every pact has a cause | 114 / 114 (228 / 228 sides) | yes |
| Every break follows its condition; none alive past it | 0 violations | yes |
| No raid between allies | 0 | yes |
| Forms on at least 7 / 13 | 12 / 13 (none on 2718) | yes |
| Breaks on at least 5 / 13 | 12 / 13 | yes |
| Claims and port changes > 0 on every seed | minimum 16 and 19 (10000) | yes |
| No new wipeouts | none | yes |
| Secessions on at least 6 / 13 | 12 / 13 | yes |

**Readings, report only**
- Raids now dominate as the cause (112 of 228 sides), and 80 % of pacts include a port-holder, against 0 in revision 1.
- Joint battles are common and decide rounds. Claims fall 682 → 599 and port changes 713 → 634, most sharply on 6000, 7000, 4000 and 10000.
- The fall in claims is emergent and not a target; the liveness floors hold.
- Joiners lose no troops (§4), so joining is free. That is the first thing to revisit if the Lead wants a cost.

## 9. Diagnosis for the port-transfer slice: why Verdant Cay is never raided or claimed

**By construction, no autonomous character can raid or claim a neutral port.** In `buildCandidates` (`engine.ts`, the `hostileTerritory` line), `hostileTerritory` requires `settlement.factionId !== null`. Both the `raid` row and the `claim-settlement` row require `hostileTerritory`. Verdant Cay starts with `factionId: null` (`createPrototypeWorld`), so it never gets either row. Its garrison of 70 is not the reason.

The measurements agree:
- Over the 13 seeds × 1,200 ticks on main defaults, Verdant Cay had 0 battles, 0 claims and 0 ticks with an owner ([verdant-cay.ts](alliances-proto/verdant-cay.ts)).
- Its garrison only rose, from 70 to a max of 103. The M20 regrowth counts neutral ports.
- It was not ignored: 12,803 character-ticks were spent docked there, 8,129 of them by faction members with at least 25 troops, which meets the raid troop gate.

So the port is outside conquest entirely. A port-transfer or purchase slice, or an explicit rule for raiding neutral ports, is the only route into play. Changing its garrison would do nothing.
