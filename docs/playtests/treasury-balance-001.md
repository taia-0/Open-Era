# Playtest plan: treasury balance

This is the plan for a blind operator. It is not a completed session. Do not fill Session, Findings, or Verdict while writing the plan. Do not open `src/`, `tests/`, the branch diff, or `docs/design/` during the session. Use only the dashboard HTTP JSON, this plan, and `progress.md`.

One process. Seed 1847. The seat is Mara Vane. Do not pass another character.

The readings below were taken on this tree through `GET /api/state`, `POST /api/advance`, and `POST /api/commands` before the session. The operator confirms them. A match is the campaign. A miss is not a new reading to write into this file during the session.

The free-mate count is not a field on the state. The player sees the treasury and the cap. At tick 0 the treasury can pay 18 to every mate, so every World Government cap reads 18. The offer below spends the treasury down, and the caps on the next read are the share.

## Setup

- Node `v24.21.0` (`nvm use 24.21.0` if `node -v` is not that). `npm ci` first if `node_modules` is missing.
- Branch `feature/treasury-balance`. Record `git rev-parse HEAD` before the first request.
- One process. `npm run dashboard -- --reset --seed 1847 --host 127.0.0.1 --port 4317`. Do not start a second dashboard.
- `GET /api/health` should be HTTP 200 `{"ok":true,"tick":0,"events":0}`.
- The player is Mara Vane, `character-01`, `playerId` `prototype-player`. Do not pass another character.
- Read state with `GET /api/state?limit=200`. Omit `beforeSequence` on the first read of a checkpoint. The `events` array is newest-first. If the sequence you need is below `eventPage.oldestSequence`, the fallback is `GET /api/state?limit=200&beforeSequence=<cursor>`.
- Advance with `POST /api/advance`. Body `{"ticks":N}`. `N` is an integer from 1 to 144.
- Commands are `POST /api/commands`. Send only the two bodies below.
- Do not pass the event log into anything other than these HTTP calls.

## Hypothesis and ambition

**Hypothesis.** At tick 0 Mara's cap reads `no cap` and every World Government mate's cap reads 18. Free Tide's treasury reads `not visible to you`, and Pax Ash's allowance fields stay null. After Mara offers a 17900 contract, the treasury the player sees is 78.2 and every World Government mate's cap is 6.51. Sable Morrow's recruit names 8.33 from the treasury and 87.67 from the purse, her remainder is 0, and her note is `cap used`. Mara's purse stays 108. Cancelling that contract refunds 17900 to the treasury and 0 to the purse, and her purse stays 108.

**Ambition.** Read the opening caps and the rival row. Offer the contract, read the reduced cap and Sable's recruit line, then cancel and read the refund.

## Checkpoint 1 — tick 0, the full cap, the holder, and a rival

No command. `GET /api/state?limit=200`. State `tick` 0. State `day` 0.

Mara Vane, `character-01`:

- `money` 108
- `allowanceCap` `no cap`
- `allowanceRole` `holder`
- `allowanceUncapped` true
- `allowanceNote` null
- `locationId` `crown-harbor`

Jun Marrow, `character-05`, and Bram Quill, `character-02`:

- `allowanceCap` 18
- `allowanceNote` `none spent today`
- `allowanceRole` `member`

`world-government` `treasury` is 18000. `treasuryNote` null.

Pax Ash, `character-14`:

- `allowanceCap` null
- `allowanceNote` null
- `allowanceRole` null
- `factionId` `free-tide`

`free-tide` `treasury` is null. `treasuryNote` is `not visible to you`.

## Checkpoint 2 — the share, after one tick

`POST /api/commands`

```json
{"playerId":"prototype-player","type":"offer-contract","characterId":"character-05","quantity":1,"destinationId":"crown-harbor","price":17900,"expiresInTicks":24}
```

HTTP 202. `command.id` is `command-00001`. `command.source` is `treasury`. `command.price` is 17900.

`POST /api/advance` `{"ticks":1}`. HTTP 200. `ticksAdvanced` 1. `tick` 1. `day` 0.17.

`GET /api/state?limit=200`. State `tick` 1. State `day` 0.17. `eventPage.total` 184.

`world-government` `treasury` is 78.2. `treasuryNote` null.

Jun Marrow, `character-05`:

- `allowanceCap` 6.51
- `allowanceRemaining` absent
- `allowanceNote` `none spent today`
- `allowanceRole` `member`
- `allowanceUncapped` false

Bram Quill, `character-02`, reads the same cap, 6.51, and the same note, `none spent today`.

Sable Morrow, `character-04`:

- `money` 172.33
- `allowanceCap` 6.51
- `allowanceRemaining` 0
- `allowanceNote` `cap used`

Sequence 29, on this page:

- `type` `recruited`
- `tick` 0
- `actorId` `character-04`
- `settlementId` `glassport`
- `payloadWithheld` true
- `data` null

Summary, exact:

`Sable Morrow recruited 8 at Glassport for 96: 8.33 from the treasury and 87.67 from the purse.`

Sequence 10, `contract-offered`, `actorId` `character-01`, `payloadWithheld` false. `data.treasuryDrawn` 17900. `data.purseDrawn` 0. `data.characterMoney` 108. `data.factionTreasury` 100. `data.contract.escrowFromTreasury` 17900. `data.contract.escrowFromPurse` 0.

Mara's `money` is still 108. `allowanceCap` is still `no cap`. `allowanceRole` is still `holder`.

The contract `command-00001:contract` has `status` `offered`, `price` 17900, `escrow` 17900.

Pax Ash's `allowanceCap` is still null. `free-tide` `treasury` is still null. `treasuryNote` is still `not visible to you`.

## Checkpoint 3 — the escrow returns to the treasury

`POST /api/commands`

```json
{"playerId":"prototype-player","type":"cancel-contract","characterId":"character-05","contractId":"command-00001:contract"}
```

HTTP 202. `command.id` is `command-00002`.

`POST /api/advance` `{"ticks":1}`. HTTP 200. `tick` 2. `day` 0.33.

`GET /api/state?limit=200`. State `tick` 2. State `day` 0.33. Sequence 193 is on this page (`eventPage.oldestSequence` 75, `newestSequence` 274, `total` 274).

Sequence 193:

- `type` `contract-cancelled`
- `tick` 1
- `actorId` `character-01`
- `targetId` `character-05`
- `payloadWithheld` false
- `data` present

Summary, exact:

`Mara Vane cancelled the provisions contract.`

`data.treasuryRefunded` 17900. `data.purseRefunded` 0. `data.buyerMoney` 108. `data.factionTreasury` 17978.2. `data.contract.escrow` 0. `data.contract.escrowFromTreasury` 0. `data.contract.escrowFromPurse` 0. `data.contract.status` `cancelled`.

Mara's `money` is 108. `allowanceCap` is `no cap`.

`world-government` `treasury` is 17956.57. That is the balance after the rest of the tick. The event's 17978.2 is the treasury at the moment of the refund.

Jun Marrow's `allowanceCap` is 18 again. `allowanceRemaining` is 15. `allowanceNote` is null.

The contract's `status` is `cancelled` and its `escrow` is 0.

## Criteria

`PROMOTE` when every checkpoint matches: tick 0 has Mara's cap `no cap`, Jun's and Bram's caps 18 with note `none spent today`, World Government treasury 18000, Pax's cap null, and Free Tide `not visible to you`; the offer is HTTP 202 with `source` `treasury`; tick 1 treasury is 78.2 and Jun's cap is 6.51 with note `none spent today`; sequence 29 is `Sable Morrow recruited 8 at Glassport for 96: 8.33 from the treasury and 87.67 from the purse.` with `data` null, her remainder 0, and her note `cap used`; Mara's money stays 108 and her cap stays `no cap`; the cancel is HTTP 202; sequence 193 has `treasuryRefunded` 17900, `purseRefunded` 0, and `buyerMoney` 108; the end treasury is 17956.57 and Jun's cap is 18.

`REVISE` when a listed cap is present but wrong, when Sable's recruit still pays 18 from the treasury, when her note is blank at remainder 0, when the cancel credits the purse, or when Mara's cap becomes a number.

`ABANDON` when the offer or the cancel is not HTTP 202, when tick 1 is not 1, or when sequence 29 is not Sable Morrow's recruit.

## Session

## Findings

## Verdict
