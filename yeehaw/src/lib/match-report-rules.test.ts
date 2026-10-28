import { describe, expect, it } from "vitest";
import { motmId, nightSummary, reportEmbed, resultText, scorers, topRated, voteMessage, type ReportLine } from "./match-report-rules";

const g = (usScore: number | null, oppScore: number | null) => ({ usScore, oppScore, playedAt: null, oppName: "X" });

describe("nightSummary", () => {
  it("adds the night up: record, goals, difference", () => {
    const n = nightSummary([g(3, 1), g(1, 1), g(0, 2), g(4, 0)])!;
    expect(n).toMatchObject({ games: 4, wins: 2, draws: 1, losses: 1, gf: 8, ga: 4, gd: 4, gdText: "+4", record: "2W 1D 1L" });
  });
  it("shows a negative difference with a proper minus and leaves out zeros in the record", () => {
    const n = nightSummary([g(0, 2), g(1, 2)])!;
    expect(n.gdText).toBe("−3");
    expect(n.record).toBe("2L");
  });
  it("leaves out matches without both scores, and is null when EA recorded nothing", () => {
    expect(nightSummary([g(null, 1), g(2, null)])).toBeNull();
    expect(nightSummary([])).toBeNull();
    expect(nightSummary([g(null, 1), g(1, 0)])!.games).toBe(1);
  });
  it("a level night has a zero difference", () => {
    expect(nightSummary([g(1, 1)])!.gdText).toBe("0");
  });
  it("text results", () => {
    expect(resultText(2, 1)).toBe("W 2-1");
    expect(resultText(1, 1)).toBe("D 1-1");
    expect(resultText(0, 3)).toBe("L 0-3");
    expect(resultText(null, 3)).toBeNull();
  });
});

const line = (name: string, over: Partial<ReportLine> = {}): ReportLine => ({ name, playerId: null, rating: null, goals: null, assists: null, matchId: "m1", ...over });

describe("scorers and top rated", () => {
  it("scorers add goals across the night, most first", () => {
    const s = scorers([line("A", { goals: 1 }), line("b", { goals: 0 }), line("B", { goals: 2, matchId: "m2" }), line("a", { goals: 1, matchId: "m2" })]);
    expect(s).toEqual([
      { name: "A", goals: 2 },
      { name: "B", goals: 2 },
    ]); // "a" and "A" are one player; level goals sort by name
    expect(scorers([line("A", { goals: 1 }), line("B", { goals: 3 })]).map((x) => x.name)).toEqual(["B", "A"]);
  });
  it("top rated averages a player's ratings across the night and skips unrated lines", () => {
    const t = topRated([line("A", { rating: 8 }), line("A", { rating: 6, matchId: "m2" }), line("B", { rating: 7.5 }), line("C", { rating: 0 }), line("D")]);
    expect(t).toEqual([
      { name: "B", rating: 7.5 },
      { name: "A", rating: 7 },
    ]);
    expect(topRated([line("A", { rating: 5 }), line("B", { rating: 6 })], 1)).toHaveLength(1);
  });
});

describe("Discord messages", () => {
  const event = { id: "ev1", title: "Friday scrim", opponent: "Rivals FC" };
  it("the vote message has two pickers on the motm namespace, option values are player ids", () => {
    const players = Array.from({ length: 30 }, (_, i) => ({ playerId: `p${i}`, name: `Player ${i}` }));
    const m = voteMessage(event, players, "https://x/fixtures/ev1", new Date(Date.UTC(2026, 9, 22)));
    const [vote, rate] = m.components.map((c) => c.components[0] as { custom_id: string; options: { label: string; value: string }[] });
    expect(vote.custom_id).toBe(motmId("vote", "ev1"));
    expect(vote.custom_id).toBe("motm:vote:ev1");
    expect(vote.options).toHaveLength(25); // Discord's limit
    expect(vote.options[0]).toEqual({ label: "Player 0", value: "p0" });
    expect(rate.custom_id).toBe("motm:rate:ev1");
    expect(rate.options.map((o) => o.value)).toEqual(["10", "9", "8", "7", "6", "5", "4", "3", "2", "1"]);
    expect(m.embeds[0].title).toBe("Full time: Friday scrim vs Rivals FC");
    expect(m.embeds[0].description).toContain("<t:");
  });
  it("the report embed carries the score, winner, night and top rated, and drops what is missing", () => {
    const e = reportEmbed({
      event,
      url: "https://x/fixtures/ev1",
      notes: "Controlled the middle.",
      night: nightSummary([g(3, 1), g(2, 2)]),
      motm: { names: ["A", "B"], votes: 4 },
      top: [{ name: "A", rating: 8.25 }],
      clips: [],
      by: "Coach",
    });
    expect(e.description).toBe("**5–3**\n\nControlled the middle.");
    expect(e.fields.map((f) => f.name)).toEqual(["Man of the Match", "Match night", "Top rated (EA)"]);
    expect(e.fields[0].value).toBe("A & B (4 votes)");
    expect(e.fields[2].value).toBe("A · 8.3");
    expect(e.footer).toEqual({ text: "Report by Coach" });
    const bare = reportEmbed({ event, url: "u", notes: null, night: null, motm: null, top: [], clips: [], by: null });
    expect(bare.fields).toEqual([]);
    expect(bare.description).toBe("");
  });
});
