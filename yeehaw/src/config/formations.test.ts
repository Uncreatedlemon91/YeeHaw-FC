import { describe, expect, it } from "vitest";
import { BENCH_SLOT_KEYS, DEFAULT_FORMATION, FORMATIONS, isSlot } from "./formations";

describe("formations", () => {
  it("has the default formation and 20 in total", () => {
    expect(FORMATIONS[DEFAULT_FORMATION]).toBeDefined();
    expect(Object.keys(FORMATIONS)).toHaveLength(20);
  });
  it("puts exactly eleven players with one goalkeeper on every pitch", () => {
    for (const [name, slots] of Object.entries(FORMATIONS)) {
      expect(Object.keys(slots), name).toHaveLength(11);
      expect(slots.GK, name).toBeDefined();
      for (const s of Object.values(slots)) {
        expect(s.top).toBeGreaterThanOrEqual(0);
        expect(s.top).toBeLessThanOrEqual(100);
        expect(s.left).toBeGreaterThanOrEqual(0);
        expect(s.left).toBeLessThanOrEqual(100);
      }
    }
  });
  it("validates slots, including the bench", () => {
    expect(isSlot("4-3-3", "CM2")).toBe(true);
    expect(isSlot("4-3-3", "CAM")).toBe(false);
    expect(isSlot("4-3-3", "SUB7")).toBe(true);
    expect(isSlot("nope", "GK")).toBe(false);
    expect(BENCH_SLOT_KEYS).toHaveLength(7);
  });
});
