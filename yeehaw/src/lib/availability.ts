import { buildGrid, dayState, daysString, parseAway, parseNote, GRID_DAYS, type Away } from "./availability-rules";
import { dayKey } from "./time";
import { addDays, todayIn } from "./recurrence";
import { env } from "./env";
import { prisma } from "./prisma";
import { liveSquad } from "./squad";

// Availability against the database: a player's usual nights and away dates,
// and the squad grid. Players only ever write their own.

/** @db.Date column <-> "yyyy-mm-dd". */
export const dayOf = (d: Date) => d.toISOString().slice(0, 10);
export const dateOf = (day: string) => new Date(`${day}T00:00:00Z`);

type Res = { ok: true } | { ok: false; error: string; field?: string };

export async function setPattern(playerId: string, ticked: number[], note: string): Promise<Res> {
  const days = daysString(ticked);
  if (!days.ok) return days;
  const n = parseNote(note);
  if (!n.ok) return { ...n, field: "note" };
  await prisma.availabilityPattern.upsert({
    where: { playerId },
    create: { playerId, days: days.value, note: n.value },
    update: { days: days.value, note: n.value },
  });
  return { ok: true };
}

export async function addAway(playerId: string, startsOn: string, endsOn: string, note: string, now = new Date()): Promise<Res> {
  const a = parseAway(startsOn, endsOn, todayIn(env.timezone, now));
  if (!a.ok) return a;
  const n = parseNote(note);
  if (!n.ok) return { ...n, field: "note" };
  await prisma.availabilityAway.create({ data: { playerId, startsOn: dateOf(a.value.startsOn), endsOn: dateOf(a.value.endsOn), note: n.value } });
  return { ok: true };
}

/** Removes one of the player's own away periods (never anybody else's). */
export async function deleteAway(playerId: string, id: string): Promise<Res> {
  const r = await prisma.availabilityAway.deleteMany({ where: { id, playerId } });
  return r.count ? { ok: true } : { ok: false, error: "That away period isn't yours to remove." };
}

export type AwayRow = { id: string; startsOn: string; endsOn: string; note: string | null };

export async function loadMine(playerId: string) {
  const today = todayIn(env.timezone);
  const [pattern, away] = await Promise.all([
    prisma.availabilityPattern.findUnique({ where: { playerId } }),
    prisma.availabilityAway.findMany({ where: { playerId, endsOn: { gte: dateOf(today) } }, orderBy: { startsOn: "asc" } }),
  ]);
  return {
    today,
    days: pattern?.days ?? null,
    note: pattern?.note ?? null,
    away: away.map((a): AwayRow => ({ id: a.id, startsOn: dayOf(a.startsOn), endsOn: dayOf(a.endsOn), note: a.note })),
  };
}

/** Who the grid is about: everyone under contract, then staff who aren't. */
export async function gridPeople() {
  const [squad, staff] = await Promise.all([
    liveSquad(),
    prisma.player.findMany({ where: { clubRole: { not: null } }, select: { id: true, slug: true, displayName: true } }),
  ]);
  const people = squad.map((e) => ({ id: e.playerId, slug: e.slug, name: e.name, status: e.squadStatus as string | null }));
  const have = new Set(people.map((p) => p.id));
  for (const s of staff) if (!have.has(s.id)) people.push({ id: s.id, slug: s.slug, name: s.displayName, status: null });
  return people;
}

/** The squad night by night for the next two weeks. */
export async function loadGrid(now = new Date()) {
  const start = todayIn(env.timezone, now);
  const people = await gridPeople();
  const ids = people.map((p) => p.id);
  const last = addDays(start, GRID_DAYS - 1);
  const [patterns, aways, events] = await Promise.all([
    prisma.availabilityPattern.findMany({ where: { playerId: { in: ids } } }),
    prisma.availabilityAway.findMany({ where: { playerId: { in: ids }, endsOn: { gte: dateOf(start) }, startsOn: { lte: dateOf(last) } } }),
    // A day's span in club time: the grid is about club-time nights.
    prisma.event.findMany({
      where: { startsAt: { gte: new Date(now.getTime() - 24 * 3600_000), lt: new Date(now.getTime() + (GRID_DAYS + 1) * 24 * 3600_000) } },
      select: { id: true, title: true, startsAt: true, signups: { where: { playerId: { in: ids } }, select: { playerId: true, status: true } } },
      orderBy: { startsAt: "asc" },
    }),
  ]);
  const awayBy = new Map<string, Away[]>();
  for (const a of aways) awayBy.set(a.playerId, [...(awayBy.get(a.playerId) ?? []), { startsOn: dayOf(a.startsOn), endsOn: dayOf(a.endsOn) }]);
  const eventsOn = new Map<string, string[]>();
  const titlesOn = new Map<string, { id: string; title: string }[]>();
  const answers = new Map<string, "GOING" | "MAYBE" | "OUT">();
  for (const e of events) {
    const day = dayKey(e.startsAt);
    eventsOn.set(day, [...(eventsOn.get(day) ?? []), e.id]);
    titlesOn.set(day, [...(titlesOn.get(day) ?? []), { id: e.id, title: e.title }]);
    for (const s of e.signups) answers.set(`${e.id}:${s.playerId}`, s.status);
  }
  const grid = buildGrid({ people, start, patterns: new Map(patterns.map((p) => [p.playerId, p.days])), aways: awayBy, eventsOn, answers });
  return { ...grid, eventsOn: titlesOn };
}

/** The ids of these players who are away on a club-time day. */
export async function awayOnDay(playerIds: string[], day: string): Promise<Set<string>> {
  if (!playerIds.length) return new Set();
  const rows = await prisma.availabilityAway.findMany({
    where: { playerId: { in: playerIds }, startsOn: { lte: dateOf(day) }, endsOn: { gte: dateOf(day) } },
    select: { playerId: true },
  });
  return new Set(rows.map((r) => r.playerId));
}

/** Each player's night state on one day, for the staff view of an event ("free", "busy", "away", "unknown"). */
export async function nightStates(playerIds: string[], day: string) {
  const [patterns, aways] = await Promise.all([
    prisma.availabilityPattern.findMany({ where: { playerId: { in: playerIds } } }),
    prisma.availabilityAway.findMany({ where: { playerId: { in: playerIds }, startsOn: { lte: dateOf(day) }, endsOn: { gte: dateOf(day) } } }),
  ]);
  const pat = new Map(patterns.map((p) => [p.playerId, p.days]));
  const away = new Set(aways.map((a) => a.playerId));
  return new Map(
    playerIds.map((id) => [id, away.has(id) ? ("away" as const) : dayState(pat.get(id) ?? null, [], day)]),
  );
}
