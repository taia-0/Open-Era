# Replay divergence: ATLS seed 10000 at t5,000

Diagnosis on `main` `7cc34b3`, Node v24.22.1 (ICU 78.3). Offline, no AI calls, $0. Harness, patch, and raw results are in [replay-divergence/](replay-divergence/). The patch is under docs and is not committed to `src`.

## Summary

- **Reproduced on `7cc34b3`.** ATLS seed 10000 replays inexactly at t5,000 (live run `5091ec34`), the same miss [state-prune](state-prune.md) found on `3c55552`.
- **First diverging tick: 1,621.** That is the tick whose morning start runs at clock 1,620. The hashes match through 1,620. At 1,621 the only differing field is `characters.character-10.shortMorningStreak`: 7 in the live run (A) and 8 in the replay (B).
- **Cause.** Replay runs the silent tick start too early.
  - The run applies a tick's leading block in this order:
    1. events appended between ticks;
    2. `runTick`'s leading aging deaths, each followed by its own public `news-posted` when the body was ashore;
    3. the silent start (desertion streaks, governor seat, stipend).
  - `replayWithSilentStarts` consumes only an unbroken run of `character-died` events, then calls the silent start. A `news-posted` after the first death, or any between-tick event ahead of the deaths, ends that run. The silent start then sees later deaths as still alive. Here `character-10`, who has just died, gains a short morning.
- **This is the same root cause as the `shortMorningStreak` misses in the npc-threads harness** (seed 8000 with the hook on and off, and seed 2000 with the hook on). There, a between-tick `player-command-accepted` (or a conversation event when the hook is on) sits ahead of the deaths.
- **The fix is replay-side only and hash-neutral.** It consumes the whole leading block before the silent start. All pins are unchanged and replay becomes exact everywhere tested (counts below). `npm test` passes 690/690 with the patch.
- **It affects real recovery, not only the harness.** A `WorldStore` restart between ticks 1,621 and 1,625 on ATLS 10000 recovers a world that differs from the live one. The patch makes that recovery exact.

## How the state-prune harness defined replay

[state-prune/measure.ts](state-prune/measure.ts) builds a fresh `createPrototypeWorld(seed)`, then calls `replayWithSilentStarts(replay, events)` once on the whole in-memory log and compares `stateHash` with the live world. It is a replay from events. It does not restore from a snapshot.

This harness uses the same function in lockstep. After each `runTick` on A, it feeds that tick's events to `replayWithSilentStarts` on B and compares hashes. Calling it on one tick's events is the same as one step of the whole-log call: it runs the silent start, then the events through `tick-advanced`, then stops. With the patch, both methods are checked at t5,000 (`WHOLE=1`). Whole-log replay is exact on ATLS 10000 and 20000 and on occupation 4000 and 9000, the four worlds that missed on `main`.

## First divergence (ATLS 10000)

`bisect.ts`, comparing every tick on `main`:

| | |
|---|---|
| Last equal tick | 1,620 (equal hashes) |
| First miss | 1,621: A `bb2cb380`, B `048f9fa7` |
| Differing fields | `world.characters.character-10.shortMorningStreak`: A 7, B 8 (the only one) |
| Leading events of the tick | `221739 character-died character-04` (glassport), `221740 news-posted character-04`, `221741 character-died character-10` (crown-harbor), `221742 news-posted character-10`, `221743 settlement-produced` … |

`probe.ts` shows that `character-10` is a short-paid member in both worlds before the morning (faction `secession-character-10-glassport-725`, 6 free mates, cap 5.94, streak 7). Both worlds are equal after the deaths too. Only the order differs:

- In A, both deaths are applied before `noteMorningDesertion`. The dead character is skipped and the streak stays at 7.
- In B, replay stops at `221740 news-posted`, so the silent start runs with `character-10` still alive and the streak becomes 8. The death is applied afterwards.

## Root cause in code (line numbers on `7cc34b3`)

- `src/sim/engine.ts:4564-4565`: `runTick` calls `resolveAgingDeaths(world, leading)`, then `applySilentTickStart(world)`.
- `src/sim/engine.ts:204-214`: `emit` applies the event, then calls `postPublicNews` (line 212).
  - `src/sim/news.ts:17` lists `character-died` in `PUBLIC_NEWS_TYPES`, so a death ashore is immediately followed by a `news-posted` (`engine.ts:236-244`).
  - The leading block is therefore death, news, death, news.
- `src/sim/tick-start.ts:35-39`: the replay consumes `while (events[index].type === "character-died")`, then calls `applySilentTickStart(state)`. It stops at the first `news-posted`, or at any between-tick event.
  - Introduced with the age-120 deaths in `8dd8da3` (2026-10-13, per `git blame`). Older commits were not tested.
- `src/sim/desertion.ts:68-71`: `noteMorningDesertion` skips the dead (`if (character.dead) continue`) and otherwise increments or clears the streak. That is why a not-yet-dead character in B gets a streak change.
  - The same early start also gives B the wrong `freeMateCount` and treasury for `memberAllowanceCap`. A dead character still counts as a mate, and the death's estate has not landed. The second dying character in seed 8000 (`character-05`, below) is that case.
  - The governor seat sync and stipend run in the same early start, so they can be affected as well. Not separately observed.
- **Between-tick events:**
  - `src/dashboard/server.ts:223`: `POST /api/commands` appends a `player-command-accepted` at once.
  - `server.ts:168-171`: `resolveDueReplies` runs after `runTick`, and the conversation events go into the same append.
  - All of these land after the previous `tick-advanced` and before the next tick's deaths. In the run they are applied before the next morning, while replay ran the morning first.
- **Recovery:**
  - `src/sim/persistence.ts:211`: `replayEvents` uses `replayWithSilentStarts` for events after the latest snapshot.
  - `persistence.ts:199`: the governor-seat shadow replays from sequence 0 with the same function.
  - A snapshot is taken on morning ticks (`appendTick`, `world.tick % ticksPerDay === 0`), so events after it start with the next tick's leading block. That is exactly where the miss is.

None of the other suspects (Map/Set/object key order, `localeCompare`/ICU, floating-point accumulation, `Date`/`Math.random`, JSON round-trip, unserialized caches) was involved here. The diff was a single integer field, and every miss below has the same leading-block shape.

### Is shortMorningStreak the same root cause? Yes

| Case | First miss | Field | Leading block |
|---|---|---|---|
| ATLS 10000 (no player) | 1,621 | `character-10` 7 vs 8 | death, news, **death**, news |
| ATLS 20000 (no player) | 1,801 | `character-22` 4 vs 5 | death, news, **death** (at sea, no news) |
| occupation 4000 | 2,881 | `character-22` 13 vs 14 | death, news, **death**, news |
| occupation 9000 | 4,861 | `character-15` 1 vs absent | death, news, **death**, news, death … |
| player script, default 8000 | 541 | `character-03` 2 vs 3; `character-05` absent vs 3 | **`player-command-accepted`** (offer-contract), death, death, news |
| player script, ATLS 10000 | 721 | `character-11` 7 vs 8 | **`player-command-accepted`** (offer-contract), death, news |

The player rows come from `player-bisect.ts`, which replays the npc-threads attentive script with the hook off. The npc-threads harness itself (`docs/npc-threads` @ `85f8241`, base `3c55552`, `SCENARIO=attentive`, no caps) was rerun for seeds 2000 and 8000:

- Unpatched, it reproduces the reported misses. Seed 2000 misses with the hook on only, on `character-16`. Seed 8000 misses with the hook on and off, on `character-03`.
- With the patch applied, all four replays are exact.

Seed 2000 with the hook on fits the same rule: the hook's conversation events sit ahead of that tick's deaths. That case was not bisected tick by tick.

## Fix (patch, not committed)

[replay-divergence/replay-leading-block.patch](replay-divergence/replay-leading-block.patch) changes only `src/sim/tick-start.ts`. In the start-of-tick phase, replay now consumes, in log order:

- any event of an out-of-tick type: `player-command-accepted`, `conversation-thread-created`, `conversation-message-sent`, `conversation-reply-scheduled`, `conversation-reply-created`, `briefing-item-acknowledged`, `reporting-officer-assigned`. These are emitted only by commands.ts, conversations.ts and briefing.ts, never by `runTick`.
- each `character-died`;
- a `news-posted` whose `record.item.id` is `news-<sequence>` of a death just consumed.

It then runs the silent start. If the log ends inside that block (a command submitted after the last tick), it stops without running the next morning, as the doc comment on `replayWithSilentStarts` already promises.

`runTick` does not call `replayWithSilentStarts` (engine.ts imports only `applySilentTickStart`). So the live run, its events, and every hash are unchanged by construction. The pins below confirm it.

## Results

The scope sweep (`scope.sh`) compares hashes every 100 ticks (`EVERY=100`), so a miss there is the first differing checkpoint. Exact first ticks, from `EVERY=1`, are in the table above.

| Config | Seeds × ticks | `main` exact | Patched exact |
|---|---|---|---|
| flag-off | 13 standard × 10,000 | 13/13 | 13/13 |
| ATLS | 13 standard × 5,000 | 12/13 (10000) | 13/13 |
| ATLS | 11000–20000 (10) × 5,000 | 9/10 (20000) | 10/10 |
| alliances only | 13 × 5,000 | 13/13 | 13/13 |
| lifecycle only | 13 × 5,000 | 13/13 | 13/13 |
| portTransfer only | 13 × 5,000 | 13/13 | 13/13 |
| secessionAftermath only | 13 × 5,000 | 13/13 | 13/13 |
| occupation only | 13 × 5,000 | 11/13 (4000, 9000) | 13/13 |
| player script (npc-threads attentive, hook off), default | 13 × 1,200 | 12/13 (8000) | 13/13 |
| player script, ATLS | 13 × 1,200 | 12/13 (10000) | 13/13 |
| log ending with a command after a morning tick (`tail-command.ts`, 1847/2718/4096 × 60/600/1,200) | 9 | 1/9 (the one with no command accepted) | 9/9 |
| `WorldStore` recover, ATLS 10000, stopped at 1,619 / 1,620 / 1,621 / 1,622 (`store-recover.ts`) | 4 | 2/4 (1,621 and 1,622 recover streak 8 vs live 7) | 4/4 |

Flag-off and every single layer except occupation were exact on `main`. The bug is not specific to a layer. It needs a morning where a death that matters to the silent start sits behind a non-death event in the leading block. Age-120 deaths happen in every config. Lifecycle adds characters, and so more deaths. Occupation alone hit it twice in 13 seeds.

The `tail-command` case hits the live store less than the harness. On a morning tick, `appendTick` snapshots after the command, so the command lands inside the snapshot. On other ticks the extra start is mostly inert: desertion and the stipend are daily, but the seat sync still runs. This was not measured separately.

### Pins

Both trees give identical t72 / t1,200 values (`pins.ts`), and whole-log replay is exact on all six:

| Seed | Flag-off | ATLS |
|---|---|---|
| 1847 | `7f76e474` / `94de9c02` | `85658e53` / `5367691c` |
| 2718 | `976c40bd` / `7a3741c9` | `aa54ada1` / `faf5798a` |
| 4096 | `08943ea5` / `af6eeaea` | `e4361ee1` / `7e93eab2` |

These match the standing flag-off and post-#192 ATLS-with-fix pins. The fix moves no pins.

## Questions for the Lead

1. Land the patch as an engine slice, with regression tests for ATLS 10000 lockstep through tick 1,621, the seed 8000 player-command case, and a store recover at 1,621? It is hash-neutral, so no re-pin.
2. Keep the explicit out-of-tick type list, or make the tick boundary explicit? An explicit boundary could be a store column marking events appended outside `runTick`, or a `tick-started` event. A new event moves every pin. The list is correct for today's emitters, but a new between-tick event type would have to be added to it.
3. Add a lockstep replay check (every 100 ticks) to the standard sweeps? A single end-of-run compare caught only 1 of 13 ATLS seeds at t5,000. Lockstep also gives the tick for free.
4. A store already recovered with the old replay keeps the diverged values in its later snapshots. Is that acceptable for existing playtest saves, or should they be reset? The fix cannot repair them.

## Reproduce

From a worktree root on `7cc34b3`:

```sh
ATLS='{"alliances":true,"lifecycle":true,"portTransfer":true,"secessionAftermath":true}'
SEEDS=10000 TICKS=1700 node --experimental-strip-types docs/design/replay-divergence/bisect.ts "$ATLS"   # miss at 1621
SEED=10000 MISS=1621 node --experimental-strip-types docs/design/replay-divergence/probe.ts "$ATLS"
SEEDS=8000 node --experimental-strip-types docs/design/replay-divergence/player-bisect.ts '{}'           # miss at 541
bash docs/design/replay-divergence/scope.sh /tmp/rd-main
git apply docs/design/replay-divergence/replay-leading-block.patch
bash docs/design/replay-divergence/scope.sh /tmp/rd-patched && bash docs/design/replay-divergence/player-scope.sh /tmp/rd-player
node --experimental-strip-types docs/design/replay-divergence/pins.ts
SEED=10000 STOPS=1621,1622 node --experimental-strip-types docs/design/replay-divergence/store-recover.ts "$ATLS"
git checkout src/sim/tick-start.ts
```

Raw output is in `replay-divergence/results/`: `main/`, `patched/`, `player-main/`, `player-patched/`, `whole-patched*.log`, `main-first-miss-detail.txt`, `pins-*.txt`, `npc-threads-att-default.txt`, `tail-command-*.txt`, `store-recover-*.txt`, and `npm-test-patched-tail.txt`.
