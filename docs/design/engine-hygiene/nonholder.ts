// Item 4: a non-holder member issues orders. On main the faction seat becomes null (two issuers). With item4-stored-holder-state.patch it stays.
import { runTick } from "../../../src/sim/engine.ts";
import { createPrototypeWorld } from "../../../src/sim/scenario.ts";
import { commandHolderId } from "../../../src/sim/state.ts";
import { submitCommand } from "../../../src/sim/commands.ts";
const w = createPrototypeWorld(1847, { playerCharacterId: "character-02" });
const p = Object.keys(w.players)[0]; const me = w.characters["character-02"];
console.log("faction", me.factionId, "holder before", commandHolderId(w, me.factionId!));
for (let i = 0; i < 12; i++) runTick(w, {});
const targets = Object.values(w.characters).filter((c) => c.factionId === me.factionId && c.id !== me.id && c.controller.kind === "autonomous" && w.players[p].knownCharacterIds.includes(c.id));
console.log("known recipients", targets.length);
for (const t of targets.slice(0, 3)) { const r = submitCommand(w, { playerId: p, type: "issue-order", characterId: t.id, directive: "protect", targetId: "crown-harbor" }); console.log("issue", t.id, r.ok ? "ok" : (r as any).error); }
for (let i = 0; i < 6; i++) runTick(w, {});
console.log("holder after", commandHolderId(w, me.factionId!), "orders by me", Object.values(w.characters).flatMap((c) => c.standingOrders).filter((o) => o.issuerId === "character-02").length);
