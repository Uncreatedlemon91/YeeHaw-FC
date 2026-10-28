import { describe, expect, it } from "vitest";
import { eaMatchTotal, playerTotals, recentForm, recordOf, rivalRecords, type MatchRow, type PlayerLine } from "./stats-rules";

const m = (n: number, over: Partial<MatchRow> = {}): MatchRow => ({ playedAt: new Date(Date.UTC(2026, 9, n)), matchType: "leagueMatch", usScore: 2, oppScore: 1, oppName: "Rivals FC", outcome: "W", forfeit: false, ...over });

describe("form and record", () => {
  it("form is the last five, oldest first, with forfeits skipped", () => {
    const ms = [m(1, { outcome: "L" }), m(2), m(3, { forfeit: true }), m(4, { outcome: "D" }), m(5), m(6), m(7, { outcome: "L" })];
    expect(recentForm(ms)).toEqual(["W", "D", "W", "W", "L"]);
    expect(recentForm(ms, 2)).toEqual(["W", "L"]);
  });
  it("the record leaves forfeits out", () => {
    const r = recordOf([m(1), m(2, { outcome: "D", usScore: 1, oppScore: 1 }), m(3, { outcome: "L", usScore: 0, oppScore: 3 }), m(4, { forfeit: true })]);
    expect(r).toEqual({ played: 3, won: 1, drawn: 1, lost: 1, gf: 3, ga: 5 });
  });
});

// Ports of test_db.py's rival_records tests.
describe("rivalRecords", () => {
  it("aggregates head-to-head by opponent", () => {
    const rivals = rivalRecords([
      m(1, { oppName: "Rivals FC", usScore: 2, oppScore: 1, outcome: "W" }),
      m(2, { oppName: "Rivals FC", usScore: 1, oppScore: 1, outcome: "D" }),
      m(3, { oppName: "Steel City SC", usScore: 0, oppScore: 2, outcome: "L" }),
    ]);
    const by = Object.fromEntries(rivals.map((r) => [r.name, r]));
    expect(by["Rivals FC"]).toMatchObject({ played: 2, won: 1, drawn: 1, lost: 0, gf: 3, ga: 2, lastOutcome: "D" }); // the more recent meeting
    expect(by["Steel City SC"]).toMatchObject({ played: 1, lost: 1, lastOutcome: "L" });
  });
  it("excludes forfeits", () => {
    const rivals = rivalRecords([m(1, { forfeit: true }), m(2)]);
    expect(rivals).toHaveLength(1);
    expect(rivals[0]).toMatchObject({ played: 1, won: 1, gf: 2, ga: 1, lastPlayedAt: new Date(Date.UTC(2026, 9, 2)) });
  });
  it("sorts by matches played, most first", () => {
    const rivals = rivalRecords([m(1, { oppName: "Steel City SC" }), m(2, { oppName: "Rivals FC" }), m(3, { oppName: "Rivals FC" })]);
    expect(rivals.map((r) => r.name)).toEqual(["Rivals FC", "Steel City SC"]);
  });
});

const pl = (name: string, day: number, over: Partial<PlayerLine> = {}): PlayerLine => ({ playerName: name, playerId: null, rating: 7, goals: 0, assists: 0, mom: false, cleanSheet: false, pos: "midfielder", redCards: 0, playedAt: new Date(Date.UTC(2026, 9, day)), ...over });

describe("playerTotals", () => {
  it("adds a player's lines, treating the same gamertag in a different case as one player", () => {
    const t = playerTotals([pl("Viper", 1, { goals: 2 }), pl("VIPER", 2, { goals: 1, assists: 1, mom: true })]);
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ apps: 2, goals: 3, assists: 1, mom: 1 });
  });
  it("credits clean sheets by position", () => {
    const t = playerTotals([pl("Wall", 1, { cleanSheet: true, pos: "defender" }), pl("Wall", 2, { cleanSheet: true, pos: "forward" })]);
    expect(t[0].cleanSheets).toBe(1);
  });
  it("form needs three rated games and averages the latest five", () => {
    const few = playerTotals([pl("A", 1), pl("A", 2)]);
    expect(few[0].form).toBeNull();
    const lines = [1, 2, 3, 4, 5, 6].map((d) => pl("B", d, { rating: d === 1 ? 1 : 8 }));
    expect(playerTotals(lines)[0].form).toBe(8); // the 1.0 from day 1 is outside the last five
    expect(playerTotals(lines)[0].rating).toBe(6.83);
  });
  it("orders by goals, then assists, then rating", () => {
    const t = playerTotals([pl("A", 1, { goals: 1 }), pl("B", 1, { goals: 3 }), pl("C", 1, { goals: 1, assists: 2 })]);
    expect(t.map((p) => p.name)).toEqual(["B", "C", "A"]);
  });
});

describe("eaMatchTotal", () => {
  it("is wins + ties + losses of the latest snapshot", () => {
    expect(eaMatchTotal({ wins: 5, ties: 2, losses: 3 })).toBe(10);
    expect(eaMatchTotal({ wins: null, ties: null, losses: null })).toBeNull();
    expect(eaMatchTotal(null)).toBeNull();
  });
});
