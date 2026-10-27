import { describe, expect, it } from "vitest";
import { canTransition, nextStep, validateSeasonDates, type JobSeason } from "./season-rules";

const d = (s: string) => new Date(`${s}T12:00:00Z`);
const season = (over: Partial<JobSeason>): JobSeason => ({
  id: "s",
  name: "Season",
  state: "DRAFT",
  startsAt: d("2026-11-01"),
  endsAt: d("2027-01-24"),
  windowOpensAt: d("2026-10-25"),
  startedAt: null,
  announcedAt: null,
  endReminderAt: null,
  ...over,
});

describe("canTransition", () => {
  it("runs Draft, Window, Active, Ended", () => {
    expect(canTransition("DRAFT", "WINDOW")).toBe(true);
    expect(canTransition("WINDOW", "ACTIVE")).toBe(true);
    expect(canTransition("ACTIVE", "ENDED")).toBe(true);
  });
  it("lets a first season skip the window, and a window go back to draft", () => {
    expect(canTransition("DRAFT", "ACTIVE")).toBe(true);
    expect(canTransition("WINDOW", "DRAFT")).toBe(true);
  });
  it("never goes backwards from Active, or anywhere from Ended", () => {
    expect(canTransition("ACTIVE", "WINDOW")).toBe(false);
    expect(canTransition("ACTIVE", "DRAFT")).toBe(false);
    expect(canTransition("ENDED", "ACTIVE")).toBe(false);
    expect(canTransition("DRAFT", "ENDED")).toBe(false);
  });
});

describe("validateSeasonDates", () => {
  it("wants the end after the start and the window before it", () => {
    expect(validateSeasonDates({ startsAt: d("2026-11-01"), endsAt: d("2027-01-24"), windowOpensAt: d("2026-10-25") })).toEqual({});
    expect(validateSeasonDates({ startsAt: d("2026-11-01"), endsAt: d("2026-11-01"), windowOpensAt: d("2026-10-25") }).endsAt).toBeTruthy();
    expect(validateSeasonDates({ startsAt: d("2026-11-01"), endsAt: d("2027-01-24"), windowOpensAt: d("2026-11-02") }).windowOpensAt).toBeTruthy();
  });
});

describe("nextStep (the daily job)", () => {
  it("does nothing mid-season", () => {
    const s = season({ state: "ACTIVE", startsAt: d("2026-10-20"), endsAt: d("2027-01-12"), startedAt: d("2026-10-20"), announcedAt: d("2026-10-20") });
    expect(nextStep([s], d("2026-11-15"))).toBeNull();
  });
  it("opens a draft's window once its date has come", () => {
    const s = season({});
    expect(nextStep([s], d("2026-10-24"))).toBeNull();
    expect(nextStep([s], d("2026-10-26"))).toEqual({ kind: "open-window", seasonId: "s" });
  });
  it("opens only one window at a time", () => {
    const a = season({ id: "a", state: "WINDOW" });
    const b = season({ id: "b" });
    expect(nextStep([a, b], d("2026-10-26"))).toBeNull();
  });
  it("reminds management 7 days before the end, once", () => {
    const s = season({ state: "ACTIVE", startsAt: d("2026-10-20"), endsAt: d("2027-01-12"), startedAt: d("2026-10-20"), announcedAt: d("2026-10-20") });
    expect(nextStep([s], d("2027-01-04"))).toBeNull();
    expect(nextStep([s], d("2027-01-06"))).toEqual({ kind: "end-reminder", seasonId: "s" });
    expect(nextStep([{ ...s, endReminderAt: d("2027-01-06") }], d("2027-01-07"))).toBeNull();
  });
  it("ends a season whose end date has passed", () => {
    const s = season({ state: "ACTIVE", startsAt: d("2026-10-20"), endsAt: d("2027-01-12"), startedAt: d("2026-10-20"), announcedAt: d("2026-10-20") });
    expect(nextStep([s], d("2027-01-13"))).toEqual({ kind: "end-season", seasonId: "s" });
  });
  it("ends the old season before starting the next, then starts it", () => {
    const old = season({ id: "old", state: "ACTIVE", startsAt: d("2026-10-20"), endsAt: d("2027-01-12"), startedAt: d("2026-10-20"), announcedAt: d("2026-10-20") });
    const next = season({ id: "next", state: "WINDOW", startsAt: d("2027-01-12"), endsAt: d("2027-04-06") });
    expect(nextStep([old, next], d("2027-01-13"))).toEqual({ kind: "end-season", seasonId: "old" });
    expect(nextStep([{ ...old, state: "ENDED" }, next], d("2027-01-13"))).toEqual({ kind: "start-season", seasonId: "next" });
  });
  it("won't start a season while another is running", () => {
    const running = season({ id: "r", state: "ACTIVE", startsAt: d("2026-10-20"), endsAt: d("2027-03-01"), startedAt: d("2026-10-20"), announcedAt: d("2026-10-20") });
    const next = season({ id: "n", state: "WINDOW", startsAt: d("2026-11-01") });
    expect(nextStep([running, next], d("2026-11-05"))).toBeNull();
  });
  it("retries a failed squad announcement for a few days, then gives up", () => {
    const s = season({ state: "ACTIVE", startsAt: d("2026-10-20"), endsAt: d("2027-01-12"), startedAt: d("2026-10-20") });
    expect(nextStep([s], d("2026-10-22"))).toEqual({ kind: "announce", seasonId: "s" });
    expect(nextStep([s], d("2026-10-30"))).toBeNull();
  });
});
