import type { SignupStatus } from "@prisma/client";
import { addDays, validDay, weekdayOf } from "./recurrence";

// Availability, with no database (port of the logic in matchweek.py and
// availability.html): a player's usual nights, dates they are away, and the
// night-by-night grid for the squad. Days are yyyy-mm-dd in club time, and
// weekdays run Monday = 0 like AvailabilityPattern.days ("1010100": Mon, Wed, Fri).

export const MAX_AWAY_DAYS = 120;
export const MAX_NOTE = 140;
export const GRID_DAYS = 14;

export type Away = { startsOn: string; endsOn: string };
export type DayState = "free" | "busy" | "away" | "unknown";

/** free / busy / away, or unknown when no usual nights are set. Being away beats the usual nights. */
export function dayState(days: string | null | undefined, aways: readonly Away[], day: string): DayState {
  if (aways.some((a) => a.startsOn <= day && day <= a.endsOn)) return "away";
  if (!days) return "unknown";
  return days[weekdayOf(day)] === "1" ? "free" : "busy";
}

/** The seven-character string for the nights ticked (0 = Monday). */
export function daysString(ticked: readonly number[]): { ok: true; value: string } | { ok: false; error: string } {
  if (ticked.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return { ok: false, error: "Those aren't days of the week." };
  const set = new Set(ticked);
  return { ok: true, value: Array.from({ length: 7 }, (_, d) => (set.has(d) ? "1" : "0")).join("") };
}

export function parseNote(raw: string): { ok: true; value: string | null } | { ok: false; error: string } {
  const note = raw.trim();
  return note.length > MAX_NOTE ? { ok: false, error: `Keep the note under ${MAX_NOTE} characters.` } : { ok: true, value: note || null };
}

/** Away dates, inclusive: a blank last day means one day. `today` is club-time today. */
export function parseAway(startsOn: string, endsOn: string, today: string): { ok: true; value: Away } | { ok: false; error: string; field: "startsOn" | "endsOn" } {
  if (!validDay(startsOn)) return { ok: false, field: "startsOn", error: "Give the first day you're away." };
  const end = endsOn.trim() || startsOn;
  if (!validDay(end)) return { ok: false, field: "endsOn", error: "That isn't a date." };
  if (end < startsOn) return { ok: false, field: "endsOn", error: "The last day can't be before the first." };
  if (end < today) return { ok: false, field: "endsOn", error: "Those dates have already passed." };
  if (addDays(startsOn, MAX_AWAY_DAYS - 1) < end) return { ok: false, field: "endsOn", error: `Enter at most ${MAX_AWAY_DAYS} days at a time.` };
  return { ok: true, value: { startsOn, endsOn: end } };
}

/** ISO week label, "2026-W44": the once-a-week key for the Monday nudge. */
export function isoWeek(day: string): string {
  // The Thursday of this week decides which year the week belongs to.
  const thursday = addDays(day, 3 - weekdayOf(day));
  const year = Number(thursday.slice(0, 4));
  const jan1 = `${year}-01-01`;
  const ordinal = Math.round((Date.parse(thursday) - Date.parse(jan1)) / 86_400_000);
  return `${year}-W${String(Math.floor(ordinal / 7) + 1).padStart(2, "0")}`;
}

export type GridState = DayState | "going" | "maybe" | "out";
export type GridPerson = { id: string };
export type Grid<P extends GridPerson> = { days: string[]; rows: (P & { cells: { state: GridState; answered: boolean }[]; patternSet: boolean })[]; counts: number[] };

/**
 * Who can play on each of the next nights. A fixture's own answer wins over
 * the pattern on its day: someone "free on Tuesdays" who said they can't make
 * this Tuesday's match is out, not free. (Being away still shows as away.)
 */
export function buildGrid<P extends GridPerson>(input: {
  people: readonly P[];
  start: string;
  days?: number;
  patterns: ReadonlyMap<string, string>;
  aways: ReadonlyMap<string, readonly Away[]>;
  /** day -> ids of the events that day. */
  eventsOn: ReadonlyMap<string, readonly string[]>;
  /** `${eventId}:${playerId}` -> the answer. */
  answers: ReadonlyMap<string, SignupStatus>;
}): Grid<P> {
  const n = input.days ?? GRID_DAYS;
  const days = Array.from({ length: n }, (_, i) => addDays(input.start, i));
  const counts = new Array<number>(n).fill(0);
  const rows = input.people.map((p) => {
    const pattern = input.patterns.get(p.id) ?? null;
    const cells = days.map((day, i) => {
      let state: GridState = dayState(pattern, input.aways.get(p.id) ?? [], day);
      let answer: SignupStatus | null = null;
      for (const eventId of input.eventsOn.get(day) ?? []) answer = input.answers.get(`${eventId}:${p.id}`) ?? answer;
      if (answer === "OUT") state = state === "away" ? "away" : "out";
      else if (answer) state = answer === "GOING" ? "going" : "maybe";
      if (state === "free" || state === "going") counts[i]++;
      return { state, answered: !!answer };
    });
    return { ...p, cells, patternSet: pattern !== null };
  });
  return { days, rows, counts };
}
