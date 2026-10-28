import { Prisma, type Event, type SuggestionStatus } from "@prisma/client";
import { SESSION_TYPES } from "@/config/club";
import { refreshAnnouncement, type Actor, type R } from "./events";
import { eventSlots } from "./event-rules";
import { prisma } from "./prisma";
import { myPosition, parsePlan, parseReview, parseReply, parseSuggestion, sortSuggestions } from "./training-rules";

// Training sessions and suggestions against the database (port of
// proclubs/training.py). Sessions are events of type TRAINING / THEORY, so
// they already have sign-ups, a formation, attendance and the Discord
// announcement; this adds the plan on top. A suggestion is seen by staff and
// by the player who made it, nobody else.

const fail = (error: string, fieldErrors?: Record<string, string>) => ({ ok: false as const, error, fieldErrors });

export const isSession = (e: Pick<Event, "type">) => SESSION_TYPES.includes(e.type);

export async function upcomingSessions(now = new Date(), take = 10) {
  return prisma.event.findMany({
    where: { type: { in: [...SESSION_TYPES] }, startsAt: { gte: now } },
    orderBy: { startsAt: "asc" },
    take,
    include: { _count: { select: { signups: { where: { status: "GOING" } } } } },
  });
}

export async function recentSessions(now = new Date(), take = 6) {
  return prisma.event.findMany({
    where: { type: { in: [...SESSION_TYPES] }, startsAt: { lt: now } },
    orderBy: { startsAt: "desc" },
    take,
  });
}

export async function savePlan(eventId: string, input: { objective: string; plan: string; briefs: Record<string, string> }): Promise<R> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return fail("That event no longer exists.");
  if (!isSession(event)) return fail("Only training and theory sessions have a plan.");
  const parsed = parsePlan(input, eventSlots(event.formation));
  if (!parsed.ok) return fail(parsed.error, parsed.field ? { [parsed.field]: parsed.error } : undefined);
  const { objective, plan, briefs } = parsed.value;
  await prisma.event.update({
    where: { id: eventId },
    data: { sessionObjective: objective, sessionPlan: plan, roleBriefs: Object.keys(briefs).length ? briefs : Prisma.JsonNull },
  });
  // The announcement carries the plan, so it is brought up to date too.
  const w = await refreshAnnouncement(eventId);
  return { ok: true, warnings: w ? [w] : [] };
}

export async function saveReview(eventId: string, raw: string, actor: Actor, now = new Date()): Promise<R> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return fail("That event no longer exists.");
  if (!isSession(event)) return fail("Only training and theory sessions have a review.");
  const parsed = parseReview(raw, event.startsAt, now);
  if (!parsed.ok) return fail(parsed.error, parsed.field ? { [parsed.field]: parsed.error } : undefined);
  await prisma.event.update({ where: { id: eventId }, data: { sessionReview: parsed.value, sessionReviewedBy: parsed.value ? actor.name : null } });
  return { ok: true, warnings: [] };
}

/** This player's position for a session, for "your brief" on the event page. */
export async function positionFor(event: Pick<Event, "id" | "lineupPublishedAt">, playerId: string): Promise<string | null> {
  const [sheet, signup] = await Promise.all([
    event.lineupPublishedAt ? prisma.eventLineup.findUnique({ where: { eventId_playerId: { eventId: event.id, playerId } } }) : null,
    prisma.eventSignup.findUnique({ where: { eventId_playerId: { eventId: event.id, playerId } } }),
  ]);
  return myPosition({ sheetPublished: !!event.lineupPublishedAt, sheetSlot: sheet?.slotKey ?? null, claimedSlot: signup?.slotKey ?? null });
}

// --- Suggestions --------------------------------------------------------------- //

export async function addSuggestion(playerId: string, raw: string): Promise<R> {
  const parsed = parseSuggestion(raw);
  if (!parsed.ok) return fail(parsed.error, parsed.field ? { [parsed.field]: parsed.error } : undefined);
  await prisma.trainingSuggestion.create({ data: { playerId, body: parsed.value } });
  return { ok: true, warnings: [] };
}

/** Everyone's for staff (playerId null), else only that player's. */
export async function listSuggestions(playerId: string | null) {
  const rows = await prisma.trainingSuggestion.findMany({ where: playerId ? { playerId } : {}, include: { player: { select: { displayName: true, slug: true } } } });
  return sortSuggestions(rows);
}

export async function replyToSuggestion(id: string, status: string, note: string, actor: Actor): Promise<R> {
  const parsed = parseReply(status, note);
  if (!parsed.ok) return fail(parsed.error, parsed.field ? { [parsed.field]: parsed.error } : undefined);
  const r = await prisma.trainingSuggestion.updateMany({ where: { id }, data: { status: parsed.value.status as SuggestionStatus, staffNote: parsed.value.note, handledBy: actor.name } });
  return r.count ? { ok: true, warnings: [] } : fail("That suggestion no longer exists.");
}
