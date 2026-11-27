import { SECESSION_AFTERMATH_DEFAULT } from "../sim/secession-aftermath.ts";

/** secession-aftermath.md: SECESSION_AFTERMATH is off by default. `--secession-aftermath` (or SECESSION_AFTERMATH=1) turns it on for the run. */
export const SECESSION_AFTERMATH_FLAG_OPTIONS = { "secession-aftermath": { type: "boolean", default: false } } as const;
export const SECESSION_AFTERMATH_FLAG_HELP = "  --secession-aftermath turn on SECESSION_AFTERMATH, peace / protection / membership (off by default); also SECESSION_AFTERMATH=1";
export function resolveSecessionAftermath(values: { "secession-aftermath"?: boolean }, env: NodeJS.ProcessEnv = process.env): boolean {
  return values["secession-aftermath"] === true || env.SECESSION_AFTERMATH === "1" || SECESSION_AFTERMATH_DEFAULT;
}
