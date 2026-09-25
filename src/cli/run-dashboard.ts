import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { createDashboardApp } from "../dashboard/server.ts";

const { values } = parseArgs({
  options: {
    host: { type: "string", default: "127.0.0.1" },
    port: { type: "string", short: "p", default: "4317" },
    database: { type: "string", short: "d", default: ".open-era/dashboard.sqlite" },
    seed: { type: "string", short: "s", default: "1847" },
    "player-character": { type: "string" },
    reset: { type: "boolean", default: false },
  },
});

const port = Number.parseInt(values.port!, 10);
const seed = Number.parseInt(values.seed!, 10);
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("--port must be between 1 and 65535");
if (!Number.isSafeInteger(seed)) throw new Error("--seed must be an integer");

const app = createDashboardApp({
  databasePath: resolve(values.database!),
  reset: values.reset,
  seed,
  playerCharacterId: values["player-character"],
});

app.server.listen(port, values.host!, () => {
  console.log(`Open Era dashboard: http://${values.host}:${port}`);
  console.log("Local prototype only; no production authentication is enabled.");
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await app.close();
    process.exit(0);
  });
}
