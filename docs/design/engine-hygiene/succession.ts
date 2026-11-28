// Item 4 confirmation: what commandHolderId does on holder death, retirement, and
// exile-like leavers (desertion, capture), on main vs the stored-holder prototype.
// Also: a non-holder issue after a vacant death (main's implicit refill).
// Usage: node --experimental-strip-types docs/design/engine-hygiene/succession.ts <label>
import { applyEvent, commandHolderId, stateHash } from "../../../src/sim/state.ts";
import { createPrototypeWorld } from "../../../src/sim/scenario.ts";
import { submitCommand } from "../../../src/sim/commands.ts";
import { isRetired } from "../../../src/sim/lifecycle.ts";
import type { SimEvent, WorldState } from "../../../src/sim/types.ts";

const label = process.argv[2] ?? "main";
function ev(world: WorldState, draft: Omit<SimEvent, "sequence" | "tick"> & { tick?: number }): SimEvent {
  return { sequence: world.nextEventSequence, tick: draft.tick ?? world.tick, ...draft } as SimEvent;
}
function kill(world: WorldState, id: string): void {
  const c = world.characters[id];
  const factionId = c.factionId;
  const holder = factionId ? commandHolderId(world, factionId) : null;
  const data: Record<string, unknown> = {
    cause: "old-age", policy: "vacant", ageYears: 120,
    characterMoney: c.money, sailors: c.sailors,
    troops: { ...c.troops }, debts: [...(c.debts ?? [])], factionId: null,
    clearCaptivity: c.captivity !== null, clearRecovery: c.troopRecovery !== null,
    ports: Object.values(world.settlements).filter((s) => s.ownerId === id).map((s) => s.id).sort(),
    treasuries: [], endBattleIds: [],
  };
  if (factionId && holder === id) { data.commandFactionId = factionId; data.actingCommanderId = null; }
  applyEvent(world, ev(world, { type: "character-died", actorId: id, data }));
}
function retire(world: WorldState, id: string): void {
  const c = world.characters[id];
  const ports = Object.values(world.settlements).filter((s) => s.factionId === c.factionId).length;
  applyEvent(world, ev(world, { type: "character-retired", actorId: id, settlementId: c.locationId ?? undefined, data: { cause: "probe", watchSince: 0, troops: c.troops.count, portsAtRetire: ports, office: null } }));
}
function desert(world: WorldState, id: string): void {
  const c = world.characters[id];
  applyEvent(world, ev(world, { type: "character-deserted", actorId: id, targetId: c.factionId ?? undefined, data: { roll: 0, factionId: null, previousFactionId: c.factionId } }));
}
function capture(world: WorldState, id: string): void {
  const c = world.characters[id];
  const settlementId = c.locationId ?? "crown-harbor";
  const settlement = world.settlements[settlementId];
  applyEvent(world, ev(world, {
    type: "character-captured", actorId: id, settlementId, targetId: settlement.factionId ?? undefined,
    data: {
      battleId: `probe-${id}`, cause: "major-defeat", displayedRisk: "high",
      health: c.health, morale: c.morale,
      captivity: {
        captorFactionId: settlement.factionId, settlementId, capturedTick: world.tick,
        mandatoryReleaseTick: world.tick + 84, cause: "major-defeat", displayedRisk: "high",
        scatteredTroops: { ...c.troops }, releaseDestinationId: null,
      },
    },
  }));
}
function issueApplied(world: WorldState, issuerId: string, recipientId: string): void {
  applyEvent(world, ev(world, {
    type: "standing-order-issued", actorId: issuerId, targetId: recipientId,
    data: { order: {
      id: `${issuerId}:probe:${recipientId}`, issuerId, directive: "protect", targetId: "crown-harbor",
      priority: 0.78, issuedTick: world.tick, expiresTick: null, revision: 1, status: "pending",
      adherence: "unassessed", statusChangedTick: world.tick, deviationCount: 0, lastReport: null,
    } },
  }));
}

const cases: Array<{ name: string; run: () => Record<string, unknown> }> = [];

cases.push({ name: "death-vacates-seat", run: () => {
  const w = createPrototypeWorld(1847);
  const before = commandHolderId(w, "world-government");
  const storedBefore = w.factions["world-government"].commandHolderId ?? null;
  const actingBefore = w.factions["world-government"].actingCommanderId ?? null;
  kill(w, "character-01");
  return {
    before, storedBefore, actingBefore,
    after: commandHolderId(w, "world-government"),
    storedAfter: w.factions["world-government"].commandHolderId ?? null,
    actingAfter: w.factions["world-government"].actingCommanderId ?? null,
    dead: w.characters["character-01"].dead,
    factionId: w.characters["character-01"].factionId,
  };
}});

cases.push({ name: "retirement-keeps-membership-and-seat", run: () => {
  const w = createPrototypeWorld(1847);
  const before = commandHolderId(w, "world-government");
  retire(w, "character-01");
  return {
    before, after: commandHolderId(w, "world-government"),
    storedAfter: w.factions["world-government"].commandHolderId ?? null,
    retired: isRetired(w.characters["character-01"]),
    factionId: w.characters["character-01"].factionId,
    dead: w.characters["character-01"].dead,
  };
}});

cases.push({ name: "desertion-vacates-seat", run: () => {
  const w = createPrototypeWorld(1847);
  const before = commandHolderId(w, "world-government");
  desert(w, "character-01");
  return {
    before, after: commandHolderId(w, "world-government"),
    storedAfter: w.factions["world-government"].commandHolderId ?? null,
    factionId: w.characters["character-01"].factionId,
  };
}});

cases.push({ name: "capture-keeps-seat-sets-acting", run: () => {
  const w = createPrototypeWorld(1847);
  const before = commandHolderId(w, "world-government");
  const actingBefore = w.factions["world-government"].actingCommanderId ?? null;
  capture(w, "character-01");
  return {
    before, after: commandHolderId(w, "world-government"),
    storedAfter: w.factions["world-government"].commandHolderId ?? null,
    actingBefore, actingAfter: w.factions["world-government"].actingCommanderId ?? null,
    captive: w.characters["character-01"].captivity !== null,
    factionId: w.characters["character-01"].factionId,
  };
}});

cases.push({ name: "issue-after-death-vacancy", run: () => {
  const w = createPrototypeWorld(1847, { playerCharacterId: "character-02" });
  kill(w, "character-01");
  const vacant = commandHolderId(w, "world-government");
  issueApplied(w, "character-02", "character-03");
  return {
    vacant, afterIssue: commandHolderId(w, "world-government"),
    storedAfter: w.factions["world-government"].commandHolderId ?? null,
  };
}});

const rows = cases.map((c) => ({ name: c.name, ...c.run() }));
console.log(JSON.stringify({ label, hash8: stateHash(createPrototypeWorld(1847)).slice(0, 8), rows }, null, 2));
