// human-contracts.md: the seven card states, as a function of the stored contract and the world. A party reads its own cargo and voyage;
// nothing here is read for a mate or a bystander.
import type { SupplyContract, WorldState } from "../../../src/sim/types.ts";

export type UiContractState = "offered" | "accepted" | "active" | "fulfilled" | "breached" | "declined" | "expired" | "refused" | "cancelled";

export function uiState(c: SupplyContract, w: WorldState): UiContractState {
  if (c.status !== "accepted") return c.status as UiContractState;
  const carrier = w.characters[c.carrierId];
  const underway = !!carrier && (carrier.cargo.provisions >= c.quantity || carrier.travel?.toId === c.destinationId);
  return underway ? "active" : "accepted";
}
