import type { Attendance, Captaincy, ContractState, ObjectiveKind, Position, SeasonState, SquadStatus } from "@prisma/client";
import type { SessionUser } from "./auth";
import { env } from "./env";
import { attendanceRecord, careerTotals, matchesBetween, objectiveProgress, type AttendanceRecord, type Progress, type Totals } from "./player-stats";
import { hasPerm } from "./permissions";
import { prisma } from "./prisma";
import { buildTimeline, canView, ribbons, type Entry, type MatchLine, type Ribbon, type Viewer } from "./service-record";

// Everything the player hub shows, with clearance applied HERE, before any of
// it reaches a page: a section the viewer may not see comes back null and the
// page draws a redaction bar. Hidden data is never loaded into the response.

export type HubViewer = Viewer & { isManagement: boolean; userId?: string; discordId?: string };

export function viewerOf(user: SessionUser | null, playerId: string): HubViewer {
  return {
    isSelf: !!user && user.id === playerId,
    isStaff: hasPerm(user?.perms, "STAFF"),
    isManagement: hasPerm(user?.perms, "MANAGEMENT"),
    userId: user?.id,
    discordId: user?.discordId,
  };
}

export type ContractRow = {
  id: string;
  seasonId: string;
  seasonName: string;
  seasonState: SeasonState;
  seasonStartsAt: Date;
  state: ContractState;
  shirtNumber: number | null;
  squadStatus: SquadStatus;
  position: Position | null;
  secondaryPosition: Position | null;
  captaincy: Captaincy;
  /** Private: player and staff. */
  objectives: { kind: ObjectiveKind; target: number }[] | null;
  offeredAt: Date | null;
  respondedAt: Date | null;
  endedAt: Date | null;
  releaseNote: string | null;
  /** Staff only: why the Discord roles weren't granted. */
  roleError: string | null;
};

export type AttendanceView = {
  record: AttendanceRecord;
  recent: { id: string; title: string; startsAt: Date; attendance: Attendance }[];
  usualNights: string | null;
  availabilityNote: string | null;
  away: { id: string; startsOn: Date; endsOn: Date; note: string | null }[];
};

export type PlayerHub = {
  player: {
    id: string;
    slug: string;
    discordId: string;
    displayName: string;
    avatar: string | null;
    gamertag: string | null;
    clubRole: string | null;
    preferredFoot: string | null;
    archetype: string | null;
    bio: string | null;
    createdAt: Date;
  };
  viewer: HubViewer;
  /** The contract in force: the newest ACTIVE one in a WINDOW or ACTIVE season. */
  current: ContractRow | null;
  /** Offers waiting for an answer (visible to the player and staff). */
  pending: ContractRow[];
  /** "Free agent" style label when there is no current contract. */
  standing: "contracted" | "alumnus" | "none";
  contracts: ContractRow[];
  totals: Totals;
  form: number[];
  ribbons: Ribbon[];
  timeline: Entry[];
  /** Null when the viewer lacks clearance. */
  objectives: { kind: ObjectiveKind; progress: Progress }[] | null;
  attendance: AttendanceView | null;
  seasonsForOffer: { id: string; name: string; state: SeasonState }[];
};

const LIVE_SEASONS: SeasonState[] = ["WINDOW", "ACTIVE"];

async function loadMatches(player: { id: string; gamertag: string | null }): Promise<MatchLine[]> {
  const rows = await prisma.eaMatchPlayer.findMany({
    where: {
      OR: [{ playerId: player.id }, ...(player.gamertag ? [{ playerName: { equals: player.gamertag, mode: "insensitive" as const } }] : [])],
      ...(env.eaClubId ? { match: { clubId: env.eaClubId } } : {}),
    },
    include: { match: { select: { matchId: true, playedAt: true, oppName: true, usScore: true, oppScore: true } } },
  });
  // One line per match even if both a link and a name matched it.
  const seen = new Set<string>();
  const lines: MatchLine[] = [];
  for (const r of rows) {
    if (seen.has(r.match.matchId)) continue;
    seen.add(r.match.matchId);
    lines.push({
      playedAt: r.match.playedAt,
      oppName: r.match.oppName,
      usScore: r.match.usScore,
      oppScore: r.match.oppScore,
      pos: r.pos,
      rating: r.rating,
      goals: r.goals,
      assists: r.assists,
      mom: r.mom,
      cleanSheet: r.cleanSheet,
    });
  }
  // Oldest first (the milestones depend on it); undated last.
  return lines.sort((a, b) => (a.playedAt?.getTime() ?? Infinity) - (b.playedAt?.getTime() ?? Infinity));
}

export async function loadPlayerHub(slug: string, user: SessionUser | null): Promise<PlayerHub | null> {
  const p = await prisma.player.findUnique({ where: { slug } });
  if (!p) return null;
  const viewer = viewerOf(user, p.id);
  const priv = viewer.isSelf || viewer.isStaff;

  const [contractRows, matches, milestones, potm, written, moves, eaMoves, signups, pattern, away, seasons] = await Promise.all([
    prisma.contract.findMany({
      where: { playerId: p.id },
      include: { season: true, objectives: { orderBy: { position: "asc" } } },
      orderBy: { season: { startsAt: "desc" } },
    }),
    loadMatches(p),
    prisma.milestone.findMany({ where: { playerId: p.id }, orderBy: { achievedAt: "asc" } }),
    prisma.potmWinner.findMany({ where: { playerId: p.id }, include: { potm: true } }),
    prisma.serviceEntry.findMany({
      where: { playerId: p.id, kind: { in: (["COMMENDATION", "WARNING", "NOTE"] as const).filter((k) => canView(k, viewer)) } },
    }),
    priv ? prisma.rosterMove.findMany({ where: { playerId: p.id }, include: { season: { select: { name: true } } } }) : [],
    priv && p.gamertag
      ? prisma.eaSquadMove.findMany({ where: { playerName: { equals: p.gamertag, mode: "insensitive" }, ...(env.eaClubId ? { clubId: env.eaClubId } : {}) } })
      : [],
    priv
      ? prisma.eventSignup.findMany({
          where: { playerId: p.id, attendance: { not: null } },
          include: { event: { select: { title: true, startsAt: true } } },
          orderBy: { event: { startsAt: "desc" } },
          take: 300,
        })
      : [],
    priv ? prisma.availabilityPattern.findUnique({ where: { playerId: p.id } }) : null,
    priv
      ? prisma.availabilityAway.findMany({ where: { playerId: p.id, endsOn: { gte: new Date() } }, orderBy: { startsOn: "asc" } })
      : [],
    viewer.isManagement ? prisma.season.findMany({ where: { state: { in: LIVE_SEASONS } }, orderBy: { startsAt: "asc" } }) : [],
  ]);

  const rows: ContractRow[] = contractRows
    .filter((c) => priv || c.state === "ACTIVE" || c.state === "ENDED" || c.state === "RELEASED")
    .map((c) => ({
      id: c.id,
      seasonId: c.seasonId,
      seasonName: c.season.name,
      seasonState: c.season.state,
      seasonStartsAt: c.season.startsAt,
      state: c.state,
      shirtNumber: c.shirtNumber,
      squadStatus: c.squadStatus,
      position: c.position,
      secondaryPosition: c.secondaryPosition,
      captaincy: c.captaincy,
      objectives: priv ? c.objectives.map((o) => ({ kind: o.kind, target: o.target })) : null,
      offeredAt: priv ? c.offeredAt : null,
      respondedAt: priv ? c.respondedAt : null,
      endedAt: c.endedAt,
      releaseNote: priv ? c.releaseNote : null,
      roleError: viewer.isStaff ? c.roleError : null,
    }));

  const current = rows.find((c) => c.state === "ACTIVE" && LIVE_SEASONS.includes(c.seasonState)) ?? null;
  const pending = priv ? rows.filter((c) => c.state === "OFFERED" && c.seasonState !== "ENDED") : [];
  const standing = current ? "contracted" : rows.some((c) => c.state === "ENDED" || c.state === "RELEASED") ? "alumnus" : "none";
  const totals = careerTotals(matches);

  // A contract with no roster move behind it (carried over from before the
  // history existed) still gets its signing on the timeline.
  const moved = new Set(moves.map((m) => m.contractId));
  const synthetic = contractRows
    .filter((c) => !moved.has(c.id) && (c.state === "ACTIVE" || c.state === "ENDED" || c.state === "RELEASED"))
    .map((c) => ({ kind: "ACCEPT" as const, at: c.respondedAt ?? c.offeredAt, seasonName: c.season.name, position: c.position, note: null as string | null }));
  const timeline = buildTimeline({
    matches,
    potm: potm.map((w) => ({ month: w.potm.month, votes: w.potm.votes, awardedAt: w.potm.awardedAt })),
    moves: [
      ...moves.map((m) => ({ kind: m.kind, at: m.createdAt, seasonName: m.season?.name ?? null, position: m.position, note: m.note })),
      ...(priv ? synthetic : []),
    ],
    eaMoves,
    written: written.map((w) => ({ id: w.id, kind: w.kind, body: w.body, occurredAt: w.occurredAt, authorName: w.authorName, authorId: w.authorId })),
    viewer,
  });

  const attendance = priv ? attendanceRecord(signups.map((s) => s.attendance)) : null;
  let objectives: PlayerHub["objectives"] = null;
  if (priv) {
    objectives = [];
    const live = current ? contractRows.find((c) => c.id === current.id) : null;
    if (live && attendance) {
      const to = new Date(Math.min(live.season.endsAt.getTime(), Date.now() + 1));
      const stats = careerTotals(matchesBetween(matches, live.season.startsAt, to));
      const marks = attendanceRecord(signups.filter((s) => s.event.startsAt >= live.season.startsAt && s.event.startsAt < to).map((s) => s.attendance));
      objectives = live.objectives.map((o) => ({ kind: o.kind, progress: objectiveProgress(o.kind, o.target, stats, marks) }));
    }
  }

  return {
    player: {
      id: p.id,
      slug: p.slug,
      discordId: p.discordId,
      displayName: p.displayName,
      avatar: p.avatar,
      gamertag: p.gamertag,
      clubRole: p.clubRole,
      preferredFoot: p.preferredFoot,
      archetype: p.archetype,
      bio: p.bio,
      createdAt: p.createdAt,
    },
    viewer,
    current,
    pending,
    standing,
    contracts: rows,
    totals,
    form: matches.filter((m) => m.rating).slice(-5).map((m) => m.rating as number),
    ribbons: ribbons(milestones, potm.map((w) => w.potm.month)),
    timeline,
    objectives,
    attendance: attendance
      ? {
          record: attendance,
          recent: signups.slice(0, 10).map((s) => ({ id: s.id, title: s.event.title, startsAt: s.event.startsAt, attendance: s.attendance as Attendance })),
          usualNights: pattern?.days ?? null,
          availabilityNote: pattern?.note ?? null,
          away: away.map((a) => ({ id: a.id, startsOn: a.startsOn, endsOn: a.endsOn, note: a.note })),
        }
      : null,
    seasonsForOffer: seasons.map((s) => ({ id: s.id, name: s.name, state: s.state })),
  };
}
