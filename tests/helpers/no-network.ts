/**
 * A5 guard (ai-providers.md section 7): any import of this module replaces
 * `globalThis.fetch` with one that throws, so a test that reaches the network
 * fails loudly. `fetchAttempts()` reports how often it was tried.
 */
let attempts = 0;
globalThis.fetch = (() => {
  attempts += 1;
  throw new Error("network is disabled in tests");
}) as typeof fetch;

export function fetchAttempts(): number {
  return attempts;
}
