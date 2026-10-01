# Playtest plan: ransom to treasury

This is the plan for a blind operator. It is not a completed session. Do not run it as part of writing the change. Do not open `src/`, `tests/`, the branch diff, or `docs/design/` during the session. Use only the dashboard HTTP JSON, this plan, and `progress.md`.

One session. One process. Seed 1847. Send no commands. The session reads Sable Morrow's release, Mara Vane's own release, and state ticks 901 and 902.

Seed 1847 does not release Dax Pike at tick 902. The old 62.69 payment is not on this campaign. His card at those ticks is the check that it is gone.

No seeded run through tick 1200 on 1847, 2718, or 4096 releases a prisoner whose captor has no faction. There is no no-faction beat on the dashboard.

## Setup

- Node `v24.21.0` (`nvm use 24.21.0` if `node -v` is not that). `npm ci` first if `node_modules` is missing.
- Branch `feature/ransom-to-treasury`. Record `git rev-parse HEAD` before the first request.
- One process. `npm run dashboard -- --reset --seed 1847` on `http://127.0.0.1:4317`. Do not start a second dashboard.
- `GET /api/health` should be HTTP 200 `{"ok":true,"tick":0,"events":0}`.
- The player is Mara Vane, `character-01`, `playerId` `prototype-player`. Do not pass another character.
- Read state with `GET /api/state?limit=200`. Omit `beforeSequence` on the first read of a checkpoint. The `events` array is newest-first. If the sequence you need is below `eventPage.oldestSequence`, the fallback is `GET /api/state?limit=200&beforeSequence=<cursor>`.
- Advance with `POST /api/advance`. Body `{"ticks":N}`. `N` is an integer from 1 to 144.
- An advance stops early when Mara is captured or released. Read `ticksAdvanced`, `attentionUpdated`, and `tick`. Do not assume a request of 144 lands 144 ticks later.
- Advance `day` and state `day` are both rounded to two places.
- The briefing is built from recent events. A release older than that window is on the feed page, not on `briefing.items`.

## Hypothesis and ambition

**Hypothesis.** A faction ransom names only the treasury and the whole amount paid. The leader is not named, and `ransomIncomeNote` stays off the leader's card. The debt wording and "Loyalty fell" stay when a debt was recorded. The ransom line does not include tax paid on the same tick.

**Ambition.** Read Sable Morrow's line at state tick 119. Read Mara Vane's own release at state tick 679, including the purse and the treasury before and after that tick. Read state ticks 901 and 902 and confirm Dax Pike is not released there.

## Checkpoint 1 — Sable Morrow, state tick 119

`POST /api/advance` `{"ticks":119}`. HTTP 200. `ticksAdvanced` 119. `attentionUpdated` false. Advance `tick` 119. Advance `day` `19.83`.

`GET /api/state?limit=200`. State `tick` 119. State `day` `19.83`.

Sequence 13680 is on this page. `type` `captivity-released`. `actorId` `character-04`. `tick` 118. `payloadWithheld` true. `data` null.

Summary, exact:

`Sable Morrow was released from Cinder Key. 13.4 was paid and 103.21 was recorded as debt. Loyalty fell. 13.4 went to the Free Tide Compact treasury. The ransom line covers only the ransom.`

`details`, in order:

1. `Sable Morrow was released from Cinder Key.`
2. `13.4 was paid and 103.21 was recorded as debt.`
3. `Loyalty fell.`
4. `13.4 went to the Free Tide Compact treasury.`
5. `The ransom line covers only the ransom.`

The summary does not contain `Pax Ash`. It does not contain `6.7`.

Briefing `event:13680`. Title `A captain was released`. Summary that same sentence.

Sable Morrow, `character-04`: `releaseDebtNote` is `Owes 103.21 from the release at Cinder Key.` `ransomIncomeNote` is null.

Pax Ash, `character-14`: `locationId` `glassport`. `money` `44.88`. `ransomIncomeNote` is null. The old split put 6.7 on his purse and the card read 51.58. This card does not.

Mara Vane, the party: `party.locationId` `crown-harbor`. `party.hold.money` `108`. Her card `ransomIncomeNote` is null.

Factions: `world-government` `treasury` `21553.01`. `free-tide` `treasury` null. The 13.4 is on the line. It is not a balance she can see.

## Checkpoint 2 — Dax Pike at state tick 276

From tick 119, `POST /api/advance` `{"ticks":144}` lands on tick 263, day `43.83`. Then `{"ticks":13}` lands on tick 276, day `46`. Both `attentionUpdated` false.

`GET /api/state?limit=200`. State `tick` 276. State `day` 46.

Dax Pike, `character-20`:

- `locationId` is `glassport`.
- `money` is null.
- `captivity` is null.
- `releaseDebtNote` is null.
- `ransomIncomeNote` is null.

Mara: `party.locationId` `crown-harbor`. `party.hold.money` `108`. `ransomIncomeNote` null.

`world-government` `treasury` `27003.33`. `free-tide` `treasury` null.

The newest page does not contain sequence 13680. Briefing `event:13680` is still there, with the sentence from checkpoint 1. `GET /api/state?limit=200&beforeSequence=13880` returns sequence 13680, `payloadWithheld` true, `data` null, that same summary.

## Checkpoint 3 — Mara's release, state ticks 678 and 679

Continue from tick 276.

1. `{"ticks":144}` → tick 420, day `70`. `attentionUpdated` false.
2. `{"ticks":144}` → tick 564, day `94`. `attentionUpdated` false.
3. `{"ticks":144}` → tick 595, day `99.17`. `ticksAdvanced` 31. `attentionUpdated` true. She was captured on event tick 594. Do not send another 144 from 564.

At state tick 595, `party.hold.money` is `108`. `world-government` `treasury` is `34008.89`. The check-in title `A captain is held captive.` is present. Two release rows are also in the check-in, and both name only a treasury:

- Sequence 74786. `Jun Marrow was released from Glassport. 133.37 was paid and 317.15 was recorded as debt. Loyalty fell. 133.37 went to the Free Tide Compact treasury. The ransom line covers only the ransom.`
- Sequence 74787. `Lio Crow was released from Glassport. 126.63 was paid and 0 was recorded as debt. 126.63 went to the Free Tide Compact treasury. The ransom line covers only the ransom.`

Neither summary names a person as the recipient.

From tick 595, `{"ticks":83}` → tick 678, day `113`. `attentionUpdated` false.

`GET /api/state?limit=200` at tick 678, before the release tick runs:

- `party.hold.money` is `108`.
- `party.locationId` is `crown-harbor`.
- Mara `captivity.settlementId` is `crown-harbor`. `mandatoryReleaseTick` is `678`.
- `ransomIncomeNote` is null.
- `world-government` `treasury` is `35829.94`.
- `free-tide` `treasury` is null.
- Pax Ash `money` is `19.3` at `crown-harbor`. `ransomIncomeNote` is null.

`POST /api/advance` `{"ticks":1}`. HTTP 200. Tick 679. Day `113.17`. `ticksAdvanced` 1. `attentionUpdated` true.

`GET /api/state?limit=200`. Sequence 88540 is on this page. `type` `captivity-released`. `actorId` `character-01`. `tick` 678. `payloadWithheld` false. `data` is present.

`data.ransom.treasuryShare` is `108`. `data.ransom.leaderShare` is `0`. `data.ransom.treasuryFactionId` is `free-tide`. `data.ransom.factionTreasury` is `9617.88`. `data.ransom` has no `leaderId` and no `leaderMoney`. `data.terms.moneyPaid` is `108`. `data.terms.debtValue` is `72.25`. `data.characterMoney` is `0`.

Summary, exact:

`Mara Vane was released from Crown Harbor. 108 was paid and 72.25 was recorded as debt. Loyalty fell. 108 went to the Free Tide Compact treasury. The ransom line covers only the ransom. Mara Vane holds the seat of World Government again.`

`details`, in order:

1. `Mara Vane was released from Crown Harbor.`
2. `108 was paid and 72.25 was recorded as debt.`
3. `Loyalty fell.`
4. `108 went to the Free Tide Compact treasury.`
5. `The ransom line covers only the ransom.`
6. `Mara Vane holds the seat of World Government again.`

Briefing `event:88540`. Title `A captain was released`. Summary that same sentence.

Mara's card:

- `money` is `0`. She paid the 108. She did not receive it.
- `captivity` is null.
- `releaseDebtNote` is `Owes 72.25 from the release at Crown Harbor.`
- `ransomIncomeNote` is null.
- `debts[0].remainingValue` is `72.25`.

`party.hold.money` is `0`. `party.locationId` is null.

`world-government` `treasury` is `35832.28`. The move from the tick-678 read is `2.34`, not `108`.

The same page, sequence 88634, `type` `worked`, summary:

`Dax Pike worked at Glassport. Tax of 2.34 went to the treasury.`

`35829.94 + 2.34 = 35832.28`. The ransom line says `108` and does not say `2.34`. The 108 went to Free Tide, whose `treasury` on `factions` is still null. Pax's `money` on this page is null, and his `ransomIncomeNote` is null.

## Checkpoint 4 — state ticks 901 and 902

From tick 679, `{"ticks":144}` → tick 823, day `137.17`. Then `{"ticks":78}` → tick 901, day `150.17`. Both `attentionUpdated` false.

`GET /api/state?limit=200` at tick 901:

- Dax Pike `locationId` `glassport`. `money` `7.89`. `captivity` null. `releaseDebtNote` null. `ransomIncomeNote` null.
- Mara `money` `0`. `locationId` `verdant-cay`. `captivity` null. `ransomIncomeNote` null. `releaseDebtNote` null. The debt row is still there: `remainingValue` `72.25`. The note is off because the release is outside the check-in window.
- `party.hold.money` `0`.
- `world-government` `treasury` `39187.07`.
- `free-tide` `treasury` null.
- The newest page has no `captivity-released` for Dax. The check-in release is sequence 109819: `Rook Tern was released from Glassport. 113.08 was paid and 292.08 was recorded as debt. Loyalty fell. 113.08 went to the Free Tide Compact treasury. The ransom line covers only the ransom.`

`POST /api/advance` `{"ticks":1}` → tick 902, day `150.33`. `attentionUpdated` false.

`GET /api/state?limit=200` at tick 902:

- Dax Pike `money` is still `7.89`. `captivity` is still null. `ransomIncomeNote` is still null.
- Mara `money` is still `0`. `ransomIncomeNote` is still null.
- `world-government` `treasury` is still `39187.07`. Nothing was added for a ransom on this tick.
- The newest page still has no Dax Pike release.

There is no row whose summary contains `62.69` or `31.34` or `Mara Vane` as a ransom recipient.

## Criteria

`PROMOTE` if sequence 13680 is the Sable Morrow sentence above, Pax at tick 119 has `money` `44.88` and `ransomIncomeNote` null, sequence 88540 is Mara's sentence above with `leaderShare` 0 and no `leaderId`, her `ransomIncomeNote` is null, the World Government treasury moves from `35829.94` to `35832.28` while sequence 88634 names `Tax of 2.34`, and ticks 901 and 902 leave Dax at `7.89` with `captivity` null and Mara at `0` with `ransomIncomeNote` null and the treasury at `39187.07`.

`REVISE` if a faction release names a person as a recipient, a faction leader's card shows `ransomIncomeNote`, the ransom line includes `2.34` or drops the debt wording, or the tick-679 treasury move is `108` with no tax row.

`ABANDON` if the event type is not `captivity-released`, if Dax Pike is released at tick 902 for `62.69` with a share paid to Mara, or if Mara's purse rises on sequence 88540.

## Session

## Findings

## Verdict
