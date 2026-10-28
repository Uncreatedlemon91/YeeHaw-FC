import type { EventType, SignupStatus } from "@prisma/client";
import { EVENT_TYPE_LABEL, SIGNUP_LABEL } from "@/config/club";
import { ButtonStyle, row } from "./discord";
import { eventSlots } from "./event-rules";
import { discordTime } from "./time";

// What the bot says about an event: the announcement with its RSVP controls,
// the team sheet, the reminder DM. Plain builders, no I/O (port of the
// builders in discord_rsvp.py and discord_notify.py).

const RED = 0xd4142f;
const MAX_SELECT_OPTIONS = 25;
const STATUSES: readonly SignupStatus[] = ["GOING", "MAYBE", "OUT"];
const BUTTON = { GOING: { style: ButtonStyle.Success, emoji: "✅" }, MAYBE: { style: ButtonStyle.Secondary, emoji: "❔" }, OUT: { style: ButtonStyle.Danger, emoji: "❌" } } as const;

export type EventView = {
  id: string;
  title: string;
  type: EventType;
  opponent: string | null;
  description: string;
  startsAt: Date;
  formation: string | null;
  signupsOpen: boolean;
  sessionObjective: string | null;
  sessionPlan: string | null;
  /** Slot key -> what that position does in this session. */
  roleBriefs: Record<string, string>;
};

export type SignupView = { playerId: string; name: string; status: SignupStatus; slotKey: string | null };

/** "rsvp:going:<eventId>", "rsvp:slot:<eventId>" (the position picker; the slot arrives as the select's value). */
export const rsvpId = (action: "going" | "maybe" | "out" | "slot", eventId: string) => `rsvp:${action}:${eventId}`;

const withOpponent = (e: Pick<EventView, "title" | "opponent">) => (e.opponent ? `${e.title} vs ${e.opponent}` : e.title);

/** The announcement: when, what, and who has answered. With a formation it is the team sheet with open positions listed. */
export function announcementEmbed(e: EventView, signups: readonly SignupView[], url: string, roles: ReadonlyMap<string, string> = new Map()) {
  const lines = [`**When:** ${discordTime(e.startsAt)} (${discordTime(e.startsAt, "R")})`];
  if (e.opponent) lines.push(`**Opponent:** ${e.opponent}`);
  if (e.description) lines.push("", e.description);
  if (e.sessionObjective) lines.push("", `**Objective:** ${e.sessionObjective}`);
  if (e.sessionPlan) lines.push("", e.sessionPlan);

  const slots = eventSlots(e.formation);
  const hasSlots = Object.keys(slots).length > 0;
  const fields = hasSlots ? teamSheetFields(slots, signups) : flatFields(signups, roles);
  const briefs = Object.keys(slots)
    .filter((k) => e.roleBriefs[k])
    .map((k) => `**${slots[k]}** — ${e.roleBriefs[k]}`)
    .join("\n");
  if (briefs) fields.push({ name: "Role briefs", value: briefs.slice(0, 1024), inline: false });

  const embed: Record<string, unknown> = {
    title: `${EVENT_TYPE_LABEL[e.type]}: ${e.title}`.slice(0, 256),
    description: lines.join("\n").slice(0, 4096),
    fields,
    url,
    color: RED,
  };
  if (!e.signupsOpen) embed.footer = { text: "Sign-ups are closed" };
  else if (hasSlots) embed.footer = { text: "Pick a position below to sign up" };
  return embed;
}

function flatFields(signups: readonly SignupView[], roles: ReadonlyMap<string, string>) {
  return STATUSES.map((status) => {
    const named = signups.filter((s) => s.status === status);
    const value = named.map((s) => s.name + (roles.has(s.playerId) ? ` — ${roles.get(s.playerId)}` : "")).join("\n") || "—";
    return { name: `${SIGNUP_LABEL[status]} (${named.length})`, value: value.slice(0, 1024), inline: true };
  });
}

function teamSheetFields(slots: Record<string, string>, signups: readonly SignupView[]) {
  const bySlot = new Map(signups.filter((s) => s.slotKey).map((s) => [s.slotKey!, s]));
  const keys = Object.keys(slots);
  const starting = keys.filter((k) => !k.startsWith("SUB"));
  const bench = keys.filter((k) => k.startsWith("SUB"));
  const sheet = starting.map((k) => (bySlot.has(k) ? `**${slots[k]}** — ${bySlot.get(k)!.name}` : `${slots[k]} — *open*`)).join("\n");
  const filled = starting.filter((k) => bySlot.has(k)).length;
  const fields: { name: string; value: string; inline: boolean }[] = [{ name: `Starting XI (${filled}/${starting.length})`, value: sheet.slice(0, 1024), inline: true }];
  if (bench.some((k) => bySlot.has(k)))
    fields.push({ name: "Bench", value: bench.filter((k) => bySlot.has(k)).map((k) => `**${slots[k]}** — ${bySlot.get(k)!.name}`).join("\n").slice(0, 1024), inline: true });
  // Answered without taking a position: a "maybe" is a body that might cover a gap, so never drop them.
  const others = signups.filter((s) => !s.slotKey);
  if (others.length) fields.push({ name: "No position yet", value: others.map((s) => `${s.name} — ${SIGNUP_LABEL[s.status]}`).join("\n").slice(0, 1024), inline: false });
  return fields;
}

/**
 * The controls under the post. With a formation: a picker of the open
 * positions (picking one IS signing up, so there is no Going button to
 * contradict it) plus Maybe / Can't make it. Without: the three buttons.
 * Nothing once sign-ups close.
 */
export function announcementComponents(e: Pick<EventView, "id" | "formation" | "signupsOpen">, signups: readonly SignupView[]) {
  if (!e.signupsOpen) return [];
  const buttons = (statuses: readonly SignupStatus[]) =>
    row(
      ...statuses.map((s) => ({
        type: 2,
        style: BUTTON[s].style,
        label: SIGNUP_LABEL[s],
        emoji: { name: BUTTON[s].emoji },
        custom_id: rsvpId(s.toLowerCase() as "going", e.id),
      })),
    );
  const slots = eventSlots(e.formation);
  if (!Object.keys(slots).length) return [buttons(STATUSES)];
  const taken = new Set(signups.filter((s) => s.slotKey).map((s) => s.slotKey!));
  const options = Object.entries(slots)
    .filter(([k]) => !taken.has(k))
    .map(([k, label]) => ({ label, value: k, description: k.startsWith("SUB") ? "Bench" : "Starting XI" }))
    .slice(0, MAX_SELECT_OPTIONS);
  // Discord rejects a select with no options: a full squad just loses the picker.
  const rows = options.length ? [row({ type: 3, custom_id: rsvpId("slot", e.id), placeholder: "Pick your position", options })] : [];
  return [...rows, buttons(["MAYBE", "OUT"])];
}

export const announcementPayload = (e: EventView, signups: readonly SignupView[], url: string, roles?: ReadonlyMap<string, string>) => ({
  embeds: [announcementEmbed(e, signups, url, roles)],
  components: announcementComponents(e, signups),
  allowed_mentions: { parse: [] },
});

/** The team sheet posted when staff publish an event's lineup: (position label, Discord id). */
export function teamSheetEmbed(e: EventView, xi: readonly { label: string; discordId: string }[], bench: readonly { label: string; discordId: string }[], url: string, by?: string | null) {
  const lines = (rows: typeof xi) => rows.map((r) => `\`${r.label.padEnd(4)}\` <@${r.discordId}>`).join("\n") || "—";
  const embed: Record<string, unknown> = {
    title: `Team sheet — ${withOpponent(e)}`.slice(0, 256),
    url,
    color: RED,
    description: `Kick-off ${discordTime(e.startsAt)}${e.formation ? ` · ${e.formation}` : ""}`,
    fields: [{ name: "Starting XI", value: lines(xi).slice(0, 1024), inline: false }],
  };
  if (bench.length) (embed.fields as object[]).push({ name: "Bench", value: lines(bench).slice(0, 1024), inline: false });
  if (by) embed.footer = { text: `Picked by ${by}` };
  return embed;
}

// --- DMs (plain text; every one links back to the site) ------------------- //

export const reminderDm = (e: Pick<EventView, "title" | "opponent" | "startsAt">, url: string) =>
  `**${withOpponent(e)}** is ${discordTime(e.startsAt, "R")} and we haven't heard from you. Going, maybe or out? ${url}`;

export const shirtDm = (e: Pick<EventView, "title" | "opponent" | "startsAt">, label: string, starting: boolean, url: string) =>
  `You're ${starting ? `starting at **${label}**` : `on the bench (**${label}**)`} for **${withOpponent(e)}**, ${discordTime(e.startsAt)}.\nTeam sheet: ${url}`;

export const availabilityDm = (url: string) =>
  `Which nights can you usually play? Set them once and the coaches can plan around you, and mark any dates you're away: ${url}`;
