# UI cards v1 (spec)

Status: **Proposed**, for the Lead's ruling and then the Engineer. Base: `main` `e1336b2` (includes #200, the UI gap audit). Date 2026-11-27.

This spec follows [ui-gap-audit.md](ui-gap-audit.md) and the Lead's six rulings on it. It covers one slice: **cards v1** (supply contracts, debts, peace and pacts, order reports in one card shape) plus three quick wins: the **sea sighting position**, the **thread filters** (all / direct / group / request), and the **troop quality readout**. All of it is a pure read of records `GET /api/state` already returns. Nothing is stored, no RNG is drawn, no event is added, and the state hash and the replay are untouched.

Reference code and harness: [ui-cards-v1/cards.ts](ui-cards-v1/cards.ts) (the card builder, written as the Engineer would write it) and [ui-cards-v1/measure.ts](ui-cards-v1/measure.ts) (the property and volume harness). Neither is imported by `src/`. Raw results: [ui-cards-v1/results/](ui-cards-v1/results/) (`default.jsonl`, `atls.jsonl`, `atls-fix.jsonl`, `summary.md`).

## 1. Rulings this spec follows

1. Sea sightings are Built. Add the along-leg position at the sighting tick: where the viewer saw the ship, dated. No history, no live tracking.
2. Card v1 covers all four types in ONE card shape with type-specific fields, using the existing party / mate / bystander visibility. NT offers join later, once NT is in `src`.
3. No stored link. A top-level card list with an optional derived `threadId` when a thread exists between the same parties. Storage stays unchanged.
4. Troop training stays behind the skill step. v1 is the label / mark only.
5. `DeterministicDialogueProvider` stays for v1 (see section 11).
6. NPC-initiated threads are the slice after cards.

## 2. Findings that shaped the spec

- **The troop band is already built.** `projectCharacter` returns `progression.troopQuality { experience, discipline, band }` on the viewer's card and a co-located card (`src/dashboard/visibility.ts:884-890`, from `troopQualityBand` at `:692-698`). So the "band readout" quick win is a no-op today. v1 only adds what the card lacks: the troop `count` beside it and the cut values, so the client does not hard-code 0.35 / 0.55 / 0.8. Section 8.
- **Order ids are not unique across holders.** `orderFor` mints `<issuer>:order:<holder>` at setup (`src/sim/scenario.ts:261`), and under lifecycle the same string was found on two living characters (seed 3000, ATLS, tick 1161: `character-01:order:character-10` on both `character-10` and `character-32`). The engine always looks an order up on its holder (`src/sim/state.ts:558`, `src/sim/engine.ts:2697`). The first harness run caught this as 64 order-visibility mismatches under ATLS. The card id therefore includes the holder: `order:<holderId>:<orderId>`.
- **Closed debts do not exist in the projection.** `debt-repaid` with `closed: true` splices the debt out (`src/sim/state.ts:1038`), and `creditorDebtRows` skips `remainingValue <= 0` (`visibility.ts:931`). Every debt card is open. There is no "settled" debt card to build.
- **`FactionPactView.allyFactionId` is misnamed.** It carries `Alliance.enemyFactionId` (`src/dashboard/client-readiness.ts:207`). The card calls the field `againstFactionId` and leaves the existing field alone (open question 1).
- **Closed supply contracts pile up.** `world.contracts` is never pruned, so by tick 1,200 the commander's unwindowed list is 47 to 193 cards (section 9). The spec therefore serves a closed card only while it is at most 180 ticks old (`CHECK_IN_TICKS`, `src/dashboard/view-model.ts:87`). Open cards always stay. The existing `contracts[]` array is unchanged and stays unwindowed.
- **Peace and pact cards need flags.** Under the default flag set `{}` the commander never has a peace or pact record (0 on all 13 seeds). They show up under ATLS (section 9).
- **Headless runs create no threads**, so thread derivation was proven on a cloned world with threads built through `createConversationThread` and `sendConversationMessage`, not on live seed runs.

## 3. `/api/state` additions

All three are new keys on the existing response. Existing keys do not change shape, except one added field on each `SeaSighting` row.

```ts
// A. Top-level, sibling of `contracts` and `conversations` (src/dashboard/view-model.ts:1684-1700).
interface StateCards { cards: UiCard[] }

// B. `conversations` gains one sibling key.
interface ConversationTabs {
  tabs: { all: string[]; direct: string[]; group: string[]; request: string[] };  // thread ids
}

// C. SeaSighting (visibility.ts:229-245) gains one field.
interface SeaSightingPosition {
  along: number;        // 0..<1, fraction of the SUBJECT's own leg done at observedTick
  x: number;            // settlement-grid point on the fromId->toId line at `along`
  y: number;
  observedTick: number; // equals the row's observedTick (the snapshot tick)
}
// SeaSighting.position: SeaSightingPosition
```

### 3.1 The card

```ts
type CardKind = "supply-contract" | "debt" | "peace" | "pact" | "order-report";
type CardRole = "buyer" | "carrier" | "mate" | "debtor" | "creditor" | "signatory" | "issuer" | "holder";
interface CardParty { kind: "character" | "faction"; id: string; name: string; side: string }

interface CardBase<K extends CardKind, D> {
  id: string;               // stable, see 4
  kind: K;
  role: CardRole;           // the viewer's role on this card
  status: string;           // the source status, verbatim
  open: boolean;            // still waiting or in force
  actionRequired: boolean;  // the viewer must answer (see per type)
  observedTick: number;     // the dated tick the card describes
  ageTicks: number;         // tick - observedTick, floored at 0
  parties: CardParty[];     // names come from the projected characters / factions only
  threadId: string | null;  // derived, 6
  detail: D;
}
type UiCard = SupplyContractCard | DebtCard | PeaceCard | PactCard | OrderReportCard;
```

Per type (`D` = the `detail` object). Source column is the record the field is read from.

| Card | `detail` fields | Source (file:line) |
|---|---|---|
| `SupplyContractCard` | `good: "provisions"`, `destinationId`, `deadlineTick`, `revision`, `source: "own-character" \| "faction-report"`, `quantity`, `price`, `escrow` (the last three `number \| null`) | `ProjectedContract` `visibility.ts:615-630`, built by `projectSupplyContracts` `:639-650`; stored record `SupplyContract` `src/sim/types.ts:427-455`. `status` is `offered \| accepted \| refused \| fulfilled \| breached \| cancelled` (`types.ts:405-412`); `open` = offered or accepted; `observedTick`/`ageTicks` copied from the projected row. |
| `DebtCard` | `originalValue`, `remainingValue`, `incurredTick`, `reason` | Debtor: the viewer's own `characters[viewer].debts` (`visibility.ts:819`, `DebtObligation` `types.ts:150-157`). Creditor: the viewer's own faction row `debts` (`creditorDebtRows` `visibility.ts:909-942`, attached `:986`). `status` is always `"open"`, `open` always true. `observedTick` = `incurredTick`. |
| `PeaceCard` | `withFactionId`, `sinceTick` | `factions[own].diplomacy.peace` (`diplomacyFor` `client-readiness.ts:217-224`; `FactionPeaceView` `:40-43`; `peaceViews` `:191-200`, from `world.secessionAftermath.peace`). `status` `"in-force"`. |
| `PactCard` | `withFactionId`, `sinceTick`, `againstFactionId` | `factions[own].diplomacy.pacts` (`pactViews` `client-readiness.ts:201-212`, from `alliancesOf(world)`). `againstFactionId` = the view's `allyFactionId` = `Alliance.enemyFactionId` (`:207`). `status` `"in-force"`. |
| `OrderReportCard` | `orderId`, `directive`, `targetId`, `priority`, `issuedTick`, `expiresTick`, `revision`, `adherence`, `deviationCount`, `lastReport` | `characters[*].standingOrders`, filtered by `visibleStandingOrders` (`visibility.ts:129-132`); stored `StandingOrder` `types.ts:458-472`, `StandingOrderReport` `:399-403`. A card exists only when `lastReport` is non-null. `status` is `pending \| active \| refused \| awaiting-confirmation \| completed \| expired \| cancelled` (`types.ts:388-395`); `open` = pending, active, or awaiting-confirmation; `observedTick` = `lastReport.tick`. |

`actionRequired`: true only on an order-report card where the viewer is the **issuer** and `status === "awaiting-confirmation"`. It is false on every other card in v1 (NT offers will set it later).

Field rules shared by all cards:

- Money and counts appear only where the source row already carries them for this viewer (`quantity`, `price`, `escrow` are `null` for a mate, exactly as today).
- A name in `parties` is read from the projected `characters[]` / `factions[]` the viewer already has. An id with no projected name falls back to the id string, never to a world lookup.
- `detail` copies fields; it does not copy whole records. The field lists above are closed. Section 7 pins the denied keys.

### 3.2 Thread tabs

`tabs` holds thread ids from the viewer's own `conversations.threads` (already participant-filtered, `view-model.ts:1686-1693`), sorted by `lastMessageTick` desc (null last), then `createdTick` desc, then id ascending.

- `all`: every thread.
- `direct`: `kind === "direct"`. `group`: `kind === "group"`. The two partition `all`.
- `request`: threads whose `createdById !== viewer`. The art-direction line (`ui-art-direction.md:80`) names the tab but does not define it; this is the proposed meaning. Today the player is the only thread creator (`createConversationThread`, `src/sim/conversations.ts:119-175`), so `request` is empty until NPC-initiated threads ship. That is intended.

### 3.3 Sea sighting position

`seaRow` (`visibility.ts:354-373`) gets `position`, computed from the **subject's** `TravelState` (`types.ts:241-249`) and the two settlement positions at the snapshot tick:

`along = (totalTicks - remainingTicks) / totalTicks`, rounded to 3 places; `x`, `y` = linear interpolation between `settlements[fromId].position` and `settlements[toId].position`, rounded to 3 places; `observedTick` = `world.tick`.

`along` is 0 at departure and always below 1 while `atSea` (`visibility.ts:257-262` requires `remainingTicks >= 1`). A row is emitted only when the viewer is at sea and the two voyages overlap (`seaSightingsFor` `:444-455`, `meetingKind` `:337-352`), so the position inherits that rule. The list is recomputed each read and keeps nothing once the ships separate (`:436-443`); nothing is kept. `outOfStretchFor` rows (`:417`) get no position.

## 4. Ids and ordering

| Kind | `id` |
|---|---|
| supply-contract | `contract:<contractId>` |
| debt | `debt:<debtId>` (a debt that is both the viewer's own and in the viewer's faction list is one card, debtor role wins) |
| peace | `peace:<factionA>\|<factionB>:<sinceTick>`, the two faction ids in code-unit order |
| pact | `pact:<factionA>\|<factionB>:<sinceTick>`, same |
| order-report | `order:<holderId>:<orderId>` (the holder is in the id because order ids repeat across holders, section 2) |

Order of `cards`: open before closed, then `observedTick` descending, then `id` ascending by **code unit** (`a < b`), not `localeCompare`. The existing projections sort with `localeCompare` (`visibility.ts:641`, `:929`, `:954`; `client-readiness.ts:199`, `:230`); the card list does not depend on those orders, so mixed ordering cannot move a card.

Retention: open cards always; a closed card only while `ageTicks <= 180`. Debts, peace, and pacts are always open and never age out.

`cards` is a pure function of `(projected state, tick)`. Two builds from the same projected state are byte-identical, and a replay to the same tick produces the same `cards` (checked, section 10).

## 5. Visibility per type and per viewer role

The viewer is the commander (`world.players[0]`); `/api/state` has no other viewer. The builder takes the projection as input, so a role below can only see what the projection already gives that role. The harness also builds cards for every living character as a viewer (about 30 per seed) to test the other roles.

| Type | Role | Gets a card | Fields |
|---|---|---|---|
| supply-contract | buyer or carrier (`party`) | yes, `role` buyer / carrier, `source: "own-character"` | all, including `quantity`, `price`, `escrow`; `threadId` if a direct thread exists between buyer and carrier |
| supply-contract | faction mate of either party | yes, `role: "mate"`, `source: "faction-report"` | `quantity`, `price`, `escrow` are `null`; `threadId` always `null` |
| supply-contract | bystander (any other character, including one standing beside the purse) | **no card** | none |
| debt | debtor (the viewer) | yes, `role: "debtor"` | all four detail fields |
| debt | member of the creditor faction | yes, `role: "creditor"`, debtor named | the debtor's purse, cargo, and other debts are not on the row (`visibility.ts:909-912`) |
| debt | anyone else | no card (a rival faction row has `debts: null`, `visibility.ts:982-986`) | none |
| peace / pact | a member of either faction | yes, `role: "signatory"` | `withFactionId`, `sinceTick` (pact adds `againstFactionId`); no cause, grievance, or surplus |
| peace / pact | member of neither | no card | none |
| order-report | holder (the viewer holds it) | yes, `role: "holder"` | all detail fields |
| order-report | issuer (the viewer issued it) | yes, `role: "issuer"` | all detail fields; `actionRequired` when awaiting confirmation |
| order-report | anyone else | no card (`visibleStandingOrders`, `visibility.ts:129-132`) | none |

`threadId` (every type that has two character parties): the id of the viewer's `direct` thread whose participants are exactly the two parties. It is `null` when the viewer is not one of the two, when the card is a mate card, or when no such thread exists. `createConversationThread` allows one direct thread per pair (`conversations.ts:139-145`), so the match is unique.

## 6. Privacy properties (each one is a check in `measure.ts`)

Let a *viewer* be any living character and `P(v)` the projection `dashboardState` would give them.

| # | Property | Harness check |
|---|---|---|
| P1 | **Subset.** Every field of every card is read from `P(v)` (the projected contracts, factions, characters, threads) plus `world.tick`. The builder reads nothing else; the sea position is the only exception and reads the subject's own leg. | builder takes `Projected` only (`cards.ts`); `purity` |
| P2 | A bystander never gets a supply-contract card, so never sees its terms (`price`, `quantity`, `escrow`). | `contract-visibility`: for every contract and every viewer, a card exists iff the viewer is a party or a faction mate of a party |
| P3 | A faction mate's contract card has `price`, `quantity`, `escrow` all `null` and `threadId` null. | `contract-visibility` |
| P4 | No card contains a withheld key at any depth: `cause`, `causes`, `evidence`, `grievance`, `surplus`, `treasury`, `factionTreasury`, `portsAtForm`, `escrowFromTreasury`, `escrowFromPurse`, `settled`, `score`, `ai`, `personality`, `plan`, `knowledge`, `activeOrderAssessment`, `money`, `cargo`. | `denied-key:<key>` (deep key walk of the whole list) |
| P5 | No stored `cause` string from a peace record or a pact `causes` map appears anywhere in the card JSON. | `peace-cause-leaked`, `pact-cause-leaked` |
| P6 | Debt cards: a debtor card only for the viewer's own debts; a creditor card only in the viewer's own faction; the debtor's purse is never present. | `debt-visibility` |
| P7 | Peace and pact cards exist exactly for the viewer's own faction's records, and the viewer's faction is always one of the two parties. | `peace-visibility`, `pact-visibility`, `diplomacy-viewer-not-party` |
| P8 | Order cards: exactly the orders the viewer holds or issued, and only with a report. | `order-visibility` |
| P9 | `threadId` is non-null only if that thread is in the viewer's own `conversations.threads`, i.e. the viewer is a participant, and both parties are among its participants. | `threadid-derivation`; `tabs-exclude-non-participant` (a constructed thread between two other characters never appears in the viewer's tabs or on a card) |
| P10 | Sea position exists only on a row `seaSightingsFor(world, viewer)` already emits for that viewer: the viewer is at sea and the voyages overlap. It is dated at that row's `observedTick`, `0 <= along < 1`, and `(x, y)` lies in the bounding box of the leg's two settlements. No `outOfStretchFor` row has a position or troops. | `sea-position`, `outOfStretchRowsWithPosition == 0` |
| P11 | Hash-neutral and pure: building cards, tabs, positions, and the troop readout for every viewer changes neither `stateHash` nor the JSON of the world. | `purity` (hash and full JSON before and after, every 200 ticks) |
| P12 | Troop readout equals `progression.troopQuality.band` and the troop figures already on the viewer's own card; a card the viewer cannot see troops on has none. | `troop-readout` |

## 7. Troop readout (v1: label only)

Today: `progression.troopQuality { experience, discipline, band }` or `null` (`visibility.ts:884-890`). v1 adds, on the same object, `count` (= `troops.count`, already on `characters[].troops`) and `cuts: [0.35, 0.55, 0.8]` (the constants in `troopQualityBand`, `:692-698`). The `null` rule is unchanged, so no foreign troop figure appears (`ui-art-direction.md:49`, audit 5.1). No training, promotion verb, or rarity: those wait for the skill step (ruling 4).

## 8. Where it goes in the code (for the Engineer)

- `src/dashboard/cards.ts` (new): `buildCards`, `threadTabs`, `seaPosition`. Start from `docs/design/ui-cards-v1/cards.ts`; its `projectFor` helper is harness-only, `dashboardState` already has the projected pieces in hand.
- `view-model.ts`: add `cards` next to `contracts` (`:1684`) and `tabs` inside `conversations` (`:1686`).
- `visibility.ts`: `seaRow` adds `position` (`:354-373`); `projectCharacter` adds `count` and `cuts` to `troopQuality` (`:884-890`).
- Types go beside `FactionPactView` in `client-readiness.ts`, which the client is meant to import.
- The `/api/state` event feed and `stripPlayerEventData` (`client-readiness.ts:348-421`) are not touched.

## 9. Measured

Commit `e1336b2`, offline, no AI, $0, 1,200 ticks, 13 seeds (1847, 2718, 4096, 1000 to 10000 step 1000), each on three configs. Replay is `replayWithSilentStarts` from the recorded events and is exact on all 39 runs. Property violations: **0** on all 39 runs (377,000 checks in the default config alone). The harness took about 30 s per config for all 13 seeds.

**Flag-off pins (default `{}`), verified on `e1336b2` before anything else. Unchanged:**

| Seed | t72 | t1200 | Pinned |
|---|---|---|---|
| 1847 | 7f76e474 | 94de9c02 | 7f76e474 / 94de9c02 |
| 2718 | 976c40bd | 7a3741c9 | 976c40bd / 7a3741c9 |
| 4096 | 08943ea5 | af6eeaea | 08943ea5 / af6eeaea |

The harness ran with the cards built on every snapshot, and the default hashes above are the ones it recorded, so building cards did not move them.

Card counts are for the commander (the `/api/state` viewer, `world-government` on all seeds). The list is rebuilt every tick for the "distinct cards served" and action-required columns, and read at tick 72 and every 100 ticks for the peaks. Cells are `open+closed`.

### default `{}` (the flag-off pins)

| seed | hash t72 | hash t1200 | replay | served at t1200 (contract / debt / peace / pact / order, open+closed) | unwindowed at t1200 | peak served | peak unwindowed | distinct cards served over the run (C / D / Pe / Pa / O) | action-required: ticks, max at once, distinct | all-viewer served at t1200 min / med / max |
|---|---|---|---|---|---|---|---|---|---|---|
| 1847 | 7f76e474 | 94de9c02 | exact | 16 (0+14 / 2+0 / 0+0 / 0+0 / 0+0) | 120 | 47 | 123 | 123 / 9 / 0 / 0 / 12 | 23, 5, 9 | 0 / 6 / 16 |
| 2718 | 976c40bd | 7a3741c9 | exact | 9 (0+0 / 9+0 / 0+0 / 0+0 / 0+0) | 47 | 19 | 47 | 26 / 13 / 0 / 0 / 12 | 22, 4, 7 | 0 / 5 / 11 |
| 4096 | 08943ea5 | af6eeaea | exact | 8 (0+4 / 4+0 / 0+0 / 0+0 / 0+0) | 143 | 61 | 143 | 146 / 5 / 0 / 0 / 12 | 21, 6, 10 | 0 / 4 / 16 |

### ATLS (alliances + portTransfer + lifecycle + secessionAftermath)

| seed | hash t72 | hash t1200 | replay | served at t1200 (contract / debt / peace / pact / order, open+closed) | unwindowed at t1200 | peak served | peak unwindowed | distinct cards served over the run (C / D / Pe / Pa / O) | action-required: ticks, max at once, distinct | all-viewer served at t1200 min / med / max |
|---|---|---|---|---|---|---|---|---|---|---|
| 1847 | 85658e53 | 5367691c | exact | 5 (0+3 / 1+0 / 0+0 / 1+0 / 0+0) | 141 | 70 | 141 | 132 / 4 / 0 / 3 / 12 | 23, 5, 9 | 0 / 3 / 5 |
| 2718 | aa54ada1 | faf5798a | exact | 10 (0+7 / 3+0 / 0+0 / 0+0 / 0+0) | 61 | 14 | 61 | 46 / 4 / 0 / 1 / 12 | 22, 4, 7 | 0 / 6 / 10 |
| 4096 | e4361ee1 | 7e93eab2 | exact | 18 (0+16 / 1+0 / 1+0 / 0+0 / 0+0) | 148 | 74 | 164 | 151 / 2 / 1 / 0 / 12 | 21, 6, 10 | 0 / 8 / 19 |

### ATLS + `protection-pact-fix/fix.patch` (throwaway tree, not committed)

| seed | hash t72 | hash t1200 | replay | served at t1200 (contract / debt / peace / pact / order, open+closed) | unwindowed at t1200 | peak served | peak unwindowed | distinct cards served over the run (C / D / Pe / Pa / O) | action-required: ticks, max at once, distinct | all-viewer served at t1200 min / med / max |
|---|---|---|---|---|---|---|---|---|---|---|
| 1847 | 85658e53 | 5367691c | exact | 5 (0+3 / 1+0 / 0+0 / 1+0 / 0+0) | 141 | 70 | 141 | 132 / 4 / 0 / 3 / 12 | 23, 5, 9 | 0 / 3 / 5 |
| 2718 | aa54ada1 | faf5798a | exact | 10 (0+7 / 3+0 / 0+0 / 0+0 / 0+0) | 61 | 14 | 61 | 46 / 4 / 0 / 1 / 12 | 22, 4, 7 | 0 / 6 / 10 |
| 4096 | e4361ee1 | 7e93eab2 | exact | 18 (0+16 / 1+0 / 1+0 / 0+0 / 0+0) | 148 | 74 | 164 | 151 / 2 / 1 / 0 / 12 | 21, 6, 10 | 0 / 8 / 19 |

Ranges over all 13 seeds (`results/summary.md` has every row):

| Config | served at t1,200 | unwindowed at t1,200 | peak served | peak unwindowed | distinct supply contracts served | distinct debts | seeds with a peace card | seeds with a pact card | distinct order cards | action-required ticks | max action-required at once |
|---|---|---|---|---|---|---|---|---|---|---|---|
| default | 3 to 31 | 47 to 193 | 19 to 63 | 47 to 193 | 26 to 181 | 0 to 13 | 0 of 13 | 0 of 13 | 12 to 12 | 21 to 34 | 3 to 6 |
| ATLS | 0 to 39 | 57 to 193 | 14 to 83 | 61 to 193 | 46 to 183 | 1 to 10 | 6 of 13 | 8 of 13 | 12 to 12 | 21 to 34 | 3 to 6 |
| ATLS + fix | 0 to 39 | 57 to 193 | 14 to 80 | 61 to 193 | 46 to 183 | 1 to 10 | 5 of 13 | 8 of 13 | 12 to 12 | 21 to 34 | 3 to 6 |

Reading it:

- **Contracts** are on every seed and dominate volume; the 180-tick window cuts the served list to roughly a third (default 1847: 120 unwindowed vs 16 served at t1,200).
- **Debts**: at least one debt card was served at some tick on 11 of 13 default seeds (0 on seeds 6000 and 10000) and 13 of 13 under ATLS. They are always open.
- **Peace and pacts** are 0 in the default config on every seed (nothing is ever created). Under ATLS the commander was served a peace card on 6 seeds and a pact card on 8. Records ever created in the whole world over the run: peace on 9 seeds and pacts on 11, so most are between other factions and correctly produce no commander card.
- **Order reports**: 12 distinct cards per seed, all from the setup standing orders. The status each card was first served with, of the 12 on a seed: `active` 5 to 10, `awaiting-confirmation` 0 to 3, `refused` 1 to 6 (per seed in `results/*.jsonl`, field `commanderEver.orderFirstStatus`). `actionRequired` was first true at tick 1 (or 4 on seeds 2000 and 3000) and was true on 21 to 34 ticks per seed, with 3 to 6 cards at once (so it is a measured live case, not only a constructed one). By tick 1,200 none is served: the open ones close and the 180-tick window drops them. The harness also checks the case on a constructed state (an issued order set to `awaiting-confirmation` in a cloned world: issuer true, holder false, 13 of 13).
- **Sea sightings**: 56,339 rows across all viewers and ticks in the default config (53,059 ATLS), at most 13 rows for one viewer in one tick. The commander had at least one row on 7 of 13 seeds in both configs (default seed 1847: 2 rows over 1 tick; 4096: 6 rows over 3 ticks). Every row's position passed the bounds check.
- **Thread tabs**: live runs have no threads. On a cloned seed-1847 world with 9 threads built through the real conversation functions: `all` 9, `direct` 8, `group` 1, `request` 0, and 8 cards carried a `threadId`.
- ATLS + fix differs from ATLS only where the fix changes the run (seeds 2000 and 9000, final hashes `b00e3f0d` and `dc57fb34` vs `b604ba81` and `d35f7fa4`). It was applied in a throwaway worktree and is not part of this branch.

Reproduce: `node --experimental-strip-types docs/design/ui-cards-v1/measure.ts <label> '<TickOptions JSON>'` (env `SEEDS`, `TICKS`; default 13 seeds, 1,200 ticks).

## 10. Acceptance

Property and liveness checks, not golden snapshots of card lists:

1. **Pins.** With the flag set `{}`, hashes at tick 72 and 1,200 equal 7f76e474 / 94de9c02 (1847), 976c40bd / 7a3741c9 (2718), 08943ea5 / af6eeaea (4096), and `tests/fixtures/golden-hashes.json` is unchanged. Re-verified on `e1336b2` for this spec: no move.
2. **Replay exact.** Replay with `replayWithSilentStarts` matches the live hash, and `cards` at the final tick is byte-identical between the live world and the replay.
3. **Purity.** P11 on every seed.
4. **Liveness** (cards appear where source records exist): for each seed and config, if the commander has a visible contract, debt, peace, pact, or reported order in the projection at tick `t`, then the card list at `t` has a card with the matching id (subject to the 180-tick closed window). The converse: no card without a source record. Checked per viewer as the visibility tables in section 5.
5. **Privacy** P1 to P12 hold for every living viewer on every seed in default and ATLS.
6. **Ordering and ids**: ids unique within one list; list sorted open first, `observedTick` desc, id asc; two builds equal.
7. **Window rule**: the served list equals the unwindowed list with closed cards older than 180 removed.
8. **ATLS liveness**: at least one peace and one pact card appear on the seeds listed in section 9 (6 and 8 of 13), measured, not assumed.

## 11. Test plan for the Engineer

1. `tests/cards.test.ts`: unit tests on small constructed worlds for each type and role in section 5 (party, mate, bystander; debtor, creditor, other; signatory, other; holder, issuer, other). Assert the `null` fields for a mate and the absence of a card for a bystander.
2. A denied-key test: walk the whole `cards` list at every viewer for several seeds and fail on any key in P4, and on any contract `terms` for a non-party.
3. A collision test: two characters holding orders with the same `orderId`; both produce distinct card ids; the viewer who issued both sees two cards.
4. `threadId` tests: a direct thread between buyer and carrier (found), the same pair in a group thread only (not found), a thread the viewer is not in (never found, never in `tabs`), a mate card (always null).
5. `tabs` tests: partition of direct and group; `request` empty for player-created threads, and containing a thread created by another participant (constructed in a clone).
6. Sea: a two-ship fixture where the position of the subject is 0 at departure, below 1 on the last tick, dated at the snapshot tick; no position when the viewer is docked or the voyages do not overlap; `outOfStretchFor` rows untouched.
7. Troop readout: `count` and `cuts` present on the viewer's card; `null` on a card with no troop view; band equals `troopQualityBand(experience)`.
8. A determinism test: same seed, two runs, equal `cards`; plus a replay test.
9. Run the harness (`measure.ts`) as a CI-optional script and keep the three pins as the gate. Existing `/api/state` shape tests may deep-equal the response; update only for the new keys.
10. Keep `npm test` and `tsc --noEmit` green; the harness files under `docs/` are plain `.ts` run by Node's type stripping and are not in the build.

## 12. Non-goals

- No stored link between a card and a thread, no new world field, no new event, no new command. Storage stays unchanged.
- No NT offers (they join once NT is in `src`), no accept / refuse / answer verbs on cards, no `actionRequired` beyond the issuer-awaiting-confirmation order case.
- No pruning of `world.contracts` and no change to the existing `contracts[]` array or its `localeCompare` order.
- No sea history, no live tracking, no position for other viewers' sightings, no `outOfStretchFor` position.
- No troop training, promotion verb, rarity, or per-recruit breakdown. No foreign troop numbers.
- No NPC-initiated threads (the slice after cards) and no change to `DeterministicDialogueProvider`.
- No second viewer: `/api/state` stays single-viewer. The all-viewer runs are a test device only.
- No rename of `allyFactionId`, no change to the diplomacy view.

## 13. Follow-ons (mentioned, not specified)

- **NPC-initiated threads**: the slice after cards. It makes the `request` tab non-empty.
- **`ai.speech`**: a dedicated dialogue model role (opt-in, recorded and replayable, spending only on player sends), replacing `DeterministicDialogueProvider` when it ships. v1 does not depend on it and nothing here constrains it.
- **NT offers** join the card list once NT is in `src`.

## 14. Open questions for the Lead

1. `FactionPactView.allyFactionId` actually holds the enemy faction id (`client-readiness.ts:207`). The card calls it `againstFactionId`. Rename the existing field too (a client-visible change), or leave it and let the card carry the right name?
2. Closed-card retention: 180 ticks (`CHECK_IN_TICKS`) for every closed card, or a different window, or a per-type cap? The window drops the served list to 3 to 31 (default) from 47 to 193.
3. Is the `request` tab definition (`createdById !== viewer`) what you want, or should it also cover any thread with an unanswered incoming message?
4. The troop readout is already in the projection. Is adding `count` and `cuts` worth it, or is the readout done?
5. Order cards for closed reports older than 180 ticks drop out of `cards`, but the order stays on the character card in `standingOrders`. Is that acceptable for the mobile client, or should the last report of a still-open order always show?
