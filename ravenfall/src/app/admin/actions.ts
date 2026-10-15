"use server";

import type { ActionState } from "@/components/action-form";
import { UNIT } from "@/config/unit";
import { assertPerm } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { RANKS, ROLES, SQUADS } from "@/config/unit";
import { discord, explain, linkButton, row, sendMessage } from "@/lib/discord";
import { env } from "@/lib/env";
import { syncAllMembers } from "@/lib/member-sync";
import { PERM_LABELS, type Perm } from "@/lib/permissions";
import { CHANNEL_KEYS, getChannelConfig, saveChannelConfig, type ChannelConfig } from "@/lib/channel-config";
import { getRoleConfig, saveRoleConfig, type RoleConfig } from "@/lib/role-config";

export async function postRecruitmentMessage(): Promise<ActionState> {
  await assertPerm("ADMIN");
  const { welcome } = await getChannelConfig();
  if (!welcome) return { error: "Pick a welcome channel under Discord channels first." };
  try {
    // A link button needs no interaction handling and never expires, so
    // this message can stay pinned in #welcome indefinitely.
    await sendMessage(welcome, {
      embeds: [
        {
          title: `Enlist with ${UNIT.name}`,
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

// Field names: perm:ADMIN (repeatable), candidate, recruit, approval
// (repeatable), squad:<name>,
// billet:<name>, rank:<abbr>. See role-mapping-form.tsx.
export async function saveRoleMapping(_: ActionState, data: FormData): Promise<ActionState> {
  await assertPerm("ADMIN");
  const one = (k: string) => String(data.get(k) ?? "").trim();
  const map = (prefix: string, names: readonly string[]) =>
    Object.fromEntries(names.map((n) => [n, one(`${prefix}:${n}`)]).filter(([, v]) => v));
  const perms = Object.fromEntries(
    (Object.keys(PERM_LABELS) as Perm[]).map((p) => [p, [...new Set(data.getAll(`perm:${p}`).map(String).filter(Boolean))]]),
  ) as Record<Perm, string[]>;
  const cfg: RoleConfig = {
    perms,
    candidate: one("candidate"),
    recruit: one("recruit"),
    approval: [...new Set(data.getAll("approval").map(String).filter(Boolean))],
    squads: map("squad", SQUADS.map((s) => s.name)),
    billets: map("billet", ROLES.map((r) => r.name)),
    ranks: map("rank", RANKS.map((r) => r.abbr)),
  };
  await saveRoleConfig(cfg);
  revalidatePath("/admin");
  const warnings = cfg.perms.ADMIN.length || env.adminUserIds.length
    ? []
    : ["No role grants Command Staff and ADMIN_USER_IDS is empty, so nobody can reach this page after their next role refresh."];
  return { ok: "Saved. Permissions follow within 5 minutes, or at each member's next sign-in.", warnings };
}

export async function syncProfiles(): Promise<ActionState> {
  await assertPerm("ADMIN");
  if (!env.botToken || !env.guildId) return { error: "Set DISCORD_BOT_TOKEN and DISCORD_GUILD_ID first." };
  const cfg = await getRoleConfig();
  if (!Object.values(cfg.perms).some((v) => v.length) && !cfg.recruit && !cfg.approval.length && ![cfg.ranks, cfg.squads, cfg.billets].some((m) => Object.keys(m).length))
    return { error: "Map at least one Discord role above first: profiles are generated from mapped roles." };
  try {
    const r = await syncAllMembers();
    revalidatePath("/roster");
    return {
      ok: `Done: ${r.created} new personnel file${r.created === 1 ? "" : "s"}, ${r.updated} filled in, ${r.unchanged} already up to date. ${r.skipped} server member${r.skipped === 1 ? "" : "s"} hold no mapped role.`,
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

export async function saveChannels(_: ActionState, data: FormData): Promise<ActionState> {
  await assertPerm("ADMIN");
  const cfg = Object.fromEntries(CHANNEL_KEYS.map((k) => [k, String(data.get(k) ?? "").trim()])) as ChannelConfig;
  await saveChannelConfig(cfg);
  revalidatePath("/admin");
  return { ok: "Saved. New posts go to these channels; posts already made stay where they are." };
}
