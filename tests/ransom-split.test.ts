import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { projectEventFeed } from "../src/dashboard/view-model.ts";
import { captivityReleasedChronicle, captivityReleasedSentence, ransomIncomeNote } from "../src/dashboard/wording.ts";
import { runTick, runTicks } from "../src/sim/engine.ts";
import { WorldStore } from "../src/sim/persistence.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { applyEvent, captorPartyLeader, round, splitRansom, stateHash } from "../src/sim/state.ts";
import type { Character, SimEvent, WorldState } from "../src/sim/types.ts";

/**
 * Seed 1847 in the live session, the run the dashboard shows. The contract
 * haul moved Mara Vane's Crown Harbor hold (tick 528 to 612) out of the
 * headless run; the live run keeps it.
 */

function dueForRelease(
  world: WorldState,
  characterId: string,
  captorFactionId: string | null,
  money: number,
  settlementId: string,
  ownerId?: string,
): Character {
  const character = world.characters[characterId];
  character.money = money;
  character.locationId = settlementId;
  character.travel = null;
  character.captivity = {
    captorFactionId,
    settlementId,
    capturedTick: world.tick - 84,
    mandatoryReleaseTick: world.tick,
    cause: "major-defeat",
    displayedRisk: "moderate",
    scatteredTroops: { count: 200, experience: 0.2, discipline: 0.5 },
    releaseDestinationId: null,
  };
  if (ownerId) world.settlements[settlementId].ownerId = ownerId;
  return character;
}

function releaseOf(events: SimEvent[], actorId: string): SimEvent {
  const release = events.find((event) => event.type === "captivity-released" && event.actorId === actorId);
  assert.ok(release, `expected a release for ${actorId}`);
  return release;
}

test("splitRansom pays a faction treasury every cent and a factionless leader every cent", () => {
  assert.deepEqual(splitRansom(58.13, true), { treasuryShare: 58.13, leaderShare: 0 });
  assert.deepEqual(splitRansom(0.01, true), { treasuryShare: 0.01, leaderShare: 0 });
  assert.deepEqual(splitRansom(0.02, true), { treasuryShare: 0.02, leaderShare: 0 });
  assert.deepEqual(splitRansom(0, true), { treasuryShare: 0, leaderShare: 0 });
  assert.deepEqual(splitRansom(13.4, true), { treasuryShare: 13.4, leaderShare: 0 });
  assert.deepEqual(splitRansom(62.69, true), { treasuryShare: 62.69, leaderShare: 0 });
  assert.deepEqual(splitRansom(40.01, false), { treasuryShare: 0, leaderShare: 40.01 });
  for (const paid of [0, 0.01, 0.02, 13.4, 58.13, 62.69, 106.84]) {
    const split = splitRansom(paid, true);
    assert.equal(split.leaderShare, 0);
    assert.equal(split.treasuryShare, paid);
    const whole = splitRansom(paid, false);
    assert.equal(whole.treasuryShare, 0);
    assert.equal(whole.leaderShare, paid);
  }
});

test("a faction ransom pays the treasury the whole amount and the leader nothing", () => {
  const world = createPrototypeWorld(1847);
  const prisoner = dueForRelease(world, "character-04", "world-government", 58.13, "crown-harbor");
  const leader = captorPartyLeader(world, prisoner);
  assert.equal(leader?.id, "character-01");
  const treasuryBefore = world.factions["world-government"].treasury;
  const leaderBefore = leader!.money;
  const snapshot = structuredClone(world);
  const release = releaseOf(runTick(world).events, "character-04");
  const terms = release.data.terms as { moneyPaid: number; debtValue: number };
  const ransom = release.data.ransom as {
    treasuryShare: number;
    leaderShare: number;
    factionTreasury: number;
    leaderId?: string;
    leaderMoney?: number;
  };
  assert.equal(release.type, "captivity-released");
  assert.equal(terms.moneyPaid, 58.13);
  assert.equal(terms.debtValue, 315.38);
  assert.equal(ransom.treasuryShare, 58.13);
  assert.equal(ransom.leaderShare, 0);
  assert.equal(round(ransom.treasuryShare + ransom.leaderShare, 2), 58.13);
  assert.equal(ransom.leaderId, undefined);
  assert.equal(ransom.leaderMoney, undefined);
  assert.equal(ransom.factionTreasury, round(treasuryBefore - 36 + 58.13, 2));
  assert.equal(ransom.factionTreasury, 18022.13);
  applyEvent(snapshot, release);
  assert.equal(snapshot.factions["world-government"].treasury, 18022.13);
  assert.equal(snapshot.characters["character-01"].money, leaderBefore);
  assert.equal(snapshot.characters["character-01"].money, 108);
  assert.equal(snapshot.characters["character-04"].money, 0);
  assert.equal(ransomIncomeNote(world, "character-01", [release]), null);
  assert.equal(
    captivityReleasedSentence(world, release),
    "Sable Morrow was released from Crown Harbor. 58.13 was paid and 315.38 was recorded as debt. Loyalty fell. 58.13 went to the World Government treasury. The ransom line covers only the ransom.",
  );
});

test("a ransom of one cent pays the treasury and nothing to the leader", () => {
  const world = createPrototypeWorld(1847);
  dueForRelease(world, "character-04", "world-government", 0.01, "crown-harbor");
  const snapshot = structuredClone(world);
  const release = releaseOf(runTick(world).events, "character-04");
  const ransom = release.data.ransom as { treasuryShare: number; leaderShare: number; factionTreasury: number; leaderId?: string };
  assert.equal((release.data.terms as { moneyPaid: number }).moneyPaid, 0.01);
  assert.equal(ransom.treasuryShare, 0.01);
  assert.equal(ransom.leaderShare, 0);
  assert.equal(ransom.leaderId, undefined);
  assert.equal(round(ransom.treasuryShare + ransom.leaderShare, 2), 0.01);
  applyEvent(snapshot, release);
  assert.equal(snapshot.factions["world-government"].treasury, 17964.01);
  assert.equal(snapshot.characters["character-01"].money, 108);
  assert.equal(ransomIncomeNote(world, "character-01", [release]), null);
  assert.equal(
    captivityReleasedSentence(world, release),
    "Sable Morrow was released from Crown Harbor. 0.01 was paid and 373.5 was recorded as debt. Loyalty fell. 0.01 went to the World Government treasury. The ransom line covers only the ransom.",
  );
});

test("a ransom of zero pays nothing and leaves both balances", () => {
  const world = createPrototypeWorld(1847);
  dueForRelease(world, "character-04", "world-government", 0, "crown-harbor");
  const snapshot = structuredClone(world);
  const release = releaseOf(runTick(world).events, "character-04");
  const ransom = release.data.ransom as { treasuryShare: number; leaderShare: number };
  assert.equal((release.data.terms as { moneyPaid: number; debtValue: number }).moneyPaid, 0);
  assert.equal((release.data.terms as { debtValue: number }).debtValue, 373.51);
  assert.equal(ransom.treasuryShare, 0);
  assert.equal(ransom.leaderShare, 0);
  applyEvent(snapshot, release);
  assert.equal(snapshot.factions["world-government"].treasury, 18000);
  assert.equal(snapshot.characters["character-01"].money, 108);
  assert.equal(snapshot.characters["character-04"].money, 0);
  assert.equal(
    captivityReleasedSentence(world, release),
    "Sable Morrow was released from Crown Harbor. 0 was paid and 373.51 was recorded as debt. Loyalty fell. 0 went to the World Government treasury. The ransom line covers only the ransom.",
  );
  assert.equal(ransomIncomeNote(world, "character-01", [release]), null);
});

test("a captor with no faction pays the whole ransom to the party leader", () => {
  const seeded = runTicks(createPrototypeWorld(1847), 1200);
  const nullCaptor = seeded.events.find((event) =>
    event.type === "captivity-released" &&
    (event.data.ransom as { treasuryFactionId: string | null }).treasuryFactionId === null
  );
  assert.equal(nullCaptor, undefined);

  const world = createPrototypeWorld(1847);
  const prisoner = dueForRelease(world, "character-04", null, 40.01, "verdant-cay", "character-23");
  const leader = captorPartyLeader(world, prisoner);
  assert.equal(leader?.name, "Niko Crow");
  assert.equal(leader?.factionId, null);
  const treasuryBefore = {
    "world-government": world.factions["world-government"].treasury,
    "free-tide": world.factions["free-tide"].treasury,
  };
  const leaderBefore = leader!.money;
  const snapshot = structuredClone(world);
  const release = releaseOf(runTick(world).events, "character-04");
  const terms = release.data.terms as { moneyPaid: number; debtValue: number };
  const ransom = release.data.ransom as {
    treasuryShare: number;
    leaderShare: number;
    treasuryFactionId: string | null;
    leaderId: string;
    leaderMoney: number;
  };
  assert.equal(terms.moneyPaid, 40.01);
  assert.equal(terms.debtValue, 333.5);
  assert.equal(ransom.treasuryFactionId, null);
  assert.equal(ransom.treasuryShare, 0);
  assert.equal(ransom.leaderShare, 40.01);
  assert.equal(ransom.leaderId, "character-23");
  assert.equal(ransom.leaderMoney, round(leaderBefore + 40.01, 2));
  applyEvent(snapshot, release);
  assert.equal(snapshot.characters["character-23"].money, ransom.leaderMoney);
  assert.equal(snapshot.characters["character-04"].money, 0);
  assert.equal(snapshot.factions["world-government"].treasury, treasuryBefore["world-government"]);
  assert.equal(snapshot.factions["free-tide"].treasury, treasuryBefore["free-tide"]);
  assert.equal(
    captivityReleasedSentence(world, release),
    "Sable Morrow was released from Verdant Cay. 40.01 was paid and 333.5 was recorded as debt. Loyalty fell. Sable Morrow paid 40.01 ransom: 40.01 to Niko Crow. The ransom line covers only the ransom.",
  );
  assert.equal(
    ransomIncomeNote(world, "character-23", [release]),
    "Received 40.01 from Sable Morrow's ransom at Verdant Cay.",
  );
  assert.equal(ransomIncomeNote(world, "character-01", [release]), null);
});

test("the prisoner is not the party leader of their own ransom", () => {
  const world = createPrototypeWorld(1847);
  const mara = dueForRelease(world, "character-01", "world-government", 10, "crown-harbor");
  const leader = captorPartyLeader(world, mara);
  assert.equal(leader?.id, "character-05");
  assert.equal(leader?.name, "Jun Marrow");
  const junBefore = leader!.money;
  const snapshot = structuredClone(world);
  const release = releaseOf(runTick(world).events, "character-01");
  const ransom = release.data.ransom as { leaderId?: string; treasuryShare: number; leaderShare: number };
  assert.equal(ransom.leaderId, undefined);
  assert.equal(ransom.leaderShare, 0);
  assert.equal(ransom.treasuryShare, 10);
  applyEvent(snapshot, release);
  assert.equal(snapshot.characters["character-01"].money, 0);
  assert.equal(snapshot.characters["character-05"].money, junBefore);
  assert.equal(snapshot.factions["world-government"].treasury, 17974);
  assert.equal(
    captivityReleasedSentence(world, release).includes("Jun Marrow"),
    false,
  );
  assert.equal(
    captivityReleasedSentence(world, release).includes("10 went to the World Government treasury"),
    true,
  );
});

test("a constructed Glassport release pays Dax Pike's 62.69 entirely to the World Government", () => {
  const world = createPrototypeWorld(1847);
  dueForRelease(world, "character-20", "world-government", 62.69, "glassport");
  const maraBefore = world.characters["character-01"].money;
  const treasuryBefore = world.factions["world-government"].treasury;
  assert.equal(maraBefore, 108);
  assert.equal(treasuryBefore, 18000);
  const snapshot = structuredClone(world);
  const tick = runTick(world);
  const release = releaseOf(tick.events, "character-20");
  const terms = release.data.terms as { moneyPaid: number; debtValue: number };
  const ransom = release.data.ransom as {
    treasuryShare: number;
    leaderShare: number;
    leaderId?: string;
    factionTreasury: number;
    leaderMoney?: number;
  };
  assert.equal(terms.moneyPaid, 62.69);
  assert.equal(terms.debtValue, 310.62);
  assert.equal(ransom.treasuryShare, 62.69);
  assert.equal(ransom.leaderShare, 0);
  assert.equal(ransom.leaderId, undefined);
  assert.equal(ransom.leaderMoney, undefined);
  assert.equal(ransom.factionTreasury, 18026.69);
  assert.equal(round(treasuryBefore - 36 + 62.69, 2), 18026.69);
  applyEvent(snapshot, release);
  assert.equal(snapshot.characters["character-01"].money, maraBefore);
  assert.equal(snapshot.factions["world-government"].treasury, 18026.69);
  assert.equal(snapshot.characters["character-20"].money, 0);
  assert.equal(world.characters["character-01"].money, maraBefore);
  // Allowance draws in this tick move the treasury after the ransom credit.
  // The release event holds the credit. The end-of-tick balance does not.
  assert.equal(ransomIncomeNote(world, "character-01", [release]), null);
  const line = "Dax Pike was released from Glassport. 62.69 was paid and 310.62 was recorded as debt. Loyalty fell. 62.69 went to the World Government treasury. The ransom line covers only the ransom.";
  assert.equal(captivityReleasedSentence(world, release), line);
  assert.equal(
    captivityReleasedChronicle(world, release),
    "**Dax Pike** was released from **Glassport** under mandatory terms. 62.69 was paid and 310.62 was recorded as debt. Loyalty fell. 62.69 went to the **World Government** treasury. The ransom line covers only the ransom.",
  );
  const [maraRow] = projectEventFeed(world, "character-01", [release]);
  const [daxRow] = projectEventFeed(world, "character-20", [release]);
  assert.equal(maraRow?.summary, line);
  assert.equal(maraRow?.payloadWithheld, true);
  assert.equal(
    daxRow?.summary,
    "Dax Pike was released from Glassport. 62.69 was paid and 310.62 was recorded as debt. Loyalty fell. 62.69 went to the World Government treasury. The balance is not visible to you. The ransom line covers only the ransom.",
  );
  assert.equal(daxRow?.payloadWithheld, false);
  assert.equal((daxRow?.data as { ransom: { factionTreasury?: number } }).ransom.factionTreasury, undefined);
  assert.equal(String(line).includes("Mara Vane"), false);
});

test("a ransom release recovers from the snapshot before it", () => {
  const live = runTicks(createPrototypeWorld(1847), 119);
  const release = live.events.find((event) => event.sequence === 13680);
  assert.ok(release);
  const directory = mkdtempSync(join(tmpdir(), "open-era-ransom-recovery-"));
  const databasePath = join(directory, "world.sqlite");
  const store = new WorldStore(databasePath);
  try {
    const world = createPrototypeWorld(1847);
    store.initialize(world);
    let splitSequence: number | null = null;
    let splitJson: string | null = null;
    let splitHash: string | null = null;
    for (let index = 0; index < 119; index += 1) {
      const result = runTick(world);
      store.appendTick(result.events, world);
      if (world.tick === 118 && splitSequence === null) {
        splitSequence = result.events.at(-1)!.sequence;
        splitJson = JSON.stringify(world);
        splitHash = stateHash(world);
      }
    }
    assert.ok(splitSequence !== null && splitJson !== null && splitHash !== null);
    store.database.prepare(
      "INSERT OR REPLACE INTO snapshots(sequence, tick, state_json, state_hash) VALUES (?, ?, ?, ?)",
    ).run(splitSequence, 118, splitJson, splitHash);
    store.database.prepare("DELETE FROM snapshots WHERE tick > ?").run(118);
    const recovered = store.recover();
    assert.ok(recovered.replayedEvents > 0);
    assert.equal(recovered.state.tick, 119);
    assert.equal(stateHash(recovered.state), stateHash(live.state));
    assert.equal(recovered.state.factions["free-tide"].treasury, live.state.factions["free-tide"].treasury);
    assert.equal(recovered.state.characters["character-14"].money, live.state.characters["character-14"].money);
    assert.equal(recovered.state.characters["character-04"].money, live.state.characters["character-04"].money);
    assert.equal(recovered.state.characters["character-04"].debts.length, live.state.characters["character-04"].debts.length);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
