import { env } from "./env";
import { eaMatchTotal, playerTotals, rivalRecords, recentForm, recordOf, type MatchRow, type Outcome } from "./stats-rules";
import { divisionLabel, rankLeague, type LeagueRow } from "./ea-rules";
import { prisma } from "./prisma";

// What /club/stats and /club/league read: our club's EA data in Postgres,
// shaped for the pages. The numbers come from the hourly poll, not from EA at
// request time, so a page never waits on EA (the old site's Stats page called
// EA through a cache; this one only ever reads its own copy).
//
// The site shows no division, on purpose: EA exposes no live one (see
// ea-client.ts divisionStats). The league table uses the stale tier only to
// bucket comparable opponents.

const clubWhere = () => ({ platform: env.eaPlatform, clubId: env.eaClubId });

export async function loadStats() {
  if (!env.eaClubId) return null;
  const where = clubWhere();
  const [snapshots, matches, lines, totals, potm] = await Promise.all([
    prisma.eaClubSnapshot.findMany({ where, orderBy: { capturedAt: "asc" } }),
    prisma.eaMatch.findMany({ where, orderBy: { playedAt: "asc" }, select: { id: true, matchId: true, playedAt: true, matchType: true, usScore: true, oppScore: true, oppName: true, outcome: true, forfeit: true, eventId: true } }),
    prisma.eaMatchPlayer.findMany({
      where: { match: where },
      select: { playerName: true, playerId: true, rating: true, goals: true, assists: true, mom: true, cleanSheet: true, pos: true, redCards: true, match: { select: { playedAt: true } } },
    }),
    prisma.eaMemberTotal.findMany({ where }),
    prisma.playerOfTheMonth.findMany({ orderBy: { month: "desc" }, take: 12, include: { winners: { include: { player: { select: { displayName: true, slug: true } } } } } }),
  ]);
  const latest = snapshots[snapshots.length - 1] ?? null;
  const players = await prisma.player.findMany({ where: { id: { in: [...new Set(lines.map((l) => l.playerId).filter((x): x is string => !!x))] } }, select: { id: true, displayName: true, slug: true } });
  const known = new Map(players.map((p) => [p.id, p]));
  const memberByName = new Map(totals.map((t) => [t.playerName.toLowerCase(), t]));

  const rows: MatchRow[] = matches;
  const table = playerTotals(lines.map((l) => ({ ...l, playedAt: l.match.playedAt }))).map((p) => {
    const who = p.playerId ? known.get(p.playerId) : undefined;
    return { ...p, display: who?.displayName ?? p.name, slug: who?.slug ?? null, ea: memberByName.get(p.key) ?? null };
  });

  return {
    clubName: env.eaClubName,
    trackedSince: snapshots[0]?.capturedAt ?? matches[0]?.playedAt ?? null,
    latest: latest && { ...latest, division: divisionLabel(latest.division) },
    eaPlayed: eaMatchTotal(latest),
    record: recordOf(rows),
    form: recentForm(rows, 5),
    matches: matches.slice().reverse(),
    skillSeries: snapshots.filter((s) => s.skillRating !== null).map((s) => ({ at: s.capturedAt, value: s.skillRating as number })),
    goalDiff: matches.filter((m) => !m.forfeit && m.usScore !== null && m.oppScore !== null).slice(-30).map((m) => ({ at: m.playedAt, value: (m.usScore as number) - (m.oppScore as number), opp: m.oppName })),
    players: table,
    rivals: rivalRecords(rows),
    potm: potm.map((p) => ({ id: p.id, month: p.month, votes: p.votes, winners: p.winners.map((w) => ({ name: w.player.displayName, slug: w.player.slug })) })),
  };
}

export type Stats = NonNullable<Awaited<ReturnType<typeof loadStats>>>;

export async function loadLeague() {
  if (!env.eaClubId) return null;
  const platform = env.eaPlatform;
  const roster = await prisma.eaLeagueClub.findMany({ where: { platform }, orderBy: { addedAt: "asc" } });
  const ids = roster.map((r) => r.clubId);
  const [snaps, matches] = await Promise.all([
    prisma.eaClubSnapshot.findMany({ where: { platform, clubId: { in: ids } }, orderBy: [{ capturedAt: "desc" }, { id: "desc" }] }),
    prisma.eaMatch.findMany({ where: { platform, clubId: { in: ids }, forfeit: false }, orderBy: { playedAt: "desc" }, select: { clubId: true, outcome: true, playedAt: true } }),
  ]);
  const latest = new Map<string, (typeof snaps)[number]>();
  for (const s of snaps) if (!latest.has(s.clubId)) latest.set(s.clubId, s);
  const form = new Map<string, Outcome[]>();
  for (const m of matches) {
    const f = form.get(m.clubId) ?? [];
    if (f.length < 5) form.set(m.clubId, [m.outcome as Outcome, ...f]); // newest last
  }
  const rows: LeagueRow[] = roster.map((r) => {
    const s = latest.get(r.clubId);
    return {
      clubId: r.clubId,
      label: r.label ?? r.clubId,
      isUs: r.clubId === env.eaClubId,
      division: s?.division ?? null,
      skillRating: s?.skillRating ?? null,
      points: s?.points ?? null,
      played: (s?.wins ?? 0) + (s?.losses ?? 0) + (s?.ties ?? 0),
      teamSize: s?.teamSize ?? null,
      form: form.get(r.clubId) ?? [],
      hasData: !!s,
    };
  });
  const table = rankLeague(rows);
  const shown = new Set(table.map((r) => r.clubId));
  return {
    table,
    excluded: rows.filter((r) => !shown.has(r.clubId)).map((r) => ({ label: r.label, polled: r.hasData })),
    rosterSize: roster.length,
    ourDivision: rows.find((r) => r.isUs)?.division ?? null,
  };
}
