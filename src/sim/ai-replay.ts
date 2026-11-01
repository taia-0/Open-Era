import type { ContextReader, ContextRecord } from "./ai-context.ts";
import { sha256, taxStepInputHash, type TaxStepAiRecord, type TaxStepProvider, type TaxStepTraceEntry } from "./ai-provider.ts";
import { canonicalJson } from "./state.ts";

/**
 * Offline replay of a recorded pilot run (`npm run ai-pilot -- --replay <dir>`).
 *
 * The brain and the reader answer from the run's `trace.json`, keyed by the
 * request hash, so nothing is sent. The brain's request carries the current
 * `promptVersion`, which a run recorded under an older prompt does not match.
 * The prompt text is never sent in a replay, so the brain request is matched
 * with the recorded `promptVersion` put back in its place. A mismatch is
 * counted and reported; it is not a failure. Any other request difference is.
 */
export interface ReplayReport {
  promptVersionMismatches: number;
  recordedPromptVersions: string[];
  missingBrain: number;
  missingContext: number;
  traceMatches: boolean;
  firstTraceDifference: number | null;
}

export interface Replay {
  brain: TaxStepProvider;
  context: ContextReader;
  report(trace: TaxStepTraceEntry[]): ReplayReport;
}

const BRAIN_ERRORS = new Set(["timeout", "error"]);
const CONTEXT_ERRORS = new Set(["timeout", "error", "cap"]);

export function replayFromTrace(recorded: TaxStepTraceEntry[]): Replay {
  const brainAnswers = new Map<string, TaxStepAiRecord>();
  const contextAnswers = new Map<string, ContextRecord>();
  const versions = new Set<string>();
  for (const entry of recorded) {
    const ai = entry.ai;
    versions.add(ai.promptVersion);
    if (ai.fallbackReason !== "cap") brainAnswers.set(ai.inputHash, ai);
    if (ai.context && ai.context.fallbackReason !== "cap") contextAnswers.set(ai.context.inputHash, ai.context);
  }
  let mismatches = 0;
  let missingBrain = 0;
  let missingContext = 0;
  const matchedHashes: string[] = [];
  const brain: TaxStepProvider = {
    name: "replay", model: "replay",
    decide: (request) => {
      let found: TaxStepAiRecord | undefined;
      for (const version of [request.promptVersion, ...versions]) {
        found = brainAnswers.get(taxStepInputHash({ ...request, promptVersion: version }));
        if (found) break;
      }
      if (!found) { missingBrain += 1; matchedHashes.push(""); return { raw: null, latencyMs: 0, error: "error" }; }
      if (found.promptVersion !== request.promptVersion) mismatches += 1;
      matchedHashes.push(found.inputHash);
      if (found.fallbackReason && BRAIN_ERRORS.has(found.fallbackReason)) {
        return { raw: null, latencyMs: 0, error: found.fallbackReason as "timeout" | "error" };
      }
      return { raw: found.rawAnswer, latencyMs: 0 };
    },
  };
  const context: ContextReader = {
    name: "replay", model: "replay",
    read: (request) => {
      const found = contextAnswers.get(sha256(canonicalJson(request)));
      if (!found) { missingContext += 1; return { raw: null, latencyMs: 0, error: "error" }; }
      if (found.fallbackReason && CONTEXT_ERRORS.has(found.fallbackReason)) {
        return { raw: null, latencyMs: 0, error: found.fallbackReason as "timeout" | "error" | "cap" };
      }
      if (found.fallbackReason === "illegal") return { raw: JSON.stringify("replay-illegal"), latencyMs: 0 };
      return { raw: JSON.stringify(found.briefing), latencyMs: 0, ...(found.answers ? { answers: found.answers } : {}) };
    },
  };
  return {
    brain, context,
    report: (trace) => {
      // Called brain entries are compared by the recorded hash they matched; capped ones by tick and outcome.
      let called = 0;
      let firstTraceDifference: number | null = trace.length === recorded.length ? null : Math.min(trace.length, recorded.length);
      for (let index = 0; index < Math.min(trace.length, recorded.length) && firstTraceDifference === null; index += 1) {
        const now = trace[index].ai;
        const was = recorded[index].ai;
        const hashSame = now.fallbackReason === "cap" ? was.fallbackReason === "cap" : matchedHashes[called++] === was.inputHash;
        const same = hashSame && trace[index].tick === recorded[index].tick && now.finalChoice === was.finalChoice
          && now.outcome === was.outcome && (now.context?.inputHash ?? null) === (was.context?.inputHash ?? null);
        if (!same) firstTraceDifference = index;
      }
      return {
        promptVersionMismatches: mismatches, recordedPromptVersions: [...versions].sort(),
        missingBrain, missingContext, traceMatches: firstTraceDifference === null, firstTraceDifference,
      };
    },
  };
}
