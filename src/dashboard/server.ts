import { existsSync, readFileSync, rmSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { submitCommand, type CommandRequest } from "../sim/commands.ts";
import {
  acknowledgeBriefingItem,
  assignReportingOfficer,
  type BriefingAcknowledgementRequest,
  type ReportingOfficerRequest,
} from "../sim/briefing.ts";
import {
  createConversationThread,
  DeterministicDialogueProvider,
  resolveDueReplies,
  sendConversationMessage,
  type CreateThreadRequest,
  type DialogueProvider,
  type SendMessageRequest,
} from "../sim/conversations.ts";
import { runTick } from "../sim/engine.ts";
import { WorldStore } from "../sim/persistence.ts";
import { createPrototypeWorld } from "../sim/scenario.ts";
import type { WorldState } from "../sim/types.ts";
import { dashboardState } from "./view-model.ts";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const page = readFileSync(resolve(moduleDirectory, "index.html"), "utf8");

export interface DashboardOptions {
  databasePath: string;
  reset?: boolean;
  seed?: number;
  playerCharacterId?: string;
  dialogueProvider?: DialogueProvider;
}

export interface DashboardApp {
  server: Server;
  getWorld: () => WorldState;
  close: () => Promise<void>;
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

async function requestBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 64 * 1024) throw new Error("Request body exceeds 64 KiB");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function removeDatabase(path: string): void {
  for (const candidate of [path, `${path}-shm`, `${path}-wal`]) {
    if (existsSync(candidate)) rmSync(candidate);
  }
}

export function createDashboardApp(options: DashboardOptions): DashboardApp {
  const databasePath = resolve(options.databasePath);
  if (options.reset) removeDatabase(databasePath);
  const store = new WorldStore(databasePath);
  const dialogueProvider = options.dialogueProvider ?? new DeterministicDialogueProvider();
  let world: WorldState;
  if (store.hasWorld()) world = store.recover().state;
  else {
    world = createPrototypeWorld(options.seed ?? 1847, { playerCharacterId: options.playerCharacterId });
    store.initialize(world);
  }

  let mutation = Promise.resolve();
  const server = createServer((request, response) => {
    mutation = mutation.then(async () => {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (request.method === "GET" && url.pathname === "/") {
        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
          "content-security-policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:",
        });
        response.end(page);
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/state") {
        // Roughly one busy in-world week is scanned for exceptional events;
        // the view model still returns only a compact recent-event feed.
        json(response, 200, dashboardState(world, store.recentEvents(5_000)));
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/health") {
        json(response, 200, { ok: true, tick: world.tick, events: store.eventCount() });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/advance") {
        const body = await requestBody(request) as { ticks?: number };
        const ticks = body.ticks ?? 1;
        if (!Number.isInteger(ticks) || ticks < 1 || ticks > 144) {
          json(response, 400, { ok: false, error: "ticks must be an integer between 1 and 144" });
          return;
        }
        let ticksAdvanced = 0;
        let combatUpdated = false;
        const playerCharacterId = Object.values(world.players)[0]?.characterId;
        for (let index = 0; index < ticks; index += 1) {
          const result = runTick(world);
          const conversationEvents = await resolveDueReplies(world, dialogueProvider);
          store.appendTick([...result.events, ...conversationEvents], world);
          ticksAdvanced += 1;
          combatUpdated = result.events.some((event) =>
            event.actorId === playerCharacterId &&
            (event.type === "battle-phase-resolved" || event.type === "battle-retreated" || event.type === "battle-resolved")
          );
          if (combatUpdated) break;
        }
        const activeBattle = Object.values(world.activeBattles).find((battle) => battle.attackerId === playerCharacterId);
        json(response, 200, {
          ok: true,
          tick: world.tick,
          day: world.tick / world.ticksPerDay,
          ticksAdvanced,
          combatUpdated,
          pausedForBattle: Boolean(activeBattle),
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/commands") {
        const body = await requestBody(request) as CommandRequest;
        const result = submitCommand(world, body);
        if (!result.ok) {
          json(response, 400, result);
          return;
        }
        store.appendTick([result.event], world);
        json(response, 202, { ok: true, command: result.command });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/briefing/acknowledge") {
        const body = await requestBody(request) as BriefingAcknowledgementRequest;
        const result = acknowledgeBriefingItem(world, body);
        if (!result.ok) {
          json(response, 400, result);
          return;
        }
        store.appendTick([result.event], world);
        json(response, 200, { ok: true, itemId: body.itemId });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/briefing/officer") {
        const body = await requestBody(request) as ReportingOfficerRequest;
        const result = assignReportingOfficer(world, body);
        if (!result.ok) {
          json(response, 400, result);
          return;
        }
        store.appendTick([result.event], world);
        json(response, 200, { ok: true, characterId: body.characterId });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/threads") {
        const body = await requestBody(request) as CreateThreadRequest;
        const result = createConversationThread(world, body);
        if (!result.ok) {
          json(response, 400, result);
          return;
        }
        store.appendTick(result.events, world);
        json(response, 201, { ok: true, thread: result.value });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/messages") {
        const body = await requestBody(request) as SendMessageRequest;
        const result = sendConversationMessage(world, body);
        if (!result.ok) {
          json(response, result.code === "rate-limited" ? 429 : 400, result);
          return;
        }
        store.appendTick(result.events, world);
        json(response, 202, { ok: true, message: result.value.message, replies: result.value.replies });
        return;
      }
      json(response, 404, { ok: false, error: "Not found" });
    }).catch((error: unknown) => {
      if (!response.headersSent) json(response, 500, { ok: false, error: error instanceof Error ? error.message : "Unknown error" });
      else response.end();
    });
  });

  return {
    server,
    getWorld: () => world,
    close: async () => {
      if (server.listening) await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
      store.close();
    },
  };
}
