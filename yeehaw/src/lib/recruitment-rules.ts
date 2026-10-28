import type { Position, ProspectStage } from "@prisma/client";
import { ONBOARDING, POSITIONS, PROSPECT_STAGE_LABEL } from "@/config/club";
import { env } from "./env";
import { discordTime } from "./time";

// How somebody goes from joining the server to settled in the squad (port of
// proclubs/recruitment.py), with no database:
//
//   joins the server -> PROSPECT (a file) -> TRIAL (notes from sessions they
//   played) -> OFFERED (a contract offer) -> SIGNED (they accept) -> settling
//   in (the onboarding checklist); or REJECTED ("Not for us") at any point.
//
// Staff move a file between PROSPECT, TRIAL and REJECTED by hand. OFFERED and
// SIGNED follow the contract: offering moves the file to OFFERED, and the
// player accepting moves it to SIGNED, since on this site accepting needs no
// staff confirmation. A trial note taken from a match also moves a PROSPECT
// onto TRIAL.

export const MAX_NAME = 60;
export const MAX_NOTE = 2000;
export const MAX_SOURCE = 120;
export const MAX_GAMERTAG = 64;
/** How far back "new in the server" looks. */
export const ARRIVAL_WINDOW_MS = 30 * 86_400_000;

export const STAGES: readonly ProspectStage[] = ["PROSPECT", "TRIAL", "OFFERED", "SIGNED", "REJECTED"];
/** Files still being decided. */
export const ACTIVE_STAGES: readonly ProspectStage[] = ["PROSPECT", "TRIAL", "OFFERED"];
/** The stages staff can move a file to themselves. */
export const MANUAL_STAGES: readonly ProspectStage[] = ["PROSPECT", "TRIAL", "REJECTED"];

/** A staff move between stages: the verdict, or why not. */
export function manualMove(from: ProspectStage, to: ProspectStage): { ok: true } | { ok: false; error: string } {
  if (!STAGES.includes(to)) return { ok: false, error: "Pick a stage from the list." };
  if (from === to) return { ok: false, error: `Already ${PROSPECT_STAGE_LABEL[to].toLowerCase()}.` };
  if (from === "SIGNED") return { ok: false, error: "They have signed. Their file is settled: manage them from their player page." };
  if (to === "OFFERED") return { ok: false, error: "A file moves to Offered when you offer a contract." };
  if (to === "SIGNED") return { ok: false, error: "A file moves to Signed when the player accepts their contract offer." };
  return { ok: true };
}

/** A trial note written from a match means they have trialled. */
export const stageAfterNote = (stage: ProspectStage, fromEvent: boolean): ProspectStage => (stage === "PROSPECT" && fromEvent ? "TRIAL" : stage);

/** A contract offer went out. A file that was already signed stays signed. */
export const stageAfterOffer = (stage: ProspectStage): ProspectStage => (stage === "PROSPECT" || stage === "TRIAL" || stage === "REJECTED" ? "OFFERED" : stage);

/** The player answered. Accepting signs them; declining leaves the file Offered for staff to decide. */
export const stageAfterAnswer = (stage: ProspectStage, decision: "accept" | "decline"): ProspectStage => (decision === "accept" ? "SIGNED" : stage);

// --- Forms ----------------------------------------------------------------- //

type Errors = Record<string, string>;
export type ProspectInput = { name: string; discordId: string | null; gamertag: string | null; position: Position | null; secondaryPosition: Position | null; source: string | null };

export function parseProspect(get: (k: string) => string): { ok: true; value: ProspectInput } | { ok: false; errors: Errors } {
  const errors: Errors = {};
  const name = get("name").trim();
  if (!name) errors.name = "Give the prospect a name.";
  else if (name.length > MAX_NAME) errors.name = `Keep the name under ${MAX_NAME} characters.`;
  const discordId = get("discordId").trim();
  if (discordId && !/^\d{5,25}$/.test(discordId)) errors.discordId = "A Discord ID is a number (Developer Mode, Copy User ID).";
  const gamertag = get("gamertag").trim();
  if (gamertag.length > MAX_GAMERTAG) errors.gamertag = `Keep the gamertag under ${MAX_GAMERTAG} characters.`;
  const source = get("source").trim();
  if (source.length > MAX_SOURCE) errors.source = `Keep the source under ${MAX_SOURCE} characters.`;
  const pos = (field: string) => {
    const v = get(field).trim();
    if (v && !(POSITIONS as readonly string[]).includes(v)) errors[field] = "Pick a position from the list.";
    return (v || null) as Position | null;
  };
  const position = pos("position");
  let secondaryPosition = pos("secondaryPosition");
  if (secondaryPosition && secondaryPosition === position) secondaryPosition = null;
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { name, discordId: discordId || null, gamertag: gamertag || null, position, secondaryPosition, source: source || null } };
}

export function parseTrialNote(body: string, rating: string): { ok: true; value: { body: string; rating: number | null } } | { ok: false; field: "body" | "rating"; error: string } {
  const text = body.trim();
  if (!text) return { ok: false, field: "body", error: "Write the note." };
  if (text.length > MAX_NOTE) return { ok: false, field: "body", error: `Keep a note under ${MAX_NOTE.toLocaleString("en")} characters.` };
  const r = rating.trim();
  if (!r) return { ok: true, value: { body: text, rating: null } };
  const n = Number(r);
  if (!Number.isInteger(n) || n < 1 || n > 10) return { ok: false, field: "rating", error: "Ratings are whole numbers from 1 to 10." };
  return { ok: true, value: { body: text, rating: n } };
}

export const averageRating = (ratings: readonly (number | null)[]): number | null => {
  const r = ratings.filter((x): x is number => !!x);
  return r.length ? Math.round((r.reduce((a, b) => a + b, 0) / r.length) * 10) / 10 : null;
};

// --- Settling in ----------------------------------------------------------- //

export type OnboardingStep = { key: string; label: string; auto: boolean; done: boolean };
export const MANUAL_STEPS: readonly string[] = ONBOARDING.filter((s) => !s.auto).map((s) => s.key);

/** The checklist. Automatic steps are read from the data; the rest are ticked by hand. */
export function onboardingSteps(ticked: readonly string[], auto: Record<string, boolean>): OnboardingStep[] {
  return ONBOARDING.map((s) => ({ key: s.key, label: s.label, auto: s.auto, done: s.auto ? !!auto[s.key] : ticked.includes(s.key) }));
}

export const onboardingProgress = (steps: readonly OnboardingStep[]) => ({ done: steps.filter((s) => s.done).length, total: steps.length });

/** Tick or untick a hand-ticked step; automatic ones can't be. Order follows the checklist. */
export function tickStep(ticked: readonly string[], step: string, done: boolean): { ok: true; value: string[] } | { ok: false; error: string } {
  if (!MANUAL_STEPS.includes(step)) return { ok: false, error: "That step is worked out by the site, so it can't be ticked by hand." };
  const set = new Set(ticked);
  if (done) set.add(step);
  else set.delete(step);
  return { ok: true, value: MANUAL_STEPS.filter((k) => set.has(k)) };
}

// --- New in the server ------------------------------------------------------ //

export type Arrival = { id: string; name: string; username: string; avatar: string | null; joinedAt: Date };
type Member = { user?: { id: string; username: string; avatar?: string | null; bot?: boolean }; nick?: string | null; joined_at?: string };

/**
 * Server members who joined recently and nobody has dealt with: no file, no
 * contract, no club role, not dismissed. `known` holds the Discord ids to skip.
 * Newest first.
 */
export function newArrivals<M extends Member>(members: readonly M[], known: ReadonlySet<string>, now: Date, displayName: (m: M) => string): Arrival[] {
  const out: Arrival[] = [];
  for (const m of members) {
    const u = m.user;
    if (!u || u.bot || known.has(u.id) || !m.joined_at) continue;
    const joinedAt = new Date(m.joined_at);
    if (Number.isNaN(joinedAt.getTime()) || now.getTime() - joinedAt.getTime() > ARRIVAL_WINDOW_MS) continue;
    out.push({ id: u.id, name: displayName(m), username: u.username, avatar: u.avatar ?? null, joinedAt });
  }
  return out.sort((a, b) => b.joinedAt.getTime() - a.joinedAt.getTime());
}

// --- Discord copy ----------------------------------------------------------- //

/** The recruitment channel's copy of a trial note. */
export function feedbackEmbed(
  p: { id: string; name: string; stage: ProspectStage; discordId: string | null; gamertag: string | null; positions: string },
  note: { body: string; rating: number | null; authorName: string; createdAt: Date },
  from: { id: string; title: string; startsAt: Date } | null,
  avg: number | null,
  noteCount: number,
) {
  const colour = !note.rating ? 0x8a93a6 : note.rating >= 7 ? 0x9ccb64 : note.rating >= 5 ? 0xe39a3b : 0xe31937;
  const fields: { name: string; value: string; inline: boolean }[] = [{ name: "Stage", value: PROSPECT_STAGE_LABEL[p.stage], inline: true }];
  if (note.rating) fields.push({ name: "Rating", value: `**${note.rating}/10**`, inline: true });
  if (avg != null && noteCount > 1) fields.push({ name: "Average so far", value: `${avg}/10 over ${noteCount} notes`, inline: true });
  if (from) fields.push({ name: "From", value: `[${from.title}](${env.siteUrl}/fixtures/${from.id}) · ${discordTime(from.startsAt, "f")}`, inline: false });
  if (p.discordId) fields.push({ name: "Discord", value: `<@${p.discordId}>`, inline: true });
  if (p.gamertag) fields.push({ name: "Gamertag", value: p.gamertag.slice(0, 64), inline: true });
  return {
    title: `Trial feedback: ${p.name}`.slice(0, 256),
    url: `${env.siteUrl}/staff/recruitment/${p.id}`,
    color: colour,
    description: ((p.positions ? `*${p.positions}*\n\n` : "") + note.body).slice(0, 4000),
    fields,
    footer: { text: `From ${note.authorName}` },
    timestamp: note.createdAt.toISOString(),
  };
}

export const welcomeDm = (name: string) =>
  `Welcome to YeeHaw FC, ${name}! A few things to get you started:\n` +
  `• Your player file (stats, contract): ${env.siteUrl}/players\n` +
  `• Set the nights you can usually play: ${env.siteUrl}/availability\n` +
  `• Fixtures and sign-ups: ${env.siteUrl}/fixtures\n` +
  `• How we play: ${env.siteUrl}/staff/tactics\n` +
  `Sign in with this Discord account. Look out for the EA club invite in Pro Clubs.`;
