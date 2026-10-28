import { describe, expect, it } from "vitest";
import { myPosition, parsePlan, parseReply, parseReview, parseSuggestion, sortSuggestions } from "./training-rules";

const slots = { GK: "GK", ST: "ST", SUB1: "Sub 1" };

describe("parsePlan", () => {
  it("trims, drops blank briefs and keeps real ones", () => {
    const r = parsePlan({ objective: " press high ", plan: "", briefs: { GK: " sweep ", ST: "  " } }, slots);
    expect(r).toEqual({ ok: true, value: { objective: "press high", plan: null, briefs: { GK: "sweep" } } });
  });
  it("refuses a brief for a position the formation doesn't have", () => {
    const r = parsePlan({ objective: "", plan: "", briefs: { CAM: "drop deep" } }, slots);
    expect(r).toMatchObject({ ok: false, field: "brief__CAM" });
  });
  it("enforces the length limits", () => {
    expect(parsePlan({ objective: "x".repeat(201), plan: "", briefs: {} }, slots).ok).toBe(false);
    expect(parsePlan({ objective: "", plan: "x".repeat(3001), briefs: {} }, slots).ok).toBe(false);
    expect(parsePlan({ objective: "", plan: "", briefs: { GK: "x".repeat(301) } }, slots).ok).toBe(false);
  });
});

describe("parseReview", () => {
  const start = new Date("2026-11-03T01:00:00Z");
  it("can't review a session that hasn't happened", () => {
    expect(parseReview("good", start, new Date("2026-11-02T12:00:00Z")).ok).toBe(false);
    expect(parseReview("good", start, new Date("2026-11-03T02:00:00Z"))).toEqual({ ok: true, value: "good" });
  });
  it("a blank review clears it", () => {
    expect(parseReview("  ", start, new Date("2026-11-04T00:00:00Z"))).toEqual({ ok: true, value: null });
  });
});

describe("suggestions", () => {
  it("needs words, within the limit", () => {
    expect(parseSuggestion("  ").ok).toBe(false);
    expect(parseSuggestion("x".repeat(501)).ok).toBe(false);
    expect(parseSuggestion(" pressing triggers ")).toEqual({ ok: true, value: "pressing triggers" });
  });
  it("replies with a known status and a short note", () => {
    expect(parseReply("PLANNED", " next week ")).toEqual({ ok: true, value: { status: "PLANNED", note: "next week" } });
    expect(parseReply("SOON", "").ok).toBe(false);
    expect(parseReply("DONE", "x".repeat(301)).ok).toBe(false);
  });
  it("lists new ones first, then newest first", () => {
    const rows = [
      { id: "a", status: "DONE" as const, createdAt: new Date("2026-10-01") },
      { id: "b", status: "OPEN" as const, createdAt: new Date("2026-10-02") },
      { id: "c", status: "OPEN" as const, createdAt: new Date("2026-10-05") },
    ];
    expect(sortSuggestions(rows).map((r) => r.id)).toEqual(["c", "b", "a"]);
  });
});

describe("myPosition", () => {
  it("prefers a published team sheet, else the claimed shirt", () => {
    expect(myPosition({ sheetPublished: true, sheetSlot: "ST", claimedSlot: "GK" })).toBe("ST");
    expect(myPosition({ sheetPublished: false, sheetSlot: "ST", claimedSlot: "GK" })).toBe("GK");
    expect(myPosition({ sheetPublished: true, sheetSlot: null, claimedSlot: null })).toBeNull();
  });
});
