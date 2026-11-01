# Next slice after the AI, social, triage and occupation layers

Status: Open / proposal (Researcher, 2026-11-01). Measured offline on `main` `115561e`, using the defaults: EXILE_RECOVERY on, OCCUPATION off (`OCCUPATION_DEFAULT = false`), no AI. The run covered 13 seeds (1847, 2718, 4096, 1000, 2000, …, 10000) × 1,200 ticks. The scripts are in [next-after-layers/](next-after-layers/). Spend: $0.

## What the world looks like now

All counts are totals over the 13 seeds, per 200-tick bin.

| Event | 0–199 | 200–399 | 400–599 | 600–799 | 800–999 | 1000–1199 |
|---|---|---|---|---|---|---|
| All events | 312,569 | 346,876 | 359,881 | 362,123 | 365,293 | 358,869 |
| `battle-started` | 232 | 74 | 123 | 120 | 126 | 127 |
| `settlement-claimed` | 58 | 77 | 136 | 130 | 142 | 139 |
| `secession-declared` | 0 | 13 | 7 | 5 | 2 | 4 |
| `contract-breached` | 138 | 143 | 63 | 34 | 35 | 36 |
| `character-captured` | 22 | 13 | 60 | 48 | 44 | 60 |
| `character-died` | 2 | 4 | 4 | 3 | 3 | 6 |

**Readings**
- **No general late-game quieting.** Battles and claims are flat from t400 on. The quieter signals are:
  - **secessions**, which fade from 13 to 2–4 per bin;
  - **breaches**, which fall from 143 to 34–36 per bin.
- **Verdant Cay is never touched.** It starts neutral with garrison 70, and on all 13 seeds it has **0 battles and 0 claims** in 1,200 ticks. The conflict runs over 3 of the 4 ports.
- **Breakaways mostly end portless.** At t1200 there are 57 factions over the 13 seeds. 25 of them have no port, and those 25 hold 45 living members.
- **No diplomacy at all.** There are no alliance events: "alliance" in `src/sim` is only a conversation tag (`conversations.ts`). Every conflict is one faction against one faction.
- **The cast is closed.** It is 30 characters at the start, with 27–30 alive at t1200, and no new named characters.

## Options (ranked)

### 1. Alliances: pacts and breaks between factions (recommended)

**Cites**
- `game-vision.md:13`: "creating a faction, breaking an alliance, enabling a rebellion".
- `roadmap.md:23`: alliance-breaking is Untracked.
- [Alliances](alliances.md): Open design brief.

**Evidence it addresses**
- 25 / 57 factions are portless at t1200, holding 45 members.
- Secessions fade to 2–4 per bin.
- There are 0 alliance events, so every war has two sides.

**Scope**
- A deterministic pact between two factions, on the alliances.md triggers: a shared enemy, raid losses, treasury, and port proximity.
- Allies do not raid each other, and they may join an attack on the shared enemy.
- A pact breaks on a measured condition, such as a raid by the ally, the shared enemy losing its last port, or a grievance.
- Events `alliance-formed` / `alliance-broken`. No AI in v1; the picker may later weigh it.

**Flag:** `ALLIANCES`, default off. Flag off is byte-identical to the default pins: 72 ticks `7f76e474` / `976c40bd` / `08943ea5` and 1,200 ticks `94de9c02` / `7a3741c9` / `af6eeaea`.

**Acceptance (liveness, no balance targets)**
1. Flag off reproduces the pins.
2. Pacts form on most seeds (at least 7 / 13), and at least one pact breaks on at least 5 / 13.
3. Liveness holds: claims > 0 and port changes > 0 on every seed, and no new wipeouts.
4. Secessions still occur on at least 6 / 13 seeds.
5. No pact is formed or broken without a recorded cause (a test asserts it).

**Open for the Lead**
- Can a portless faction ally?
- Is a pact public news?
- Do allies share the defection channel of occupation?

### 2. Ownership by negotiated transfer or purchase, starting with the neutral port

**Cites**
- `world-simulation.md` ownership routes: founding, colonizing, purchasing, negotiated transfer, faction grant.
- `roadmap.md:26`: only conquest plus claim exists (Untracked).
- `roadmap.md:28`: negotiated transfer is Tracked deferred.

**Evidence it addresses**
- Verdant Cay has 0 battles and 0 claims on 13 / 13 seeds. Its garrison of 70 sits above every raid, so a quarter of the map never enters play.
- 25 portless factions have no route to a port except raids.

**Scope**
- A faction treasury can buy a neutral port's allegiance, or an owner can transfer a port, at a price derived from population and garrison.
- Event `settlement-transferred`. The occupation record applies when OCCUPATION is on.

**Flag:** `PORT_TRANSFER`, default off. Flag off is byte-identical.

**Acceptance**
1. Pins hold with the flag off.
2. Verdant Cay changes owner at least once on at least 5 / 13 seeds.
3. Liveness as in option 1.
4. Every transfer has a payer, a price, and a recorded reason.

**Open for the Lead**
- Is the price fixed or negotiated?
- Can the player commander sell?
- Interaction with the secession owner gate.

### 3. Named-character lifecycle: promotion, retirement, return

**Cites**
- `autonomous-characters.md:96–100`: "Ordinary people can become named characters… They may retire after substantial loss of power… and return".
- `roadmap.md:40`: Untracked.

**Evidence it addresses**
- The cast is fixed at 30, with 27–30 alive at t1200.
- Deaths are 2–6 per bin, and nobody enters.
- 45 members sit in portless factions with no path back.

**Scope**
- Promotion from troop survival or battle performance into a new named character.
- Retirement after a substantial loss of power, and return on a crisis at the character's home or faction.
- Deterministic and side-stream.

**Flag:** `LIFECYCLE`, default off. Flag off is byte-identical.

**Acceptance**
1. Pins hold.
2. At least one promotion on at least 7 / 13 seeds.
3. At least one retirement and one return across the sweep.
4. Liveness as in option 1.
5. A promoted character has a recorded origin event.

**Size:** L, since it touches the picker cache keys and the projection. It is ranked third because it adds actors but no new conflict axis.

## Recommendation

**Option 1, alliances.** It is the only one that adds a new conflict axis: three-sided politics and betrayal, which the vision names directly. It uses the existing Open brief. It also gives the 25 portless breakaways something to do. Option 2 is a smaller follow-up that opens the fourth port.
