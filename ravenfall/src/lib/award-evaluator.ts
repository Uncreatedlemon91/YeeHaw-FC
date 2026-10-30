import { Prisma, type Award } from "@prisma/client";
import { grantAward, unlessDuplicate } from "./award-service";
import { ruleOf, type AutoRule } from "./awards";
import { prisma } from "./prisma";

// Automatic awards. Evaluated when an after-action report is filed (for that
// op's attendees) and daily (service days and good conduct only move with
// the calendar). Idempotent: every award a member is owed is compared with
// the rows they already have, revoked ones included, so a revoked automatic
// award is never re-issued and a second run gives nothing new.

const DAY = 864e5;
const daysBetween = (from: Date, to: Date) => Math.floor((to.getTime() - from.getTime()) / DAY);

type Owed = { userId: string; award: Pick<Award, "id" | "name" | "repeatable">; sequence: number; citation: string; eventId: string | null };

export type EvaluateOptions = {
  /** Only these members (the AAR's attendees). Default: every active member. */
  userIds?: string[];
  /** The op whose report triggered this run: recorded on operations awards. */
  eventId?: string;
  now?: Date;
};

/** The newest sequence and award date each member already has of each award. */
type Held = Map<string, { sequence: number; at: Date }>;

/** Awards given by this run, as MemberAward ids (for the Discord announcement). */
export async function evaluateAwards(opts: EvaluateOptions = {}): Promise<{ created: string[]; examined: number }> {
  const now = opts.now ?? new Date();
  const awards = (await prisma.award.findMany({ where: { active: true, autoRule: { not: Prisma.DbNull } } }))
    .map((a) => ({ a, rule: ruleOf(a.autoRule) }))
    .filter((x): x is { a: Award; rule: AutoRule } => !!x.rule);
  if (!awards.length || opts.userIds?.length === 0) return { created: [], examined: 0 };

  const users = await prisma.user.findMany({
    where: { status: "ACTIVE", ...(opts.userIds ? { id: { in: opts.userIds } } : {}) },
    select: { id: true, enlistedAt: true },
  });
  const ids = users.map((u) => u.id);
  if (!ids.length) return { created: [], examined: 0 };

  const held: Held = new Map();
  const rows = await prisma.memberAward.groupBy({
    by: ["userId", "awardId"],
    where: { userId: { in: ids }, awardId: { in: awards.map((x) => x.a.id) } },
    _max: { sequence: true, awardedAt: true },
  });
  for (const r of rows) held.set(`${r.userId}|${r.awardId}`, { sequence: r._max.sequence ?? 0, at: r._max.awardedAt ?? new Date(0) });

  const owed: Owed[] = [];
  const give = (userId: string, a: Award, sequence: number, citation: string, eventId: string | null = null) =>
    owed.push({ userId, award: a, sequence, citation, eventId });
  const have = (userId: string, a: Award) => held.get(`${userId}|${a.id}`);

  // Attended operations (past, ATTENDING), as the personnel file counts them.
  const needsOps = awards.some((x) => x.rule.type === "ops_attended");
  const ops = new Map<string, number>();
  if (needsOps) {
    const counts = await prisma.attendance.groupBy({
      by: ["userId"],
      where: { userId: { in: ids }, status: "ATTENDING", event: { startTime: { lt: now } } },
      _count: true,
    });
    for (const c of counts) ops.set(c.userId, c._count);
  }

  // Latest disciplinary entry per member, for the good conduct window.
  const windows = awards.flatMap((x) => (x.rule.type === "good_conduct" ? [x.rule.days] : []));
  const discipline = new Map<string, Date>();
  if (windows.length) {
    const recs = await prisma.serviceRecord.groupBy({
      by: ["userId"],
      where: { userId: { in: ids }, type: "DISCIPLINARY", createdAt: { gte: new Date(now.getTime() - Math.max(...windows) * DAY) } },
      _max: { createdAt: true },
    });
    for (const r of recs) if (r._max.createdAt) discipline.set(r.userId, r._max.createdAt);
  }

  for (const { a, rule } of awards) {
    switch (rule.type) {
      case "service_days":
        for (const u of users) {
          if (!u.enlistedAt || have(u.id, a) || daysBetween(u.enlistedAt, now) < rule.threshold) continue;
          give(u.id, a, 1, `${rule.threshold} days of service.`);
        }
        break;

      case "ops_attended":
        for (const u of users) {
          const n = ops.get(u.id) ?? 0;
          if (n < rule.threshold) continue;
          // Award #k is owed at threshold + (k-1)*every attended ops.
          const entitled = a.repeatable && rule.every ? Math.floor((n - rule.threshold) / rule.every) + 1 : 1;
          const got = have(u.id, a)?.sequence ?? 0;
          for (let seq = got + 1; seq <= entitled; seq++) {
            const at = rule.threshold + (seq - 1) * (rule.every ?? 0);
            give(u.id, a, seq, `${at} operations attended.`, opts.eventId ?? null);
          }
        }
        break;

      case "campaign": {
        // No tag field on operations: the tag counts when it appears in the title or description.
        const hits = await prisma.attendance.findMany({
          where: {
            userId: { in: ids },
            status: "ATTENDING",
            event: {
              startTime: { lt: now },
              OR: [{ title: { contains: rule.tag, mode: "insensitive" } }, { description: { contains: rule.tag, mode: "insensitive" } }],
            },
          },
          select: { userId: true, event: { select: { id: true, title: true } } },
          orderBy: { event: { startTime: "asc" } },
        });
        const first = new Map<string, { id: string; title: string }>();
        for (const h of hits) if (!first.has(h.userId)) first.set(h.userId, h.event);
        for (const [userId, ev] of first) if (!have(userId, a)) give(userId, a, 1, `Took part in ${ev.title}.`, ev.id);
        break;
      }

      case "good_conduct":
        for (const u of users) {
          if (!u.enlistedAt || daysBetween(u.enlistedAt, now) < rule.days) continue;
          const last = discipline.get(u.id);
          if (last && daysBetween(last, now) < rule.days) continue;
          const prev = have(u.id, a);
          // Once, or (repeatable) once per clean period since the last one.
          if (prev && !(a.repeatable && daysBetween(prev.at, now) >= rule.days)) continue;
          give(u.id, a, (prev?.sequence ?? 0) + 1, `${rule.days} days of clean service.`);
        }
        break;
    }
  }

  const created: string[] = [];
  for (const o of owed) {
    const made = await unlessDuplicate(() =>
      prisma.$transaction((tx) =>
        grantAward(tx, { userId: o.userId, award: o.award, source: "AUTO", citation: o.citation, eventId: o.eventId, sequence: o.sequence, credit: "Awarded automatically." }),
      ),
    );
    if (made) created.push(made.id);
  }
  return { created, examined: users.length };
}
