import type { SeasonState } from "@prisma/client";

// Season lifecycle rules, pure so they can be tested. The database enforces
// "one WINDOW and one ACTIVE season at a time" with a partial index; the
// daily job (season-job.ts) asks nextStep() what, if anything, is due.

export const SEASON_NEXT: Record<SeasonState, readonly SeasonState[]> = {
  // A first season can start without a window, since nobody is re-signing.
  DRAFT: ["WINDOW", "ACTIVE"],
  // Back to Draft only while nothing has been offered (checked where it runs).
  WINDOW: ["ACTIVE", "DRAFT"],
  ACTIVE: ["ENDED"],
  ENDED: [],
};

export function canTransition(from: SeasonState, to: SeasonState): boolean {
  return SEASON_NEXT[from].includes(to);
}

export const END_REMINDER_DAYS = 7;
/** How long after a season starts the squad announcement is still worth posting. */
export const ANNOUNCE_GRACE_DAYS = 3;
const DAY = 24 * 60 * 60 * 1000;

export type SeasonDates = { startsAt: Date; endsAt: Date; windowOpensAt: Date };

export function validateSeasonDates(d: SeasonDates): Partial<Record<keyof SeasonDates, string>> {
  const e: Partial<Record<keyof SeasonDates, string>> = {};
  if (d.endsAt <= d.startsAt) e.endsAt = "The season must end after it starts.";
  if (d.windowOpensAt > d.startsAt) e.windowOpensAt = "The window must open before the season starts.";
  return e;
}

export type JobSeason = {
  id: string;
  name: string;
  state: SeasonState;
  startsAt: Date;
  endsAt: Date;
  windowOpensAt: Date;
  startedAt: Date | null;
  announcedAt: Date | null;
  endReminderAt: Date | null;
};

export type JobStep =
  | { kind: "end-season"; seasonId: string }
  | { kind: "start-season"; seasonId: string }
  | { kind: "open-window"; seasonId: string }
  | { kind: "end-reminder"; seasonId: string }
  | { kind: "announce"; seasonId: string };

/**
 * The next thing due, or null. The runner applies it, reloads, and asks
 * again, so a season whose window, start and end have all passed catches up
 * in order. Ending comes before starting: one ACTIVE season at a time.
 */
export function nextStep(seasons: readonly JobSeason[], now: Date): JobStep | null {
  const active = seasons.find((s) => s.state === "ACTIVE");
  const inWindow = seasons.find((s) => s.state === "WINDOW");

  if (active && active.endsAt <= now) return { kind: "end-season", seasonId: active.id };

  const due = seasons
    .filter((s) => s.state === "WINDOW" && s.startsAt <= now && s.endsAt > now)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
  if (due && !active) return { kind: "start-season", seasonId: due.id };

  const opening = seasons
    .filter((s) => s.state === "DRAFT" && s.windowOpensAt <= now && s.startsAt > now)
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
  if (opening && !inWindow) return { kind: "open-window", seasonId: opening.id };

  if (active && !active.endReminderAt && active.endsAt.getTime() - END_REMINDER_DAYS * DAY <= now.getTime())
    return { kind: "end-reminder", seasonId: active.id };

  const fresh = seasons.find(
    (s) => s.state === "ACTIVE" && s.startedAt && !s.announcedAt && now.getTime() - s.startedAt.getTime() < ANNOUNCE_GRACE_DAYS * DAY,
  );
  if (fresh) return { kind: "announce", seasonId: fresh.id };
  return null;
}
