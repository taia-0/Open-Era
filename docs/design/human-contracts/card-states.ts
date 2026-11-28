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

/**
 * Rev 2 (rulings 3, 4, 5): the carrier's card says why a contract closed, in fixed text from stored fields only.
 * `closeReason` is a stored field (set only for a human carrier under the flag); a breach is read from status.
 * `penalty` is the carrier-facing statement, not a stored value: the relationship hit is the existing DEFEAT write, the cooldown is the 180-tick rule.
 */
export interface CloseNote { closeReason: "declined" | "offer-expired" | "no-longer-needed" | "buyer-cannot-fund" | "breached" | "fulfilled" | null; text: string | null; penalty: boolean }
export function closeNote(c: SupplyContract, w: WorldState): CloseNote {
  const buyer = w.characters[c.buyerId]?.name ?? "The buyer";
  const port = w.settlements[c.destinationId]?.name ?? "the port";
  if (c.closeReason === "no-longer-needed") return { closeReason: "no-longer-needed", text: `${buyer} no longer needs this delivery: ${port} is stocked again. No penalty. Anything you bought is yours.`, penalty: false };
  if (c.closeReason === "buyer-cannot-fund") return { closeReason: "buyer-cannot-fund", text: `${buyer} could no longer fund this contract, so the offer was withdrawn. No penalty.`, penalty: false };
  if (c.closeReason === "offer-expired") return { closeReason: "offer-expired", text: "You did not answer in time. The offer lapsed. No penalty.", penalty: false };
  if (c.closeReason === "declined") return { closeReason: "declined", text: "You declined. No penalty.", penalty: false };
  if (c.status === "breached") return { closeReason: "breached", text: `You missed the deadline. ${buyer} trusts you less and will not offer you another contract for 180 ticks.`, penalty: true };
  if (c.status === "fulfilled") return { closeReason: "fulfilled", text: `Delivered to ${port}. You were paid ${c.price}.`, penalty: false };
  return { closeReason: null, text: null, penalty: false };
}
