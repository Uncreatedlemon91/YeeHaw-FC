import type { RosterMoveKind, ServiceEntryKind } from "@prisma/client";
import { monthKey } from "./time";

// A player's service record: one timeline merged from everything the club
// knows about them, and who may see which part of their file. Port of
// proclubs/service_record.py.
//
// Three kinds of source feed the timeline:
//   worked out   milestones computed from the player's recorded EA matches
//                (debut, 25/50/100/200/300 appearances, first goal, hat-tricks,
//                personal best...), dated by the match they happened in.
//                Nothing is stored, so a corrected gamertag link or a late
//                match fixes them by itself.
//   recorded     roster moves (offers, signings, releases), EA squad changes,
//                and Player of the Month awards.
//   written      entries staff add by hand (ServiceEntry).
//
// Clearance is decided here, on the server, before anything reaches a page:
//   everyone        milestones, Player of the Month, commendations
//   player + staff  contract and squad moves, warnings
//   staff           notes, and not the staff member they are about
// Contract moves the viewer may not see come back as ONE redacted row, so the
// page keeps its shape. Warnings and notes are simply absent without
// clearance: a bar there would tell the squad somebody had been warned.

export const APPS_STEPS = [25, 50, 100, 200, 300];
export const GOALS_STEPS = [10, 25, 50, 100];
export const ASSISTS_STEPS = [10, 25, 50, 100];
export const MOTM_STEPS = [5, 10, 25];
export const CLEAN_SHEET_STEPS = [5, 10, 25];
export const HAT_TRICK_GOALS = 3;
/** A "personal best" out of two or three games is just the highest of a few. */
export const MIN_RATED_FOR_BEST = 5;

export const GROUPS = [
  { key: "milestone", label: "Milestones" },
  { key: "squad", label: "Squad moves" },
  { key: "honour", label: "Honors" },
  { key: "staff", label: "Staff entries" },
] as const;
export type Group = (typeof GROUPS)[number]["key"];

// --- Who sees what ------------------------------------------------------- //

export type Viewer = { isSelf: boolean; isStaff: boolean };

export function canView(kind: ServiceEntryKind, v: Viewer): boolean {
  if (kind === "COMMENDATION") return true;
  if (kind === "WARNING") return v.isSelf || v.isStaff;
  return v.isStaff && !v.isSelf; // NOTE
}

/** Staff write about other people: nobody commends, warns or notes themselves. */
export function canAdd(v: Viewer): boolean {
  return v.isStaff && !v.isSelf;
}

/** The entry's author or management, and only an entry the viewer may see. */
export function canDelete(kind: ServiceEntryKind, authorId: string | null, userId: string | undefined, v: Viewer & { isManagement: boolean }): boolean {
  if (!v.isStaff || !canView(kind, v)) return false;
  return v.isManagement || (!!authorId && authorId === userId);
}

// --- Milestones from matches --------------------------------------------- //

/** One of the player's recorded matches, oldest first when passed in. */
export type MatchLine = {
  playedAt: Date | null;
  oppName: string | null;
  usScore: number | null;
  oppScore: number | null;
  pos: string | null;
  rating: number | null;
  goals: number | null;
  assists: number | null;
  mom: boolean;
  cleanSheet: boolean;
};

export type Entry = {
  id: string;
  group: Group;
  kind: string;
  at: Date | null;
  title: string;
  detail: string;
  /** Present only for written entries. */
  entryId?: string;
  author?: string;
  authorId?: string | null;
  /** A stand-in for something the viewer may not see. */
  redacted?: boolean;
  clearance?: string;
  what?: string;
};

let seq = 0;
const entry = (group: Group, kind: string, at: Date | null, title: string, detail = "", extra: Partial<Entry> = {}): Entry => ({
  id: `e${seq++}`,
  group,
  kind,
  at,
  title,
  detail,
  ...extra,
});

const versus = (m: MatchLine) => {
  const score = m.usScore != null && m.oppScore != null ? `, ${m.usScore}–${m.oppScore}` : "";
  return `vs ${m.oppName || "opponent"}${score}`;
};

/** Keeper or defender: the only positions credited with a clean sheet. */
export const keepsCleanSheet = (m: Pick<MatchLine, "cleanSheet" | "pos">) =>
  m.cleanSheet && ["goalkeeper", "defender"].includes((m.pos ?? "").toLowerCase());

export function computeMilestones(matches: readonly MatchLine[]): Entry[] {
  const out: Entry[] = [];
  let apps = 0, goals = 0, assists = 0, motm = 0, clean = 0, rated = 0;
  let best: { rating: number; at: Date | null; where: string } | null = null;
  for (const m of matches) {
    const at = m.playedAt;
    const where = versus(m);
    apps++;
    if (apps === 1) out.push(entry("milestone", "apps", at, "Debut", where));
    else if (APPS_STEPS.includes(apps)) out.push(entry("milestone", "apps", at, `${apps} appearances`, where));

    const g = m.goals ?? 0;
    const a = m.assists ?? 0;
    let before = goals;
    goals += g;
    if (before === 0 && goals >= 1) out.push(entry("milestone", "goals", at, "First goal", where));
    for (const step of GOALS_STEPS) if (before < step && step <= goals) out.push(entry("milestone", "goals", at, `${step} goals`, where));
    before = assists;
    assists += a;
    if (before === 0 && assists >= 1) out.push(entry("milestone", "assists", at, "First assist", where));
    for (const step of ASSISTS_STEPS) if (before < step && step <= assists) out.push(entry("milestone", "assists", at, `${step} assists`, where));
    if (g >= HAT_TRICK_GOALS) out.push(entry("milestone", "goals", at, g === 3 ? "Hat-trick" : `${g} goals in a match`, where));

    if (m.mom) {
      motm++;
      if (motm === 1) out.push(entry("milestone", "motm", at, "First Man of the Match", where));
      else if (MOTM_STEPS.includes(motm)) out.push(entry("milestone", "motm", at, `${motm} Man of the Match awards`, where));
    }
    if (keepsCleanSheet(m)) {
      clean++;
      if (CLEAN_SHEET_STEPS.includes(clean)) out.push(entry("milestone", "cs", at, `${clean} clean sheets`, where));
    }
    if (m.rating) {
      rated++;
      if (!best || m.rating > best.rating) best = { rating: m.rating, at, where };
    }
  }
  if (best && rated >= MIN_RATED_FOR_BEST)
    out.push(entry("milestone", "rating", best.at, `Personal best rating, ${best.rating.toFixed(1)}`, best.where));
  return out;
}

// --- Ribbons ------------------------------------------------------------- //

export type Ribbon = { label: string; family: string; potm: boolean };

/** One ribbon per recognition milestone reached and per Player of the Month won. */
export function ribbons(milestones: readonly { key: string; label: string }[], potmMonths: readonly string[]): Ribbon[] {
  return [
    ...potmMonths.map((m) => ({ label: `Player of the Month, ${monthLabel(m)}`, family: "motm", potm: true })),
    ...milestones.map((h) => ({ label: h.label, family: h.key.split("-")[0], potm: false })),
  ];
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}

// --- The timeline -------------------------------------------------------- //

export type MoveRow = {
  kind: RosterMoveKind;
  at: Date;
  seasonName: string | null;
  position: string | null;
  note: string | null;
};
export type WrittenRow = {
  id: string;
  kind: ServiceEntryKind;
  body: string;
  occurredAt: Date;
  authorName: string;
  authorId: string | null;
};

const MOVE_TITLE: Record<RosterMoveKind, string> = {
  OFFER: "Offered a contract",
  STAFF_OFFER: "Offered a staff role",
  RENEWAL: "Offered a new contract",
  ACCEPT: "Signed a contract",
  SIGNING: "Signed a contract",
  DECLINE: "Offer closed",
  CHANGE: "Contract terms changed",
  RELEASE: "Left the club",
  EXPIRE: "Contract ended",
};

export function buildTimeline(input: {
  matches: readonly MatchLine[];
  potm: readonly { month: string; votes: number; awardedAt: Date }[];
  moves: readonly MoveRow[];
  eaMoves: readonly { move: string; movedAt: Date }[];
  written: readonly WrittenRow[];
  viewer: Viewer;
}): Entry[] {
  const { viewer } = input;
  const seePrivate = viewer.isSelf || viewer.isStaff;
  const items = computeMilestones(input.matches);
  for (const a of input.potm)
    items.push(entry("honour", "potm", a.awardedAt, "Player of the Month", `${monthLabel(a.month)}${a.votes ? `, ${a.votes} votes` : ""}`));
  for (const w of input.written) {
    if (!canView(w.kind, viewer)) continue;
    items.push(
      entry(w.kind === "COMMENDATION" ? "honour" : "staff", w.kind.toLowerCase(), w.occurredAt, w.kind[0] + w.kind.slice(1).toLowerCase(), w.body, {
        entryId: w.id,
        author: w.authorName,
        authorId: w.authorId,
      }),
    );
  }
  if (seePrivate) {
    for (const m of input.moves) {
      const detail = [m.seasonName, m.position, m.note].filter(Boolean).join(" · ");
      items.push(entry("squad", "move", m.at, MOVE_TITLE[m.kind], detail));
    }
    for (const m of input.eaMoves) items.push(entry("squad", "move", m.movedAt, m.move === "joined" ? "Joined the EA club" : "Left the EA club"));
  }
  // Newest first; undated last.
  items.sort((a, b) => (b.at?.getTime() ?? -Infinity) - (a.at?.getTime() ?? -Infinity));
  if (!seePrivate)
    items.push(entry("squad", "contract", null, "", "", { redacted: true, clearance: "Player & staff", what: "Contract and squad moves" }));
  return items;
}

/** The filter chips worth showing: a group with nothing in it is left out. */
export function groupsPresent(timeline: readonly Entry[]) {
  const have = new Set(timeline.map((i) => i.group));
  return GROUPS.filter((g) => have.has(g.key));
}

/** "2026-10" bucket for a match, for per-month rollups. */
export const matchMonth = (m: Pick<MatchLine, "playedAt">) => (m.playedAt ? monthKey(m.playedAt) : "undated");
