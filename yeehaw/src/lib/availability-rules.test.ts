import { describe, expect, it } from "vitest";
import { buildGrid, dayState, daysString, isoWeek, parseAway } from "./availability-rules";

describe("dayState", () => {
  // 1010100: Monday, Wednesday, Friday.
  it("reads the usual nights, Monday first", () => {
    expect(dayState("1010100", [], "2026-10-26")).toBe("free"); // Mon
    expect(dayState("1010100", [], "2026-10-27")).toBe("busy"); // Tue
    expect(dayState("1010100", [], "2026-10-30")).toBe("free"); // Fri
    expect(dayState("1010100", [], "2026-11-01")).toBe("busy"); // Sun
  });
  it("is unknown until nights are set, but away still shows", () => {
    expect(dayState(null, [], "2026-10-26")).toBe("unknown");
    expect(dayState(null, [{ startsOn: "2026-10-26", endsOn: "2026-10-28" }], "2026-10-27")).toBe("away");
  });
  it("away beats a free night, inclusive of both ends", () => {
    const away = [{ startsOn: "2026-10-26", endsOn: "2026-10-30" }];
    expect(dayState("1111111", away, "2026-10-26")).toBe("away");
    expect(dayState("1111111", away, "2026-10-30")).toBe("away");
    expect(dayState("1111111", away, "2026-10-31")).toBe("free");
  });
});

describe("daysString", () => {
  it("builds the seven-character pattern", () => {
    expect(daysString([0, 2, 4])).toEqual({ ok: true, value: "1010100" });
    expect(daysString([])).toEqual({ ok: true, value: "0000000" });
  });
  it("rejects days that don't exist", () => {
    expect(daysString([7]).ok).toBe(false);
  });
});

describe("parseAway", () => {
  it("takes a single day, or a range", () => {
    expect(parseAway("2026-11-05", "", "2026-10-28")).toEqual({ ok: true, value: { startsOn: "2026-11-05", endsOn: "2026-11-05" } });
    expect(parseAway("2026-11-05", "2026-11-09", "2026-10-28").ok).toBe(true);
  });
  it("refuses backwards, past and over-long ranges", () => {
    expect(parseAway("2026-11-05", "2026-11-01", "2026-10-28").ok).toBe(false);
    expect(parseAway("2026-10-01", "2026-10-05", "2026-10-28").ok).toBe(false);
    expect(parseAway("2026-11-01", "2027-06-01", "2026-10-28").ok).toBe(false);
    expect(parseAway("nope", "", "2026-10-28").ok).toBe(false);
  });
  it("allows exactly 120 days", () => {
    expect(parseAway("2026-11-01", "2027-02-28", "2026-10-28").ok).toBe(true); // 120 days inclusive
  });
});

describe("isoWeek", () => {
  it("labels weeks like ISO 8601", () => {
    expect(isoWeek("2026-10-26")).toBe("2026-W44");
    expect(isoWeek("2026-11-01")).toBe("2026-W44"); // Sunday belongs to the week before
    expect(isoWeek("2026-11-02")).toBe("2026-W45");
    expect(isoWeek("2026-01-01")).toBe("2026-W01");
    expect(isoWeek("2027-01-01")).toBe("2026-W53"); // belongs to the previous year's last week
    expect(isoWeek("2024-12-30")).toBe("2025-W01");
  });
});

describe("buildGrid", () => {
  const people = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const grid = buildGrid({
    people,
    start: "2026-10-26", // Monday
    days: 3,
    patterns: new Map([["a", "1111111"], ["b", "0000000"]]),
    aways: new Map([["a", [{ startsOn: "2026-10-28", endsOn: "2026-10-28" }]]]),
    eventsOn: new Map([["2026-10-27", ["ev1"]]]),
    answers: new Map<string, "GOING" | "MAYBE" | "OUT">([["ev1:a", "OUT"], ["ev1:b", "GOING"]]),
  });
  it("lets an event answer override the pattern on its day", () => {
    expect(grid.rows[0].cells.map((c) => c.state)).toEqual(["free", "out", "away"]);
    expect(grid.rows[1].cells.map((c) => c.state)).toEqual(["busy", "going", "busy"]);
    expect(grid.rows[2].cells.map((c) => c.state)).toEqual(["unknown", "unknown", "unknown"]);
  });
  it("counts free or going per night and notes who has set nights", () => {
    expect(grid.counts).toEqual([1, 1, 0]);
    expect(grid.rows.map((r) => r.patternSet)).toEqual([true, true, false]);
  });
});
