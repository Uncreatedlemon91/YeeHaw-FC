import type { SlotMap } from "./lineup-rules";

/** A slot map as it arrives from the browser: anything that isn't string -> string is rejected, blanks dropped. */
export function readSlotMap(raw: unknown): SlotMap | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: SlotMap = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== "string") return null;
    if (v) out[k] = v;
  }
  return out;
}
