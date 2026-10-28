// Recognition: milestones, Player of the Month and the Man of the Match vote,
// with no database. Port of proclubs/recognition.py and the rules half of
// proclubs/matchweek.py (vote windows, results, ratings).
//
// Milestones are judged against two records: EA's (appearances, goals,
// assists, clean sheets, from the club's recorded matches via each player's
// linked gamertag) and the squad's own (Man of the Match votes). Each is
// awarded once. Player of the Month goes to whoever got the most Man of the
// Match votes across the month's matches: votes rather than wins, so a player
// who came second three times can beat one lucky win. Level on votes, the one
// with more wins takes it; still level, they share it.

import { keepsCleanSheet } from "./service-record";

// --- Milestones ------------------------------------------------------------- //

export type Metric = "apps" | "goals" | "assists" | "cleanSheets" | "squadMotm";
export type Metrics = Record<Metric, number>;

/** (key, label, metric, threshold), in the order they are shown. */
export const MILESTONES: readonly { key: string; label: string; metric: Metric; threshold: number }[] = [
  { key: "apps-1", label: "Debut", metric: "apps", threshold: 1 },
  { key: "apps-10", label: "10 appearances", metric: "apps", threshold: 10 },
  { key: "apps-25", label: "25 appearances", metric: "apps", threshold: 25 },
  { key: "apps-50", label: "50 appearances", metric: "apps", threshold: 50 },
  { key: "apps-100", label: "100 appearances", metric: "apps", threshold: 100 },
  { key: "apps-200", label: "200 appearances", metric: "apps", threshold: 200 },
  { key: "goals-1", label: "First goal", metric: "goals", threshold: 1 },
  { key: "goals-10", label: "10 goals", metric: "goals", threshold: 10 },
  { key: "goals-25", label: "25 goals", metric: "goals", threshold: 25 },
  { key: "goals-50", label: "50 goals", metric: "goals", threshold: 50 },
  { key: "goals-100", label: "100 goals", metric: "goals", threshold: 100 },
  { key: "assists-10", label: "10 assists", metric: "assists", threshold: 10 },
  { key: "assists-25", label: "25 assists", metric: "assists", threshold: 25 },
  { key: "assists-50", label: "50 assists", metric: "assists", threshold: 50 },
  { key: "cs-5", label: "5 clean sheets", metric: "cleanSheets", threshold: 5 },
  { key: "cs-10", label: "10 clean sheets", metric: "cleanSheets", threshold: 10 },
  { key: "cs-25", label: "25 clean sheets", metric: "cleanSheets", threshold: 25 },
  { key: "motm-1", label: "First Man of the Match", metric: "squadMotm", threshold: 1 },
  { key: "motm-5", label: "5 Man of the Match awards", metric: "squadMotm", threshold: 5 },
  { key: "motm-10", label: "10 Man of the Match awards", metric: "squadMotm", threshold: 10 },
  { key: "motm-25", label: "25 Man of the Match awards", metric: "squadMotm", threshold: 25 },
];

const ORDER = new Map(MILESTONES.map((m, i) => [m.key, i]));

/** Display order for stored milestones. */
export const milestoneRank = (key: string) => ORDER.get(key) ?? 99;

export const emptyMetrics = (): Metrics => ({ apps: 0, goals: 0, assists: 0, cleanSheets: 0, squadMotm: 0 });

/** A match line, as far as the milestone counts need. */
export type CountedLine = { goals: number | null; assists: number | null; cleanSheet: boolean; pos: string | null };

/** Totals per player id from their match lines, with the squad's Man of the Match wins. */
export function metricsByPlayer(lines: readonly (CountedLine & { playerId: string })[], motmWins: ReadonlyMap<string, number>, people: readonly string[]): Map<string, Metrics> {
  const out = new Map<string, Metrics>(people.map((id) => [id, { ...emptyMetrics(), squadMotm: motmWins.get(id) ?? 0 }]));
  for (const l of lines) {
    const m = out.get(l.playerId);
    if (!m) continue;
    m.apps++;
    m.goals += l.goals ?? 0;
    m.assists += l.assists ?? 0;
    if (keepsCleanSheet(l)) m.cleanSheets++;
  }
  return out;
}

/** Milestones reached and not yet held: [playerId, key, label]. */
export function newMilestones(metrics: ReadonlyMap<string, Metrics>, have: ReadonlySet<string>): { playerId: string; key: string; label: string }[] {
  const out: { playerId: string; key: string; label: string }[] = [];
  for (const [playerId, values] of metrics)
    for (const m of MILESTONES) if (values[m.metric] >= m.threshold && !have.has(`${playerId}:${m.key}`)) out.push({ playerId, key: m.key, label: m.label });
  return out;
}

// --- The Man of the Match vote ------------------------------------------------ //

/** The vote opens this long after kick-off (a match night is several games)... */
export const VOTE_OPENS_AFTER_MS = 2 * 3600_000;
/** ...and stays open this long, unless the report is published first. */
export const VOTE_WINDOW_MS = 48 * 3600_000;
export const RATING_MIN = 1;
export const RATING_MAX = 10;
export const RATING_WORDS: Record<number, string> = {
  10: "Unplayable",
  9: "Outstanding",
  8: "Very good",
  7: "Good",
  6: "Solid",
  5: "Average",
  4: "Off the pace",
  3: "Poor",
  2: "Very poor",
  1: "Shocker",
};

export type VoteState = "not_yet" | "open" | "closed";
export type VoteFields = { voteOpenedAt: Date | null; voteClosesAt: Date | null; reviewPublishedAt: Date | null };

export function voteState(e: VoteFields, now: Date): VoteState {
  if (!e.voteOpenedAt) return "not_yet";
  if (e.reviewPublishedAt || (e.voteClosesAt && now >= e.voteClosesAt)) return "closed";
  return "open";
}

/** Should the notify job open this match's vote now? */
export function voteDue(e: VoteFields & { startsAt: Date; isMatch: boolean }, now: Date): boolean {
  if (!e.isMatch || e.voteOpenedAt || e.reviewPublishedAt) return false;
  const opens = e.startsAt.getTime() + VOTE_OPENS_AFTER_MS;
  return opens <= now.getTime() && opens + VOTE_WINDOW_MS > now.getTime();
}

/** Why somebody can't vote or rate now, or null when they can. */
export function voteRefusal(state: VoteState, isParticipant: boolean): string | null {
  if (state !== "open") return "Voting isn't open for this match.";
  if (!isParticipant) return "Only players who were in the squad for this match can vote and rate.";
  return null;
}

/** A rating from a form or select: whole 1 to 10, or null when empty. Undefined when invalid. */
export function parseRating(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= RATING_MIN && n <= RATING_MAX ? n : undefined;
}

export type VoteResult = { votes: Map<string, number>; total: number; top: number; winners: string[] };

/** Count the votes. A tie names everyone level at the top. */
export function motmResult(nominees: readonly string[]): VoteResult {
  const votes = new Map<string, number>();
  for (const n of nominees) votes.set(n, (votes.get(n) ?? 0) + 1);
  const top = Math.max(0, ...votes.values());
  return { votes, total: nominees.length, top, winners: top ? [...votes].filter(([, v]) => v === top).map(([k]) => k).sort() : [] };
}

/** Matches each player won the vote in (a tie counts for everyone level). */
export function winsFrom(results: readonly VoteResult[]): Map<string, number> {
  const wins = new Map<string, number>();
  for (const r of results) for (const w of r.winners) wins.set(w, (wins.get(w) ?? 0) + 1);
  return wins;
}

// --- Player of the Month --------------------------------------------------------- //

/** "2026-09" for the month before the one `current` ("2026-10") is in. */
export function previousMonth(current: string): string {
  const [y, m] = current.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/**
 * Who takes the month: most votes; level on votes, most match wins in the
 * month; still level, they share it (all returned, sorted). Empty when
 * nobody received a vote.
 */
export function choosePotm(votes: ReadonlyMap<string, number>, wins: ReadonlyMap<string, number>): { winners: string[]; votes: number } {
  const top = Math.max(0, ...votes.values());
  if (!top) return { winners: [], votes: 0 };
  let leaders = [...votes].filter(([, n]) => n === top).map(([id]) => id);
  if (leaders.length > 1) {
    const best = Math.max(...leaders.map((id) => wins.get(id) ?? 0));
    leaders = leaders.filter((id) => (wins.get(id) ?? 0) === best);
  }
  return { winners: leaders.sort(), votes: top };
}

// --- What the bot says -------------------------------------------------------------- //

const BLUE = 0x4c7ce0;
const RED = 0xd4142f;

export function milestonesEmbed(items: readonly { name: string; label: string }[], url: string) {
  return { title: "Milestones", color: BLUE, url, description: items.map((i) => `**${i.name}**: ${i.label}`).join("\n").slice(0, 4000) };
}

export function potmEmbed(names: readonly string[], monthLabel: string, votes: number, url: string) {
  return {
    title: `Player of the Month: ${monthLabel}`,
    color: RED,
    url,
    description: `**${names.join(" & ")}**, with ${votes} Man of the Match vote${votes === 1 ? "" : "s"} from the squad this month.`,
  };
}
