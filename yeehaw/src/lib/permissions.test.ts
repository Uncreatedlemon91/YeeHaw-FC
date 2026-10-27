import { describe, expect, it } from "vitest";
import { clubRoleFromRoles, hasPerm, permsFromRoles, topLabel, type PermConfig } from "./permissions";

const cfg: PermConfig = {
  perms: { MEMBER: ["m1"], STAFF: ["s1"], MANAGEMENT: ["g1"] },
  clubRoles: { PRESIDENT: "c-pres", HEAD_COACH: "c-head", COACH: "c-coach" },
};
const none = { adminIds: [] as string[] };

describe("permsFromRoles", () => {
  it("gives nothing to someone outside the server, even with roles", () => {
    expect(permsFromRoles(["g1"], "1", cfg, { ...none, inGuild: false })).toEqual([]);
  });
  it("maps each level and what it implies", () => {
    expect(permsFromRoles(["m1"], "1", cfg, none)).toEqual(["MEMBER"]);
    expect(permsFromRoles(["s1"], "1", cfg, none)).toEqual(["STAFF", "MEMBER"]);
    expect(permsFromRoles(["g1"], "1", cfg, none)).toEqual(["MANAGEMENT", "STAFF", "MEMBER"]);
  });
  it("takes the highest level any role grants", () => {
    expect(permsFromRoles(["m1", "g1", "s1"], "1", cfg, none)).toContain("MANAGEMENT");
  });
  it("treats President and Head Coach as management, Coach as staff", () => {
    expect(hasPerm(permsFromRoles(["c-pres"], "1", cfg, none), "MANAGEMENT")).toBe(true);
    expect(hasPerm(permsFromRoles(["c-head"], "1", cfg, none), "MANAGEMENT")).toBe(true);
    const coach = permsFromRoles(["c-coach"], "1", cfg, none);
    expect(hasPerm(coach, "STAFF")).toBe(true);
    expect(hasPerm(coach, "MANAGEMENT")).toBe(false);
  });
  it("lets configured admin user IDs in without any role", () => {
    expect(permsFromRoles([], "42", cfg, { adminIds: ["42"] })).toEqual(["MANAGEMENT", "STAFF", "MEMBER"]);
  });
  it("denies a server member holding no mapped role once a member role is mapped", () => {
    expect(permsFromRoles(["other"], "1", cfg, none)).toEqual([]);
  });
  it("lets any server member in while no member role is mapped", () => {
    const open: PermConfig = { ...cfg, perms: { ...cfg.perms, MEMBER: [] } };
    expect(permsFromRoles(["other"], "1", open, none)).toEqual(["MEMBER"]);
  });
});

describe("hasPerm / topLabel", () => {
  it("management implies every level", () => {
    expect(hasPerm(["MANAGEMENT"], "STAFF")).toBe(true);
    expect(hasPerm(["MANAGEMENT"], "MEMBER")).toBe(true);
  });
  it("staff does not imply management, and guests have nothing", () => {
    expect(hasPerm(["STAFF", "MEMBER"], "MANAGEMENT")).toBe(false);
    expect(hasPerm(undefined, "MEMBER")).toBe(false);
    expect(topLabel([])).toBe("Guest");
    expect(topLabel(["STAFF", "MEMBER"])).toBe("Staff");
  });
});

describe("clubRoleFromRoles", () => {
  it("returns the most senior title held", () => {
    expect(clubRoleFromRoles(["c-coach", "c-head"], cfg)).toBe("HEAD_COACH");
    expect(clubRoleFromRoles(["x"], cfg)).toBeNull();
  });
  it("ignores unmapped titles", () => {
    const empty: PermConfig = { ...cfg, clubRoles: { PRESIDENT: "", HEAD_COACH: "", COACH: "" } };
    expect(clubRoleFromRoles([""], empty)).toBeNull();
  });
});
