"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/action-form";
import { assertPerm } from "@/lib/auth";
import { discord, explain } from "@/lib/discord";
import { env } from "@/lib/env";
import { syncAllMembers } from "@/lib/member-sync";
import { getRoleConfig } from "@/lib/role-config";

// The slash commands the bot offers; keep in step with scripts/register-commands.ts.
const COMMANDS = [
  { name: "fixtures", description: "Upcoming matches and events", type: 1 },
  { name: "squad", description: "Link to the squad page", type: 1 },
];

export async function registerCommands(): Promise<ActionState> {
  await assertPerm("MANAGEMENT");
  if (!env.clientId || !env.guildId) return { error: "Set DISCORD_CLIENT_ID and DISCORD_GUILD_ID first." };
  try {
    await discord(`/applications/${env.clientId}/guilds/${env.guildId}/commands`, { method: "PUT", body: COMMANDS });
    return { ok: "Registered /fixtures and /squad on the server." };
  } catch (e) {
    return { error: explain(e) };
  }
}

export async function syncPlayers(): Promise<ActionState> {
  await assertPerm("MANAGEMENT");
  if (!env.botToken || !env.guildId) return { error: "Set DISCORD_BOT_TOKEN and DISCORD_GUILD_ID first." };
  const cfg = await getRoleConfig();
  const mapped =
    Object.values(cfg.perms).some((v) => v.length) ||
    Object.values(cfg.clubRoles).some(Boolean) ||
    !!cfg.squad ||
    Object.values(cfg.status).some(Boolean);
  if (!mapped) return { error: "Map at least one Discord role first: player records are opened from mapped roles." };
  try {
    const r = await syncAllMembers();
    revalidatePath("/squad");
    return {
      ok: `Done: ${r.created} new player record${r.created === 1 ? "" : "s"}, ${r.updated} updated, ${r.unchanged} already up to date. ${r.skipped} server member${r.skipped === 1 ? "" : "s"} hold no mapped role.`,
      warnings: r.errors.slice(0, 5),
    };
  } catch (e) {
    const msg = explain(e);
    return {
      error: msg.includes("403")
        ? "Discord refused to list members. Turn on Server Members Intent: Developer Portal → your app → Bot → Privileged Gateway Intents."
        : msg,
    };
  }
}
