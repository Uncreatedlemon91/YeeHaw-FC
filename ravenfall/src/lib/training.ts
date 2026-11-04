import { RANKS, rankIndex, rankName, roleDef, UNIT } from "@/config/unit";
import { dm, explain } from "./discord";
import { env } from "./env";
import { prisma } from "./prisma";
import { blockers, expiringSoon, heldSlugs, isCurrent } from "./qual-rules";
import { discordTime } from "./time";

// The training calendar: a course (an event set to train a qualification)
// invites the members who need it, by name, and DMs them. "Needs it" means
// they're eligible (prerequisites, rank) and either their billets or their
// next rank call for it, or they held it and it has lapsed or is about to.

export type Need = { userId: string; why: "billet" | "promotion" | "recertify" };

type Q = { id: string; slug: string; title: string; active: boolean; minRank: string | null; prerequisites: { slug: string; title: string }[] };
type M = {
  id: string;
  rank: string | null;
  unitRole: string | null;
  secondaryRoles: string[];
  qualifications: { qualificationId: string; expiresAt: Date | null; qualification: { slug: string } }[];
};

export function needOf(q: Q, m: M, now = new Date()): Need["why"] | null {
  if (!q.active) return null;
  const has = m.qualifications.find((h) => h.qualificationId === q.id);
  if (has && isCurrent(has, now) && !expiringSoon(has, now)) return null;
  if (blockers(q, { rank: m.rank, held: heldSlugs(m.qualifications, now) }, rankName).length) return null;
  if (has) return "recertify";
  const roles = [m.unitRole, ...m.secondaryRoles].filter(Boolean);
  if (roles.some((r) => roleDef(r)?.requires.includes(q.slug))) return "billet";
  const next = RANKS[rankIndex(m.rank) + 1];
  if (m.rank && next?.requires?.quals?.includes(q.slug)) return "promotion";
  return null;
}

const memberInclude = { qualifications: { include: { qualification: { select: { slug: true } } } } } as const;

/** Active members who need this qualification, and why. */
export async function whoNeeds(qualificationId: string, now = new Date()): Promise<Need[]> {
  const q = await prisma.qualification.findUnique({ where: { id: qualificationId }, include: { prerequisites: { select: { slug: true, title: true } } } });
  if (!q) return [];
  const members = await prisma.user.findMany({ where: { status: "ACTIVE", leftDiscordAt: null }, include: memberInclude });
  return members.flatMap((m) => {
    const why = needOf(q, m, now);
    return why ? [{ userId: m.id, why }] : [];
  });
}

const WHY: Record<Need["why"], string> = {
  billet: "your billet calls for it",
  promotion: "your next rank calls for it",
  recertify: "yours has lapsed or is about to",
};

/**
 * Invite everyone who needs the course's qualification and isn't invited
 * yet, and DM them. Returns how many were newly invited and any DM failures.
 */
export async function inviteCourseNeeds(eventId: string): Promise<{ invited: number; warnings: string[] }> {
  const e = await prisma.event.findUnique({ where: { id: eventId }, include: { course: true } });
  if (!e?.course || e.startTime < new Date()) return { invited: 0, warnings: [] };
  const needs = (await whoNeeds(e.course.id)).filter((n) => !e.invitedUserIds.includes(n.userId));
  if (!needs.length) return { invited: 0, warnings: [] };
  await prisma.event.update({ where: { id: e.id }, data: { invitedUserIds: { push: needs.map((n) => n.userId) } } });
  const warnings: string[] = [];
  if (env.botToken) {
    const people = await prisma.user.findMany({ where: { id: { in: needs.map((n) => n.userId) } }, select: { id: true, discordId: true } });
    const why = new Map(needs.map((n) => [n.userId, n.why]));
    for (const p of people) {
      await dm(
        p.discordId,
        `You're invited to **${e.title}**, a ${e.course.title} course, ${discordTime(e.startTime)} (${discordTime(e.startTime, "R")}): ${WHY[why.get(p.id)!]}. Sign up: ${env.siteUrl}/ops/${e.id}\n\n— ${UNIT.siteName}`,
      ).catch((err) => warnings.push(`DM ${p.discordId}: ${explain(err)}`));
    }
  }
  return { invited: needs.length, warnings };
}

export const inviteCourseNeedsLater = (eventId: string) =>
  void inviteCourseNeeds(eventId)
    .then((r) => r.warnings.forEach((w) => console.error(`[training] ${w}`)))
    .catch((err) => console.error(`[training] ${explain(err)}`));

/** Upcoming courses for qualifications this member needs (or is invited to by name). */
export async function coursesFor(userId: string, now = new Date()) {
  const [m, events] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, include: memberInclude }),
    prisma.event.findMany({
      where: { startTime: { gte: now }, courseId: { not: null } },
      orderBy: { startTime: "asc" },
      take: 20,
      include: { course: { include: { prerequisites: { select: { slug: true, title: true } } } }, attendances: { where: { userId } } },
    }),
  ]);
  if (!m) return [];
  return events.flatMap((e) => {
    const why = e.course ? needOf(e.course, m, now) : null;
    return why || e.invitedUserIds.includes(userId) ? [{ event: e, why }] : [];
  });
}
