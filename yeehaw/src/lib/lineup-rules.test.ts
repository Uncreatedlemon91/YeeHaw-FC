import { describe, expect, it } from "vitest";
import { BENCH_SLOT_KEYS, FORMATIONS } from "@/config/formations";
import { carryOver, checkSlotMap, checkTacticsSlots, parseAbout, parseItem, pitchKeys, placeItem, removeItem, validateLineup } from "./lineup-rules";

const full = (formation = "4-3-3") => Object.fromEntries(pitchKeys(formation).map((k, i) => [k, `p${i}`]));
const everyone = new Set(Array.from({ length: 30 }, (_, i) => `p${i}`));

describe("formations", () => {
  it("every formation has eleven pitch slots", () => {
    for (const [name, slots] of Object.entries(FORMATIONS)) expect(Object.keys(slots), name).toHaveLength(11);
  });
});

describe("checkSlotMap", () => {
  it("accepts a full XI and the bench", () => {
    const slots = { ...full(), SUB1: "p20", SUB7: "p21" };
    expect(checkSlotMap("4-3-3", slots)).toEqual([]);
  });
  it("rejects an unknown formation", () => {
    expect(checkSlotMap("9-9-9", {})[0]).toMatch(/isn't a formation/);
  });
  it("rejects slot keys the formation lacks (4-3-3 has no CM4, 4-4-2 has no LW)", () => {
    expect(checkSlotMap("4-3-3", { CM4: "p1" })[0]).toMatch(/no slot CM4/);
    expect(checkSlotMap("4-4-2", { LW: "p1" })[0]).toMatch(/no slot LW/);
    expect(checkSlotMap("4-3-3", { SUB8: "p1" })).not.toEqual([]);
  });
  it("rejects one player in two slots", () => {
    expect(checkSlotMap("4-3-3", { GK: "p1", ST: "p1" })[0]).toMatch(/one place each/);
  });
  it("rejects blank slot values", () => {
    expect(checkSlotMap("4-3-3", { GK: "" })[0]).toMatch(/empty/);
  });
  it("bench keys are the seven SUB slots", () => {
    expect(BENCH_SLOT_KEYS).toEqual(["SUB1", "SUB2", "SUB3", "SUB4", "SUB5", "SUB6", "SUB7"]);
  });
});

describe("validateLineup", () => {
  it("lets a draft be half filled", () => {
    expect(validateLineup("4-3-3", { GK: "p1" }, everyone)).toEqual([]);
  });
  it("only accepts players under contract", () => {
    const errors = validateLineup("4-3-3", { GK: "p1", ST: "ghost" }, everyone, { nameOf: (id) => (id === "ghost" ? "Ghost" : id) });
    expect(errors).toEqual(["Ghost isn't under contract, so can't be picked."]);
  });
  it("applies the contract check to the bench too", () => {
    expect(validateLineup("4-3-3", { SUB2: "ghost" }, everyone)).toHaveLength(1);
  });
  it("publishing takes a short XI but not an empty pitch", () => {
    expect(validateLineup("4-3-3", full(), everyone, { publish: true })).toEqual([]);
    const { ST: _st, ...ten } = full();
    expect(validateLineup("4-3-3", ten, everyone, { publish: true })).toEqual([]);
    expect(validateLineup("4-3-3", { GK: full().GK }, everyone, { publish: true })).toEqual([]);
    expect(validateLineup("4-3-3", { SUB1: full().GK }, everyone, { publish: true })[0]).toMatch(/at least one player on the pitch/);
    expect(validateLineup("4-3-3", {}, everyone, { publish: true })).toHaveLength(1);
  });
  it("reports duplicates and strangers together", () => {
    expect(validateLineup("4-3-3", { GK: "x", ST: "x" }, everyone)).toHaveLength(2);
  });
});

describe("moving players", () => {
  it("places from the roster, sending the old occupant back", () => {
    expect(placeItem({ GK: "a" }, "b", "GK")).toEqual({ GK: "b" });
  });
  it("moves a placed player to an empty slot", () => {
    expect(placeItem({ GK: "a" }, "a", "ST")).toEqual({ ST: "a" });
  });
  it("swaps two placed players", () => {
    expect(placeItem({ GK: "a", ST: "b" }, "a", "ST")).toEqual({ ST: "a", GK: "b" });
  });
  it("dropping on its own slot changes nothing", () => {
    expect(placeItem({ GK: "a" }, "a", "GK")).toEqual({ GK: "a" });
  });
  it("never leaves a player in two slots", () => {
    let s = placeItem({}, "a", "GK");
    s = placeItem(s, "a", "SUB1");
    s = placeItem(s, "b", "GK");
    expect(Object.values(s).filter((v) => v === "a")).toHaveLength(1);
    expect(removeItem(s, "a")).toEqual({ GK: "b" });
  });
  it("switching formation keeps slots that still exist and the bench", () => {
    expect(carryOver({ GK: "a", CM3: "b", SUB1: "c", LW: "d" }, "4-4-2")).toEqual({ GK: "a", SUB1: "c" });
  });
});

describe("tactics items", () => {
  it("parses player and free-text refs", () => {
    expect(parseItem("p:abc")).toEqual({ kind: "player", id: "abc" });
    expect(parseItem("n:  Bob ")).toEqual({ kind: "name", name: "Bob" });
    expect(parseItem("n:")).toBeNull();
    expect(parseItem("abc")).toBeNull();
    expect(parseItem(`n:${"x".repeat(61)}`)).toBeNull();
  });
  it("shape plus usable refs", () => {
    expect(checkTacticsSlots("4-3-3", { GK: "p:1", ST: "n:Bob" })).toEqual([]);
    expect(checkTacticsSlots("4-3-3", { GK: "1" })).not.toEqual([]);
    expect(checkTacticsSlots("4-3-3", { GK: "p:1", ST: "p:1" })).not.toEqual([]);
  });
});

describe("parseAbout", () => {
  it("trims and nulls blanks", () => {
    expect(parseAbout({ preferredFoot: "", archetype: "  ", bio: " hi " })).toEqual({ ok: true, value: { preferredFoot: null, archetype: null, bio: "hi" } });
  });
  it("checks foot and lengths", () => {
    expect(parseAbout({ preferredFoot: "Elbow", archetype: "", bio: "" })).toMatchObject({ ok: false, field: "preferredFoot" });
    expect(parseAbout({ preferredFoot: "", archetype: "x".repeat(41), bio: "" })).toMatchObject({ ok: false, field: "archetype" });
    expect(parseAbout({ preferredFoot: "Left", archetype: "", bio: "x".repeat(501) })).toMatchObject({ ok: false, field: "bio" });
  });
});

describe("rolesFromSlots", () => {
  it("maps players, and gamertag-named slots, to the slot's position; skips the bench", async () => {
    const { rolesFromSlots } = await import("./tactics");
    const roles = rolesFromSlots(
      "4-3-3",
      [
        { slotKey: "CM1", playerId: "a", playerName: null },
        { slotKey: "ST", playerId: null, playerName: "BobTheStriker" },
        { slotKey: "SUB1", playerId: "c", playerName: null },
      ],
      [{ id: "b", gamertag: "bobthestriker" }],
    );
    expect(Object.fromEntries(roles)).toEqual({ a: "CM", b: "ST" });
  });
});
