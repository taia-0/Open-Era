# Ransom split

Settled. Question 24 in [owner questions](owner-questions.md). The coins a prisoner actually pays on release now arrive somewhere.

## Correction (2026-10-01)

This addendum supersedes the 50/50 split below. Question 24 now records this ruling: 100% to a faction captor's treasury, and 100% to the leader when the captor has no faction.

When the captor has a faction, 100% of the coins actually paid go to that faction's treasury. The party leader receives 0. `floor(cents / 2)` and the odd-cent-to-treasury rule are gone for a faction captor. When the captor has no faction, the party leader still receives 100%, as before. The debt is still the unpaid remainder. Nothing is taken from the debt.

The split is still whole cents. `Math.round(paid * 100)` is the cent count, and the share is that count divided by 100. There is no floating remainder. 62.69 is 6269 cents, all of them to the treasury. 0.01 and 0 stay exact.

The `ransom` object stays on `captivity-released`. For a faction captor, `treasuryShare` is the full `moneyPaid`, `leaderShare` is 0, and `leaderId` and `leaderMoney` are omitted. `leaderShare` is present as 0 rather than absent: the credit reader requires a number, a 0 does not write a purse, and the amount is honestly zero. The leader id is omitted because there is no leader credit to name. `factionTreasury` is still the absolute the reducer writes. `applyRansomCredit` still skips a share of 0, so replay and recovery credit only the treasury. No faction: `leaderId` and `leaderMoney` stay, and the leader receives every cent.

The feed line for a faction captor is the whole amount and the treasury only, for example `62.69 went to the World Government treasury.` The sentence `The ransom line covers only the ransom.` stays. The release debt note stays. `ransomIncomeNote` does not appear for a faction captor. It still appears for a factionless captor.

No seeded release on 1847, 2718, or 4096 through tick 1200 has a null captor faction. The factionless case is a constructed fixture: Sable Morrow pays 40.01 to Niko Crow.

Seed 1847 does not release Dax Pike at tick 902. Under the old split that release paid 62.69, of which 31.34 reached Mara Vane. Pax Ash was the first leader on this seed. Losing that 6.7 at tick 118 changes his choice at tick 140, sequence 16382, from `worked` to `market-trade`. Dax is not released in the 1200-tick run. A constructed Glassport hold with 62.69 in his purse pays the World Government treasury 62.69, leaves Mara's purse at 108, and leaves `leaderShare` at 0. The same tick adds 3.50 of tax (1.16 then 2.34), so the treasury after the tick is 18066.19. The ransom line does not include that tax.

Tick 72 does not move. The first release on each seed is still after tick 72.

Tick 1200, measured on Node v24.21.0 before this ruling (`e61aa98`) and after it. The before hashes are the 50/50 campaign. They are not stored as an expectation in a test or a script. The record is this note, [treasury spending](treasury-spending.md) line 15, and the ransom-split entry in `progress.md`.

| Seed | Before hash | After hash | Events before → after | Captures | Releases | Release records |
| ---: | --- | --- | ---: | --- | --- | --- |
| 1847 | `dac1ee50de935be4ea4bd9499ee9f49fb738909f4032b327ebb52d367cca6ded` | `04215936a3693247f86b5297fd8865ea7fa70a7b31f7be98d410bc148e92c121` | 162392 → 164313 | 16 → 12 | 16 → 12 | 10 → 8 |
| 2718 | `6adbadbb35c81126930e5b46d5e9233166d3f63a0726a95c68dda082f9b57f0c` | `a8c5e8b3664957d013ed8f38d2bcd28fa635d5ce226167b4541f20e9047fe345` | 165428 → 165434 | 10 → 8 | 8 → 8 | 7 → 7 |
| 4096 | `e4d66a14a2455d693cf659082b13c2558d01315f3a1dee39fd14422fce56066c` | `59a2599f61429a5c57b1d20728267c9b136100a5e066e3c4f38c4109a7a3c242` | 162285 → 164691 | 16 → 6 | 12 → 6 | 8 → 6 |

The first diverging event is the first `captivity-released`. `terms` is unchanged. The ransom fields change.

| Seed | Sequence | Tick | Prisoner | Field | Old | New |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 1847 | 13680 | 118 | Sable Morrow | `treasuryShare` | 6.7 | 13.4 |
| 1847 | 13680 | 118 | Sable Morrow | `leaderShare` | 6.7 | 0 |
| 1847 | 13680 | 118 | Sable Morrow | `factionTreasury` | 3619.88 | 3626.58 |
| 1847 | 13680 | 118 | Sable Morrow | `leaderId`, `leaderMoney` | `character-14`, 36.62 | omitted |
| 2718 | 18482 | 155 | Mina Vale | `treasuryShare` | 29.07 | 58.13 |
| 2718 | 18482 | 155 | Mina Vale | `leaderShare` | 29.06 | 0 |
| 2718 | 18482 | 155 | Mina Vale | `factionTreasury` | 20814.65 | 20843.71 |
| 2718 | 18482 | 155 | Mina Vale | `leaderId`, `leaderMoney` | `character-01`, 147.06 | omitted |
| 4096 | 10683 | 96 | Sable Morrow | `treasuryShare` | 53.42 | 106.84 |
| 4096 | 10683 | 96 | Sable Morrow | `leaderShare` | 53.42 | 0 |
| 4096 | 10683 | 96 | Sable Morrow | `factionTreasury` | 3360.36 | 3413.78 |
| 4096 | 10683 | 96 | Sable Morrow | `leaderId`, `leaderMoney` | `character-14`, 58.07 | omitted |

Counts move because the leader's purse is read by recruit, travel, and trade. The next decision is the first event whose type changes.

| Seed | Sequence | Tick | What changes |
| ---: | ---: | ---: | --- |
| 1847 | 16382 | 140 | Pax Ash `worked` → `market-trade`. His purse is 6.7 lower from tick 118. |
| 2718 | 134964 | 981 | Pax Ash `rested` → `worked`. The first leader was Mara Vane, who does not choose autonomous actions, so the list holds until Pax would have been paid at tick 955. |
| 4096 | 10732 | 96 | Pax Ash `travel-started` → `worked`, on the same tick as the release. He lost 53.42 and does not sail. |

The new counts, captures, releases, and release records match the campaign from before the 50/50 split (events 164313 / 165434 / 164691). The treasuries do not. They are higher than those pre-split totals by the whole paid ransom: 827.65, 789.88, and 530.71. Leader credits are 0. End treasuries are World Government / Free Tide Compact: 43826 / 14064.58, 41769.12 / 15123.57, and 46132.91 / 13275.44. Under the 50/50 rule the leader credits were 690.52 (Pax Ash 294.16, Mara Vane 396.36), 370.88 (Mara Vane 239.72, Pax Ash 131.16), and 427.30 (Pax Ash 189.73, Mara Vane 237.57), and the end treasuries were 44757.67 / 14252.98, 42097 / 14972.74, and 45522.66 / 14512.02.

The sections below describe the 50/50 rule this addendum replaces.

## The rule

`processCaptivityDeadlines` still takes `min(purse, demand)` at two decimal places. That paid amount is the only money that moves. The unpaid remainder stays the debt, with the same creditor and the same loyalty scar.

When the captor faction exists:

- Half goes to that faction's treasury.
- Half goes to the captor's party leader.

When the captor has no faction, the party leader receives the whole payment. Nothing is taken from the debt.

The party leader of a faction is the command holder, the one person who issues that faction's standing orders. The prisoner is never that leader. If the seat is unnamed, or the holder is the prisoner, the leader is the faction member with the highest leadership plus `personality.loyalty * 50`. A lower id wins a tie. The scar is not read.

With no faction, the leader is the prison's owner when that owner has no faction and is not the prisoner. Otherwise the same ranking is applied to unaffiliated characters. These three seeds have no such release through tick 1200. A fixture covers it.

If a faction exists and no leader can be named, the treasury receives the whole payment. If nobody can be named at all, the coins stay in the purse. Neither case happens on these runs.

## Rounding

Money is stored at two decimal places. The split is done in whole cents. There is no RNG.

The odd cent goes to the treasury. The leader's share is `floor(cents / 2)`. The treasury's share is the rest. The two shares sum to the amount paid.

58.13 is 5813 cents: 29.07 to the treasury and 29.06 to the leader. 0.01 pays the treasury 0.01 and the leader 0. A payment of 0 pays 0 and 0. With no faction, 40.01 pays 40.01 to the leader.

## Event and reducer

The event type stays `captivity-released`. The payload gains a `ransom` object: `treasuryShare`, `leaderShare`, `treasuryFactionId`, `factionTreasury`, `leaderId`, `leaderMoney`. `terms` is unchanged. The capture event is unchanged, so a hold that has not been paid does not move the hash.

`applyEvent` sets the treasury and the leader purse from those absolutes when the share is greater than 0. Replay and recovery credit the same accounts the live tick credited. A snapshot taken before the release, then replayed, matches the live world.

## The line

The feed, the briefing, and the chronicle keep the debt wording and "Loyalty fell". They add one sentence both sides can read, including when the payload stays withheld:

`Mina Vale paid 58.13 ransom: 29.07 to the World Government treasury and 29.06 to Mara Vane.`

No faction: `Sable Morrow paid 40.01 ransom: 40.01 to Niko Crow.`

## Hash impact

Tick 72 does not move. No ransom is paid before tick 72 on 1847, 2718, or 4096. The first release on each seed is the first tick the state diverges, one tick after the event, because the credit is applied during that tick:

| Seed | Event tick | State tick | Release | Paid | Treasury | Leader |
| ---: | ---: | ---: | --- | ---: | ---: | --- |
| 1847 | 118 | 119 | Sable Morrow, sequence 13680 | 13.4 | 6.7 Free Tide Compact | 6.7 Pax Ash |
| 2718 | 155 | 156 | Mina Vale, sequence 18482 | 58.13 | 29.07 World Government | 29.06 Mara Vane |
| 4096 | 96 | 97 | Sable Morrow, sequence 10683 | 106.84 | 53.42 Free Tide Compact | 53.42 Pax Ash |

The state hash at the event's own tick, before that tick runs, still matches `443be9e`.

Tick 1200 moves because the leader's purse is read by recruit, travel, and trade. Pax Ash receives the first credit on 1847 and on 4096, so later decisions change. On 2718 the first credit goes to Mara Vane, who does not choose autonomous actions, and the list of captures stays the same until Pax is paid at tick 955.
