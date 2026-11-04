import type { Prisma } from "@prisma/client";
import { heldSlugs } from "./qual-rules";
import { rankName } from "@/config/unit";
import { career, type Career } from "./career";
import { postRequest, type PromotionPayload } from "./personnel";
import { prisma } from "./prisma";
import { readingProgress } from "./required-reading";

// Automatic promotion recommendations. Whoever meets every criterion for the
// next rank (src/config/unit.ts) gets a PROMOTION request filed for them,
// which Command approves or denies on the S1 Desk or the personnel board.
// Run with the automatic awards: daily and when an after-action report is filed.

/** After a denial, the same promotion isn't recommended again for this long. */
const DENIED_COOLDOWN_DAYS = 30;

const include = {
  qualifications: { include: { qualification: { select: { slug: true } } } },
  serviceRecords: { where: { type: "PROMOTION" }, orderBy: { createdAt: "desc" }, take: 1 },
} satisfies Prisma.UserInclude;

/** Active, ranked members and where they stand against the next rank. */
export async function promotionStatus(where: Prisma.UserWhereInput = {}, now = new Date()) {
  const users = await prisma.user.findMany({ where: { ...where, status: "ACTIVE", rank: { not: null } }, include });
  if (!users.length) return [];
  const attended = await prisma.attendance.groupBy({
    by: ["userId"],
    where: { status: "ATTENDING", event: { startTime: { lt: now } }, userId: { in: users.map((u) => u.id) } },
    _count: true,
  });
  const ops = new Map(attended.map((a) => [a.userId, a._count]));
  const reading = await readingProgress(users);
  return users.map((u) => ({
    u,
    path: career({
      rank: u.rank,
      since: u.rankSince ?? u.serviceRecords[0]?.createdAt ?? u.enlistedAt,
      enlistedAt: u.enlistedAt,
      opsAttended: ops.get(u.id) ?? 0,
      quals: heldSlugs(u.qualifications),
      reading: reading.get(u.id),
      now,
    }),
  }));
}

/** "Events attended 16/16, Days in the PMC 120/120, …" for the request's reason. */
function summary(path: Career) {
  const met = path.checks
    .filter((c) => c.detail !== "approval")
    .map((c) => (c.detail === "qualification" ? c.label : `${c.label} ${c.have}/${c.need}`));
  return `Meets every criterion for ${rankName(path.next?.abbr)}${met.length ? `: ${met.join(", ")}` : ""}.`;
}

/**
 * File a PROMOTION request for every eligible member who hasn't one pending,
 * and wasn't denied that same promotion recently. Returns the new request ids.
 */
export async function recommendPromotions(opts: { userIds?: string[]; now?: Date } = {}): Promise<string[]> {
  const now = opts.now ?? new Date();
  if (opts.userIds?.length === 0) return [];
  const eligible = (await promotionStatus(opts.userIds ? { id: { in: opts.userIds } } : {}, now)).filter((s) => s.path.eligible && s.path.next);
  if (!eligible.length) return [];

  const existing = await prisma.personnelRequest.findMany({
    where: {
      type: "PROMOTION",
      userId: { in: eligible.map((s) => s.u.id) },
      OR: [{ status: "PENDING" }, { status: "DENIED", decidedAt: { gte: new Date(now.getTime() - DENIED_COOLDOWN_DAYS * 864e5) } }],
    },
    select: { userId: true, status: true, payload: true },
  });

  const created: string[] = [];
  for (const { u, path } of eligible) {
    const want: PromotionPayload = { from: u.rank!, to: path.next!.abbr };
    const blocked = existing.some(
      (r) => r.userId === u.id && (r.status === "PENDING" || (r.payload as PromotionPayload).to === want.to),
    );
    if (blocked) continue;
    const req = await prisma.personnelRequest.create({ data: { userId: u.id, type: "PROMOTION", payload: want, reason: summary(path) } });
    created.push(req.id);
    const warning = await postRequest(req.id);
    if (warning) console.error(`[promotions] ${warning}`);
  }
  return created;
}
