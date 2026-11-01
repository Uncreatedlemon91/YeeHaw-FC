import type { AttendanceStatus, Event, EventType } from "@prisma/client";
import { UNIT } from "@/config/unit";
import { getChannelConfig } from "./channel-config";
import { editMessage, explain, linkButton, row, sendMessage } from "./discord";
import { env } from "./env";
import { prisma } from "./prisma";
import { discordTime } from "./time";

// Events on Discord: a sign-up notice in the ops channel. Its only button is
// a link to the event on the site, where members RSVP; no interaction ever
// reaches the bot. The notice keeps a running count of sign-ups, edited
// whenever an RSVP changes and when the event is edited, debriefed or
// deleted. Discord never fails the save.

const TYPE_LABEL: Record<EventType, string> = { OP: "Operation", TRAINING: "Training", BRIEFING: "Briefing" };

function message(e: Event & { attendances: { status: AttendanceStatus }[] }, state: "open" | "closed" | "cancelled") {
  const n = (s: AttendanceStatus) => e.attendances.filter((a) => a.status === s).length;
  const url = `${env.siteUrl}/ops/${e.id}`;
  const button =
    state === "open"
      ? linkButton("Sign up on the site", url)
      : state === "closed"
        ? linkButton(e.debrief ? "After-action report" : "Details", url)
        : null;
  return {
    embeds: [
      {
        title: `${state === "cancelled" ? "Cancelled: " : ""}${TYPE_LABEL[e.type]}: ${e.title}`,
        url,
        description:
          state === "cancelled"
            ? "This event has been called off."
            : [e.description.slice(0, 600), state === "open" && `**[Sign up on the site](${url})** to let leadership know if you'll be there.`]
                .filter(Boolean)
                .join("\n\n"),
        color: state === "cancelled" ? 0x555555 : e.type === "OP" ? 0x9b2c2c : 0x4f7a3a,
        fields: [
          { name: "When", value: `${discordTime(e.startTime)} (${discordTime(e.startTime, "R")})`, inline: false },
          ...(e.location ? [{ name: "Where", value: e.location, inline: true }] : []),
          ...(e.mandatory ? [{ name: "Attendance", value: "**Mandatory**", inline: true }] : []),
          ...(state === "open" ? [{ name: "Signed up", value: `${n("ATTENDING")} going · ${n("TENTATIVE")} not sure`, inline: false }] : []),
        ],
        footer: { text: `${UNIT.siteName} · ${state === "open" ? "Sign-ups open on the site" : state === "closed" ? "Sign-ups closed" : "Cancelled"}` },
      },
    ],
    components: button ? [row(button)] : [],
    allowed_mentions: { parse: [] },
  };
}

const load = (id: string) =>
  prisma.event.findUnique({
    where: { id },
    include: { attendances: { select: { status: true } } },
  });

/** Post the sign-up notice to the ops channel and remember the message, so its count can follow. */
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
