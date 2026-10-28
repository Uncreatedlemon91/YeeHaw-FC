import { describe, expect, it } from "vitest";
import { diffSquad, divisionLabel, eventForMatch, num, parseMatch, parseMemberTotals, rankLeague, syncLeagueRoster, type LatestSnapshot, type LeagueRow, type RosterClub } from "./ea-rules";

// A trimmed clubs/matches answer, as EA sends it: everything a string, clubs
// and players keyed by club id.
const raw = (over: Record<string, unknown> = {}) => ({
  matchId: "9001",
  timestamp: 1_790_000_000,
  clubs: {
    "111": { goals: "3", wins: "1", losses: "0", winnerByDnf: "0", date: "1790000100" },
    "222": { goals: "1", wins: "0", losses: "1", winnerByDnf: "0", details: { name: "Rivals FC" } },
  },
  players: {
    "111": {
      "p1": { playername: "ViperGK", pos: "goalkeeper", rating: "8.4", goals: "0", assists: "0", saves: "5", cleansheetsgk: "0", cleansheetsdef: "0", mom: "0", secondsPlayed: "1200", passesmade: "10", passattempts: "12" },
      "p2": { playername: "Wall", pos: "defender", rating: "7.1", goals: "1", assists: "0", cleansheetsdef: "1", mom: "1", redcards: "0", secondsPlayed: "1200" },
      "p3": { playername: "Striker9", pos: "forward", rating: "9.0", goals: "2", assists: "1", saves: "3", mom: "0" },
    },
    "222": { "q1": { playername: "Them", pos: "forward" } },
  },
  ...over,
});

describe("parseMatch", () => {
  it("reads our side of the match", () => {
    const m = parseMatch(raw(), "111", "leagueMatch")!;
    expect(m).toMatchObject({ matchId: "9001", usScore: 3, oppScore: 1, oppName: "Rivals FC", oppClubId: "222", outcome: "W", forfeit: false, matchType: "leagueMatch" });
    expect(m.playedAt).toEqual(new Date(1790000100 * 1000)); // the club's own date wins over the top-level timestamp
  });

  it("keeps the position lowercase (clean sheets depend on it) and only credits saves to the keeper", () => {
    const m = parseMatch(raw(), "111", "leagueMatch")!;
    const by = Object.fromEntries(m.players.map((p) => [p.playerName, p]));
    expect(by.ViperGK.pos).toBe("goalkeeper");
    expect(by.ViperGK.saves).toBe(5);
    expect(by.Striker9.saves).toBeNull();
    expect(by.Wall).toMatchObject({ pos: "defender", cleanSheet: true, mom: true, minutesPlayed: 20 });
    expect(by.Striker9).toMatchObject({ goals: 2, assists: 1, rating: 9, mom: false, minutesPlayed: null });
    expect(m.players).toHaveLength(3); // the opponent's players are not ours
  });

  it("works out losses, draws and forfeits", () => {
    const loss = raw({ clubs: { "111": { goals: "0", wins: "0", losses: "1" }, "222": { goals: "2", details: { name: "X" } } } });
    expect(parseMatch(loss, "111", "leagueMatch")!.outcome).toBe("L");
    const draw = raw({ clubs: { "111": { goals: "1", wins: "0", losses: "0" }, "222": { goals: "1" } } });
    expect(parseMatch(draw, "111", "leagueMatch")!.outcome).toBe("D");
    const dnf = raw({ clubs: { "111": { goals: "3", wins: "1", losses: "0" }, "222": { goals: "0", winnerByDnf: "1" } } });
    expect(parseMatch(dnf, "111", "leagueMatch")!.forfeit).toBe(true);
    expect(parseMatch(dnf, "111", "leagueMatch")!.oppName).toBe("Opponent");
  });

  it("skips matches that aren't about our club or have no id", () => {
    expect(parseMatch(raw(), "999", "leagueMatch")).toBeNull();
    expect(parseMatch(raw({ matchId: "  " }), "111", "leagueMatch")).toBeNull();
    expect(parseMatch(null, "111", "leagueMatch")).toBeNull();
  });

  it("keeps the first line when a name repeats", () => {
    const dup = raw({ players: { "111": { a: { playername: "Same", goals: "1" }, b: { playername: "Same", goals: "5" } } } });
    expect(parseMatch(dup, "111", "leagueMatch")!.players).toHaveLength(1);
  });

  it("reads numbers the way EA sends them", () => {
    expect(num("3")).toBe(3);
    expect(num("7.5")).toBe(7.5);
    expect(num("")).toBeNull();
    expect(num(undefined)).toBeNull();
    expect(num("abc")).toBeNull();
  });
});

describe("parseMemberTotals", () => {
  const members = [
    { name: "Viper", gamesPlayed: "12", goals: "4", assists: "2", manOfTheMatch: "1", ratingAve: "7.35", cleanSheetsDef: "3", cleanSheetsGK: "0", passSuccessRate: "81" },
    { name: "  ", gamesPlayed: "1" },
    { name: "Keeper", cleanSheetsGK: "5" },
    { name: "NoSheets" },
  ];
  it("takes season totals per named member", () => {
    const rows = parseMemberTotals(members);
    expect(rows.map((r) => r.playerName)).toEqual(["Viper", "Keeper", "NoSheets"]);
    expect(rows[0]).toMatchObject({ gamesPlayed: 12, goals: 4, mom: 1, ratingAvg: 7.35, passSuccess: 81, cleanSheets: 3 });
  });
  it("takes the larger of the two clean-sheet counts, null when EA sent neither", () => {
    const rows = parseMemberTotals(members);
    expect(rows[1].cleanSheets).toBe(5);
    expect(rows[2].cleanSheets).toBeNull();
  });
  it("copes with nothing", () => {
    expect(parseMemberTotals(undefined)).toEqual([]);
  });
});

describe("diffSquad", () => {
  it("the first sight of a squad is only a baseline", () => {
    const d = diffSquad([], ["A", "B"]);
    expect(d).toMatchObject({ baseline: true, joined: ["A", "B"], left: [], ignored: false });
  });
  it("then it reports signings and departures", () => {
    const d = diffSquad(["A", "B"], ["B", "C"]);
    expect(d).toMatchObject({ baseline: false, joined: ["C"], left: ["A"] });
  });
  it("an empty list is EA failing, not everyone leaving", () => {
    expect(diffSquad(["A", "B"], [null, " ", undefined]).ignored).toBe(true);
  });
  it("trims names and ignores duplicates", () => {
    expect(diffSquad([], [" A ", "A", "B"]).current).toEqual(["A", "B"]);
  });
});

describe("divisionLabel", () => {
  it("is one below EA's number, and 1 is Elite", () => {
    expect(divisionLabel("4")).toBe("Division 3");
    expect(divisionLabel(3)).toBe("Division 2");
    expect(divisionLabel("1")).toBe("Elite");
  });
  it("is null for anything else", () => {
    expect(divisionLabel("x")).toBeNull();
    expect(divisionLabel(0)).toBeNull();
    expect(divisionLabel(null)).toBeNull();
  });
});

describe("syncLeagueRoster", () => {
  const t = (n: number) => new Date(Date.UTC(2026, 9, n));
  const club = (clubId: string, addedAt: Date, pinned = false): RosterClub => ({ clubId, label: clubId, addedAt, pinned });
  const snaps = (o: Record<string, LatestSnapshot>) => new Map(Object.entries(o));
  const base = { ourClubId: "us", ourLabel: "Us", maxTeams: 3, now: t(20) };

  it("always has our own club, pinned", () => {
    const r = syncLeagueRoster({ ...base, roster: [], snapshots: snaps({}), opponents: [] });
    expect(r).toEqual([expect.objectContaining({ clubId: "us", pinned: true })]);
  });

  it("adds the opponents we have played", () => {
    const r = syncLeagueRoster({ ...base, roster: [club("us", t(1), true)], snapshots: snaps({}), opponents: [{ clubId: "a", label: "A" }] });
    expect(r.map((c) => c.clubId)).toEqual(["us", "a"]);
  });

  it("when full, the lowest rated non-pinned club makes room", () => {
    const roster = [club("us", t(1), true), club("hi", t(2)), club("lo", t(3))];
    const r = syncLeagueRoster({
      ...base,
      roster,
      snapshots: snaps({ us: { division: "4", skillRating: 1000 }, hi: { division: "4", skillRating: 1500 }, lo: { division: "4", skillRating: 900 } }),
      opponents: [{ clubId: "new", label: "New" }],
    });
    expect(r.map((c) => c.clubId).sort()).toEqual(["hi", "new", "us"]);
  });

  it("an unpolled club counts as lowest, and ties go to the one in the table longest", () => {
    const roster = [club("us", t(1), true), club("old", t(2)), club("newer", t(3))];
    const r = syncLeagueRoster({ ...base, roster, snapshots: snaps({ us: { division: "4", skillRating: 1000 } }), opponents: [{ clubId: "x", label: "X" }] });
    expect(r.map((c) => c.clubId).sort()).toEqual(["newer", "us", "x"]);
  });

  it("never evicts our own club, even if everyone else is pinned too", () => {
    const roster = [club("us", t(1), true), club("p1", t(2), true), club("p2", t(3), true)];
    const r = syncLeagueRoster({ ...base, roster, snapshots: snaps({}), opponents: [{ clubId: "x", label: "X" }] });
    expect(r.map((c) => c.clubId)).toEqual(["us", "p1", "p2"]);
  });

  it("drops members whose tier drifted from ours and never re-adds an off-division opponent", () => {
    const roster = [club("us", t(1), true), club("drifted", t(2)), club("same", t(3))];
    const r = syncLeagueRoster({
      ...base,
      maxTeams: 10,
      roster,
      snapshots: snaps({ us: { division: "4", skillRating: 1 }, drifted: { division: "7", skillRating: 1 }, same: { division: "4", skillRating: 1 }, away: { division: "9", skillRating: 1 } }),
      opponents: [{ clubId: "away", label: "Away" }, { clubId: "drifted", label: "Drifted" }, { clubId: "fresh", label: "Fresh" }],
    });
    expect(r.map((c) => c.clubId).sort()).toEqual(["fresh", "same", "us"]);
  });
});

describe("rankLeague", () => {
  const row = (clubId: string, over: Partial<LeagueRow> = {}): LeagueRow => ({ clubId, label: clubId, isUs: false, division: "4", skillRating: null, points: null, played: 0, teamSize: null, form: [], hasData: true, ...over });
  it("keeps only our tier, ranked by skill rating, points breaking ties, unknown last", () => {
    const t = rankLeague([
      row("us", { isUs: true, skillRating: 1000, points: 5 }),
      row("tie", { skillRating: 1000, points: 9 }),
      row("top", { skillRating: 1200 }),
      row("unknown"),
      row("other", { division: "7", skillRating: 5000 }),
    ]);
    expect(t.map((r) => r.clubId)).toEqual(["top", "tie", "us", "unknown"]);
  });
  it("shows everyone while our own tier isn't known", () => {
    expect(rankLeague([row("us", { isUs: true, division: null }), row("a", { division: "7" })])).toHaveLength(2);
  });
});

describe("eventForMatch", () => {
  const h = 3600_000;
  const start = new Date(Date.UTC(2026, 9, 20, 0, 0));
  const ev = (id: string, startsAt: Date, over: Record<string, unknown> = {}) => ({ id, startsAt, endsAt: new Date(startsAt.getTime() + 2 * h), type: "MATCH" as const, ...over });
  const at = (ms: number) => new Date(start.getTime() + ms);

  it("links a match played inside the event's window", () => {
    expect(eventForMatch(at(h), [ev("e", start)])).toBe("e");
  });
  it("allows a little before kick-off and a grace after the end", () => {
    expect(eventForMatch(at(-20 * 60_000), [ev("e", start)])).toBe("e");
    expect(eventForMatch(at(2 * h + 20 * 60_000), [ev("e", start)])).toBe("e");
    expect(eventForMatch(at(-45 * 60_000), [ev("e", start)])).toBeNull();
    expect(eventForMatch(at(2 * h + 45 * 60_000), [ev("e", start)])).toBeNull();
  });
  it("with no end set, the window is three hours", () => {
    expect(eventForMatch(at(2.9 * h), [ev("e", start, { endsAt: null })])).toBe("e");
    expect(eventForMatch(at(3.8 * h), [ev("e", start, { endsAt: null })])).toBeNull();
  });
  it("only match-type events take a match", () => {
    expect(eventForMatch(at(h), [ev("t", start, { type: "TRAINING" })])).toBeNull();
    expect(eventForMatch(at(h), [ev("s", start, { type: "SCRIM" })])).toBe("s");
  });
  it("where windows overlap the nearest start wins", () => {
    expect(eventForMatch(at(2.2 * h), [ev("early", start), ev("late", at(2 * h))])).toBe("late");
  });
  it("an undated match links to nothing", () => {
    expect(eventForMatch(null, [ev("e", start)])).toBeNull();
  });
});
