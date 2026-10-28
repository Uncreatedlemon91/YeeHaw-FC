import type { EventType } from "@prisma/client";
import { MATCH_TYPES } from "@/config/club";
import { eventEnd } from "./event-rules";

// What EA's unofficial Pro Clubs API sends, turned into the rows we keep, and
// the rules for the things we derive from them. Pure: no network, no
// database. Ports of proclubs/db.py (record_matches, record_member_totals,
// record_squad, sync_league_roster, league_table) and ea_client.py
// (division_label).

/** Friendlies are left out: they don't feed the "how is the team really doing" trends. */
export const POLLED_MATCH_TYPES = ["leagueMatch", "playoffMatch"] as const;

/** EA's number, as a count. Null for anything that isn't one. */
export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

const int = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : Math.trunc(n);
};

// --- Matches --------------------------------------------------------------- //

export type ParsedPlayer = {
  playerName: string;
  /** Lowercase as EA spells it: "goalkeeper", "defender", "midfielder", "forward". */
  pos: string | null;
  rating: number | null;
  goals: number | null;
  assists: number | null;
  shots: number | null;
  passesMade: number | null;
  passAttempts: number | null;
  tacklesMade: number | null;
  tackleAttempts: number | null;
  saves: number | null;
  mom: boolean;
  redCards: number | null;
  cleanSheet: boolean;
  minutesPlayed: number | null;
};

export type ParsedMatch = {
  matchId: string;
  matchType: string;
  playedAt: Date | null;
  usScore: number | null;
  oppScore: number | null;
  oppName: string;
  oppClubId: string | null;
  /** "W", "L" or "D". */
  outcome: "W" | "L" | "D";
  forfeit: boolean;
  players: ParsedPlayer[];
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});

/**
 * One entry of EA's clubs/matches answer, from our club's side. Null when the
 * match has no id or doesn't include our club. EA keys `clubs` and `players`
 * by club id and reports every number as a string.
 */
export function parseMatch(raw: unknown, clubId: string, matchType: string): ParsedMatch | null {
  const m = obj(raw);
  const clubs = obj(m.clubs);
  const us = obj(clubs[clubId]);
  if (!clubs[clubId]) return null;
  const matchId = String(m.matchId ?? "").trim();
  if (!matchId) return null;
  const oppId = Object.keys(clubs).find((id) => id !== clubId) ?? null;
  const opp = obj(oppId ? clubs[oppId] : null);

  const outcome = us.wins === "1" ? "W" : us.losses === "1" ? "L" : "D";
  const forfeit = us.winnerByDnf === "1" || opp.winnerByDnf === "1";
  const seconds = num(us.date) || num(m.timestamp);
  const roster = obj(obj(m.players)[clubId]);

  const players = Object.values(roster).map((entry): ParsedPlayer => {
    const p = obj(entry);
    const pos = typeof p.pos === "string" && p.pos ? p.pos.toLowerCase() : null;
    const secs = num(p.secondsPlayed) || num(p.gameTime);
    return {
      playerName: String(p.playername ?? "").trim() || "Unknown",
      pos,
      rating: num(p.rating),
      goals: int(p.goals),
      assists: int(p.assists),
      shots: int(p.shots),
      passesMade: int(p.passesmade),
      passAttempts: int(p.passattempts),
      tacklesMade: int(p.tacklesmade),
      tackleAttempts: int(p.tackleattempts),
      saves: pos === "goalkeeper" ? int(p.saves) : null,
      mom: num(p.mom) === 1,
      redCards: int(p.redcards),
      cleanSheet: num(p.cleansheetsgk) === 1 || num(p.cleansheetsdef) === 1,
      minutesPlayed: secs ? Math.round(secs / 60) : null,
    };
  });
  // The same name twice would break the (match, name) key; first line wins.
  const seen = new Set<string>();
  const unique = players.filter((p) => (seen.has(p.playerName) ? false : (seen.add(p.playerName), true)));

  return {
    matchId,
    matchType,
    playedAt: seconds ? new Date(seconds * 1000) : null,
    usScore: int(us.goals),
    oppScore: int(opp.goals),
    oppName: String(obj(opp.details).name ?? "") || "Opponent",
    oppClubId: oppId,
    outcome,
    forfeit,
    players: unique,
  };
}

// --- Member totals and the squad ------------------------------------------- //

export type MemberTotalRow = {
  playerName: string;
  gamesPlayed: number | null;
  goals: number | null;
  assists: number | null;
  mom: number | null;
  passesMade: number | null;
  passSuccess: number | null;
  tacklesMade: number | null;
  tackleSuccess: number | null;
  shotSuccess: number | null;
  ratingAvg: number | null;
  cleanSheets: number | null;
  redCards: number | null;
};

/** EA's members/stats list as season totals per current member. */
export function parseMemberTotals(members: unknown): MemberTotalRow[] {
  const out: MemberTotalRow[] = [];
  for (const entry of Array.isArray(members) ? members : []) {
    const m = obj(entry);
    const playerName = String(m.name ?? "").trim();
    if (!playerName) continue;
    const sheets = [num(m.cleanSheetsDef), num(m.cleanSheetsGK)];
    out.push({
      playerName,
      gamesPlayed: int(m.gamesPlayed),
      goals: int(m.goals),
      assists: int(m.assists),
      mom: int(m.manOfTheMatch),
      passesMade: int(m.passesMade),
      passSuccess: num(m.passSuccessRate),
      tacklesMade: int(m.tacklesMade),
      tackleSuccess: num(m.tackleSuccessRate),
      shotSuccess: num(m.shotSuccessRate),
      ratingAvg: num(m.ratingAve),
      cleanSheets: sheets.every((s) => s === null) ? null : Math.trunc(Math.max(...sheets.map((s) => s ?? 0))),
      redCards: int(m.redCards),
    });
  }
  return out;
}

export type SquadDiff = { current: string[]; joined: string[]; left: string[]; baseline: boolean; ignored: boolean };

/**
 * EA's member list against the last one we saw. The very first call only
 * records a baseline (nobody already in the squad is a "signing"); an empty
 * list is EA failing to answer, not everyone walking out at once, so it is
 * ignored outright.
 */
export function diffSquad(existing: readonly string[], memberNames: readonly (string | null | undefined)[]): SquadDiff {
  const current = [...new Set(memberNames.map((n) => (n ?? "").trim()).filter(Boolean))];
  if (!current.length) return { current, joined: [], left: [], baseline: false, ignored: true };
  const had = new Set(existing);
  const now = new Set(current);
  return {
    current,
    joined: current.filter((n) => !had.has(n)).sort(),
    left: [...had].filter((n) => !now.has(n)).sort(),
    baseline: had.size === 0,
    ignored: false,
  };
}

// --- Division, league table ------------------------------------------------- //

/**
 * EA's currentDivision as the division the game shows. EA's value runs one
 * above the in-game division (it said 4 while the club was in Division 3);
 * 1 maps to "Elite" (inferred, not observed). Null when it isn't a number.
 */
export function divisionLabel(current: unknown): string | null {
  const n = num(current);
  if (n === null) return null;
  const d = Math.trunc(n);
  if (d < 1) return null;
  return d === 1 ? "Elite" : `Division ${d - 1}`;
}

export type RosterClub = { clubId: string; label: string | null; addedAt: Date; pinned: boolean };
export type LatestSnapshot = { division: string | null; skillRating: number | null };

/**
 * Keeps the league roster in step with who we've actually played, capped at
 * `maxTeams`. Port of db.sync_league_roster:
 *  - our own club is always present and pinned (never evicted);
 *  - members whose last known division drifted from ours are dropped first,
 *    and an opponent whose last known division differs is never (re-)added,
 *    so off-division clubs don't eat table slots (snapshots persist after a
 *    club is dropped, so it stays excluded);
 *  - once full, a new opponent replaces the non-pinned member with the lowest
 *    skill rating (unpolled counts as lowest), oldest first among equals.
 * Returns the roster to store.
 */
export function syncLeagueRoster(input: {
  roster: readonly RosterClub[];
  snapshots: ReadonlyMap<string, LatestSnapshot>;
  ourClubId: string;
  ourLabel: string;
  opponents: readonly { clubId: string; label: string | null }[];
  maxTeams: number;
  now: Date;
}): RosterClub[] {
  const { snapshots, ourClubId, maxTeams, now } = input;
  const roster = input.roster.map((r) => ({ ...r }));
  if (!roster.some((r) => r.clubId === ourClubId)) roster.push({ clubId: ourClubId, label: input.ourLabel, addedAt: now, pinned: true });

  const ourDivision = snapshots.get(ourClubId)?.division ?? null;
  // A club never polled hasn't had the chance to show where it belongs.
  const offDivision = (id: string) => {
    if (ourDivision === null) return false;
    const d = snapshots.get(id)?.division ?? null;
    return d !== null && d !== ourDivision;
  };
  const rating = (id: string) => snapshots.get(id)?.skillRating ?? -1;

  let kept = ourDivision === null ? roster : roster.filter((r) => r.pinned || !offDivision(r.clubId));
  for (const opp of input.opponents) {
    if (kept.some((r) => r.clubId === opp.clubId) || offDivision(opp.clubId)) continue;
    if (kept.length >= maxTeams) {
      const candidates = kept.filter((r) => !r.pinned);
      if (!candidates.length) continue; // everyone left is pinned: no room to make
      // Ties go to whoever has been in the table longest; a club added in this
      // same call is the newest, so it can't evict itself.
      const evict = candidates.reduce((a, b) => (rating(b.clubId) < rating(a.clubId) || (rating(b.clubId) === rating(a.clubId) && b.addedAt < a.addedAt) ? b : a));
      kept = kept.filter((r) => r !== evict);
    }
    kept = [...kept, { clubId: opp.clubId, label: opp.label, addedAt: now, pinned: false }];
  }
  return kept;
}

export type LeagueRow = {
  clubId: string;
  label: string;
  isUs: boolean;
  division: string | null;
  skillRating: number | null;
  points: number | null;
  played: number;
  teamSize: number | null;
  form: ("W" | "L" | "D")[];
  hasData: boolean;
};

/**
 * The table as shown: only clubs in our division (when we know it), ranked
 * by skill rating (points break ties; unknown sorts last). Skill rating, not
 * points, because points only grow with matches played.
 */
export function rankLeague(rows: readonly LeagueRow[]): LeagueRow[] {
  const ours = rows.find((r) => r.isUs)?.division ?? null;
  const shown = ours === null ? [...rows] : rows.filter((r) => r.division === ours);
  return shown.sort((a, b) => (b.skillRating ?? -1) - (a.skillRating ?? -1) || (b.points ?? -1) - (a.points ?? -1));
}

// --- Linking matches to events ---------------------------------------------- //

/** EA stamps a game at its end; a night's games start around kick-off. */
export const LINK_LEAD_MS = 30 * 60_000;
/** Games that run on past the planned end of the event. */
export const LINK_GRACE_MS = 30 * 60_000;

export type LinkableEvent = { id: string; startsAt: Date; endsAt: Date | null; type: EventType };

/**
 * The event a match was played in: its window is startsAt - 30 min to the
 * event's end + 30 min grace (no end set: three hours, like sign-ups).
 * Where windows overlap the event that starts nearest the match wins. Only
 * match-type events take reports.
 */
export function eventForMatch(playedAt: Date | null, events: readonly LinkableEvent[]): string | null {
  if (!playedAt) return null;
  const t = playedAt.getTime();
  let best: { id: string; gap: number } | null = null;
  for (const e of events) {
    if (!MATCH_TYPES.includes(e.type)) continue;
    const start = e.startsAt.getTime();
    const end = eventEnd(e).getTime();
    if (t < start - LINK_LEAD_MS || t > end + LINK_GRACE_MS) continue;
    const gap = Math.abs(t - start);
    if (!best || gap < best.gap) best = { id: e.id, gap };
  }
  return best?.id ?? null;
}
