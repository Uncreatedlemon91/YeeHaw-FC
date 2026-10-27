import { after } from "next/server";
import { answeredOffer } from "./contract-messages";
import { afterResponse, offerView, respondToContract } from "./contracts";
import { reply, updateMessage, type Interaction } from "./interactions";

/**
 * "ct:accept:<contractId>" and "ct:decline:<contractId>", the buttons on an
 * offer. Only the player the offer names can press them (checked against the
 * Discord user who clicked, not anything in the message). The press rewrites
 * the offer message at once; roles and the signing post follow after the
 * response, since Discord wants an answer within three seconds.
 */
export async function contractButton(i: Interaction) {
  const [, action, contractId] = (i.data?.custom_id ?? "").split(":");
  if ((action !== "accept" && action !== "decline") || !contractId) return reply("Unknown button.");
  const clicker = i.member?.user.id ?? i.user?.id;
  const r = await respondToContract(contractId, clicker, action);
  if (!r.ok) return reply(r.error);
  after(async () => {
    try {
      await afterResponse(contractId, action, { editOffer: false });
    } catch (e) {
      console.error("contract follow-up failed", e);
    }
  });
  return updateMessage(answeredOffer(offerView(r.contract), action));
}
