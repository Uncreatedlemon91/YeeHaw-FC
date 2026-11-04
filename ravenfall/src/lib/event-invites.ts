import type { Prisma } from "@prisma/client";
import { RECRUIT_RANK, SQUADS } from "@/config/unit";
import { prisma } from "./prisma";

// Who an event is for. An event lists the squads it invites; none listed
// means the whole unit. Members of an invited squad, and whoever created the
// event, may RSVP; everyone in the unit can still read it.
//
// Members can also be invited by name (invitedUserIds): a course invites
// those who need its qualification, whatever their squad.
//
// An event can also be open to recruits (recruit nights, basic training):
// then Recruits (the first rank) and applicants with an application under
// review can open it and sign up too, even without unit access on the site.

type EventLike = { invitedSquads: string[]; createdById: string | null; openToRecruits: boolean; invitedUserIds?: string[] };
export type InviteMember = { id: string; squad: string | null; recruit: boolean };

/** The invited squads that still exist, in ORBAT order. Empty: the whole unit. */
export function invitedSquads(e: Pick<EventLike, "invitedSquads">): string[] {
  return SQUADS.map((s) => s.name).filter((n) => e.invitedSquads.includes(n));
}

export const isWholeUnit = (e: Pick<EventLike, "invitedSquads">) => invitedSquads(e).length === 0;

export function isInvited(e: EventLike, m: InviteMember): boolean {
  if (e.openToRecruits && m.recruit) return true;
  if (e.invitedUserIds?.includes(m.id)) return true;
  if (isWholeUnit(e) || e.createdById === m.id) return true;
  return !!m.squad && invitedSquads(e).includes(m.squad);
}

/** "Whole unit", "Alpha, Bravo", "Bravo + recruits". */
export function invitedLabel(e: Pick<EventLike, "invitedSquads" | "openToRecruits">): string {
  const who = isWholeUnit(e) ? "Whole unit" : invitedSquads(e).join(", ");
  return e.openToRecruits ? `${who} + recruits` : who;
}

/** Events this member is invited to, for lists of what's coming up. */
export function invitedWhere(m: InviteMember): Prisma.EventWhereInput {
  return {
    OR: [
      { invitedSquads: { isEmpty: true } },
      { createdById: m.id },
      ...(m.squad ? [{ invitedSquads: { has: m.squad } }] : []),
      ...(m.recruit ? [{ openToRecruits: true }] : []),
      { invitedUserIds: { has: m.id } },
    ],
  };
}

/** The members an event counts its strength against (applicants aren't counted). */
export function inviteeWhere(e: EventLike): Prisma.UserWhereInput {
  if (isWholeUnit(e)) return { status: "ACTIVE" };
  const or: Prisma.UserWhereInput[] = [{ squad: { in: invitedSquads(e) } }];
  if (e.openToRecruits) or.push({ rank: RECRUIT_RANK });
  if (e.invitedUserIds?.length) or.push({ id: { in: e.invitedUserIds } });
  return { status: "ACTIVE", OR: or };
}

/**
 * A recruit, for events open to recruits: an active member still at the
 * first rank, or anyone whose application is under review.
 */
export async function inviteMember(userId: string): Promise<InviteMember | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, squad: true, rank: true, status: true, applications: { where: { status: "PENDING" }, select: { id: true }, take: 1 } },
  });
  if (!u) return null;
  const recruit = (u.status === "ACTIVE" && u.rank === RECRUIT_RANK) || u.applications.length > 0;
  return { id: u.id, squad: u.squad, recruit };
}
