import { RATING_WORDS } from "./recognition-rules";
import { discordTime } from "./time";

// The match report with no database: what a match night adds up to, who
// scored, who rated best, and the Discord messages around the vote and the
// report. Port of the pure parts of proclubs/matchweek.py (night_summary,
// result_text), matchweek_routes.py (_top_rated) and discord_notify.py
// (vote_message, report_embed).

export type ReportMatch = { usScore: number | null; oppScore: number | null; playedAt: Date | null; oppName: string | null; forfeit?: boolean };

export type Night = { games: number; wins: number; draws: number; losses: number; gf: number; ga: number; gd: number; gdText: string; record: string };

/**
 * The match night in one line, from EA's matches in the event's window: wins,
 * draws and losses and the goal difference. Matches without both scores are
 * left out. Null when EA recorded nothing.
 */
export function nightSummary(matches: readonly ReportMatch[]): Night | null {
  const g = matches.filter((m) => m.usScore !== null && m.oppScore !== null);
  if (!g.length) return null;
  const wins = g.filter((m) => m.usScore! > m.oppScore!).length;
  const losses = g.filter((m) => m.usScore! < m.oppScore!).length;
  const draws = g.length - wins - losses;
  const gf = g.reduce((n, m) => n + m.usScore!, 0);
  const ga = g.reduce((n, m) => n + m.oppScore!, 0);
  const gd = gf - ga;
  const record = (
    [
      [wins, "W"],
      [draws, "D"],
      [losses, "L"],
    ] as const
  )
    .filter(([n]) => n)
    .map(([n, k]) => `${n}${k}`)
    .join(" ");
  return { games: g.length, wins, draws, losses, gf, ga, gd, gdText: gd > 0 ? `+${gd}` : gd < 0 ? `−${-gd}` : "0", record };
}

/** "W 3-1", or null without both scores. */
export function resultText(us: number | null, opp: number | null): string | null {
  if (us === null || opp === null) return null;
  return `${us > opp ? "W" : us < opp ? "L" : "D"} ${us}-${opp}`;
}

export type ReportLine = { name: string; playerId: string | null; rating: number | null; goals: number | null; assists: number | null; matchId: string };

/** Everyone who scored across the night, most goals first. */
export function scorers(lines: readonly ReportLine[]): { name: string; goals: number }[] {
  const by = new Map<string, { name: string; goals: number }>();
  for (const l of lines) {
    if (!l.goals) continue;
    const key = l.name.toLowerCase();
    const s = by.get(key) ?? { name: l.name, goals: 0 };
    s.goals += l.goals;
    by.set(key, s);
  }
  return [...by.values()].sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name));
}

/** Average EA rating per player across the night, best first. */
export function topRated(lines: readonly ReportLine[], n = 3): { name: string; rating: number }[] {
  const by = new Map<string, { name: string; sum: number; count: number }>();
  for (const l of lines) {
    if (l.rating === null || l.rating === 0) continue;
    const key = l.name.toLowerCase();
    const t = by.get(key) ?? { name: l.name, sum: 0, count: 0 };
    t.sum += l.rating;
    t.count++;
    by.set(key, t);
  }
  return [...by.values()]
    .map((t) => ({ name: t.name, rating: t.sum / t.count }))
    .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name))
    .slice(0, n);
}

// --- Discord ------------------------------------------------------------------------ //

const NAVY = 0x1c2d50;
const RED = 0xd4142f;
const MAX_OPTIONS = 25;

export const motmId = (action: "vote" | "rate", eventId: string) => `motm:${action}:${eventId}`;

type EventBits = { id: string; title: string; opponent: string | null };
const heading = (e: EventBits) => (e.opponent ? `${e.title} vs ${e.opponent}` : e.title);

/** The post-match message: who to vote for, and a self-rating. Option values are player ids. */
export function voteMessage(e: EventBits, players: readonly { playerId: string; name: string }[], url: string, closesAt: Date | null) {
  const select = (custom_id: string, placeholder: string, options: object[]) => ({ type: 1, components: [{ type: 3, custom_id, placeholder, options }] });
  return {
    embeds: [
      {
        title: `Full time: ${heading(e)}`,
        url,
        color: NAVY,
        description:
          "Vote for your **Man of the Match** and rate your own game, out of ten. Only players in the squad can vote, and not for themselves." +
          (closesAt ? ` Voting closes ${discordTime(closesAt, "R")}.` : ""),
      },
    ],
    components: [
      select(
        motmId("vote", e.id),
        "Vote: Man of the Match",
        players.slice(0, MAX_OPTIONS).map((p) => ({ label: p.name.slice(0, 100), value: p.playerId })),
      ),
      select(
        motmId("rate", e.id),
        "Rate your own game",
        [10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => ({ label: `${n}: ${RATING_WORDS[n]}`, value: String(n) })),
      ),
    ],
  };
}

export function reportEmbed(input: {
  event: EventBits;
  url: string;
  notes: string | null;
  night: Night | null;
  motm: { names: string[]; votes: number } | null;
  top: { name: string; rating: number }[];
  clips: string[];
  by: string | null;
}) {
  const { event: e, night } = input;
  const fields: { name: string; value: string; inline: boolean }[] = [];
  if (input.motm?.names.length) fields.push({ name: "Man of the Match", inline: true, value: `${input.motm.names.join(" & ")} (${input.motm.votes} vote${input.motm.votes === 1 ? "" : "s"})` });
  if (night) fields.push({ name: "Match night", inline: true, value: `${night.record} · GD ${night.gdText}` });
  if (input.top.length) fields.push({ name: "Top rated (EA)", inline: true, value: input.top.map((t) => `${t.name} · ${t.rating.toFixed(1)}`).join("\n").slice(0, 1024) });
  if (input.clips.length) fields.push({ name: "Clips", inline: false, value: input.clips.join("\n").slice(0, 1024) });
  return {
    title: `Match report: ${heading(e)}`,
    url: input.url,
    color: RED,
    description: ((night ? `**${night.gf}–${night.ga}**\n\n` : "") + (input.notes ?? "")).slice(0, 3500),
    fields,
    ...(input.by ? { footer: { text: `Report by ${input.by}` } } : {}),
  };
}
