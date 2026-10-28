import { Prisma, type Attendance, type Event, type EventSignup, type Player, type Position, type SignupSource } from "@prisma/client";
import { POSITIONS } from "@/config/club";
import { getChannelConfig } from "./channel-config";
import { DiscordError, dm, editMessage, explain, sendMessage } from "./discord";
import { announcementPayload, shirtDm, teamSheetEmbed, type EventView, type SignupView } from "./event-messages";
import {
  applySignup,
  eventEnd,
  eventSlots,
  parsePreferences,
  type EventInput,
  type SignupChange,
} from "./event-rules";
import { env } from "./env";
import { checkSlotMap, slotLabel, type SlotMap } from "./lineup-rules";
import { prisma } from "./prisma";
import { tacticsRoles } from "./tactics";

// Events against the database: schedule, edit, delete, sign-ups, attendance,
// the Discord announcement and each event's team sheet. The site's actions
// and the "rsvp:" Discord buttons both go through respond(), so the two
// surfaces enforce the same rules and show the same roster. As with
// contracts, the Discord side happens AFTER the write and is reported as a
// warning: a Discord problem never undoes what was saved.

export type Actor = { id: string; name: string };
export type R<T = object> = ({ ok: true; warnings: string[] } & T) | { ok: false; error: string; fieldErrors?: Record<string, string> };
const fail = (error: string, fieldErrors?: Record<string, string>) => ({ ok: false as const, error, fieldErrors });

export const eventUrl = (id: string) => `${env.siteUrl}/fixtures/${id}`;

// --- Loading ----------------------------------------------------------------- //

export function briefsOf(json: Prisma.JsonValue | null): Record<string, string> {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  return Object.fromEntries(Object.entries(json).filter((e): e is [string, string] => typeof e[1] === "string" && !!e[1]));
}

export function toView(e: Event): EventView {
  return {
    id: e.id,
    title: e.title,
    type: e.type,
    opponent: e.opponent,
    description: e.description,
    startsAt: e.startsAt,
    formation: e.formation,
    signupsOpen: e.signupsOpen,
    sessionObjective: e.sessionObjective,
    sessionPlan: e.sessionPlan,
    roleBriefs: briefsOf(e.roleBriefs),
  };
}

const STATUS_ORDER = { GOING: 0, MAYBE: 1, OUT: 2 } as const;

/** Everyone who has answered: going, then maybe, then out, each by when they answered. */
export async function loadSignupViews(eventId: string): Promise<SignupView[]> {
  const rows = await prisma.eventSignup.findMany({ where: { eventId }, include: { player: { select: { displayName: true } } } });
  return rows
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.respondedAt.getTime() - b.respondedAt.getTime())
    .map((s) => ({ playerId: s.playerId, name: s.player.displayName, status: s.status, slotKey: s.slotKey }));
}

/** What the announcement message currently looks like for an event: the payload to send or edit with. */
export async function announcementFor(eventId: string): Promise<(object & { embeds: object[]; components: object[] }) | null> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return null;
  const [signups, roles] = await Promise.all([loadSignupViews(eventId), event.formation ? Promise.resolve(new Map<string, string>()) : tacticsRoles()]);
  return announcementPayload(toView(event), signups, eventUrl(eventId), roles);
}

// --- Create, edit, delete ------------------------------------------------------ //

export async function createEvent(input: EventInput, actor: Actor, opts: { announce?: boolean; seriesId?: string } = {}): Promise<R<{ event: Event }>> {
  const event = await prisma.event.create({
    data: { ...input, description: input.description, createdById: actor.id, seriesId: opts.seriesId ?? null },
  });
  const warnings: string[] = [];
  if (opts.announce) {
    const r = await announceEvent(event.id);
    if (!r.ok) warnings.push(`Saved, but not announced: ${r.error}`);
  }
  return { ok: true, warnings, event };
}

export async function updateEvent(id: string, input: EventInput): Promise<R<{ event: Event }>> {
  const old = await prisma.event.findUnique({ where: { id } });
  if (!old) return fail("That event no longer exists.");
  const formationChanged = (old.formation ?? null) !== input.formation;
  const [event] = await prisma.$transaction([
    prisma.event.update({ where: { id }, data: input }),
    // Slot keys are formation-specific: a claimed CM3 means nothing once the
    // shape is 4-4-2. Release every claim (they stay signed up) and clear
    // the team sheet, rather than leave positions that no longer exist.
    ...(formationChanged ? [prisma.eventSignup.updateMany({ where: { eventId: id }, data: { slotKey: null } }), prisma.eventLineup.deleteMany({ where: { eventId: id } })] : []),
  ]);
  const warnings: string[] = [];
  if (formationChanged) warnings.push("The formation changed, so everyone's claimed position and the team sheet were cleared. They are still signed up.");
  const w = await refreshAnnouncement(id);
  if (w) warnings.push(w);
  return { ok: true, warnings, event };
}

export async function deleteEvent(id: string): Promise<R> {
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return fail("That event no longer exists.");
  const warnings: string[] = [];
  if (event.discordChannelId && event.discordMessageId) {
    // The post can't stay open for answers to an event that is gone.
    try {
      await editMessage(event.discordChannelId, event.discordMessageId, {
        embeds: [{ title: `Cancelled: ${event.title}`, description: "This event was cancelled.", color: 0x8a93a6 }],
        components: [],
        allowed_mentions: { parse: [] },
      });
    } catch (e) {
      warnings.push(`The Discord post wasn't updated: ${explain(e)}`);
    }
  }
  await prisma.$transaction([
    prisma.notification.deleteMany({ where: { kind: { in: ["remind", "shirt"] }, key: { startsWith: `${id}:` } } }),
    prisma.event.delete({ where: { id } }),
  ]);
  return { ok: true, warnings };
}

export async function setSignupsOpen(id: string, open: boolean): Promise<R> {
  const r = await prisma.event.updateMany({ where: { id }, data: { signupsOpen: open } });
  if (!r.count) return fail("That event no longer exists.");
  const w = await refreshAnnouncement(id);
  return { ok: true, warnings: w ? [w] : [] };
}

// --- Sign-ups ---------------------------------------------------------------- //

/**
 * One player's answer, from the site or from Discord. Applies the sign-up
 * rules, writes, and refreshes the announcement unless the caller (a Discord
 * button) is about to rewrite it itself.
 */
export async function respond(
  eventId: string,
  player: Pick<Player, "id">,
  change: SignupChange,
  source: SignupSource,
  opts: { refresh?: boolean } = { refresh: true },
): Promise<R<{ signup: EventSignup }>> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return fail("That event no longer exists.");
  const [current, holders] = await Promise.all([
    prisma.eventSignup.findUnique({ where: { eventId_playerId: { eventId, playerId: player.id } } }),
    prisma.eventSignup.findMany({ where: { eventId, slotKey: { not: null } }, include: { player: { select: { displayName: true } } } }),
  ]);
  const verdict = applySignup(
    current ? { status: current.status, slotKey: current.slotKey } : null,
    change,
    {
      signupsOpen: event.signupsOpen,
      over: eventEnd(event) <= new Date(),
      formation: event.formation,
      holders: Object.fromEntries(holders.map((h) => [h.slotKey!, { playerId: h.playerId, name: h.player.displayName }])),
      playerId: player.id,
    },
  );
  if (!verdict.ok) return fail(verdict.error);
  let signup: EventSignup;
  try {
    signup = await prisma.eventSignup.upsert({
      where: { eventId_playerId: { eventId, playerId: player.id } },
      create: { eventId, playerId: player.id, status: verdict.next.status, slotKey: verdict.next.slotKey, source },
      update: { status: verdict.next.status, slotKey: verdict.next.slotKey, source, respondedAt: new Date() },
    });
  } catch (e) {
    // Someone took the slot in the instant between the check and the write:
    // the partial unique index (one player per slot per event) caught it.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return fail("Somebody just took that position. Pick another.");
    throw e;
  }
  const warnings: string[] = [];
  if (opts.refresh) {
    const w = await refreshAnnouncement(eventId);
    if (w) warnings.push(w);
  }
  return { ok: true, warnings, signup };
}

/** Up to three preferred positions, best first. Only for somebody who is signed up and not out. */
export async function setPreferences(eventId: string, playerId: string, prefs: string[]): Promise<R> {
  const signup = await prisma.eventSignup.findUnique({ where: { eventId_playerId: { eventId, playerId } } });
  if (!signup || signup.status === "OUT") return fail("Sign up first, then say where you'd like to play.");
  const parsed = parsePreferences(prefs, POSITIONS);
  if (!parsed.ok) return fail(parsed.error);
  const [pref1, pref2, pref3] = parsed.value as [Position | null, Position | null, Position | null];
  await prisma.eventSignup.update({ where: { id: signup.id }, data: { pref1, pref2, pref3 } });
  return { ok: true, warnings: [] };
}

/**
 * What actually happened, marked by staff once the event has started. Only
 * marked events feed the reliability figure; clearing a mark returns the
 * event to "not evidence" rather than counting as absent.
 */
export async function markAttendance(eventId: string, signupId: string, attendance: Attendance | null, actor: Actor, now = new Date()): Promise<R> {
  const signup = await prisma.eventSignup.findUnique({ where: { id: signupId }, include: { event: { select: { startsAt: true } } } });
  if (!signup || signup.eventId !== eventId) return fail("That sign-up no longer exists.");
  if (signup.event.startsAt > now) return fail("Mark attendance once the event has started.");
  if (attendance && !["PRESENT", "ABSENT", "EXCUSED"].includes(attendance)) return fail("Pick present, absent or excused.");
  await prisma.eventSignup.update({
    where: { id: signupId },
    data: { attendance, attendanceMarkedBy: attendance ? actor.name : null, attendanceMarkedAt: attendance ? now : null },
  });
  return { ok: true, warnings: [] };
}

// --- The Discord announcement ------------------------------------------------ //

const gone = (e: unknown) => e instanceof DiscordError && e.status === 404;

/**
 * Post the event with its RSVP controls, or bring an already-posted one up to
 * date (re-posting it if the message was deleted). Goes to the event's own
 * channel if it has one, else the events channel from the Admin page.
 */
export async function announceEvent(id: string): Promise<R<{ outcome: "posted" | "updated" | "reposted" }>> {
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return fail("That event no longer exists.");
  const channel = event.discordChannelId || (await getChannelConfig()).events;
  if (!channel) return fail("No events channel is set. Choose one on Admin → Discord roles & channels.");
  const payload = (await announcementFor(id))!;
  const save = (m: { id: string; channel_id: string }) => prisma.event.update({ where: { id }, data: { discordChannelId: m.channel_id, discordMessageId: m.id } });
  try {
    if (event.discordChannelId && event.discordMessageId) {
      try {
        await editMessage(event.discordChannelId, event.discordMessageId, payload);
        return { ok: true, warnings: [], outcome: "updated" };
      } catch (e) {
        if (!gone(e)) throw e;
      }
      await save(await sendMessage(event.discordChannelId, payload));
      return { ok: true, warnings: [], outcome: "reposted" };
    }
    await save(await sendMessage(channel, payload));
    return { ok: true, warnings: [], outcome: "posted" };
  } catch (e) {
    return fail(explain(e));
  }
}

/** Re-render the posted announcement after a change on the site. Returns a warning, or null (also null when never posted). */
export async function refreshAnnouncement(id: string): Promise<string | null> {
  const event = await prisma.event.findUnique({ where: { id }, select: { discordChannelId: true, discordMessageId: true } });
  if (!event?.discordChannelId || !event.discordMessageId) return null;
  const payload = await announcementFor(id);
  if (!payload) return null;
  try {
    await editMessage(event.discordChannelId, event.discordMessageId, payload);
    return null;
  } catch (e) {
    return `Saved, but the Discord post wasn't updated: ${explain(e)}`;
  }
}

// --- The event's team sheet -------------------------------------------------- //

export type SheetResult = { ok: true; message: string; warnings: string[] } | { ok: false; errors: string[] };

/** The saved team sheet: slot key -> player id. */
export async function loadSheet(eventId: string): Promise<SlotMap> {
  const rows = await prisma.eventLineup.findMany({ where: { eventId } });
  return Object.fromEntries(rows.map((r) => [r.slotKey, r.playerId]));
}

/**
 * Staff pick who plays each position. Anyone with a file can be picked
 * (contracted players, plus trialists and guests who signed up); one place
 * each, only the event's formation's slots. Publishing posts the sheet where
 * the event was announced and DMs each player their shirt, once.
 */
export async function saveSheet(eventId: string, slots: SlotMap, publish: boolean, actor: Actor): Promise<SheetResult> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return { ok: false, errors: ["That event no longer exists."] };
  if (!event.formation) return { ok: false, errors: ["Give the event a formation before picking a team sheet."] };
  const errors = checkSlotMap(event.formation, slots);
  const ids = Object.values(slots);
  const players = await prisma.player.findMany({ where: { id: { in: ids } }, select: { id: true, discordId: true, displayName: true } });
  if (players.length !== new Set(ids).size) errors.push("Someone on the sheet no longer has a file here. Reload and try again.");
  if (publish && !ids.length) errors.push("Pick at least one player before publishing.");
  if (errors.length) return { ok: false, errors };

  await prisma.$transaction([
    prisma.eventLineup.deleteMany({ where: { eventId } }),
    prisma.eventLineup.createMany({ data: Object.entries(slots).map(([slotKey, playerId]) => ({ eventId, slotKey, playerId })) }),
  ]);
  if (!publish) return { ok: true, message: "Team sheet saved. Players see it once you publish it.", warnings: [] };

  const warnings = await publishSheet(event, slots, players, actor);
  await prisma.event.update({ where: { id: eventId }, data: { lineupPublishedAt: new Date() } });
  return { ok: true, message: "Team sheet published.", warnings };
}

async function publishSheet(event: Event, slots: SlotMap, players: { id: string; discordId: string; displayName: string }[], actor: Actor): Promise<string[]> {
  const warnings: string[] = [];
  const who = new Map(players.map((p) => [p.id, p]));
  const order = Object.keys(eventSlots(event.formation));
  const rows = Object.entries(slots)
    .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
    .map(([key, id]) => ({ key, label: slotLabel(event.formation!, key), discordId: who.get(id)!.discordId, playerId: id, bench: key.startsWith("SUB") }));
  const channel = event.discordChannelId || (await getChannelConfig()).events;
  if (channel) {
    try {
      const m = await sendMessage(channel, {
        embeds: [teamSheetEmbed(toView(event), rows.filter((r) => !r.bench), rows.filter((r) => r.bench), eventUrl(event.id), actor.name)],
        allowed_mentions: { users: rows.map((r) => r.discordId).slice(0, 100) },
      });
      await prisma.event.update({ where: { id: event.id }, data: { lineupMessageId: m.id } });
    } catch (e) {
      warnings.push(`The team sheet wasn't posted in Discord: ${explain(e)}`);
    }
  } else warnings.push("No events channel is set, so the team sheet wasn't posted in Discord.");

  let failed = 0;
  for (const r of rows) {
    // Once per event and player, even if the sheet is published again.
    const first = await claimNotification("shirt", `${event.id}:${r.playerId}`);
    if (!first) continue;
    try {
      await dm(r.discordId, shirtDm(toView(event), r.label, !r.bench, eventUrl(event.id)));
    } catch (e) {
      failed++;
      await prisma.notification.updateMany({ where: { kind: "shirt", key: `${event.id}:${r.playerId}` }, data: { ok: false, detail: explain(e).slice(0, 300) } });
    }
  }
  if (failed) warnings.push(`${failed} player${failed === 1 ? "" : "s"} couldn't be DMed their position (DMs closed).`);
  return warnings;
}

/**
 * Record that a message is going out, returning false when it already has.
 * The unique (kind, key) makes a double run a no-op, and a failed send stays
 * recorded so a closed inbox isn't retried forever.
 */
export async function claimNotification(kind: string, key: string): Promise<boolean> {
  try {
    await prisma.notification.create({ data: { kind, key } });
    return true;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
    throw e;
  }
}
