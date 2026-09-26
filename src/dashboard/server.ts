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
import { WorldStore, EVENT_FEED_PAGE_DEFAULT, EVENT_FEED_PAGE_LIMIT } from "../sim/persistence.ts";
import { createPrototypeWorld } from "../sim/scenario.ts";
import type { SimEvent, WorldState } from "../sim/types.ts";
import { dashboardState, projectEventFeed } from "./view-model.ts";

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

/** Reads the event-feed cursor from a request. Returns "invalid" when unusable. */
function parseEventCursor(url: URL): number | null | "invalid" {
  const raw = url.searchParams.get("beforeSequence");
  if (raw === null) return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) return "invalid";
  return parsed;
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
        const beforeSequence = parseEventCursor(url);
        if (beforeSequence === "invalid") {
          json(response, 400, { ok: false, code: "invalid-cursor", error: "beforeSequence must be a non-negative integer" });
          return;
        }
        const limitParam = url.searchParams.get("limit");
        const limit = limitParam === null ? EVENT_FEED_PAGE_DEFAULT : Number(limitParam);
        if (!Number.isInteger(limit) || limit < 1 || limit > EVENT_FEED_PAGE_LIMIT) {
          json(response, 400, { ok: false, code: "invalid-limit", error: `limit must be an integer between 1 and ${EVENT_FEED_PAGE_LIMIT}` });
          return;
        }
        // Roughly one busy in-world week is scanned for exceptional events, while
        // the feed itself is returned one explicit page at a time.
        const feedEvents = store.eventsPage(beforeSequence, limit);
        json(response, 200, dashboardState(world, store.recentEvents(5_000), {
          events: feedEvents,
          hasMore: feedEvents.length > 0 && store.countEventsBefore(feedEvents[0].sequence) > 0,
          limit,
          total: store.eventCount(),
          limitMax: EVENT_FEED_PAGE_LIMIT,
          limitDefault: EVENT_FEED_PAGE_DEFAULT,
        }));
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
          json(response, 400, { ok: false, code: "invalid-ticks", error: "ticks must be an integer between 1 and 144" });
          return;
        }
        const playerCharacterId = Object.values(world.players)[0]?.characterId;
        if (!playerCharacterId) {
          json(response, 400, { ok: false, code: "unknown-player", error: "The world has no player session" });
          return;
        }
        let ticksAdvanced = 0;
        let combatUpdated = false;
        let attentionUpdated = false;
        const produced: SimEvent[] = [];
        for (let index = 0; index < ticks; index += 1) {
          const result = runTick(world);
          const conversationEvents = await resolveDueReplies(world, dialogueProvider);
          const tickEvents = [...result.events, ...conversationEvents];
          store.appendTick(tickEvents, world);
          produced.push(...tickEvents);
          ticksAdvanced += 1;
          combatUpdated = result.events.some((event) =>
            event.actorId === playerCharacterId &&
            (event.type === "battle-phase-resolved" || event.type === "battle-retreated" || event.type === "battle-resolved")
          );
          attentionUpdated = tickEvents.some((event) =>
            (event.actorId === playerCharacterId || event.targetId === playerCharacterId) &&
            (
              event.type === "character-captured" ||
              event.type === "captivity-escaped" ||
              event.type === "captivity-released" ||
              event.type === "captivity-negotiations-opened"
            )
          );
          if (combatUpdated || attentionUpdated) break;
        }
        const commandedBattle = Object.values(world.activeBattles).find((battle) => battle.attackerId === playerCharacterId);
        json(response, 200, {
          ok: true,
          tick: world.tick,
          day: world.tick / world.ticksPerDay,
          ticksAdvanced,
          combatUpdated,
          attentionUpdated,
          pausedForBattle: Boolean(commandedBattle),
          // The events this request produced, projected through the same
          // visibility path as the feed, so a step needs no follow-up read.
          eventSequence: world.nextEventSequence - 1,
          events: projectEventFeed(world, playerCharacterId, produced).reverse(),
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
      json(response, 404, { ok: false, code: "not-found", error: "Not found" });
    }).catch((error: unknown) => {
      if (!response.headersSent) json(response, 500, { ok: false, code: "internal-error", error: error instanceof Error ? error.message : "Unknown error" });
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
