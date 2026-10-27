import { BENCH_SLOT_KEYS, FORMATIONS, isSlot } from "@/config/formations";

// The rules of a team sheet, shared by the lineup editor and the tactics
// board (pure, no database). A "slot map" is slotKey -> item key: a player's
// id on the lineup, "p:<id>" or "n:<name>" on the tactics board. Pitch slot
// keys come from the formation (GK, CB1, ST...), bench keys are SUB1..SUB7.

export type SlotMap = Record<string, string>;

export const PREFERRED_FEET = ["Right", "Left", "Both"] as const;
export const MAX_ARCHETYPE = 40;
export const MAX_BIO = 500;
export const MAX_NAME = 60;

export const pitchKeys = (formation: string): string[] => Object.keys(FORMATIONS[formation] ?? {});

/** "CB" for CB1, "Sub 3" for SUB3. */
export function slotLabel(formation: string, key: string): string {
  const slot = FORMATIONS[formation]?.[key];
  if (slot) return slot.label;
  const bench = /^SUB(\d+)$/.exec(key);
  return bench ? `Sub ${bench[1]}` : key;
}

/**
 * Shape checks shared by lineups and tactics: a known formation, only slots
 * that formation has (or the bench), a value in every slot, and nobody in two
 * places. Returns every problem, empty when fine.
 */
export function checkSlotMap(formation: string, slots: SlotMap): string[] {
  if (!FORMATIONS[formation]) return [`"${formation}" isn't a formation this site knows.`];
  const errors: string[] = [];
  const unknown = Object.keys(slots).filter((k) => !isSlot(formation, k));
  if (unknown.length) errors.push(`${formation} has no slot ${unknown.sort().join(", ")}.`);
  const seen = new Map<string, string>();
  for (const [key, value] of Object.entries(slots)) {
    if (!value) {
      errors.push(`Slot ${key} is empty; leave it out instead.`);
      continue;
    }
    const first = seen.get(value);
    if (first) errors.push(`The same player is in ${slotLabel(formation, first)} and ${slotLabel(formation, key)}; one place each.`);
    else seen.set(value, key);
  }
  return errors;
}

/**
 * A lineup's rules: valid shape, only players under contract (`eligible` is
 * the set of their ids), and, to publish, all eleven pitch slots filled. A
 * draft may be half done. `nameOf` only makes the messages friendlier.
 */
export function validateLineup(
  formation: string,
  slots: SlotMap,
  eligible: ReadonlySet<string>,
  opts: { publish?: boolean; nameOf?: (id: string) => string } = {},
): string[] {
  const errors = checkSlotMap(formation, slots);
  const nameOf = opts.nameOf ?? (() => "A player");
  const strangers = [...new Set(Object.values(slots).filter((id) => id && !eligible.has(id)))];
  if (strangers.length) errors.push(`${strangers.map(nameOf).join(", ")} ${strangers.length === 1 ? "isn't" : "aren't"} under contract, so can't be picked.`);
  if (opts.publish && FORMATIONS[formation]) {
    const missing = pitchKeys(formation).filter((k) => !slots[k]);
    if (missing.length) errors.push(`Fill every pitch position before publishing (empty: ${missing.map((k) => slotLabel(formation, k)).join(", ")}).`);
  }
  return errors;
}

/** Take an item out of whichever slot holds it. */
export function removeItem(slots: SlotMap, item: string): SlotMap {
  return Object.fromEntries(Object.entries(slots).filter(([, v]) => v !== item));
}

/**
 * Put an item in a slot. If it was already placed it moves, and whoever
 * stood in the target swaps into the place it left; if it came from the
 * roster the target's old occupant simply goes back to the roster.
 */
export function placeItem(slots: SlotMap, item: string, to: string): SlotMap {
  const from = Object.keys(slots).find((k) => slots[k] === item);
  if (from === to) return { ...slots };
  const out = { ...slots };
  const displaced = out[to];
  if (from) delete out[from];
  out[to] = item;
  if (from && displaced) out[from] = displaced;
  return out;
}

/** Switching formation on the lineup: keep everyone whose slot still exists, bench included. */
export function carryOver(slots: SlotMap, formation: string): SlotMap {
  return Object.fromEntries(Object.entries(slots).filter(([k]) => isSlot(formation, k)));
}

/** Tactics board items: "p:<playerId>" for a person on the site, "n:<name>" for a free-text name. */
export type ItemRef = { kind: "player"; id: string } | { kind: "name"; name: string };

export function parseItem(key: string): ItemRef | null {
  if (key.startsWith("p:") && key.length > 2) return { kind: "player", id: key.slice(2) };
  if (key.startsWith("n:")) {
    const name = key.slice(2).trim();
    if (name && name.length <= MAX_NAME) return { kind: "name", name };
  }
  return null;
}

/** Tactics: shape plus every value being a usable item ref. */
export function checkTacticsSlots(formation: string, slots: SlotMap): string[] {
  const errors = checkSlotMap(formation, slots);
  if (Object.values(slots).some((v) => v && !parseItem(v))) errors.push(`A name on the board is empty or longer than ${MAX_NAME} characters.`);
  return errors;
}

export { BENCH_SLOT_KEYS };

/** The player's about-me fields: trimmed, length-checked. */
export function parseAbout(input: { preferredFoot: string; archetype: string; bio: string }):
  | { ok: true; value: { preferredFoot: string | null; archetype: string | null; bio: string | null } }
  | { ok: false; error: string; field: "preferredFoot" | "archetype" | "bio" } {
  const foot = input.preferredFoot.trim();
  if (foot && !(PREFERRED_FEET as readonly string[]).includes(foot)) return { ok: false, field: "preferredFoot", error: `Pick a preferred foot: ${PREFERRED_FEET.join(", ")}.` };
  const archetype = input.archetype.trim();
  if (archetype.length > MAX_ARCHETYPE) return { ok: false, field: "archetype", error: `Keep your build under ${MAX_ARCHETYPE} characters.` };
  const bio = input.bio.trim();
  if (bio.length > MAX_BIO) return { ok: false, field: "bio", error: `Keep your bio under ${MAX_BIO} characters.` };
  return { ok: true, value: { preferredFoot: foot || null, archetype: archetype || null, bio: bio || null } };
}
