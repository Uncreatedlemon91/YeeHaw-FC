import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { alreadyPostedThisPeriod, ArticleError, categoryFor, claudeArgs, CLAUDE_TIMEOUT_MS, dayLabel, hasNews, readEnvelope, userPrompt, type Facts, type Written } from "./article-rules";
import { divisionLabel } from "./ea-rules";
import { env } from "./env";
import { createArticle } from "./news";
import { prisma } from "./prisma";
import { keepsCleanSheet } from "./service-record";

// The AI roundup, every ROUNDUP_DAYS days (scripts/article-job.ts runs it from
// yeehaw-article.timer, daily at 09:15 Eastern; this skips the days between).
// Port of proclubs/weekly_article.py: gather the period's facts (results,
// player totals, division and skill-rating movement and league position from
// the EA tables, transfer news from the roster moves), hand them to the Claude
// Code CLI in headless mode with every tool disabled, and publish what comes
// back as a live article announced in Discord like a staff-written one.
//
// The CLI rather than the API SDK so the writing is billed to a Claude
// subscription (CLAUDE_CODE_OAUTH_TOKEN), not API credits. The output is
// sanitised like any other HTML article (createArticle).

export type JobResult = { code: 0 | 1; message: string; written?: Written };

// --- Facts ------------------------------------------------------------------------- //

/** The period's roster news: confirmed signings and departures, never a pending or declined offer. */
async function squadMoves(since: Date, tz: string) {
  const moves = await prisma.rosterMove.findMany({
    where: { createdAt: { gte: since }, kind: { in: ["ACCEPT", "SIGNING", "STAFF_OFFER", "RELEASE"] } },
    orderBy: { createdAt: "asc" }, // oldest first, as the story happened
  });
  const out: Pick<Facts, "signings" | "staff_appointments" | "departures"> = { signings: [], staff_appointments: [], departures: [] };
  for (const m of moves) {
    const entry = { name: m.displayName, position: [m.position, m.secondaryPosition].filter(Boolean).join(" / ") || null, date: dayLabel(m.createdAt, tz) };
    (m.kind === "RELEASE" ? out.departures : m.kind === "STAFF_OFFER" ? out.staff_appointments : out.signings).push(entry);
  }
  return out;
}

export async function gatherPeriod(now: Date): Promise<Facts> {
  const platform = env.eaPlatform;
  const clubId = env.eaClubId;
  const days = env.roundupDays;
  const tz = env.timezone;
  const since = new Date(now.getTime() - days * 24 * 3600_000);
  const day = (d: Date | null) => dayLabel(d, tz);

  const matches = await prisma.eaMatch.findMany({ where: { platform, clubId, playedAt: { gte: since } }, orderBy: { playedAt: "asc" } });
  const counted = matches.filter((m) => !m.forfeit);

  // The division goes through divisionLabel: EA's raw number runs one above
  // the in-game division, which once had the article announce a promotion to
  // Division 3 after the club had gone up to Division 2. EA's points are left
  // out: they're unverified.
  const [latest, atStart] = await Promise.all([
    prisma.eaClubSnapshot.findFirst({ where: { platform, clubId }, orderBy: [{ capturedAt: "desc" }, { id: "desc" }] }),
    prisma.eaClubSnapshot.findFirst({ where: { platform, clubId, capturedAt: { lte: since } }, orderBy: [{ capturedAt: "desc" }, { id: "desc" }] }),
  ]);
  let standing: Facts["standing"] = null;
  if (latest) {
    standing = { skill_rating: latest.skillRating };
    const division = divisionLabel(latest.division);
    if (division) standing.division = division;
    if (atStart) {
      standing.skill_rating_at_start = atStart.skillRating;
      const startDivision = divisionLabel(atStart.division);
      if (division && startDivision) standing.division_at_start = startDivision;
    }
  }

  const lines = await prisma.eaMatchPlayer.findMany({ where: { match: { platform, clubId, playedAt: { gte: since }, forfeit: false } } });
  const by = new Map<string, Facts["players"][number] & { sum: number; rated: number }>();
  for (const l of lines) {
    const p = by.get(l.playerName) ?? { player_name: l.playerName, apps: 0, goals: 0, assists: 0, avg_rating: null, mom: 0, clean_sheets: 0, saves: 0, tackles: 0, red_cards: 0, sum: 0, rated: 0 };
    p.apps++;
    p.goals += l.goals ?? 0;
    p.assists += l.assists ?? 0;
    p.mom += l.mom ? 1 : 0;
    p.clean_sheets += keepsCleanSheet(l) ? 1 : 0;
    p.saves += l.saves ?? 0;
    p.tackles += l.tacklesMade ?? 0;
    p.red_cards += l.redCards ?? 0;
    if (l.rating) (p.sum += l.rating), p.rated++;
    by.set(l.playerName, p);
  }
  const players = [...by.values()]
    .map(({ sum, rated, ...p }) => ({ ...p, avg_rating: rated ? Math.round((sum / rated) * 100) / 100 : null }))
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists || (b.avg_rating ?? 0) - (a.avg_rating ?? 0));

  const { loadLeague } = await import("./club-stats");
  const league = await loadLeague();
  const at = league?.table.findIndex((r) => r.isUs) ?? -1;
  const recent = matches.filter((m) => !m.forfeit).slice(-5);

  return {
    club: "YeeHaw FC",
    period: { from: day(since), to: day(now), days, timezone: tz },
    record: {
      played: counted.length,
      won: counted.filter((m) => m.outcome === "W").length,
      drawn: counted.filter((m) => m.outcome === "D").length,
      lost: counted.filter((m) => m.outcome === "L").length,
      goals_for: counted.reduce((n, m) => n + (m.usScore ?? 0), 0),
      goals_against: counted.reduce((n, m) => n + (m.oppScore ?? 0), 0),
    },
    matches: matches.map((m) => ({ date: day(m.playedAt), competition: m.matchType === "playoffMatch" ? "playoff" : "league", opponent: m.oppName, score: `${m.usScore}-${m.oppScore}`, result: m.outcome, forfeit: m.forfeit })),
    players,
    standing,
    league_table_position: at >= 0 && league ? { position: at + 1, of: league.table.length } : null,
    // The last five results overall (not just this period), oldest first.
    form_last_5: (await lastFive(platform, clubId, recent)).map((m) => m.outcome),
    ...(await squadMoves(since, tz)),
  };
}

async function lastFive(platform: string, clubId: string, fallback: { outcome: string }[]) {
  const rows = await prisma.eaMatch.findMany({ where: { platform, clubId, forfeit: false }, orderBy: { playedAt: "desc" }, take: 5, select: { outcome: true } });
  return rows.length ? rows.reverse() : fallback;
}

// --- Asking Claude ------------------------------------------------------------------- //

/** Only what the CLI needs: no database URL, no Discord token, nothing of the site's. */
function cliEnv(): Record<string, string> {
  const keep = ["PATH", "HOME", "LANG", "LC_ALL", "TERM", "TMPDIR", "USER", "SHELL"];
  const out: Record<string, string> = Object.fromEntries(keep.filter((k) => process.env[k]).map((k) => [k, process.env[k] as string]));
  out.CLAUDE_CODE_OAUTH_TOKEN = env.claudeToken;
  return out;
}

/** Runs the CLI with the facts on stdin and returns the parsed article. Throws ArticleError on any failure. */
export async function askClaude(facts: Facts, run: typeof runClaude = runClaude): Promise<Written> {
  const { stdout, stderr, code } = await run(claudeArgs("YeeHaw FC", env.roundupDays, env.claudeModel), userPrompt(facts));
  return readEnvelope(stdout, stderr, code);
}

export async function runClaude(args: string[], input: string): Promise<{ stdout: string; stderr: string; code: number | null }> {
  // A scratch cwd so the CLI never picks up this repo's CLAUDE.md or settings.
  const cwd = await mkdtemp(path.join(tmpdir(), "yeehaw-article-"));
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(env.claudeBin, args, { cwd, env: cliEnv() as NodeJS.ProcessEnv, stdio: ["pipe", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new ArticleError("Claude CLI timed out"));
      }, CLAUDE_TIMEOUT_MS);
      child.stdout.on("data", (d) => (stdout += d));
      child.stderr.on("data", (d) => (stderr += d));
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(new ArticleError((e as NodeJS.ErrnoException).code === "ENOENT" ? `Claude CLI not found at '${env.claudeBin}': set CLAUDE_BIN` : `Claude CLI could not start: ${e.message}`));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ stdout, stderr, code });
      });
      child.stdin.on("error", () => undefined); // the CLI exiting early is reported by its exit
      child.stdin.end(input);
    });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

// --- The job -------------------------------------------------------------------------- //

export async function runArticleJob(opts: { dryRun?: boolean; now?: Date; ask?: typeof askClaude } = {}): Promise<JobResult> {
  const now = opts.now ?? new Date();
  if (!env.claudeToken) return { code: 0, message: "CLAUDE_CODE_OAUTH_TOKEN not set: the roundup is disabled" };
  if (!env.eaClubId) return { code: 0, message: "EA_CLUB_ID not set: nothing to write about" };

  if (!opts.dryRun) {
    const last = await prisma.article.findFirst({ where: { source: "AI", published: true }, orderBy: { publishedAt: "desc" }, select: { publishedAt: true } });
    if (alreadyPostedThisPeriod(last?.publishedAt ?? null, now, env.roundupDays)) return { code: 0, message: `a roundup went out in the last ${env.roundupDays} days: skipping` };
  }

  const facts = await gatherPeriod(now);
  if (!hasNews(facts)) return { code: 0, message: `no matches or squad changes in the last ${env.roundupDays} days: skipping` };

  let written: Written;
  try {
    written = await (opts.ask ?? askClaude)(facts);
  } catch (e) {
    if (e instanceof ArticleError) return { code: 1, message: `could not write the article: ${e.message}` };
    throw e;
  }
  if (opts.dryRun) return { code: 0, message: JSON.stringify({ title: written.title, summary: written.summary, body_html: written.bodyHtml }, null, 2), written };

  const r = await createArticle(
    { title: written.title, summary: written.summary || null, body: written.bodyHtml, category: categoryFor(facts), published: true, format: "HTML", source: "AI" },
    { id: null, name: env.articleAuthor },
  );
  if (!r.ok) return { code: 1, message: `Claude's article was rejected: ${r.error}`, written };
  // The article is live; a Discord problem is logged, not retried (a retry would re-publish nothing, only re-fail).
  return { code: 0, message: [`published /news/${r.article.slug}`, ...r.warnings].join("\n"), written };
}
