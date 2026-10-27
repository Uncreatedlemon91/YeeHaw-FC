import type { ClubRole, SquadStatus } from "@prisma/client";
import { env } from "./env";
import type { Perm, PermConfig } from "./permissions";
import { prisma } from "./prisma";

// Which Discord roles mean what on the site. Management sets this on the
// Admin page; until it has been saved once, the ROLE_* values in .env are
// used, so a fresh deployment works and can be configured from the site.
//
// Two jobs: roles that GRANT site permissions (read by permissions.ts), and
// roles the site GIVES to players as their contract changes (the squad role,
// one per squad status, and the trialist role), as proclubs/role_sync.py did.

export type RoleConfig = PermConfig & {
  /** Given to anyone under contract. */
  squad: string;
  /** Given for the contract's squad status; the others are removed. */
  status: Record<SquadStatus, string>;
  /** Given to someone on trial or with an offer out, not yet signed. */
  trialist: string;
};

const CLUB_ROLES: readonly ClubRole[] = ["PRESIDENT", "HEAD_COACH", "COACH"];
const STATUSES: readonly SquadStatus[] = ["STARTER", "ROTATION", "SUBSTITUTE"];
const PERMS: readonly Perm[] = ["MEMBER", "STAFF", "MANAGEMENT"];

const KEY = "roles";
const TTL_MS = 30_000;
let cache: { at: number; value: RoleConfig; fromDb: boolean } | null = null;

export function roleConfigFromEnv(): RoleConfig {
  return {
    perms: { MEMBER: env.roleIds.MEMBER, STAFF: env.roleIds.STAFF, MANAGEMENT: env.roleIds.MANAGEMENT },
    clubRoles: { PRESIDENT: "", HEAD_COACH: "", COACH: "" },
    squad: "",
    status: { STARTER: "", ROTATION: "", SUBSTITUTE: "" },
    trialist: "",
  };
}

const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && /^\d+$/.test(x)) : []);
const id = (v: unknown) => (typeof v === "string" && /^\d+$/.test(v) ? v : "");

/** Keep only well-formed IDs, and only keys the config still knows. */
export function cleanRoleConfig(raw: unknown): RoleConfig {
  const r = (raw ?? {}) as Record<string, unknown>;
  const perms = (r.perms ?? {}) as Record<string, unknown>;
  const clubRoles = (r.clubRoles ?? {}) as Record<string, unknown>;
  const status = (r.status ?? {}) as Record<string, unknown>;
  return {
    perms: Object.fromEntries(PERMS.map((p) => [p, ids(perms[p])])) as Record<Perm, string[]>,
    clubRoles: Object.fromEntries(CLUB_ROLES.map((c) => [c, id(clubRoles[c])])) as Record<ClubRole, string>,
    squad: id(r.squad),
    status: Object.fromEntries(STATUSES.map((s) => [s, id(status[s])])) as Record<SquadStatus, string>,
    trialist: id(r.trialist),
  };
}

async function load() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  cache = { at: Date.now(), value: row ? cleanRoleConfig(row.value) : roleConfigFromEnv(), fromDb: !!row };
  return cache;
}

/** The role mapping in force. Cached briefly: it's read on every sign-in. */
export async function getRoleConfig(): Promise<RoleConfig> {
  return (await load()).value;
}

/** Whether the mapping has been saved on the Admin page (vs. .env fallback). */
export async function roleConfigIsSaved(): Promise<boolean> {
  return (await load()).fromDb;
}

export async function saveRoleConfig(cfg: RoleConfig) {
  const value = cleanRoleConfig(cfg);
  await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
  cache = { at: Date.now(), value, fromDb: true };
}

/** Every role the site may add or remove on a player, so a sync can tell its own from others. */
export function managedRoleIds(cfg: RoleConfig): string[] {
  return [cfg.squad, cfg.status.STARTER, cfg.status.ROTATION, cfg.status.SUBSTITUTE, cfg.trialist].filter(Boolean);
}
