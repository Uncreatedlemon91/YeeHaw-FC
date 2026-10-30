"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/action-form";
import { announceLater, announceNominationLater } from "@/lib/award-notify";
import { callsignOf, canDecideNomination, canNominate, grantAward, holds, isNominatable, unlessDuplicate } from "@/lib/award-service";
import { assertPerm } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Award nominations, their decisions and revocation. Permissions are checked
// here on every call; the pages only decide what to show.

const MAX_CITATION = 1000;

function refresh(userId: string) {
  revalidatePath(`/roster/${userId}`);
  revalidatePath("/personnel");
  revalidatePath("/vault", "layout");
}

/** Nominate a member from their personnel file. Squad leadership (own squad) and Command (anyone). */
export async function nominate(_: ActionState, data: FormData): Promise<ActionState> {
  const me = await assertPerm("OPERATOR");
  const nomineeId = String(data.get("nomineeId") ?? "");
  const awardId = String(data.get("awardId") ?? "");
  const citation = String(data.get("citation") ?? "").trim();
  const eventId = String(data.get("eventId") ?? "") || null;

  if (!awardId) return { error: "Pick an award." };
  if (citation.length < 10) return { error: "Write a citation: what did they do? A sentence or two." };
  if (citation.length > MAX_CITATION) return { error: `Keep the citation under ${MAX_CITATION} characters.` };

  const [nominator, nominee, award] = await Promise.all([
    prisma.user.findUnique({ where: { id: me.id } }),
    prisma.user.findUnique({ where: { id: nomineeId } }),
    prisma.award.findUnique({ where: { id: awardId } }),
  ]);
  if (!nominee || !award) return { error: "Member or award not found." };
  if (nominee.id === me.id) return { error: "You can't nominate yourself." };
  if (!canNominate(me.perms, nominator, nominee)) return { error: "You can nominate members of the squads you lead; Command can nominate anyone." };
  if (!isNominatable(award)) return { error: award.active ? "That award is given automatically." : "That award is retired." };

  if (eventId) {
    const ev = await prisma.event.findUnique({ where: { id: eventId }, select: { startTime: true } });
    if (!ev || ev.startTime > new Date()) return { error: "Pick an operation that has already happened." };
  }
  if (!award.repeatable && (await holds(nominee.id, award.id))) return { error: `${callsignOf(nominee)} already holds the ${award.name}.` };
  const pending = await prisma.awardNomination.findFirst({ where: { nomineeId, awardId, status: "PENDING" }, select: { id: true } });
  if (pending) return { error: `There is already a pending nomination of ${callsignOf(nominee)} for the ${award.name}.` };

  const n = await prisma.awardNomination.create({ data: { nomineeId, awardId, citation, eventId, nominatedById: me.id } });
  announceNominationLater(n.id);
  refresh(nomineeId);
  return { ok: `Nominated. Command decides on the S1 Desk.` };
}

/** Approve or deny a pending nomination. Command only, and never your own or one about you. */
export async function decideNomination(_: ActionState, data: FormData): Promise<ActionState> {
  const me = await assertPerm("ADMIN");
  const id = String(data.get("nominationId") ?? "");
  const approve = data.get("verdict") === "approve";
  const note = String(data.get("note") ?? "").trim().slice(0, 500) || null;

  const n = await prisma.awardNomination.findUnique({ where: { id }, include: { award: true, nominee: true } });
  if (!n) return { error: "Nomination not found." };
  if (n.status !== "PENDING") return { error: "That nomination has already been decided." };
  if (!canDecideNomination(me.perms, me.id, n)) return { error: "Someone else in Command has to decide a nomination you made or one about you." };

  if (!approve) {
    const done = await prisma.awardNomination.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "DENIED", decidedById: me.id, decidedAt: new Date(), decisionNote: note },
    });
    if (!done.count) return { error: "That nomination has already been decided." };
    refresh(n.nomineeId);
    return { ok: "Denied." };
  }

  if (!n.award.active) return { error: "That award is retired. Deny the nomination or reactivate the award first." };
  if (!n.award.repeatable && (await holds(n.nomineeId, n.awardId))) return { error: `${callsignOf(n.nominee)} already holds the ${n.award.name}. Deny the nomination.` };
  const nominator = n.nominatedById ? await prisma.user.findUnique({ where: { id: n.nominatedById } }) : null;

  // Claim the nomination and give the award in one transaction, so a double
  // click or a second approver can't award it twice.
  const given = await unlessDuplicate(() =>
    prisma.$transaction(async (tx) => {
      const claimed = await tx.awardNomination.updateMany({
        where: { id, status: "PENDING" },
        data: { status: "APPROVED", decidedById: me.id, decidedAt: new Date(), decisionNote: note },
      });
      if (!claimed.count) return null;
      return grantAward(tx, {
        userId: n.nomineeId,
        award: n.award,
        source: "NOMINATION",
        citation: n.citation,
        eventId: n.eventId,
        nominatedById: n.nominatedById,
        approvedById: me.id,
        credit: `${nominator ? `Nominated by ${callsignOf(nominator)}, approved` : "Approved"} by ${me.name}.`,
      });
    }),
  );
  if (!given) return { error: "That nomination has already been decided." };
  announceLater([given.id]);
  refresh(n.nomineeId);
  return { ok: `Approved: ${callsignOf(n.nominee)} receives the ${n.award.name}.` };
}

/** Take an award back, with a reason. Command only. The row stays so automatic awards aren't re-issued. */
export async function revokeAward(_: ActionState, data: FormData): Promise<ActionState> {
  const me = await assertPerm("ADMIN");
  const id = String(data.get("memberAwardId") ?? "");
  const reason = String(data.get("reason") ?? "").trim();
  if (reason.length < 3) return { error: "Give a reason; it goes on the service record." };
  if (reason.length > 500) return { error: "Keep the reason under 500 characters." };

  const row = await prisma.memberAward.findUnique({ where: { id }, include: { award: true } });
  if (!row) return { error: "Award not found." };
  const revoked = await prisma.$transaction(async (tx) => {
    const done = await tx.memberAward.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date(), revokedById: me.id, revokeReason: reason },
    });
    if (!done.count) return false;
    await tx.serviceRecord.create({
      data: { userId: row.userId, type: "AWARD", title: `Award revoked: ${row.award.name}`, description: reason, issuedById: me.id },
    });
    return true;
  });
  if (!revoked) return { error: "That award was already revoked." };
  refresh(row.userId);
  return { ok: `Revoked the ${row.award.name}.` };
}
