import { gzipSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as ea from "./ea-client";
import { prisma } from "./prisma";

// A new game title means a new EA club id: the FC 26 club and the FC 27 club
// are different clubs to the API even under the same name, and nothing carries
// over. So a new season of the EA data is three steps (scripts/ea-season.ts,
// port of proclubs/season.py): find the new club's id, erase the old club's
// stats (after archiving them), point EA_CLUB_ID in .env at the new one.
//
// WHAT IT ERASES, AND WHAT IT DOESN'T. Only the Ea* tables (snapshots,
// matches and player lines, member totals, squad moves, the league table).
// The club's own records (seasons, contracts, events and their sign-ups,
// articles, honors, milestones, gamertags) are not the game's and stay.
// Matches vanish from event reports with the rows (the link is cleared).

/** Searched when no platform is given: the crossplay pool first, then last-gen. "nx" is a legacy code. */
export const SEARCH_PLATFORMS = ["common-gen5", "common-gen4"] as const;

export class SeasonError extends Error {}

export type FoundClub = { clubId: string; name: string; platform: string; exact: boolean };

/**
 * Every club EA returns for `name`. EA's search is a substring match over its
 * all-time leaderboard, so lookalikes ("Yeehaw FC 2") come back too; `exact`
 * tells them apart.
 */
export async function findClubs(name: string, platforms: readonly string[] = SEARCH_PLATFORMS): Promise<FoundClub[]> {
  const results: FoundClub[] = [];
  const errors: string[] = [];
  for (const platform of platforms) {
    try {
      for (const c of await ea.searchClub(platform, name)) results.push({ ...c, platform, exact: c.name.trim().toLowerCase() === name.trim().toLowerCase() });
    } catch (e) {
      errors.push(`${platform}: ${e instanceof Error ? e.message : e}`);
    }
  }
  // Every platform failing is an outage, not "no such club".
  if (!results.length && errors.length) throw new SeasonError("couldn't search EA: " + errors.join("; "));
  return results;
}

/**
 * The club to switch to, verified against EA. With a club id it is looked up
 * directly (clubs/info works for a club too new for the leaderboard search);
 * without, the search must give exactly one exact-name match: two clubs
 * called "Yeehaw FC" is a question for a person, not a guess for a script.
 */
export async function resolveClub(name: string, clubId: string | undefined, platform: string | undefined, defaultPlatform: string): Promise<{ clubId: string; name: string; platform: string }> {
  if (clubId) {
    const plat = platform ?? defaultPlatform;
    let info;
    try {
      info = await ea.clubInfo(plat, clubId);
    } catch (e) {
      throw new SeasonError(`couldn't look up club ${clubId} on ${plat}: ${e instanceof Error ? e.message : e}`);
    }
    if (!info) throw new SeasonError(`EA has no club ${clubId} on ${plat}.`);
    return { clubId, name: String(info.name ?? ""), platform: plat };
  }
  const exact = (await findClubs(name, platform ? [platform] : SEARCH_PLATFORMS)).filter((c) => c.exact);
  if (exact.length === 1) return exact[0];
  if (!exact.length)
    throw new SeasonError(
      `no club named exactly '${name}' on EA. A club created in the last few days may not be in EA's search yet (it searches a leaderboard that lags). Find the id another way and pass --club-id.`,
    );
  throw new SeasonError(`${exact.length} clubs are named exactly '${name}': ${exact.map((c) => `${c.clubId} (${c.platform})`).join(", ")}. Pick yours with --club-id.`);
}

/**
 * KEY=value lines of a .env file, replacing each key's first live line or
 * appending it. Comments, secrets and blank lines are kept exactly.
 */
export function setEnvValues(text: string, values: Record<string, string>): string {
  const pending = new Map(Object.entries(values));
  const lines = text.split("\n").map((line) => {
    const t = line.trimStart();
    const eq = t.indexOf("=");
    const key = eq > 0 && !t.startsWith("#") ? t.slice(0, eq).trim() : null;
    if (key && pending.has(key)) {
      const v = pending.get(key)!;
      pending.delete(key);
      return `${key}=${/[\s#]/.test(v) ? JSON.stringify(v) : v}`;
    }
    return line;
  });
  if (pending.size) {
    if (lines.length && lines[lines.length - 1] === "") lines.pop();
    for (const [k, v] of pending) lines.push(`${k}=${/[\s#]/.test(v) ? JSON.stringify(v) : v}`);
    lines.push("");
  }
  return lines.join("\n");
}

const backupDir = () => process.env.BACKUP_DIR || (process.env.NODE_ENV === "production" ? "/opt/yeehaw/backups" : "./backups");

/** Writes every Ea* row to a gzipped JSON file in the backups directory. That data can't be re-fetched: EA evicts old matches from its own window. */
export async function archiveEaData(label: string): Promise<string> {
  const [snapshots, matches, leagueClubs, memberTotals, squadMembers, squadMoves] = await Promise.all([
    prisma.eaClubSnapshot.findMany(),
    prisma.eaMatch.findMany({ include: { players: true } }),
    prisma.eaLeagueClub.findMany(),
    prisma.eaMemberTotal.findMany(),
    prisma.eaSquadMember.findMany(),
    prisma.eaSquadMove.findMany(),
  ]);
  const dir = path.resolve(backupDir());
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
  const file = path.join(dir, `ea-data${label ? `-${label}` : ""}-${stamp}.json.gz`);
  await writeFile(file, gzipSync(JSON.stringify({ snapshots, matches, leagueClubs, memberTotals, squadMembers, squadMoves })));
  return file;
}

/** Erase the Ea* tables (match lines go with their matches). */
export async function eraseEaData(): Promise<void> {
  await prisma.$transaction([
    prisma.eaMatch.deleteMany(),
    prisma.eaClubSnapshot.deleteMany(),
    prisma.eaLeagueClub.deleteMany(),
    prisma.eaMemberTotal.deleteMany(),
    prisma.eaSquadMember.deleteMany(),
    prisma.eaSquadMove.deleteMany(),
  ]);
}
