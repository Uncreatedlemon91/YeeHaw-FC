import { describe, expect, it } from "vitest";
import { applySignup, eventsNeedingReminder, eventSlots, parseEvent, parsePreferences, parseSeries, reminderKey, reminderTargets, type SignupContext } from "./event-rules";

const form = (o: Record<string, string>) => (k: string) => o[k] ?? "";
const open: SignupContext = { signupsOpen: true, over: false, formation: "4-3-3", holders: {}, playerId: "me" };

describe("eventSlots", () => {
  it("lists the formation's eleven then the bench, and nothing without a formation", () => {
    const s = eventSlots("4-3-3");
    expect(Object.keys(s).slice(0, 2)).toEqual(["GK", "LB"]);
    expect(s.CB1).toBe("CB");
    expect(s.SUB3).toBe("Sub 3");
    expect(Object.keys(s)).toHaveLength(18);
    expect(eventSlots(null)).toEqual({});
    expect(eventSlots("9-9-9")).toEqual({});
  });
});

describe("RSVP rules", () => {
  it("answering Going keeps a held shirt; Maybe or Out gives it up", () => {
    const held = { status: "GOING" as const, slotKey: "ST" };
    expect(applySignup(held, { kind: "status", status: "GOING" }, open)).toEqual({ ok: true, next: held });
    expect(applySignup(held, { kind: "status", status: "MAYBE" }, open)).toEqual({ ok: true, next: { status: "MAYBE", slotKey: null } });
    expect(applySignup(held, { kind: "status", status: "OUT" }, open)).toEqual({ ok: true, next: { status: "OUT", slotKey: null } });
  });

  it("claiming a slot is signing up: it makes you Going", () => {
    const r = applySignup({ status: "MAYBE", slotKey: null }, { kind: "claim", slotKey: "GK" }, open);
    expect(r).toEqual({ ok: true, next: { status: "GOING", slotKey: "GK" } });
    expect(applySignup(null, { kind: "claim", slotKey: "SUB2" }, open)).toEqual({ ok: true, next: { status: "GOING", slotKey: "SUB2" } });
  });

  it("refuses a slot somebody else holds, naming them, but lets you keep your own", () => {
    const ctx = { ...open, holders: { GK: { playerId: "other", name: "Viper" }, ST: { playerId: "me", name: "Me" } } };
    const r = applySignup(null, { kind: "claim", slotKey: "GK" }, ctx);
    expect(r).toEqual({ ok: false, error: "GK is already taken by Viper." });
    expect(applySignup({ status: "GOING", slotKey: "ST" }, { kind: "claim", slotKey: "ST" }, ctx).ok).toBe(true);
  });

  it("moving to another slot just changes the slot (the old one frees by being replaced)", () => {
    const r = applySignup({ status: "GOING", slotKey: "ST" }, { kind: "claim", slotKey: "LW" }, open);
    expect(r).toEqual({ ok: true, next: { status: "GOING", slotKey: "LW" } });
  });

  it("refuses slots that aren't in the formation, and any claim with no formation", () => {
    expect(applySignup(null, { kind: "claim", slotKey: "CAM" }, open).ok).toBe(false);
    const none = applySignup(null, { kind: "claim", slotKey: "GK" }, { ...open, formation: null });
    expect(none).toEqual({ ok: false, error: "This event doesn't use positions." });
  });

  it("giving a shirt up keeps you going; you can't release without having signed up", () => {
    expect(applySignup({ status: "GOING", slotKey: "ST" }, { kind: "release" }, open)).toEqual({ ok: true, next: { status: "GOING", slotKey: null } });
    expect(applySignup(null, { kind: "release" }, open).ok).toBe(false);
  });

  it("closed sign-ups and finished events refuse everything", () => {
    expect(applySignup(null, { kind: "status", status: "GOING" }, { ...open, signupsOpen: false })).toEqual({ ok: false, error: "Sign-ups for this event are closed." });
    expect(applySignup(null, { kind: "status", status: "GOING" }, { ...open, over: true })).toEqual({ ok: false, error: "This event is over." });
  });

  it("rejects a made-up status", () => {
    expect(applySignup(null, { kind: "status", status: "LATE" as never }, open).ok).toBe(false);
  });
});

describe("position preferences", () => {
  const allowed = ["STRIKER", "WINGER", "CENTRE_BACK"];
  it("takes up to three distinct, in order", () => {
    expect(parsePreferences(["WINGER", "", "STRIKER"], allowed)).toEqual({ ok: true, value: ["WINGER", "STRIKER", null] });
  });
  it("refuses repeats and unknown positions", () => {
    expect(parsePreferences(["WINGER", "WINGER"], allowed).ok).toBe(false);
    expect(parsePreferences(["SWEEPER"], allowed).ok).toBe(false);
  });
});

describe("reminder targeting", () => {
  const at = (iso: string) => new Date(iso);
  const now = at("2026-11-02T12:00:00Z");
  const ev = (id: string, iso: string, signupsOpen = true) => ({ id, startsAt: at(iso), signupsOpen });

  it("picks events starting within the next 24 hours with sign-ups open", () => {
    const events = [
      ev("past", "2026-11-02T11:00:00Z"),
      ev("soon", "2026-11-02T20:00:00Z"),
      ev("edge", "2026-11-03T12:00:00Z"),
      ev("later", "2026-11-03T12:00:01Z"),
      ev("closed", "2026-11-02T20:00:00Z", false),
    ];
    expect(eventsNeedingReminder(events, now).map((e) => e.id)).toEqual(["soon", "edge"]);
  });

  it("targets contracted players who have not answered at all", () => {
    const squad = [
      { playerId: "a", discordId: "1" },
      { playerId: "b", discordId: "2" },
      { playerId: "c", discordId: "3" },
      { playerId: "d", discordId: "4" },
    ];
    // a said going, b said out: both answered. c and d did not.
    const targets = reminderTargets(squad, new Set(["a", "b"]));
    expect(targets.map((t) => t.playerId)).toEqual(["c", "d"]);
  });

  it("leaves out players who are away that day", () => {
    const squad = [
      { playerId: "c", discordId: "3" },
      { playerId: "d", discordId: "4" },
    ];
    expect(reminderTargets(squad, new Set(), new Set(["d"])).map((t) => t.playerId)).toEqual(["c"]);
  });

  it("keys the once-only record by event and player", () => {
    expect(reminderKey("e1", "p1")).toBe("e1:p1");
  });
});

describe("parseEvent", () => {
  const good = { title: " Scrim vs Rovers ", type: "SCRIM", startsAt: "2026-11-05T20:00", duration: "90", formation: "4-3-3" };
  it("reads club-time start and a length into an end", () => {
    const r = parseEvent(form(good));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.title).toBe("Scrim vs Rovers");
      expect(r.value.endsAt.getTime() - r.value.startsAt.getTime()).toBe(90 * 60_000);
      expect(r.value.formation).toBe("4-3-3");
    }
  });
  it("names every problem by field", () => {
    const r = parseEvent(form({ title: "", type: "PARTY", startsAt: "", duration: "5", formation: "x" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["duration", "formation", "startsAt", "title", "type"]);
  });
  it("defaults the length by type", () => {
    const r = parseEvent(form({ ...good, type: "TRAINING", duration: "" }));
    if (r.ok) expect(r.value.endsAt.getTime() - r.value.startsAt.getTime()).toBe(90 * 60_000);
  });
});

describe("parseSeries", () => {
  const base = { title: "Tuesday training", type: "TRAINING", timeOfDay: "20:00", startsOn: "2026-11-03", announceDaysBefore: "2" };
  const parse = (o: Record<string, string>, days: string[]) => parseSeries(form(o), () => days);
  it("reads weekdays, time and dates", () => {
    const r = parse(base, ["1", "3", "1"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ weekdays: [1, 3], timeOfDay: "20:00", startsOn: "2026-11-03", endsOn: null, announceDaysBefore: 2 });
  });
  it("needs a night, a real time and sensible dates", () => {
    const r = parse({ ...base, timeOfDay: "8pm", endsOn: "2026-10-01" }, []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["day", "endsOn", "timeOfDay"]);
  });
});
