import { formatInTimeZone } from "date-fns-tz";

// The AI roundup with no database and no process: when it is due, what it is
// told, what it is given, and how its answer is read. Port of the pure parts
// of proclubs/weekly_article.py. The writer is the Claude Code CLI run
// headless with every tool disabled: a pure "facts in, article out" call, and
// the facts include EA-controlled strings (player and club names) that have no
// business steering anything.

/**
 * The daily timer can fire a little early or late (RandomizedDelaySec, a retry
 * after a usage limit), so "posted within the period" allows a few hours'
 * slack: a roundup at 09:20 Monday still lets Wednesday's 09:10 one through,
 * and still stops Tuesday's.
 */
export const REPOST_SLACK_MS = 6 * 3600_000;
export const CLAUDE_TIMEOUT_MS = 600_000;

const DAY = 24 * 3600_000;

/** Posted within the period: the daily run skips the days in between (keeps the rhythm through month ends and downtime where a calendar rule wouldn't). */
export function alreadyPostedThisPeriod(lastPublishedAt: Date | null, now: Date, days: number): boolean {
  if (!lastPublishedAt) return false;
  return lastPublishedAt.getTime() >= now.getTime() - (days * DAY - REPOST_SLACK_MS);
}

/** A day as the club lives it, in the club's zone, so a late-evening game isn't dated the next day. */
export const dayLabel = (d: Date | null, tz: string) => (d ? formatInTimeZone(d, tz, "EEE dd MMM yyyy") : null);

export const SYSTEM_PROMPT = `You are the staff writer for {site}, an EA Sports FC Pro Clubs team. You write the club's regular roundup for its website, covering the last {days} days: energetic, broadcast-style football journalism, written for the squad and its fans.

Rules:
- Use ONLY the facts in the JSON you are given. Never invent scores, scorers, quotes, opponents, fixtures or events. If a number isn't there, don't state one.
- Player and club names are gamertags; reproduce them exactly.
- Cover, where the data has them: the results and the story of those days, standout players, division, league table position, skill rating and how it moved, and transfer news (signings, staff appointments and departures). Skip any section the data has nothing for.
- Name the club's division only as standing.division gives it. Claim a promotion or relegation only if standing.division_at_start is present and differs from it.
- 250-500 words. Don't call it a weekly roundup.

Reply with a single JSON object and nothing else, no code fences, no commentary:
{"title": "...", "summary": "one-sentence dek, under 160 characters", "body_html": "the article as HTML"}
body_html may use only <p>, <h2>, <h3>, <strong>, <em>, <ul>, <ol>, <li>, <blockquote>, and <table>/<thead>/<tbody>/<tr>/<th>/<td>. Don't repeat the title in it.`;

export const systemPrompt = (site: string, days: number) => SYSTEM_PROMPT.replaceAll("{site}", site).replaceAll("{days}", String(days));

/** What the user message carries: the facts, as JSON. */
export const userPrompt = (facts: unknown) => "Write the roundup from these facts:\n\n" + JSON.stringify(facts, null, 2);

/** The CLI's arguments: headless, JSON envelope, NO tools, no MCP, nothing saved. The prompt itself goes on stdin. */
export function claudeArgs(site: string, days: number, model: string): string[] {
  const args = ["-p", "--output-format", "json", "--tools", "", "--strict-mcp-config", "--no-session-persistence", "--system-prompt", systemPrompt(site, days)];
  if (model) args.push("--model", model);
  return args;
}

export type Facts = {
  club: string;
  period: { from: string | null; to: string | null; days: number; timezone: string };
  record: { played: number; won: number; drawn: number; lost: number; goals_for: number; goals_against: number };
  matches: { date: string | null; competition: "playoff" | "league"; opponent: string | null; score: string; result: string; forfeit: boolean }[];
  players: { player_name: string; apps: number; goals: number; assists: number; avg_rating: number | null; mom: number; clean_sheets: number; saves: number; tackles: number; red_cards: number }[];
  standing: { skill_rating: number | null; division?: string; skill_rating_at_start?: number | null; division_at_start?: string } | null;
  league_table_position: { position: number; of: number } | null;
  form_last_5: string[];
  signings: { name: string; position: string | null; date: string | null }[];
  staff_appointments: { name: string; position: string | null; date: string | null }[];
  departures: { name: string; position: string | null; date: string | null }[];
};

/** A period with nothing to report is a clean skip, not a failure. */
export const hasNews = (f: Pick<Facts, "matches" | "signings" | "staff_appointments" | "departures">) => !!(f.matches.length || f.signings.length || f.staff_appointments.length || f.departures.length);

export const categoryFor = (f: Pick<Facts, "matches">) => (f.matches.length ? ("MATCH_HIGHLIGHT" as const) : ("TRANSFER" as const));

export class ArticleError extends Error {}

export type Written = { title: string; summary: string; bodyHtml: string };

/** Reads the model's reply: tolerant of a stray code fence or preamble around the object. */
export function parseWritten(text: string): Written {
  const match = /\{[\s\S]*\}/.exec(text);
  if (!match) throw new ArticleError("Claude's reply had no JSON object in it");
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(match[0]);
  } catch (e) {
    throw new ArticleError(`Claude's reply wasn't valid JSON: ${e instanceof Error ? e.message : e}`);
  }
  const s = (k: string) => (typeof data[k] === "string" ? (data[k] as string) : "");
  if (!s("title").trim() || !s("body_html").trim()) throw new ArticleError("Claude's reply is missing a title or body");
  return { title: s("title").trim().slice(0, 200), summary: s("summary").trim().slice(0, 300), bodyHtml: s("body_html") };
}

/** The CLI's JSON envelope: {result, is_error}. Anything else is a failure with what it said. */
export function readEnvelope(stdout: string, stderr: string, code: number | null): Written {
  let envelope: { result?: unknown; is_error?: unknown };
  try {
    envelope = JSON.parse(stdout);
  } catch {
    throw new ArticleError(`Claude CLI failed (exit ${code}): ${(stderr || stdout).trim().slice(0, 500)}`);
  }
  if (code !== 0 || envelope.is_error) throw new ArticleError(`Claude CLI reported an error: ${String(envelope.result).slice(0, 500)}`);
  return parseWritten(typeof envelope.result === "string" ? envelope.result : "");
}
