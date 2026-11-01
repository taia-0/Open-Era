// ALLIANCES acceptance (docs/design/alliances.md §7 + the Lead's joiner-loss ruling), offline, no AI.
// 13 seeds × 1,200 ticks, defaults (EXILE_RECOVERY on), alliances off vs on. Exits 1 when a gated item fails.
// Gated: flag-off pins; property violations = 0 (cause per side, one pact per faction, cooldown, no raid or claim
// between allies, joiners allied/eligible and losses in range, breaks follow their condition, none alive past it);
// liveness (forms ≥ 7/13, breaks ≥ 5/13, claims and port changes > 0 on every seed, no new wipeouts, secessions ≥ 6/13).
// Report-only: forms, breaks, cause mix, port-holder share, joined battles and rounds, flipped rounds, joiner losses,
// claims and port changes vs off.
//   node --experimental-strip-types scripts/alliances-sweep.ts [--seeds ...] [--ticks 1200] [--json out.json]
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { ALLIANCE_COOLDOWN, ALLIANCE_NEAR, ALLIANCE_RAID_WINDOW, alliancesOf, type Alliance, type AllyJoiner } from "../src/sim/alliances.ts";
import { runTick } from "../src/sim/engine.ts";
import { createPrototypeWorld } from "../src/sim/scenario.ts";
import { stateHash } from "../src/sim/state.ts";
import { dynamismReadout } from "../src/tools/dynamism.ts";
import type { SimEvent, WorldState } from "../src/sim/types.ts";

const { values } = parseArgs({ options: { seeds: { type: "string", default: "1847,2718,4096,1000,2000,3000,4000,5000,6000,7000,8000,9000,10000" }, ticks: { type: "string", default: "1200" }, json: { type: "string" } } });
const seeds = values.seeds!.split(",").map(Number);
const ticks = Number(values.ticks);
export const DEFAULT_PINS: Record<number, [string, string]> = { 1847: ["7f76e474", "94de9c02"], 2718: ["976c40bd", "7a3741c9"], 4096: ["08943ea5", "af6eeaea"] };

const portsOf = (w: WorldState, f: string) => Object.values(w.settlements).filter((s) => s.factionId === f).length;
const aliveF = (w: WorldState, f: string) => Object.values(w.characters).some((c) => !c.dead && c.factionId === f);
const dist = (w: WorldState, a: string, b: string) => { const p = w.settlements[a].position, q = w.settlements[b].position; return Math.hypot(p.x - q.x, p.y - q.y); };
const wipeouts = (w: WorldState) => ["world-government", "free-tide"].filter((f) => portsOf(w, f) === 0 && !aliveF(w, f));

function run(seed: number, on: boolean) {
  const w = createPrototypeWorld(seed);
  const events: SimEvent[] = []; const viol: string[] = [];
  const v = (s: string) => { if (viol.length < 50) viol.push(s); else viol.length++; };
  // Pacts in force, tracked through the tape in event order (so a pact formed earlier in the same tick counts).
  const live = new Map<string, Alliance>(); const lastBreak = new Map<string, number>();
  const raidTape = new Set<string>();
  const pairKey = (a: string, b: string) => [a, b].sort().join("+");
  const alliedNow = (a?: string | null, b?: string | null) => !!a && !!b && a !== b && [...live.values()].some((x) => x.factionIds.includes(a) && x.factionIds.includes(b));
  for (let i = 0; i < ticks; i++) {
    const evs = runTick(w, on ? { alliances: true } : {}).events;
    for (const e of evs) {
      events.push(e);
      const atk = e.actorId ? w.characters[e.actorId]?.factionId : null;
      if (e.type === "battle-started" || (e.type === "battle-resolved" && !e.data.battleId)) {
        if (alliedNow(atk, e.targetId)) v(`raid between allies ${atk}>${e.targetId} t${e.tick}`);
        if (atk && e.targetId) raidTape.add(`${atk}>${e.targetId}@${e.tick}`);
      }
      if (e.type === "settlement-claimed" && alliedNow(atk, e.data.previousFactionId as string | null)) v(`claim between allies t${e.tick}`);
      if (e.type === "alliance-formed") {
        const a = e.data.alliance as Alliance;
        for (const f of a.factionIds) {
          const c = a.causes[f];
          if (!c || !/^(raided|near|landless): /.test(c)) v(`pact ${a.id} side ${f} without a known cause`);
          const m = c?.match(/^raided: (\S+) raided (\S+) at t(\d+)/);
          if (m && (m[2] !== f || m[1] !== a.enemyFactionId || !raidTape.has(`${m[1]}>${m[2]}@${m[3]}`) || e.tick - Number(m[3]) > ALLIANCE_RAID_WINDOW)) v(`pact ${a.id} raided cause not on the tape or outside the window`);
          if (c?.startsWith("near: ") && !/at (\d+\.\d+) from/.test(c)) v(`pact ${a.id} near cause without a distance`);
          const d = Number(c?.match(/at (\d+\.\d+) from/)?.[1]); if (c?.startsWith("near: ") && !(d <= ALLIANCE_NEAR)) v(`pact ${a.id} near beyond ${ALLIANCE_NEAR}`);
          if ([...live.values()].some((x) => x.factionIds.includes(f))) v(`pact ${a.id}: ${f} already in a pact`);
        }
        const k = pairKey(...a.factionIds); const lb = lastBreak.get(k);
        if (lb !== undefined && e.tick - lb < ALLIANCE_COOLDOWN) v(`pact ${a.id} inside the ${ALLIANCE_COOLDOWN}-tick cooldown`);
        if (e.tick <= 0 || e.tick % 24 !== 0) v(`pact ${a.id} off the clock t${e.tick}`);
        live.set(a.id, a);
      }
      if (e.type === "alliance-broken") {
        const r = e.data.reason as string; const ids = e.data.factionIds as [string, string]; const en = e.data.enemyFactionId as string;
        const battleId = (e.data.evidence as { battleId?: string }).battleId;
        const b = battleId ? w.activeBattles[battleId] : undefined;
        const ok = r === "enemy-portless" ? portsOf(w, en) === 0 : r === "ally-gone" ? ids.some((f) => !aliveF(w, f))
          : r === "ally-attack" ? !!b && ids.includes(w.characters[b.attackerId]?.factionId as string) && ids.includes(w.settlements[b.settlementId]?.factionId as string) : false;
        if (!ok) v(`break ${r} does not match state t${e.tick}`);
        live.delete(e.data.allianceId as string); lastBreak.set(pairKey(...ids), e.tick);
      }
      if ((e.type === "battle-resolved" || e.type === "battle-phase-resolved") && e.data.allyJoiners) {
        const port = w.settlements[e.settlementId!];
        const defF = (e.targetId as string | undefined) ?? port.factionId;
        for (const j of e.data.allyJoiners as AllyJoiner[]) {
          const jf = w.characters[j.id]?.factionId;
          if (!alliedNow(jf, j.side === "attacker" ? atk : defF)) v(`joiner ${j.id} not allied to the ${j.side} t${e.tick}`);
          if (j.at !== e.settlementId && dist(w, j.at, e.settlementId!) > ALLIANCE_NEAR) v(`joiner ${j.id} out of reach t${e.tick}`);
          if (typeof j.losses !== "number" || j.losses < 0 || j.losses > j.troops) v(`joiner ${j.id} losses out of range t${e.tick}`);
        }
      }
    }
    // §7.3: no pact alive at a tick's end while its break condition holds.
    for (const a of alliancesOf(w)) {
      if (!a.factionIds.every((f) => aliveF(w, f))) v(`pact ${a.id} alive with a gone ally t${w.tick}`);
      if (!portsOf(w, a.enemyFactionId)) v(`pact ${a.id} alive with a portless enemy t${w.tick}`);
      if (Object.values(w.activeBattles).some((b) => { const x = w.characters[b.attackerId]?.factionId, y = w.settlements[b.settlementId]?.factionId; return x !== y && a.factionIds.includes(x as string) && a.factionIds.includes(y as string); })) v(`pact ${a.id} alive with an ally attack t${w.tick}`);
    }
    if (on && alliancesOf(w).length !== live.size) v(`tape pact count ${live.size} != state ${alliancesOf(w).length} t${w.tick}`);
  }
  const t = dynamismReadout(events).totals;
  const forms = events.filter((e) => e.type === "alliance-formed"); const breaks = events.filter((e) => e.type === "alliance-broken");
  const reasons: Record<string, number> = {}; for (const b of breaks) reasons[b.data.reason as string] = (reasons[b.data.reason as string] ?? 0) + 1;
  const causes: Record<string, number> = { raided: 0, near: 0, landless: 0 }; for (const f of forms) for (const c of Object.values((f.data.alliance as Alliance).causes)) causes[c.split(":")[0]]++;
  const holderPacts = forms.filter((f) => Object.values((f.data.alliance as Alliance).portsAtForm).some((n) => n > 0)).length;
  const joined = events.filter((e) => (e.type === "battle-resolved" || e.type === "battle-phase-resolved") && e.data.allyJoiners);
  const joinedBattles = new Set(joined.map((e) => (e.data.battle as { id?: string } | undefined)?.id ?? `imm-${e.tick}-${e.actorId}`)).size;
  const js = joined.flatMap((e) => e.data.allyJoiners as AllyJoiner[]);
  return { seed, on, hash: stateHash(w).slice(0, 8), claims: events.filter((e) => e.type === "settlement-claimed").length, portChanges: t.portOwnershipChanges, secessions: t.secessions,
    wipeouts: wipeouts(w), forms: forms.length, breaks: breaks.length, reasons, causes, holderPacts, joinedBattles, joinedRounds: joined.length, flips: joined.filter((e) => e.data.allyFlip).length,
    joinSides: { attacker: js.filter((j) => j.side === "attacker").length, defender: js.filter((j) => j.side === "defender").length },
    joinerLosses: js.reduce((a, j) => a + (j.losses ?? 0), 0), joinerTroops: js.reduce((a, j) => a + j.troops, 0), liveAtEnd: alliancesOf(w).length, violations: viol.length, sample: viol.slice(0, 5) };
}

const pins: Record<string, { short: string; long: string; ok: boolean }> = {};
for (const [s, [p72, p1200]] of Object.entries(DEFAULT_PINS)) {
  const w = createPrototypeWorld(Number(s)); let short = "";
  for (let i = 0; i < 1200; i++) { runTick(w, {}); if (i === 71) short = stateHash(w).slice(0, 8); }
  const long = stateHash(w).slice(0, 8); pins[s] = { short, long, ok: short === p72 && long === p1200 };
}
const off = seeds.map((s) => run(s, false)); const on = seeds.map((s) => run(s, true));
const offOf = (s: number) => off.find((r) => r.seed === s)!;
console.log("| Seed | Forms | Breaks (reasons) | Causes raided/near/landless | Port-holder pacts | Joined battles (rounds) | Flipped | Joiner losses / troops | Claims off → on | Port changes off → on | Secessions off → on | Violations |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const b of on) { const a = offOf(b.seed); console.log(`| ${b.seed} | ${b.forms} | ${b.breaks} ${JSON.stringify(b.reasons)} | ${b.causes.raided} / ${b.causes.near} / ${b.causes.landless} | ${b.holderPacts} / ${b.forms} | ${b.joinedBattles} (${b.joinedRounds}) | ${b.flips} | ${b.joinerLosses} / ${b.joinerTroops} | ${a.claims} → ${b.claims} | ${a.portChanges} → ${b.portChanges} | ${a.secessions} → ${b.secessions} | ${b.violations} |`); }
const sum = (rs: typeof on, k: "claims" | "portChanges" | "secessions" | "forms" | "breaks" | "holderPacts" | "joinedBattles" | "joinedRounds" | "flips" | "joinerLosses" | "joinerTroops" | "violations") => rs.reduce((x, r) => x + r[k], 0);
const causeTot = on.reduce((c, r) => ({ raided: c.raided + r.causes.raided, near: c.near + r.causes.near, landless: c.landless + r.causes.landless }), { raided: 0, near: 0, landless: 0 });
const reasonTot: Record<string, number> = {}; for (const r of on) for (const [k, n] of Object.entries(r.reasons)) reasonTot[k] = (reasonTot[k] ?? 0) + n;
console.log(`| total | ${sum(on, "forms")} | ${sum(on, "breaks")} ${JSON.stringify(reasonTot)} | ${causeTot.raided} / ${causeTot.near} / ${causeTot.landless} | ${sum(on, "holderPacts")} / ${sum(on, "forms")} | ${sum(on, "joinedBattles")} (${sum(on, "joinedRounds")}) | ${sum(on, "flips")} | ${sum(on, "joinerLosses")} / ${sum(on, "joinerTroops")} | ${sum(off, "claims")} → ${sum(on, "claims")} | ${sum(off, "portChanges")} → ${sum(on, "portChanges")} | ${sum(off, "secessions")} → ${sum(on, "secessions")} | ${sum(on, "violations")} |`);
const checks = {
  "1_flagOffPins": Object.values(pins).every((p) => p.ok),
  "2-4_propertyViolations0": sum(on, "violations") === 0 && sum(off, "violations") === 0,
  "liveness_formsOn7of13": on.filter((r) => r.forms > 0).length >= 7,
  "liveness_breaksOn5of13": on.filter((r) => r.breaks > 0).length >= 5,
  "liveness_claimsAndPortChangesEverySeed": on.every((r) => r.claims > 0 && r.portChanges > 0),
  "liveness_noNewWipeouts": on.every((r) => r.wipeouts.every((f) => offOf(r.seed).wipeouts.includes(f))),
  "liveness_secessionsOn6of13": on.filter((r) => r.secessions > 0).length >= 6,
};
console.log("pins:", JSON.stringify(pins));
console.log(`seeds with forms ${on.filter((r) => r.forms > 0).length}/13, breaks ${on.filter((r) => r.breaks > 0).length}/13, secessions ${on.filter((r) => r.secessions > 0).length}/13; min claims ${Math.min(...on.map((r) => r.claims))}, min port changes ${Math.min(...on.map((r) => r.portChanges))}; joiners attacker/defender ${on.reduce((a, r) => a + r.joinSides.attacker, 0)}/${on.reduce((a, r) => a + r.joinSides.defender, 0)}; pacts live at end ${on.reduce((a, r) => a + r.liveAtEnd, 0)}`);
if (sum(on, "violations")) console.log("violations:", JSON.stringify(on.flatMap((r) => r.sample.map((s) => `${r.seed}: ${s}`)).slice(0, 20)));
console.log(JSON.stringify(checks));
const pass = Object.values(checks).every(Boolean);
if (values.json) writeFileSync(values.json, JSON.stringify({ pins, off, on, checks, pass }, null, 2));
if (!pass) { console.log("ALLIANCES ACCEPTANCE FAILED"); process.exitCode = 1; } else console.log("ALLIANCES ACCEPTANCE PASSED");
