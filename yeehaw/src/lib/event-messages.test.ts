import { describe, expect, it } from "vitest";
import { announcementComponents, announcementEmbed, reminderDm, type EventView, type SignupView } from "./event-messages";

const event: EventView = {
  id: "ev1",
  title: "Friday scrim",
  type: "SCRIM",
  opponent: "Rovers",
  description: "",
  startsAt: new Date("2026-11-06T01:00:00Z"),
  formation: "4-3-3",
  signupsOpen: true,
  sessionObjective: null,
  sessionPlan: null,
  roleBriefs: {},
};
const su = (playerId: string, name: string, status: SignupView["status"], slotKey: string | null = null): SignupView => ({ playerId, name, status, slotKey });

describe("announcement components", () => {
  it("offers only the open positions in the picker, plus Maybe and Out", () => {
    const rows = announcementComponents(event, [su("a", "Ann", "GOING", "GK")]) as { components: { type: number; custom_id: string; options?: { value: string }[] }[] }[];
    expect(rows).toHaveLength(2);
    const select = rows[0].components[0];
    expect(select.custom_id).toBe("rsvp:slot:ev1");
    expect(select.options!.map((o) => o.value)).not.toContain("GK");
    expect(select.options!.map((o) => o.value)).toContain("ST");
    expect(rows[1].components.map((c) => c.custom_id)).toEqual(["rsvp:maybe:ev1", "rsvp:out:ev1"]);
  });

  it("drops the picker when every position is taken (Discord refuses an empty select)", () => {
    const all = ["GK", "LB", "CB1", "CB2", "RB", "CM1", "CM2", "CM3", "LW", "ST", "RW", "SUB1", "SUB2", "SUB3", "SUB4", "SUB5", "SUB6", "SUB7"];
    const rows = announcementComponents(event, all.map((k, i) => su(`p${i}`, `P${i}`, "GOING", k)));
    expect(rows).toHaveLength(1);
  });

  it("has three plain buttons without a formation", () => {
    const rows = announcementComponents({ ...event, formation: null }, []) as { components: { custom_id: string }[] }[];
    expect(rows[0].components.map((c) => c.custom_id)).toEqual(["rsvp:going:ev1", "rsvp:maybe:ev1", "rsvp:out:ev1"]);
  });

  it("has no controls once sign-ups close", () => {
    expect(announcementComponents({ ...event, signupsOpen: false }, [])).toEqual([]);
  });

  it("keeps every custom_id inside Discord's 100 characters", () => {
    const long = "c".repeat(30);
    const rows = announcementComponents({ ...event, id: long }, []) as { components: { custom_id: string }[] }[];
    for (const r of rows) for (const c of r.components) expect(c.custom_id.length).toBeLessThanOrEqual(100);
  });
});

describe("announcement embed", () => {
  it("shows open positions and who holds the others", () => {
    const e = announcementEmbed(event, [su("a", "Ann", "GOING", "GK"), su("b", "Bo", "MAYBE")], "https://x/fixtures/ev1") as { fields: { name: string; value: string }[] };
    const xi = e.fields.find((f) => f.name.startsWith("Starting XI"))!;
    expect(xi.name).toBe("Starting XI (1/11)");
    expect(xi.value).toContain("**GK** — Ann");
    expect(xi.value).toContain("ST — *open*");
    expect(e.fields.find((f) => f.name === "No position yet")!.value).toContain("Bo — Maybe");
  });

  it("falls back to going / maybe / out columns with positions from the tactics board", () => {
    const e = announcementEmbed({ ...event, formation: null }, [su("a", "Ann", "GOING")], "u", new Map([["a", "CM"]])) as { fields: { name: string; value: string }[] };
    expect(e.fields.map((f) => f.name)).toEqual(["Going (1)", "Maybe (0)", "Can't make it (0)"]);
    expect(e.fields[0].value).toBe("Ann — CM");
  });
});

describe("reminder DM", () => {
  it("names the fixture and links to it", () => {
    const text = reminderDm(event, "https://x/fixtures/ev1");
    expect(text).toContain("Friday scrim vs Rovers");
    expect(text).toContain("https://x/fixtures/ev1");
  });
});
