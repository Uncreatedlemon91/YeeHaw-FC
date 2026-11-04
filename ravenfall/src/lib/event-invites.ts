import type { Prisma } from "@prisma/client";
import { SQUADS } from "@/config/unit";

// Who an event is for. An event lists the squads it invites; none listed
// means the whole unit. Members of an invited squad, and whoever created the
// event, may RSVP; everyone can still read it.

type EventLike = { invitedSquads: string[]; createdById: string | null };
type Member = { id: string; squad: string | null };

/** The invited squads that still exist, in ORBAT order. Empty: the whole unit. */
export function invitedSquads(e: Pick<EventLike, "invitedSquads">): string[] {
  return SQUADS.map((s) => s.name).filter((n) => e.invitedSquads.includes(n));
}

export const isWholeUnit = (e: Pick<EventLike, "invitedSquads">) => invitedSquads(e).length === 0;

export function isInvited(e: EventLike, m: Member): boolean {
  if (isWholeUnit(e) || e.createdById === m.id) return true;
  return !!m.squad && invitedSquads(e).includes(m.squad);
}

/** "Whole unit" or "Alpha, Bravo". */
export const invitedLabel = (e: Pick<EventLike, "invitedSquads">) => (isWholeUnit(e) ? "Whole unit" : invitedSquads(e).join(", "));

/** Events this member is invited to, for lists of what's coming up. */
export function invitedWhere(m: Member): Prisma.EventWhereInput {
  return {
    OR: [{ invitedSquads: { isEmpty: true } }, { createdById: m.id }, ...(m.squad ? [{ invitedSquads: { has: m.squad } }] : [])],
  };
}

/** The members an event counts its strength against. */
export function inviteeWhere(e: EventLike): Prisma.UserWhereInput {
  return isWholeUnit(e) ? { status: "ACTIVE" } : { status: "ACTIVE", squad: { in: invitedSquads(e) } };
}
