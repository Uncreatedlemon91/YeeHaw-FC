import type { Attendance, ObjectiveKind } from "@prisma/client";
import { keepsCleanSheet, type MatchLine } from "./service-record";

// Headline numbers and objective progress, from the recorded EA matches and
// the attendance staff mark. Pure, so the hub and the tests share it.

export type Totals = {
  apps: number;
  goals: number;
  assists: number;
  motm: number;
  cleanSheets: number;
  /** Mean of rated matches, one decimal; null when none were rated. */
  rating: number | null;
  best: number | null;
};

export function careerTotals(matches: readonly MatchLine[]): Totals {
  const rated = matches.map((m) => m.rating).filter((r): r is number => !!r);
  return {
    apps: matches.length,
    goals: matches.reduce((n, m) => n + (m.goals ?? 0), 0),
    assists: matches.reduce((n, m) => n + (m.assists ?? 0), 0),
    motm: matches.filter((m) => m.mom).length,
    cleanSheets: matches.filter(keepsCleanSheet).length,
    rating: rated.length ? Math.round((rated.reduce((a, b) => a + b, 0) / rated.length) * 10) / 10 : null,
    best: rated.length ? Math.max(...rated) : null,
  };
}

/** Matches played in [from, to). Undated matches belong to no window. */
export function matchesBetween(matches: readonly MatchLine[], from: Date, to: Date): MatchLine[] {
  return matches.filter((m) => m.playedAt && m.playedAt >= from && m.playedAt < to);
}

export type AttendanceRecord = { present: number; absent: number; excused: number; marked: number; reliability: number | null };

/**
 * Only marked events count. Excused absences are not held against the
 * player: reliability is present / (present + absent).
 */
export function attendanceRecord(marks: readonly (Attendance | null)[]): AttendanceRecord {
  const present = marks.filter((m) => m === "PRESENT").length;
  const absent = marks.filter((m) => m === "ABSENT").length;
  const excused = marks.filter((m) => m === "EXCUSED").length;
  const counted = present + absent;
  return { present, absent, excused, marked: present + absent + excused, reliability: counted ? Math.round((present / counted) * 100) : null };
}

export type Progress = { current: number | null; target: number; pct: number; met: boolean };

/** How far along an objective is, against the stats for the contract's window. */
export function objectiveProgress(
  kind: ObjectiveKind,
  target: number,
  stats: Totals,
  attendance: AttendanceRecord,
): Progress {
  const current: number | null = {
    APPEARANCES: stats.apps,
    GOALS: stats.goals,
    ASSISTS: stats.assists,
    AVG_RATING: stats.rating,
    ATTENDANCE: attendance.reliability,
    CLEAN_SHEETS: stats.cleanSheets,
    MOTM: stats.motm,
  }[kind];
  const pct = current == null || target <= 0 ? 0 : Math.min(100, Math.round((current / target) * 100));
  return { current, target, pct, met: current != null && current >= target };
}
