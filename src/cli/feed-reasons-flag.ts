import { FEED_REASONS_DEFAULT } from "../sim/feed-reasons.ts";

/**
 * Micah's go-ahead (2026-11-06): feedReasons is on by default. `--no-feed-reasons`
 * (or FEED_REASONS=0) opts out and reproduces the pre-default event bytes (hash-neutral
 * either way). Pass `feedReasons: false` on TickAiOptions for the same opt-out in code.
 */
export const FEED_REASONS_FLAG_OPTIONS = {
  "no-feed-reasons": { type: "boolean", default: false },
} as const;

export const FEED_REASONS_FLAG_HELP =
  "  --no-feed-reasons     opt out of feedReasons (on by default); also FEED_REASONS=0";

/** True unless the run opts out. Honours FEED_REASONS_DEFAULT. */
export function resolveFeedReasons(values: { "no-feed-reasons"?: boolean }, env: NodeJS.ProcessEnv = process.env): boolean {
  if (values["no-feed-reasons"] === true || env.FEED_REASONS === "0") return false;
  return FEED_REASONS_DEFAULT;
}
