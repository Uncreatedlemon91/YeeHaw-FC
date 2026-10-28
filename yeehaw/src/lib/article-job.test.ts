import { beforeEach, describe, expect, it, vi } from "vitest";

// The job's decisions, with the database stubbed: disabled, off-days, nothing
// to report, a failed Claude run (non-zero so systemd retries), a dry run
// that publishes nothing, and a published article.

const db = vi.hoisted(() => ({
  article: { findFirst: vi.fn() },
  eaMatch: { findMany: vi.fn() },
  eaClubSnapshot: { findFirst: vi.fn() },
  eaMatchPlayer: { findMany: vi.fn() },
  rosterMove: { findMany: vi.fn() },
}));
const createArticle = vi.hoisted(() => vi.fn());
vi.mock("./prisma", () => ({ prisma: db }));
vi.mock("./news", () => ({ createArticle }));
vi.mock("./club-stats", () => ({ loadLeague: async () => ({ table: [{ isUs: false }, { isUs: true }, { isUs: false }] }) }));

import { ArticleError } from "./article-rules";
import { runArticleJob } from "./article-job";

const now = new Date(Date.UTC(2026, 9, 22, 13, 15));
const match = { playedAt: new Date(Date.UTC(2026, 9, 21, 2, 0)), matchType: "leagueMatch", usScore: 3, oppScore: 1, oppName: "Rivals FC", outcome: "W", forfeit: false };
const written = { title: "Big win", summary: "dek", bodyHtml: "<p>x</p>" };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CLAUDE_CODE_OAUTH_TOKEN = "tok";
  process.env.EA_CLUB_ID = "111";
  delete process.env.ROUNDUP_DAYS;
  db.article.findFirst.mockResolvedValue(null);
  db.eaMatch.findMany.mockResolvedValue([match]);
  db.eaClubSnapshot.findFirst.mockResolvedValue({ skillRating: 1500, division: "4" });
  db.eaMatchPlayer.findMany.mockResolvedValue([{ playerName: "Viper", goals: 2, assists: 1, mom: true, rating: 8.5, cleanSheet: false, pos: "forward", saves: null, tacklesMade: 1, redCards: 0 }]);
  db.rosterMove.findMany.mockResolvedValue([]);
  createArticle.mockResolvedValue({ ok: true, warnings: [], article: { slug: "big-win" } });
});

describe("runArticleJob", () => {
  it("is disabled without a token, or without a club", async () => {
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    expect(await runArticleJob({ now })).toMatchObject({ code: 0, message: expect.stringMatching(/disabled/) });
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "tok";
    process.env.EA_CLUB_ID = "";
    expect(await runArticleJob({ now })).toMatchObject({ code: 0, message: expect.stringMatching(/EA_CLUB_ID/) });
  });

  it("skips the off-days: an AI article went out yesterday", async () => {
    db.article.findFirst.mockResolvedValue({ publishedAt: new Date(now.getTime() - 24 * 3600_000) });
    const ask = vi.fn();
    const r = await runArticleJob({ now, ask });
    expect(r).toMatchObject({ code: 0, message: expect.stringMatching(/skipping/) });
    expect(ask).not.toHaveBeenCalled();
  });

  it("goes ahead two days after the last one", async () => {
    db.article.findFirst.mockResolvedValue({ publishedAt: new Date(now.getTime() - 48 * 3600_000 + 10 * 60_000) });
    const r = await runArticleJob({ now, ask: async () => written });
    expect(r.message).toContain("published /news/big-win");
  });

  it("only looks at AI articles for the guard", async () => {
    await runArticleJob({ now, ask: async () => written });
    expect(db.article.findFirst.mock.calls[0][0].where).toMatchObject({ source: "AI", published: true });
  });

  it("a quiet stretch is a clean skip, Claude is never asked", async () => {
    db.eaMatch.findMany.mockResolvedValue([]);
    const ask = vi.fn();
    expect(await runArticleJob({ now, ask })).toMatchObject({ code: 0, message: expect.stringMatching(/no matches or squad changes/) });
    expect(ask).not.toHaveBeenCalled();
  });

  it("a squad change alone is news", async () => {
    db.eaMatch.findMany.mockResolvedValue([]);
    db.rosterMove.findMany.mockResolvedValue([{ kind: "RELEASE", displayName: "Viper", position: "STRIKER", secondaryPosition: null, createdAt: now }]);
    const ask = vi.fn().mockResolvedValue(written);
    await runArticleJob({ now, ask });
    const facts = ask.mock.calls[0][0];
    expect(facts.departures).toEqual([{ name: "Viper", position: "STRIKER", date: "Thu 22 Oct 2026" }]);
    expect(createArticle.mock.calls[0][0].category).toBe("TRANSFER");
  });

  it("hands Claude the period's facts", async () => {
    const ask = vi.fn().mockResolvedValue(written);
    await runArticleJob({ now, ask });
    const f = ask.mock.calls[0][0];
    expect(f.period).toMatchObject({ days: 2, timezone: "America/New_York", from: "Tue 20 Oct 2026", to: "Thu 22 Oct 2026" });
    expect(f.record).toMatchObject({ played: 1, won: 1, goals_for: 3, goals_against: 1 });
    expect(f.matches[0]).toMatchObject({ date: "Tue 20 Oct 2026", opponent: "Rivals FC", score: "3-1", competition: "league" });
    expect(f.players[0]).toMatchObject({ player_name: "Viper", goals: 2, avg_rating: 8.5, mom: 1 });
    expect(f.standing).toEqual({ skill_rating: 1500, division: "Division 3", skill_rating_at_start: 1500, division_at_start: "Division 3" });
    expect(f.league_table_position).toEqual({ position: 2, of: 3 });
  });

  it("publishes as AI-sourced HTML under the desk's byline, with the category from the facts", async () => {
    const r = await runArticleJob({ now, ask: async () => written });
    expect(r).toMatchObject({ code: 0, message: "published /news/big-win" });
    expect(createArticle).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Big win", body: "<p>x</p>", format: "HTML", source: "AI", published: true, category: "MATCH_HIGHLIGHT" }),
      { id: null, name: "YeeHaw FC Desk" },
    );
  });

  it("a Claude failure exits non-zero so the timer retries", async () => {
    const r = await runArticleJob({ now, ask: async () => Promise.reject(new ArticleError("Claude CLI timed out")) });
    expect(r).toMatchObject({ code: 1, message: expect.stringMatching(/timed out/) });
    expect(createArticle).not.toHaveBeenCalled();
  });

  it("a rejected article is a failure too", async () => {
    createArticle.mockResolvedValue({ ok: false, error: "nope" });
    expect(await runArticleJob({ now, ask: async () => written })).toMatchObject({ code: 1 });
  });

  it("a dry run prints the article, publishes nothing and ignores the repost guard", async () => {
    db.article.findFirst.mockResolvedValue({ publishedAt: now });
    const r = await runArticleJob({ now, dryRun: true, ask: async () => written });
    expect(r.code).toBe(0);
    expect(JSON.parse(r.message)).toEqual({ title: "Big win", summary: "dek", body_html: "<p>x</p>" });
    expect(createArticle).not.toHaveBeenCalled();
  });

  it("an announcement problem is reported but the job still succeeds (the article is live)", async () => {
    createArticle.mockResolvedValue({ ok: true, warnings: ["Discord said no"], article: { slug: "big-win" } });
    const r = await runArticleJob({ now, ask: async () => written });
    expect(r.code).toBe(0);
    expect(r.message).toContain("Discord said no");
  });
});
