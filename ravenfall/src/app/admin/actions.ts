"use server";

import type { ActionState } from "@/components/action-form";
import { UNIT } from "@/config/unit";
import { assertPerm } from "@/lib/auth";
import { discord, explain, linkButton, row, sendMessage } from "@/lib/discord";
import { env } from "@/lib/env";

export async function postRecruitmentMessage(): Promise<ActionState> {
  await assertPerm("ADMIN");
  if (!env.welcomeChannelId) return { error: "Set WELCOME_CHANNEL_ID first." };
  try {
    // A link button needs no interaction handling and never expires, so
    // this message can stay pinned in #welcome indefinitely.
    await sendMessage(env.welcomeChannelId, {
      embeds: [
        {
          title: `Enlist with the ${UNIT.name}`,
          description: `${UNIT.description}\n\nHit **Enlist Now** to sign in with Discord and fill out a short application. Our recruiters are notified the moment you submit.`,
          color: 0xd4a017,
          footer: { text: UNIT.org },
        },
      ],
      components: [row(linkButton("Enlist Now", `${env.siteUrl}/apply`), linkButton("About the unit", env.siteUrl))],
    });
    return { ok: "Posted. Pin it in the channel so it stays at the top." };
  } catch (e) {
    return { error: explain(e) };
  }
}

export async function registerCommands(): Promise<ActionState> {
  await assertPerm("ADMIN");
  if (!env.clientId || !env.guildId) return { error: "Set DISCORD_CLIENT_ID and DISCORD_GUILD_ID first." };
  try {
    await discord(`/applications/${env.clientId}/guilds/${env.guildId}/commands`, {
      method: "PUT",
      body: [
        { name: "enlist", description: "Apply to join the unit", type: 1 },
        { name: "ops", description: "Upcoming operations and trainings", type: 1 },
      ],
    });
    return { ok: "Registered /enlist and /ops on the server." };
  } catch (e) {
    return { error: explain(e) };
  }
}
