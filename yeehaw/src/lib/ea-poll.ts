import type { Prisma } from "@prisma/client";
import { MATCH_TYPES } from "@/config/club";
import * as ea from "./ea-client";
import { diffSquad, eventForMatch, num, parseMatch, parseMemberTotals, POLLED_MATCH_TYPES, syncLeagueRoster, type LatestSnapshot } from "./ea-rules";
import { env } from "./env";
import { prisma } from "./prisma";

// The hourly EA poll's database side (scripts/ea-poll.ts runs it). Port of
// proclubs/poll.py and the writers in proclubs/db.py, into the Ea* tables.
//
// Our own club (EA_CLUB_ID) is polled first with its squad tracked; then the
// league table's roster (clubs we have actually played, capped at
// EA_LEAGUE_MAX_TEAMS) is polled the same way, so each has a division, rating
// and record to show. EA only keeps a rolling window of recent matches, so
// every poll copies what it sees; a match already stored (by match id and
// club) is skipped, which is what makes polling twice harmless.
//
// Each step reports on its own and a failure in one never stops the rest: a
// slow EA endpoint costs that club's numbers for the hour, nothing else.

export type PollLine = { step: string; detail: string; warnings: string[] };

type Obj = Record<string, unknown>;
const int = (v: unknown) => {
  const n = num(v);
  return n === null ? null : Math.trunc(n);
};

// --- Writers ----------------------------------------------------------------- //

export async function recordSnapshot(platform: string, clubId: string, stats: Obj | null, division: Obj | null, teamSize: number | null) {
  const s = stats ?? {};
  const d = division ?? {};
  await prisma.eaClubSnapshot.create({
    data: {
      platform,
      clubId,
      division: d.currentDivision == null ? null : String(d.currentDivision),
      bestDivision: ((d.bestDivision ?? s.bestDivision) as string | number | null | undefined)?.toString() ?? null,
      points: int(d.points),
      skillRating: int(s.skillRating),
      wins: int(s.wins),
      losses: int(s.losses),
      ties: int(s.ties),
      goals: int(s.goals),
      goalsAgainst: int(s.goalsAgainst),
      promotions: int(s.promotions ?? d.promotions),
      relegations: int(s.relegations ?? d.relegations),
      teamSize,
    },
  });
}

/** gamertag (lowercase) -> Player id, for resolving EA's names. */
export async function gamertagMap(): Promise<Map<string, string>> {
  const rows = await prisma.player.findMany({ where: { gamertag: { not: null } }, select: { id: true, gamertag: true } });
  return new Map(rows.map((r) => [r.gamertag!.toLowerCase(), r.id]));
}

/** Stores the matches not seen before, with each player's line. Returns how many were new. */
export async function recordMatches(platform: string, clubId: string, matchType: string, raw: readonly unknown[], tags?: Map<string, string>): Promise<number> {
  const byTag = tags ?? (await gamertagMap());
  let inserted = 0;
  for (const entry of raw) {
    const m = parseMatch(entry, clubId, matchType);
    if (!m) continue;
    const have = await prisma.eaMatch.findUnique({ where: { matchId_clubId: { matchId: m.matchId, clubId } }, select: { id: true } });
    if (have) continue; // already had this match from a previous poll
    try {
      await prisma.eaMatch.create({
        data: {
          matchId: m.matchId,
          platform,
          clubId,
          playedAt: m.playedAt,
          matchType,
          usScore: m.usScore,
          oppScore: m.oppScore,
          oppName: m.oppName,
          oppClubId: m.oppClubId,
          outcome: m.outcome,
          forfeit: m.forfeit,
          players: { create: m.players.map((p) => ({ ...p, playerId: byTag.get(p.playerName.toLowerCase()) ?? null })) },
        },
      });
      inserted++;
    } catch (e) {
      // A concurrent poll stored it first: fine.
      if ((e as { code?: string }).code !== "P2002") throw e;
    }
  }
  return inserted;
}

/** Diffs EA's member list against the last one, logging signings and departures. */
export async function recordSquad(platform: string, clubId: string, names: readonly (string | null | undefined)[]): Promise<{ joined: string[]; left: string[] }> {
  const existing = (await prisma.eaSquadMember.findMany({ where: { platform, clubId }, select: { playerName: true } })).map((r) => r.playerName);
  const d = diffSquad(existing, names);
  if (d.ignored) return { joined: [], left: [] };
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  if (d.joined.length) ops.push(prisma.eaSquadMember.createMany({ data: d.joined.map((playerName) => ({ platform, clubId, playerName })), skipDuplicates: true }));
  if (d.left.length) ops.push(prisma.eaSquadMember.deleteMany({ where: { platform, clubId, playerName: { in: d.left } } }));
  if (!d.baseline && (d.joined.length || d.left.length))
    ops.push(
      prisma.eaSquadMove.createMany({
        data: [...d.joined.map((playerName) => ({ platform, clubId, playerName, move: "joined" })), ...d.left.map((playerName) => ({ platform, clubId, playerName, move: "left" }))],
      }),
    );
  await prisma.$transaction(ops);
  return d.baseline ? { joined: [], left: [] } : { joined: d.joined, left: d.left };
}

/** EA's season totals per current member; somebody who left keeps their last totals. */
export async function recordMemberTotals(platform: string, clubId: string, members: unknown) {
  const now = new Date();
  for (const t of parseMemberTotals(members)) {
    const { playerName, ...rest } = t;
    await prisma.eaMemberTotal.upsert({
      where: { platform_clubId_playerName: { platform, clubId, playerName } },
      create: { platform, clubId, playerName, ...rest, capturedAt: now },
      update: { ...rest, capturedAt: now },
    });
  }
}

// --- League roster ----------------------------------------------------------- //

async function latestSnapshots(platform: string, ids: string[]): Promise<Map<string, LatestSnapshot>> {
  const out = new Map<string, LatestSnapshot>();
  if (!ids.length) return out;
  // Latest per club, in one query; ties on capturedAt broken by id like the old code.
  const rows = await prisma.eaClubSnapshot.findMany({ where: { platform, clubId: { in: ids } }, orderBy: [{ capturedAt: "desc" }, { id: "desc" }], select: { clubId: true, division: true, skillRating: true } });
  for (const r of rows) if (!out.has(r.clubId)) out.set(r.clubId, { division: r.division, skillRating: r.skillRating });
  return out;
}

export async function syncRoster(platform: string, ourClubId: string, ourLabel: string, maxTeams: number) {
  const now = new Date();
  const [roster, opponents] = await Promise.all([
    prisma.eaLeagueClub.findMany({ where: { platform } }),
    prisma.eaMatch.findMany({ where: { platform, clubId: ourClubId, oppClubId: { not: null } }, distinct: ["oppClubId"], select: { oppClubId: true, oppName: true } }),
  ]);
  // Snapshot history persists after a club leaves the roster, so a club
  // dropped for being off-division stays excluded on every later call.
  const ids = [...new Set([ourClubId, ...roster.map((r) => r.clubId), ...opponents.map((o) => o.oppClubId!)])];
  const snapshots = await latestSnapshots(platform, ids);
  const next = syncLeagueRoster({
    roster: roster.map((r) => ({ clubId: r.clubId, label: r.label, addedAt: r.addedAt, pinned: r.pinned })),
    snapshots,
    ourClubId,
    ourLabel,
    opponents: opponents.map((o) => ({ clubId: o.oppClubId!, label: o.oppName })),
    maxTeams,
    now,
  });
  const keep = new Set(next.map((r) => r.clubId));
  const had = new Set(roster.map((r) => r.clubId));
  const drop = roster.filter((r) => !keep.has(r.clubId)).map((r) => r.clubId);
  const add = next.filter((r) => !had.has(r.clubId));
  await prisma.$transaction([
    prisma.eaLeagueClub.deleteMany({ where: { platform, clubId: { in: drop } } }),
    prisma.eaLeagueClub.createMany({ data: add.map((r) => ({ platform, clubId: r.clubId, label: r.label, addedAt: r.addedAt, pinned: r.pinned })), skipDuplicates: true }),
  ]);
  return { added: add.length, dropped: drop.length };
}

// --- Polling ------------------------------------------------------------------ //

export type ClubRef = { platform: string; clubId: string; label: string };

export async function pollClub(club: ClubRef, trackSquad: boolean, tags: Map<string, string>): Promise<PollLine> {
  const { platform, clubId, label } = club;
  const warnings: string[] = [];
  const bits: string[] = [];
  const attempt = async <T>(what: string, run: () => Promise<T>): Promise<T | null> => {
    try {
      return await run();
    } catch (e) {
      warnings.push(`${what} failed: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  };

  const stats = await attempt("overall stats", () => ea.overallStats(platform, clubId));
  const division = await attempt("division", () => ea.divisionStats(platform, clubId));

  let teamSize: number | null = null;
  const members = await attempt("member stats", () => ea.memberStats(platform, clubId));
  if (members) {
    teamSize = members.length;
    if (trackSquad) {
      // Signings and departures feed the roundup. Only our own club: league
      // opponents' rosters aren't news.
      const { joined, left } = await recordSquad(platform, clubId, members.map((m) => m.name as string));
      await recordMemberTotals(platform, clubId, members);
      if (joined.length || left.length) bits.push(`squad: joined ${joined.join(", ") || "-"}, left ${left.join(", ") || "-"}`);
    }
  }

  if (stats || division) {
    await recordSnapshot(platform, clubId, stats, division, teamSize);
    bits.push("snapshot recorded");
  }

  for (const type of POLLED_MATCH_TYPES) {
    const matches = await attempt(`${type} fetch`, () => ea.matchesStats(platform, clubId, type, 30));
    if (!matches) continue;
    const n = await recordMatches(platform, clubId, type, matches, tags);
    bits.push(`${type}: ${n} new of ${matches.length}`);
  }
  return { step: label, detail: bits.join("; ") || "nothing recorded", warnings };
}

/** Our club first, then the league roster's clubs, none twice. */
export async function runClubPolls(): Promise<PollLine[]> {
  const platform = env.eaPlatform;
  const ours = env.eaClubId;
  const lines: PollLine[] = [];
  if (!ours) return [{ step: "ea", detail: "EA_CLUB_ID isn't set: nothing to poll", warnings: [] }];
  const tags = await gamertagMap();
  lines.push(await pollClub({ platform, clubId: ours, label: env.eaClubName }, true, tags));

  await syncRoster(platform, ours, env.eaClubName, env.eaLeagueMaxTeams);
  for (const entry of await prisma.eaLeagueClub.findMany({ where: { platform }, orderBy: { addedAt: "asc" } })) {
    if (entry.clubId === ours) continue;
    lines.push(await pollClub({ platform, clubId: entry.clubId, label: entry.label ?? entry.clubId }, false, tags));
  }
  return lines;
}

// --- After the poll ------------------------------------------------------------ //

/**
 * Point match lines at the Player whose gamertag they carry, for lines stored
 * before the link was made (a gamertag is often linked after the first
 * matches). Case-insensitive. Returns how many lines were linked.
 */
export async function relinkPlayers(): Promise<number> {
  return prisma.$executeRaw`
    UPDATE "EaMatchPlayer" mp SET "playerId" = p.id
    FROM "Player" p
    WHERE mp."playerId" IS NULL AND p.gamertag IS NOT NULL AND lower(mp."playerName") = lower(p.gamertag)`;
}

/**
 * Re-point one player's match lines after their gamertag changed: lines
 * under another name are let go, lines under the new one (case-insensitive)
 * are claimed. The hub reads lines by playerId, so this keeps a newly linked
 * gamertag's history showing at once instead of after the next poll.
 */
export async function relinkPlayer(playerId: string, gamertag: string | null): Promise<void> {
  await prisma.$transaction([
    prisma.$executeRaw`
      UPDATE "EaMatchPlayer" SET "playerId" = NULL
      WHERE "playerId" = ${playerId} AND (${gamertag}::text IS NULL OR lower("playerName") <> lower(${gamertag}::text))`,
    ...(gamertag
      ? [
          prisma.$executeRaw`
            UPDATE "EaMatchPlayer" SET "playerId" = ${playerId}
            WHERE "playerId" IS NULL AND lower("playerName") = lower(${gamertag})`,
        ]
      : []),
  ]);
}

/**
 * Set EaMatch.eventId for our club's matches played inside an event's
 * window (see eventForMatch). Matches already linked are left alone.
 */
export async function linkMatchesToEvents(clubId: string): Promise<number> {
  const loose = await prisma.eaMatch.findMany({ where: { clubId, eventId: null, playedAt: { not: null } }, select: { id: true, playedAt: true } });
  if (!loose.length) return 0;
  const times = loose.map((m) => m.playedAt!.getTime());
  const day = 24 * 3600_000;
  const events = await prisma.event.findMany({
    where: { type: { in: [...MATCH_TYPES] }, startsAt: { gte: new Date(Math.min(...times) - day), lte: new Date(Math.max(...times) + day) } },
    select: { id: true, startsAt: true, endsAt: true, type: true },
  });
  if (!events.length) return 0;
  let linked = 0;
  for (const m of loose) {
    const eventId = eventForMatch(m.playedAt, events);
    if (!eventId) continue;
    await prisma.eaMatch.update({ where: { id: m.id }, data: { eventId } });
    linked++;
  }
  return linked;
}
