# Jev social picker for all of Free Tide (slice 4)

Status: **Open / build spec.** Docs only; no live call was made for this spec. Base `origin/main` `a736008` (#143 merged). Builds on slice 3 (`jev-action-picker.md`, accepted with its proposals) and slice 1 (`feature/ai-tax-weighted` at **`7636a40`**). `engine.ts:N` cites main `a736008` (engine unchanged since `0bed4c5`: `git diff --stat 0bed4c5 a736008` is 2 docs files); `@7636a40 file:N` cites that branch.

## 1. Scope

- **Who.** Every character whose `factionId === "free-tide"` (`src/sim/scenario.ts:329`; faction name "Free Tide Compact", `scenario.ts:288`) *at the moment of the decision*. At tick 0 that is `character-14`…`character-22` (9 members, all three seeds). A member who deserts or secedes stops being consulted from that decision on; nobody joining later is excluded.
- **What.** Slice 3's picker (`jev-action-picker.md` §2–§7) unchanged in mechanism, widened from the holder to all members, plus a **social read** per member fed into the pick's `state` as full distributions.
- **Not in scope.** Reads never write the world: no loyalty, grievance, desertion or morale field is changed by a read. Desertion stays the existing morning side-stream roll (`resolveMorningDesertion`, `engine.ts:3680–3698`; `desertionRngState`, `types.ts` per `ai-brain.md`). Social metrics can move only because picks change the world.

## 2. Measured offline (a736008, Node v24.22.1, 1,200 ticks)

Uncommitted counter after `buildCandidates` (`engine.ts:3961`) in a scratch worktree, removed after. End hashes equal flag off (`f80c529f/165833`, `2b5060c0/157639`, `e8ae4443/162123`), so the counter changed nothing. "Consults" = Free Tide members' calls into `buildCandidates` with a location; each emitted a `decision-made` (counts equal on all seeds).

**Members over time** (count of `factionId === "free-tide"` every 120 ticks, t = 0 … 1200):

| Seed | 0 | 120 | 240 | 360 | 480 | 600 | 720 | 840 | 960 | 1080 | 1200 | Desertions from Free Tide |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | ---: |
| 1847 | 9 | 9 | 9 | 9 | 7 | 7 | 7 | 2 | 1 | 1 | 1 | 3 |
| 2718 | 9 | 9 | 9 | 9 | 9 | 9 | 9 | 8 | 8 | 8 | 8 | 0 |
| 4096 | 9 | 9 | 7 | 7 | 2 | 1 | 1 | 1 | 1 | 1 | 1 | 2 |

(Drops beyond desertions are secessions/other exits; not split further here.)

**Decisions, options, skips:**

| Seed | Member decisions | Per member min / median / max | Options min / median / max | Legal min / median / p90 / max | Skip: legal < 2 | Skip: raid or claim legal | Skip: haul can act | **Eligible picks** | Max eligible per tick |
| ---: | ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1847 | 4,794 | 217 / 535 / 853 | 8 / 8 / 9 | 3 / 7 / 8 / 9 | 0 | 233 | 25 | **4,537** | 9 |
| 2718 | 7,712 | 301 / 989 / 1,190 | 8 / 8 / 9 | 3 / 7 / 7 / 9 | 0 | 493 | 20 | **7,211** | 9 |
| 4096 | 3,070 | 74 / 304 / 930 | 8 / 8 / 9 | 3 / 7 / 8 / 9 | 0 | 126 | 22 | **2,922** | 8 |

(Skips are counted independently; eligible = no skip applies.) Each actor decides at most once per tick (one pass per character, `engine.ts:3961`), so slice 3's draw key stays unique.

**Relationships and grudges per member, at decision time** (`character.relationships`, `types.ts:267–276`; grudge = `grievance > 0`, as `@7636a40 ai-context.ts:51–55`):

| Seed | Relationships median / mean / max | Grudges median / mean / max | Decisions with ≥ 1 grudge |
| ---: | --- | --- | ---: |
| 1847 | 20 / 17.81 / 28 | 2 / 2.90 / 5 | 4,794 of 4,794 |
| 2718 | 22 / 19.96 / 27 | 3 / 3.11 / 6 | 7,712 of 7,712 |
| 4096 | 16 / 15.23 / 25 | 2 / 2.50 / 6 | 3,070 of 3,070 |

The briefing keeps the top `BRIEFING_TOP = 3` grudges (`@7636a40 ai-context.ts:33`), so a read asks 1 loyalty + at most 3 grudge questions.

**How stable the read input is.** Signature = loyalty (`personality.loyalty + loyaltyAdjustment`, ×100 rounded, as `@7636a40 ai-context.ts:71`) + top-3 grudges (id, grievance ×100 rounded). Between a member's consecutive eligible picks (median gap 1 tick on all seeds) it was unchanged in 4,464 / 4,528 (1847), 7,148 / 7,202 (2718), 2,864 / 2,913 (4096). Read requests needed under the cache rule of §5 (miss = no entry, signature changed, or entry older than the expiry):

| Seed | Expiry 24: reads / read questions | Expiry 48 | Expiry 120 |
| ---: | --- | --- | --- |
| 1847 | 293 / 1,003 | 171 / 588 | 98 / 338 |
| 2718 | 404 / 1,420 | 225 / 791 | 121 / 429 |
| 4096 | 187 / 622 | 112 / 374 | 73 / 248 |

**Flag-off variety baseline for the gate** (`npm run dynamism` at `5c57c6d`, sim identical to main): mean `entropyBits` over `character-14`…`22` = **1.8683** (1847), **1.7446** (2718), **1.9165** (4096); faction-wide desertions 4 / 0 / 5 (`dynamism-readout.md` baseline). These are whole-run per-actor figures, including decisions after an actor left Free Tide.

## 3. The reader output

Reuse Pilot B's reader for any member: `buildTaxStepBriefing(world, memberId)` already takes the character id (`@7636a40 ai-context.ts:45`), validated by `validateBriefing` (`:99`). Answers are kept as **full distributions**:

```json
"social": {
  "loyalty": { "firm": 0.62, "wavering": 0.30, "breaking": 0.08, "confidence": 0.41 },
  "grudges": [ { "id": "character-03", "low": 0.2, "mid": 0.5, "high": 0.3, "confidence": 0.33 } ],
  "readTick": 412, "readInputHash": "sha256:…"
}
```

(Values are shape only.) Labels are `LOYALTY_READS` and `GRUDGE_WEIGHTS` (`@7636a40 ai-context.ts:9,11`). Read-only: the block only enters the pick request's `state` and the record. The slice-1 triage rule that escalates on `breaking` (`@7636a40 ai-weighted.ts:148–156`) is not used here.

## 4. Questions (exact wording)

The read request reuses Pilot B's criteria verbatim (`@7636a40 src/sim/ai-vendor/jev.ts:17–26`) with "the holder" changed to "this character", since members are not holders:

- `loyaltyRead` — *"How firm is this character's loyalty to their faction?"* Criteria: `firm` "This character is settled in the faction and would not consider leaving."; `wavering` "This character has doubts or grievances that could push them away."; `breaking` "This character is close to leaving or acting against the faction."
- `grudge_0` … `grudge_2` — *"How heavy is this character's grudge against ${id}?"* Criteria unchanged: `low` "A minor grievance that would not change what they do."; `mid` "A grievance that colours their choices."; `high` "A grievance that could drive them to act against the other."

The pick question is slice 3's `next_action` unchanged (`jev-action-picker.md` §3), with "your loyalty and grudges" added: *"You are this character. Given your temperament, purse, crew, your loyalty and grudges, and what you know, which one of these actions would you most likely take now?"* Both templates are hashed into `promptVersion` (`readPromptVersion`, `pickPromptVersion`).

## 5. Request shape, caching

**Two requests, decided.** One combined request cannot feed the reads into the pick: Jev answers every question in a request from the same `state` (`jev-capabilities.md` §2), so the pick would never see the read distribution. It would also repeat 1 + up to 3 read questions on every one of up to 7,211 picks, with no caching. Trade-off:

| | One request | Two requests (chosen) |
| --- | --- | --- |
| Calls per run (max seed, 2718) | 7,211 | 7,211 picks + 404 reads = 7,615 |
| Reads reach the pick's state | No | Yes |
| Read questions sent | up to 4 × 7,211 (bounded by grudge count) | 1,420 |
| Latency per eligible pick | 1 round trip | 1, or 2 on a cache miss (404 of 7,615) |

Round-trip time is unmeasured in this repo; the bound is the 2,000 ms timeout (`@7636a40 ai-context.ts:213`) per call. Calls are serial because each actor's candidates depend on earlier actors' resolution in the same tick (main `rng`, `engine.ts:4003`).

**Cache.** Key = `sha256(readPromptVersion + ":" + memberId + ":" + canonicalJson(signature))`, signature as in §2. Expiry **24 ticks** (proposed: the shortest measured, 293 / 404 / 187 reads). A hit reuses the stored distributions; a miss asks Jev. The cache is a run-local map built only from recorded read records, so it is a pure function of the event log: replay rebuilds it from `data.ai.read` records in event order and gets the same hits and misses. Not in `WorldState`, not in `stateHash`.

## 6. State cap

Pick `state` = slice 3's (character, Pilot B briefing, situation; `jev-action-picker.md` §4) + `social` (§3). Cap **2,560 bytes** canonical JSON (slice 3's 2,048 + 512 for `social`: loyalty 3 probabilities + up to 3 grudges × 3, 2-decimal; estimate, to be checked by test 1). Truncation order: slice 3's, then `social.grudges` from the last; never drop `social.loyalty`. Read request `state` = the briefing alone, capped by `BRIEFING_MAX_BYTES = 1024` (`@7636a40 ai-context.ts:32`).

## 7. Sampling stream and draw key

Same as slice 3 (`jev-action-picker.md` §1, §5), which copies slice 1's `weightedDraw` (`@7636a40 ai-weighted.ts:138–141`): `pickDraw = first 8 hex of sha256("ai-pick:" + seed + ":" + actorId + ":" + tick) / 2^32`. Per actor by construction; at most one decision per actor per tick (§2). Inverse CDF over legal ids in `localeCompare` order (`@7636a40 ai-weighted.ts:125–132`). Reads are not sampled. Stateless; never reads or writes `world.rngState`, so flag off is byte-identical.

## 8. Rails and fallbacks

Carried from slice 3 (`jev-action-picker.md` §2, §5): no consult if legal < 2, if `raid` or `claim-settlement` is legal, or if a haul can act; duplicate id → no consult; only legal ids kept, renormalized; zero sum, timeout, error, cap or malformed → `candidates[0]`.

New:
- Not a Free Tide member at decision time → no consult.
- Read failed (timeout, error, cap, malformed, `validateBriefing` null) → pick proceeds with `social: null`, `readOutcome` recorded. A failed read is not cached.
- Read probabilities: drop unknown labels and non-finite values, renormalize; zero sum → that question is `null`.
- Order of caps: reads are skipped before picks when the ledger is near the cap (read worst case first), so spend goes to picks.

## 9. Record and replay under `data.ai`

On each consulted `decision-made`:

```json
"ai": {
  "read": { "role": "picker.social", "cacheKey": "sha256:…", "hit": false, "readTick": 412,
            "inputHash": "sha256:…", "promptVersion": "sha256:…", "outcome": "model",
            "loyalty": { "…": "§3" }, "grudges": [ "…" ] },
  "picker": { "…": "slice 3 §6 fields, plus", "socialInputHash": "sha256:…" }
}
```

On a hit, `read` keeps `cacheKey`, `hit: true` and `readTick` only (the distributions live on the miss record). Replay, as slice 1 (`@7636a40 src/sim/ai-replay.ts:33`): rebuild the cache from recorded misses, rebuild each pick request, match `inputHash`, reuse recorded `probabilities`, recompute `distribution`, `draw`, `sampled`. **Recorded probabilities only; Jev is never asked again** (repeat answers differ, `jev-capabilities.md` §9 P2). A mismatch of `hit`, `sampled` or `inputHash` fails replay. `WorldStore.recover` uses `applyEvent` only; the reducer reads only `goal` (`src/sim/state.ts:792–795`).

## 10. Caps, cost lines, cost estimate

- **Call cap 8,000 per run** (measured max 7,211 + 404 = 7,615 on 2718; ~5% headroom).
- **Spend cap $0.35 per run** (`next-slices.md` slice 4) via `CostLedger.wouldExceed` (`@7636a40 src/sim/ai-vendor/cost.ts:74–86`). Past either cap: `cap` fallback.
- **Cost lines.** One `CostLine` (`@7636a40 cost.ts:45`) per call: `role` `picker.action` or `picker.social`, plus the existing fields. Cache hits write no line. Logs on; keys never logged (`ai-providers.md`).

**Estimate (marked):** Jev input $0.042 / M, output free (`@7636a40 cost.ts:41`). Picks at the P3 probe's 807 tokens (`jev-capabilities.md` §9): 4,537 × 807 × 0.042e-6 = **$0.154** (1847); 7,211 × 807 × 0.042e-6 = **$0.244** (2718); 2,922 × 807 × 0.042e-6 = **$0.099** (4096). Reads, upper bound 1,024 bytes of briefing + ~1,024 of questions ≈ 2,048 tokens (assumes ≤ 1 token per byte): 404 × 2,048 × 0.042e-6 = $0.035 (2718). **Total ≈ $0.28 at most measured (2718)**, under the $0.35 cap. Real pick size with `social` is unmeasured; the first live run's cost lines settle it, and the cap stops a larger run.

## 11. Pass gate

Seeds 1847, 2718, 4096; 1,200 ticks.

**Offline (stubs, `npm test` and harness):**
1. Flag off: fixture `6efa334f` / `e8f9cfab` / `8ac8529b` and 1,200-tick `f80c529f` / `2b5060c0` / `e8ae4443` unchanged.
2. Argmax stub (all mass on `candidates[0]`, any read): flag-off 1,200-tick hash.
3. Replay of every AI-on run to its live `stateHash`, zero provider calls (counting stub + no-network guard).
4. No rail breaks: every `sampled` in `legal`; no consult under a skip rule or for a non-member; zero `-1000` picks.
5. `npm test` passes.

**Live (Micah's standing approval for live AI runs, as reported by the Lead; runnable under the caps):** `JEV_API_KEY` from the environment, picker + social flag on, caps 8,000 calls and $0.35, cost lines on. Then `npm run dynamism -- --events live-<seed>.jsonl --baseline off-<seed>.jsonl` and:
6. **Variety up:** mean `entropyBits` over `character-14`…`22` above 1.8683 / 1.7446 / 1.9165; `firstDivergentTick` not null.
7. **Social metrics move:** desertions or secessions differ from flag off on at least one seed, **and** loyalty-driven picks > 0 on every seed. A loyalty-driven pick = a record with `sampled ≠ scorerPick` and `wavering + breaking ≥ 0.5`, counted from `data.ai` (add as `--ai` summary to `src/cli/dynamism-readout.ts`). Three seeds support no causal claim about desertions (they are side-stream rolls, §1).
8. Items 3–4 on the live logs; calls ≤ 8,000, spend ≤ $0.35, one cost line per call; replay exact.

## 12. Stub tests (`tests/jev-social-picker.test.ts`, importing `tests/helpers/no-network.ts`)

1. Pick `state` with `social` at the 2,560-byte cap on a max-grudge fixture; truncation order holds.
2. Flag off: fixture and one 1,200-tick hash match; no `data.ai.read` anywhere.
3. `stubArgmax` across all members: flag-off hash; every `sampled === scorerPick`.
4. `stubUniform` picks + fixed reads: deterministic over two runs; only members consulted; entropy over members above flag off.
5. Read questions: exact wording and criteria; 1 + min(3, grudges) questions.
6. Cache: hit on unchanged signature within 24 ticks; miss on change or expiry; hits write no cost line; failed reads not cached.
7. Read rails: garbage labels, NaN, zero sum → nulls; read failure → pick with `social: null`.
8. Slice 3 rails and skips (raid/claim, haul, legal < 2, duplicate id) still hold for all members; a deserter stops being consulted.
9. Replay: rebuilt cache and picks reach the hash with zero calls; `WorldStore.recover` mid-run matches.
10. Caps: past 8,000 calls or $0.35 → `cap`; reads skipped before picks near the cap.

## 13. Who decides

The Lead reports Micah's standing approval for live AI runs; caps and logs above stay mandatory. Raising a cap or changing vendor goes back to Micah.
