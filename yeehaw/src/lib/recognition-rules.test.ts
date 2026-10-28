import { describe, expect, it } from "vitest";
import {
  choosePotm,
  emptyMetrics,
  metricsByPlayer,
  milestoneRank,
  MILESTONES,
  motmResult,
  newMilestones,
  parseRating,
  previousMonth,
  voteDue,
  voteRefusal,
  voteState,
  VOTE_OPENS_AFTER_MS,
  VOTE_WINDOW_MS,
  winsFrom,
} from "./recognition-rules";

const line = (playerId: string, over: Record<string, unknown> = {}) => ({ playerId, goals: 0, assists: 0, cleanSheet: false, pos: "midfielder", ...over });

describe("milestones", () => {
  it("keys follow the old site's (apps-25, cs-5, motm-1) so ribbons keep their families", () => {
    const keys = MILESTONES.map((m) => m.key);
    expect(keys).toContain("apps-25");
    expect(keys).toContain("goals-1");
    expect(keys).toContain("cs-10");
    expect(keys).toContain("motm-5");
    expect(new Set(MILESTONES.map((m) => m.key.split("-")[0]))).toEqual(new Set(["apps", "goals", "assists", "cs", "motm"]));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("counts a player's lines and the squad's Man of the Match wins", () => {
    const m = metricsByPlayer([line("a", { goals: 2, assists: 1 }), line("a", { goals: 1 }), line("b")], new Map([["a", 3]]), ["a", "b"]);
    expect(m.get("a")).toEqual({ apps: 2, goals: 3, assists: 1, cleanSheets: 0, squadMotm: 3 });
    expect(m.get("b")).toEqual({ ...emptyMetrics(), apps: 1 });
  });

  it("credits clean sheets only to keepers and defenders (the position is lowercase)", () => {
    const m = metricsByPlayer(
      [line("a", { cleanSheet: true, pos: "goalkeeper" }), line("a", { cleanSheet: true, pos: "defender" }), line("a", { cleanSheet: true, pos: "forward" }), line("a", { cleanSheet: false, pos: "defender" })],
      new Map(),
      ["a"],
    );
    expect(m.get("a")!.cleanSheets).toBe(2);
  });

  it("ignores lines for people who aren't in the list", () => {
    expect(metricsByPlayer([line("zz")], new Map(), ["a"]).get("a")!.apps).toBe(0);
  });

  it("awards each threshold reached once, and not what is already held", () => {
    const metrics = new Map([["a", { apps: 25, goals: 1, assists: 0, cleanSheets: 0, squadMotm: 0 }]]);
    const first = newMilestones(metrics, new Set()).map((n) => n.key);
    expect(first).toEqual(["apps-1", "apps-10", "apps-25", "goals-1"]);
    const held = new Set(first.map((k) => `a:${k}`));
    expect(newMilestones(metrics, held)).toEqual([]);
    metrics.set("a", { apps: 50, goals: 1, assists: 0, cleanSheets: 0, squadMotm: 0 });
    expect(newMilestones(metrics, held)).toEqual([{ playerId: "a", key: "apps-50", label: "50 appearances" }]);
  });

  it("a player with nothing earns nothing", () => {
    expect(newMilestones(new Map([["a", emptyMetrics()]]), new Set())).toEqual([]);
  });

  it("orders by the list, unknown keys last", () => {
    expect(milestoneRank("apps-1")).toBeLessThan(milestoneRank("goals-1"));
    expect(milestoneRank("nope")).toBe(99);
  });
});

describe("the vote", () => {
  const h = 3600_000;
  const start = new Date(Date.UTC(2026, 9, 20, 20, 0));
  const open = { voteOpenedAt: start, voteClosesAt: new Date(start.getTime() + VOTE_WINDOW_MS), reviewPublishedAt: null };

  it("is not yet, open, then closed", () => {
    expect(voteState({ voteOpenedAt: null, voteClosesAt: null, reviewPublishedAt: null }, start)).toBe("not_yet");
    expect(voteState(open, new Date(start.getTime() + h))).toBe("open");
    expect(voteState(open, new Date(start.getTime() + VOTE_WINDOW_MS))).toBe("closed");
  });
  it("closes the moment the report is published", () => {
    expect(voteState({ ...open, reviewPublishedAt: new Date(start.getTime() + h) }, new Date(start.getTime() + 2 * h))).toBe("closed");
  });
  it("opens two hours after kick-off, only for matches, once", () => {
    const e = { startsAt: start, isMatch: true, voteOpenedAt: null, voteClosesAt: null, reviewPublishedAt: null };
    expect(voteDue(e, new Date(start.getTime() + VOTE_OPENS_AFTER_MS - 1))).toBe(false);
    expect(voteDue(e, new Date(start.getTime() + VOTE_OPENS_AFTER_MS))).toBe(true);
    expect(voteDue({ ...e, isMatch: false }, new Date(start.getTime() + 3 * h))).toBe(false);
    expect(voteDue({ ...e, voteOpenedAt: start }, new Date(start.getTime() + 3 * h))).toBe(false);
    expect(voteDue({ ...e, reviewPublishedAt: start }, new Date(start.getTime() + 3 * h))).toBe(false);
  });
  it("is never opened for a match long past (the window has gone)", () => {
    const e = { startsAt: start, isMatch: true, voteOpenedAt: null, voteClosesAt: null, reviewPublishedAt: null };
    expect(voteDue(e, new Date(start.getTime() + VOTE_OPENS_AFTER_MS + VOTE_WINDOW_MS + 1))).toBe(false);
  });
  it("only players who were in the squad can vote, and only while it is open", () => {
    expect(voteRefusal("open", true)).toBeNull();
    expect(voteRefusal("closed", true)).toMatch(/isn't open/);
    expect(voteRefusal("not_yet", true)).toMatch(/isn't open/);
    expect(voteRefusal("open", false)).toMatch(/in the squad/);
  });
  it("ratings are whole numbers from 1 to 10", () => {
    expect(parseRating("7")).toBe(7);
    expect(parseRating("")).toBeNull();
    expect(parseRating(null)).toBeNull();
    expect(parseRating("0")).toBeUndefined();
    expect(parseRating("11")).toBeUndefined();
    expect(parseRating("6.5")).toBeUndefined();
    expect(parseRating("x")).toBeUndefined();
  });
  it("a tie for Man of the Match names everyone level", () => {
    const r = motmResult(["b", "a", "b", "a", "c"]);
    expect(r.winners).toEqual(["a", "b"]);
    expect(r.top).toBe(2);
    expect(r.total).toBe(5);
    expect(motmResult([]).winners).toEqual([]);
  });
  it("counts a win for each player level at the top of a match", () => {
    const wins = winsFrom([motmResult(["a", "b"]), motmResult(["a", "a", "b"]), motmResult([])]);
    expect(wins.get("a")).toBe(2);
    expect(wins.get("b")).toBe(1);
  });
});

describe("Player of the Month", () => {
  const m = (o: Record<string, number>) => new Map(Object.entries(o));

  it("goes to the most votes", () => {
    expect(choosePotm(m({ a: 5, b: 3 }), m({}))).toEqual({ winners: ["a"], votes: 5 });
  });
  it("votes rather than wins: second place three times beats one lucky win", () => {
    expect(choosePotm(m({ a: 4, b: 3 }), m({ a: 0, b: 1 })).winners).toEqual(["a"]);
  });
  it("level on votes, the one with more match wins takes it", () => {
    expect(choosePotm(m({ a: 3, b: 3, c: 1 }), m({ a: 1, b: 2 }))).toEqual({ winners: ["b"], votes: 3 });
  });
  it("still level, they share it", () => {
    expect(choosePotm(m({ b: 3, a: 3 }), m({ a: 1, b: 1 }))).toEqual({ winners: ["a", "b"], votes: 3 });
    expect(choosePotm(m({ b: 2, a: 2 }), m({}))).toEqual({ winners: ["a", "b"], votes: 2 });
  });
  it("nobody voted for, nobody wins", () => {
    expect(choosePotm(m({}), m({}))).toEqual({ winners: [], votes: 0 });
  });
  it("the month before January is December of last year", () => {
    expect(previousMonth("2026-01")).toBe("2025-12");
    expect(previousMonth("2026-10")).toBe("2026-09");
  });
});
