import { describe, expect, it } from "vitest";
import { cleanRoleConfig, managedRoleIds } from "./role-config";

describe("cleanRoleConfig", () => {
  it("keeps well-formed snowflakes and drops the rest", () => {
    const c = cleanRoleConfig({
      perms: { MANAGEMENT: ["123", "abc", 5, "456"], STAFF: "nope" },
      clubRoles: { PRESIDENT: "789", COACH: "x1" },
      squad: "111",
      status: { STARTER: "222", BOGUS: "333" },
      trialist: " 444",
    });
    expect(c.perms).toEqual({ MEMBER: [], STAFF: [], MANAGEMENT: ["123", "456"] });
    expect(c.clubRoles).toEqual({ PRESIDENT: "789", HEAD_COACH: "", COACH: "" });
    expect(c.squad).toBe("111");
    expect(c.status).toEqual({ STARTER: "222", ROTATION: "", SUBSTITUTE: "" });
    expect(c.trialist).toBe("");
  });
  it("survives garbage input", () => {
    expect(cleanRoleConfig(null).perms.MANAGEMENT).toEqual([]);
    expect(cleanRoleConfig("x").squad).toBe("");
  });
  it("lists only the roles the site gives out", () => {
    const c = cleanRoleConfig({ squad: "1", status: { STARTER: "2" }, trialist: "3", perms: { MANAGEMENT: ["9"] } });
    expect(managedRoleIds(c)).toEqual(["1", "2", "3"]);
  });
});
