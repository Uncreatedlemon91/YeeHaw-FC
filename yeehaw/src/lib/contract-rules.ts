import type { Captaincy, ContractState, ObjectiveKind, Position, SeasonState, SquadStatus } from "@prisma/client";
import { OBJECTIVE_LABEL, POSITIONS, POSITION_LABEL, SHIRT_MAX, SHIRT_MIN, SQUAD_STATUSES, SQUAD_STATUS_LABEL } from "@/config/club";

// The rules a contract's terms must satisfy, as pure functions so they can be
// tested without a database. The database enforces the same two uniqueness
// rules with partial indexes (init migration); these give the friendly message
// before an insert would fail on them.

export type ObjectiveInput = { kind: ObjectiveKind; target: number };

export type Terms = {
  shirtNumber: number | null;
  squadStatus: SquadStatus;
  position: Position | null;
  secondaryPosition: Position | null;
  captaincy: Captaincy;
  objectives: ObjectiveInput[];
};

export type TermErrors = Partial<Record<"shirtNumber" | "squadStatus" | "position" | "secondaryPosition" | "captaincy" | "objectives", string>>;

/** 1-99, whole. Returns an error message or null. */
export function shirtError(n: number): string | null {
  if (!Number.isInteger(n) || n < SHIRT_MIN || n > SHIRT_MAX) return `Pick a whole number from ${SHIRT_MIN} to ${SHIRT_MAX}.`;
  return null;
}

// --- Objectives ---------------------------------------------------------- //

const ALIASES: Record<string, ObjectiveKind> = {
  apps: "APPEARANCES",
  appearances: "APPEARANCES",
  goals: "GOALS",
  assists: "ASSISTS",
  rating: "AVG_RATING",
  "avg rating": "AVG_RATING",
  "average rating": "AVG_RATING",
  attendance: "ATTENDANCE",
  "clean sheets": "CLEAN_SHEETS",
  cs: "CLEAN_SHEETS",
  motm: "MOTM",
  "man of the match": "MOTM",
};

function kindOf(label: string): ObjectiveKind | null {
  const l = label.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (ALIASES[l]) return ALIASES[l];
  for (const k of Object.keys(OBJECTIVE_LABEL) as ObjectiveKind[]) {
    if (k.toLowerCase().replace(/_/g, " ") === l || OBJECTIVE_LABEL[k].toLowerCase() === l) return k;
  }
  return null;
}

/**
 * "Goals 10, Assists 5, Average rating 7.2" (comma, semicolon or newline
 * separated) into objectives. Returns the first problem as `error`.
 */
export function parseObjectives(text: string): { objectives: ObjectiveInput[]; error?: string } {
  const out: ObjectiveInput[] = [];
  for (const raw of text.split(/[\n,;]+/)) {
    const part = raw.trim();
    if (!part) continue;
    const m = part.match(/^(.*?)[\s:=]+(\d+(?:\.\d+)?)\s*%?$/);
    if (!m) return { objectives: [], error: `"${part}": write an objective as a name and a target, like "Goals 10".` };
    const kind = kindOf(m[1]);
    if (!kind) return { objectives: [], error: `"${m[1].trim()}" isn't an objective. Use ${Object.values(OBJECTIVE_LABEL).join(", ")}.` };
    const target = Number(m[2]);
    if (!(target > 0)) return { objectives: [], error: `"${part}": the target must be above zero.` };
    if (kind === "AVG_RATING" && target > 10) return { objectives: [], error: "An average rating target is out of 10." };
    if (kind === "ATTENDANCE" && target > 100) return { objectives: [], error: "An attendance target is a percentage, up to 100." };
    if (out.some((o) => o.kind === kind)) return { objectives: [], error: `${OBJECTIVE_LABEL[kind]} is listed twice.` };
    out.push({ kind, target });
  }
  return { objectives: out };
}

export function formatObjectives(list: readonly ObjectiveInput[]): string {
  return list.map((o) => `${OBJECTIVE_LABEL[o.kind]} ${o.target}`).join(", ");
}

// --- Terms from a form --------------------------------------------------- //

const isPosition = (v: string): v is Position => (POSITIONS as readonly string[]).includes(v);
const isStatus = (v: string): v is SquadStatus => (SQUAD_STATUSES as readonly string[]).includes(v);

/**
 * Read contract terms from named form values (`get` returns "" for absent).
 * A shirt number and primary position are required unless `allowBlank`,
 * which is for editing a contract carried over before numbers existed.
 */
export function parseTerms(
  get: (name: string) => string,
  opts: { allowBlank?: boolean } = {},
): { terms: Terms; errors?: undefined } | { terms?: undefined; errors: TermErrors } {
  const errors: TermErrors = {};
  const numText = get("shirtNumber").trim();
  let shirtNumber: number | null = null;
  if (numText) {
    shirtNumber = Number(numText);
    const e = shirtError(shirtNumber);
    if (e) errors.shirtNumber = e;
  } else if (!opts.allowBlank) errors.shirtNumber = "Give a shirt number.";

  const status = get("squadStatus");
  if (!isStatus(status)) errors.squadStatus = "Pick a squad status.";

  const pos = get("position");
  const sec = get("secondaryPosition");
  if (pos && !isPosition(pos)) errors.position = "Pick a position from the list.";
  else if (!pos && !opts.allowBlank) errors.position = "Pick a primary position.";
  if (sec && !isPosition(sec)) errors.secondaryPosition = "Pick a position from the list.";
  else if (sec && !pos) errors.secondaryPosition = "Pick a primary position first.";
  else if (sec && sec === pos) errors.secondaryPosition = "The secondary position must differ from the primary.";

  const cap = get("captaincy") || "NONE";
  if (cap !== "NONE" && cap !== "CAPTAIN" && cap !== "VICE") errors.captaincy = "Pick Captain, Vice or none.";

  const obj = parseObjectives(get("objectives"));
  if (obj.error) errors.objectives = obj.error;

  if (Object.keys(errors).length) return { errors };
  return {
    terms: {
      shirtNumber,
      squadStatus: status as SquadStatus,
      position: (pos || null) as Position | null,
      secondaryPosition: (sec || null) as Position | null,
      captaincy: cap as Captaincy,
      objectives: obj.objectives,
    },
  };
}

// --- Uniqueness ---------------------------------------------------------- //

export type LiveHolder = { playerId: string; name: string; shirtNumber: number | null; captaincy: Captaincy };
export type Candidate = { key: string; playerId: string; name: string; shirtNumber: number | null; captaincy: Captaincy };

/**
 * Check candidate terms against the season's live (OFFERED / ACTIVE)
 * contracts and against each other. `live` must exclude the contracts the
 * candidates are about to replace. Returns errors by candidate key.
 */
export function findConflicts(live: readonly LiveHolder[], candidates: readonly Candidate[]): Record<string, TermErrors> {
  const out: Record<string, TermErrors> = {};
  const note = (key: string, field: "shirtNumber" | "captaincy", msg: string) => {
    out[key] = { ...out[key], [field]: out[key]?.[field] ?? msg };
  };
  for (const c of candidates) {
    if (c.shirtNumber != null) {
      const held = live.find((l) => l.shirtNumber === c.shirtNumber && l.playerId !== c.playerId);
      if (held) note(c.key, "shirtNumber", `#${c.shirtNumber} is already ${held.name}'s this season.`);
      const twin = candidates.find((o) => o.key !== c.key && o.shirtNumber === c.shirtNumber);
      if (twin) note(c.key, "shirtNumber", `#${c.shirtNumber} is also given to ${twin.name} in this batch.`);
    }
    if (c.captaincy !== "NONE") {
      const word = c.captaincy === "CAPTAIN" ? "captain" : "vice-captain";
      const held = live.find((l) => l.captaincy === c.captaincy && l.playerId !== c.playerId);
      if (held) note(c.key, "captaincy", `${held.name} is already ${word} this season.`);
      const twin = candidates.find((o) => o.key !== c.key && o.captaincy === c.captaincy);
      if (twin) note(c.key, "captaincy", `${twin.name} is also named ${word} in this batch.`);
    }
  }
  return out;
}

// --- Accepting and declining --------------------------------------------- //

export type Decision = "accept" | "decline";

/**
 * Whether `actorDiscordId` may answer this contract now. Only the named
 * player can, and only while the offer is open in a season that hasn't ended.
 */
export function checkResponse(
  contract: { state: ContractState; playerDiscordId: string; seasonState: SeasonState },
  actorDiscordId: string | undefined,
): { ok: true } | { ok: false; error: string } {
  if (!actorDiscordId || contract.playerDiscordId !== actorDiscordId) return { ok: false, error: "This offer is not addressed to you." };
  if (contract.state !== "OFFERED") {
    const was = contract.state === "ACTIVE" ? "accepted" : contract.state === "DECLINED" ? "declined" : "closed";
    return { ok: false, error: `This offer has already been ${was}.` };
  }
  if (contract.seasonState === "ENDED") return { ok: false, error: "That season has ended, so the offer has lapsed." };
  return { ok: true };
}

// --- Describing changes -------------------------------------------------- //

type Snapshot = Pick<Terms, "shirtNumber" | "squadStatus" | "position" | "secondaryPosition" | "captaincy" | "objectives">;
const CAP: Record<Captaincy, string> = { NONE: "no armband", CAPTAIN: "Captain", VICE: "Vice-captain" };
const pos = (p: Position | null) => (p ? POSITION_LABEL[p] : "none");

/** One line per thing that changed, for the player's DM and the history. */
export function describeChange(before: Snapshot, after: Snapshot): string[] {
  const lines: string[] = [];
  if (before.shirtNumber !== after.shirtNumber)
    lines.push(`Shirt number: ${before.shirtNumber ?? "none"} → ${after.shirtNumber ?? "none"}`);
  if (before.squadStatus !== after.squadStatus)
    lines.push(`Squad status: ${SQUAD_STATUS_LABEL[before.squadStatus]} → ${SQUAD_STATUS_LABEL[after.squadStatus]}`);
  if (before.position !== after.position) lines.push(`Position: ${pos(before.position)} → ${pos(after.position)}`);
  if (before.secondaryPosition !== after.secondaryPosition)
    lines.push(`Secondary position: ${pos(before.secondaryPosition)} → ${pos(after.secondaryPosition)}`);
  if (before.captaincy !== after.captaincy) lines.push(`Armband: ${CAP[before.captaincy]} → ${CAP[after.captaincy]}`);
  if (formatObjectives(before.objectives) !== formatObjectives(after.objectives))
    lines.push(`Objectives: ${formatObjectives(before.objectives) || "none"} → ${formatObjectives(after.objectives) || "none"}`);
  return lines;
}
