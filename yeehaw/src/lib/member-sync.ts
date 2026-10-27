import { createHmac, timingSafeEqual } from "node:crypto";
import type { ClubRole } from "@prisma/client";
import { getMember, listMembers, type GuildMember } from "./discord";
import { clubRoleFromRoles } from "./permissions";
import { ensurePlayer } from "./players";
import { prisma } from "./prisma";
import { getRoleConfig, managedRoleIds, type RoleConfig } from "./role-config";

// Player records kept in step with Discord. Anyone holding a mapped role (a
// permission, a club title, or a squad / status / trialist role) gets a
// record without signing in, and the gateway (scripts/gateway.mjs) refreshes
// it when roles change. Discord only reports who somebody is and what club
// title they hold; contracts, numbers and positions are the site's.

export type SyncOutcome = "created" | "updated" | "unchanged" | "skipped";

export function displayNameOf(m: GuildMember): string {
  return m.nick || m.user?.global_name || m.user?.username || "Unknown";
}

/** Whether the roles include any the site has a meaning for. */
export function holdsMappedRole(roleIds: readonly string[], cfg: RoleConfig): boolean {
  const mapped = [
    ...cfg.perms.MEMBER,
    ...cfg.perms.STAFF,
    ...cfg.perms.MANAGEMENT,
    ...Object.values(cfg.clubRoles),
    ...managedRoleIds(cfg),
  ].filter(Boolean);
  return mapped.some((id) => roleIds.includes(id));
}

export async function importMember(m: GuildMember, cfg: RoleConfig): Promise<SyncOutcome> {
  const u = m.user;
  if (!u || u.bot) return "skipped";
  const existing = await prisma.player.findUnique({ where: { discordId: u.id } });
  if (!existing && !holdsMappedRole(m.roles, cfg)) return "skipped";

  const clubRole: ClubRole | null = clubRoleFromRoles(m.roles, cfg);
  const name = displayNameOf(m);
  const unchanged =
    existing &&
    existing.discordUsername === u.username &&
    existing.displayName === name &&
    existing.avatar === (u.avatar ?? null) &&
    existing.clubRole === clubRole;
  if (unchanged) return "unchanged";

  await ensurePlayer(
    { discordId: u.id, username: u.username, displayName: name, avatar: u.avatar },
    existing?.clubRole === clubRole ? {} : { clubRole, clubRoleSince: clubRole ? new Date() : null },
  );
  return existing ? "updated" : "created";
}

export type SyncSummary = Record<SyncOutcome, number> & { errors: string[] };

/** Every server member, for the Admin page's "Sync players from Discord" button. */
export async function syncAllMembers(): Promise<SyncSummary> {
  const cfg = await getRoleConfig();
  const summary: SyncSummary = { created: 0, updated: 0, unchanged: 0, skipped: 0, errors: [] };
  for (const m of await listMembers()) {
    try {
      summary[await importMember(m, cfg)]++;
    } catch (e) {
      summary.errors.push(`${m.user?.username ?? "?"}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return summary;
}

/** One member, re-read from Discord: the gateway calls this on role changes. */
export async function syncMemberById(discordId: string): Promise<SyncOutcome> {
  const m = await getMember(discordId);
  return m ? importMember(m, await getRoleConfig()) : "skipped";
}

// --- Gateway -> site ------------------------------------------------------ //

/**
 * Shared secret for the gateway process's calls to /api/internal/*, derived
 * from NEXTAUTH_SECRET so there's nothing extra to configure.
 * scripts/gateway.mjs derives the same value.
 */
export function internalToken(): string {
  const secret = process.env.NEXTAUTH_SECRET ?? "";
  return secret ? createHmac("sha256", secret).update("yeehaw-gateway").digest("hex") : "";
}

export function checkInternalToken(given: string | null): boolean {
  const want = internalToken();
  if (!want || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}
