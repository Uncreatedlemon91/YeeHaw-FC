import { describe, expect, it } from "vitest";
import {
  averageRating,
  manualMove,
  newArrivals,
  onboardingProgress,
  onboardingSteps,
  parseProspect,
  parseTrialNote,
  stageAfterAnswer,
  stageAfterNote,
  stageAfterOffer,
  tickStep,
} from "./recruitment-rules";

describe("moving a file by hand", () => {
  it("moves freely between Prospect, On trial and Not for us", () => {
    expect(manualMove("PROSPECT", "TRIAL")).toEqual({ ok: true });
    expect(manualMove("TRIAL", "REJECTED")).toEqual({ ok: true });
    expect(manualMove("REJECTED", "PROSPECT")).toEqual({ ok: true });
    expect(manualMove("OFFERED", "TRIAL")).toEqual({ ok: true });
  });
  it("won't move to the stage it is already in", () => {
    expect(manualMove("TRIAL", "TRIAL").ok).toBe(false);
  });
  it("leaves Offered and Signed to the contract", () => {
    expect(manualMove("TRIAL", "OFFERED")).toMatchObject({ ok: false });
    expect(manualMove("OFFERED", "SIGNED")).toMatchObject({ ok: false });
  });
  it("a signed file is settled", () => {
    for (const to of ["PROSPECT", "TRIAL", "REJECTED"] as const) expect(manualMove("SIGNED", to).ok).toBe(false);
  });
  it("rejects a stage that doesn't exist", () => {
    expect(manualMove("PROSPECT", "LOST" as never).ok).toBe(false);
  });
});

describe("stages that follow other events", () => {
  it("a trial note from a match puts a Prospect on trial; other stages are unchanged", () => {
    expect(stageAfterNote("PROSPECT", true)).toBe("TRIAL");
    expect(stageAfterNote("PROSPECT", false)).toBe("PROSPECT");
    expect(stageAfterNote("OFFERED", true)).toBe("OFFERED");
    expect(stageAfterNote("REJECTED", true)).toBe("REJECTED");
  });
  it("an offer moves Prospect, On trial and Not for us to Offered, never un-signs", () => {
    expect(stageAfterOffer("PROSPECT")).toBe("OFFERED");
    expect(stageAfterOffer("TRIAL")).toBe("OFFERED");
    expect(stageAfterOffer("REJECTED")).toBe("OFFERED");
    expect(stageAfterOffer("OFFERED")).toBe("OFFERED");
    expect(stageAfterOffer("SIGNED")).toBe("SIGNED");
  });
  it("accepting signs them; declining leaves the file where it is", () => {
    expect(stageAfterAnswer("OFFERED", "accept")).toBe("SIGNED");
    expect(stageAfterAnswer("OFFERED", "decline")).toBe("OFFERED");
    expect(stageAfterAnswer("TRIAL", "accept")).toBe("SIGNED");
  });
});

describe("parseProspect", () => {
  const get = (o: Record<string, string>) => (k: string) => o[k] ?? "";
  it("needs a name and a numeric Discord id", () => {
    const r = parseProspect(get({ name: " ", discordId: "abc" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["discordId", "name"]);
  });
  it("drops a secondary position equal to the primary", () => {
    const r = parseProspect(get({ name: "Ace", position: "STRIKER", secondaryPosition: "STRIKER" }));
    expect(r).toMatchObject({ ok: true, value: { position: "STRIKER", secondaryPosition: null } });
  });
  it("refuses a position that isn't on the list", () => {
    expect(parseProspect(get({ name: "Ace", position: "SWEEPER" })).ok).toBe(false);
  });
});

describe("trial notes", () => {
  it("need words and a 1-10 whole rating (or none)", () => {
    expect(parseTrialNote("", "").ok).toBe(false);
    expect(parseTrialNote("good", "11").ok).toBe(false);
    expect(parseTrialNote("good", "7.5").ok).toBe(false);
    expect(parseTrialNote(" good ", "")).toEqual({ ok: true, value: { body: "good", rating: null } });
    expect(parseTrialNote("good", "8")).toEqual({ ok: true, value: { body: "good", rating: 8 } });
  });
  it("averages only the rated notes", () => {
    expect(averageRating([8, null, 7])).toBe(7.5);
    expect(averageRating([null])).toBeNull();
  });
});

describe("settling in", () => {
  it("reads automatic steps from the data and manual ones from the ticks", () => {
    const steps = onboardingSteps(["welcome"], { contract: true, gamertag: false, nights: true });
    const done = Object.fromEntries(steps.map((s) => [s.key, s.done]));
    expect(done).toEqual({ contract: true, gamertag: false, ea_club: false, welcome: true, nights: true });
    expect(onboardingProgress(steps)).toEqual({ done: 3, total: 5 });
  });
  it("ticks only hand steps, keeps checklist order, and unticks", () => {
    expect(tickStep(["welcome"], "ea_club", true)).toEqual({ ok: true, value: ["ea_club", "welcome"] });
    expect(tickStep(["welcome", "ea_club"], "welcome", false)).toEqual({ ok: true, value: ["ea_club"] });
    expect(tickStep([], "contract", true).ok).toBe(false);
  });
});

describe("new arrivals", () => {
  const now = new Date("2026-10-28T12:00:00Z");
  const m = (id: string, joined: string, extra: object = {}) => ({ user: { id, username: `u${id}`, ...extra }, joined_at: joined });
  const name = (x: { user?: { username: string } }) => x.user!.username;
  it("lists recent joiners nobody has handled, newest first", () => {
    const list = newArrivals(
      [m("1", "2026-10-01T00:00:00Z"), m("2", "2026-10-20T00:00:00Z"), m("3", "2026-08-01T00:00:00Z"), m("4", "2026-10-25T00:00:00Z", { bot: true }), m("5", "2026-10-26T00:00:00Z")],
      new Set(["5"]),
      now,
      name,
    );
    expect(list.map((a) => a.id)).toEqual(["2", "1"]);
  });
  it("skips members with no join date", () => {
    expect(newArrivals([{ user: { id: "9", username: "x" } }], new Set(), now, name)).toEqual([]);
  });
});
