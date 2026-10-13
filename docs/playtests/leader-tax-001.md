# Playtest plan: leader tax

This is the plan for a blind operator. It is not a completed session. Do not fill Session, Findings, or Verdict while writing the plan. Do not open `src/`, `tests/`, the branch diff, or `docs/design/` during the session. Use only the dashboard HTTP JSON, this plan, and `progress.md`.

One process. Seed 1847. The seat is Mara Vane, `character-01`, `playerId` `prototype-player`. Do not pass another character.

```text
npm run dashboard -- --reset --seed 1847
```

Bind `127.0.0.1:4317`. Stop the process and confirm the port is free before any second `--reset`.

The readings below were taken on this tree through `GET /api/state?limit=200`, `POST /api/advance`, and `POST /api/commands` before the session. Omit `beforeSequence` on these reads. An empty `beforeSequence=` is read as 0 and the page comes back empty. The operator confirms the readings. A match is the campaign. A miss is not a new reading to write into this file during the session.

## Session

## Hypothesis and ambition

**Milestone hypothesis:** Only the free command holder can set her faction's tax rate. The new rate is public on every faction row, including a rival's. A repeat, a rate off the 0.00–0.30 one-cent grid, and a change before 24 ticks have passed are refused and change nothing.

**Player ambition:** Mara Vane sets the World Government tax rate to 12%, is refused while that set is still inside its cooldown, and later sets it to 20%.

**Success signal:** The faction row shows 0.12 after the first tick, stays 0.12 through every refusal, and shows 0.20 after the later set. Free Tide Compact stays 0.08, with treasury and power null.

## Expected readings

### 1. Tick 0, every faction's rate is public

`GET /api/health` HTTP 200 `{"ok":true,"tick":0,"events":0}`.

`GET /api/state?limit=200`. `tick` 0. `day` 0. `eventPage.total` 0. `player.id` `prototype-player`. `player.characterId` `character-01`. `player.displayName` `Mara Vane`. `capabilities.commandTypes` includes `set-tax-rate`.

| Faction | taxRate | taxRateSetTick | treasury | power |
| --- | ---: | --- | --- | --- |
| `free-tide`, Free Tide Compact | 0.08 | null | null (`treasuryNote` `not visible to you`) | null |
| `world-government`, World Government | 0.14 | null | 18000 | 2335.44 |

`commanderId` is `character-14` on Free Tide and `character-01` on World Government. `actingCommanderId` is null on both.

### 2. Mara sets 12%

`POST /api/commands` with `{"playerId":"prototype-player","type":"set-tax-rate","taxRate":0.12}`. HTTP 202. `command.id` `command-00001`. `command.type` `set-tax-rate`. `command.factionId` `world-government`. `command.taxRate` 0.12. `command.issuedTick` 0.

`GET /api/state?limit=200` before the advance. `tick` 0. `eventPage.total` 1. World Government `taxRate` is still 0.14 and `taxRateSetTick` is still null. Treasury is still 18000.

Sequence 1: `type` `player-command-accepted`, `tick` 0, `actorId` `character-01`, `targetId` `world-government`, `payloadWithheld` false. Summary `Command queued for Mara Vane: set tax rate to 12%`.

`POST /api/advance` `{"ticks":1}`. HTTP 200. `tick` 1. `day` 0.17. `ticksAdvanced` 1. `eventSequence` 185.

`GET /api/state?limit=200`. `tick` 1. `day` 0.17. `eventPage.total` 185. `oldestSequence` 1. `newestSequence` 185.

World Government: `taxRate` 0.12, `taxRateSetTick` 0, `treasury` 17947, `power` 2346.56. Free Tide: `taxRate` 0.08, `taxRateSetTick` null, `treasury` null, `power` null.

Sequence 10: `type` `tax-rate-set`, `tick` 0, `actorId` `character-01`, `targetId` `world-government`, `payloadWithheld` false. `data.taxRate` 0.12. `data.previousTaxRate` 0.14. `data.taxRateSetTick` 0. `data.factionId` `world-government`. Summary `Mara Vane set the World Government tax rate to 12%.`

Sequence 11: `type` `player-command-resolved`, `tick` 0. Summary `Mara Vane: tax rate set`. `data.outcome` `tax-rate-set`. `data.taxRate` 0.12.

### 3. An immediate second set is refused

`POST /api/commands` with `{"playerId":"prototype-player","type":"set-tax-rate","taxRate":0.2}` while `tick` is 1. HTTP 400.

```json
{"ok":false,"code":"tax-rate-cooldown","error":"The tax rate was set on tick 0 and cannot change again until tick 24."}
```

`GET /api/state?limit=200`. `tick` still 1. `eventPage.total` still 185. World Government `taxRate` still 0.12. `taxRateSetTick` still 0. Treasury still 17947.

### 4. The same rate after the cooldown is refused

`POST /api/advance` `{"ticks":23}`. HTTP 200. `tick` 24. `day` 4. `ticksAdvanced` 23. `eventSequence` 2771.

`GET /api/state?limit=200`. `tick` 24. `eventPage.total` 2771. World Government `taxRate` 0.12, `taxRateSetTick` 0, `treasury` 17630.41, `power` 2332.16. Free Tide `taxRate` 0.08, `taxRateSetTick` null, `treasury` null.

`POST /api/commands` with `{"playerId":"prototype-player","type":"set-tax-rate","taxRate":0.12}`. HTTP 400.

```json
{"ok":false,"code":"tax-rate-unchanged","error":"The tax rate is already 12%."}
```

The next `GET /api/state?limit=200` still has `tick` 24, `eventPage.total` 2771, `taxRate` 0.12, and `taxRateSetTick` 0.

### 5. Out of range and off-step are refused

Still at tick 24, before another accepted set. Each body is `{"playerId":"prototype-player","type":"set-tax-rate","taxRate": <value>}`. Each response is HTTP 400 with `code` `invalid-tax-rate` and `error` `The tax rate must be from 0.00 to 0.30 in steps of 0.01.`

| taxRate | Why |
| ---: | --- |
| -0.01 | below 0.00 |
| 0.31 | above 0.30 |
| 0.125 | not a 0.01 step |

After all three, `tick` is 24, `eventPage.total` is 2771, World Government `taxRate` is 0.12, and `taxRateSetTick` is 0. Treasury is still 17630.41.

### 6. After 24 ticks a different rate succeeds

`POST /api/commands` with `{"playerId":"prototype-player","type":"set-tax-rate","taxRate":0.2}`. HTTP 202. `command.id` `command-00002`. `command.issuedTick` 24. `command.taxRate` 0.2.

`GET /api/state?limit=200`. `tick` still 24. `eventPage.total` 2772. Sequence 2772 summary `Command queued for Mara Vane: set tax rate to 20%`. World Government `taxRate` is still 0.12 until the tick runs.

`POST /api/advance` `{"ticks":1}`. HTTP 200. `tick` 25. `day` 4.17. `eventSequence` 2884.

`GET /api/state?limit=200`. `tick` 25. `eventPage.total` 2884. World Government `taxRate` 0.2, `taxRateSetTick` 24, `treasury` 17642.73, `power` 2336.02. Free Tide `taxRate` 0.08, `taxRateSetTick` null, `treasury` null, `power` null.

Sequence 2781: `type` `tax-rate-set`, `tick` 24. `data.taxRate` 0.2. `data.previousTaxRate` 0.12. `data.taxRateSetTick` 24. Summary `Mara Vane set the World Government tax rate to 20%.`

Sequence 2782: summary `Mara Vane: tax rate set`. `data.taxRate` 0.2.

### 7. The regency cover

Not reached on this seat. From tick 0 through tick 25, `actingCommanderId` stays null on both factions, and the player character remains Mara Vane. There is no HTTP command that captures her. The refusal is `tests/leader-tax.test.ts`, the test named `a non-holder, the regency cover, and a captive holder are refused`. The cover is refused `not-command-holder`. The captive holder is refused `character-captive` by the gate already on every command except escape.

### 8. A rival faction's rate is visible

On every read above, Free Tide Compact is on the faction list with `taxRate` 0.08. `treasury` is null, `treasuryNote` is `not visible to you`, and `power` is null. That row does not change when World Government's rate changes.

## Findings

## Verdict

## Recommendation criteria

`PROMOTE` when every status, code, summary, `taxRate`, and `taxRateSetTick` above matches, Free Tide stays 0.08 with treasury and power null, and each refusal leaves the row and `eventPage.total` unchanged.

`REVISE` when the holder can set a legal rate and a refusal still changes nothing, but a summary, a code, or a listed number differs.

`ABANDON` when a refusal changes `taxRate` or `taxRateSetTick`, a rival treasury or power becomes a number, or an accepted set never appears on the faction row.
