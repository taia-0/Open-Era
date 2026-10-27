# Playtest plan: breakaway polish, the founder line and the pressed port

This is the plan for a blind operator. It is not a completed session. Do not run it as part of writing the change. Do not open `src/`, `tests/`, the branch diff, or `docs/design/` during the session. Use only the dashboard HTTP JSON.

One process. Seed 4096. Mara Vane stays the viewer. Issue no command. A breakaway's declaration names the founder who sets its tax. The founder's first tax cut names the port that was pressed. The breakaway's treasury stays hidden from Mara, like every other faction's that is not her own.

The values below were read from one process on branch `fix/breakaway-polish`, seed 4096, `playerId` `prototype-player`, no command.

## Setup

- Node `v24.21.0`. `npm ci` first if `node_modules` is missing.
- Branch `fix/breakaway-polish`. Record `git rev-parse HEAD` before the first request. A later commit that does not change `src/` should match.
- One process. `npm run dashboard -- --reset --seed 4096` on `http://127.0.0.1:4317`. Do not start a second seed.
- `GET /api/health` should be HTTP 200 `{"ok":true,"tick":0,"events":0}`.
- Advance with `POST /api/advance`. The advance body includes every event that call produced, newest first.

## Hypothesis and ambition

**Hypothesis.** On tick 1088 Corin Hale declares Cinder Key separate, and the line names him as the founder who sets the tax. World Government takes Cinder Key on the same tick, and the breakaway takes Glassport on tick 1094. On tick 1104 Corin cuts the Free Cinder Key rate and names Glassport.

**Ambition.** Know who runs a new breakaway's tax and why it moved.

**What you can see.** The public declaration, the public tax line, and the faction rows. Not Free Cinder Key's treasury.

## Characters

| Name | Id | What to watch |
| --- | --- | --- |
| Mara Vane | `character-01` | The viewer, World Government. |
| Corin Hale | `character-16` | Founds Free Cinder Key on tick 1088 and cuts its tax on tick 1104. |

## Checkpoint 1. To tick 980

`POST /api/advance` with `{"ticks":144}` until the world reaches tick 980. Two calls stop early with `attentionUpdated` true; carry on with `{"ticks":144}` after each.

| Ends at | `eventSequence` | `attentionUpdated` |
| ---: | ---: | --- |
| 144 | 17459 | false |
| 288 | 36330 | false |
| 320 | 40710 | true |
| 404 | 52249 | true |
| 548 | 73133 | false |
| 692 | 93205 | false |
| 836 | 112675 | false |
| 980 | 132600 | false |

No call returns `pausedForBattle` true.

## Checkpoint 2. The declaration

`POST /api/advance` with `{"ticks":24}` five times. The calls end at ticks 1004, 1028, 1052, 1076, and 1100, `eventSequence` 136002, 139445, 142882, 146271, and 149659.

The tick-1100 call has sequence 147966, `secession-declared`, tick 1088, `payloadWithheld` true:

`Corin Hale declared Cinder Key separate from Free Tide Compact. Free Cinder Key starts with an empty treasury, founded by Corin Hale, who sets its tax until a leader gives orders.`

The line does not say `(no leader yet)`.

## Checkpoint 3. The first cut

`POST /api/advance` with `{"ticks":24}`. The call ends at tick 1124, `eventSequence` 152972. It has sequence 150201, `tax-rate-set`, tick 1104, `payloadWithheld` true:

`Corin Hale lowered the Free Cinder Key tax from 8% to 7% (unrest at Glassport).`

Then `POST /api/advance` with `{"ticks":24}`. The call ends at tick 1148, `eventSequence` 156347. Then `GET /api/state?limit=1`. The `factions` rows are:
- Free Cinder Key: `taxRate` 0.07, `treasury` null, `treasuryNote` `not visible to you`.
- Free Tide Compact: `taxRate` 0.21, `treasury` null, `treasuryNote` `not visible to you`.
- World Government: `treasury` 12022.55, `treasuryNote` null.

## Second checkpoint set. Seed 1847 contract lines

Restart the one process with `npm run dashboard -- --reset --seed 1847`, same `playerId`, no command. Values were read from a live run of that process on this branch.

### Checkpoint 4. The cancellation

`POST /api/advance` with `{"ticks":144}`: ends at tick 144, `eventSequence` 16958. Then `{"ticks":24}`: ends at tick 168, `eventSequence` 19796. That call has sequence 17788, `contract-cancelled`, tick 151, `payloadWithheld` true:

`Lio Crow's contract for Iris Stone was cancelled because the port no longer needs it.`

The line names no escrow and no figure.

### Checkpoint 5. The breach and the folded row

`POST /api/advance` with `{"ticks":48}`: ends at tick 216, `eventSequence` 25265. Neither call in this set returns `attentionUpdated` or `pausedForBattle` true. The call has:
- sequence 23032, `contract-breached`, tick 196, `payloadWithheld` true: `Bram Quill missed a contract: the carrier chose other work.`
- sequence 24468, `contract-offered`, tick 209, `payloadWithheld` true: `Iris Stone offered Toma Reef a contract to carry 10 provisions to Crown Harbor (2 times since tick 194).`

No feed line in either call has `(World Government)` or another faction tag after a name.

## Outcome

Not yet run.

## Recommendation

Pending the blind session.
