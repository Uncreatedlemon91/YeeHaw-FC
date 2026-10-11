import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { env } from "./env";

// All times are entered and displayed in the unit's timezone, so a server
// running in UTC and members spread across zones all agree on "20:00".

export function fmt(d: Date, pattern = "EEE d MMM yyyy, HH:mm zzz"): string {
  return formatInTimeZone(d, env.timezone, pattern);
}

export function fmtDate(d: Date): string {
  return formatInTimeZone(d, env.timezone, "d MMM yyyy");
}

/** Value for an <input type="datetime-local">, in unit time. */
export function toInput(d: Date | null | undefined): string {
  return d ? formatInTimeZone(d, env.timezone, "yyyy-MM-dd'T'HH:mm") : "";
}

/** Parse an <input type="datetime-local"> value as unit time. */
export function fromInput(s: string): Date | null {
  if (!s) return null;
  const d = fromZonedTime(s, env.timezone);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** yyyy-MM-dd of a date in unit time, for grouping into calendar days. */
export function dayKey(d: Date): string {
  return formatInTimeZone(d, env.timezone, "yyyy-MM-dd");
}

export function monthKey(d: Date): string {
  return formatInTimeZone(d, env.timezone, "yyyy-MM");
}

/** UTC instants bounding a unit-time month ("2026-10"). */
export function monthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number);
  const start = fromZonedTime(`${y}-${String(m).padStart(2, "0")}-01T00:00`, env.timezone);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const end = fromZonedTime(`${ny}-${String(nm).padStart(2, "0")}-01T00:00`, env.timezone);
  return { start, end };
}

/** Discord's own timestamp markup: renders in each reader's local time. */
export function discordTime(d: Date, style: "F" | "R" | "f" = "F"): string {
  return `<t:${Math.floor(d.getTime() / 1000)}:${style}>`;
}
