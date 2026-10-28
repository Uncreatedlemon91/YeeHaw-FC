import type { EventType, SignupStatus } from "@prisma/client";
import { EVENT_TYPES, MATCH_TYPES, SESSION_TYPES } from "@/config/club";
import { BENCH_SLOT_KEYS, FORMATIONS } from "@/config/formations";
import { env } from "./env";
import { validDay, validTime } from "./recurrence";
import { fromInput } from "./time";

// The rules of events, with no database: reading the schedule forms, who may
// sign up and how (port of services.set_signup / claim_slot / release_slot),
// when the event is over, and who gets a reminder (matchweek.unanswered).

export const MAX_TITLE = 100;
export const MAX_OPPONENT = 60;
export const MAX_DESCRIPTION = 1500;
/** Sign-ups close for good when the event has been over this long (unless it has an end). */
const DEFAULT_LENGTH_MS = 3 * 3600_000;
/** How long before the start the reminder DM goes out. */
export const REMINDER_AHEAD_MS = 24 * 3600_000;

export const isMatchType = (t: EventType) => MATCH_TYPES.includes(t);
export const isSessionType = (t: EventType) => SESSION_TYPES.includes(t);

/** A sensible length for a new event of this type, in minutes. */
export const defaultDuration = (t: EventType) => (isMatchType(t) ? 120 : isSessionType(t) ? 90 : 120);

export type Getter = (name: string) => string;
type Errors = Record<string, string>;
type Parsed<T> = { ok: true; value: T } | { ok: false; errors: Errors };

export type EventInput = {
  title: string;
  type: EventType;
  opponent: string | null;
  description: string;
  startsAt: Date;
  endsAt: Date;
  formation: string | null;
};

type Common = { title: string; type: EventType; opponent: string | null; description: string; durationMinutes: number; formation: string | null };

/** The fields a one-off event and a series share. */
function parseCommon(get: Getter, errors: Errors): Common {
  const title = get("title").trim();
  if (!title) errors.title = "Give the event a title.";
  else if (title.length > MAX_TITLE) errors.title = `Keep the title under ${MAX_TITLE} characters.`;
  const typeRaw = get("type") as EventType;
  const type: EventType = EVENT_TYPES.includes(typeRaw) ? typeRaw : "MATCH";
  if (get("type") && !EVENT_TYPES.includes(typeRaw)) errors.type = "Pick a type from the list.";
  const opponent = get("opponent").trim();
  if (opponent.length > MAX_OPPONENT) errors.opponent = `Keep the opponent under ${MAX_OPPONENT} characters.`;
  const description = get("description").trim();
  if (description.length > MAX_DESCRIPTION) errors.description = `Keep the description under ${MAX_DESCRIPTION.toLocaleString("en")} characters.`;
  const durRaw = get("duration").trim();
  const durationMinutes = durRaw ? Number(durRaw) : defaultDuration(type);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 720) errors.duration = "Length is 15 to 720 minutes.";
  const formation = get("formation").trim();
  if (formation && !FORMATIONS[formation]) errors.formation = "Pick a formation from the list.";
  return { title, type, opponent: opponent || null, description, durationMinutes, formation: formation || null };
}

/** A one-off event from the form. Times are club time. */
export function parseEvent(get: Getter): Parsed<EventInput> {
  const errors: Errors = {};
  const c = parseCommon(get, errors);
  const startsAt = fromInput(get("startsAt").trim());
  if (!startsAt) errors.startsAt = "Give the event a date and time.";
  if (Object.keys(errors).length || !startsAt) return { ok: false, errors };
  return {
    ok: true,
    value: {
      title: c.title,
      type: c.type,
      opponent: c.opponent,
      description: c.description,
      startsAt,
      endsAt: new Date(startsAt.getTime() + c.durationMinutes * 60_000),
      formation: c.formation,
    },
  };
}

export type SeriesInput = Omit<Common, "durationMinutes"> & {
  durationMinutes: number;
  weekdays: number[];
  timeOfDay: string;
  timezone: string;
  startsOn: string;
  endsOn: string | null;
  announceDaysBefore: number | null;
};

export const ANNOUNCE_CHOICES = [1, 2, 3, 5, 7] as const;

/** A recurring series from the form: weekday checkboxes named "day", a time and a start (and optional end) date in club time. */
export function parseSeries(get: Getter, getAll: (name: string) => string[]): Parsed<SeriesInput> {
  const errors: Errors = {};
  const c = parseCommon(get, errors);
  const weekdays = [...new Set(getAll("day").map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
  if (!weekdays.length) errors.day = "Pick at least one night.";
  const timeOfDay = get("timeOfDay").trim();
  if (!validTime(timeOfDay)) errors.timeOfDay = "Give the time as HH:MM (24-hour).";
  const startsOn = get("startsOn").trim();
  if (!validDay(startsOn)) errors.startsOn = "Give the first date.";
  const endsOn = get("endsOn").trim();
  if (endsOn && !validDay(endsOn)) errors.endsOn = "That isn't a date.";
  else if (endsOn && validDay(startsOn) && endsOn < startsOn) errors.endsOn = "The last date can't be before the first.";
  const annRaw = get("announceDaysBefore").trim();
  const announceDaysBefore = annRaw ? Number(annRaw) : null;
  if (announceDaysBefore != null && !(ANNOUNCE_CHOICES as readonly number[]).includes(announceDaysBefore)) errors.announceDaysBefore = "Pick from the list.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { ...c, weekdays, timeOfDay, timezone: env.timezone, startsOn, endsOn: endsOn || null, announceDaysBefore } };
}

// --- Sign-ups -------------------------------------------------------------- //

/** Every claimable slot of a formation: its eleven, then the bench, as slot key -> label. Empty with no formation. */
export function eventSlots(formation: string | null): Record<string, string> {
  if (!formation || !FORMATIONS[formation]) return {};
  const slots: Record<string, string> = {};
  for (const [key, def] of Object.entries(FORMATIONS[formation])) slots[key] = def.label;
  for (const key of BENCH_SLOT_KEYS) slots[key] = `Sub ${key.slice(3)}`;
  return slots;
}

/** When sign-ups stop altogether: the end of the event, or three hours after the start when none was set. */
export const eventEnd = (e: { startsAt: Date; endsAt: Date | null }) => e.endsAt ?? new Date(e.startsAt.getTime() + DEFAULT_LENGTH_MS);

export type SignupState = { status: SignupStatus; slotKey: string | null };
export type SignupChange = { kind: "status"; status: SignupStatus } | { kind: "claim"; slotKey: string } | { kind: "release" };
export type SignupContext = {
  signupsOpen: boolean;
  /** The event is over: nothing can change. */
  over: boolean;
  formation: string | null;
  /** slot key -> who holds it now. */
  holders: Record<string, { playerId: string; name: string }>;
  playerId: string;
};

/**
 * What happens when somebody answers. Answering is idempotent per player.
 * Maybe or Out gives up any shirt (a held slot nobody can see is free would
 * quietly block it); claiming a slot IS signing up (it sets Going); giving a
 * shirt up keeps you Going ("I'll be there, just not in that position").
 */
export function applySignup(current: SignupState | null, change: SignupChange, ctx: SignupContext): { ok: true; next: SignupState } | { ok: false; error: string } {
  if (ctx.over) return { ok: false, error: "This event is over." };
  if (!ctx.signupsOpen) return { ok: false, error: "Sign-ups for this event are closed." };
  switch (change.kind) {
    case "status":
      if (!["GOING", "MAYBE", "OUT"].includes(change.status)) return { ok: false, error: "Pick going, maybe or can't make it." };
      return { ok: true, next: { status: change.status, slotKey: change.status === "GOING" ? (current?.slotKey ?? null) : null } };
    case "claim": {
      const slots = eventSlots(ctx.formation);
      if (!ctx.formation) return { ok: false, error: "This event doesn't use positions." };
      if (!slots[change.slotKey]) return { ok: false, error: `${change.slotKey} isn't a position in this event's formation.` };
      const holder = ctx.holders[change.slotKey];
      if (holder && holder.playerId !== ctx.playerId) return { ok: false, error: `${slots[change.slotKey]} is already taken by ${holder.name}.` };
      return { ok: true, next: { status: "GOING", slotKey: change.slotKey } };
    }
    case "release":
      if (!current) return { ok: false, error: "You haven't signed up." };
      return { ok: true, next: { status: current.status, slotKey: null } };
  }
}

/** Position preferences (best first, up to three, distinct). */
export function parsePreferences(raw: readonly string[], allowed: readonly string[]): { ok: true; value: [string | null, string | null, string | null] } | { ok: false; error: string } {
  const chosen = raw.map((p) => p.trim()).filter(Boolean);
  if (chosen.some((p) => !allowed.includes(p))) return { ok: false, error: "Pick positions from the list." };
  if (new Set(chosen).size !== chosen.length) return { ok: false, error: "Each choice has to be a different position." };
  const [a = null, b = null, c = null] = chosen;
  return { ok: true, value: [a, b, c] };
}

// --- Reminders -------------------------------------------------------------- //

export type ReminderCandidate = { id: string; startsAt: Date; signupsOpen: boolean };

/** Events due a reminder now: still ahead, within a day, and still taking answers. */
export function eventsNeedingReminder<E extends ReminderCandidate>(events: readonly E[], now: Date, aheadMs = REMINDER_AHEAD_MS): E[] {
  return events.filter((e) => e.signupsOpen && e.startsAt > now && e.startsAt.getTime() <= now.getTime() + aheadMs);
}

export type Contracted = { playerId: string; discordId: string };

/**
 * Who gets the reminder for one event: contracted players with no answer at
 * all (going, maybe or out all count as an answer) who are not away that day.
 */
export function reminderTargets(contracted: readonly Contracted[], answered: ReadonlySet<string>, away: ReadonlySet<string> = new Set()): Contracted[] {
  return contracted.filter((c) => !answered.has(c.playerId) && !away.has(c.playerId));
}

/** The once-only key for a reminder, as stored in Notification. */
export const reminderKey = (eventId: string, playerId: string) => `${eventId}:${playerId}`;
