"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/action-form";
import { assertPerm } from "@/lib/auth";
import { CHANNEL_KEYS, saveChannelConfig, type ChannelConfig } from "@/lib/channel-config";
import { env } from "@/lib/env";
import { PERMS, type Perm } from "@/lib/permissions";
import { saveRoleConfig, type RoleConfig } from "@/lib/role-config";

// Field names: perm:MEMBER (repeatable), club:PRESIDENT, squad,
// status:STARTER, trialist. See role-mapping-form.tsx.
export async function saveRoleMapping(_: ActionState, data: FormData): Promise<ActionState> {
  await assertPerm("MANAGEMENT");
  const one = (k: string) => String(data.get(k) ?? "").trim();
  const perms = Object.fromEntries(
    PERMS.map((p) => [p, [...new Set(data.getAll(`perm:${p}`).map(String).filter(Boolean))]]),
  ) as Record<Perm, string[]>;
  const cfg: RoleConfig = {
    perms,
    clubRoles: { PRESIDENT: one("club:PRESIDENT"), HEAD_COACH: one("club:HEAD_COACH"), COACH: one("club:COACH") },
    squad: one("squad"),
    status: { STARTER: one("status:STARTER"), ROTATION: one("status:ROTATION"), SUBSTITUTE: one("status:SUBSTITUTE") },
    trialist: one("trialist"),
  };
  await saveRoleConfig(cfg);
  revalidatePath("/admin/discord");
  const grantsManagement = cfg.perms.MANAGEMENT.length || cfg.clubRoles.PRESIDENT || cfg.clubRoles.HEAD_COACH;
  const warnings = grantsManagement || env.adminUserIds.length
    ? []
    : ["No role grants Management and ADMIN_USER_IDS is empty, so nobody can reach the Admin pages after their next role refresh."];
  return { ok: "Saved. Permissions follow within 5 minutes, or at each person's next sign-in.", warnings };
}

export async function saveChannels(_: ActionState, data: FormData): Promise<ActionState> {
  await assertPerm("MANAGEMENT");
  const cfg = Object.fromEntries(CHANNEL_KEYS.map((k) => [k, String(data.get(k) ?? "").trim()])) as ChannelConfig;
  await saveChannelConfig(cfg);
  revalidatePath("/admin/discord");
  return { ok: "Saved. New posts go to these channels; posts already made stay where they are." };
}
