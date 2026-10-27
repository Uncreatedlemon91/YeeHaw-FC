import { describe, expect, it } from "vitest";
import { attendanceRecord, careerTotals, objectiveProgress } from "./player-stats";
import {
  buildTimeline,
  canAdd,
  canDelete,
  canView,
  computeMilestones,
  groupsPresent,
  ribbons,
  type MatchLine,
  type Viewer,
} from "./service-record";

const guest: Viewer = { isSelf: false, isStaff: false };
const self: Viewer = { isSelf: true, isStaff: false };
const staff: Viewer = { isSelf: false, isStaff: true };
const staffOnOwnFile: Viewer = { isSelf: true, isStaff: true };

const match = (n: number, over: Partial<MatchLine> = {}): MatchLine => ({
  playedAt: new Date(Date.UTC(2026, 9, n)),
  oppName: "Rivals",
  usScore: 2,
  oppScore: 1,
  pos: "midfielder",
  rating: 7,
  goals: 0,
  assists: 0,
  mom: false,
  cleanSheet: false,
  ...over,
});

describe("who can see a service entry", () => {
  it("shows commendations to everyone", () => {
    for (const v of [guest, self, staff]) expect(canView("COMMENDATION", v)).toBe(true);
  });
  it("shows warnings to the player and staff only", () => {
    expect(canView("WARNING", guest)).toBe(false);
    expect(canView("WARNING", self)).toBe(true);
    expect(canView("WARNING", staff)).toBe(true);
  });
  it("shows notes to staff, never to the player, even a coach on their own file", () => {
    expect(canView("NOTE", guest)).toBe(false);
    expect(canView("NOTE", self)).toBe(false);
    expect(canView("NOTE", staff)).toBe(true);
    expect(canView("NOTE", staffOnOwnFile)).toBe(false);
  });
  it("lets staff add entries about others, never about themselves", () => {
    expect(canAdd(staff)).toBe(true);
    expect(canAdd(staffOnOwnFile)).toBe(false);
    expect(canAdd(self)).toBe(false);
    expect(canAdd(guest)).toBe(false);
  });
  it("lets the author or management delete an entry they can see", () => {
    const coach = { ...staff, isManagement: false };
    expect(canDelete("NOTE", "u1", "u1", coach)).toBe(true);
    expect(canDelete("NOTE", "u1", "u2", coach)).toBe(false);
    expect(canDelete("NOTE", "u1", "u2", { ...coach, isManagement: true })).toBe(true);
    expect(canDelete("NOTE", "u1", "u1", { ...staffOnOwnFile, isManagement: true })).toBe(false);
    expect(canDelete("COMMENDATION", "u1", "u1", { ...guest, isManagement: false })).toBe(false);
  });
});

describe("computeMilestones", () => {
  it("marks the debut and appearance steps, dated by the match", () => {
    const ms = computeMilestones(Array.from({ length: 25 }, (_, i) => match(i + 1, { rating: null })));
    expect(ms.map((m) => m.title)).toEqual(["Debut", "25 appearances"]);
    expect(ms[0].at).toEqual(new Date(Date.UTC(2026, 9, 1)));
  });
  it("finds first goal, goal steps, first assist and a hat-trick", () => {
    const ms = computeMilestones([match(1, { goals: 1, assists: 1 }), match(2, { goals: 3 }), match(3, { goals: 6 })]);
    const titles = ms.map((m) => m.title);
    expect(titles).toContain("First goal");
    expect(titles).toContain("First assist");
    expect(titles).toContain("Hat-trick");
    expect(titles).toContain("6 goals in a match");
    expect(titles).toContain("10 goals");
  });
  it("credits clean sheets only to keepers and defenders", () => {
    const keeper = Array.from({ length: 5 }, (_, i) => match(i + 1, { pos: "goalkeeper", cleanSheet: true }));
    const striker = Array.from({ length: 5 }, (_, i) => match(i + 1, { pos: "forward", cleanSheet: true }));
    expect(computeMilestones(keeper).map((m) => m.title)).toContain("5 clean sheets");
    expect(computeMilestones(striker).map((m) => m.title)).not.toContain("5 clean sheets");
  });
  it("awards a personal best only after enough rated games", () => {
    const few = computeMilestones([match(1, { rating: 9 }), match(2)]);
    expect(few.some((m) => m.kind === "rating")).toBe(false);
    const many = computeMilestones(Array.from({ length: 5 }, (_, i) => match(i + 1, { rating: 6 + i })));
    expect(many.find((m) => m.kind === "rating")?.title).toBe("Personal best rating, 10.0");
  });
});

describe("buildTimeline clearance", () => {
  const input = {
    matches: [match(1, { goals: 1, mom: true })],
    potm: [{ month: "2026-10", votes: 4, awardedAt: new Date("2026-11-01") }],
    moves: [{ kind: "ACCEPT" as const, at: new Date("2026-10-05"), seasonName: "Season 2", position: "Striker", note: null }],
    eaMoves: [{ move: "joined", movedAt: new Date("2026-10-02") }],
    written: [
      { id: "1", kind: "COMMENDATION" as const, body: "Great run", occurredAt: new Date("2026-10-10"), authorName: "Coach", authorId: "c" },
      { id: "2", kind: "WARNING" as const, body: "Late twice", occurredAt: new Date("2026-10-11"), authorName: "Coach", authorId: "c" },
      { id: "3", kind: "NOTE" as const, body: "Watch fitness", occurredAt: new Date("2026-10-12"), authorName: "Coach", authorId: "c" },
    ],
  };
  const kinds = (v: Viewer) => buildTimeline({ ...input, viewer: v }).map((e) => e.kind);

  it("shows the public a redacted row in place of squad moves, and no warning or note", () => {
    const t = buildTimeline({ ...input, viewer: guest });
    expect(t.filter((e) => e.redacted)).toHaveLength(1);
    expect(t.some((e) => e.kind === "warning" || e.kind === "note")).toBe(false);
    expect(t.some((e) => e.kind === "commendation")).toBe(true);
    expect(t.some((e) => e.title === "Signed a contract")).toBe(false);
    expect(JSON.stringify(t)).not.toMatch(/Late twice|Watch fitness|Season 2/);
  });
  it("shows the player their moves and warning, but never a note", () => {
    const k = kinds(self);
    expect(k).toContain("warning");
    expect(k).not.toContain("note");
    expect(buildTimeline({ ...input, viewer: self }).some((e) => e.redacted)).toBe(false);
  });
  it("shows staff everything, but staff on their own file get no note", () => {
    expect(kinds(staff)).toEqual(expect.arrayContaining(["warning", "note", "commendation", "potm"]));
    expect(kinds(staffOnOwnFile)).not.toContain("note");
  });
  it("sorts newest first with undated last", () => {
    const t = buildTimeline({ ...input, viewer: staff });
    const dated = t.filter((e) => e.at).map((e) => e.at!.getTime());
    expect(dated).toEqual([...dated].sort((a, b) => b - a));
  });
  it("offers a filter chip only for groups that have entries", () => {
    const t = buildTimeline({ ...input, viewer: guest });
    expect(groupsPresent(t).map((g) => g.key)).toEqual(["milestone", "squad", "honour"]);
  });
});

describe("ribbons", () => {
  it("puts Player of the Month first, then a ribbon per milestone family", () => {
    const r = ribbons([{ key: "apps-25", label: "25 appearances" }, { key: "goals-1", label: "First goal" }], ["2026-10"]);
    expect(r.map((x) => x.family)).toEqual(["motm", "apps", "goals"]);
    expect(r[0].label).toMatch(/October 2026/);
  });
});

describe("player stats", () => {
  it("totals recorded matches", () => {
    const t = careerTotals([match(1, { goals: 2, assists: 1, rating: 8, mom: true }), match(2, { rating: 6, pos: "goalkeeper", cleanSheet: true }), match(3, { rating: null })]);
    expect(t).toEqual({ apps: 3, goals: 2, assists: 1, motm: 1, cleanSheets: 1, rating: 7, best: 8 });
    expect(careerTotals([]).rating).toBeNull();
  });
  it("works out reliability from marked events, ignoring excused", () => {
    expect(attendanceRecord(["PRESENT", "PRESENT", "PRESENT", "ABSENT", "EXCUSED", null])).toEqual({ present: 3, absent: 1, excused: 1, marked: 5, reliability: 75 });
    expect(attendanceRecord(["EXCUSED"]).reliability).toBeNull();
    expect(attendanceRecord([]).reliability).toBeNull();
  });
  it("measures objective progress, capped at 100", () => {
    const t = careerTotals([match(1, { goals: 6, rating: 7.5 })]);
    const a = attendanceRecord(["PRESENT", "ABSENT"]);
    expect(objectiveProgress("GOALS", 12, t, a)).toEqual({ current: 6, target: 12, pct: 50, met: false });
    expect(objectiveProgress("GOALS", 5, t, a)).toMatchObject({ pct: 100, met: true });
    expect(objectiveProgress("AVG_RATING", 7, t, a).met).toBe(true);
    expect(objectiveProgress("ATTENDANCE", 80, t, a)).toMatchObject({ current: 50, pct: 63, met: false });
    expect(objectiveProgress("AVG_RATING", 7, careerTotals([]), a)).toMatchObject({ current: null, pct: 0, met: false });
  });
});
