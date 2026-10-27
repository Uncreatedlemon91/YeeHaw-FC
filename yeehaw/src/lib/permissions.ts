import type { ClubRole } from "@prisma/client";
import { env } from "./env";

// Who can do what, from proclubs/roles.py. Four access levels, lowest first:
//
//   guest       not signed in, or signed in but not in the club's server.
//               Sees the public pages.
//   MEMBER      in the server with a member role. Also Training and
//               Availability, and the fuller view of the squad.
//   STAFF       any club-staff role. Runs matchday: lineup, tactics, set
//               pieces, recruitment, events, news.
//   MANAGEMENT  Club President or Head Coach. Also runs the squad (seasons,
//               contracts, offers, releases) and the Admin page.
//
// MANAGEMENT implies STAFF implies MEMBER. Which Discord role means which is
// set on the Admin page (src/lib/role-config.ts), never stored per person, so
// a role change in Discord takes effect at the next refresh.
export type Perm = "MEMBER" | "STAFF" | "MANAGEMENT";

export const PERMS: readonly Perm[] = ["MEMBER", "STAFF", "MANAGEMENT"];

export const PERM_LABELS: Record<Perm, string> = {
  MEMBER: "Member",
  STAFF: "Staff",
  MANAGEMENT: "Management",
};

/** The slice of the role mapping that decides permissions. */
export type PermConfig = {
  /** Roles granting each permission. */
  perms: Record<Perm, string[]>;
  /** One role per club title. President and Head Coach count as management, Coach as staff. */
  clubRoles: Record<ClubRole, string>;
};

const TITLE_PERM: Record<ClubRole, Perm> = { PRESIDENT: "MANAGEMENT", HEAD_COACH: "MANAGEMENT", COACH: "STAFF" };
// Most senior first.
const TITLES: readonly ClubRole[] = ["PRESIDENT", "HEAD_COACH", "COACH"];

/** The most senior club title the roles carry, or null. */
export function clubRoleFromRoles(roleIds: readonly string[], cfg: PermConfig): ClubRole | null {
  return TITLES.find((t) => cfg.clubRoles[t] && roleIds.includes(cfg.clubRoles[t])) ?? null;
}

/**
 * The permissions a Discord member holds. `inGuild` false means not in the
 * server at all: no permissions, whatever the roles say. When no member role
 * is mapped yet, being in the server is enough for MEMBER (how the site
 * worked before roles were mapped), so a fresh install isn't locked out.
 */
export function permsFromRoles(
  roleIds: readonly string[],
  discordId: string | undefined,
  cfg: PermConfig,
  opts: { inGuild?: boolean; adminIds?: readonly string[] } = {},
): Perm[] {
  const adminIds = opts.adminIds ?? env.adminUserIds;
  if (discordId && adminIds.includes(discordId)) return ["MANAGEMENT", "STAFF", "MEMBER"];
  if (opts.inGuild === false) return [];
  const has = (p: Perm) => cfg.perms[p].some((id) => roleIds.includes(id));
  const title = clubRoleFromRoles(roleIds, cfg);
  const titlePerm = title ? TITLE_PERM[title] : null;
  if (has("MANAGEMENT") || titlePerm === "MANAGEMENT") return ["MANAGEMENT", "STAFF", "MEMBER"];
  if (has("STAFF") || titlePerm === "STAFF") return ["STAFF", "MEMBER"];
  if (has("MEMBER") || cfg.perms.MEMBER.length === 0) return ["MEMBER"];
  return [];
}

export function hasPerm(perms: readonly Perm[] | undefined, perm: Perm): boolean {
  return !!perms && (perms.includes("MANAGEMENT") || perms.includes(perm));
}

export function topLabel(perms: readonly Perm[]): string {
  for (const p of ["MANAGEMENT", "STAFF", "MEMBER"] as const) {
    if (perms.includes(p)) return PERM_LABELS[p];
  }
  return "Guest";
}
