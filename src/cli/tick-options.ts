import type { TickOptions } from "../sim/engine.ts";
import { feedReasonCallCap, stubFeedReasonWriter, type FeedReasonOptions } from "../sim/feed-reasons.ts";
import { resolveAlliances } from "./alliances-flag.ts";
import { resolveExileRecovery } from "./exile-flag.ts";
import { resolveFeedReasons } from "./feed-reasons-flag.ts";
import { resolveLifecycle } from "./lifecycle-flag.ts";
import { resolveOccupation } from "./occupation-flag.ts";
import { resolvePortTransfer } from "./port-transfer-flag.ts";
import { resolveSecessionAftermath } from "./secession-aftermath-flag.ts";

/**
 * The flag bag `run-simulation` and the dashboard both parse.
 * Absent booleans stay off. Defaults are the module constants; this file does not change them.
 */
export interface SimFlagValues {
  alliances?: boolean;
  occupation?: boolean;
  "port-transfer"?: boolean;
  lifecycle?: boolean;
  "secession-aftermath"?: boolean;
  "no-exile-recovery"?: boolean;
  "no-feed-reasons"?: boolean;
}

/**
 * Flag parsing shared by the dashboard and `run-simulation`.
 *
 * No writer and no `liveSession`. Two calls with the same values and env return
 * the same options. A false flag is omitted, which is the same tick as leaving
 * it to the module default. `exileRecovery` is always set, so a headless default
 * and an explicit `true` stay the same path.
 */
export function tickOptionsFromFlags(values: SimFlagValues, env: NodeJS.ProcessEnv = process.env): TickOptions {
  const exileRecovery = resolveExileRecovery(values, env);
  const occupation = resolveOccupation(values, env);
  const alliances = resolveAlliances(values, env);
  const portTransfer = resolvePortTransfer(values, env);
  const lifecycle = resolveLifecycle(values, env);
  const secessionAftermath = resolveSecessionAftermath(values, env);
  const feedReasonsOn = resolveFeedReasons(values, env);
  return {
    exileRecovery,
    ...(occupation ? { occupation } : {}),
    ...(alliances ? { alliances } : {}),
    ...(portTransfer ? { portTransfer } : {}),
    ...(lifecycle ? { lifecycle } : {}),
    ...(secessionAftermath ? { secessionAftermath } : {}),
    ai: {
      feedReasons: feedReasonsOn
        ? ({ callCap: feedReasonCallCap(exileRecovery), exileRecovery } as FeedReasonOptions)
        : false,
    },
  };
}

/**
 * `run-simulation` passes the feed-reason object it already built (writer, cap, call count).
 * The flag booleans still come from `tickOptionsFromFlags`.
 */
export function simulationTickOptions(
  values: SimFlagValues,
  env: NodeJS.ProcessEnv,
  feedReasons: FeedReasonOptions | false,
): TickOptions {
  const options = tickOptionsFromFlags(values, env);
  if (options.ai) options.ai.feedReasons = feedReasons;
  return options;
}

/**
 * The dashboard advance. Same flags as `run-simulation`. Feed reasons, when on,
 * use the offline stub writer so a session does not call a vendor.
 */
export function dashboardTickOptions(values: SimFlagValues = {}, env: NodeJS.ProcessEnv = process.env): TickOptions {
  const options = tickOptionsFromFlags(values, env);
  options.liveSession = true;
  const feed = options.ai?.feedReasons;
  if (feed && typeof feed === "object") feed.writer = stubFeedReasonWriter();
  return options;
}
