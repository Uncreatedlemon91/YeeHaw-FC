import { UNIT } from "@/config/unit";
import { getChannelConfig } from "./channel-config";
import { explain, linkButton, row, sendMessage } from "./discord";
import { env } from "./env";
import { prisma } from "./prisma";

// Members who leave the Discord server (or are kicked or banned) while they
// still have a file here. The gateway reports each departure as it happens
// (scripts/gateway.mjs, GUILD_MEMBER_REMOVE); the Admin page's "Sync
// profiles" catches any it missed while offline. They're flagged on their
// file and listed on the S1 Desk until Command discharges them or they come
// back. Discharged members are left alone.

export type LeftOutcome = "flagged" | "already" | "ignored";

const STILL_HERE = { not: "DISCHARGED" } as const;

/** One departure, from the gateway: flag the file and tell the personnel channel. */
export async function memberLeft(discordId: string): Promise<LeftOutcome> {
  const u = await prisma.user.findUnique({ where: { discordId } });
  if (!u || u.status === "DISCHARGED") return "ignored";
  if (u.leftDiscordAt) return "already";
  const at = new Date();
  await prisma.user.update({
    where: { id: u.id },
    data: {
      leftDiscordAt: at,
      serviceRecords: { create: { type: "NOTE", title: "Left the Discord server", description: "Flagged on the S1 Desk for Command to review." } },
    },
  });
  void announceDeparture(u).catch((e) => console.error(`[members] departure notice: ${explain(e)}`));
  return "flagged";
}

/** Back on the server: clear the flag. Called whenever the gateway sees them again. */
export async function memberReturned(discordId: string) {
  const u = await prisma.user.findUnique({ where: { discordId }, select: { id: true, leftDiscordAt: true } });
  if (!u?.leftDiscordAt) return false;
  await prisma.user.update({
    where: { id: u.id },
    data: { leftDiscordAt: null, serviceRecords: { create: { type: "NOTE", title: "Rejoined the Discord server" } } },
  });
  return true;
}

/**
 * Reconcile against the full member list (the Admin page's sync): flag files
 * whose member is no longer on the server, clear the flag on those who are.
 * Quietly: no channel posts, so a first run can't flood it. Returns how many
 * were newly flagged.
 */
export async function reconcileDepartures(present: Set<string>): Promise<number> {
  const files = await prisma.user.findMany({ where: { status: STILL_HERE }, select: { id: true, discordId: true, leftDiscordAt: true } });
  const gone = files.filter((u) => !present.has(u.discordId) && !u.leftDiscordAt).map((u) => u.id);
  const back = files.filter((u) => present.has(u.discordId) && u.leftDiscordAt).map((u) => u.id);
  if (gone.length) {
    const at = new Date();
    await prisma.$transaction(
      gone.map((id) =>
        prisma.user.update({
          where: { id },
          data: { leftDiscordAt: at, serviceRecords: { create: { type: "NOTE", title: "Not on the Discord server", description: "Found missing by a member sync." } } },
        }),
      ),
    );
  }
  if (back.length) await prisma.user.updateMany({ where: { id: { in: back } }, data: { leftDiscordAt: null } });
  return gone.length;
}

async function announceDeparture(u: { id: string; discordId: string; callsign: string | null; discordUsername: string; squad: string | null; unitRole: string | null }) {
  const { personnel } = await getChannelConfig();
  if (!personnel || !env.botToken) return;
  const billet = [u.squad, u.unitRole].filter(Boolean).join(" · ");
  await sendMessage(personnel, {
    embeds: [
      {
        title: `Left the Discord server: ${u.callsign ?? u.discordUsername}`,
        url: `${env.siteUrl}/roster/${u.id}`,
        description: `<@${u.discordId}> (**${u.callsign ?? u.discordUsername}**, @${u.discordUsername}) is no longer on the server but still has a personnel file. Discharge them from their file if they've gone for good.`,
        fields: billet ? [{ name: "Billet", value: billet, inline: true }] : [],
        color: 0xb7791f,
        timestamp: new Date().toISOString(),
        footer: { text: `${UNIT.siteName} · Personnel` },
      },
    ],
    components: [row(linkButton("Personnel file", `${env.siteUrl}/roster/${u.id}`))],
    allowed_mentions: { parse: [] },
  });
}
