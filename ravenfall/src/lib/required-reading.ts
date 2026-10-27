import type { LibraryDocument, User } from "@prisma/client";
import { rankIndex } from "@/config/unit";
import { env } from "./env";
import { canRead, clearanceLevel, type Viewer } from "./library";
import { hasPerm } from "./permissions";
import { heldRoles, isLeader, leads } from "./personnel";
import { prisma } from "./prisma";

// Required reading: which documents a member has to read, and whether they
// have. A document is required of a member when it is switched on and the
// member matches any one of its targets (they are additive). Only ACTIVE
// members are ever asked, and only for documents they are cleared to read.

export type DocTargets = Pick<
  LibraryDocument,
  "required" | "requiredEveryone" | "requiredMinRank" | "requiredRanks" | "requiredRoles" | "requiredSquads"
>;

export type Reader = Pick<User, "id" | "discordId" | "status" | "rank" | "unitRole" | "secondaryRoles" | "squad">;

/** Whether the document's targets include this member (ignores status and clearance). */
export function isTargeted(doc: DocTargets, user: Reader): boolean {
  if (!doc.required) return false;
  if (doc.requiredEveryone) return true;
  if (user.rank && doc.requiredRanks.includes(user.rank)) return true;
  if (doc.requiredMinRank && user.rank && rankIndex(user.rank) >= rankIndex(doc.requiredMinRank)) return true;
  if (heldRoles(user).some((r) => doc.requiredRoles.includes(r))) return true;
  return !!user.squad && doc.requiredSquads.includes(user.squad);
}

/**
 * The tier a member is cleared for, worked out from the database alone
 * (their live Discord permissions aren't known here): any active member is
 * Unit, squad leadership is Leadership, and Command is whoever ADMIN_USER_IDS
 * names. Someone signed in is judged by their real permissions instead (see
 * viewerLevel in library.ts), so an instructor's own pages can differ slightly.
 */
export function memberLevel(user: Reader): number {
  if (env.adminUserIds.includes(user.discordId)) return clearanceLevel("COMMAND");
  if (isLeader(user)) return clearanceLevel("LEADERSHIP");
  return user.status === "ACTIVE" ? clearanceLevel("UNIT") : clearanceLevel("PUBLIC");
}

/** Whether `doc` is required of `user` right now: active, targeted and cleared. */
export function isRequiredOf(doc: DocTargets & { clearance: LibraryDocument["clearance"] }, user: Reader, level = memberLevel(user)) {
  return user.status === "ACTIVE" && clearanceLevel(doc.clearance) <= level && isTargeted(doc, user);
}

export type ReadingDoc = Pick<
  LibraryDocument,
  "id" | "slug" | "title" | "clearance" | "ackVersion" | "required" | "requiredEveryone" | "requiredMinRank" | "requiredRanks" | "requiredRoles" | "requiredSquads"
>;

const READING_SELECT = {
  id: true,
  slug: true,
  title: true,
  clearance: true,
  ackVersion: true,
  required: true,
  requiredEveryone: true,
  requiredMinRank: true,
  requiredRanks: true,
  requiredRoles: true,
  requiredSquads: true,
} as const;

/** Every document currently switched on as required reading. */
export function requiredDocs(): Promise<ReadingDoc[]> {
  return prisma.libraryDocument.findMany({ where: { required: true }, select: READING_SELECT, orderBy: { title: "asc" } });
}

export type ReadingItem = { doc: ReadingDoc; acknowledgedAt: Date | null };

/** Everything required of one member, each with when they acknowledged it (null = outstanding). */
export async function readingFor(user: Reader, level = memberLevel(user)): Promise<ReadingItem[]> {
  if (user.status !== "ACTIVE") return [];
  const docs = (await requiredDocs()).filter((d) => isRequiredOf(d, user, level));
  if (!docs.length) return [];
  const acks = await prisma.libraryAcknowledgement.findMany({ where: { userId: user.id, documentId: { in: docs.map((d) => d.id) } } });
  return docs.map((doc) => ({
    doc,
    acknowledgedAt: acks.find((a) => a.documentId === doc.id && a.ackVersion === doc.ackVersion)?.acknowledgedAt ?? null,
  }));
}

/** Documents a member still has to acknowledge. */
export async function outstandingFor(user: Reader, level = memberLevel(user)): Promise<ReadingDoc[]> {
  return (await readingFor(user, level)).filter((r) => !r.acknowledgedAt).map((r) => r.doc);
}

/** Required / acknowledged counts per member, for the promotion checklist. */
export async function readingProgress(users: Reader[], levelOf: (u: Reader) => number = memberLevel) {
  const out = new Map<string, { total: number; done: number }>();
  const docs = await requiredDocs();
  if (!docs.length) return out;
  const acks = await prisma.libraryAcknowledgement.findMany({
    where: { documentId: { in: docs.map((d) => d.id) }, userId: { in: users.map((u) => u.id) } },
    select: { userId: true, documentId: true, ackVersion: true },
  });
  const acked = new Set(acks.map((a) => `${a.userId}|${a.documentId}|${a.ackVersion}`));
  for (const u of users) {
    const mine = docs.filter((d) => isRequiredOf(d, u, levelOf(u)));
    out.set(u.id, { total: mine.length, done: mine.filter((d) => acked.has(`${u.id}|${d.id}|${d.ackVersion}`)).length });
  }
  return out;
}

/** Active members the document is (newly) required of, for Discord DMs and compliance. */
export async function targetedMembers(doc: ReadingDoc) {
  const members = await prisma.user.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, discordId: true, status: true, rank: true, unitRole: true, secondaryRoles: true, squad: true, callsign: true, discordUsername: true },
  });
  return members.filter((m) => isRequiredOf(doc, m));
}

// --- Compliance ---------------------------------------------------------- //

/** ADMIN and INSTRUCTOR see every member; squad leadership sees the squads it leads. */
export function canSeeCompliance(viewer: Viewer | null): boolean {
  return !!viewer && (hasPerm(viewer.perms, "INSTRUCTOR") || isLeader(viewer.user));
}

export type ComplianceRow = { member: Reader & { callsign: string | null; discordUsername: string }; acknowledgedAt: Date | null };

/**
 * For each required document the viewer may read: the members in their
 * scope it is required of, and when each acknowledged (null = outstanding).
 */
export async function complianceFor(viewer: Viewer) {
  if (!canSeeCompliance(viewer)) return [];
  const all = hasPerm(viewer.perms, "INSTRUCTOR");
  const docs = (await requiredDocs()).filter((d) => canRead(viewer, d.clearance));
  if (!docs.length) return [];
  const members = (
    await prisma.user.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, discordId: true, status: true, rank: true, unitRole: true, secondaryRoles: true, squad: true, callsign: true, discordUsername: true },
      orderBy: [{ squad: "asc" }, { callsign: "asc" }],
    })
  ).filter((m) => all || leads(viewer.user, m.squad));
  const acks = await prisma.libraryAcknowledgement.findMany({
    where: { documentId: { in: docs.map((d) => d.id) }, userId: { in: members.map((m) => m.id) } },
    select: { userId: true, documentId: true, ackVersion: true, acknowledgedAt: true },
  });
  return docs.map((doc) => ({
    doc,
    rows: members
      .filter((m) => isRequiredOf(doc, m))
      .map<ComplianceRow>((member) => ({
        member,
        acknowledgedAt: acks.find((a) => a.userId === member.id && a.documentId === doc.id && a.ackVersion === doc.ackVersion)?.acknowledgedAt ?? null,
      })),
  }));
}
