import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { applyEvent, normalizeWorldState, stateHash } from "./state.ts";
import type { SimEvent, WorldState } from "./types.ts";

export interface RecoveryResult {
  state: WorldState;
  snapshotSequence: number;
  replayedEvents: number;
}

interface SnapshotRow {
  sequence: number;
  state_json: string;
  state_hash: string;
}

interface EventRow {
  sequence: number;
  tick: number;
  type: string;
  actor_id: string | null;
  target_id: string | null;
  settlement_id: string | null;
  data_json: string;
}

export class WorldStore {
  readonly database: DatabaseSync;

  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.database = new DatabaseSync(path);
    this.database.exec("PRAGMA journal_mode = WAL");
    this.database.exec("PRAGMA synchronous = NORMAL");
    this.database.exec("PRAGMA foreign_keys = ON");
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS events (
        sequence INTEGER PRIMARY KEY,
        tick INTEGER NOT NULL,
        type TEXT NOT NULL,
        actor_id TEXT,
        target_id TEXT,
        settlement_id TEXT,
        data_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS events_tick_index ON events(tick);
      CREATE INDEX IF NOT EXISTS events_type_index ON events(type);
      CREATE TABLE IF NOT EXISTS snapshots (
        sequence INTEGER PRIMARY KEY,
        tick INTEGER NOT NULL,
        state_json TEXT NOT NULL,
        state_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  hasWorld(): boolean {
    const row = this.database.prepare("SELECT COUNT(*) AS count FROM snapshots").get() as { count: number };
    return row.count > 0;
  }

  initialize(world: WorldState): void {
    if (this.hasWorld()) throw new Error("World store is already initialized");
    const insertSnapshot = this.database.prepare(
      "INSERT INTO snapshots(sequence, tick, state_json, state_hash) VALUES (?, ?, ?, ?)",
    );
    const insertMetadata = this.database.prepare(
      "INSERT INTO metadata(key, value) VALUES (?, ?)",
    );
    this.database.exec("BEGIN IMMEDIATE");
    try {
      insertSnapshot.run(0, world.tick, JSON.stringify(world), stateHash(world));
      insertMetadata.run("scenario", world.scenario);
      insertMetadata.run("seed", String(world.seed));
      insertMetadata.run("schema-version", String(world.version));
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  appendTick(events: SimEvent[], world: WorldState): void {
    if (events.length === 0) return;
    const insertEvent = this.database.prepare(`
      INSERT INTO events(sequence, tick, type, actor_id, target_id, settlement_id, data_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertSnapshot = this.database.prepare(`
      INSERT OR REPLACE INTO snapshots(sequence, tick, state_json, state_hash)
      VALUES (?, ?, ?, ?)
    `);
    const updateSchemaVersion = this.database.prepare(`
      INSERT INTO metadata(key, value) VALUES ('schema-version', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    const latestSnapshot = this.database
      .prepare("SELECT sequence FROM snapshots ORDER BY sequence DESC LIMIT 1")
      .get() as { sequence: number };
    const lastSequence = events.at(-1)!.sequence;
    const shouldSnapshot =
      world.tick % world.ticksPerDay === 0 || lastSequence - latestSnapshot.sequence >= 5_000;

    this.database.exec("BEGIN IMMEDIATE");
    try {
      for (const event of events) {
        insertEvent.run(
          event.sequence,
          event.tick,
          event.type,
          event.actorId ?? null,
          event.targetId ?? null,
          event.settlementId ?? null,
          JSON.stringify(event.data),
        );
      }
      updateSchemaVersion.run(String(world.version));
      if (shouldSnapshot) {
        insertSnapshot.run(lastSequence, world.tick, JSON.stringify(world), stateHash(world));
      }
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  recover(): RecoveryResult {
    const snapshot = this.database
      .prepare("SELECT sequence, state_json, state_hash FROM snapshots ORDER BY sequence DESC LIMIT 1")
      .get() as SnapshotRow | undefined;
    if (!snapshot) throw new Error("World store has no snapshot");

    const state = JSON.parse(snapshot.state_json) as WorldState;
    const storedVersion = (state as unknown as { version: number }).version;
    if (storedVersion !== 3 && storedVersion !== 4) {
      throw new Error(`World schema ${storedVersion} is incompatible with schema 4; start this milestone with --reset`);
    }
    const actualHash = stateHash(state);
    if (actualHash !== snapshot.state_hash) {
      throw new Error(`Snapshot hash mismatch at sequence ${snapshot.sequence}`);
    }
    normalizeWorldState(state);

    const rows = this.database
      .prepare("SELECT * FROM events WHERE sequence > ? ORDER BY sequence")
      .all(snapshot.sequence) as unknown as EventRow[];
    for (const row of rows) applyEvent(state, this.rowToEvent(row));

    return {
      state,
      snapshotSequence: snapshot.sequence,
      replayedEvents: rows.length,
    };
  }

  allEvents(): SimEvent[] {
    const rows = this.database
      .prepare("SELECT * FROM events ORDER BY sequence")
      .all() as unknown as EventRow[];
    return rows.map((row) => this.rowToEvent(row));
  }

  recentEvents(limit = 80): SimEvent[] {
    const safeLimit = Math.max(1, Math.min(5_000, Math.floor(limit)));
    const rows = this.database
      .prepare("SELECT * FROM events ORDER BY sequence DESC LIMIT ?")
      .all(safeLimit) as unknown as EventRow[];
    return rows.reverse().map((row) => this.rowToEvent(row));
  }

  snapshotCount(): number {
    const row = this.database.prepare("SELECT COUNT(*) AS count FROM snapshots").get() as { count: number };
    return row.count;
  }

  eventCount(): number {
    const row = this.database.prepare("SELECT COUNT(*) AS count FROM events").get() as { count: number };
    return row.count;
  }

  close(): void {
    this.database.close();
  }

  private rowToEvent(row: EventRow): SimEvent {
    return {
      sequence: row.sequence,
      tick: row.tick,
      type: row.type,
      actorId: row.actor_id ?? undefined,
      targetId: row.target_id ?? undefined,
      settlementId: row.settlement_id ?? undefined,
      data: JSON.parse(row.data_json) as Record<string, unknown>,
    };
  }
}
