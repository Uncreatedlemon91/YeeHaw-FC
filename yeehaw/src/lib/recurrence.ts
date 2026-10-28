import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

// Recurring event series, as pure date maths (no database). A series says
// "these weekdays at this wall-clock time in this timezone"; each occurrence
// is an ordinary Event row generated ahead of time (src/lib/event-series.ts).
//
// Days are yyyy-mm-dd strings in the series' own timezone and are only ever
// stepped as calendar days; the instant for "20:00 that day" is worked out
// per day with the zone's rules for THAT date, so a series keeps meeting at
// 20:00 local when the clocks change (its UTC time moves by an hour, which
// is the point). Weekdays are 0 = Monday ... 6 = Sunday, as everywhere else
// (AvailabilityPattern.days, WEEKDAYS).

export type SeriesRule = {
  weekdays: readonly number[];
  /** "20:00", wall-clock time in `timezone`. */
  timeOfDay: string;
  timezone: string;
  /** First day it can occur on, and optionally the last. */
  startsOn: string;
  endsOn?: string | null;
};

const DAY_MS = 86_400_000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const ms = (day: string) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10));

export function validDay(s: string): boolean {
  return DAY_RE.test(s) && formatDay(ms(s)) === s;
}
export const validTime = (s: string) => TIME_RE.test(s);

export function validTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const formatDay = (t: number) => new Date(t).toISOString().slice(0, 10);

export const addDays = (day: string, n: number) => formatDay(ms(day) + n * DAY_MS);

/** 0 = Monday ... 6 = Sunday. */
export const weekdayOf = (day: string) => (new Date(ms(day)).getUTCDay() + 6) % 7;

/** Today's date in a timezone. */
export const todayIn = (timezone: string, now: Date = new Date()) => formatInTimeZone(now, timezone, "yyyy-MM-dd");

/**
 * The UTC instant of "timeOfDay on day" in `timezone`. A wall-clock time the
 * zone skips (02:30 on the night clocks go forward) lands an hour later, like
 * the night's other times do, instead of an hour early.
 */
export function instantOn(day: string, timeOfDay: string, timezone: string): Date {
  const at = fromZonedTime(`${day}T${timeOfDay}:00`, timezone);
  return formatInTimeZone(at, timezone, "HH:mm") === timeOfDay ? at : new Date(at.getTime() + 3_600_000);
}

/** Every occurrence from `from` to `through` (inclusive days), within the series' own span. Oldest first. */
export function occurrences(rule: SeriesRule, from: string, through: string): Date[] {
  const start = from > rule.startsOn ? from : rule.startsOn;
  const end = rule.endsOn && rule.endsOn < through ? rule.endsOn : through;
  const days = new Set(rule.weekdays);
  const out: Date[] = [];
  // Bounded: a typo'd year shouldn't spin forever.
  for (let day = start, n = 0; day <= end && n < 800; day = addDays(day, 1), n++) {
    if (days.has(weekdayOf(day))) out.push(instantOn(day, rule.timeOfDay, rule.timezone));
  }
  return out;
}

/**
 * The days a generation run should cover: from the day after the last run
 * (or today, the first time) through `aheadDays` from today. Null when it is
 * already caught up or the series is over.
 */
export function generationRange(
  rule: SeriesRule,
  opts: { generatedThrough: string | null; aheadDays: number; now?: Date },
): { from: string; through: string } | null {
  const today = todayIn(rule.timezone, opts.now);
  const from = opts.generatedThrough ? addDays(opts.generatedThrough, 1) : today;
  const through = addDays(today, opts.aheadDays);
  return from > through ? null : { from, through };
}

export type ExistingOccurrence = { id: string; startsAt: Date; hasSignups: boolean };
export type Reconciliation = {
  /** Already at a wanted time: rewrite their fields from the series. */
  update: string[];
  /** No longer wanted and nobody has answered: delete. */
  remove: string[];
  /** No longer wanted but people have answered: leave as one-off events. */
  detach: string[];
  /** Wanted times with no event yet. */
  create: Date[];
};

/**
 * Editing a series: line its future, unstarted occurrences up with the times
 * it now wants. Anything somebody has already answered is never deleted.
 */
export function reconcile(existing: readonly ExistingOccurrence[], wanted: readonly Date[]): Reconciliation {
  const want = new Set(wanted.map((d) => d.getTime()));
  const have = new Set(existing.map((e) => e.startsAt.getTime()));
  const r: Reconciliation = { update: [], remove: [], detach: [], create: wanted.filter((d) => !have.has(d.getTime())) };
  for (const e of existing) {
    if (want.has(e.startsAt.getTime())) r.update.push(e.id);
    else (e.hasSignups ? r.detach : r.remove).push(e.id);
  }
  return r;
}
