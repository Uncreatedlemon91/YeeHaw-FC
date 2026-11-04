import { rankName } from "@/config/unit";
import { RESERVED_AWARD_SLUGS } from "./awards";
import { hasPerm, type Perm } from "./permissions";
import { prisma } from "./prisma";
import { blockers, expiringSoon, expiryFor, heldSlugs, isCurrent } from "./qual-rules";

// Qualifications are skills; their manuals live in the Library, one UNIT
// document each in this folder, linked through the existing relation.

export const MANUALS_FOLDER = "Qualification manuals";

/** The manuals folder, created on first use. */
export async function ensureManualsFolder() {
  const found = await prisma.libraryFolder.findFirst({ where: { name: MANUALS_FOLDER, parentId: null }, orderBy: { createdAt: "asc" } });
  return found ?? prisma.libraryFolder.create({ data: { name: MANUALS_FOLDER, clearance: "UNIT" } });
}

/** The library document holding a qualification's manual, if it has one. */
export async function manualFor(qualificationId: string) {
  const docs = await prisma.libraryDocument.findMany({
    where: { qualifications: { some: { id: qualificationId } } },
    select: { slug: true, folder: { select: { name: true, parentId: true } } },
    orderBy: { createdAt: "asc" },
  });
  return docs.find((d) => d.folder?.name === MANUALS_FOLDER && !d.folder.parentId) ?? docs[0] ?? null;
}

/** A qualification slug that no award or /vault route already uses (awards win /vault/<slug>). */
export async function freeQualificationSlug(base: string) {
  const taken = async (s: string) =>
    RESERVED_AWARD_SLUGS.has(s) ||
    !!(await prisma.qualification.findUnique({ where: { slug: s }, select: { id: true } })) ||
    !!(await prisma.award.findUnique({ where: { slug: s }, select: { id: true } }));
  let slug = base || "qualification";
  for (let n = 2; await taken(slug); n++) slug = `${base || "qualification"}-${n}`;
  return slug;
}

/** Library manual slug per qualification id, for linking skill badges. */
export async function manualSlugs(qualificationIds: string[]) {
  const out = new Map<string, string>();
  if (!qualificationIds.length) return out;
  const docs = await prisma.libraryDocument.findMany({
    where: { qualifications: { some: { id: { in: qualificationIds } } } },
    select: { slug: true, qualifications: { select: { id: true } } },
    orderBy: { createdAt: "desc" },
  });
  // Oldest wins when several documents are linked, matching manualFor.
  for (const d of docs) for (const q of d.qualifications) out.set(q.id, d.slug);
  return out;
}

// --- Certifying ----------------------------------------------------------- //

/** Who may certify: instructors (and Command), or a current holder where the qualification allows it. */
export async function canCertify(certifier: { id: string; perms: readonly Perm[] }, q: { id: string; holdersCanCertify: boolean }) {
  if (hasPerm(certifier.perms, "INSTRUCTOR")) return true;
  if (!q.holdersCanCertify || !hasPerm(certifier.perms, "OPERATOR")) return false;
  const mine = await prisma.userQualification.findUnique({ where: { userId_qualificationId: { userId: certifier.id, qualificationId: q.id } } });
  return !!mine && isCurrent(mine);
}

export type CertifyResult = { ok: true; renewed: boolean; title: string } | { ok: false; error: string };

/**
 * Certify (or recertify) a member: checks prerequisites, minimum rank and
 * that every assessment task was passed, sets the expiry, and writes the
 * service record. The certifier's permission is the caller's to check.
 */
export async function certify(opts: {
  userId: string;
  qualificationId: string;
  byId: string;
  /** Tasks the assessor checked off. All of the qualification's are required unless `course` is set. */
  passed?: string[];
  /** Certified by passing a course (an event's AAR) rather than a checklist. */
  course?: { id: string; title: string };
  note?: string | null;
}): Promise<CertifyResult> {
  const [q, member] = await Promise.all([
    prisma.qualification.findUnique({ where: { id: opts.qualificationId }, include: { prerequisites: { select: { slug: true, title: true } } } }),
    prisma.user.findUnique({ where: { id: opts.userId }, include: { qualifications: { include: { qualification: { select: { slug: true } } } } } }),
  ]);
  if (!q) return { ok: false, error: "That qualification no longer exists." };
  if (!member) return { ok: false, error: "Member not found." };
  if (!q.active) return { ok: false, error: `${q.title} is retired.` };
  const existing = member.qualifications.find((h) => h.qualificationId === q.id);
  if (existing && isCurrent(existing) && !expiringSoon(existing)) return { ok: false, error: `They already hold ${q.title}.` };
  const stop = blockers(q, { rank: member.rank, held: heldSlugs(member.qualifications) }, rankName);
  if (stop.length) return { ok: false, error: `${stop.join("; ")}.` };
  const passed = (opts.passed ?? []).filter((t) => q.tasks.includes(t));
  if (!opts.course && passed.length < q.tasks.length) return { ok: false, error: `Check off every task (${passed.length} of ${q.tasks.length}).` };

  const now = new Date();
  const expiresAt = expiryFor(q.validDays, now);
  const notes = [
    opts.course ? `Passed the course: ${opts.course.title}.` : q.tasks.length ? `Assessed on ${q.tasks.length} task${q.tasks.length === 1 ? "" : "s"}: ${q.tasks.join("; ")}.` : null,
    opts.note?.trim() || null,
  ]
    .filter(Boolean)
    .join("\n");
  const renewed = !!existing;
  await prisma.$transaction([
    prisma.userQualification.upsert({
      where: { userId_qualificationId: { userId: member.id, qualificationId: q.id } },
      create: { userId: member.id, qualificationId: q.id, awardedById: opts.byId, awardedAt: now, expiresAt, notes: notes || null },
      update: { awardedById: opts.byId, awardedAt: now, expiresAt, notes: notes || null },
    }),
    prisma.serviceRecord.create({
      data: {
        userId: member.id,
        type: "QUALIFICATION",
        title: `${renewed ? "Recertified" : "Qualified"}: ${q.title}`,
        description: [
          `Certified against version ${q.version}${opts.course ? ` on ${opts.course.title}` : ""}.`,
          expiresAt ? `Valid until ${expiresAt.toISOString().slice(0, 10)}.` : null,
          opts.note?.trim() || null,
        ]
          .filter(Boolean)
          .join(" "),
        issuedById: opts.byId,
      },
    }),
  ]);
  return { ok: true, renewed, title: q.title };
}
