import type { SuggestionStatus } from "@prisma/client";
import { SUGGESTION_STATUS_LABEL } from "@/config/club";

// Training sessions' rules, with no database (port of the validation in
// proclubs/training.py). A session is an Event of type Training or Theory
// that carries a plan: a one-line objective, what the session does, what each
// position does in it (role briefs) and, afterwards, a review.

export const MAX_OBJECTIVE = 200;
export const MAX_PLAN = 3000;
export const MAX_BRIEF = 300;
export const MAX_REVIEW = 3000;
export const MAX_SUGGESTION = 500;
export const MAX_REPLY = 300;

export const SUGGESTION_STATUSES = Object.keys(SUGGESTION_STATUS_LABEL) as SuggestionStatus[];
const STATUS_ORDER = new Map(SUGGESTION_STATUSES.map((s, i) => [s, i]));

type Ok<T> = { ok: true; value: T };
type Bad = { ok: false; error: string; field?: string };

export type PlanInput = { objective: string | null; plan: string | null; briefs: Record<string, string> };

/** The plan: lengths checked, blank briefs dropped, every brief on a position the session's formation has. */
export function parsePlan(input: { objective: string; plan: string; briefs: Record<string, string> }, slots: Record<string, string>): Ok<PlanInput> | Bad {
  const objective = input.objective.trim();
  const plan = input.plan.trim();
  if (objective.length > MAX_OBJECTIVE) return { ok: false, field: "objective", error: `Keep the objective under ${MAX_OBJECTIVE} characters.` };
  if (plan.length > MAX_PLAN) return { ok: false, field: "plan", error: `Keep the plan under ${MAX_PLAN.toLocaleString("en")} characters.` };
  const briefs: Record<string, string> = {};
  for (const [key, raw] of Object.entries(input.briefs)) {
    const text = raw.trim();
    if (!text) continue;
    if (!slots[key]) return { ok: false, field: `brief__${key}`, error: "That isn't a position in this session's formation." };
    if (text.length > MAX_BRIEF) return { ok: false, field: `brief__${key}`, error: `Keep each role brief under ${MAX_BRIEF} characters.` };
    briefs[key] = text;
  }
  return { ok: true, value: { objective: objective || null, plan: plan || null, briefs } };
}

/** A review can only be written once the session has started. */
export function parseReview(raw: string, startsAt: Date, now: Date): Ok<string | null> | Bad {
  if (startsAt > now) return { ok: false, field: "review", error: "Review the session after it has happened." };
  const text = raw.trim();
  if (text.length > MAX_REVIEW) return { ok: false, field: "review", error: `Keep the review under ${MAX_REVIEW.toLocaleString("en")} characters.` };
  return { ok: true, value: text || null };
}

export function parseSuggestion(raw: string): Ok<string> | Bad {
  const body = raw.trim();
  if (!body) return { ok: false, field: "body", error: "Say what you'd like to work on." };
  if (body.length > MAX_SUGGESTION) return { ok: false, field: "body", error: `Keep a suggestion under ${MAX_SUGGESTION} characters.` };
  return { ok: true, value: body };
}

export function parseReply(status: string, note: string): Ok<{ status: SuggestionStatus; note: string | null }> | Bad {
  if (!SUGGESTION_STATUSES.includes(status as SuggestionStatus)) return { ok: false, field: "status", error: "Pick a status from the list." };
  const text = note.trim();
  if (text.length > MAX_REPLY) return { ok: false, field: "staffNote", error: `Keep the reply under ${MAX_REPLY} characters.` };
  return { ok: true, value: { status: status as SuggestionStatus, note: text || null } };
}

/** Open ones first, then planned, worked on, declined; newest first within each. */
export function sortSuggestions<T extends { status: SuggestionStatus; createdAt: Date }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => STATUS_ORDER.get(a.status)! - STATUS_ORDER.get(b.status)! || b.createdAt.getTime() - a.createdAt.getTime());
}

/** The slot this player has for a session: their place on a published team sheet, else the shirt they claimed. */
export function myPosition(opts: { sheetPublished: boolean; sheetSlot: string | null; claimedSlot: string | null }): string | null {
  return (opts.sheetPublished && opts.sheetSlot) || opts.claimedSlot || null;
}
