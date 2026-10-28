import { describe, expect, it } from "vitest";
import { setEnvValues } from "./ea-season";

// Port of the old season.py's .env rewriting: change two values, touch nothing else.
describe("setEnvValues", () => {
  const env = ["# YeeHaw FC", 'DISCORD_BOT_TOKEN="secret"', "", 'EA_CLUB_ID="111"', "# EA_PLATFORM=old", 'EA_PLATFORM="common-gen4"', "ROUNDUP_DAYS=2", ""].join("\n");

  it("replaces each key's live line and keeps every other line exactly", () => {
    const out = setEnvValues(env, { EA_CLUB_ID: "222", EA_PLATFORM: "common-gen5" });
    expect(out.split("\n")).toEqual(["# YeeHaw FC", 'DISCORD_BOT_TOKEN="secret"', "", "EA_CLUB_ID=222", "# EA_PLATFORM=old", "EA_PLATFORM=common-gen5", "ROUNDUP_DAYS=2", ""]);
  });
  it("appends a key that isn't there yet", () => {
    const out = setEnvValues("A=1\n", { EA_CLUB_ID: "5" });
    expect(out).toBe("A=1\nEA_CLUB_ID=5\n");
    expect(setEnvValues("A=1", { B: "2" })).toBe("A=1\nB=2\n");
  });
  it("quotes a value with spaces", () => {
    expect(setEnvValues("", { EA_CLUB_NAME: "Yeehaw FC" })).toContain('EA_CLUB_NAME="Yeehaw FC"');
  });
  it("doesn't mistake a comment or a longer key for the key", () => {
    const out = setEnvValues("# EA_CLUB_ID=1\nEA_CLUB_ID_OLD=2\n", { EA_CLUB_ID: "9" });
    expect(out).toBe("# EA_CLUB_ID=1\nEA_CLUB_ID_OLD=2\nEA_CLUB_ID=9\n");
  });
});
