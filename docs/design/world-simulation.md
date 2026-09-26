# World simulation

## Simulation scale

One server should eventually support hundreds of human players and hundreds of fully persistent named autonomous characters. Decision frequency is relevance-weighted rather than capped: important or endangered characters think often, while low-relevance characters act less frequently. Ordinary workers, civilians, and routine military populations are aggregated.

## The World Government

The starting world is dominated by a highly organized World Government. It directly governs most territory through one centralized hierarchy. Internal characters compete, but loyalty to the central institution and obedience to higher office are extremely strong even when subordinates dislike the person giving an order.

New player characters begin unaffiliated until noticed. Attention can result from:

- Relationships with wanted or politically important characters.
- Voluntary enlistment, trade, petition, contracting, or alliance.
- Growing fame, wealth, military strength, or territory.
- Witnessed crimes, raids, or attacks on government interests.

Players may enlist and earn promotion, receive appointments through patronage, or remain outside contractors and allies. Overthrow is possible, but the government's initial territorial and troop advantage should make it a long, collaborative, uncertain achievement.

## Factions and offices

Player-created faction structure evolves as the organization grows rather than requiring a complete constitution at creation. A human officeholder's routine work may be handled by the next eligible subordinate in the office hierarchy.

Delegating information is distinct from delegating authority. An appointed reporting officer may filter and summarize routine updates, but the original issuer still confirms completion, changes objectives, and cancels orders unless a later office system explicitly grants broader powers.

Deputy behavior is personality- and loyalty-sensitive. The current decision record permits routine budgets, production, taxes, defensive responses, minor agreements, and potentially even high-impact acts such as law changes, war, secession, or disposal of major assets. That last category needs explicit authorization guardrails before production; loyalty alone is not a sufficient security boundary.

## Economy

### Resources

The first simulation tracks four abstract local stocks:

- **Provisions** — food and fresh water.
- **Arms** — metal, weapons, and ammunition.
- **Medicine** — treatment and recovery supplies.
- **Ship materials** — timber, cloth, rope, and repair materials.

Shortages reduce morale, readiness, and productivity; block actions that require the missing stock; create unrest and political pressure; cause illness and temporary desertion among important troops or characters; and can permanently remove low-level troops.

### Production and ownership

Island output depends on geography and deposits, population and worker condition, assigned production focus, and constructed farms, mines, workshops, and ports. Workers are represented as a simple count drawn from island population.

Individual characters and players own productive buildings and their output. Owners manually queue buildings, workers, and production. Growth does not unlock abstract automation, but a manager character may maintain queues under standing orders.

Resources are local and transport is physical: cargo moves with ships and parties and can be delayed, intercepted, consumed, or lost. Money remains globally abstract; there is no currency-politics simulation in the first design.

### Prices and taxes

Local supply and demand set prices within stability limits. Territorial factions automatically tax a percentage of money earned through local sales and work. The faction leader sets the tax rate freely.

Taxes cannot be evaded through a hidden action. A settlement owner can escape a faction's tax authority only by declaring separation, which is an overt political act.

### Player trade

A player trades by naming what to buy or sell and how much, and can see the price before committing. Any of the four resources may be traded on any market. Three constraints apply: the stock the market actually holds, the money the buyer actually holds, and the hold the party can actually carry. Trade is the player verb that moves goods between islands, and it is the physical transport the resource model assumes.

A market is quoted only where the commander is standing, because trading needs a market they are physically at and a remote figure would be an estimate presented as a price. Standing there is direct observation: the stock and price rows in a settlement the commander occupies are present truth, not a decaying report, while the rows for a settlement they are away from remain a report with an age.

Prototype choices, made to make this evaluable rather than decided:

- Hold capacity is 40 units plus 2 per sailor, shared across all four resources.
- Quantity is a whole number of units, 1 to 200. Resources are carried fractionally by upkeep and production, but a player trades discrete goods, and a fractional request would make "how much did I buy" a question about rounding.
- Provisions below the party reserve cannot be sold. A trader cannot strand their own crew to make a sale.
- Selling pays the tax rate of the faction holding the settlement. Buying pays none, because a purchase is not money earned in the settlement.
- One price covers both directions. A purchase moves the quoted unit price times the quantity; a sale moves the same figure less the local tax. The market re-quotes afterwards from the stock it now holds, so a trade does not price itself as it fills.
- A request beyond any limit is refused and names the limit that bound it, rather than quietly filling short. A player who asks for more than they can have is told which ceiling they hit and what the ceiling was.
- Money moves in whole cents. The panel and the boundary run the same rounding cascade, so a total printed before the button is pressed is the total the purse shows after it.
- The autonomous path uses the same prices and constraints with its own heuristics for choosing volume. It is not the player's path, and the two are deliberately not required to agree.

Open: whether a voyage should out-earn working the same ticks, and the margins that would make it do so. The measurements behind that question, and the decision to defer it, are recorded in [progress.md](../../progress.md) and [roadmap.md](../roadmap.md). Also open: whether a merchant should be able to learn a remote price at all, or must sail to find out what a market pays; and whether cargo can be lost, spoiled or taken rather than only bought and sold.

## Settlements, ownership, and secession

A character may legally own a settlement by founding or colonizing it, purchasing it, receiving a negotiated transfer or faction grant, or conquering it and establishing a claim.

When the owner declares separation:

- Separation succeeds immediately.
- The former faction is notified.
- Objective history records the secession while observers apply labels such as traitor or liberator.
- The owner and every personally owned asset enter war with the former faction.
- Population, garrison, local characters, and other assets decide separately whether to follow.

If the settlement survives a time threshold or makes peace, the owner may remain independent, found a new faction, or seek protection or membership elsewhere.

The prototype uses a garrison surrender threshold followed by an explicit player claim decision. The conquering character personally owns a claimed settlement; longer-term occupation, negotiation, and population responses remain deferred.

## Parties, troops, and ships

Troops supplement named characters; they never replace them. Every autonomous named character can lead a party of troops.

- One character leads a party containing several troop groups.
- Dedicated sailors operate ships while troop groups travel aboard.
- Troop persistence and advancement follow a Mount & Blade-like model.
- A stack earns experience, and the player chooses which eligible soldiers are promoted.
- Most settlements share a universal troop tree with local cultural or faction modifiers.
- Rarity belongs to individual recruits: common, rare, or epic.
- Rare and epic recruits can appear in ordinary pools, originate from particular cultures or islands, or reveal exceptional potential through experience.
- Rarer recruits have greater growth potential.

Promoted troop officers can run detached parties. They handle routine decisions, have limited leadership ceilings, and obey standing orders exactly. Named characters have much greater leadership and combat ceilings but may forage, recruit, visit a pub, pursue side goals, or otherwise deviate in ways that can help or hurt the issuer.

One character may remotely command several parties. Additional named characters within a party primarily fight and contribute specialist skills such as navigation, cooking, trade, and medicine.

On defeat, some troops die, some are wounded, and low-morale soldiers may desert. If a named character is captured after a complete head-on defeat, their troops scatter and gradually return when the character is freed.

## Combat

Small fights resolve quickly. Major battles use multiple phases to reveal the outcome gradually and provide retreat intervals. Once forces commit, statistics and chance control the fighting; the player's only direct intervention is ordering retreat at a phase boundary. The command character handles tactical choices.

The resolution has separate character and troop layers:

- Victorious powerful characters can turn their strength against enemy troops.
- Troop control affects escape, pursuit, and capture.
- Elite or specialized troops are the only ordinary formations that seriously threaten world-class characters.
- A world-class character can defeat very large low-tier forces alone, limited mainly by fatigue.

There are no elemental or ability-matchup counters in the core design. Terrain and prepared defense—forts, mountains, and similar ground—provide meaningful advantages but rarely reverse a huge power gap.

Randomness depends heavily on commander strategy and troop discipline. Strategy improves the accuracy of pre-battle strength and casualty estimates and reduces disastrous variance. External events do not enter once a multi-phase battle begins.

The current prototype makes that commitment visible through one compact forecast: outcome likelihood, expected losses, character-and-troop power, retreat prospects, and capture exposure. Strategy narrows estimate ranges and progressively reveals defensive-ground factors; intelligence quality still limits what even a skilled commander can know. Small attacks resolve immediately. Major attacks persist across three phases, refresh direct battlefield intelligence after each phase, and pause accelerated player time at every retreat window. Continuing requires advancing time again. A withdrawal can succeed with pursuit losses or fail according to its displayed capture risk. Capture can also follow a complete major-battle defeat; surviving troops scatter rather than disappearing.

A retreating party leaves the hostile settlement immediately and begins a forced sea journey. The route is disclosed at the battle decision window and targets the nearest settlement controlled by the party's faction, then the nearest neutral haven if no friendly settlement exists, then any alternate island as a last resort. The party cannot issue local commands while withdrawing and receives direct intelligence on arrival through the normal travel system.

## Character progression and powers

### Raw strength

Every named character begins with raw strength represented by power, speed, endurance, and resilience. These improve automatically through relevant actions, hardship, difficult combat, dangerous missions, exploration, leadership, major achievements, and mentorship. Growth remains steady but each tier requires more experience; increasingly rare breakthrough events can cause significant gains.

### Lost technology

A character may possess at most one lost-tech power. Each distinct power has three identical copies with the same ability progression. Copies are found through dangerous exploration, guardians and major expeditions, or rare trade, salvage, and island events.

New abilities awaken through very rare experiences after exploration or battle. A catastrophic defeat can strip the power from its user and return that copy to the hidden world pool. Death does the same immediately.

### Inner strength

Any character can eventually learn inner strength, but initial access requires mentorship from an existing practitioner or acceptance into a school. Schools share a complete curriculum; graduating initially unlocks one chosen branch, and the character may return for the others.

Branches cover:

- Heightened perception, awareness, and anticipation.
- Stamina control, recovery, and resistance to injury.
- Physical reinforcement for offense and defense.

Schools require residence in their settlement for a period and teach faster than personal mentorship. Applications go through generated school administrators, who decide using personality, relationship, and reputation. Repeated persuasion is possible; spam can cause an administrator to stop responding permanently.

Noncombat skills—navigation, medicine, trade, leadership, and strategy—grow through repeated use, mentorship or formal instruction, difficult successes, and assignable general experience.

## Defeat, captivity, debt, aging, and inheritance

Ordinary defeats cause temporary wounds and debuffs. Only repeated or catastrophic defeats create permanent losses, including possible loss of extraordinary powers.

A captive always has a guaranteed escape option that causes a serious wound and carries a small risk of a one-to-three-point permanent physical scar. Messaging remains available. A locally selected autonomous authority decides whether to open release negotiations after weighing tagged direct messages, personality, relationship, time held, and circumstances. The captive sees only a qualitative stance. Once terms open, the player may accept, make one counterproposal, or reject them; dialogue output itself never authorizes a gameplay transition. If negotiation does not resolve captivity, the prototype forces release after fourteen world days under captor-selected terms that cannot exceed a system-calculated maximum. Available money is paid first and any remainder is recorded as debt. Release or escape begins a seven-step return of surviving scattered troops. Resource and service terms, general contracts, debt enforcement, and rescue missions remain later milestones.

Formal debt may require money or resources, escort or delivery, defense, a political favor or vote, recognition, or temporary service or allegiance. The captor selects terms within a system-calculated maximum. Breaking a valid debt causes negative traits, relationship and reputation damage, increased or replacement obligations, a recognized hostile claim, and party penalties to navigation, trade, and speed.

Age is historical and cosmetic until 60. Physical attributes receive a modest penalty after 60 and a large penalty after 80, applied to accumulated power rather than through a hard cap. Characters over 80 face an age-related death chance weighted against weaker and less experienced characters. Every character dies by age 120.

After a player's character dies of old age, the player creates a new young heir. The heir did not exist beforehand and begins mechanically as a fresh character except for inherited assets and identity. Family name, public lineage, introductions or goodwill from former allies, and legal claims to titles, property, or office may carry forward. Debts and contracts settle first; a will controls ordinary assets, while unclaimed property becomes contested or returns to its settlement.
