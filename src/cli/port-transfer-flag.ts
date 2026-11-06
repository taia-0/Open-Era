import { PORT_TRANSFER_DEFAULT } from "../sim/port-transfer.ts";

/** port-transfer.md: PORT_TRANSFER is off by default. `--port-transfer` (or PORT_TRANSFER=1) turns it on for the run. */
export const PORT_TRANSFER_FLAG_OPTIONS = { "port-transfer": { type: "boolean", default: false } } as const;
export const PORT_TRANSFER_FLAG_HELP = "  --port-transfer       turn on PORT_TRANSFER, neutral-port purchase (off by default); also PORT_TRANSFER=1";
export function resolvePortTransfer(values: { "port-transfer"?: boolean }, env: NodeJS.ProcessEnv = process.env): boolean {
  return values["port-transfer"] === true || env.PORT_TRANSFER === "1" || PORT_TRANSFER_DEFAULT;
}
