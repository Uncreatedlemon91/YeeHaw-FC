import { getChannelConfig } from "./channel-config";
import { explain, sendMessage } from "./discord";
import { env } from "./env";
import { choosePotm, metricsByPlayer, milestonesEmbed, motmResult, newMilestones, potmEmbed, previousMonth, winsFrom, type VoteResult } from "./recognition-rules";
import { monthKey, monthRange } from "./time";
import { monthLabel } from "./service-record";
import { prisma } from "./prisma";

// Milestones and Player of the Month, against the database. Port of
// proclubs/recognition.py plus the recognition steps of notify_poll.py. Run
// from the EA poll (scripts/ea-poll.ts), after the matches are recorded.

type Db = typeof prisma;

// --- Man of the Match results -------------------------------------------------- //

/** The vote result of each event in [from, to) that has votes. */
export async function motmResults(from?: Date, to?: Date, db: Db = prisma): Promise<{ eventId: string; result: VoteResult }[]> {
  const votes = await db.motmVote.findMany({
    where: { event: { startsAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } },
    select: { eventId: true, nomineeId: true },
  });
  const byEvent = new Map<string, string[]>();
  for (const v of votes) byEvent.set(v.eventId, [...(byEvent.get(v.eventId) ?? []), v.nomineeId]);
  return [...byEvent].map(([eventId, nominees]) => ({ eventId, result: motmResult(nominees) }));
}

/** Matches each player won, over CLOSED votes in the period (ties count for everyone level). */
export async function motmWins(from?: Date, to?: Date, now = new Date(), db: Db = prisma): Promise<Map<string, number>> {
  const results = await motmResults(from, to, db);
  if (!results.length) return new Map();
  const events = await db.event.findMany({
    where: { id: { in: results.map((r) => r.eventId) }, voteOpenedAt: { not: null } },
    select: { id: true, voteClosesAt: true, reviewPublishedAt: true },
  });
  const closed = new Set(events.filter((e) => e.reviewPublishedAt || (e.voteClosesAt && now >= e.voteClosesAt)).map((e) => e.id));
  return winsFrom(results.filter((r) => closed.has(r.eventId)).map((r) => r.result));
}

// --- Milestones ----------------------------------------------------------------- //

const MARKER = { kind: "milestones", key: "initialised" };

/**
 * Records every milestone reached and not yet recorded, and returns the new
 * rows. The very first evaluation ever stores them already announced:
 * history from before the feature isn't news. (A marker, not "no milestones
 * yet", so a club starting from nothing still hears about its first debut.)
 */
export async function evaluateMilestones(now = new Date(), db: Db = prisma) {
  const clubId = env.eaClubId;
  if (!clubId) return [];
  const firstRun = !(await db.notification.findUnique({ where: { kind_key: MARKER } }));
  const [lines, have, wins] = await Promise.all([
    db.eaMatchPlayer.findMany({ where: { playerId: { not: null }, match: { clubId } }, select: { playerId: true, goals: true, assists: true, cleanSheet: true, pos: true } }),
    db.milestone.findMany({ select: { playerId: true, key: true } }),
    motmWins(undefined, undefined, now, db),
  ]);
  const people = new Set<string>([...lines.map((l) => l.playerId!), ...wins.keys()]);
  const metrics = metricsByPlayer(lines.map((l) => ({ ...l, playerId: l.playerId! })), wins, [...people]);
  const fresh = newMilestones(metrics, new Set(have.map((h) => `${h.playerId}:${h.key}`)));
  if (fresh.length)
    await db.milestone.createMany({
      data: fresh.map((f) => ({ playerId: f.playerId, key: f.key, label: f.label, achievedAt: now, announcedAt: firstRun ? now : null })),
      skipDuplicates: true,
    });
  if (firstRun) await db.notification.create({ data: MARKER }).catch(() => undefined);
  return firstRun ? [] : fresh;
}

/** The channel recognition goes to: its own, else the events channel. */
async function recognitionChannel(): Promise<string> {
  const c = await getChannelConfig();
  return c.recognition || c.events;
}

/** Post the milestones nobody has heard about yet, once. Returns how many went out. */
export async function announceMilestones(db: Db = prisma): Promise<{ posted: number; warning?: string }> {
  const rows = await db.milestone.findMany({ where: { announcedAt: null }, include: { player: { select: { displayName: true } } }, orderBy: [{ achievedAt: "asc" }, { id: "asc" }] });
  if (!rows.length) return { posted: 0 };
  const channel = await recognitionChannel();
  if (!channel) return { posted: 0, warning: "no recognition or events channel is set on the Admin page, so milestones are waiting to be announced" };
  try {
    await sendMessage(channel, { embeds: [milestonesEmbed(rows.map((r) => ({ name: r.player.displayName, label: r.label })), `${env.siteUrl}/players`)], allowed_mentions: { parse: [] } });
  } catch (e) {
    return { posted: 0, warning: `milestones post failed: ${explain(e)}` };
  }
  await db.milestone.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { announcedAt: new Date() } });
  return { posted: rows.length };
}

// --- Player of the Month ----------------------------------------------------------- //

/**
 * Awards a finished month, once: the votes cast in matches of that month
 * (club time). Returns the award, or null when the month isn't over, was
 * awarded already, or nobody received a vote.
 */
export async function awardMonth(month: string, now = new Date(), db: Db = prisma) {
  const { start, end } = monthRange(month);
  if (now < end) return null;
  if (await db.playerOfTheMonth.findUnique({ where: { month } })) return null;
  const results = await motmResults(start, end, db);
  const votes = new Map<string, number>();
  for (const { eventId: _e, result } of results) for (const [id, n] of result.votes) votes.set(id, (votes.get(id) ?? 0) + n);
  const { winners, votes: top } = choosePotm(votes, await motmWins(start, end, now, db));
  if (!winners.length) return null;
  try {
    return await db.playerOfTheMonth.create({
      data: { month, votes: top, awardedAt: now, winners: { create: winners.map((playerId) => ({ playerId })) } },
      include: { winners: true },
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return null; // a concurrent run awarded it
    throw e;
  }
}

/** Award last month if it is due, and announce every award not yet announced. */
export async function runPotm(now = new Date(), db: Db = prisma): Promise<{ awarded: string | null; posted: number; warning?: string }> {
  const month = previousMonth(monthKey(now));
  const award = await awardMonth(month, now, db);
  const pending = await db.playerOfTheMonth.findMany({ where: { announcedAt: null }, include: { winners: { include: { player: { select: { displayName: true } } } } }, orderBy: { month: "asc" } });
  if (!pending.length) return { awarded: award ? month : null, posted: 0 };
  const channel = await recognitionChannel();
  if (!channel) return { awarded: award ? month : null, posted: 0, warning: "no recognition or events channel is set, so Player of the Month is waiting to be announced" };
  let posted = 0;
  for (const p of pending) {
    try {
      await sendMessage(channel, { embeds: [potmEmbed(p.winners.map((w) => w.player.displayName), monthLabel(p.month), p.votes, `${env.siteUrl}/club/stats`)], allowed_mentions: { parse: [] } });
    } catch (e) {
      return { awarded: award ? month : null, posted, warning: `Player of the Month post failed: ${explain(e)}` };
    }
    await db.playerOfTheMonth.update({ where: { id: p.id }, data: { announcedAt: new Date() } });
    posted++;
  }
  return { awarded: award ? month : null, posted };
}
