# Directed relationships: scope sketch

Status: **Open / scope sketch only** for the Lead. Base: main `e2508bd` (#197). No prototype, no patch, $0. Reads only: three read-only probes in [directed-relationships-scope/](directed-relationships-scope/) (13 seeds × 1,200 ticks, AI off; outputs in `raw/`, tables in `summary*.txt`). "ATLS" is alliances + port purchase + lifecycle + secession aftermath, exile recovery on; "defaults" is main as it runs today. Every number below is from those probes or from the file cited.

## 1. What after-lifecycle.md means, and what already exists

[after-lifecycle.md §4 option 3](after-lifecycle.md) ("Directed relationships (goals and grudges) as material state", lines 62–66) asks for "a per-pair score written by battles, captures, ransoms, shared pacts; read by lifecycle return and alliance causes" and says "nothing in the current layers changes between characters". The vision source is `autonomous-characters.md:57–68`: one character's state toward another is **directional** (trust, affinity, respect, fear, grievance, obligation), and is **not directly visible to players**. The goals half (`:18`) is out of scope here.

Part of that is already in code, so the sketch builds on it rather than beside it:

| Level | State today | Writers | Readers |
| --- | --- | --- | --- |
| character → character | `Character.relationships`, the six fields (`types.ts:286–295`, `:743`), applied by `relationship-changed` (`state.ts:856–858`) | order victory/defeat (`engine.ts:1123–1142`), shared time at a port (`engine.ts:1767–1815`), contract fulfilled/breached (`engine.ts:2117–2135`, deltas `contracts.ts:23–24`), order confirmed (`engine.ts:3011–3037`), seeded at setup (`scenario.ts:204–217`, `:385`, `:405`) | contract score (`contracts.ts:143–150`), order assessment (`agency.ts:186`), secession "hated" route (`secession.ts:478`, line 0.12 at `:450`), occupation unrest (`occupation.ts:72`), peace gate (`secession-aftermath.ts:117`, `:33`), exile home-claim (`exile.ts:38–42`), tax briefing grudges/allies (`ai-context.ts:50–60`), conversations (`conversations.ts:198`), feed reasons (`feed-reasons.ts:172`), the commander's own view (`visibility.ts:858`) |
| character → faction | none. A capture names only the captor **faction** (`engine.ts:739–780`, `CaptivityState` `types.ts:159`) | none | none |
| faction → faction | no opinion; ledgers of single events: last raid tick per `attacker>defender` (`allianceRaids`, `alliances.ts:27`, written `:115–121`), pact breaks (`allianceMemory`, `:86`), peace records (`secession-aftermath.ts:66`), decline blocks (negotiated-transfer.md §1.6) | event-derived in the reducer | alliance causes, aftermath peace gate, transfer eligibility |

What the probes show about the character level (ATLS, 13 seeds):
- **The map is dense and noisy.** 9,730 entries (616–829 a seed, about 231 bytes each, at most 191 KB a seed). 51,327 `relationship-changed` events, 2.5 % of all events. **93 % are "shared time at a port"** (47,787); contract fulfilled 1,634, breached 932, victory 551, defeat 253, order confirmed 170.
- **No trigger exists for a raid between factions, a capture, a ransom, a pact, a break, a transfer, a promotion or a seat change.** The same runs had 728 raids and 214 captures.
- **Grievance is thin.** 980 of 9,730 entries have earned grievance above or below their setup value; the 90th percentile of grievance is at most 0.029 on every seed (max 0.585 on one). The "hated" secession route is on 3 of 32 ATLS declarations (4 of 31 on defaults); `promise` and `tax` carry the rest (`raw/routes-*.json`).
- **Three existing readers share one field.** Hated route, occupation unrest and the peace gate all read earned `grievance`. Any new writer to `Character.relationships` moves secessions, occupation and peace, and the "secessions on ≥ 6 of 13" gate with them.

So the missing piece is not a second character map. It is (a) a **faction-level** opinion the faction decisions can read, and (b) writers for the consequential events. The faction decisions that matter (who to ally with, who to sell a port to) are faction-level choices that today use only adjacency, a 152-tick raid window and troop counts.

## 2. Why directed

Harm is not mutual. Over 13 seeds on ATLS, 62 faction pairs had harm in either direction in the run: 47 both ways, 15 one way only, and 19 at least 3 : 1 lopsided (defaults 68 / 55 / 13 / 16). The raider, the raided and the captor hold different grievances, so one signed number per pair loses what an ally-attack break, a decline or a refusal turns on. `allianceRaids` is already keyed `attacker>defender` for this reason; it just keeps one tick.

## 3. Proposed v1: a faction-to-faction harm ledger, two readers

**State.** One optional world field, absent when the flag is off, as `alliances` and `secessionAftermath` are (`types.ts:779–781`):

```
world.harm?: Record<"by>on", { tick: number; kind: "raid" | "capture" | "claim" }[]>
```

Key order is the same as `allianceRaids` (`by` hurt `on`). It is named `harm`, not `grievance`, so it cannot be confused with `Relationship.grievance`.

**Writers (derived in the reducer from existing events, like `noteRaid`, `alliances.ts:115`; no new event, no draw).**
- A raid by a B captain on an A-held port (`battle-started`, or `battle-resolved` with no `battleId`, as `noteRaid` counts): B > A.
- `character-captured`: captor faction > the prisoner's faction.
- `settlement-claimed` from another faction: claimer > previous holder.
- Facts the sketch deliberately leaves out of v1: goodwill (a pact or peace is already exact state, `allied()` and the peace list, and 81 such events in ATLS against 1,798 harm events would be a nearly empty window), ransom and debt, rescues, promotions, seat changes, grants. Transfers write nothing (a sale is not harm).

**Decay and persistence.** A sliding count over `ALLIANCE_RAID_WINDOW` = 152 ticks (`alliances.ts:11`, the measured p90 gap between raids by one faction on another, 959 gaps, 13 seeds). No decay constant, no floats: integer ticks, pruned on write, filtered on read. Unit weight 1 per event, so no severity numbers are invented. A later veto or threshold would take its figure from the distribution in `summary-faction.txt` at a named percentile, as the aftermath window did (67, p90 of hold lengths); v1 has none. A raid and the claim it ends in both count (the entry keeps `kind`, so a reader can separate them later). Scale: on ATLS there are 109 ordered pairs with harm over all 13 seeds (2–24 a seed), and the count inside a window at a harm event has median 3–12, p90 9–18, max 27. Against the 616–829 character entries a seed, the ledger is small.

**Readers (v1 picks two; both rank only, neither adds a gate or a threshold).**
1. **Alliance partner order** (`allianceForms`, `alliances.ts:82–95`). Today the first valid pair in faction-id order wins. v1 orders the valid pairs by ascending mutual harm in the window (`harm(p>q) + harm(q>p)`), then id. Formation conditions, causes and breaks are unchanged. Grounding: on the alliance clock a faction has more than one valid partner in 23 of 650 checks on ATLS (approximate, pre-tick; `probe-faction.ts`), so this reader changes few runs.
2. **Transfer receiver ranking** (negotiated-transfer.md §1.3, lines 57–62). Inside each group (pact, peace, rest), insert "least harm the receiver has done the seller in the window" (`harm(R>S)`) before "more docked troops at P". It is the seller's own ledger entry, so no rival treasury is read (#192 stays). Built after negotiated transfer lands, since that is spec only today.

Not v1: loyalty drift (Open and unbuilt, `loyalty-drift.md:3`), lifecycle relationship promotion and persuasion return (`lifecycle.md:23`, `:93`; they need the character level), the WG picker context (changes the prompt, so the replay cache keys and AI cost), secession, occupation, and aftermath peace. The peace gate keeps `allianceRaids`, which is the ledger's one-tick special case; merging them is a later rev, not v1.

## 4. Determinism, hash, visibility

- **Replay.** The ledger is a fold of the event log, so replay is exact by construction.
- **Hash.** `stateHash` is the canonical JSON of the whole world (`state.ts:532`). Flag off: no `harm` field, so every pin, default and ATLS, is unchanged. Flag on: a new pin set, "ATLS + R", needed only where a reader picks differently. Readers alone move the hash, so a "ledger-only" run (writes on, readers off) must equal ATLS once `harm` is removed.
- **Visibility.** Nothing new reaches a client. No new event types. A faction can read ledger entries it is a party to, because it already saw each event (its own ports raided, its own captives, public capture and claim news). It never sees a third party's, and never sees the ranking. This keeps the "knowledge is earned" line of #196. `projectFactions` and the state projection get no field. The existing commander's-own-relationship field (`visibility.ts:858`) is unchanged.
- **AI cost.** None in v1: deterministic, no calls, no prompt change. The WG picker cap (2,108 / 2,510) is untouched by construction, though a changed world could move consult counts, so recount when R goes default-on.

## 5. Properties and checkers

1. Every ledger entry has a source event with the same tick and kind; the ledger recomputed from the event log equals the stored one.
2. `by ≠ on`; no entry older than 152 ticks survives its pair's next write; no entry on a faction that never existed.
3. Flag off: no `harm` field, default and ATLS pins match.
4. Ledger-only run equals ATLS minus the field (writes are inert).
5. Reader 1: at every `alliance-formed` the chosen pair has the minimum mutual harm among the valid pairs recorded in the event's `candidates` (the port-purchase pattern, flag on only), ties by id; formation conditions, one pact per faction, cooldown and break rules still hold (the existing alliance checker, with the protection-pact scoping).
6. Reader 2: the same on `transfer-offered`, plus the existing decline-block and one-transfer-per-tick checks.
7. No client projection contains `harm`, for any viewer; a non-party viewer sees nothing new.
8. Standard gates: replay exact; claims and port changes > 0 on every seed and no new wipeouts; secessions on ≥ 6 of 13. Report only: pacts, pacts broken by ally-attack, ledger sizes, transfers by receiver.

## 6. Layers and flag

New flag `RELATIONSHIPS` (letter R; `--relationships`, `runTick({ relationships })`), default off, named in after-lifecycle.md §4.3. The ledger works with any subset of A, T, L, S (raids, captures and claims exist without them). Reader 1 does nothing unless A is on; reader 2 nothing unless negotiated transfer is. Occupation stays off and unaffected. ATLS default-on and the S flip are not blocked.

## 7. Risks

- **Little visible effect.** Reader 1 has a real choice in about 3.5 % of alliance clocks, so v1 may move few pins and seeds. The value is the ledger and its checkers, for later readers. If the Lead wants visible dynamism, this is the wrong slice.
- **Hash churn.** Contained by the flag and a separate ATLS + R pin set; the standard pins do not move with it off.
- **State bloat.** Small (109 ordered pairs over 13 seeds); pruning bounds each list.
- **Overlap with loyalty and grievance.** Avoided by not writing `Character.relationships`. If it is written later, it feeds the hated route, occupation unrest and the peace gate (§1) and needs its own measurement against the secession gate.
- **Double counting.** A raid and its claim are two entries. Fine for ranking; a thresholding reader must pick kinds.
- **AI cost.** None until a picker or social read uses it.

## 8. Open questions for the Lead (recommended default first)

1. **Level.** Faction-level harm ledger only for v1, character level untouched? *Default: yes.* The alternative (raid, capture and ransom writers into `Character.relationships`) is the larger slice and moves the secession gate through three existing readers.
2. **Harm only, or also goodwill/trust?** *Default: harm only.* Pacts and peace are already exact state; kept-pact trust and rescues wait for a character-level slice.
3. **Readers.** *Default: alliance partner order now, transfer receiver ranking when negotiated transfer is built, nothing else.* Alternative: ship only reader 1 and accept that it may move few seeds.
4. **Should the ledger replace `allianceRaids`** (one tick per pair) and the peace gate's raid check? *Default: no for v1,* keep it byte-identical; fold it in at the next alliance rev.
5. **Player visibility.** Should a player-held faction see its own ledger entries as a "grudges" readout? *Default: no UI in v1;* the events behind it are already visible, and the readout is a client-readiness item after the engine slice.
