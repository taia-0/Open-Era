import { ALLIANCES_DEFAULT } from "../sim/alliances.ts";

/** alliances.md: ALLIANCES is off by default. `--alliances` (or ALLIANCES=1) turns it on for the run. */
export const ALLIANCES_FLAG_OPTIONS = { alliances: { type: "boolean", default: false } } as const;
export const ALLIANCES_FLAG_HELP = "  --alliances           turn on ALLIANCES (off by default); also ALLIANCES=1";
export function resolveAlliances(values: { alliances?: boolean }, env: NodeJS.ProcessEnv = process.env): boolean {
  return values.alliances === true || env.ALLIANCES === "1" || ALLIANCES_DEFAULT;
}
