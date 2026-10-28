import type { EventSeries, Prisma } from "@prisma/client";
import { announceEvent, deleteEvent, type Actor, type R } from "./events";
import type { SeriesInput } from "./event-rules";
import { dateOf, dayOf } from "./availability";
import { addDays, generationRange, occurrences, reconcile, todayIn, type SeriesRule } from "./recurrence";
import { prisma } from "./prisma";

// Recurring series against the database. A series is a rule (weekdays, a
// wall-clock time and a timezone) that keeps ordinary Event rows generated
// ahead (four weeks by default), so everything else (RSVPs, reminders,
// attendance) treats them like any other event. The notify job extends every
// series each run; editing one rewrites its FUTURE, unstarted occurrences.

export const ruleOf = (s: EventSeries): SeriesRule => ({
  weekdays: s.weekdays,
  timeOfDay: s.timeOfDay,
  timezone: s.timezone,
  startsOn: dayOf(s.startsOn),
  endsOn: s.endsOn ? dayOf(s.endsOn) : null,
});

const lengthMs = (s: Pick<EventSeries, "durationMinutes">) => s.durationMinutes * 60_000;

/** The Event columns a series dictates. */
const occurrenceFields = (s: EventSeries) => ({
  title: s.title,
  type: s.type,
  opponent: s.opponent,
  description: s.description,
  formation: s.formation,
});

const eventData = (s: EventSeries, startsAt: Date): Prisma.EventCreateManyInput => ({
  ...occurrenceFields(s),
  startsAt,
  endsAt: new Date(startsAt.getTime() + lengthMs(s)),
  seriesId: s.id,
  createdById: s.createdById,
});

/**
 * Generate what is missing for one series: from the day after the last run
 * (or today) through `generateAheadDays`. Never creates a past occurrence,
 * and a second run the same day adds nothing. Returns how many were created.
 */
export async function generateSeries(series: EventSeries, now = new Date()): Promise<number> {
  if (!series.active) return 0;
  const range = generationRange(ruleOf(series), {
    generatedThrough: series.generatedThrough ? dayOf(series.generatedThrough) : null,
    aheadDays: series.generateAheadDays,
    now,
  });
  if (!range) return 0;
  const wanted = occurrences(ruleOf(series), range.from, range.through).filter((d) => d > now);
  const made = wanted.length ? await prisma.event.createMany({ data: wanted.map((d) => eventData(series, d)), skipDuplicates: true }) : { count: 0 };
  await prisma.eventSeries.update({ where: { id: series.id }, data: { generatedThrough: dateOf(range.through) } });
  return made.count;
}

/** Every active series, once. Used by the notify job. */
export async function generateAll(now = new Date()): Promise<{ series: string; created: number }[]> {
  const all = await prisma.eventSeries.findMany({ where: { active: true } });
  const out: { series: string; created: number }[] = [];
  for (const s of all) out.push({ series: s.title, created: await generateSeries(s, now) });
  return out;
}

const seriesData = (i: SeriesInput) => ({
  title: i.title,
  type: i.type,
  opponent: i.opponent,
  description: i.description,
  weekdays: i.weekdays,
  timeOfDay: i.timeOfDay,
  timezone: i.timezone,
  durationMinutes: i.durationMinutes,
  formation: i.formation,
  startsOn: dateOf(i.startsOn),
  endsOn: i.endsOn ? dateOf(i.endsOn) : null,
  announceDaysBefore: i.announceDaysBefore,
});

export async function createSeries(input: SeriesInput, actor: Actor, now = new Date()): Promise<R<{ series: EventSeries; created: number }>> {
  const series = await prisma.eventSeries.create({ data: { ...seriesData(input), createdById: actor.id } });
  const created = await generateSeries(series, now);
  return { ok: true, warnings: [], series, created };
}

/**
 * Edit a series and line its future occurrences up with it. Occurrences that
 * still fall on a wanted time are rewritten from the series (so per-event
 * edits to them are replaced); ones that no longer do are deleted if nobody
 * has answered and kept as one-off events if somebody has; new times are
 * added. Past and already-started events are never touched.
 */
export async function updateSeries(id: string, input: SeriesInput, now = new Date()): Promise<R<{ series: EventSeries; changed: { updated: number; removed: number; detached: number; created: number } }>> {
  const old = await prisma.eventSeries.findUnique({ where: { id } });
  if (!old) return { ok: false, error: "That series no longer exists." };
  const series = await prisma.eventSeries.update({ where: { id }, data: seriesData(input) });
  const today = todayIn(series.timezone, now);
  const through = addDays(today, series.generateAheadDays);
  const wanted = occurrences(ruleOf(series), today, through).filter((d) => d > now);
  const future = await prisma.event.findMany({ where: { seriesId: id, startsAt: { gt: now } }, include: { _count: { select: { signups: true } } } });
  const plan = reconcile(
    future.map((e) => ({ id: e.id, startsAt: e.startsAt, hasSignups: e._count.signups > 0 })),
    wanted,
  );

  const warnings: string[] = [];
  const byId = new Map(future.map((e) => [e.id, e]));
  const formationChanged = (old.formation ?? null) !== (series.formation ?? null);
  for (const eventId of plan.update) {
    const e = byId.get(eventId)!;
    await prisma.$transaction([
      prisma.event.update({ where: { id: eventId }, data: { ...occurrenceFields(series), endsAt: new Date(e.startsAt.getTime() + lengthMs(series)) } }),
      ...(formationChanged && (e.formation ?? null) !== (series.formation ?? null)
        ? [prisma.eventSignup.updateMany({ where: { eventId }, data: { slotKey: null } }), prisma.eventLineup.deleteMany({ where: { eventId } })]
        : []),
    ]);
  }
  for (const eventId of plan.remove) {
    const r = await deleteEvent(eventId);
    if (r.ok) warnings.push(...r.warnings);
  }
  if (plan.detach.length) await prisma.event.updateMany({ where: { id: { in: plan.detach } }, data: { seriesId: null } });
  if (plan.create.length) await prisma.event.createMany({ data: plan.create.map((d) => eventData(series, d)), skipDuplicates: true });
  await prisma.eventSeries.update({ where: { id }, data: { generatedThrough: dateOf(through) } });
  if (plan.detach.length) warnings.push(`${plan.detach.length} upcoming event${plan.detach.length === 1 ? " has" : "s have"} answers on a night the series no longer meets, so ${plan.detach.length === 1 ? "it was" : "they were"} kept as one-off events.`);
  return { ok: true, warnings, series, changed: { updated: plan.update.length, removed: plan.remove.length, detached: plan.detach.length, created: plan.create.length } };
}

/** Pause or resume. A paused series generates nothing new; what exists stays. */
export async function setSeriesActive(id: string, active: boolean, now = new Date()): Promise<R> {
  const s = await prisma.eventSeries.findUnique({ where: { id } });
  if (!s) return { ok: false, error: "That series no longer exists." };
  const updated = await prisma.eventSeries.update({ where: { id }, data: { active } });
  if (active) await generateSeries(updated, now);
  return { ok: true, warnings: [] };
}

/** Delete the series and its upcoming, unanswered occurrences. Answered ones stay as one-off events; the past is untouched. */
export async function deleteSeries(id: string, now = new Date()): Promise<R> {
  const s = await prisma.eventSeries.findUnique({ where: { id } });
  if (!s) return { ok: false, error: "That series no longer exists." };
  const future = await prisma.event.findMany({ where: { seriesId: id, startsAt: { gt: now } }, include: { _count: { select: { signups: true } } } });
  const warnings: string[] = [];
  for (const e of future.filter((e) => !e._count.signups)) {
    const r = await deleteEvent(e.id);
    if (r.ok) warnings.push(...r.warnings);
  }
  await prisma.eventSeries.delete({ where: { id } }); // Event.seriesId is SET NULL: the rest become one-offs
  return { ok: true, warnings };
}

/** Occurrences whose announcement is due: their series announces N days ahead and they haven't been posted. */
export async function announceDue(now = new Date()): Promise<{ title: string; error?: string }[]> {
  const soon = await prisma.event.findMany({
    where: { discordMessageId: null, startsAt: { gt: now }, series: { is: { announceDaysBefore: { not: null }, active: true } } },
    include: { series: { select: { announceDaysBefore: true } } },
    orderBy: { startsAt: "asc" },
  });
  const due = soon.filter((e) => e.startsAt.getTime() <= now.getTime() + (e.series!.announceDaysBefore ?? 0) * 86_400_000);
  const out: { title: string; error?: string }[] = [];
  for (const e of due) {
    const r = await announceEvent(e.id);
    out.push({ title: e.title, error: r.ok ? undefined : r.error });
    // No channel set: every other event would fail the same way.
    if (!r.ok) break;
  }
  return out;
}
