import { LIFECYCLE_DEFAULT } from "../sim/lifecycle.ts";

/** lifecycle.md: LIFECYCLE is off by default. `--lifecycle` (or LIFECYCLE=1) turns it on for the run. */
export const LIFECYCLE_FLAG_OPTIONS = { lifecycle: { type: "boolean", default: false } } as const;
export const LIFECYCLE_FLAG_HELP = "  --lifecycle           turn on LIFECYCLE, promotion / retirement / return (off by default); also LIFECYCLE=1";
export function resolveLifecycle(values: { lifecycle?: boolean }, env: NodeJS.ProcessEnv = process.env): boolean {
  return values.lifecycle === true || env.LIFECYCLE === "1" || LIFECYCLE_DEFAULT;
}
