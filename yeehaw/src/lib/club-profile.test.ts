import { describe, expect, it } from "vitest";
import { cleanProfile, resolveProfile } from "./club-profile";

describe("club profile", () => {
  it("falls back to the defaults when nothing is saved", () => {
    const p = resolveProfile(null);
    expect(p.headline).toBe("Pro Clubs, done properly.");
    expect(p.region).toBe("");
  });

  it("keeps a field saved blank blank (it is left off the page)", () => {
    expect(resolveProfile({ headline: "", about: "Hi" })).toMatchObject({ headline: "", about: "Hi" });
  });

  it("ignores values that are not strings", () => {
    expect(resolveProfile({ headline: 5 }).headline).toBe("Pro Clubs, done properly.");
  });

  it("trims, and refuses a field over its limit", () => {
    expect(cleanProfile({ headline: "  Yee  " })).toMatchObject({ ok: true, value: { headline: "Yee" } });
    const r = cleanProfile({ headline: "x".repeat(81) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors.headline).toMatch(/80/);
  });
});
