// Diagnosis only: claims, battles and secessions with OCCUPATION on for one patched src copy, 13 seeds.
//   node --experimental-strip-types scripts/diag/occupation-claims-sweep.ts <variantRoot> [occupation=1]
const [root, occArg] = process.argv.slice(2);
const occupation = occArg !== "0";
const { runTick } = await import(`${root}/src/sim/engine.ts`);
const { createPrototypeWorld } = await import(`${root}/src/sim/scenario.ts`);
const seeds = [1847, 2718, 4096, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000];
const rows = seeds.map((seed) => { const w = createPrototypeWorld(seed); let claims = 0, battles = 0, secessions = 0;
  for (let i = 0; i < 1200; i++) for (const e of runTick(w, { exileRecovery: true, occupation }).events) { if (e.type === "settlement-claimed") claims++; else if (e.type === "battle-started") battles++; else if (e.type === "secession-declared") secessions++; }
  return { seed, claims, battles, secessions }; });
const sum = (k: "claims" | "battles" | "secessions") => rows.reduce((a, r) => a + r[k], 0);
const med = (k: "claims" | "battles" | "secessions") => { const s = rows.map((r) => r[k]).sort((a, b) => a - b); return s[6]; };
console.log(JSON.stringify({ variant: root.split("/").pop(), occupation, claims: sum("claims"), battles: sum("battles"), secessions: sum("secessions"), claimsMedian: med("claims"), perSeedClaims: rows.map((r) => r.claims) }));
