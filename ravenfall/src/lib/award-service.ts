import { Prisma, type Award, type AwardSource, type User } from "@prisma/client";
import { hasPerm, type Perm } from "./permissions";
import { leads } from "./personnel";
import { prisma } from "./prisma";
import { ruleOf } from "./awards";

// Giving and taking back awards: who may nominate, who may decide, and the
// one place a MemberAward row (plus its service-record entry) is written.
// Nominations, approvals, revocations and the automatic evaluator all come
// through here. Discord follows separately (award-notify.ts).

type Person = Pick<User, "id" | "squad" | "unitRole" | "status">;

/** Squad leadership for members of the squads they lead; Command for anyone. Never yourself. */
export function canNominate(perms: readonly Perm[], viewer: Person | null, nominee: Person): boolean {
  if (!viewer || viewer.id === nominee.id || nominee.status !== "ACTIVE") return false;
  return hasPerm(perms, "ADMIN") || leads(viewer, nominee.squad);
}

/** Command decides, but never on its own nomination or one about itself. */
export function canDecideNomination(perms: readonly Perm[], viewerId: string, n: { nomineeId: string; nominatedById: string | null }): boolean {
  return hasPerm(perms, "ADMIN") && viewerId !== n.nomineeId && viewerId !== n.nominatedById;
}

/** Nominations only make sense for awards decided by people, not by an automatic rule. */
export function isNominatable(award: Pick<Award, "active" | "autoRule">): boolean {
  return award.active && !ruleOf(award.autoRule);
}

/** Calls `fn` with a unique-constraint violation turned into `null`: another run already did it. */
export async function unlessDuplicate<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null;
    throw e;
  }
}

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export type GrantInput = {
  userId: string;
  award: Pick<Award, "id" | "name" | "repeatable">;
  source: AwardSource;
  citation: string;
  eventId?: string | null;
  nominatedById?: string | null;
  approvedById?: string | null;
  /** Written into the service record ("Nominated by A, approved by B."). */
  credit?: string;
  /** Explicit sequence (the evaluator knows which repeat it is owed); otherwise the next one. */
  sequence?: number;
};

/**
 * Give an award inside a transaction: the MemberAward row (the next sequence,
 * counting revoked ones) and an AWARD entry on the service record. Throws a
 * P2002 if that sequence was just taken by a concurrent run; wrap in
 * unlessDuplicate where that is expected.
 */
export async function grantAward(tx: Prisma.TransactionClient, g: GrantInput) {
  const sequence =
    g.sequence ?? ((await tx.memberAward.aggregate({ where: { userId: g.userId, awardId: g.award.id }, _max: { sequence: true } }))._max.sequence ?? 0) + 1;
  const row = await tx.memberAward.create({
    data: {
      userId: g.userId,
      awardId: g.award.id,
      sequence,
      citation: g.citation,
      eventId: g.eventId ?? null,
      nominatedById: g.nominatedById ?? null,
      approvedById: g.approvedById ?? null,
      source: g.source,
    },
  });
  await tx.serviceRecord.create({
    data: {
      userId: g.userId,
      type: "AWARD",
      title: `Awarded the ${g.award.name}${sequence > 1 && g.award.repeatable ? ` (${ordinal(sequence)} award)` : ""}`,
      description: [g.citation, g.credit].filter(Boolean).join("\n\n") || null,
      issuedById: g.approvedById ?? null,
    },
  });
  return row;
}

/** Does the member hold (not revoked) this award right now? */
export async function holds(userId: string, awardId: string): Promise<boolean> {
  return !!(await prisma.memberAward.findFirst({ where: { userId, awardId, revokedAt: null }, select: { id: true } }));
}

export const callsignOf = (u: Pick<User, "callsign" | "discordUsername">) => u.callsign ?? u.discordUsername;
