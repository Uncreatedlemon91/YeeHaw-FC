import { describe, expect, it } from "vitest";
import { avatarUrl, slugify } from "./utils";

describe("slugify", () => {
  it("makes URL-safe slugs", () => {
    expect(slugify("  Ñoño O'Brien  ")).toBe("nono-obrien");
    expect(slugify("Viper_99 -- FC")).toBe("viper-99-fc");
    expect(slugify("!!!")).toBe("");
  });
});

describe("avatarUrl", () => {
  it("uses the hash when there is one and a default otherwise", () => {
    expect(avatarUrl("1", "abc")).toContain("/avatars/1/abc.png");
    expect(avatarUrl("1", null)).toMatch(/embed\/avatars\/[0-5]\.png$/);
  });
});
