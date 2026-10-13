# Playtest plan: leader tax autonomy

This is the plan for a blind operator. It is not a completed session. Do not fill Session, Findings, or Verdict while writing the plan. Do not open `src/`, `tests/`, the branch diff, or `docs/design/` during the session. Use only the dashboard HTTP JSON, this plan, and `progress.md`.

One process. Seed 1847. The seat is Mara Vane, `character-01`, `playerId` `prototype-player`. Do not pass another character. Issue no command. Stop the process, and confirm port 4317 is free, before any second `--reset`.

Advance at most 144 ticks per call. This plan uses 72, then 49, then 24.

Omit `beforeSequence` on every event read. Do not send `beforeSequence=0`. That bound returns no events. Do not page backward. The tax-rate row is on the newest page at the checkpoint that names it, and it is gone from the newest page at the next checkpoint.

The readings below were taken on this tree through `GET /api/state?limit=200`, `POST /api/advance`, and no `POST /api/commands`. A match is the campaign. A miss is not a new reading to write into this file during the session.

```text
npm run dashboard -- --reset --seed 1847
```

Bind `127.0.0.1:4317`.

## Hypothesis and ambition

**Milestone hypothesis:** A free holder who is not the player steps that faction's tax rate by one cent on world tick 24, 48, 72, and so on. The step is down when a port the faction holds is at or under stability 55, and up when no held port is that low and the treasury cannot cover one day of passage for every free mate. The same rate writes nothing. Mara Vane's rate is never stepped. She is the player holder. Free Tide's holder, Pax Ash, is not.

**Player ambition:** Mara Vane issues no order and reads whether anyone else changes a rate, and whether her own rate moves on its own.

**Success signal:** Through state tick 72 every faction rate is still the opening rate and `taxRateSetTick` is null. The advance that processes world tick 120 leaves state tick 121 with Free Tide at 0.09 and `taxRateSetTick` 120. The feed sentence names Pax Ash, Free Tide, and 9%. The payload is withheld. World Government is still 0.14 with `taxRateSetTick` null. The next clock, world tick 144, leaves state tick 145 with Free Tide at 0.1 and `taxRateSetTick` 144, and World Government still untouched.

The check runs while the world tick is 120. The advance that includes that tick reports the following state tick. Stopping at state tick 120 is the moment before the step.

## Setup

- Node `v24.21.0`. Seed 1847. Seat Mara Vane.
- `GET /api/health` is HTTP 200 `{"ok":true,"tick":0,"events":0}`.
- `GET /api/state?limit=200` is HTTP 200. At tick 0, `eventPage.total` is 0.
- `player.id` `prototype-player`. `player.characterId` `character-01`. `player.displayName` `Mara Vane`. `party.locationId` `crown-harbor`. `capabilities.commandTypes` includes `set-tax-rate`. Do not send it.

Opening rows:

| Faction | taxRate | taxRateSetTick | treasury | power | commanderId | actingCommanderId |
| --- | ---: | --- | ---: | ---: | --- | --- |
| `free-tide`, Free Tide Compact | 0.08 | null | null (`treasuryNote` `not visible to you`) | null | `character-14` | null |
| `world-government`, World Government | 0.14 | null | 18000 | 2335.44 | `character-01` | null |

| Settlement | stability | battleInProgress | taxRate | factionId |
| --- | ---: | --- | ---: | --- |
| `crown-harbor` | 91 | false | 0.14 | `world-government` |
| `glassport` | 86 | false | 0.14 | `world-government` |
| `verdant-cay` | null | false | 0 | null |
| `cinder-key` | null | false | 0.08 | `free-tide` |

A settlement's `taxRate` is the rate of the holder that row is showing. It is not, by itself, the faction's rate. Cinder Key later shows 0.14 because World Government holds it. Free Tide's rate is the faction row.

## Procedure

1. Read tick 0 as above. Send no command.
2. `POST /api/advance` `{"ticks":72}`. HTTP 200. `tick` 72. `day` 12. `ticksAdvanced` 72. `eventSequence` 8413. `combatUpdated` false. `attentionUpdated` false.
3. `GET /api/state?limit=200`. Omit `beforeSequence`. `tick` 72. `day` 12. `eventPage.total` 8413. `count` 200. `oldestSequence` 8214. `newestSequence` 8413. `hasMore` true. No `tax-rate-set` on the page. Free Tide `taxRate` 0.08, `taxRateSetTick` null, `treasury` null, `power` null, `commanderId` `character-14`, `actingCommanderId` null. World Government `taxRate` 0.14, `taxRateSetTick` null, `treasury` 17559.72, `power` 2224.31, `commanderId` `character-01`, `actingCommanderId` null.
4. Settlements at tick 72: Crown Harbor `stability` 91.1, `taxRate` 0.14, `battleInProgress` false, `factionId` `world-government`. Glassport `stability` null, `taxRate` 0.14, `battleInProgress` false, `factionId` `world-government`. Verdant Cay `stability` null, `taxRate` 0, `battleInProgress` false, `factionId` null. Cinder Key `stability` 55.15, `taxRate` 0.14, `battleInProgress` false, `factionId` `world-government`.
5. `POST /api/advance` `{"ticks":49}`. HTTP 200. `tick` 121. `day` 20.17. `ticksAdvanced` 49. `eventSequence` 14211. `combatUpdated` false. `attentionUpdated` false.
6. The advance body contains one `tax-rate-set`. `sequence` 14112. `tick` 120. `day` 20. `type` `tax-rate-set`. `actorId` `character-14`. `targetId` `free-tide`. `settlementId` null. `payloadWithheld` true. `data` null. Summary `Pax Ash set the Free Tide Compact tax rate to 9%.`
7. `GET /api/state?limit=200`. Omit `beforeSequence`. `tick` 121. `day` 20.17. `eventPage.total` 14211. `count` 200. `oldestSequence` 14012. `newestSequence` 14211. `hasMore` true. Sequence 14112 is on this page, with the same summary, `payloadWithheld` true, and `data` null.
8. Free Tide `taxRate` 0.09, `taxRateSetTick` 120, `treasury` null, `power` null. World Government `taxRate` 0.14, `taxRateSetTick` null, `treasury` 17522.52, `power` 2314.1. `commanderId` values are unchanged. Both `actingCommanderId` values are null.
9. Settlements at tick 121: Crown Harbor `stability` 86.42, `taxRate` 0.14. Cinder Key `stability` 56.62, `taxRate` 0.14, `factionId` `world-government`. Glassport `stability` null, `taxRate` 0.14, `factionId` `world-government`. Verdant Cay `stability` null, `taxRate` 0. All `battleInProgress` false. None of these rows shows 0.09. The new rate is the Free Tide faction row and the feed sentence.
10. `POST /api/advance` `{"ticks":24}`. HTTP 200. `tick` 145. `day` 24.17. `ticksAdvanced` 24. `eventSequence` 17009.
11. The advance body contains one `tax-rate-set`. `sequence` 16907. `tick` 144. `day` 24. `actorId` `character-14`. `targetId` `free-tide`. `payloadWithheld` true. `data` null. Summary `Pax Ash set the Free Tide Compact tax rate to 10%.`
12. `GET /api/state?limit=200`. `tick` 145. `day` 24.17. `eventPage.total` 17009. `count` 200. `oldestSequence` 16810. `newestSequence` 17009. `hasMore` true. Sequence 16907 is on this page. Sequence 14112 is older than this page. Do not follow it.
13. Free Tide `taxRate` 0.1, `taxRateSetTick` 144, `treasury` null, `power` null. World Government `taxRate` 0.14, `taxRateSetTick` null, `treasury` 17676.96, `power` 2360.43.

JSON writes 0.10 as `0.1`.

## How the first step is chosen

World tick 120 is a clock tick. Pax Ash is the free holder of Free Tide. The lowest held stability at that check is above 55, so the rate does not go down. The treasury cannot pay 18 to each free mate, so the rate goes up one cent, from 0.08 to 0.09. The same choice at world tick 144 goes from 0.09 to 0.10. Ticks 24, 48, 72, and 96 are also clock ticks. On this seed each of those is neither pressed nor short, so they emit nothing. That is why state tick 72 still shows 0.08 and 0.14.

The player does not see Free Tide's treasury or the mate count. The visible proof is the faction row, `taxRateSetTick`, and the withheld sentence.

Mara Vane's rate stays 0.14, and `taxRateSetTick` stays null, because the step does not write a human holder's rate. No `tax-rate-set` in this plan has `actorId` `character-01` or `targetId` `world-government`.

## Recommendation

`PROMOTE` when state tick 72 still has both opening rates and both `taxRateSetTick` null, state tick 121 has Free Tide 0.09 with sequence 14112 reading `Pax Ash set the Free Tide Compact tax rate to 9%.` and `data` null, state tick 145 has Free Tide 0.1 with sequence 16907 reading `Pax Ash set the Free Tide Compact tax rate to 10%.`, and World Government is 0.14 with `taxRateSetTick` null at every one of those reads.

`REVISE` when Free Tide does change and World Government does not, but a tick, a sequence, a treasury, a power, or a summary differs.

`ABANDON` when World Government's rate or `taxRateSetTick` changes with no command, when a `tax-rate-set` names Mara Vane, when Free Tide is still 0.08 at state tick 121, or when the payload of Pax Ash's set is visible.
