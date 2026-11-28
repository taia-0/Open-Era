// Prints the pins table (hook off vs hook on) from results/*.jsonl.
import { readFileSync } from "node:fs";
const dir = new URL("./results/", import.meta.url);
const load = (n: string): any[] => readFileSync(new URL(n, dir), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const a = load(process.argv[2] ?? "rec-idle-default.jsonl");
console.log("| seed | flag-off h72/h1200 | flag-on h72/h1200 |\n|---|---|---|");
for (const r of a) console.log(`| ${r.seed} | ${r.pins.hookOff.h72}/${r.pins.hookOff.h1200} | ${r.pins.hookOn.h72}/${r.pins.hookOn.h1200} |`);
