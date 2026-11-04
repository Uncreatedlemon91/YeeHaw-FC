import { UNIT } from "@/config/unit";
import { dm } from "./discord";
import { env } from "./env";
import { onLeave } from "./personnel";
import { prisma } from "./prisma";

// The S1 Desk's inactivity watch: active members who haven't answered or
// attended anything in a month, not on leave and still on the server.
// Leadership can send a friendly check-in DM, at most once a week each.

export const INACTIVE_DAYS = 30;
export const CHECKIN_COOLDOWN_DAYS = 7;
const DAY = 864e5;

export type Inactive = {
  id: string;
  discordId: string;
  avatar: string | null;
  callsign: string | null;
  discordUsername: string;
  rank: string | null;
  squad: string | null;
  unitRole: string | null;
  lastEvent: Date | null;
  lastLoginAt: Date | null;
  checkInAt: Date | null;
  /** A check-in went out recently enough that another would nag. */
  coolingDown: boolean;
};

export async function inactiveMembers(now = new Date()): Promise<Inactive[]> {
  const cutoff = new Date(now.getTime() - INACTIVE_DAYS * DAY);
  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      leftDiscordAt: null,
      OR: [{ enlistedAt: { lt: cutoff } }, { enlistedAt: null, createdAt: { lt: cutoff } }],
      // Nothing answered or attended for an event in the window, or any upcoming one
      // (a leader's no-show mark isn't the member's doing).
      attendances: { none: { status: { not: "NOSHOW" }, event: { startTime: { gte: cutoff } } } },
    },
    include: {
      attendances: { where: { status: "ATTENDING", event: { startTime: { lt: now } } }, orderBy: { event: { startTime: "desc" } }, take: 1, select: { event: { select: { startTime: true } } } },
    },
  });
  const away = await onLeave(users.map((u) => u.id), now);
  return users
    .filter((u) => !away.has(u.id))
    .map((u) => ({
      id: u.id,
      discordId: u.discordId,
      avatar: u.avatar,
      callsign: u.callsign,
      discordUsername: u.discordUsername,
      rank: u.rank,
      squad: u.squad,
      unitRole: u.unitRole,
      lastEvent: u.attendances[0]?.event.startTime ?? null,
      lastLoginAt: u.lastLoginAt,
      checkInAt: u.checkInAt,
      coolingDown: !!u.checkInAt && now.getTime() - u.checkInAt.getTime() < CHECKIN_COOLDOWN_DAYS * DAY,
    }))
    .sort((a, b) => (a.lastEvent?.getTime() ?? 0) - (b.lastEvent?.getTime() ?? 0));
}

/** The check-in DM. Throws if Discord refuses (DMs closed, left the server). */
export async function sendCheckIn(member: { id: string; discordId: string; callsign: string | null; discordUsername: string }, by: { id: string; name: string }) {
  if (!env.botToken) throw new Error("The bot isn't set up (DISCORD_BOT_TOKEN).");
  await dm(
    member.discordId,
    [
      `Hey ${member.callsign ?? member.discordUsername}, we haven't seen you at a ${UNIT.name} event in a while and wanted to check in. No pressure: if life's busy, a quick leave of absence keeps your slot.`,
      `What's coming up: ${env.siteUrl}/ops · File leave: ${env.siteUrl}/roster/${member.id}?tab=requests`,
      `Just reply here if you'd like to talk. — ${by.name}`,
    ].join("\n\n"),
  );
  await prisma.user.update({
    where: { id: member.id },
    data: { checkInAt: new Date(), serviceRecords: { create: { type: "NOTE", title: "Inactivity check-in sent", description: `By ${by.name}, after ${INACTIVE_DAYS}+ days without an RSVP.`, issuedById: by.id } } },
  });
}
