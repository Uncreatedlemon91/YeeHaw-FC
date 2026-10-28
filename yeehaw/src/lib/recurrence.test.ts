import { describe, expect, it } from "vitest";
import { addDays, generationRange, instantOn, occurrences, reconcile, todayIn, validDay, validTime, weekdayOf } from "./recurrence";

const NY = "America/New_York";
const rule = { weekdays: [1, 3], timeOfDay: "20:00", timezone: NY, startsOn: "2026-10-01" };

describe("calendar days", () => {
  it("knows the weekday, Monday first", () => {
    expect(weekdayOf("2026-10-26")).toBe(0); // a Monday
    expect(weekdayOf("2026-11-01")).toBe(6);
  });
  it("steps across months and leap days", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
  it("rejects impossible days and times", () => {
    expect(validDay("2026-02-30")).toBe(false);
    expect(validDay("2026-2-3")).toBe(false);
    expect(validTime("24:00")).toBe(false);
    expect(validTime("07:05")).toBe(true);
  });
  it("reads today in the series' zone, not UTC", () => {
    // 02:00 UTC on the 27th is still the evening of the 26th in New York.
    expect(todayIn(NY, new Date("2026-10-27T02:00:00Z"))).toBe("2026-10-26");
  });
});

describe("occurrences", () => {
  it("lists the chosen weekdays at the wall-clock time", () => {
    const list = occurrences(rule, "2026-10-26", "2026-11-01");
    // Tue 27 Oct and Thu 29 Oct, 20:00 EDT = 00:00 UTC the next day.
    expect(list.map((d) => d.toISOString())).toEqual(["2026-10-28T00:00:00.000Z", "2026-10-30T00:00:00.000Z"]);
  });

  it("keeps 20:00 local across the autumn clock change", () => {
    // US clocks go back on 1 Nov 2026: Tue 27 Oct is EDT (UTC-4), Tue 3 Nov is EST (UTC-5).
    const list = occurrences({ ...rule, weekdays: [1] }, "2026-10-27", "2026-11-03");
    expect(list.map((d) => d.toISOString())).toEqual(["2026-10-28T00:00:00.000Z", "2026-11-04T01:00:00.000Z"]);
  });

  it("keeps 20:00 local across the spring clock change", () => {
    // Clocks go forward on 8 Mar 2026: Tue 3 Mar EST, Tue 10 Mar EDT.
    const list = occurrences({ ...rule, weekdays: [1], startsOn: "2026-01-01" }, "2026-03-03", "2026-03-10");
    expect(list.map((d) => d.toISOString())).toEqual(["2026-03-04T01:00:00.000Z", "2026-03-11T00:00:00.000Z"]);
  });

  it("does not repeat or skip a night when the UTC date differs from the local one", () => {
    const sunLate = occurrences({ ...rule, weekdays: [6], timeOfDay: "23:30" }, "2026-10-25", "2026-11-08");
    // Sundays 25 Oct, 1 Nov (the 25-hour day), 8 Nov.
    expect(sunLate.length).toBe(3);
    expect(sunLate.map((d) => d.toISOString())).toEqual(["2026-10-26T03:30:00.000Z", "2026-11-02T04:30:00.000Z", "2026-11-09T04:30:00.000Z"]);
  });

  it("handles a time that does not exist on the spring-forward night without dropping the night", () => {
    const list = occurrences({ ...rule, weekdays: [6], timeOfDay: "02:30", startsOn: "2026-01-01" }, "2026-03-08", "2026-03-08");
    expect(list).toHaveLength(1);
    // 02:30 doesn't exist that night: it meets at 03:30 EDT, not at 01:30.
    expect(list[0].toISOString()).toBe("2026-03-08T07:30:00.000Z");
  });

  it("respects the series' first and last day", () => {
    const bounded = { ...rule, startsOn: "2026-10-29", endsOn: "2026-11-05" };
    const list = occurrences(bounded, "2026-10-01", "2026-12-31");
    expect(list.map((d) => d.toISOString())).toEqual(["2026-10-30T00:00:00.000Z", "2026-11-04T01:00:00.000Z", "2026-11-06T01:00:00.000Z"]);
  });

  it("is empty when no weekday is chosen", () => {
    expect(occurrences({ ...rule, weekdays: [] }, "2026-10-01", "2026-12-31")).toEqual([]);
  });

  it("uses the series' own zone, not the club's", () => {
    const london = occurrences({ ...rule, timezone: "Europe/London", weekdays: [1] }, "2026-10-27", "2026-10-27");
    expect(london[0].toISOString()).toBe("2026-10-27T20:00:00.000Z");
    expect(instantOn("2026-10-27", "20:00", "Europe/London").getTime()).toBe(london[0].getTime());
  });
});

describe("generationRange", () => {
  const now = new Date("2026-10-27T15:00:00Z"); // 27 Oct in New York
  it("starts today the first time and runs four weeks ahead", () => {
    expect(generationRange(rule, { generatedThrough: null, aheadDays: 28, now })).toEqual({ from: "2026-10-27", through: "2026-11-24" });
  });
  it("resumes the day after the last run", () => {
    expect(generationRange(rule, { generatedThrough: "2026-11-20", aheadDays: 28, now })).toEqual({ from: "2026-11-21", through: "2026-11-24" });
  });
  it("is null when already caught up, so a second run adds nothing", () => {
    expect(generationRange(rule, { generatedThrough: "2026-11-24", aheadDays: 28, now })).toBeNull();
  });
  it("runs over the gap after a missed fortnight", () => {
    const r = generationRange(rule, { generatedThrough: "2026-10-10", aheadDays: 28, now });
    expect(r).toEqual({ from: "2026-10-11", through: "2026-11-24" });
  });
});

describe("reconcile (editing a series)", () => {
  const at = (iso: string) => new Date(iso);
  it("updates what still matches, creates what is new, deletes what went", () => {
    const existing = [
      { id: "a", startsAt: at("2026-11-04T01:00:00Z"), hasSignups: false },
      { id: "b", startsAt: at("2026-11-06T01:00:00Z"), hasSignups: false },
    ];
    const r = reconcile(existing, [at("2026-11-04T01:00:00Z"), at("2026-11-05T01:00:00Z")]);
    expect(r.update).toEqual(["a"]);
    expect(r.remove).toEqual(["b"]);
    expect(r.detach).toEqual([]);
    expect(r.create).toEqual([at("2026-11-05T01:00:00Z")]);
  });
  it("never deletes an occurrence somebody has answered: it becomes a one-off", () => {
    const r = reconcile([{ id: "x", startsAt: at("2026-11-06T01:00:00Z"), hasSignups: true }], []);
    expect(r.remove).toEqual([]);
    expect(r.detach).toEqual(["x"]);
  });
  it("does nothing when nothing changed", () => {
    const t = at("2026-11-04T01:00:00Z");
    const r = reconcile([{ id: "a", startsAt: t, hasSignups: true }], [t]);
    expect(r).toEqual({ update: ["a"], remove: [], detach: [], create: [] });
  });
});
