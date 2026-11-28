import { readFileSync } from "node:fs";
for (const l of ["ATLS-NT", "ATLS-NT-exile-off"]) {
  const rs = readFileSync(`docs/design/negotiated-transfer/raw/${l}.jsonl`, "utf8").trim().split("\n").map((x) => JSON.parse(x));
  const t = rs.flatMap((r) => r.transfers);
  const k = (f: (x: any) => string) => t.reduce((a: any, x: any) => { a[f(x)] = (a[f(x)] ?? 0) + 1; return a; }, {});
  const cls = (f: string) => f.startsWith("secession-") ? "breakaway" : f;
  const prices = t.filter((x: any) => x.kind === "sale").map((x: any) => x.price).sort((a: number, b: number) => a - b);
  console.log(l, JSON.stringify({ byDirection: k((x) => `${cls(x.from)}→${cls(x.to)}`), byTriggerKind: k((x) => `${x.trigger}/${x.kind}`), byStanding: k((x) => x.standing), salePriceMin: prices[0], salePriceMedian: prices[Math.ceil(prices.length / 2) - 1], salePriceMax: prices.at(-1), seedsWithTransfer: rs.filter((r) => r.accepts > 0).length }));
}
