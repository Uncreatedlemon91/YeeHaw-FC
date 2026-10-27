import { describe, expect, it } from "vitest";
import {
  checkResponse,
  describeChange,
  findConflicts,
  parseObjectives,
  parseTerms,
  shirtError,
  type Candidate,
  type LiveHolder,
} from "./contract-rules";

const form = (v: Record<string, string>) => (k: string) => v[k] ?? "";
const good = { shirtNumber: "10", squadStatus: "STARTER", position: "STRIKER", captaincy: "NONE" };

describe("shirtError", () => {
  it("accepts 1 to 99", () => {
    expect(shirtError(1)).toBeNull();
    expect(shirtError(99)).toBeNull();
  });
  it("rejects 0, 100, negatives and fractions", () => {
    for (const n of [0, 100, -3, 7.5, NaN]) expect(shirtError(n)).not.toBeNull();
  });
});

describe("parseTerms", () => {
  it("reads a complete set of terms", () => {
    const r = parseTerms(form({ ...good, secondaryPosition: "WINGER", captaincy: "CAPTAIN", objectives: "Goals 10, Average rating 7.2" }));
    expect(r.terms).toEqual({
      shirtNumber: 10,
      squadStatus: "STARTER",
      position: "STRIKER",
      secondaryPosition: "WINGER",
      captaincy: "CAPTAIN",
      objectives: [
        { kind: "GOALS", target: 10 },
        { kind: "AVG_RATING", target: 7.2 },
      ],
    });
  });
  it("requires a number and a primary position for a new contract", () => {
    const r = parseTerms(form({ squadStatus: "ROTATION" }));
    expect(r.errors).toMatchObject({ shirtNumber: expect.any(String), position: expect.any(String) });
  });
  it("lets a carried-over contract stay blank when editing", () => {
    const r = parseTerms(form({ squadStatus: "ROTATION" }), { allowBlank: true });
    expect(r.terms).toMatchObject({ shirtNumber: null, position: null });
  });
  it("rejects numbers outside 1-99", () => {
    expect(parseTerms(form({ ...good, shirtNumber: "100" })).errors?.shirtNumber).toBeTruthy();
    expect(parseTerms(form({ ...good, shirtNumber: "0" })).errors?.shirtNumber).toBeTruthy();
  });
  it("rejects a secondary position equal to the primary, or without a primary", () => {
    expect(parseTerms(form({ ...good, secondaryPosition: "STRIKER" })).errors?.secondaryPosition).toBeTruthy();
    expect(parseTerms(form({ shirtNumber: "5", squadStatus: "STARTER", secondaryPosition: "WINGER" }), { allowBlank: true }).errors?.secondaryPosition).toBeTruthy();
  });
  it("rejects unknown status, position and captaincy values", () => {
    expect(parseTerms(form({ ...good, squadStatus: "RESERVE" })).errors?.squadStatus).toBeTruthy();
    expect(parseTerms(form({ ...good, position: "SWEEPER" })).errors?.position).toBeTruthy();
    expect(parseTerms(form({ ...good, captaincy: "KING" })).errors?.captaincy).toBeTruthy();
  });
});

describe("parseObjectives", () => {
  it("takes names, enum names and aliases, separated by commas or lines", () => {
    const r = parseObjectives("Goals 10\nassists: 5; clean sheets 8, attendance 80%, motm 2, apps 20");
    expect(r.objectives.map((o) => o.kind)).toEqual(["GOALS", "ASSISTS", "CLEAN_SHEETS", "ATTENDANCE", "MOTM", "APPEARANCES"]);
  });
  it("is empty for empty text", () => {
    expect(parseObjectives("  ")).toEqual({ objectives: [] });
  });
  it("explains the first problem", () => {
    expect(parseObjectives("Goals").error).toBeTruthy();
    expect(parseObjectives("Dribbles 10").error).toMatch(/isn't an objective/);
    expect(parseObjectives("Goals 0").error).toBeTruthy();
    expect(parseObjectives("Average rating 11").error).toBeTruthy();
    expect(parseObjectives("Attendance 120").error).toBeTruthy();
    expect(parseObjectives("Goals 3, Goals 4").error).toMatch(/twice/);
  });
});

describe("findConflicts", () => {
  const live: LiveHolder[] = [
    { playerId: "a", name: "Ace", shirtNumber: 9, captaincy: "CAPTAIN" },
    { playerId: "b", name: "Bee", shirtNumber: 4, captaincy: "VICE" },
    { playerId: "c", name: "Cee", shirtNumber: null, captaincy: "NONE" },
  ];
  const cand = (over: Partial<Candidate>): Candidate => ({ key: "x", playerId: "x", name: "Xan", shirtNumber: 20, captaincy: "NONE", ...over });

  it("is quiet when nothing clashes (null numbers never clash)", () => {
    expect(findConflicts(live, [cand({}), cand({ key: "y", playerId: "y", shirtNumber: null })])).toEqual({});
  });
  it("names who holds a shirt number", () => {
    expect(findConflicts(live, [cand({ shirtNumber: 9 })]).x.shirtNumber).toMatch(/#9 is already Ace/);
  });
  it("allows the holder to keep their own number and armband", () => {
    expect(findConflicts(live, [cand({ playerId: "a", shirtNumber: 9, captaincy: "CAPTAIN" })])).toEqual({});
  });
  it("allows only one captain and one vice per season", () => {
    expect(findConflicts(live, [cand({ captaincy: "CAPTAIN" })]).x.captaincy).toMatch(/Ace is already captain/);
    expect(findConflicts(live, [cand({ captaincy: "VICE" })]).x.captaincy).toMatch(/Bee is already vice-captain/);
  });
  it("catches duplicates inside one batch", () => {
    const r = findConflicts([], [
      cand({ key: "p", playerId: "p", name: "Pip", shirtNumber: 7, captaincy: "CAPTAIN" }),
      cand({ key: "q", playerId: "q", name: "Quin", shirtNumber: 7, captaincy: "CAPTAIN" }),
    ]);
    expect(r.p.shirtNumber).toMatch(/Quin/);
    expect(r.q.shirtNumber).toMatch(/Pip/);
    expect(r.p.captaincy).toBeTruthy();
    expect(r.q.captaincy).toBeTruthy();
  });
});

describe("checkResponse", () => {
  const offer = { state: "OFFERED" as const, playerDiscordId: "111", seasonState: "WINDOW" as const };
  it("lets the named player answer an open offer", () => {
    expect(checkResponse(offer, "111")).toEqual({ ok: true });
  });
  it("refuses anyone else, including management, and anonymous clicks", () => {
    expect(checkResponse(offer, "222")).toMatchObject({ ok: false, error: expect.stringMatching(/not addressed to you/) });
    expect(checkResponse(offer, undefined)).toMatchObject({ ok: false });
  });
  it("refuses an offer that was already answered", () => {
    expect(checkResponse({ ...offer, state: "ACTIVE" }, "111")).toMatchObject({ ok: false, error: expect.stringMatching(/accepted/) });
    expect(checkResponse({ ...offer, state: "DECLINED" }, "111")).toMatchObject({ ok: false, error: expect.stringMatching(/declined/) });
    expect(checkResponse({ ...offer, state: "RELEASED" }, "111")).toMatchObject({ ok: false });
  });
  it("refuses once the season has ended", () => {
    expect(checkResponse({ ...offer, seasonState: "ENDED" }, "111")).toMatchObject({ ok: false, error: expect.stringMatching(/ended/) });
  });
  it("checks who first, so a stranger learns nothing about the offer's state", () => {
    expect(checkResponse({ ...offer, state: "ACTIVE" }, "222")).toMatchObject({ error: expect.stringMatching(/not addressed/) });
  });
});

describe("describeChange", () => {
  const before = { shirtNumber: 9, squadStatus: "STARTER" as const, position: "STRIKER" as const, secondaryPosition: null, captaincy: "NONE" as const, objectives: [] };
  it("says nothing when nothing changed", () => {
    expect(describeChange(before, { ...before })).toEqual([]);
  });
  it("lists each change", () => {
    const lines = describeChange(before, {
      ...before,
      shirtNumber: 11,
      squadStatus: "ROTATION",
      captaincy: "VICE",
      objectives: [{ kind: "GOALS", target: 5 }],
    });
    expect(lines).toEqual([
      "Shirt number: 9 → 11",
      "Squad status: Starter → Rotation",
      "Armband: no armband → Vice-captain",
      "Objectives: none → Goals 5",
    ]);
  });
});
