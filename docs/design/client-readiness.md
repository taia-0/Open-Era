# Client readiness — player API

Audit of what a mobile client can read from the player session after the recent sim layers. Read-only. No source change. Findings are from the code on `origin/main` `e9ac8b6`, checked against a local view-model run (recorded at the end).

## Summary

The player session is one object, `dashboardState` in `src/dashboard/view-model.ts`, returned by `GET /api/state` and, for the events of one advance, by `POST /api/advance` (`src/dashboard/server.ts`). That object already has a contract for the player's own party, faction treasury, port panel, character cards, and the event feed. The layers below were added on the sim side. The view-model has no field, sentence, or visibility case for them, except where an owned settlement is copied through wholesale or an event falls through to the generic feed line.

`npm run dashboard` never turns the layers on. `POST /api/advance` calls `runTick(world, { liveSession: true })` (`server.ts`). Occupation, alliances, port purchase, lifecycle, and secession aftermath default off (`OCCUPATION_DEFAULT`, `ALLIANCES_DEFAULT`, `PORT_TRANSFER_DEFAULT`, `LIFECYCLE_DEFAULT`, `SECESSION_AFTERMATH_DEFAULT`). Feed reasons default on in the run CLIs and off in the dashboard, because the engine annotates only when `options.ai.feedReasons` is set (`engine.ts` `runTick`, `feed-reasons.ts`). The World Government picker runs only when `ai.picker` is set and `ai.pickerFactions` includes `world-government`. The notes below are what the same projection returns once a world actually contains the state.

Ranked gaps, player-facing core first (own faction, ports, captains, threats), then diplomacy, then the feed, then records that should stay off the client:

1. Own captains have no retired, returned, or promoted state, and the governor seat is unnamed.
2. A purchased or joined port does not stick on the map label the client already reads, and the feed line does not say who took it.
3. Occupation harshness reaches the current holder only as a raw settlement blob, and the faction that lost the port sees none of it.
4. Peace and pacts are absent from the faction row. A player raid is not peace-gated, so the client cannot warn.
5. Purchase, join, peace, peace-broken, and alliance rows are generic feed lines, and they are not port news.
6. Bookkeeping rows (`lifecycle-watch`, the two ledger-opened events) are in the global feed.
7. World Government picker provenance should stay off the client. It already does.

## How a row is shown

One player. `dashboardState` reads `world.players` and projects for that character. The prototype player is `character-01`, Mara Vane, World Government's command holder (`scenario.ts`).

**Ports.** `dashboardState` (`view-model.ts`). A port whose live `factionId` is the viewer's is copied with `...settlement`, then a few display fields. Anything the sim stored on the settlement is in the JSON. Every other port is a fixed key list. Its `factionId` is the live holder when the viewer is standing there, and otherwise `commander.knowledge[id].factionId` (`knownFactionId`). A missing belief is null. Garrison, stocks, and stability on a foreign port follow the same split: live when standing there, the stored report when away, null with no report.

**People.** `projectCharacter` (`visibility.ts`). Every character is listed. `factionId` and `locationId` are always present. `travel` is set for the viewer and for a faction mate. Troops, purse, cargo, health, and morale are exact for the viewer and for someone in the same port (`characterIntelligence`: `self` and `co-located`). A faction mate elsewhere keeps skills and loyalty and loses those condition figures. There is no `lifecycle` key and no `dead` key.

**Factions.** `projectFactions` (`visibility.ts`). Own treasury, power, and debts. Every faction's tax rate. `seatSummary` (`wording.ts` `seatSummaryFor`) is the captive-cover sentence. It is null when nobody is covering the command seat. Alliances and peace are not on this row.

**Events.** `projectEventFeed` → `projectEvent` (`visibility.ts` `eventPayloadVisible`). The feed lists every stored type except `player-action-executed`, `player-command-resolved`, and `news-posted` (`FEED_OMITTED_TYPES`). `GET /api/state` pages that list (default 100, max 200). `actorId`, `targetId`, and `settlementId` are copied onto the row even when the payload is withheld. The payload is visible when:

- the viewer is the actor, or
- the viewer is a party to that contract, the issuer of that order, the creditor faction on `debt-repaid`, or the faction that lost the port on `secession-declared`, or
- the event has no actor, it names a settlement, and the viewer's faction currently holds that settlement.

Any other event with an actor is withheld. An event with neither an actor nor a settlement is withheld from everyone. Withheld rows whose type is outside `summaryStaysWhenWithheld` (`wording.ts`: captured, released, battle-resolved, claimed, secession-declared, tax-rate-set) replace the rich sentence with `publicFeedSentence`. Unknown types land on `` `${actor} had a ${type} recorded.` `` (`wording.ts`).

The check-in briefing (`view-model.ts` `checkInBriefing`) only admits a fixed set (orders, battles, capture, shortage, claims). None of the new types are in it.

**Port news.** `postPublicNews` (`engine.ts`) posts only `PUBLIC_NEWS_TYPES` (`news.ts`): battle-resolved, battle-retreated, settlement-claimed, capture, release, escape, surrender declined, tax-rate-set, death. The ledger is on the settlement. The owned-port copy therefore includes it. A foreign port omits `news`. The viewer reads the ledger of the port they are standing in, or the bag they sailed with (`news.ts` `readableNews`).

## Occupation

Flag `runTick({ occupation: true })`. Default off. No CLI switch. State is `Settlement.occupation` (`occupation.ts` `OccupationRecord`: `tick`, `fromFactionId`, `byFactionId`, `fromRate`, `harshness`, `lastShortageTick`, `foodBaseline`) and `Settlement.foodRatios`, the last 20 post-upkeep provision ratios (`state.ts` on `settlement-upkeep`).

Events:

- `settlement-claimed` carries `data.occupation` with harshness 0 (`engine.ts` `resolveSettlementClaim`).
- `settlement-upkeep` carries `foodRatio` whenever the flag is on, and `occupation` plus `occupationTerms` (`tax`, `food`, `conduct`, `residents`, `harshness`) while the port is occupied (`engine.ts` settlement upkeep).
- `occupation-integrated` when the hold is at least 240 ticks old and harshness is under 0.25. Payload: `since`, `fromFactionId`, `byFactionId`, `harshness`. No actor. The reducer deletes `occupation`.
- `battle-started` carries `attackerFactionId`, and `occupationDefectors` when the previous faction is attacking and harshness is above 0 (`occupation.ts` `occupationDefectors`, `engine.ts` around the battle start).

**Exposed.** The current holder receives the raw record because the owned settlement is spread. On seed 1847 at tick 120, with Free Tide's holder substituted as the session player, Verdant Cay, Cinder Key, and Glassport each had `occupation` (harshness 0.35, 0.25, 0.35, `fromFactionId` `world-government`) and `foodRatios`. The same holder's upkeep rows are visible (`eventPayloadVisible`: no actor, settlement is theirs) and include `foodRatio`. Crown Harbor, held by the real session player and not occupied, still had `foodRatios` (18 entries) and `foodRatio` on visible upkeep. `occupation-integrated` would be visible to whoever holds the port at that tick, with the four payload fields. The claim sentence is public and keeps its feed reason (`summaryStaysWhenWithheld`); the occupation object on the claim stays in `data`, which is null unless the viewer is the claiming captain.

**Missing.** The previous faction sees no occupation key, no harshness, and no "occupied". At tick 120 Mara's panel listed Verdant Cay's `factionId` as null and omitted `occupation`, while the live holder was Free Tide. A co-located visitor gets live garrison and stability and still no occupation field (the foreign branch does not copy it). Defector counts sit on `battle-started.data`, which only the attacking captain can open. The public sentence is "started a battle". Nothing names harshness, the food baseline, or integration. No briefing row.

**Visibility.** Harshness is the holder's own administration. The term breakdown is not: `residents` is earned grievance of the previous faction's captains toward the port owner (`occupation.ts` `occupationTerms`), and `foodRatios` is the mechanic's input series. Expose a holder block: occupied since, previous faction, harshness, and whether regrowth is stopped (harshness ≥ 0.5). Leave `foodRatios`, `fromRate`, and `occupationTerms` off the client. The previous faction, and a captain standing on the port, can already see stability and garrison under today's sighting rule. Give them a coarse status (held since a claim, harsh or quiet) on that same rule, without the grievance term and without the defector formula. The attacker who is that previous faction can be told that soldiers left the garrison before the fight. That number is the fight they are in. A distant third faction learns it only by watching the garrison report move.

## Alliances

Flag `--alliances` / `runTick({ alliances: true })`. Default off. State on the world, not on a faction: `alliances` (`alliances.ts` `Alliance`: id, the two factions, `enemyFactionId`, `formedTick`, `causes`, `portsAtForm`), `allianceMemory` (pair and `brokenTick`), `allianceRaids` (last raid tick keyed `attacker>defender`).

Events, none of them given an actor or a settlement by `alliances.ts`:

- `alliance-ledger-opened` once, empty payload. Creates `allianceRaids`.
- `alliance-formed` with `data.alliance`.
- `alliance-broken` with `allianceId`, `factionIds`, `enemyFactionId`, `reason` (`ally-gone`, `enemy-portless`, `ally-attack`), `evidence`.

Joint battles, when this flag or secession aftermath is on (`engine.ts` `resolveImmediateBattle`): `battle-resolved` and `battle-phase-resolved` may carry `allyJoiners` (`id`, `side`, `at`, `power`, `troops`, `losses`) and `allyFlip`.

**Exposed.** Nothing on the faction row or the port. A formed or broken pact has no actor and no settlement, so `eventPayloadVisible` withholds it from both parties and from everyone else. The sentence is "The world had a alliance formed recorded." The row has no faction ids. `alliance-ledger-opened` is the same shape. Joiner losses change troop counts. A viewer sees that only on a card whose condition is exact (themselves, or someone in the same port). The battle payload that lists the joiners opens only for the attacking captain, because `battle-started` / `battle-resolved` have an actor.

**Missing.** That a pact exists, who is in it, and who it is against. The break reason. That a battle's numbers included an ally. Seed 1847 through tick 360 with the flag on formed no pact (`alliances` stayed absent after the ledger event), so the feed check for formed and broken rows is the constructed event passed through `projectEvent`, not a live pact.

**Visibility.** Both member factions should see the partner, the enemy, and that the pact is alive or broken, on the faction row, without `causes`, `portsAtForm`, or `allianceRaids`. Those strings name the other side's ports and the last raid tick. A break's `reason` can be shown to the two members. `ally-attack`'s battle id is a fight they are in. The enemy faction can learn they are the target when a fight actually includes the ally, under the same "this battle is visible" test as `observedBattles` (`view-model.ts` `battleIsVisible`: on the ground, or in the viewer's own territory). Do not publish the joiner's power math to a faction that only heard a rumor. `alliance-ledger-opened` is bookkeeping and should be omitted from the feed the way `news-posted` is.

## Port purchase

Flag `--port-transfer` / `runTick({ portTransfer: true })`. Default off. No new world field. `applyPurchase` (`port-transfer.ts`) sets `settlement.factionId`, `ownerId`, clears `surrender`, and subtracts `price` from the buyer treasury.

Event `settlement-purchased`. Actor is the buyer's first free captain docked at the port, not the faction. `targetId` is the buyer faction. Payload: price (`12 × garrison`), reserve, treasury before and after, cause (adjacent port, or landless), and `candidates` (every qualifying faction's id, surplus, and cause).

**Exposed.** The feed row always carries `actorId`, `targetId`, and `settlementId`. On seed 1847 the only purchase was tick 24: Iris Stone (`character-06`) bought Verdant Cay for World Government, price 840, cause "adjacent: world-government holds glassport at 25.807". Mara's row withheld the payload. The sentence was "Iris Stone had a settlement purchased recorded." While the buyer still holds the port, `dashboardState` treats it as owned, so the live `factionId` is on the panel. The price and the treasury move are on the buyer's faction treasury, which the buyer already sees.

**Missing.** A sentence that says who bought which port. A belief update. Purchase is not in `PUBLIC_NEWS_TYPES`, and it does not write `knowledge`. After Free Tide claimed Verdant Cay at tick 87, Mara's knowledge of that port was still the seeded rumor (`observedTick` -11, `factionId` null) while the live holder was Free Tide. The panel followed the rumor. The claim feed line did say Pax Ash claimed Verdant Cay. The purchase line did not say World Government had bought it. Rival `candidates[].surplus` is another faction's treasury headroom. It is on the event, and it would ship to the client if the payload were opened to anyone but the actor. The actor in this run was not the player, so it stayed null. No briefing row.

**Visibility.** The port and the buyer faction are already on every viewer's row. The sentence can name them. That matches a claim, which is already public. Price, reserve, and treasury stay with the buying faction, the same audience as `projectFactions` treasury. `candidates` surplus and cause stay off every client, including the buyer's. The buyer's own cause (adjacent or landless) can sit on the buyer's row.

## Lifecycle

Flag `--lifecycle` / `runTick({ lifecycle: true })`. Default off. State is `Character.lifecycle` (`lifecycle.ts` `CharacterLifecycle`): `watchSince`, `retired` (`tick`, `cause`, `portsAtRetire`), `lastPromotionTick`, `promotedFrom`. A retired captain is skipped by the autonomous decider (`engine.ts`, `isRetired`) and dropped from the governor seat (`governor.ts` `syncSeats`). The seat itself is a process-local `WeakMap`, not world state (`governor.ts`). `governorId` is derived. Storing it on the settlement was deliberately avoided so tick 0 would not move.

Events, each with the captain as actor:

- `lifecycle-watch` / `lifecycle-watch-cleared` when troops cross 25.
- `character-retired` after 215 ticks under 25, docked, not captive. Payload includes `cause`, `troops`, `portsAtRetire`, and `office` (the port id if they held the governor seat, else null).
- `character-returned` on a crisis (a battle at their port, or the faction lost a port since they retired).
- `character-promoted` after an attacker victory that leaves the captain with at least 424 troops. Payload includes `split`, `captainTroopsAfter`, and `character`, a full clone of the new captain.

The governor the player can already see is indirect: `projectMarket` (`view-model.ts`) sets `levyRate` to 0.05 while a seat is filled, and only on the market the viewer is standing in.

**Exposed.** People keep their card. `factionId` and `locationId` stay. At tick 360 three captains were retired, including Vale Drake, still `factionId` `world-government`, at Verdant Cay, 12 troops. Mara's feed, and Free Tide's, both read "Vale Drake had a character retired recorded." Payload withheld, including for her own faction, because the actor is Vale. The card has no retired flag. Troops stay hidden because she is not in Mara's port. A promoted captain would appear as a new card (the list is every character) with no `promotedFrom`. `lifecycle-watch` is global: tick 0 already produced "Sable Morrow had a lifecycle watch recorded" with her id, for a player who is not allowed to see her troop count. Through tick 120 the session player saw all 19 watch rows withheld. Governors at tick 120 were character-05 at Crown Harbor, character-22 at Verdant Cay, character-20 at Cinder Key, character-16 at Glassport. None of those ids is on `/api/state`. Crown Harbor's market, where Mara is standing, does carry `levyRate`.

**Missing.** Retired, returned, and promoted as a status the order screen can trust. Who governs which of the player's ports. The promotion's troop split. The seat a retirement vacated (`office`). Return and promotion did not fire on this seed through tick 360. Their feed shape follows the same actor rule as retirement, which did fire, and a constructed `character-promoted` row withheld the cloned character from both factions.

**Visibility.** Own faction sees retired, returned, and promoted: the captain, the tick, and for a promotion the parent and the split. That is the same audience as loyalty on the card. `office` goes to that faction too, so they know the seat opened. A rival gets a public line of the same weight as a death ("Vale Drake retired") with no troop count, no `portsAtRetire`, and no seat. The full `character` clone on `character-promoted` stays off the wire. The new captain's card is the public surface, and it already hides condition. `lifecycle-watch` and `lifecycle-watch-cleared` should be omitted from the player feed. They exist so the reducer can count 215 ticks, and the row tells every faction who is under 25 troops. The governor's name is own-faction state. A captain standing in the port already pays `levyRate`. They can be told the seat is filled. The name is the faction's, unless the Lead wants the person collecting the levy named in the port.

## Secession aftermath

Flag `--secession-aftermath` / `runTick({ secessionAftermath: true })`. Default off. State is `world.secessionAftermath` (`secession-aftermath.ts`): `records` (the seceded faction, port, old faction, owner, declared tick, and optional peace, protection, and joined ticks) and `peace` (`factionIds`, `tick`, `cause`). Protection is not a separate list. It is an `alliance-formed` whose `data.aftermath` is `"protection"`, applied by `applyAllianceEvent` and marked by `noteProtection`.

Events:

- `aftermath-ledger-opened`, empty.
- `aftermath-watch` on each `secession-declared`, with the record. No actor. Settlement is the port.
- `faction-peace`. No actor. Settlement is the seceded port. Payload: `peace` (both faction ids, tick, cause), `grievance`, `lastOldRaid`, `age`.
- `faction-peace-broken`. No actor and no settlement. Payload: `factionIds`, `peaceTick`, `reason` `"raid"`, `evidence` (raider, target, raid tick), `cause`. The peace row is removed. `peaceTick` on the secession record stays, so the pair does not peace again.
- `alliance-formed` for a protection, with `settlementId` of the seceded port, `patron` (faction, port, distance, surplus), `ownSurplus`, and the alliance (enemy is the threat).
- `secession-joined`. Actor is the owner. `targetId` is the patron. Payload: patron, both surpluses, `memberIds`, `ports`, the old treasury, `cause`. Members and ports move to the patron. The old treasury is added to the patron's and zeroed.

Peace blocks autonomous raids (`engine.ts` `buildCandidates`). A player raid is not peace-gated (`engine.ts` `processPlayerCommands`). The break event is how a player raid is recorded.

**Exposed.** `atPeace` is not read by the view-model. The faction row has no peace and no pact. `aftermath-ledger-opened` is a global generic line. `aftermath-watch` and `faction-peace` open for whoever currently holds the named port, and for nobody else. A constructed `faction-peace` on Crown Harbor was visible to Mara, because World Government holds it, and withheld from Free Tide, with the port id still on the row and the sentence "The world had a faction peace recorded." `faction-peace-broken` was withheld from both, with no ids on the row. `secession-joined` was visible only to the owner. The patron saw "Pax Ash had a secession joined recorded" plus `actorId`, `targetId` `world-government`, and `settlementId`. After a real join, `character.factionId` on every card would change, because membership is on every card already, and ports that then belong to the viewer would flip to the owned branch. None of these events fired on seed 1847 through tick 360 (no secession, so no watch, peace, protection, or join). The shapes above are `projectEvent` on constructed payloads, matched to the emitters.

**Missing.** A peace the player can read before they order a raid. Which faction it is with. A protection, including who is protected and against whom. A join sentence. The old faction's port label, which follows knowledge and is not rewritten by the join. Patron surplus and the copied treasury. No briefing row. No port news.

**Visibility.** Both parties to a peace should see the partner and that the peace is in force or broken. The player is the side that can break it with a raid, and they may be the old faction, who does not hold the seceded port and therefore fails the settlement test today. Do not send `grievance`, `lastOldRaid`, or the evidence object. The break can name the raider and the victim to those two factions. A protection is the same audience as a pact: the two members see partner and enemy. `patron.surplus` and `ownSurplus` stay off. They are treasury. A join changes who people and ports belong to. Membership is already on every card, and a claim is already public news, so the sentence can be public: these captains and these ports joined that faction. The old treasury and the patron's surplus stay with the patron's treasury view.

## World Government picker

Not a sim flag on the world. `ai.pickerFactions` defaults to `["free-tide"]` (`ai-wg-picker.ts` `PICKER_FACTIONS_DEFAULT`). `--picker-factions free-tide,world-government` adds World Government. The consult is nudge-only (`wgNudge`): keep the scorer's row when the draw is under `q`, otherwise take Jev's best other legal id. `wgPickerRole` (`engine.ts`) returns a role only for an autonomous World Government character who is the command holder or a governor. The holder in the prototype is Mara, and she is human, so her branch does not run.

The record is `data.ai.picker` on that captain's `decision-made`, including `legal`, `probabilities`, `sampled`, `scorerPick`, and `wg` (`role`, `p`, `q`, `kept`, `alternative`). The reducer does not read it.

**Exposed.** Nothing for the player. `decision-made` has an actor, so the payload is that captain's alone. Across 1,985 decisions in 120 ticks, every one was withheld from Mara. The sentence is "made a decision." A constructed row that carried a `wg` nudge was withheld from both Mara and Free Tide. The dashboard does not pass `ai.picker`, so this run did not call a model.

**Missing.** Nothing a player needs. The action they can see is the later public event (sailed, traded, fought).

**Visibility.** Leave it off the client. Opening `decision-made` to the faction would ship the legal set, the scores, and the nudge, which are the captain's private options and a model trace. The human holder's own choices are not produced by this picker.

## Feed reasons

Default on in the simulate CLIs (`FEED_REASONS_DEFAULT`). The dashboard does not pass `ai.feedReasons`, so a dashboard session writes none. The stub writer used below is the offline one (`stubFeedReasonWriter`). It does not call a vendor.

`feedReasonKind` (`feed-reasons.ts`) annotates six kinds, stored at `data.ai.reason`: secession, desertion, a better-motive contract breach, a raid (`battle-started` after tick 0), a claim, a tax change. `withFeedReason` (`feed-reasons.ts`), called from `eventSummary` (`view-model.ts`), appends ` — <text>` when `reason.text` is set. `projectEvent` then drops that sentence, reason included, when the payload is withheld and the type is outside `summaryStaysWhenWithheld`.

**Exposed.** Claims and tax keep the sentence for every viewer. At tick 120 Mara, payload withheld, still saw "Kessa Calder claimed Cinder Key. … — Kessa Calder acted: the port surrendered and the claim was accepted." and "Pax Ash lowered the Free Tide Compact tax from 8% to 7% (unrest at Glassport). — Pax Ash acted: unrest in a port the faction held." A raid reason survives only for the attacker. Pax's tick-19 raid, read as Pax, was "Pax Ash committed to a major battle at Glassport — Pax Ash acted: to seize supplies from a garrison believed to be about 133." and the visible payload included `ai`. Read as Mara, the same kind of raid was "Pax Ash started a battle at Crown Harbor." with no reason. Desertion keeps a public line and drops the brain suffix: "Mina Vale left Free Tide Compact." for both viewers (tick 240). Better-motive breaches keep "the carrier chose other work" (`publicBreachReason`) and, in this run, no brain suffix, because neither viewer was the buyer or the carrier. The two parties would keep the rich sentence, brain suffix included, because a contract payload is visible to them.

**Missing.** Purchase, join, peace, peace-broken, alliance formed, alliance broken, retirement, return, promotion, and occupation-integrated are not feed-reason kinds, and they are not in `PUBLIC_NEWS_TYPES`. On Crown Harbor's ledger at tick 120 the item types were battle-resolved, battle-retreated, captivity-released, character-captured, settlement-claimed, and tax-rate-set. The same set was on Free Tide's ports. The check-in list does not add the new types. A raid the player suffers does not carry the reason. The reason text is also the only part worth showing. `data.ai.reason` itself (model, prompt hash, outcome) rides along when the payload is visible.

**Visibility.** Port-ownership lines (purchase, and a join) can be public sentences and public news, on the same board as a claim. The ids are already on the feed row. Peace, a peace break, and a pact stay on the two factions' feeds. They should not be copied onto a port ledger a third faction can sail away with (`takeDepartureNews`). A raid reason shown to the defender and to anyone who can see the battle should be the public act ("to seize supplies"), without the attacker's garrison belief. The belief is the attacker's private report. Desertion's public line already names who left which faction. The brain suffix can follow for the faction that lost the member, the same way a claim's suffix follows for everyone, because the facts are the desertion itself. The `ai` object stays off the player row in every case. Model name and input hash are operator records.

## Ranked gaps

Own faction, ports, captains, and the threat on a port come before diplomacy. Diplomacy comes before the feed, because a raid order needs the peace and the pact even if the sentence is plain. The feed comes before records that are useful only to the operator.

The sizes are the projection work: a field and a sentence (S), a field plus a visibility case and a sentence (M). Nothing here is a new sim rule (that would be L).

| Rank | Gap | Layer | Why a player needs it | Size | Visibility risk |
| --- | --- | --- | --- | --- | --- |
| 1 | Retired, returned, and promoted on the own-faction card. Governor name on the faction's ports. Drop `lifecycle-watch` and `lifecycle-watch-cleared` from the feed. | Lifecycle | Those captains stop taking autonomous work and can leave a seat. The card still looks like any other mate. The watch row names who is under 25 troops to every faction. | M | High if the watch stays public or if `office` and troop counts go out with it. Low if status is own-faction and a rival only hears "retired". |
| 2 | Map label and a sentence for a purchase and for a join: port, new faction. Update the belief the panel already reads. | Port purchase, aftermath | While the buyer holds the port the owned branch is right. After they lose it, the label falls back to a pre-purchase rumor. Verdant Cay read as neutral while Free Tide held it. | S | Low for the port and the faction. Those ids are already on the row. High if `candidates` surplus or the patron's treasury is included. |
| 3 | A holder-facing occupation block (since, previous faction, harshness). A coarse status for the previous faction and for a captain on the spot, under today's garrison sighting. Stop spreading `foodRatios` and `occupationTerms`. | Occupation | Harshness is why a held port does not regrow and why a retake sheds soldiers. The holder currently gets the raw blob. The faction that would retake gets nothing. | M | Medium. The scalar is the holder's. The resident-grievance term and the food series are the previous faction's private state. |
| 4 | Peace and pacts on the faction row, for both parties: partner, enemy, in force or broken. Name allied joiners on a battle the viewer can already see. | Aftermath, alliances | A player raid is not refused during peace. The client has no way to say so. A pact changes who fights beside them. | M | Medium. Existence and the partner are the point. Grievance, raid ticks, surplus, and causes name the other side's treasury and ports. |
| 5 | Real feed sentences, and briefing rows, for the four facts above. Public port news for purchase and join. Faction-scoped lines for peace and pacts. A defender's raid reason without the attacker's garrison estimate. Leave `data.ai` off the row. | Feed reasons, news | The feed is the mobile log. Today it says "had a settlement purchased recorded" and hides a raid's reason from the faction being raided. | S | Low if ownership news matches claims, and peace stays off the port ledger. Medium if a raid reason includes "garrison believed to be about 133". |
| 6 | Omit `alliance-ledger-opened` and `aftermath-ledger-opened` from the player feed. | Alliances, aftermath | One generic line each, with no ids. Noise on the first tick of a flagged run. | S | Low. They carry no faction. |
| 7 | No picker field on the client. | WG picker | The player needs the order that followed, which is already a later event. The nudge is the captain's option list and a model trace. | S | High if `decision-made` is ever opened to the faction. It is closed today. |

## Open questions

1. Picker provenance stays off the client. Confirm.
2. Occupation. Does the faction that lost the port learn harshness, or only the holder, with a coarse "unquiet" for someone standing there?
3. Peace and pacts. Both parties see partner and enemy. Confirm that grievance, surplus, and the cause strings stay off. Should a player raid during peace be refused by the sim, or only warned by the client?
4. Purchase and join. Public sentences, same as a claim, given the row already names the port and the faction. Confirm rival surplus stays off even for the buyer.
5. Governor name. Own faction only, or also anyone standing in the port who is paying the levy?
6. The dashboard server does not pass these flags, and occupation has no CLI switch. The mobile client needs a session that actually runs them. Who turns them on?

## What was run

Keys were unset in the environment (`env -u DEEPSEEK_API_KEY -u JEV_API_KEY`). No picker was passed. Feed reasons used `stubFeedReasonWriter` (`feed-reasons.ts`). No vendor call. Spend $0.

The HTTP server was not started. The probes called `dashboardState`, `projectEventFeed`, and `projectEvent`, which are the functions `GET /api/state` and `POST /api/advance` call.

- Seed 1847, 120 ticks, `liveSession: true`, flags occupation, alliances, portTransfer, lifecycle, secessionAftermath, exileRecovery. 14,137 events, 293 ms, 16 stub reason calls. Player `character-01` Mara Vane, World Government, at Crown Harbor. This is the settlement, purchase, claim, and upkeep check.
- The same 120 ticks with the session player swapped to `character-14` for one `dashboardState` call, to read the holder's occupation block. The world was not otherwise treated as Free Tide's session.
- Seed 1847, 360 ticks, same flags. 781 ms, 53 stub reason calls. Counts: `settlement-purchased` 1, `character-retired` 3, `character-deserted` 2, `contract-breached` 16, `lifecycle-watch` 26, `lifecycle-watch-cleared` 22, one alliance ledger and one aftermath ledger. No `alliance-formed`, `alliance-broken`, `secession-declared`, `faction-peace`, `faction-peace-broken`, `secession-joined`, `character-promoted`, `character-returned`, or `occupation-integrated`. Those feed shapes are `projectEvent` on constructed payloads.
- Retirement, desertion, and breach rows from the 360-tick log, projected for `character-01` and `character-14`.
