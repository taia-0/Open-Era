# Breakaway tax

**Status: Ruled.** The Lead accepted the founder tax seat as proposed, and ruled that a faction with no mates does not step up for short. No game code was committed. The measurement used a scratch worktree of `origin/feature/batch2` at `b7895c0` (`b7895c054b731ddb665d9cea2d6a9395c61f8c3c`), outside the repository, removed afterwards. Node v24.21.0, ICU 78.3. A fresh process per seed, 1200 ticks, no player commands. With every harness flag off, the worktree reproduced the Engineer's pin: `e95a9f81` (162438), `8f0b7daa` (163070), `f19aa3d1` (164176). Line numbers are on `b7895c0`.

The Engineer reported two problems. Every breakaway faction stays at 0.08 and never steps, for example Free Glassport (treasury 3253) and Free Cinder Key III (treasury 0). And Free Tide ends broke at 0.20–0.24 on 1847 and 4096, below the 0.30 cap.

## 1. Breakaway factions never step

The Engineer's guess is right.

- `chooseAutonomousTaxRates` (`src/sim/engine.ts:3467`) calls `autonomousTaxStep` (`:3471`) for every faction on the 24-tick clock.
- `autonomousTaxStep` (`src/sim/tax-rate.ts`) returns null at `:168` when `freeCommandHolder` finds nobody. `freeCommandHolder` (`:141`) keeps members whose `spendRole` is `"holder"`.
- `spendRole` (`src/sim/allowance.ts:84`) is `"holder"` only for `commandHolderId(world, factionId)`.
- `commandHolderId` (`src/sim/state.ts:303`) is the single character who issues the faction's standing orders. There is no stored seat.
- The secession builders (`src/sim/secession.ts`, `buildGovernorSecession` and `buildSecessionDeclaration`) write the new faction with `treasury: 0` (`:354`, `:400`) and `taxRate: SECESSION_FOUNDING_TAX_RATE`, which is 0.08 (`:219`). They write no standing order. Nobody in a breakaway issues one later, so the seat stays unnamed, and `:168` returns null on every clock point.

This is the recorded default. [Secession](secession.md) says: "Default: the declaration does not mint a standing order. The new seat is unnamed until an `issue-order`." The brief did not consider what that does to the tax step, which came later (leader-tax autonomy, #94).

Measured: every breakaway on every seed had **0 ticks with a holder** and **0 steps**. Its clock points with a holder were 0 of 1 to 22.

## 2. Free Tide broke below the cap

Free Tide is not capped. It stops stepping for two ruled reasons, and it spends faster than it taxes.

- **The landless freeze.** `src/sim/tax-rate.ts:175` returns null when the faction holds no port, as ruled in [leader tax](leader-tax.md) and [build order](build-order.md). Free Tide's last step and last held port:
  - 1847: last step tick 840 at 0.20. Held a port until tick 1155, then landless. From 840 to 1155 no clock point was pressed or short.
  - 2718: last step tick 1080 at 0.14; last port tick 1103.
  - 4096: last step tick 1008 at 0.24; last port tick 1026, then frozen at 0.24.
- **Short needs free mates.** `:188` is `short = mates > 0 && treasury < mates × one day of passage`. Free Tide has a holder (Pax Ash, `character-14`) on all 1200 ticks, but it ends with 1 / 1 / 2 members. On 2718, 5 of its 42 clock points with a port had 0 free mates and could not step up. On 1847 and 4096 there were none.
- **Spending outruns income.** Free Tide treasury change by event type over the run (1847 / 2718 / 4096):

| Line | 1847 | 2718 | 4096 |
| --- | ---: | ---: | ---: |
| `worked` (work tax and levy) | +4,823.92 | +8,810.65 | +7,689.43 |
| `market-trade` (sales tax and levy) | +3,478.16 | +4,823.47 | +8,027.07 |
| `recruited` | −6,771.59 | −12,372.64 | −15,107.72 |
| `character-upkeep` | −3,150.68 | −2,107.98 | −1,541.09 |
| `contract-offered` (escrow) | −841.34 | −2,351.80 | −1,479.18 |
| contract refunds (`refused` + `breached`) | +669.53 | +1,883.80 | +1,411.49 |
| `captivity-released` / `debt-repaid` | +108.00 / 0 | +351.72 / +257.36 | 0 / 0 |
| Outside events (stipend and other start-of-tick writes) | −1,116 | −1,782 | −1,800 |

Recruitment is the largest drain on every seed. That matches the income ruling: a near-zero Free Tide is acceptable, because rulers spend freely. The design record does not ask Free Tide to stay solvent.

## 3. What the design record says

- **[Secession](secession.md):** the founding rate is 0.08, the treasury starts at 0, and the seat is unnamed until an `issue-order`. It does not say whether a breakaway should run the tax step.
- **[Leader tax](leader-tax.md):** the free command holder sets the rate. The step is one cent on the 24-tick clock, pressed at the 55 floor, short on the allowance test. The landless freeze ruling (line 411) is that a faction with no port does not step until it holds one again.
- **Graded drift and tax stability** (the leader-tax addenda): a rate above 0.15 drifts held-port stability. They say nothing about breakaways.
- Nothing in the record says breakaways should step, or that they should not.

## 4. Ruling (accepted)

**The founder holds the tax seat of a breakaway until someone issues an order.** In `freeCommandHolder` only: when `commandHolderId` is null and the faction came from a secession, the declaring owner counts as the free holder for the tax step if they are alive, still a member, and not captive. Nothing else reads the fallback. Allowance, `spendRole`, orders, and cover stay on `commandHolderId`, so no other seat-dependent rule moves. A build would store `founderId` on the faction from `secession-declared.data.ownerId`. The harness read it from the faction id (`secession-<ownerId>-<port>-<tick>`).

**Accepted by the Lead as proposed.** The fallback lives only inside `freeCommandHolder`, and the build stores `founderId` from the declaration. Without it a breakaway can never use a lever every other faction has. The [secession](secession.md) default against minting an order still stands.

**Free Tide: no change (accepted).** The freeze and the spending are both ruled behavior.

## 5. Measured, harness only

`OPEN_ERA_FOUNDER_SEAT=on`, against the pin.

| Seed | Run | Hash | Events | Secessions | Deaths |
| --- | --- | --- | ---: | ---: | ---: |
| 1847 | pin | `e95a9f816e4855fc0331b66567fd469bae02ea93084a32b4e6ab1d79452c5543` | 162438 | 4 | 1 |
| 1847 | founder seat | `fca9570b9b7e99c440b428a9695dbdc63f1e0cf830db92f88ed6b2ee6fdecc37` | 163018 | 3 | 1 |
| 2718 | pin | `8f0b7daa8a89a6546ecac09f8da5c58ebf2a6592383786d13a584362c8b25dea` | 163070 | 4 | 2 |
| 2718 | founder seat | `a08110bcbedbfe3073ea016969e7371f5c73ded84b4e0efd9eae3ce45f259bbe` | 162896 | 4 | 2 |
| 4096 | pin | `f19aa3d1f5f35e7ed4826dad07898e8029e17db403ed4599aae51323c4d891cb` | 164176 | 1 | 1 |
| 4096 | founder seat | `f19aa3d1…` (unchanged) | 164176 | 1 | 1 |

Per faction at tick 1200. Steps, end rate (maximum), treasury, holder by `commandHolderId`, ports held at the end, members, and clock points total / with a holder / with a holder and a port.

| Seed | Faction | Born | Pin: steps, rate, treasury | Founder seat: steps, rate, treasury |
| --- | --- | ---: | --- | --- |
| 1847 | World Government | — | 8, 0.06 (0.13), 10909.93 | 9, 0.05 (0.13), 10851.41 |
| 1847 | Free Tide | — | 16, 0.20 (0.20), 0.00 | 16, 0.20 (0.20), 0.00 |
| 1847 | Free Glassport | 652 | 0, 0.08, 3253.23 | 0, 0.08, 3466.13 |
| 1847 | Free Cinder Key | 840 | 0, 0.08, 289.12 | **2, 0.10**, 586.11 |
| 1847 | Free Crown Harbor | 849 | 0, 0.08, 619.45 | 0, 0.08, 700.23 |
| 1847 | Free Cinder Key II | 1155 | 0, 0.08, 29.99 | not founded |
| 2718 | World Government | — | 3, 0.11 (0.13), 10881.57 | 3, 0.11 (0.13), 11399.90 |
| 2718 | Free Tide | — | 24, 0.14 (0.21), 312.58 | 23, 0.15 (0.21), 18.53 |
| 2718 | Free Cinder Key | 807 | 0, 0.08, 325.98 | **2, 0.06**, 366.76 |
| 2718 | Free Cinder Key II | 816 | 0, 0.08, 822.29 | 0, 0.08, 469.90 |
| 2718 | Free Glassport | 822 | 0, 0.08, 1321.50 | 0, 0.08, 1271.43 |
| 2718 | Free Cinder Key III | 894 | 0, 0.08, 0.00 | 0, 0.08, 0.00 |
| 4096 | World Government | — | 7, 0.07 (0.13), 9637.43 | same |
| 4096 | Free Tide | — | 26, 0.24 (0.24), 0.00 | same |
| 4096 | Free Cinder Key | 1026 | 0, 0.08, 830.73 | same |

In the pin, every breakaway has 0 holder ticks and 0 of its 1–22 clock points with a holder. World Government and Free Tide have a holder on all 1200 ticks and on 49 of 49 clock points. Clock points with a holder and a port: World Government 49 / 49 / 49, Free Tide 32 / 42 / 40. Free Tide ends with 0 / 0 / 0 ports and 1 / 1 / 2 members.

**What the fix does.** The seat makes the step reachable, but it fires rarely: 2 steps on one breakaway on 1847 and one on 2718, none on 4096. The reason is the step rule itself. Most breakaways are one or two people, so `freeMateCount` is 0 and `short` (`tax-rate.ts:188`) is false. Only a pressed port moves the rate, and only down. Free Glassport on 1847, with 3466 in its treasury, still never steps. **Ruled: a faction with no mates does not step up for short.** Short means the faction cannot pay its mates, and with no mates there is nobody to pay. The existing rule at `tax-rate.ts:188` stands.

## Rulings

1. **Founder seat for the tax step: accepted as proposed.** It applies only inside `freeCommandHolder`. The build stores `founderId` from `secession-declared.data.ownerId`. No change to Free Tide.
2. **A faction with no mates does not step up for short.** Short means the faction cannot pay its mates. With no mates there is nobody to pay, so the existing rule stands.
