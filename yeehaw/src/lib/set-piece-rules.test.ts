import { describe, expect, it } from "vitest";
import { parseSetPiece } from "./set-piece-rules";

const ok = { name: " Near-post flick ", kind: "Corner", side: "Left", takerId: "p1", routine: " go ", targets: "" };

describe("parseSetPiece", () => {
  it("trims and nulls blanks", () => {
    expect(parseSetPiece({ ...ok, side: "", takerId: "" })).toEqual({
      ok: true,
      value: { name: "Near-post flick", kind: "Corner", side: null, takerId: null, routine: "go", targets: null },
    });
  });
  it("needs a name, a known kind and side, and sane lengths", () => {
    expect(parseSetPiece({ ...ok, name: " " })).toMatchObject({ ok: false, field: "name" });
    expect(parseSetPiece({ ...ok, name: "x".repeat(61) })).toMatchObject({ ok: false, field: "name" });
    expect(parseSetPiece({ ...ok, kind: "Dive" })).toMatchObject({ ok: false, field: "kind" });
    expect(parseSetPiece({ ...ok, side: "Up" })).toMatchObject({ ok: false, field: "side" });
    expect(parseSetPiece({ ...ok, routine: "x".repeat(1501) })).toMatchObject({ ok: false, field: "routine" });
    expect(parseSetPiece({ ...ok, targets: "x".repeat(201) })).toMatchObject({ ok: false, field: "targets" });
  });
});
