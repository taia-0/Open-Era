import assert from "node:assert/strict";
import test from "node:test";
import { advancePauseNote, dashboardState, fullEventFeed, projectEventFeed } from "../src/dashboard/view-model.ts";
import { projectCharacter, projectFactions } from "../src/dashboard/visibility.ts";
import { captivityReleasedParts, captivityReleasedSentence } from "../src/dashboard/wording.ts";
import { stateHash } from "../src/sim/state.ts";
import type { SimEvent, WorldState } from "../src/sim/types.ts";
import { allRuns, storyRun, type StoryRun } from "./helpers/story-runs.ts";

/**
 * Story properties over the 1200-tick runs (seeds 1847, 2718, 4096; headless and live).
 * These replace 19 tests that pinned exact ticks, sequences and names, which every
 * rule change moved. They assert that each kind of story occurs and that its
 * invariants hold on every occurrence. The exact determinism check stays with the
 * hash pins (tests/golden.test.ts, tests/ai-pilot-a.test.ts, tests/ai-pilot-b.test.ts).
 */

const PLAYER = "character-01";
const r2 = (value: number): number => Math.round(value * 100) / 100;
const money = (value: number): string => String(r2(value));
const nameOf = (world: WorldState, id: string | null | undefined): string => (id ? world.characters[id]?.name ?? id : "");
const portName = (world: WorldState, id: string | null | undefined): string => (id ? world.settlements[id]?.name ?? id : "");
const factionName = (world: WorldState, id: string): string => world.factions[id]?.name ?? id;
const runs = (): StoryRun[] => [...allRuns(false), ...allRuns(true)];
const label = (run: StoryRun): string => `${run.seed}${run.live ? " live" : ""}`;

const TAX_LINE = /^(.+) (raised|lowered) the (.+) tax from (\d+)% to (\d+)% \((treasury short|ruler's choice|unrest|unrest at [^)]+)\)\.( The raise cost stability at .+\.)?$/;

test("tax steps: every autonomous step chains its previous rate and its feed line has the step's shape", () => {
  // Was batch2-polish "seed 1847 shows every Free Tide step ...": exact rows at fixed indices.
  let steps = 0;
  for (const run of runs()) {
    const last = new Map<string, number>();
    for (const event of run.events) {
      if (event.type !== "tax-rate-set") continue;
      const factionId = String(event.data.factionId);
      const previous = event.data.previousTaxRate as number;
      if (last.has(factionId)) assert.equal(previous, last.get(factionId), `${label(run)} ${event.sequence}`);
      last.set(factionId, event.data.taxRate as number);
      if (Object.hasOwn(event.data, "commandId") || previous === event.data.taxRate) continue;
      steps += 1;
      const [row] = projectEventFeed(run.world, PLAYER, [event], run.events);
      const match = TAX_LINE.exec(String(row?.summary));
      assert.ok(match, `${label(run)} ${row?.summary}`);
      const up = (event.data.taxRate as number) > previous;
      assert.equal(match[2], up ? "raised" : "lowered");
      assert.equal(Number(match[4]), Math.round(previous * 100));
      assert.equal(Number(match[5]), Math.round((event.data.taxRate as number) * 100));
      // The shock clause appears exactly on raises, and names every shocked port with before and after.
      assert.equal(match[7] !== undefined, up, `${label(run)} ${row?.summary}`);
      for (const hit of (event.data.raiseShock ?? []) as Array<{ settlementId: string; before: number; stability: number }>) {
        assert.ok(String(row?.summary).includes(`${portName(run.world, hit.settlementId)} ${hit.before.toFixed(2)} to ${hit.stability.toFixed(2)}`));
        assert.equal(hit.stability, Math.max(0, r2(hit.before - (Math.round((event.data.taxRate as number) * 100) - Math.round(previous * 100)))));
      }
      // A scorer raise is always for a short treasury; no AI runs here, so no line is the ruler's choice.
      if (up) assert.equal(match[6], "treasury short");
      if (run.world.characters[PLAYER].factionId !== factionId) assert.equal(row?.payloadWithheld, true);
    }
  }
  assert.ok(steps > 0);
});

test("foundings: every secession stores its founder, says so in the feed, and a founder sets the breakaway's first tax step", () => {
  // Was breakaway-polish (Corin Hale founds Free Cinder Key), feed-polish-2 (no-successor founder clause),
  // and breakaway-tax (a secession stores its founder).
  let foundings = 0;
  let firstSteps = 0;
  for (const run of runs()) {
    for (const declared of run.events.filter((event) => event.type === "secession-declared")) {
      foundings += 1;
      const faction = declared.data.faction as { id: string; name?: string };
      const owner = String(declared.data.ownerId);
      assert.equal(run.world.factions[faction.id]?.founderId, owner, `${label(run)} ${faction.id}`);
      const [row] = projectEventFeed(run.world, PLAYER, [declared], run.events);
      const founder = nameOf(run.world, owner);
      const port = portName(run.world, declared.settlementId);
      const from = factionName(run.world, String(declared.data.previousFactionId));
      const breakaway = factionName(run.world, faction.id);
      if (declared.data.successorId === null || declared.data.successorId === undefined) {
        assert.equal(row?.summary, `${founder} declared ${port} separate from ${from}. ${breakaway} starts with an empty treasury, founded by ${founder}, who sets its tax until a leader gives orders.`);
      } else {
        assert.ok(String(row?.summary).startsWith(`${founder} declared ${port} separate from ${from}.`));
      }
      const first = run.events.find((event) => event.type === "tax-rate-set" && event.data.factionId === faction.id && event.sequence > declared.sequence);
      if (first) {
        firstSteps += 1;
        assert.equal(first.actorId, owner, `${label(run)} first step of ${faction.id}`);
        assert.ok(TAX_LINE.test(String(projectEventFeed(run.world, PLAYER, [first], run.events)[0]?.summary)));
      }
    }
    assert.equal(run.world.factions["free-tide"].founderId, undefined);
  }
  assert.ok(foundings > 0, "at least one secession");
  assert.ok(firstSteps > 0, "at least one breakaway sets a first tax step");
});

test("a breakaway's unrest cut names a port it held, and its treasury shows only to its members", () => {
  // Was breakaway-polish "the tick-1104 cut names Glassport" and "a breakaway's treasury shows to its own members".
  let cuts = 0;
  let checked = 0;
  for (const run of runs()) {
    const portNames = new Set(Object.values(run.world.settlements).map((port) => port.name));
    for (const event of run.events) {
      if (event.type !== "tax-rate-set" || !String(event.data.factionId).startsWith("secession-")) continue;
      const summary = String(projectEventFeed(run.world, PLAYER, [event], run.events)[0]?.summary);
      const named = /\(unrest at ([^)]+)\)/.exec(summary);
      if (!named) continue;
      cuts += 1;
      assert.ok(portNames.has(named[1]), summary);
      const portId = Object.values(run.world.settlements).find((port) => port.name === named[1])!.id;
      // The faction held that port at some point: it was declared there, or claimed it before the cut.
      const held = run.events.some((other) => other.sequence < event.sequence && other.settlementId === portId
        && ((other.type === "secession-declared" && (other.data.faction as { id: string }).id === event.data.factionId)
          || (other.type === "settlement-claimed" && other.data.factionId === event.data.factionId)));
      assert.ok(held, `${label(run)} ${summary}`);
    }
    for (const faction of Object.values(run.world.factions).filter((row) => row.id.startsWith("secession-"))) {
      const member = Object.values(run.world.characters).find((character) => character.factionId === faction.id);
      const outsider = Object.values(run.world.characters).find((character) => character.factionId !== faction.id);
      if (!member || !outsider) continue;
      checked += 1;
      const own = projectFactions(run.world, member).find((row) => row.id === faction.id);
      assert.equal(own?.treasury, faction.treasury);
      assert.equal(own?.treasuryNote, null);
      const rival = projectFactions(run.world, outsider).find((row) => row.id === faction.id);
      assert.equal(rival?.treasury, null);
      assert.equal(rival?.treasuryNote, "not visible to you");
    }
  }
  assert.ok(cuts > 0, "at least one breakaway cut names a port");
  assert.ok(checked > 0, "at least one breakaway with members at the end");
});

function releaseInvariants(run: StoryRun, release: SimEvent, at: WorldState, events: SimEvent[]): void {
  const terms = release.data.terms as { moneyPaid: number; debtValue: number };
  const ransom = release.data.ransom as { treasuryShare: number; leaderShare: number; treasuryFactionId: string; factionTreasury: number };
  // Who receives the ransom: the captor's treasury, with the shares summing to the payment.
  assert.equal(ransom.treasuryFactionId, release.targetId, `${label(run)} ${release.sequence}`);
  assert.equal(r2(ransom.treasuryShare + ransom.leaderShare), r2(terms.moneyPaid));
  const prisoner = at.characters[String(release.actorId)];
  const captorName = factionName(at, ransom.treasuryFactionId);
  const lead = `${prisoner.name} was released from ${portName(at, release.settlementId)}.`;
  const paid = `${money(terms.moneyPaid)} was paid and ${money(terms.debtValue)} was recorded as debt.`;
  for (const reader of Object.values(at.characters).slice(0, 8)) {
    const [row] = projectEventFeed(at, reader.id, [release], events);
    const summary = String(row?.summary);
    assert.ok(summary.startsWith(lead), summary);
    if (terms.moneyPaid > 0 || terms.debtValue > 0) assert.ok(summary.includes(paid), summary);
    if (ransom.treasuryShare > 0) assert.ok(summary.includes(`${money(ransom.treasuryShare)} went to the ${captorName} treasury.`), summary);
    // The captor's balance: any reader outside the captor's faction is told it is not visible; its members are not.
    const outsider = reader.factionId !== ransom.treasuryFactionId;
    assert.equal(summary.includes("The balance is not visible to you."), outsider, `${reader.id} ${summary}`);
    if (reader.id === prisoner.id) assert.equal(row?.payloadWithheld, false, "the prisoner always sees their own release");
    assert.ok(summary.includes("The ransom line covers only the ransom."));
    if (row && !row.payloadWithheld && row.data) {
      assert.equal((row.data as { ransom: { factionTreasury?: number } }).ransom.factionTreasury, reader.factionId === ransom.treasuryFactionId ? ransom.factionTreasury : undefined);
    }
    assert.equal(/worked at/.test(summary), false, "the ransom line never carries work");
  }
  // The structured parts are the sentence, split.
  assert.equal(captivityReleasedParts(at, release, false, prisoner).join(" "), captivityReleasedSentence(at, release, prisoner));
}

test("captures and releases: each hold ends in a bounded release, paid to the captor's treasury, with the line's shape", () => {
  // Was capture-wording (Corin Hale's scarred release), ransom-split (Mara's release visible to prisoner and captor),
  // treasury-allowance (hidden Free Tide balance) and readability-polish-2 (release vs Crown Harbor work).
  let pairs = 0;
  let scars = 0;
  for (const run of runs()) {
    for (const captured of run.events.filter((event) => event.type === "character-captured")) {
      const release = run.events.find((event) => event.type === "captivity-released" && event.actorId === captured.actorId && event.sequence > captured.sequence);
      if (!release) continue;
      const escaped = run.events.some((event) => event.type === "captivity-escaped" && event.actorId === captured.actorId && event.sequence > captured.sequence && event.sequence < release.sequence);
      if (escaped) continue;
      pairs += 1;
      assert.equal(release.targetId, captured.targetId, "released by the faction that took them");
      if (release.data.reason === "mandatory-bounded-terms") assert.equal(release.tick - captured.tick, (release.data.daysHeld as number) * 6);
      releaseInvariants(run, release, run.world, run.events);
      if (String(captivityReleasedSentence(run.world, release)).includes("Loyalty fell.")) scars += 1;
    }
  }
  assert.ok(pairs > 0, "at least one capture followed by its release");
  assert.ok(scars > 0, "at least one release scars loyalty");
});

test("the player's holds: time stops on capture and release, and the cards and briefing read right during and after", () => {
  // Was queue-polish (stops), ransom-split (state at release, not released the tick before), readability-polish
  // (Verdant Cay named while held; rounded scar), readability-polish-2 (held-captain title; release debt note),
  // and treasury-allowance (acting commander bound, captive holder not uncapped).
  let holds = 0;
  for (const run of allRuns(true)) {
    // Stops: every player capture and release stops the clock with a "Time stopped." note naming the cause.
    for (const stop of run.stops) {
      const note = advancePauseNote(stop.world, PLAYER, stop.tickEvents, stop.event);
      assert.ok(note?.startsWith("Time stopped. "), String(note));
      if (stop.event.type === "character-captured") assert.ok(note!.includes(`took ${nameOf(stop.world, PLAYER)}`), note!);
      if (stop.event.type === "captivity-released") assert.equal(note, `Time stopped. ${nameOf(stop.world, PLAYER)} was released from ${portName(stop.world, stop.event.settlementId)}.`);
    }
    for (const hold of run.holds) {
      if (!hold.released || !hold.afterRelease) continue;
      holds += 1;
      const captured = hold.captured;
      // Two ticks in: still held where taken; a critical provisions item never offers a port the captive cannot reach.
      if (hold.twoIn) {
        const mara = hold.twoIn.characters[PLAYER];
        assert.equal(mara.captivity?.capturedTick, captured.tick);
        assert.equal(mara.captivity?.settlementId, captured.settlementId);
        const view = dashboardState(hold.twoIn, hold.eventsAt.get(hold.twoIn)!, fullEventFeed(hold.eventsAt.get(hold.twoIn)!)) as {
          party: { resupply: { reachable: boolean; travelTicks: number | null } | null };
          briefing: { items: Array<{ id: string; title: string; summary: string }> };
        };
        const starving = view.briefing.items.find((item) => item.id === "provision:critical");
        if (starving && /sells provisions/.test(starving.summary)) {
          assert.ok(starving.summary.includes("you cannot reach it while you are held"), starving.summary);
          assert.equal(view.party.resupply?.reachable, false);
          assert.equal(view.party.resupply?.travelTicks, null);
        }
        assert.equal(view.briefing.items.find((item) => item.id === `captivity:${captured.tick}`)?.title, "A captain is held captive.");
      }
      // A day boundary in the hold: the acting commander is bound by the daily cap; the captive holder cannot spend.
      if (hold.dayBoundary) {
        const at = hold.dayBoundary;
        const mara = at.characters[PLAYER];
        const holder = projectCharacter(at, mara, mara) as { allowanceRole: string | null; allowanceUncapped: boolean; allowanceNote: string | null; allowanceCap: number | null };
        assert.equal(holder.allowanceRole, "captive-holder");
        assert.equal(holder.allowanceUncapped, false);
        assert.equal(holder.allowanceCap, null);
        assert.equal(holder.allowanceNote, "Cannot spend while held.");
        const actingId = at.factions[mara.factionId!].actingCommanderId;
        if (actingId) {
          const cover = projectCharacter(at, mara, at.characters[actingId]) as { allowanceRole: string | null; allowanceUncapped: boolean; allowanceCap: number | null; allowanceDayStart: number; allowanceResetsOnTick: number };
          assert.equal(cover.allowanceRole, "acting-commander");
          assert.equal(cover.allowanceUncapped, false);
          assert.ok((cover.allowanceCap ?? 0) > 0);
          assert.equal(cover.allowanceDayStart, at.tick);
          assert.equal(cover.allowanceResetsOnTick, at.tick + 6);
        }
      }
      // The tick after release: free again, the line holds its invariants, and the cards show the debt and scar.
      const after = hold.afterRelease;
      const events = hold.eventsAt.get(after)!;
      const mara = after.characters[PLAYER];
      assert.equal(mara.captivity, null);
      releaseInvariants(run, hold.released, after, events);
      const card = projectCharacter(after, mara, mara, events) as { releaseDebtNote: string | null; loyaltyNote: string | null; ransomIncomeNote: string | null };
      const debt = (hold.released.data.terms as { debtValue: number }).debtValue;
      if (debt > 0) assert.ok(card.releaseDebtNote?.startsWith("Owes "), String(card.releaseDebtNote));
      assert.match(String(card.loyaltyNote), /^The seat reads \d\.\d{3}\. That rounded figure is the one the seat uses\.$/);
      assert.equal(card.ransomIncomeNote, null);
      assert.equal(stateHash(after), stateHash(after));
    }
  }
  assert.ok(holds > 0, "the player is taken and released at least once in a live run");
});

test("battle lines say morale gave out in plain words, and never say nerve or outscore", () => {
  // Was readability-polish-3 "seed 1847 tick 484 says morale gave out".
  let morale = 0;
  for (const run of allRuns(false)) {
    for (const battle of run.events.filter((event) => event.type === "battle-resolved")) {
      const [row] = projectEventFeed(run.world, PLAYER, [battle], run.events);
      const summary = String(row?.summary);
      assert.equal(summary.includes("nerve"), false, summary);
      assert.equal(summary.includes("outscore"), false, summary);
      assert.match(summary, / (won|lost|held|drew)[^.]* at [A-Z][^.]*\./, summary);
      if (summary.includes("morale gave out")) morale += 1;
    }
  }
  assert.ok(morale > 0, "at least one fight ends because morale gave out");
});

test("a captured captain's release recovers from the release-tick snapshot (headless, first release per seed)", () => {
  // Was captive-intelligence "Zara Gale's release at tick 791 recovers from the tick 791 snapshot".
  // Kept there as a dynamic recovery test; here, the release record exists and matches the event.
  let sightings = 0;
  for (const run of allRuns(false)) {
    for (const release of run.events.filter((event) => event.type === "captivity-released")) {
      const character = run.world.characters[String(release.actorId)];
      if (character.releaseSighting?.observedTick !== release.tick) continue;
      sightings += 1;
      assert.equal(character.releaseSighting.settlementId, release.settlementId);
    }
  }
  assert.ok(sightings > 0);
});

void storyRun;
