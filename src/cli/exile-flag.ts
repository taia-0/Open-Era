/**
 * after-triage.md (b): EXILE_RECOVERY is on by default in every run CLI. `--no-exile-recovery`
 * (or EXILE_RECOVERY=0) opts out and reproduces the pre-default pins. `--exile-recovery` is still
 * accepted as a no-op for old command lines; it is deprecated.
 */
export const EXILE_FLAG_OPTIONS = {
  "exile-recovery": { type: "boolean", default: false },
  "no-exile-recovery": { type: "boolean", default: false },
  help: { type: "boolean", short: "h", default: false },
} as const;

export const EXILE_FLAG_HELP = [
  "  --no-exile-recovery   opt out of EXILE_RECOVERY (on by default); also EXILE_RECOVERY=0",
  "  --exile-recovery      deprecated no-op: EXILE_RECOVERY is on by default",
].join("\n");

export function resolveExileRecovery(values: { "no-exile-recovery"?: boolean }, env: NodeJS.ProcessEnv = process.env): boolean {
  return !(values["no-exile-recovery"] === true || env.EXILE_RECOVERY === "0");
}

/** Print `usage` plus the exile flags and exit when --help was given. */
export function maybeHelp(values: { help?: boolean }, usage: string, extraHelp: string[] = []): void {
  if (!values.help) return;
  console.log(`${usage}\n\nOptions:\n${[EXILE_FLAG_HELP, ...extraHelp].join("\n")}`);
  process.exit(0);
}
