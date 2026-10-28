import { prisma } from "./prisma";
import { stageAfterAnswer, stageAfterOffer } from "./recruitment-rules";

// The two moves a prospect's file makes on its own, because of the contract:
// offering moves it to Offered, accepting moves it to Signed. A leaf module
// (database only) so contracts.ts can call it without a cycle with
// recruitment.ts, which calls contracts.ts to make the offer.

/** The player's open files: linked to them, or naming their Discord account. */
async function filesOf(playerId: string) {
  const p = await prisma.player.findUnique({ where: { id: playerId }, select: { discordId: true } });
  if (!p) return [];
  return prisma.prospect.findMany({ where: { OR: [{ playerId }, { discordId: p.discordId }] } });
}

export async function prospectOffered(playerIds: string[]): Promise<void> {
  for (const id of playerIds) {
    for (const f of await filesOf(id)) {
      const stage = stageAfterOffer(f.stage);
      if (stage !== f.stage || !f.playerId) await prisma.prospect.update({ where: { id: f.id }, data: { stage, playerId: id } });
    }
  }
}

export async function prospectAnswered(playerId: string, decision: "accept" | "decline"): Promise<void> {
  for (const f of await filesOf(playerId)) {
    const stage = stageAfterAnswer(f.stage, decision);
    if (stage !== f.stage) await prisma.prospect.update({ where: { id: f.id }, data: { stage, playerId, signedAt: stage === "SIGNED" ? (f.signedAt ?? new Date()) : f.signedAt } });
  }
}
