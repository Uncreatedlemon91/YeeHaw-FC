import type { SquadStatus } from "@prisma/client";
import { addRole, DiscordError, explain, getMember, removeRole } from "./discord";
import { env } from "./env";
import { prisma } from "./prisma";
import { getRoleConfig, managedRoleIds, type RoleConfig } from "./role-config";

// Keeps the Discord roles the site manages in step with the site (port of
// proclubs/role_sync.py). The site is the source of truth for these roles:
//
//   status role   the squad status of the player's live contract (the others go)
//   squad role    anyone under a live contract
//   trialist      an offer outstanding or a prospect on trial or offered, not yet signed
//
// A member should hold exactly the managed roles the site says. syncMember
// adds what's missing and removes what no longer applies, and never touches a
// role outside managedRoleIds() (so it cannot strip a permission role).
// Club titles are not managed here: on the new site they come FROM Discord.

/** What the site knows about a person that decides their roles. */
export type RoleInput = {
  /** ACTIVE contracts in WINDOW or ACTIVE seasons, with that season's start. */
  live: { squadStatus: SquadStatus; seasonStartsAt: Date }[];
  /** An OFFERED contract in a season that hasn't ended. */
  offered: boolean;
  /** A prospect On trial or Offered. */
  trialling: boolean;
};

/** The managed role ids this person should hold. */
export function desiredRoleIds(input: RoleInput, cfg: RoleConfig): string[] {
  const ids: string[] = [];
  if (input.live.length) {
    // During the window a player can hold last season's and next season's
    // contract: the later season's status wins.
    const newest = [...input.live].sort((a, b) => b.seasonStartsAt.getTime() - a.seasonStartsAt.getTime())[0];
    ids.push(cfg.squad, cfg.status[newest.squadStatus]);
  } else if (input.offered || input.trialling) {
    ids.push(cfg.trialist);
  }
  return ids.filter(Boolean);
}

/** (to add, to remove), both limited to the roles the site manages. */
export function roleChanges(current: readonly string[], desired: readonly string[], managed: readonly string[]) {
  const ours = new Set(managed);
  const have = new Set(current);
  const want = new Set(desired);
  return {
    add: [...want].filter((r) => ours.has(r) && !have.has(r)),
    remove: [...have].filter((r) => ours.has(r) && !want.has(r)),
  };
}

export async function roleInputFor(playerId: string): Promise<RoleInput> {
  const [contracts, trial] = await Promise.all([
    prisma.contract.findMany({
      where: { playerId, state: { in: ["ACTIVE", "OFFERED"] }, season: { state: { not: "ENDED" } } },
      select: { state: true, squadStatus: true, season: { select: { state: true, startsAt: true } } },
    }),
    prisma.prospect.findFirst({ where: { playerId, stage: { in: ["TRIAL", "OFFERED"] } }, select: { id: true } }),
  ]);
  return {
    live: contracts
      .filter((c) => c.state === "ACTIVE" && c.season.state !== "DRAFT")
      .map((c) => ({ squadStatus: c.squadStatus, seasonStartsAt: c.season.startsAt })),
    offered: contracts.some((c) => c.state === "OFFERED"),
    trialling: !!trial,
  };
}

export type SyncResult = {
  added: string[];
  removed: string[];
  inGuild: boolean;
  /** Why nothing was attempted (bot not set up, no roles mapped). */
  skipped?: string;
};

/** Bring one person's managed roles in line with the site. Throws DiscordError. */
export async function syncMember(playerId: string): Promise<SyncResult> {
  const cfg = await getRoleConfig();
  const managed = managedRoleIds(cfg);
  if (!env.botToken || !env.guildId) return { added: [], removed: [], inGuild: true, skipped: "The Discord bot isn't configured." };
  if (!managed.length) return { added: [], removed: [], inGuild: true, skipped: "No squad or status role is mapped on the Admin page." };
  const player = await prisma.player.findUnique({ where: { id: playerId }, select: { discordId: true } });
  if (!player || !/^\d+$/.test(player.discordId)) return { added: [], removed: [], inGuild: true };

  const member = await getMember(player.discordId);
  if (!member) return { added: [], removed: [], inGuild: false };
  const { add, remove } = roleChanges(member.roles, desiredRoleIds(await roleInputFor(playerId), cfg), managed);
  for (const r of add) await addRole(player.discordId, r, "YeeHaw FC: contract");
  for (const r of remove) await removeRole(player.discordId, r, "YeeHaw FC: contract");
  return { added: add, removed: remove, inGuild: true };
}

/**
 * Sync each person, after the change that called this has committed. Returns
 * a sentence per problem, never throws: a role problem never undoes the
 * change on the site.
 */
export async function syncQuietly(...playerIds: string[]): Promise<string[]> {
  const problems: string[] = [];
  for (const id of new Set(playerIds.filter(Boolean))) {
    try {
      const r = await syncMember(id);
      if (r.skipped) problems.push(r.skipped);
      else if (!r.inGuild) problems.push("A player isn't in the Discord server, so their roles weren't changed.");
    } catch (e) {
      problems.push(e instanceof DiscordError ? explain(e) : e instanceof Error ? e.message : String(e));
    }
  }
  return [...new Set(problems)];
}
