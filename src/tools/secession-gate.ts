import type { SimEvent } from "../sim/types.ts";

/**
 * Secession-routes gate (docs/design/secession-routes.md §4 Gate, §5.5), per seed
 * against the single tax-route baseline (the pre-routes event log for the seed):
 *  - at least one non-tax secession on every seed;
 *  - secessions ≤ baseline + 1 on every seed.
 * The last-port exemption is checked on world state in tests/secession-routes.test.ts.
 */
export interface SecessionSeed {
  seed: number;
  secessions: number;
  baseline: number;
  byRoute: Record<string, number>;
  nonTax: number;
  declarations: Array<{ tick: number; port: string; from: string; routes: string[] }>;
}

export function secessionSeed(seed: number, run: readonly SimEvent[], baseline: readonly SimEvent[]): SecessionSeed {
  const byRoute: Record<string, number> = {};
  const declarations: SecessionSeed["declarations"] = [];
  let nonTax = 0;
  for (const e of run) {
    if (e.type === "secession-declared") {
      const routes = (e.data.routes as string[] | undefined) ?? [];
      const key = routes.length ? routes.join("+") : "command";
      byRoute[key] = (byRoute[key] ?? 0) + 1;
      const from = String(e.targetId ?? "");
      if (!routes.includes("tax") && routes.length) nonTax += 1;
      declarations.push({ tick: e.tick, port: e.settlementId ?? "", from, routes });
    }
  }
  return {
    seed, secessions: declarations.length, baseline: baseline.filter((e) => e.type === "secession-declared").length,
    byRoute, nonTax, declarations,
  };
}

export function secessionGate(seeds: SecessionSeed[]) {
  const checks = {
    nonTaxEverySeed: seeds.every((s) => s.nonTax >= 1),
    atMostBaselinePlusOne: seeds.every((s) => s.secessions <= s.baseline + 1),
  };
  return { seeds, checks, pass: Object.values(checks).every(Boolean) };
}
