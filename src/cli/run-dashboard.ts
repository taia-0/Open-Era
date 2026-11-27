import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { createDashboardApp } from "../dashboard/server.ts";
import { ALLIANCES_FLAG_HELP, ALLIANCES_FLAG_OPTIONS } from "./alliances-flag.ts";
import { EXILE_FLAG_OPTIONS, maybeHelp } from "./exile-flag.ts";
import { FEED_REASONS_FLAG_HELP, FEED_REASONS_FLAG_OPTIONS } from "./feed-reasons-flag.ts";
import { LIFECYCLE_FLAG_HELP, LIFECYCLE_FLAG_OPTIONS } from "./lifecycle-flag.ts";
import { OCCUPATION_FLAG_HELP, OCCUPATION_FLAG_OPTIONS } from "./occupation-flag.ts";
import { PORT_TRANSFER_FLAG_HELP, PORT_TRANSFER_FLAG_OPTIONS } from "./port-transfer-flag.ts";
import { SECESSION_AFTERMATH_FLAG_HELP, SECESSION_AFTERMATH_FLAG_OPTIONS } from "./secession-aftermath-flag.ts";

const { values } = parseArgs({
  options: {
    host: { type: "string", default: "127.0.0.1" },
    port: { type: "string", short: "p", default: "4317" },
    database: { type: "string", short: "d", default: ".open-era/dashboard.sqlite" },
    seed: { type: "string", short: "s", default: "1847" },
    "player-character": { type: "string" },
    reset: { type: "boolean", default: false },
    ...EXILE_FLAG_OPTIONS,
    ...ALLIANCES_FLAG_OPTIONS,
    ...PORT_TRANSFER_FLAG_OPTIONS,
    ...LIFECYCLE_FLAG_OPTIONS,
    ...SECESSION_AFTERMATH_FLAG_OPTIONS,
    ...OCCUPATION_FLAG_OPTIONS,
    ...FEED_REASONS_FLAG_OPTIONS,
  },
});
maybeHelp(
  values,
  "npm run dashboard -- [--port N] [--seed N] [--reset] [--occupation] [--alliances] [--port-transfer] [--lifecycle] [--secession-aftermath]",
  [OCCUPATION_FLAG_HELP, ALLIANCES_FLAG_HELP, PORT_TRANSFER_FLAG_HELP, LIFECYCLE_FLAG_HELP, SECESSION_AFTERMATH_FLAG_HELP, FEED_REASONS_FLAG_HELP],
);

const port = Number.parseInt(values.port!, 10);
const seed = Number.parseInt(values.seed!, 10);
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("--port must be between 1 and 65535");
if (!Number.isSafeInteger(seed)) throw new Error("--seed must be an integer");

const app = createDashboardApp({
  databasePath: resolve(values.database!),
  reset: values.reset,
  seed,
  playerCharacterId: values["player-character"],
  flagValues: values,
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
