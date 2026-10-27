import type { Season, SeasonState } from "@prisma/client";
import { squadAnnouncement } from "./contract-messages";
import { getChannelConfig } from "./channel-config";
import { explain, sendMessage } from "./discord";
import { env } from "./env";
import { prisma } from "./prisma";
import { syncQuietly } from "./role-sync";
import { canTransition, validateSeasonDates, type SeasonDates } from "./season-rules";
import { fmtDate } from "./time";

// Season lifecycle against the database: create / edit, the Draft -> Window
// -> Active -> Ended transitions, ending a season (contracts, roles) and the
// season-start squad announcement. Used by the Admin screens and by the daily
// job (season-job.ts), so either path leaves the same trail.

export type SeasonResult<T = object> = ({ ok: true; warnings: string[] } & T) | { ok: false; error: string; fieldErrors?: Record<string, string> };
const fail = (error: string, fieldErrors?: Record<string, string>) => ({ ok: false as const, error, fieldErrors });

export async function createSeason(name: string, dates: SeasonDates): Promise<SeasonResult<{ season: Season }>> {
  if (!name.trim()) return fail("Name the season.", { name: "Name the season." });
  const bad = validateSeasonDates(dates);
  if (Object.keys(bad).length) return fail("Check the dates.", bad as Record<string, string>);
  const season = await prisma.season.create({ data: { name: name.trim(), ...dates } });
  return { ok: true, warnings: [], season };
}

export async function updateSeason(id: string, name: string, dates: SeasonDates): Promise<SeasonResult> {
  const s = await prisma.season.findUnique({ where: { id } });
  if (!s) return fail("That season no longer exists.");
  if (s.state === "ENDED") return fail("An ended season can't be edited.");
  if (!name.trim()) return fail("Name the season.", { name: "Name the season." });
  const bad = validateSeasonDates(dates);
  if (Object.keys(bad).length) return fail("Check the dates.", bad as Record<string, string>);
  await prisma.season.update({
    where: { id },
    data: {
      name: name.trim(),
      ...dates,
      // A moved end date earns a fresh 7-day reminder.
      endReminderAt: dates.endsAt.getTime() !== s.endsAt.getTime() ? null : s.endReminderAt,
    },
  });
  return { ok: true, warnings: [] };
}

export async function deleteSeason(id: string): Promise<SeasonResult> {
  const s = await prisma.season.findUnique({ where: { id }, include: { _count: { select: { contracts: true } } } });
  if (!s) return fail("That season no longer exists.");
  if (s.state !== "DRAFT" || s._count.contracts) return fail("Only an empty draft season can be deleted.");
  await prisma.season.delete({ where: { id } });
  return { ok: true, warnings: [] };
}

/** Management's channel for reminders; falls back to the roster channel. */
async function managementChannel(): Promise<string> {
  const c = await getChannelConfig();
  return c.management || c.roster;
}

async function say(channelId: string, payload: object): Promise<string | null> {
  if (!channelId) return null;
  try {
    await sendMessage(channelId, payload);
    return null;
  } catch (e) {
    return explain(e);
  }
}

/** Move a season along its lifecycle. Ending and starting do their own work. */
export async function transitionSeason(id: string, to: SeasonState): Promise<SeasonResult> {
  const s = await prisma.season.findUnique({ where: { id } });
  if (!s) return fail("That season no longer exists.");
  if (!canTransition(s.state, to)) return fail(`A ${s.state.toLowerCase()} season can't go to ${to.toLowerCase()}.`);
  const warnings: string[] = [];

  if (to === "WINDOW") {
    const other = await prisma.season.findFirst({ where: { state: "WINDOW", id: { not: id } } });
    if (other) return fail(`${other.name} still has its re-signing window open. Start or close it first.`);
    await prisma.season.update({ where: { id }, data: { state: "WINDOW", windowOpenedAt: new Date() } });
  } else if (to === "DRAFT") {
    const n = await prisma.contract.count({ where: { seasonId: id, state: { in: ["OFFERED", "ACTIVE"] } } });
    if (n) return fail("Offers are already out for this season, so it can't go back to a draft. Withdraw them first.");
    await prisma.season.update({ where: { id }, data: { state: "DRAFT", windowOpenedAt: null } });
  } else if (to === "ACTIVE") {
    // One ACTIVE season at a time: starting this one ends the running one.
    const running = await prisma.season.findFirst({ where: { state: "ACTIVE", id: { not: id } } });
    if (running) {
      const r = await endSeason(running.id);
      if (!r.ok) return r;
      warnings.push(...r.warnings);
    }
    await prisma.season.update({ where: { id }, data: { state: "ACTIVE", startedAt: new Date() } });
    warnings.push(...(await announceSquad(id)));
  } else {
    const r = await endSeason(id);
    if (!r.ok) return r;
    warnings.push(...r.warnings);
  }
  return { ok: true, warnings };
}

/**
 * Season end: ACTIVE contracts become ENDED (anyone carried into the next
 * season holds a contract there, so keeps their roles), offers nobody
 * answered lapse, and squad roles come off everyone left without a contract.
 */
export async function endSeason(id: string): Promise<SeasonResult> {
  const s = await prisma.season.findUnique({ where: { id } });
  if (!s) return fail("That season no longer exists.");
  if (s.state !== "ACTIVE") return fail("Only a running season can be ended.");
  const now = new Date();
  const ending = await prisma.contract.findMany({
    where: { seasonId: id, state: { in: ["ACTIVE", "OFFERED"] } },
    include: { player: { select: { displayName: true } } },
  });
  await prisma.$transaction([
    prisma.contract.updateMany({ where: { seasonId: id, state: "ACTIVE" }, data: { state: "ENDED", endedAt: now } }),
    prisma.contract.updateMany({
      where: { seasonId: id, state: "OFFERED" },
      data: { state: "DECLINED", respondedAt: now, releaseNote: "Lapsed when the season ended" },
    }),
    prisma.rosterMove.createMany({
      data: ending
        .filter((c) => c.state === "ACTIVE")
        .map((c) => ({
          kind: "EXPIRE" as const,
          playerId: c.playerId,
          displayName: c.player.displayName,
          seasonId: id,
          contractId: c.id,
          position: c.position,
          secondaryPosition: c.secondaryPosition,
          squadStatus: c.squadStatus,
          note: `${s.name} ended`,
        })),
    }),
    prisma.season.update({ where: { id }, data: { state: "ENDED", endedAt: now } }),
  ]);
  const warnings = await syncQuietly(...ending.map((c) => c.playerId));
  return { ok: true, warnings };
}

/** Post the season's squad (numbers, positions, armbands) to the roster channel. */
export async function announceSquad(seasonId: string): Promise<string[]> {
  const season = await prisma.season.findUnique({ where: { id: seasonId } });
  if (!season) return [];
  const { roster } = await getChannelConfig();
  if (!roster) return ["No roster channel is set, so the squad wasn't announced."];
  const rows = await prisma.contract.findMany({
    where: { seasonId, state: "ACTIVE" },
    include: { player: { select: { displayName: true } } },
  });
  const err = await say(
    roster,
    squadAnnouncement(
      season.name,
      rows.map((c) => ({ name: c.player.displayName, shirtNumber: c.shirtNumber, squadStatus: c.squadStatus, position: c.position, captaincy: c.captaincy })),
    ),
  );
  if (err) return [`The squad announcement failed: ${err}`];
  await prisma.season.update({ where: { id: seasonId }, data: { announcedAt: new Date() } });
  return [];
}

/** Tell management the re-signing window is open. */
export async function announceWindow(seasonId: string): Promise<string[]> {
  const s = await prisma.season.findUnique({ where: { id: seasonId } });
  const to = await managementChannel();
  if (!s || !to) return [];
  const err = await say(to, {
    content: `The re-signing window for **${s.name}** is open (the season starts ${fmtDate(s.startsAt)}). Send offers: ${env.siteUrl}/admin/seasons/${s.id}/window`,
    allowed_mentions: { parse: [] },
  });
  return err ? [err] : [];
}

/** The 7-day heads-up that a season is about to end. */
export async function remindSeasonEnd(seasonId: string): Promise<string[]> {
  const s = await prisma.season.findUnique({ where: { id: seasonId } });
  const to = await managementChannel();
  if (!s || !to) return [];
  const [active, next] = await Promise.all([
    prisma.contract.count({ where: { seasonId, state: "ACTIVE" } }),
    prisma.season.findFirst({ where: { state: { in: ["DRAFT", "WINDOW"] }, startsAt: { gte: s.startsAt } }, orderBy: { startsAt: "asc" } }),
  ]);
  const nextLine = next
    ? `Next up: ${next.name} (${next.state === "WINDOW" ? "window open" : "still a draft"}): ${env.siteUrl}/admin/seasons/${next.id}/window`
    : `No next season is set up yet: ${env.siteUrl}/admin/seasons`;
  const err = await say(to, {
    content: `**${s.name}** ends on ${fmtDate(s.endsAt)}. ${active} contract${active === 1 ? "" : "s"} will end with it unless the player has re-signed. ${nextLine}`,
    allowed_mentions: { parse: [] },
  });
  return err ? [err] : [];
}
