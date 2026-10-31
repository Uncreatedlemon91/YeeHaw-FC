import type { User } from "@prisma/client";
import { RANKS, rankName, UNIT } from "@/config/unit";
import { getChannelConfig } from "./channel-config";
import { explain, linkButton, row, sendMessage } from "./discord";
import { env } from "./env";

// Notices in the promotions and billet-assignment channels. Like the awards
// channel, they go out after the save and never fail it: callers use the
// *Later helpers, which log instead of throwing.

type Member = Pick<User, "id" | "discordId" | "callsign" | "discordUsername">;

const who = (m: Member) => `<@${m.discordId}> (**${m.callsign ?? m.discordUsername}**)`;
const fileButton = (m: Member) => row(linkButton("Personnel file", `${env.siteUrl}/roster/${m.id}`));
const later = (label: string, job: () => Promise<void>) => void job().catch((e) => console.error(`[${label}] ${explain(e)}`));

export async function announcePromotion(m: Member, from: string | null, to: string, by: string) {
  const { promotions } = await getChannelConfig();
  if (!promotions || !env.botToken) return;
  const rank = RANKS.find((r) => r.abbr === to);
  await sendMessage(promotions, {
    embeds: [
      {
        title: `Promoted to ${rankName(to)}`,
        url: `${env.siteUrl}/roster/${m.id}?tab=career`,
        description: `${who(m)} has been promoted to **${rankName(to)}**${rank ? ` (${rank.grade})` : ""}.`,
        fields: [
          ...(from ? [{ name: "From", value: rankName(from), inline: true }] : []),
          { name: "Approved by", value: by, inline: true },
        ],
        color: 0xd4a017,
        timestamp: new Date().toISOString(),
        footer: { text: `${UNIT.siteName} · Promotions` },
      },
    ],
    components: [fileButton(m)],
    allowed_mentions: { parse: [] },
  });
}

export async function announceAssignment(
  m: Member,
  next: { squad: string; role: string; secondary?: string[] },
  prev: { squad: string | null; role: string | null },
  by: string,
) {
  const { assignments } = await getChannelConfig();
  if (!assignments || !env.botToken) return;
  const was = [prev.squad, prev.role].filter(Boolean).join(" · ");
  await sendMessage(assignments, {
    embeds: [
      {
        title: `Billet assignment: ${next.squad} · ${next.role}`,
        url: `${env.siteUrl}/roster`,
        description: `${who(m)} is assigned to **${next.squad}** as **${next.role}**.`,
        fields: [
          ...(was ? [{ name: "Previously", value: was, inline: true }] : []),
          ...(next.secondary?.length ? [{ name: "Secondary", value: next.secondary.join(", "), inline: true }] : []),
          { name: "Approved by", value: by, inline: true },
        ],
        color: 0x4f7a3a,
        timestamp: new Date().toISOString(),
        footer: { text: `${UNIT.siteName} · Billet assignments` },
      },
    ],
    components: [fileButton(m)],
    allowed_mentions: { parse: [] },
  });
}

export const announcePromotionLater = (...a: Parameters<typeof announcePromotion>) => later("promotions", () => announcePromotion(...a));
export const announceAssignmentLater = (...a: Parameters<typeof announceAssignment>) => later("assignments", () => announceAssignment(...a));
