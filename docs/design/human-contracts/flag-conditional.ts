// human-contracts.md rev 2, ruling 7: the two verbs are flag-conditional. Prints what a tree does; run it on 4f5c1f7 and on 4f5c1f7 + fix.patch and diff the flag-off lines.
import { COMMAND_TYPES, commandCapabilities, submitCommand } from "../../../src/sim/commands.ts";
import { createPrototypeWorld } from "../../../src/sim/scenario.ts";
const w = createPrototypeWorld(1847);
const playerId = Object.keys(w.players)[0];
const caps = (o?: object) => (commandCapabilities(undefined, ...(o ? [o] : [])) as { commandTypes: string[] }).commandTypes;
const submit = (type: string, o?: object) => { const r = (submitCommand as any)(w, { playerId, type, contractId: "supply-none" }, ...(o ? [o] : [])); return r.ok ? "ok" : `${r.code}: ${r.error ?? ""}`; };
console.log("COMMAND_TYPES", JSON.stringify(COMMAND_TYPES));
console.log("capabilities flag-off", JSON.stringify(caps()));
console.log("capabilities flag-on ", JSON.stringify(caps({ humanContracts: true })));
console.log("accept flag-off", submit("accept-contract"));
console.log("decline flag-off", submit("decline-contract"));
console.log("accept flag-on, unknown contract", submit("accept-contract", { humanContracts: true }));
