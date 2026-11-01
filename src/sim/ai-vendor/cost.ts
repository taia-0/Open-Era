/**
 * A5 cost log and spend cap (docs/design/ai-providers.md sections 5 and 6).
 * Run memory only: never on the world, never in a hash, never a key.
 */

/** DeepSeek prices, USD per token. A price change is a code change. */
export const DEEPSEEK_PRICES = {
  source: "https://api-docs.deepseek.com/quick_start/pricing",
  checkedOn: "2026-10-31",
  peak: { miss: 1.32 / 1e6, hit: 0.044 / 1e6, out: 3.96 / 1e6 },
  offPeak: { miss: 0.66 / 1e6, hit: 0.022 / 1e6, out: 1.98 / 1e6 },
} as const;

/** Jev (TypeSafe) prices, USD per token. Input only; output is free. */
export const JEV_PRICES = {
  source: "https://docs.typesafe.ai/models",
  checkedOn: "2026-10-31",
  input: 0.042 / 1e6,
} as const;

/** Hard per-run spend cap (section 6, default). */
export const DEFAULT_SPEND_CAP_USD = 0.25;

/**
 * DeepSeek peak: 01:00-04:00 and 06:00-10:00 UTC, Monday to Friday.
 * Chinese public holidays are not modelled, so a holiday is priced as peak
 * (the higher figure; conservative for the cap).
 */
export function deepSeekPricePeriod(at: Date): "peak" | "off-peak" {
  const day = at.getUTCDay();
  if (day === 0 || day === 6) return "off-peak";
  const hour = at.getUTCHours();
  return (hour >= 1 && hour < 4) || (hour >= 6 && hour < 10) ? "peak" : "off-peak";
}

export function deepSeekCostUsd(period: "peak" | "off-peak", miss: number, hit: number, out: number): number {
  const price = period === "peak" ? DEEPSEEK_PRICES.peak : DEEPSEEK_PRICES.offPeak;
  return miss * price.miss + hit * price.hit + out * price.out;
}

export function jevCostUsd(tokensIn: number): number {
  return tokensIn * JEV_PRICES.input;
}

export interface CostLine {
  tick: number;
  role: "brain.taxStep" | "context.taxStep" | "picker.action" | "picker.social" | "brain.escalation";
  /** Slice 5: Noul questions riding on a `picker.action` call (jev-triage.md §4.6). */
  triageQuestions?: number;
  provider: "deepseek" | "jev";
  model: string;
  responseModel: string | null;
  /** DeepSeek only, from the response; null otherwise. */
  systemFingerprint?: string | null;
  /** DeepSeek only: `choices[0].finish_reason` from the response (ai-brain-hold-bias.md item 8); null when none came back. */
  finishReason?: string | null;
  tokensIn: number;
  tokensInCacheHit: number;
  tokensOut: number;
  pricePeriod: "peak" | "off-peak" | "flat";
  estimatedCostUsd: number;
  runSpendUsd: number;
  outcome: "model" | "fallback";
  /** Why the call fell back: cap, timeout, error, illegal; null on model. Never a header or key. */
  fallbackReason: "cap" | "timeout" | "error" | "illegal" | null;
  /** HTTP status, or null when the vendor was never reached. */
  status: number | null;
  priceSource: string;
  priceCheckedOn: string;
}

/**
 * The run's spend and its lines. One ledger per run, shared by both roles,
 * passed in by the runner. `sink` may append each line to a file.
 */
export class CostLedger {
  readonly capUsd: number;
  spendUsd = 0;
  readonly lines: CostLine[] = [];
  private readonly sink?: (line: CostLine) => void;

  constructor(capUsd = DEFAULT_SPEND_CAP_USD, sink?: (line: CostLine) => void) {
    this.capUsd = capUsd;
    this.sink = sink;
  }

  /** True when a call costing `worstCaseUsd` at most would pass the cap. */
  wouldExceed(worstCaseUsd: number): boolean {
    return this.spendUsd + worstCaseUsd > this.capUsd;
  }

  record(line: Omit<CostLine, "runSpendUsd">): CostLine {
    this.spendUsd += line.estimatedCostUsd;
    const full = { ...line, runSpendUsd: this.spendUsd } as CostLine;
    this.lines.push(full);
    this.sink?.(full);
    return full;
  }
}
