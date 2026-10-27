import { describe, expect, it } from "vitest";
import { desiredRoleIds, roleChanges } from "./role-sync";
import type { RoleConfig } from "./role-config";

const cfg: RoleConfig = {
  perms: { MEMBER: ["m"], STAFF: ["s"], MANAGEMENT: ["g"] },
  clubRoles: { PRESIDENT: "", HEAD_COACH: "", COACH: "" },
  squad: "squad",
  status: { STARTER: "starter", ROTATION: "rotation", SUBSTITUTE: "sub" },
  trialist: "trial",
};
const d = (s: string) => new Date(s);
const none = { live: [], offered: false, trialling: false };

describe("desiredRoleIds", () => {
  it("gives squad and status roles to someone under contract", () => {
    expect(desiredRoleIds({ ...none, live: [{ squadStatus: "STARTER", seasonStartsAt: d("2026-10-20") }] }, cfg)).toEqual(["squad", "starter"]);
  });
  it("uses the newest season's status when two contracts overlap in a window", () => {
    const live = [
      { squadStatus: "STARTER" as const, seasonStartsAt: d("2026-10-20") },
      { squadStatus: "SUBSTITUTE" as const, seasonStartsAt: d("2027-01-12") },
    ];
    expect(desiredRoleIds({ ...none, live }, cfg)).toEqual(["squad", "sub"]);
  });
  it("gives the trialist role to an open offer or a trial, until signed", () => {
    expect(desiredRoleIds({ ...none, offered: true }, cfg)).toEqual(["trial"]);
    expect(desiredRoleIds({ ...none, trialling: true }, cfg)).toEqual(["trial"]);
    expect(desiredRoleIds({ live: [{ squadStatus: "ROTATION", seasonStartsAt: d("2026-10-20") }], offered: true, trialling: true }, cfg)).toEqual(["squad", "rotation"]);
  });
  it("gives nothing to a free agent, and skips roles that aren't mapped", () => {
    expect(desiredRoleIds(none, cfg)).toEqual([]);
    expect(desiredRoleIds({ ...none, live: [{ squadStatus: "STARTER", seasonStartsAt: d("2026-10-20") }] }, { ...cfg, status: { ...cfg.status, STARTER: "" } })).toEqual(["squad"]);
  });
});

describe("roleChanges", () => {
  const managed = ["squad", "starter", "rotation", "sub", "trial"];
  it("adds what is missing and removes what no longer applies", () => {
    expect(roleChanges(["squad", "rotation", "m"], ["squad", "starter"], managed)).toEqual({ add: ["starter"], remove: ["rotation"] });
  });
  it("never touches a role the site doesn't manage", () => {
    expect(roleChanges(["g", "s", "m"], [], managed)).toEqual({ add: [], remove: [] });
    expect(roleChanges([], ["squad", "other"], managed)).toEqual({ add: ["squad"], remove: [] });
  });
  it("takes every managed role off a released player", () => {
    expect(roleChanges(["squad", "starter", "m"], [], managed).remove.sort()).toEqual(["squad", "starter"]);
  });
});
