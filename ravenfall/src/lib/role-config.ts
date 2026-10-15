import { RANKS, ROLES, SQUADS } from "@/config/unit";
import { env } from "./env";
import type { Perm } from "./permissions";
import { prisma } from "./prisma";

// Which Discord roles mean what on the site. Command sets this on the Admin
// page; until it has been saved once, the ROLE_* values in .env are used, so
// an existing deployment keeps working unchanged.

export type RoleConfig = {
  /** Roles granting each site permission. */
  perms: Record<Perm, string[]>;
  /** Given on application, removed on approval. */
  candidate: string;
  /** Given on approval. */
  recruit: string;
  /** Further roles also given on approval (e.g. a general member role). */
  approval: string[];
  /** Unit name -> role ID, for squads, billets and ranks (by abbreviation). */
  squads: Record<string, string>;
  billets: Record<string, string>;
  ranks: Record<string, string>;
};

const KEY = "roles";
const TTL_MS = 30_000;
let cache: { at: number; value: RoleConfig; fromDb: boolean } | null = null;

export function roleConfigFromEnv(): RoleConfig {
  return {
    perms: {
      ADMIN: env.roleIds.ADMIN,
      RECRUITER: env.roleIds.RECRUITER,
      INSTRUCTOR: env.roleIds.INSTRUCTOR,
      OPERATOR: env.roleIds.OPERATOR,
    },
    candidate: env.candidateRoleId,
    recruit: env.recruitRoleId,
    approval: [],
    squads: env.squadRoleIds,
    billets: env.billetRoleIds,
    ranks: {},
  };
}

const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && /^\d+$/.test(x)) : []);
const id = (v: unknown) => (typeof v === "string" && /^\d+$/.test(v) ? v : "");

/** Keep only well-formed IDs, and only names the unit config still has. */
export function cleanRoleConfig(raw: unknown): RoleConfig {
  const r = (raw ?? {}) as Partial<Record<keyof RoleConfig, unknown>>;
  const perms = (r.perms ?? {}) as Partial<Record<Perm, unknown>>;
  const pick = (map: unknown, names: readonly string[]) =>
    Object.fromEntries(
      names.map((n) => [n, id((map as Record<string, unknown> | undefined)?.[n])] as const).filter(([, v]) => v),
    );
  return {
    perms: { ADMIN: ids(perms.ADMIN), RECRUITER: ids(perms.RECRUITER), INSTRUCTOR: ids(perms.INSTRUCTOR), OPERATOR: ids(perms.OPERATOR) },
    candidate: id(r.candidate),
    recruit: id(r.recruit),
    approval: ids(r.approval),
    squads: pick(r.squads, SQUADS.map((s) => s.name)),
    billets: pick(r.billets, ROLES.map((x) => x.name)),
    ranks: pick(r.ranks, RANKS.map((x) => x.abbr)),
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
