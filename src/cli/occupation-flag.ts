import { OCCUPATION_DEFAULT } from "../sim/occupation.ts";

/** occupation.md: OCCUPATION is off by default. `--occupation` (or OCCUPATION=1) turns it on for the run. */
export const OCCUPATION_FLAG_OPTIONS = { occupation: { type: "boolean", default: false } } as const;
export const OCCUPATION_FLAG_HELP = "  --occupation          turn on OCCUPATION (off by default); also OCCUPATION=1";
export function resolveOccupation(values: { occupation?: boolean }, env: NodeJS.ProcessEnv = process.env): boolean {
  return values.occupation === true || env.OCCUPATION === "1" || OCCUPATION_DEFAULT;
}
