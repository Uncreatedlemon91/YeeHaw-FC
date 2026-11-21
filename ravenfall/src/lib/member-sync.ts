import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { MAX_SECONDARY_ROLES, RANKS, rankName, ROLES, SQUADS, stripRank } from "@/config/unit";
import { getMember, listMembers, type GuildMember } from "./discord";
import { memberReturned, reconcileDepartures } from "./member-left";
import { permsFromRoles, type Perm } from "./permissions";
import { prisma } from "./prisma";
import { CALLSIGN_RE } from "./recruitment";
import { getRoleConfig, type RoleConfig } from "./role-config";

// Personnel files kept in step with Discord roles. A file is only ever opened
// by enlisting; after that Discord fills gaps (rank, squad, billets, callsign)
// and nothing more: the site is the source of truth for them, and pushes them
// back out to Discord (src/lib/personnel.ts syncUnitRoles).

export type FromRoles = {
  perms: Perm[];
  rank: string | null;
  squad: string | null;
  unitRole: string | null;
  secondaryRoles: string[];
  /** Holds at least one role that makes them a unit member. */
  member: boolean;
};

export function readRoles(m: GuildMember, cfg: RoleConfig): FromRoles {
  const has = (id: string | undefined) => !!id && m.roles.includes(id);
  const perms = permsFromRoles(m.roles, m.user?.id, cfg.perms);
  const rank = [...RANKS].reverse().find((r) => has(cfg.ranks[r.abbr]))?.abbr ?? null;
  const squad = SQUADS.find((s) => has(cfg.squads[s.name]))?.name ?? null;
  const billets = ROLES.filter((r) => has(cfg.billets[r.name]));
  // A leading billet is the primary when there is one: it's what carries
  // authority on the site (squad leadership's view and decisions).
  const ordered = [...billets.filter((r) => r.leads), ...billets.filter((r) => !r.leads)].map((r) => r.name);
  return {
    perms,
    rank,
    squad,
    unitRole: ordered[0] ?? null,
    secondaryRoles: ordered.slice(1, 1 + MAX_SECONDARY_ROLES),
    member: perms.length > 0 || !!rank || !!squad || billets.length > 0 || has(cfg.recruit) || cfg.approval.some(has),
  };
}

/** "Sgt Viper" or "[SGT] Viper" -> "Viper", if what's left is a valid callsign. */
export function callsignFromNick(nick: string | null | undefined): string | null {
  const c = stripRank(nick);
  return CALLSIGN_RE.test(c) ? c : null;
}

export type SyncOutcome = "updated" | "unchanged" | "skipped";

export async function importMember(m: GuildMember, cfg: RoleConfig, retried = false): Promise<SyncOutcome> {
  const u = m.user;
  if (!u || u.bot) return "skipped";
  const read = readRoles(m, cfg);
  const existing = await prisma.user.findUnique({ where: { discordId: u.id } });
  if (!read.member) return existing ? "unchanged" : "skipped";

  // Personnel files are opened by enlisting (an approved application,
  // src/lib/recruitment.ts), never from Discord roles. Someone without a file,
  // or still a candidate, is left alone.
  if (!existing || existing.status === "CANDIDATE") return existing ? "unchanged" : "skipped";

  let callsign = callsignFromNick(m.nick);
  if (callsign) {
    const taken = await prisma.user.findFirst({
      where: { callsign: { equals: callsign, mode: "insensitive" }, NOT: { discordId: u.id } },
    });
    if (taken) callsign = null;
  }

  try {
    // Fill gaps only. Discharged and inactive members are left as they are.
    const data: Prisma.UserUpdateInput = { discordUsername: u.username, avatar: u.avatar ?? null };
    const filled: string[] = [];
    if (!existing.callsign && callsign) {
      data.callsign = callsign;
      filled.push(`callsign ${callsign}`);
    }
    if (!existing.rank && read.rank) {
      data.rank = read.rank;
      data.rankSince = new Date();
      filled.push(rankName(read.rank));
    }
    if (!existing.squad && read.squad) {
      data.squad = read.squad;
      filled.push(read.squad);
    }
    if (!existing.unitRole && read.unitRole) {
      data.unitRole = read.unitRole;
      filled.push(read.unitRole);
      if (!existing.secondaryRoles.length && read.secondaryRoles.length) {
        data.secondaryRoles = read.secondaryRoles;
        filled.push(`secondary ${read.secondaryRoles.join(", ")}`);
      }
    }
    if (filled.length) {
      data.serviceRecords = {
        create: { type: "NOTE", title: "Personnel file updated from Discord roles", description: `Added ${filled.join(" · ")}.` },
      };
    }
    await prisma.user.update({ where: { id: existing.id }, data });
    return filled.length ? "updated" : "unchanged";
  } catch (e) {
    // Signed in (or another event landed) between our read and write, or the
    // callsign was claimed meanwhile: go round once more against fresh data.
    if (!retried && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return importMember(m, cfg, true);
    throw e;
  }
}

export type SyncSummary = Record<SyncOutcome, number> & { errors: string[]; left: number };

/** Every server member, for the Admin page's "Sync profiles" button. */
export async function syncAllMembers(): Promise<SyncSummary> {
  const cfg = await getRoleConfig();
  const summary: SyncSummary = { updated: 0, unchanged: 0, skipped: 0, errors: [], left: 0 };
  const members = await listMembers();
  for (const m of members) {
    try {
      summary[await importMember(m, cfg)]++;
    } catch (e) {
      summary.errors.push(`${m.user?.username ?? "?"}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  // An empty list would mean a broken read, not an empty server: don't flag everyone.
  if (members.length) summary.left = await reconcileDepartures(new Set(members.flatMap((m) => (m.user ? [m.user.id] : []))));
  return summary;
}

/** One member, re-read from Discord: the gateway calls this on role changes. */
export async function syncMemberById(discordId: string): Promise<SyncOutcome> {
  const m = await getMember(discordId);
  if (!m) return "skipped";
  await memberReturned(discordId);
  return importMember(m, await getRoleConfig());
}

// --- Gateway -> site ------------------------------------------------------ //

/**
 * Shared secret for the gateway process's calls to /api/internal/member-sync,
 * derived from NEXTAUTH_SECRET so there's nothing extra to configure.
 * scripts/gateway.mjs derives the same value.
 */
export function internalToken(): string {
  const secret = process.env.NEXTAUTH_SECRET ?? "";
  return secret ? createHmac("sha256", secret).update("ravenfall-gateway").digest("hex") : "";
}

export function checkInternalToken(given: string | null): boolean {
  const want = internalToken();
  if (!want || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}
