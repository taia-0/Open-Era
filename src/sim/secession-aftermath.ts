import { freeMateCount } from "./allowance.ts";
import { ALLIANCE_NEAR, ALLIANCE_RAID_WINDOW, alliancesOf, allied } from "./alliances.ts";
import { RESERVE_PER_HEAD } from "./port-transfer.ts";
import { createPrototypeWorld } from "./scenario.ts";
import { commandHolderId, distanceBetween, round } from "./state.ts";
import type { SimEvent, WorldState } from "./types.ts";

/**
 * SECESSION_AFTERMATH (docs/design/secession-aftermath.md rev 2). Peace, protection, or
 * membership for a seceded port that is still held after AFTERMATH_WINDOW. No RNG and no AI.
 * Flag off: nothing here runs, and `world.secessionAftermath` is never created.
 *
 * Lead rulings on top of the spec:
 *  1. Peace blocks autonomous raids (engine `buildCandidates`). `faction-peace-broken` is the
 *     guard for a player raid, which is not peace-gated. Autonomous raids are not let through.
 *  2. An outcome at age 67 is legal when its causes already hold. The window is not moved.
 *  3. At most one peace and one protection per secession. A break does not clear `peaceTick`,
 *     so there is no second peace. Join is not gated on peace and can still fire (it is terminal).
 */
export const SECESSION_AFTERMATH_DEFAULT = false;
/** p90 flag-off hold of a seceded port (31 losses, max 97). Ruled. Not read from the environment. */
export const AFTERMATH_WINDOW = 67;
/**
 * Patron search only. The spec's 3-decimal Crown Harbor–Glassport distance.
 * The raw hypot is 43.829214, so the comparison uses the same 3-decimal distance
 * the spec lists; that pair is inside the radius. Threat "near" stays ALLIANCE_NEAR.
 */
export const PATRON_NEAR = 43.829;
/**
 * The secession "hated" gate (`secession.ts` `HATED_GRIEVANCE`), kept as a guard.
 * Not imported from that module: it imports the engine, and this module is applied from `state.ts`.
 */
export const PEACE_GRIEVANCE = 0.12;

const setupGrievances = new Map<number, Map<string, number>>();
/** Same subtraction the hated route uses. Cached per seed from the setup world. */
function startingGrievance(seed: number, fromId: string, toId: string): number {
  let table = setupGrievances.get(seed);
  if (!table) {
    table = new Map();
    for (const character of Object.values(createPrototypeWorld(seed).characters)) {
      for (const [otherId, relationship] of Object.entries(character.relationships)) table.set(`${character.id}>${otherId}`, relationship.grievance);
    }
    setupGrievances.set(seed, table);
  }
  return table.get(`${fromId}>${toId}`) ?? 0;
}

export interface AftermathRecord {
  factionId: string;
  settlementId: string;
  oldFactionId: string;
  ownerId: string;
  declaredTick: number;
  peaceTick?: number;
  protectionTick?: number;
  joinedTick?: number;
}

export interface Peace {
  factionIds: [string, string];
  tick: number;
  cause: string;
}

export interface SecessionAftermathState {
  records: AftermathRecord[];
  peace: Peace[];
}

export interface PatronCandidate {
  factionId: string;
  port: string;
  distance: number;
  surplus: number;
}

type Emit = (draft: { type: string; actorId?: string; targetId?: string; settlementId?: string; data: Record<string, unknown> }) => void;

export function atPeace(world: WorldState, a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || a === b) return false;
  return (world.secessionAftermath?.peace ?? []).some((peace) => peace.factionIds.includes(a) && peace.factionIds.includes(b));
}

function friendly(world: WorldState, a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a === b || atPeace(world, a, b) || allied(world, a, b);
}

function portsOf(world: WorldState, factionId: string) {
  return Object.values(world.settlements).filter((settlement) => settlement.factionId === factionId).sort((a, b) => a.id.localeCompare(b.id));
}

function factionAlive(world: WorldState, factionId: string): boolean {
  return Object.values(world.characters).some((character) => !character.dead && character.factionId === factionId);
}

/** 3-decimal port distance, the precision the spec uses for PATRON_NEAR. */
export function portDistance(world: WorldState, a: string, b: string): number {
  return round(distanceBetween(world, a, b), 3);
}

/** Treasury minus the stipend reserve (18 per free mate and per held port). */
export function factionSurplus(world: WorldState, factionId: string): number {
  return round(world.factions[factionId].treasury - RESERVE_PER_HEAD * (freeMateCount(world, factionId) + portsOf(world, factionId).length), 2);
}

/**
 * Earned grievance of the owner toward the old faction's command holder, the same
 * subtraction the hated route uses. No holder reads as 0, so it does not block peace.
 * The acting commander is not included: the spec names the command holder.
 */
export function earnedGrievance(world: WorldState, ownerId: string, oldFactionId: string): number {
  const holder = commandHolderId(world, oldFactionId);
  if (!holder) return 0;
  const owner = world.characters[ownerId];
  return (owner?.relationships[holder]?.grievance ?? 0) - startingGrievance(world.seed, ownerId, holder);
}

function grievanceLabel(grievance: number): string {
  const shown = round(grievance, 3);
  if ((shown < PEACE_GRIEVANCE) === (grievance < PEACE_GRIEVANCE)) return String(shown);
  return String(grievance);
}

/**
 * Threat to seceded faction S at port P: the latest hostile raider within the raid window,
 * else the hostile holder of the nearest port within ALLIANCE_NEAR (30, not the patron radius).
 */
export function threatTo(world: WorldState, factionId: string, portId: string): { factionId: string; cause: string } | null {
  const raids = Object.entries(world.allianceRaids ?? {})
    .filter(([key, tick]) => key.endsWith(`>${factionId}`) && world.tick - tick <= ALLIANCE_RAID_WINDOW)
    .map(([key, tick]) => ({ by: key.slice(0, key.length - factionId.length - 1), tick }))
    .filter((raid) => world.factions[raid.by] && !friendly(world, raid.by, factionId))
    .sort((a, b) => b.tick - a.tick || a.by.localeCompare(b.by));
  if (raids.length > 0) {
    const raid = raids[0];
    return { factionId: raid.by, cause: `raided: ${raid.by} raided ${factionId} at t${raid.tick}, ${world.tick - raid.tick} ticks ago` };
  }
  const near = Object.values(world.settlements)
    .filter((settlement) => {
      if (!settlement.factionId || settlement.id === portId) return false;
      if (friendly(world, settlement.factionId, factionId)) return false;
      return distanceBetween(world, settlement.id, portId) <= ALLIANCE_NEAR;
    })
    .sort((a, b) => distanceBetween(world, a.id, portId) - distanceBetween(world, b.id, portId) || a.id.localeCompare(b.id));
  if (near.length > 0) {
    const holder = near[0];
    return {
      factionId: holder.factionId!,
      cause: `near: ${holder.factionId} holds ${holder.id} at ${distanceBetween(world, holder.id, portId).toFixed(3)} from ${portId}`,
    };
  }
  return null;
}

/** Solvent patrons: alive, a port within PATRON_NEAR, not S or O or the threat, hostile to both O and the threat. Surplus descending, then id. */
export function patronCandidates(world: WorldState, record: AftermathRecord, threatId: string): PatronCandidate[] {
  const inRange: PatronCandidate[] = [];
  for (const factionId of Object.keys(world.factions).sort()) {
    if (factionId === record.factionId || !factionAlive(world, factionId)) continue;
    const port = portsOf(world, factionId).find((settlement) => settlement.id !== record.settlementId && portDistance(world, settlement.id, record.settlementId) <= PATRON_NEAR);
    if (!port) continue;
    inRange.push({
      factionId,
      port: port.id,
      distance: portDistance(world, port.id, record.settlementId),
      surplus: factionSurplus(world, factionId),
    });
  }
  return inRange
    .filter((candidate) => candidate.factionId !== record.oldFactionId && candidate.factionId !== threatId && !friendly(world, candidate.factionId, record.oldFactionId) && !friendly(world, candidate.factionId, threatId) && candidate.surplus >= 0)
    .sort((a, b) => b.surplus - a.surplus || a.factionId.localeCompare(b.factionId));
}

function latestCrossRaid(world: WorldState, peace: Peace): { by: string; on: string; tick: number } | null {
  const raids = world.allianceRaids ?? {};
  const [a, b] = peace.factionIds;
  const hits = ([
    [a, b],
    [b, a],
  ] as const)
    .map(([by, on]) => ({ by, on, tick: raids[`${by}>${on}`] }))
    .filter((hit): hit is { by: string; on: string; tick: number } => hit.tick !== undefined && hit.tick > peace.tick);
  hits.sort((left, right) => right.tick - left.tick || left.by.localeCompare(right.by));
  return hits[0] ?? null;
}

export function aftermathStep(world: WorldState, tickEvents: readonly SimEvent[], emit: Emit): void {
  if (!world.secessionAftermath) emit({ type: "aftermath-ledger-opened", data: {} });
  for (const event of tickEvents) {
    if (event.type !== "secession-declared" || !event.settlementId) continue;
    const data = event.data as { faction?: { id?: string }; previousFactionId?: string; ownerId?: string };
    const factionId = data.faction?.id;
    const oldFactionId = data.previousFactionId ?? event.targetId;
    const ownerId = data.ownerId;
    if (!factionId || !oldFactionId || !ownerId) continue;
    emit({
      type: "aftermath-watch",
      settlementId: event.settlementId,
      data: {
        record: { factionId, settlementId: event.settlementId, oldFactionId, ownerId, declaredTick: event.tick },
      },
    });
  }
  // Breaks first, for every live peace. A player raid (or any raid that skipped the autonomous gate) lands here.
  for (const peace of [...(world.secessionAftermath?.peace ?? [])]) {
    const hit = latestCrossRaid(world, peace);
    if (!hit) continue;
    emit({
      type: "faction-peace-broken",
      data: {
        factionIds: peace.factionIds,
        peaceTick: peace.tick,
        reason: "raid",
        evidence: { raiderFactionId: hit.by, targetFactionId: hit.on, raidTick: hit.tick },
        cause: `raid: ${hit.by} raided ${hit.on} at t${hit.tick}, after peace at t${peace.tick}`,
      },
    });
  }
  const records = [...(world.secessionAftermath?.records ?? [])].sort((a, b) => a.declaredTick - b.declaredTick || a.factionId.localeCompare(b.factionId));
  for (const record of records) {
    if (record.joinedTick !== undefined) continue;
    const port = world.settlements[record.settlementId];
    if (!port || port.factionId !== record.factionId) continue;
    const age = world.tick - record.declaredTick;
    // Age 67 is in the window. Ruling 2: do not require a later tick.
    if (age < AFTERMATH_WINDOW) continue;
    const held = `${record.factionId} has held ${record.settlementId} ${age} ticks since t${record.declaredTick} (window ${AFTERMATH_WINDOW})`;
    // Ruling 3: peaceTick stays set after a break, so a secession peaces at most once.
    if (record.peaceTick === undefined && factionAlive(world, record.oldFactionId)) {
      const grievance = earnedGrievance(world, record.ownerId, record.oldFactionId);
      const last = world.allianceRaids?.[`${record.oldFactionId}>${record.factionId}`];
      const raided = last !== undefined && world.tick - last <= ALLIANCE_RAID_WINDOW;
      if (grievance < PEACE_GRIEVANCE && !raided) {
        emit({
          type: "faction-peace",
          settlementId: record.settlementId,
          data: {
            peace: {
              factionIds: [record.factionId, record.oldFactionId] as [string, string],
              tick: world.tick,
              cause: `survived: ${held}; earned grievance ${grievanceLabel(grievance)} < ${PEACE_GRIEVANCE}; no raid by ${record.oldFactionId} within ${ALLIANCE_RAID_WINDOW}`,
            },
            grievance,
            lastOldRaid: last ?? null,
            age,
          },
        });
      }
    }
    // One protection. Join is not skipped because of peace; a recorded protection is the one protection,
    // and a live pact (protection or an ALLIANCES pact) blocks both.
    if (record.protectionTick !== undefined) continue;
    if (alliancesOf(world).some((alliance) => alliance.factionIds.includes(record.factionId))) continue;
    const own = factionSurplus(world, record.factionId);
    const threat = threatTo(world, record.factionId, record.settlementId);
    if (!threat) continue;
    const candidates = patronCandidates(world, record, threat.factionId);
    if (candidates.length === 0) continue;
    const patron = candidates[0];
    if (own >= 0) {
      emit({
        type: "alliance-formed",
        settlementId: record.settlementId,
        data: {
          aftermath: "protection",
          patron,
          ownSurplus: own,
          alliance: {
            id: `protection-${world.tick}-${record.factionId}-${patron.factionId}`,
            factionIds: [record.factionId, patron.factionId],
            enemyFactionId: threat.factionId,
            formedTick: world.tick,
            causes: {
              [record.factionId]: `protection: ${held}; threat ${threat.cause}; own surplus ${own} >= 0`,
              [patron.factionId]: `protector: holds ${patron.port} at ${patron.distance}, hostile to ${record.oldFactionId} and ${threat.factionId}, surplus ${patron.surplus}`,
            },
            portsAtForm: {
              [record.factionId]: portsOf(world, record.factionId).length,
              [patron.factionId]: portsOf(world, patron.factionId).length,
            },
          },
        },
      });
    } else {
      const members = Object.values(world.characters).filter((character) => !character.dead && character.factionId === record.factionId).map((character) => character.id).sort();
      emit({
        type: "secession-joined",
        settlementId: record.settlementId,
        actorId: record.ownerId,
        targetId: patron.factionId,
        data: {
          patron,
          ownSurplus: own,
          factionId: record.factionId,
          joinedFactionId: patron.factionId,
          oldFactionId: record.oldFactionId,
          memberIds: members,
          ports: portsOf(world, record.factionId).map((settlement) => settlement.id),
          treasury: world.factions[record.factionId].treasury,
          cause: `membership: ${held}; threat ${threat.cause}; own surplus ${own} < 0; ${patron.factionId} holds ${patron.port} at ${patron.distance}, hostile to ${record.oldFactionId}, surplus ${patron.surplus}`,
        },
      });
    }
  }
}

export function applyAftermathEvent(world: WorldState, event: SimEvent): boolean {
  switch (event.type) {
    case "aftermath-ledger-opened":
      world.secessionAftermath = { records: [], peace: [] };
      return true;
    case "aftermath-watch": {
      const source = event.data.record as AftermathRecord;
      world.secessionAftermath!.records.push({
        factionId: source.factionId,
        settlementId: source.settlementId,
        oldFactionId: source.oldFactionId,
        ownerId: source.ownerId,
        declaredTick: source.declaredTick,
      });
      return true;
    }
    case "faction-peace": {
      const peace = event.data.peace as Peace;
      world.secessionAftermath!.peace.push({
        factionIds: [peace.factionIds[0], peace.factionIds[1]],
        tick: peace.tick,
        cause: peace.cause,
      });
      const record = world.secessionAftermath!.records.find((candidate) => candidate.factionId === peace.factionIds[0]);
      if (record) record.peaceTick = event.tick;
      return true;
    }
    case "faction-peace-broken": {
      const ids = event.data.factionIds as [string, string];
      const peaceTick = event.data.peaceTick as number;
      // The peace record goes. peaceTick on the secession stays, so the pair cannot peace again.
      world.secessionAftermath!.peace = world.secessionAftermath!.peace.filter((peace) => !(peace.factionIds[0] === ids[0] && peace.factionIds[1] === ids[1] && peace.tick === peaceTick));
      return true;
    }
    case "secession-joined": {
      const data = event.data as { joinedFactionId: string; factionId: string; memberIds: string[]; ports: string[] };
      const to = data.joinedFactionId;
      for (const id of data.memberIds) {
        const character = world.characters[id];
        if (character) character.factionId = to;
      }
      for (const portId of data.ports) {
        const settlement = world.settlements[portId];
        if (!settlement) continue;
        settlement.factionId = to;
        delete settlement.occupation;
      }
      world.factions[to].treasury = round(world.factions[to].treasury + world.factions[data.factionId].treasury, 2);
      world.factions[data.factionId].treasury = 0;
      const record = world.secessionAftermath!.records.find((candidate) => candidate.factionId === data.factionId);
      if (record) record.joinedTick = event.tick;
      return true;
    }
    default:
      return false;
  }
}

/** A protection pact is an alliance record. Mark the secession so it cannot protect twice. */
export function noteProtection(world: WorldState, event: SimEvent): void {
  if (event.type !== "alliance-formed" || event.data.aftermath !== "protection") return;
  const ids = (event.data.alliance as { factionIds: string[] }).factionIds;
  const record = world.secessionAftermath?.records.find((candidate) => candidate.factionId === ids[0]);
  if (record) record.protectionTick = event.tick;
}
