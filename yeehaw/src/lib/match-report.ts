import { MATCH_TYPES } from "@/config/club";
import type { SessionUser } from "./auth";
import { getChannelConfig } from "./channel-config";
import { explain, sendMessage } from "./discord";
import { claimNotification, eventUrl } from "./events";
import { nightSummary, reportEmbed, scorers, topRated, voteMessage, type ReportLine } from "./match-report-rules";
import { hasPerm } from "./permissions";
import { prisma } from "./prisma";
import { motmResult, parseRating, voteRefusal, voteState, VOTE_OPENS_AFTER_MS, VOTE_WINDOW_MS, type VoteState } from "./recognition-rules";

// The match report and the post-match loop, against the database. Port of
// proclubs/matchweek.py (participants, vote, ratings, report) and
// matchweek_routes.py. The report is built from the EA matches linked to the
// event (EaMatch.eventId, set by the EA poll): the result is what EA recorded,
// not something typed in.
//
// Who counts as having played: the published team sheet if there is one,
// otherwise everyone who signed up as going. Pro Clubs has no reliable record
// of who started, so this is the club's own record of who was picked. Only
// those players can vote or rate, and not for themselves.

export type Actor = { id: string; name: string };
type R<T = object> = ({ ok: true; warnings: string[] } & T) | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });

export type Participant = { playerId: string; name: string; slug: string };

export async function participants(eventId: string): Promise<Participant[]> {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { lineupPublishedAt: true } });
  const pick = { select: { id: true, displayName: true, slug: true } } as const;
  const people = event?.lineupPublishedAt
    ? (await prisma.eventLineup.findMany({ where: { eventId }, include: { player: pick }, orderBy: { slotKey: "asc" } })).map((r) => r.player)
    : (await prisma.eventSignup.findMany({ where: { eventId, status: "GOING" }, include: { player: pick }, orderBy: { player: { displayName: "asc" } } })).map((r) => r.player);
  return people.map((p) => ({ playerId: p.id, name: p.displayName, slug: p.slug }));
}

const eventBits = async (id: string) => prisma.event.findUnique({ where: { id } });

/** Why the vote isn't open for this event, or the state. */
async function openFor(eventId: string, playerId: string): Promise<{ error: string } | { event: NonNullable<Awaited<ReturnType<typeof eventBits>>>; people: Participant[] }> {
  const event = await eventBits(eventId);
  if (!event) return { error: "That match no longer exists." };
  const people = await participants(eventId);
  const refusal = voteRefusal(voteState(event, new Date()), people.some((p) => p.playerId === playerId));
  return refusal ? { error: refusal } : { event, people };
}

export async function castVote(eventId: string, voterId: string, nomineeId: string): Promise<R<{ nominee: string }>> {
  const ok = await openFor(eventId, voterId);
  if ("error" in ok) return fail(ok.error);
  if (voterId === nomineeId) return fail("You can't vote for yourself.");
  const nominee = ok.people.find((p) => p.playerId === nomineeId);
  if (!nominee) return fail("Vote for somebody who played.");
  await prisma.motmVote.upsert({
    where: { eventId_voterId: { eventId, voterId } },
    create: { eventId, voterId, nomineeId },
    update: { nomineeId },
  });
  return { ok: true, warnings: [], nominee: nominee.name };
}

export async function setSelfRating(eventId: string, playerId: string, rating: unknown): Promise<R<{ rating: number | null }>> {
  const ok = await openFor(eventId, playerId);
  if ("error" in ok) return fail(ok.error);
  const value = parseRating(rating);
  if (value === undefined) return fail("Ratings are whole numbers from 1 to 10.");
  await prisma.matchRating.upsert({ where: { eventId_playerId: { eventId, playerId } }, create: { eventId, playerId, selfRating: value }, update: { selfRating: value } });
  return { ok: true, warnings: [], rating: value };
}

// --- Opening the vote ------------------------------------------------------------------ //

/** Open the vote now (the notify job does it two hours after kick-off; staff can do it sooner, after kick-off). Posts the vote message once. */
export async function openVote(eventId: string, now = new Date()): Promise<R> {
  const event = await eventBits(eventId);
  if (!event) return fail("That event no longer exists.");
  if (!MATCH_TYPES.includes(event.type)) return fail("Only matches have a Man of the Match vote.");
  if (event.startsAt > now) return fail("The vote opens after kick-off.");
  if (event.voteOpenedAt) return { ok: true, warnings: [] };
  const closes = new Date(now.getTime() + VOTE_WINDOW_MS);
  await prisma.event.update({ where: { id: eventId }, data: { voteOpenedAt: now, voteClosesAt: closes } });
  return { ok: true, warnings: await postVoteMessage(eventId, closes) };
}

async function postVoteMessage(eventId: string, closesAt: Date | null): Promise<string[]> {
  const event = await eventBits(eventId);
  const people = await participants(eventId);
  if (!event || !people.length) return [];
  // Once per event: the notification log stops a second post.
  if (!(await claimNotification("vote", eventId))) return [];
  const channel = (await getChannelConfig()).events;
  const undo = () => prisma.notification.deleteMany({ where: { kind: "vote", key: eventId } });
  if (!channel) {
    await undo();
    return ["Voting is open on the site, but no events channel is set on the Admin page, so nothing was posted to Discord."];
  }
  try {
    const msg = await sendMessage(channel, { ...voteMessage(event, people, eventUrl(eventId), closesAt), allowed_mentions: { parse: [] } });
    await prisma.event.update({ where: { id: eventId }, data: { voteMessageId: msg.id } });
    return [];
  } catch (e) {
    await undo(); // so a retry can post it
    return [`Voting is open, but the Discord post failed: ${explain(e)}`];
  }
}

/** Events whose vote is due now (two hours after kick-off, within the window), opened one by one. */
export async function openDueVotes(now = new Date()): Promise<{ opened: number; warnings: string[] }> {
  const due = await prisma.event.findMany({
    where: {
      type: { in: [...MATCH_TYPES] },
      voteOpenedAt: null,
      reviewPublishedAt: null,
      startsAt: { lte: new Date(now.getTime() - VOTE_OPENS_AFTER_MS), gt: new Date(now.getTime() - VOTE_OPENS_AFTER_MS - VOTE_WINDOW_MS) },
    },
    select: { id: true },
  });
  let opened = 0;
  const warnings: string[] = [];
  for (const e of due) {
    const r = await openVote(e.id, now);
    if (r.ok) {
      opened++;
      warnings.push(...r.warnings);
    }
  }
  return { opened, warnings };
}

// --- Staff: write it up, publish -------------------------------------------------------- //

export const MAX_NOTES = 3000;
export const MAX_COMMENT = 500;

export type ReviewInput = {
  notes: string;
  clips: string;
  /** playerId -> coach rating ("" = none) and comment. */
  coach: Record<string, { rating: string; comment: string }>;
};

export function parseClips(text: string): { ok: true; clips: string[] } | { ok: false; error: string } {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.some((l) => !/^https?:\/\//i.test(l))) return { ok: false, error: "Clips are links, one per line." };
  return { ok: true, clips: lines.slice(0, 10) };
}

export async function saveReview(eventId: string, input: ReviewInput, actor: Actor): Promise<R> {
  const notes = input.notes.trim();
  if (notes.length > MAX_NOTES) return fail(`Keep the key moments under ${MAX_NOTES.toLocaleString("en-GB")} characters.`);
  const clips = parseClips(input.clips);
  if (!clips.ok) return fail(clips.error);
  const played = new Set((await participants(eventId)).map((p) => p.playerId));
  for (const [playerId, c] of Object.entries(input.coach)) {
    if (!played.has(playerId)) continue;
    const rating = parseRating(c.rating);
    if (rating === undefined) return fail("Ratings are whole numbers from 1 to 10.");
    const comment = c.comment.trim();
    if (comment.length > MAX_COMMENT) return fail(`Keep each comment under ${MAX_COMMENT} characters.`);
    if (rating === null && !comment) continue;
    await prisma.matchRating.upsert({
      where: { eventId_playerId: { eventId, playerId } },
      create: { eventId, playerId, coachRating: rating, coachComment: comment || null, coachName: actor.name },
      update: { coachRating: rating, coachComment: comment || null, coachName: actor.name },
    });
  }
  await prisma.event.update({ where: { id: eventId }, data: { reviewNotes: notes || null, reviewClips: clips.clips.join("\n") || null } });
  return { ok: true, warnings: [] };
}

/** Publish the report: closes the vote and posts the report to Discord. Publishing again re-posts it. */
export async function publishReport(eventId: string, actor: Actor, now = new Date()): Promise<R> {
  const event = await eventBits(eventId);
  if (!event) return fail("That event no longer exists.");
  if (event.startsAt > now) return fail("Publish the report after the match.");
  const closes = event.voteOpenedAt && (!event.voteClosesAt || event.voteClosesAt > now) ? now : event.voteClosesAt;
  await prisma.event.update({ where: { id: eventId }, data: { reviewPublishedAt: now, reviewPublishedBy: actor.name, voteClosesAt: closes } });

  const channel = (await getChannelConfig()).events;
  if (!channel) return { ok: true, warnings: ["Report published on the site. No events channel is set on the Admin page, so it wasn't posted to Discord."] };
  const [matches, people, votes] = await Promise.all([loadMatches(eventId), participants(eventId), prisma.motmVote.findMany({ where: { eventId }, select: { nomineeId: true } })]);
  const result = motmResult(votes.map((v) => v.nomineeId));
  const names = new Map(people.map((p) => [p.playerId, p.name]));
  const embed = reportEmbed({
    event,
    url: eventUrl(eventId),
    notes: event.reviewNotes,
    night: nightSummary(matches),
    motm: result.winners.length ? { names: result.winners.map((w) => names.get(w) ?? "A teammate"), votes: result.top } : null,
    top: topRated(matches.flatMap((m) => m.lines)),
    clips: (event.reviewClips ?? "").split("\n").filter(Boolean),
    by: actor.name,
  });
  try {
    await sendMessage(channel, { embeds: [embed], allowed_mentions: { parse: [] } });
  } catch (e) {
    return { ok: true, warnings: [`Report published on the site, but the Discord post failed: ${explain(e)}`] };
  }
  return { ok: true, warnings: [] };
}

// --- Loading the report ------------------------------------------------------------------- //

async function loadMatches(eventId: string) {
  const rows = await prisma.eaMatch.findMany({
    where: { eventId },
    orderBy: { playedAt: "asc" },
    include: { players: { include: { player: { select: { displayName: true, slug: true } } }, orderBy: [{ rating: { sort: "desc", nulls: "last" } }, { playerName: "asc" }] } },
  });
  return rows.map((m) => ({
    ...m,
    lines: m.players.map((p): ReportLine => ({ name: p.player?.displayName ?? p.playerName, playerId: p.playerId, rating: p.rating, goals: p.goals, assists: p.assists, matchId: m.id })),
  }));
}

export type CoachRow = { playerId: string; name: string; self: number | null; coach: number | null; comment: string | null; coachName: string | null };

/**
 * Everything the report card shows, with each viewer's clearance applied
 * here: anyone sees the result, scorers, ratings and (once closed) the
 * winner; the vote count while it is open; the signed-in club member their
 * own vote and ratings; staff the self ratings and the coach rating form.
 */
export async function loadReport(eventId: string, user: SessionUser | null, now = new Date()) {
  const event = await eventBits(eventId);
  if (!event) return null;
  const isStaff = hasPerm(user?.perms, "STAFF");
  const isMatch = MATCH_TYPES.includes(event.type);
  const [matches, people, votes, ratings] = await Promise.all([
    loadMatches(eventId),
    participants(eventId),
    prisma.motmVote.findMany({ where: { eventId }, select: { voterId: true, nomineeId: true } }),
    prisma.matchRating.findMany({ where: { eventId } }),
  ]);
  const state: VoteState = voteState(event, now);
  const result = motmResult(votes.map((v) => v.nomineeId));
  const names = new Map(people.map((p) => [p.playerId, p.name]));
  const lines = matches.flatMap((m) => m.lines);
  const mine = user ? ratings.find((r) => r.playerId === user.id) : undefined;
  const closed = state === "closed";

  return {
    event,
    isMatch,
    isStaff,
    started: event.startsAt <= now,
    matches,
    night: nightSummary(matches),
    scorers: scorers(lines),
    top: topRated(lines),
    voteState: state,
    voteTotal: result.total,
    // The winner is a secret until the vote closes.
    winners: closed ? result.winners.map((id) => ({ playerId: id, name: names.get(id) ?? "A teammate" })) : [],
    winnerVotes: closed ? result.top : 0,
    participants: people,
    me: user
      ? {
          id: user.id,
          isParticipant: people.some((p) => p.playerId === user.id),
          vote: votes.find((v) => v.voterId === user.id)?.nomineeId ?? null,
          selfRating: mine?.selfRating ?? null,
          coachRating: mine?.coachRating ?? null,
          coachComment: mine?.coachComment ?? null,
          coachName: mine?.coachName ?? null,
        }
      : null,
    // Staff only: the coach rating form.
    coach: isStaff
      ? people.map((p): CoachRow => {
          const r = ratings.find((x) => x.playerId === p.playerId);
          return { playerId: p.playerId, name: p.name, self: r?.selfRating ?? null, coach: r?.coachRating ?? null, comment: r?.coachComment ?? null, coachName: r?.coachName ?? null };
        })
      : [],
    clips: (event.reviewClips ?? "").split("\n").filter(Boolean),
  };
}

export type Report = NonNullable<Awaited<ReturnType<typeof loadReport>>>;
