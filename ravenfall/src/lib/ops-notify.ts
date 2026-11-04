import type { AttendanceStatus, Event, EventType } from "@prisma/client";
import { UNIT } from "@/config/unit";
import { getChannelConfig } from "./channel-config";
import { deleteMessage, DiscordError, editMessage, explain, linkButton, row, sendMessage } from "./discord";
import { env } from "./env";
import { invitedLabel, invitedSquads } from "./event-invites";
import { prisma } from "./prisma";
import { getRoleConfig } from "./role-config";
import { discordTime } from "./time";

// Events on Discord: a sign-up notice in the ops channel. Its only button is
// a link to the event on the site, where members RSVP; no interaction ever
// reaches the bot. The notice keeps a running count of sign-ups, edited
// whenever an RSVP changes and when the event is edited, debriefed or
// deleted. Discord never fails the save. An event for chosen squads pings
// their Discord roles (Admin page role mapping) when it is posted; edits
// never ping again, a repost does.

const TYPE_LABEL: Record<EventType, string> = { OP: "Operation", TRAINING: "Training", BRIEFING: "Briefing" };

type Loaded = Event & { attendances: { status: AttendanceStatus }[] };

/** The Discord roles the post pings: invited squads, plus Recruit and Candidate on an event open to recruits. */
async function squadRoleIds(e: Event): Promise<string[]> {
  const squads = invitedSquads(e);
  if (!squads.length && !e.openToRecruits) return [];
  const cfg = await getRoleConfig();
  const ids = squads.map((s) => cfg.squads[s]);
  if (e.openToRecruits) ids.push(cfg.recruit, cfg.candidate);
  return [...new Set(ids.filter(Boolean))];
}

function message(e: Loaded, state: "open" | "closed" | "cancelled", ping: string[] = []) {
  const n = (s: AttendanceStatus) => e.attendances.filter((a) => a.status === s).length;
  const url = `${env.siteUrl}/ops/${e.id}`;
  const button =
    state === "open"
      ? linkButton("Sign up on the site", url)
      : state === "closed"
        ? linkButton(e.debrief ? "After-action report" : "Details", url)
        : null;
  return {
    // Kept on every edit so the post doesn't lose its mention line; Discord
    // only notifies when the message is first sent.
    content: ping.length && state !== "cancelled" ? ping.map((id) => `<@&${id}>`).join(" ") : "",
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
          { name: "Invited", value: invitedLabel(e), inline: true },
          ...(state === "open" ? [{ name: "Signed up", value: `${n("ATTENDING")} going · ${n("TENTATIVE")} not sure`, inline: false }] : []),
        ],
        footer: { text: `${UNIT.siteName} · ${state === "open" ? "Sign-ups open on the site" : state === "closed" ? "Sign-ups closed" : "Cancelled"}` },
      },
    ],
    components: button ? [row(button)] : [],
    allowed_mentions: { parse: [], roles: ping },
  };
}

const stateOf = (e: Loaded) => (e.startTime < new Date() || e.debrief ? "closed" : "open");

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
  const msg = await sendMessage(channel, message(e, stateOf(e), await squadRoleIds(e)));
  await prisma.event.update({ where: { id }, data: { announceChannelId: channel, announceMessageId: msg.id } });
}

/** Bring the announcement up to date: counts, edits, and closing once the event has started. */
export async function refreshEventPost(id: string) {
  const e = await load(id);
  if (!e?.announceChannelId || !e.announceMessageId || !env.botToken) return;
  await editMessage(e.announceChannelId, e.announceMessageId, message(e, stateOf(e), await squadRoleIds(e)));
}

const gone = (err: unknown) => err instanceof DiscordError && (err.status === 404 || err.status === 403);

export type PostOutcome = "posted" | "updated" | "reposted";

/**
 * The event page's Discord controls. "update" edits the post in place (or
 * posts one if it was never sent or has been deleted); "repost" sends a
 * fresh one to the ops channel, pinging the invited squads again, and
 * removes the old one so only one notice keeps a count.
 */
export async function pushEventPost(id: string, mode: "update" | "repost"): Promise<PostOutcome> {
  const { ops: channel } = await getChannelConfig();
  if (!env.botToken) throw new Error("The bot isn't set up (DISCORD_BOT_TOKEN).");
  const e = await load(id);
  if (!e) throw new Error("That event no longer exists.");
  const had = e.announceChannelId && e.announceMessageId ? { channel: e.announceChannelId, message: e.announceMessageId } : null;

  if (mode === "update" && had) {
    try {
      await editMessage(had.channel, had.message, message(e, stateOf(e), await squadRoleIds(e)));
      return "updated";
    } catch (err) {
      if (!gone(err)) throw err; // deleted on Discord: post a new one below
    }
  }
  if (!channel) throw new Error("No ops channel is set on the Admin page.");
  await announceEvent(id);
  if (had) await deleteMessage(had.channel, had.message).catch((err) => gone(err) || console.error(`[ops] remove old post: ${explain(err)}`));
  return had && mode === "repost" ? "reposted" : "posted";
}

/** Mark the announcement cancelled. Called with the event row before it is deleted. */
export async function cancelEventPost(e: Event) {
  if (!e.announceChannelId || !e.announceMessageId || !env.botToken) return;
  await editMessage(e.announceChannelId, e.announceMessageId, message({ ...e, attendances: [] }, "cancelled", await squadRoleIds(e)));
}

const later = (job: () => Promise<void>) => void job().catch((err) => console.error(`[ops] ${explain(err)}`));
export const refreshEventPostLater = (id: string) => later(() => refreshEventPost(id));
