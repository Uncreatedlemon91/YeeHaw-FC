import type { AttendanceStatus } from "@prisma/client";
import { SQUADS } from "@/config/unit";
import { invitedSquads, invitedWhere, inviteMember, isWholeUnit } from "./event-invites";
import { prisma } from "./prisma";
import { promotionStatus } from "./promotions";
import { monthKey, monthRange } from "./time";

// Retention numbers for the dashboard: a member's streak, month and service
// ribbon, how far off their next rank is, and how the squads are turning out.
// All read from attendance (the AAR's marks, or the RSVP before one is filed).

const DAY = 864e5;

export type Mark = "attended" | "excused" | "missed";
export type RibbonCell = { id: string; title: string; startTime: Date; mark: Mark };

/** How an event counts for a member: settled by the AAR, or still open (no AAR, no firm answer). */
function markOf(status: AttendanceStatus | undefined, debriefed: boolean): Mark | "open" {
  if (status === "ATTENDING") return "attended";
  if (status === "EXCUSED") return "excused";
  if (status === "ABSENT" || status === "NOSHOW") return "missed";
  return debriefed ? "missed" : "open";
}

export type ServiceStats = {
  /** Events attended in a row, most recent first; excused ones don't break it. */
  streak: number;
  best: number;
  opsThisMonth: number;
  /** Attended of settled events in the last 90 days, or null with none. */
  rate: number | null;
  /** The last dozen settled events, oldest first. */
  ribbon: RibbonCell[];
};

export async function serviceStats(userId: string, now = new Date()): Promise<ServiceStats> {
  const [member, user] = await Promise.all([inviteMember(userId), prisma.user.findUnique({ where: { id: userId }, select: { enlistedAt: true, createdAt: true } })]);
  const empty = { streak: 0, best: 0, opsThisMonth: 0, rate: null, ribbon: [] };
  if (!member || !user) return empty;
  const since = user.enlistedAt ?? user.createdAt;
  const events = await prisma.event.findMany({
    where: { AND: [{ startTime: { lt: now, gte: since } }, invitedWhere(member)] },
    orderBy: { startTime: "desc" },
    take: 80,
    select: { id: true, title: true, startTime: true, debrief: true, attendances: { where: { userId }, select: { status: true } } },
  });
  const settled = events
    .map((e) => ({ id: e.id, title: e.title, startTime: e.startTime, mark: markOf(e.attendances[0]?.status, !!e.debrief) }))
    .filter((e): e is RibbonCell => e.mark !== "open");

  let streak = 0;
  for (const e of settled) {
    if (e.mark === "missed") break;
    if (e.mark === "attended") streak++;
  }
  let best = 0;
  let run = 0;
  for (const e of [...settled].reverse()) {
    if (e.mark === "attended") best = Math.max(best, ++run);
    else if (e.mark === "missed") run = 0;
  }
  const { start } = monthRange(monthKey(now));
  const recent = settled.filter((e) => e.startTime.getTime() > now.getTime() - 90 * DAY && e.mark !== "excused");
  return {
    streak,
    best,
    opsThisMonth: settled.filter((e) => e.mark === "attended" && e.startTime >= start).length,
    rate: recent.length ? Math.round((recent.filter((e) => e.mark === "attended").length / recent.length) * 100) : null,
    ribbon: settled.slice(0, 12).reverse(),
  };
}

export type NextRank = {
  name: string;
  abbr: string;
  checks: { label: string; have: number; need: number; ok: boolean; detail?: string }[];
  /** Rough days until every measurable criterion is met at the member's recent pace; 0 if met; null if it can't be guessed. */
  etaDays: number | null;
  eligible: boolean;
  needsApproval: boolean;
};

/** Where the member stands against their next rank, with a rough ETA. */
export async function nextRank(userId: string, now = new Date()): Promise<NextRank | null> {
  const [s] = await promotionStatus({ id: userId }, now);
  const path = s?.path;
  const next = path?.next;
  if (!path || !next) return null;
  // Pace: events attended over the last eight weeks.
  const recent = await prisma.attendance.count({
    where: { userId, status: "ATTENDING", event: { startTime: { lt: now, gte: new Date(now.getTime() - 56 * DAY) } } },
  });
  const perDay = recent / 56;
  let eta: number | null = 0;
  for (const c of path.checks) {
    if (c.ok || c.detail === "approval") continue;
    if (c.label === "Events attended") eta = perDay > 0 && eta !== null ? Math.max(eta, Math.ceil((c.need - c.have) / perDay)) : null;
    else if (c.label.startsWith("Days")) eta = eta === null ? null : Math.max(eta, c.need - c.have);
    else eta = null; // a qualification or reading: no clock on that
  }
  return {
    name: next.name,
    abbr: next.abbr,
    checks: path.checks,
    etaDays: eta,
    eligible: path.eligible,
    needsApproval: path.needsApproval,
  };
}

export type SquadStanding = { squad: string; callsign: string; members: number; attended: number; possible: number; rate: number | null };

/** Squads by turnout over the last 30 days: attended over invited, per member per event. */
export async function squadLeaderboard(now = new Date(), days = 30): Promise<SquadStanding[]> {
  const from = new Date(now.getTime() - days * DAY);
  const [events, members] = await Promise.all([
    prisma.event.findMany({
      where: { startTime: { gte: from, lt: now } },
      select: { invitedSquads: true, attendances: { where: { status: "ATTENDING", user: { status: "ACTIVE" } }, select: { user: { select: { squad: true } } } } },
    }),
    prisma.user.groupBy({ by: ["squad"], where: { status: "ACTIVE", squad: { not: null } }, _count: true }),
  ]);
  const size = new Map(members.map((m) => [m.squad!, m._count]));
  return SQUADS.filter((s) => (size.get(s.name) ?? 0) > 0)
    .map((s) => {
      const n = size.get(s.name)!;
      let attended = 0;
      let possible = 0;
      for (const e of events) {
        if (!isWholeUnit(e) && !invitedSquads(e).includes(s.name)) continue;
        possible += n;
        attended += e.attendances.filter((a) => a.user.squad === s.name).length;
      }
      return { squad: s.name, callsign: s.callsign, members: n, attended, possible, rate: possible ? Math.round((Math.min(attended, possible) / possible) * 100) : null };
    })
    .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || b.attended - a.attended);
}

/** The month's most present members. */
export async function topThisMonth(now = new Date(), take = 5) {
  const { start } = monthRange(monthKey(now));
  const rows = await prisma.attendance.groupBy({
    by: ["userId"],
    where: { status: "ATTENDING", event: { startTime: { gte: start, lt: now } }, user: { status: "ACTIVE" } },
    _count: true,
    orderBy: { _count: { userId: "desc" } },
    take,
  });
  const users = await prisma.user.findMany({ where: { id: { in: rows.map((r) => r.userId) } } });
  const byId = new Map(users.map((u) => [u.id, u]));
  return rows.flatMap((r) => (byId.has(r.userId) ? [{ user: byId.get(r.userId)!, count: r._count }] : []));
}
