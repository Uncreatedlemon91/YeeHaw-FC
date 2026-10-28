// Aggregations behind the Stats page, with no database. Ports of
// proclubs/db.py (rival_records, recent_form, player_totals, career_totals,
// member_totals, ea_match_total).

export type Outcome = "W" | "L" | "D";

export type MatchRow = {
  playedAt: Date | null;
  matchType: string;
  usScore: number | null;
  oppScore: number | null;
  oppName: string | null;
  outcome: string;
  forfeit: boolean;
};

const asOutcome = (o: string): Outcome => (o === "W" ? "W" : o === "L" ? "L" : "D");
const byTime = (a: MatchRow, b: MatchRow) => (a.playedAt?.getTime() ?? 0) - (b.playedAt?.getTime() ?? 0);

/** The last `limit` results, oldest of the batch first. Forfeits aren't real results. */
export function recentForm(matches: readonly MatchRow[], limit = 5): Outcome[] {
  return matches
    .filter((m) => !m.forfeit)
    .sort(byTime)
    .slice(-limit)
    .map((m) => asOutcome(m.outcome));
}

export type ClubRecord = { played: number; won: number; drawn: number; lost: number; gf: number; ga: number };

export function recordOf(matches: readonly MatchRow[]): ClubRecord {
  const counted = matches.filter((m) => !m.forfeit);
  return {
    played: counted.length,
    won: counted.filter((m) => m.outcome === "W").length,
    drawn: counted.filter((m) => m.outcome === "D").length,
    lost: counted.filter((m) => m.outcome === "L").length,
    gf: counted.reduce((n, m) => n + (m.usScore ?? 0), 0),
    ga: counted.reduce((n, m) => n + (m.oppScore ?? 0), 0),
  };
}

export type Rival = { name: string; played: number; won: number; drawn: number; lost: number; gf: number; ga: number; lastOutcome: Outcome | null; lastPlayedAt: Date | null };

/** Head-to-head against every opponent faced, most-played first. Forfeits are left out. */
export function rivalRecords(matches: readonly MatchRow[]): Rival[] {
  const rivals = new Map<string, Rival>();
  for (const m of [...matches].sort(byTime)) {
    if (m.forfeit) continue;
    const name = m.oppName || "Opponent";
    const r = rivals.get(name) ?? { name, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, lastOutcome: null, lastPlayedAt: null };
    r.played++;
    if (m.outcome === "W") r.won++;
    else if (m.outcome === "L") r.lost++;
    else r.drawn++;
    r.gf += m.usScore ?? 0;
    r.ga += m.oppScore ?? 0;
    r.lastOutcome = asOutcome(m.outcome);
    r.lastPlayedAt = m.playedAt;
    rivals.set(name, r);
  }
  return [...rivals.values()].sort((a, b) => b.played - a.played);
}

export type PlayerLine = {
  playerName: string;
  playerId: string | null;
  rating: number | null;
  goals: number | null;
  assists: number | null;
  mom: boolean;
  cleanSheet: boolean;
  pos: string | null;
  redCards: number | null;
  playedAt: Date | null;
};

export type PlayerTotals = {
  key: string;
  name: string;
  playerId: string | null;
  apps: number;
  goals: number;
  assists: number;
  mom: number;
  cleanSheets: number;
  redCards: number;
  rating: number | null;
  /** Mean of the last five rated games; null with fewer than `minFormApps`. */
  form: number | null;
};

/** Per-player totals from the recorded lines, keyed case-insensitively (the same gamertag in different casing is one player). */
export function playerTotals(lines: readonly PlayerLine[], formGames = 5, minFormApps = 3): PlayerTotals[] {
  const by = new Map<string, PlayerTotals & { rated: { at: number; r: number }[]; sum: number; n: number }>();
  for (const l of lines) {
    const key = l.playerName.toLowerCase();
    const p = by.get(key) ?? { key, name: l.playerName, playerId: l.playerId, apps: 0, goals: 0, assists: 0, mom: 0, cleanSheets: 0, redCards: 0, rating: null, form: null, rated: [], sum: 0, n: 0 };
    p.apps++;
    p.goals += l.goals ?? 0;
    p.assists += l.assists ?? 0;
    if (l.mom) p.mom++;
    if (l.cleanSheet && ["goalkeeper", "defender"].includes((l.pos ?? "").toLowerCase())) p.cleanSheets++;
    p.redCards += l.redCards ?? 0;
    if (l.rating) {
      p.sum += l.rating;
      p.n++;
      p.rated.push({ at: l.playedAt?.getTime() ?? 0, r: l.rating });
    }
    p.playerId ??= l.playerId;
    by.set(key, p);
  }
  return [...by.values()]
    .map(({ rated, sum, n, ...p }) => {
      const recent = rated.sort((a, b) => b.at - a.at).slice(0, formGames);
      return {
        ...p,
        rating: n ? Math.round((sum / n) * 100) / 100 : null,
        form: recent.length >= minFormApps ? Math.round((recent.reduce((s, x) => s + x.r, 0) / recent.length) * 100) / 100 : null,
      };
    })
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists || (b.rating ?? 0) - (a.rating ?? 0) || a.name.localeCompare(b.name));
}

/** How many matches EA says the club has played (wins + ties + losses of the latest snapshot), or null. */
export function eaMatchTotal(s: { wins: number | null; ties: number | null; losses: number | null } | null): number | null {
  if (!s) return null;
  const parts = [s.wins, s.ties, s.losses];
  return parts.every((p) => p === null) ? null : parts.reduce<number>((n, p) => n + (p ?? 0), 0);
}
