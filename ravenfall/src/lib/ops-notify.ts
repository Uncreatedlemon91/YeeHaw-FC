import type { AttendanceStatus, Event, EventType } from "@prisma/client";
import { UNIT } from "@/config/unit";
import { getChannelConfig } from "./channel-config";
import { ButtonStyle, editMessage, explain, linkButton, row, sendMessage } from "./discord";
import { env } from "./env";
import { prisma } from "./prisma";
import { discordTime } from "./time";

// Events on Discord: the announcement in the ops channel carries Yes / Not
// sure / No buttons (handled in the interactions route, custom_id
// "rsvp:<status>:<eventId>") and a running count of who answered what. It is
// edited whenever an RSVP changes, on either side, and when the event is
// edited, debriefed or deleted. Discord never fails the save.

const TYPE_LABEL: Record<EventType, string> = { OP: "Operation", TRAINING: "Training", BRIEFING: "Briefing" };
/** Names listed per answer before it becomes "and N more". */
const NAMES_SHOWN = 25;

type Attendee = { status: AttendanceStatus; user: { callsign: string | null; discordUsername: string } };

function names(list: Attendee[]) {
  if (!list.length) return "—";
  const shown = list.slice(0, NAMES_SHOWN).map((a) => a.user.callsign ?? a.user.discordUsername);
  return (shown.join(", ") + (list.length > shown.length ? ` and ${list.length - shown.length} more` : "")).slice(0, 1024);
}

function message(e: Event & { attendances: Attendee[] }, state: "open" | "closed" | "cancelled") {
  const by = (s: AttendanceStatus) => e.attendances.filter((a) => a.status === s);
  const counts =
    state === "open"
      ? [
          { name: `✅ Going (${by("ATTENDING").length})`, value: names(by("ATTENDING")), inline: false },
          { name: `❔ Not sure (${by("TENTATIVE").length})`, value: names(by("TENTATIVE")), inline: false },
          { name: `❌ Can't make it (${by("ABSENT").length})`, value: names(by("ABSENT")), inline: false },
        ]
      : [];
  const link = linkButton(state === "closed" && e.debrief ? "After-action report" : "Details", `${env.siteUrl}/ops/${e.id}`);
  return {
    embeds: [
      {
        title: `${state === "cancelled" ? "Cancelled: " : ""}${TYPE_LABEL[e.type]}: ${e.title}`,
        url: `${env.siteUrl}/ops/${e.id}`,
        description: state === "cancelled" ? "This event has been called off." : e.description.slice(0, 600) || undefined,
        color: state === "cancelled" ? 0x555555 : e.type === "OP" ? 0x9b2c2c : 0x4f7a3a,
        fields: [
          { name: "When", value: `${discordTime(e.startTime)} (${discordTime(e.startTime, "R")})`, inline: false },
          ...(e.location ? [{ name: "Where", value: e.location, inline: true }] : []),
          ...(e.mandatory ? [{ name: "Attendance", value: "**Mandatory**", inline: true }] : []),
          ...counts,
        ],
        footer: { text: `${UNIT.siteName} · ${state === "open" ? "RSVP below or on the site" : state === "closed" ? "RSVPs closed" : "Cancelled"}` },
      },
    ],
    components:
      state === "open"
        ? [
            row(
              { type: 2, style: ButtonStyle.Success, label: "Yes", custom_id: `rsvp:ATTENDING:${e.id}` },
              { type: 2, style: ButtonStyle.Secondary, label: "Not sure", custom_id: `rsvp:TENTATIVE:${e.id}` },
              { type: 2, style: ButtonStyle.Danger, label: "No", custom_id: `rsvp:ABSENT:${e.id}` },
              link,
            ),
          ]
        : state === "closed"
          ? [row(link)]
          : [],
    allowed_mentions: { parse: [] },
  };
}

const load = (id: string) =>
  prisma.event.findUnique({
    where: { id },
    include: { attendances: { include: { user: { select: { callsign: true, discordUsername: true } } }, orderBy: { updatedAt: "asc" } } },
  });

/** Post the event to the ops channel and remember the message, so RSVPs can update it. */
export async function announceEvent(id: string) {
  const { ops: channel } = await getChannelConfig();
  if (!channel || !env.botToken) return;
  const e = await load(id);
  if (!e) return;
  const msg = await sendMessage(channel, message(e, e.startTime < new Date() ? "closed" : "open"));
  await prisma.event.update({ where: { id }, data: { announceChannelId: channel, announceMessageId: msg.id } });
}

/** Bring the announcement up to date: counts, edits, and closing once the event has started. */
export async function refreshEventPost(id: string) {
  const e = await load(id);
  if (!e?.announceChannelId || !e.announceMessageId || !env.botToken) return;
  await editMessage(e.announceChannelId, e.announceMessageId, message(e, e.startTime < new Date() || e.debrief ? "closed" : "open"));
}

/** Mark the announcement cancelled. Called with the event row before it is deleted. */
export async function cancelEventPost(e: Event) {
  if (!e.announceChannelId || !e.announceMessageId || !env.botToken) return;
  await editMessage(e.announceChannelId, e.announceMessageId, message({ ...e, attendances: [] }, "cancelled"));
}

const later = (job: () => Promise<void>) => void job().catch((err) => console.error(`[ops] ${explain(err)}`));
export const refreshEventPostLater = (id: string) => later(() => refreshEventPost(id));
