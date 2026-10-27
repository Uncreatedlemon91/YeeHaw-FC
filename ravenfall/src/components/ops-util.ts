import { formatInTimeZone } from "date-fns-tz";
import { dayKey } from "@/lib/time";

/** Whole unit-time days from today to the event date (negative = past). */
export function dayDiff(d: Date, now = new Date()): number {
  const [a, b] = [dayKey(d), dayKey(now)].map((k) => {
    const [y, m, dd] = k.split("-").map(Number);
    return Date.UTC(y, m - 1, dd) / 864e5;
  });
  return a - b;
}

/** "Today", "Tomorrow", "in 3d", "Yesterday", "5d ago". */
export function relDay(d: Date, now = new Date()): string {
  const n = dayDiff(d, now);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  return n > 0 ? `in ${n}d` : `${-n}d ago`;
}

/** Military date-time group in UTC, e.g. "141830Z OCT 26". */
export function dtg(d: Date): string {
  return formatInTimeZone(d, "UTC", "ddHHmm'Z' MMM yy").toUpperCase();
}

/** Deterministic operation number from date + id, e.g. "26-417". */
export function opNumber(id: string, d: Date): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `${formatInTimeZone(d, "UTC", "yy")}-${String(100 + (h % 900))}`;
}
