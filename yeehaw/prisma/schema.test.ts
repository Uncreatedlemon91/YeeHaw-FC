import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Prisma's schema language cannot express partial unique indexes, so they
// live as hand-written SQL in the init migration. Regenerating that
// migration (`migrate diff`) would silently drop them: this catches it.
const dir = new URL("./migrations/", import.meta.url);
const sql = readdirSync(dir)
  .filter((d) => !d.endsWith(".toml"))
  .map((d) => readFileSync(new URL(`${d}/migration.sql`, dir), "utf8"))
  .join("\n");

describe("migrations", () => {
  it("enforces one live shirt number per season", () => {
    expect(sql).toMatch(/UNIQUE INDEX "Contract_season_shirt_live_key"[\s\S]*?WHERE[^;]*"shirtNumber" IS NOT NULL[^;]*'OFFERED', 'ACTIVE'/);
  });
  it("enforces one live captain and vice per season", () => {
    expect(sql).toMatch(/UNIQUE INDEX "Contract_season_captaincy_live_key"[\s\S]*?"captaincy" <> 'NONE'/);
  });
  it("limits shirt numbers to 1-99", () => {
    expect(sql).toMatch(/BETWEEN 1 AND 99/);
  });
  it("allows one open season per state and one player per formation slot", () => {
    expect(sql).toMatch(/UNIQUE INDEX "Season_one_open_state_key"/);
    expect(sql).toMatch(/UNIQUE INDEX "EventSignup_event_slot_key"/);
  });
});
