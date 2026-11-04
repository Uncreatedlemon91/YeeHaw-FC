import type { EventType } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";
import { UNIT } from "@/config/unit";
import { getChannelConfig } from "./channel-config";
import { linkButton, row, sendMessage } from "./discord";
import { env } from "./env";
import { invitedLabel } from "./event-invites";
import { squadLeaderboard } from "./member-stats";
import { prisma } from "./prisma";
import { discordTime, fmt } from "./time";

// The weekly digest: the past seven days in review and the seven ahead,
// posted to the digest channel on Mondays (deploy/digest.sh, the
// ravenfall-digest timer) or from the Admin page. One post per week: the
// timer can fire twice (Persistent=true after downtime) without doubling up.

const DAY = 864e5;
const KEY = "digest";
const TYPE: Record<EventType, string> = { OP: "Op", TRAINING: "Training", BRIEFING: "Briefing" };

type Person = { id: string; discordId: string; callsign: string | null; discordUsername: string };
const nameOf = (u: Person) => u.callsign ?? u.discordUsername;

export type Digest = {
  week: string;
  from: Date;
  to: Date;
  events: { id: string; title: string; type: EventType; startTime: Date; attended: number }[];
  attendances: number;
  turnout: number | null;
  prevTurnout: number | null;
  promotions: { user: Person; title: string }[];
  awards: { user: Person; award: string }[];
  quals: { user: Person; title: string }[];
  enlisted: Person[];
  squads: { squad: string; rate: number | null }[];
  top: { user: Person; count: number }[];
  ahead: { id: string; title: string; type: EventType; startTime: Date; who: string; recruits: boolean; course: string | null; mandatory: boolean }[];
};

/** The ISO week a moment falls in, in unit time: "2026-W45". */
export const weekKey = (d: Date) => formatInTimeZone(d, env.timezone, "RRRR-'W'II");

/** Turnout across the squads: attended over everyone invited. */
const turnoutOf = (board: { attended: number; possible: number }[]) => {
  const possible = board.reduce((n, b) => n + b.possible, 0);
  return possible ? Math.round((Math.min(board.reduce((n, b) => n + b.attended, 0), possible) / possible) * 100) : null;
};

export async function buildDigest(now = new Date()): Promise<Digest> {
  const from = new Date(now.getTime() - 7 * DAY);
  const ahead = new Date(now.getTime() + 7 * DAY);
  const inWeek = { gte: from, lt: now };
  const person = { select: { id: true, discordId: true, callsign: true, discordUsername: true } };
  const [events, records, awards, board, prevBoard, topRows, upcoming] = await Promise.all([
    prisma.event.findMany({
      where: { startTime: inWeek },
      orderBy: { startTime: "asc" },
      select: { id: true, title: true, type: true, startTime: true, _count: { select: { attendances: { where: { status: "ATTENDING" } } } } },
    }),
    prisma.serviceRecord.findMany({
      where: { createdAt: inWeek, type: { in: ["PROMOTION", "QUALIFICATION", "ENLISTMENT"] }, user: { status: { not: "DISCHARGED" } } },
      orderBy: { createdAt: "asc" },
      include: { user: person },
    }),
    prisma.memberAward.findMany({ where: { awardedAt: inWeek, revokedAt: null }, orderBy: { awardedAt: "asc" }, include: { user: person, award: { select: { name: true } } } }),
    squadLeaderboard(now, 7),
    squadLeaderboard(from, 7),
    prisma.attendance.groupBy({
      by: ["userId"],
      where: { status: "ATTENDING", event: { startTime: inWeek }, user: { status: "ACTIVE" } },
      _count: true,
      orderBy: { _count: { userId: "desc" } },
      take: 3,
    }),
    prisma.event.findMany({ where: { startTime: { gte: now, lt: ahead } }, orderBy: { startTime: "asc" }, include: { course: { select: { title: true } } } }),
  ]);
  const topUsers = await prisma.user.findMany({ where: { id: { in: topRows.map((r) => r.userId) } }, ...person });
  const byId = new Map(topUsers.map((u) => [u.id, u]));
  const of = (type: string) => records.filter((r) => r.type === type);
  return {
    week: weekKey(now),
    from,
    to: now,
    events: events.map((e) => ({ id: e.id, title: e.title, type: e.type, startTime: e.startTime, attended: e._count.attendances })),
    attendances: events.reduce((n, e) => n + e._count.attendances, 0),
    turnout: turnoutOf(board),
    prevTurnout: turnoutOf(prevBoard),
    // "Promoted to Corporal" / "Qualified: Combat Lifesaver" / "Recertified: …"
    promotions: of("PROMOTION").map((r) => ({ user: r.user, title: r.title.replace(/^Promoted to /, "") })),
    quals: of("QUALIFICATION").map((r) => ({ user: r.user, title: r.title.replace(/^(Qualified|Recertified): /, "") })),
    enlisted: of("ENLISTMENT").map((r) => r.user),
    awards: awards.map((a) => ({ user: a.user, award: a.award.name })),
    squads: board.filter((b) => b.possible > 0).map((b) => ({ squad: b.squad, rate: b.rate })),
    top: topRows.flatMap((r) => (byId.has(r.userId) ? [{ user: byId.get(r.userId)!, count: r._count }] : [])),
    ahead: upcoming.map((e) => ({
      id: e.id,
      title: e.title,
      type: e.type,
      startTime: e.startTime,
      who: invitedLabel(e),
      recruits: e.openToRecruits,
      course: e.course?.title ?? null,
      mandatory: e.mandatory,
    })),
  };
}

/** Lines into one embed field, stopping short of Discord's 1024 limit with "and N more". */
function field(name: string, lines: string[]) {
  const out: string[] = [];
  let len = 0;
  for (let i = 0; i < lines.length; i++) {
    const more = lines.length - i;
    if (len + lines[i].length + 1 > 1000 - 20) {
      out.push(`…and ${more} more`);
      break;
    }
    out.push(lines[i]);
    len += lines[i].length + 1;
  }
  return { name, value: out.join("\n") || "—", inline: false };
}

const who = (u: Person) => `<@${u.discordId}>`;

/** Grouped "Viper, Ghost: Combat Lifesaver" style lines, one per title. */
function grouped(items: { user: Person; title: string }[]) {
  const by = new Map<string, Person[]>();
  for (const i of items) by.set(i.title, [...(by.get(i.title) ?? []), i.user]);
  return [...by].map(([title, users]) => `**${title}**: ${users.map(who).join(", ")}`);
}

export function digestMessage(d: Digest) {
  const range = `${fmt(d.from, "d MMM")} – ${fmt(d.to, "d MMM")}`;
  const delta = d.turnout !== null && d.prevTurnout !== null ? d.turnout - d.prevTurnout : null;
  const summary = d.events.length
    ? [
        `**${d.events.length}** event${d.events.length === 1 ? "" : "s"}, **${d.attendances}** attendance${d.attendances === 1 ? "" : "s"}`,
        d.turnout !== null ? `**${d.turnout}%** turnout${delta ? ` (${delta > 0 ? "▲" : "▼"} ${Math.abs(delta)} on the week before)` : ""}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "A quiet week: no events on the calendar.";
  const fields = [
    d.events.length && field("Last week", d.events.map((e) => `${TYPE[e.type]} · **${e.title}** · ${fmt(e.startTime, "EEE d MMM")} · ${e.attended} attended`)),
    d.promotions.length && field("Promotions", grouped(d.promotions.map((p) => ({ user: p.user, title: p.title })))),
    d.awards.length && field("Awards", grouped(d.awards.map((a) => ({ user: a.user, title: a.award })))),
    d.quals.length && field("Qualified", grouped(d.quals)),
    d.enlisted.length && field("Welcome aboard", [d.enlisted.map(who).join(", ")]),
    d.squads.length && field("Squad turnout", d.squads.map((s, i) => `${i === 0 ? "🥇" : `${i + 1}.`} **${s.squad}** ${s.rate}%`)),
    d.top.length && field("Most present", d.top.map((t) => `${who(t.user)} · ${t.count}`)),
    field(
      "The week ahead",
      d.ahead.length
        ? d.ahead.map(
            (e) =>
              `${discordTime(e.startTime, "f")} · **[${e.title}](${env.siteUrl}/ops/${e.id})** · ${[TYPE[e.type], e.course && `${e.course} course`, e.who, e.recruits && "recruits welcome", e.mandatory && "**mandatory**"].filter(Boolean).join(" · ")}`,
          )
        : ["Nothing scheduled yet."],
    ),
  ].filter((f): f is ReturnType<typeof field> => !!f);
  return {
    embeds: [
      {
        title: `Weekly digest · ${range}`,
        url: `${env.siteUrl}/dashboard`,
        description: summary,
        color: 0x4f7a3a,
        fields,
        footer: { text: `${UNIT.siteName} · ${d.week}` },
        timestamp: d.to.toISOString(),
      },
    ],
    components: [row(linkButton("Operations calendar", `${env.siteUrl}/ops`), linkButton("Your dashboard", `${env.siteUrl}/dashboard`))],
    // Names render as mentions but nobody is pinged.
    allowed_mentions: { parse: [] },
  };
}

export type DigestResult = { posted: true; week: string } | { posted: false; reason: string };

/** Post this week's digest, unless it already went out (or `force`). */
export async function postDigest(opts: { force?: boolean; now?: Date } = {}): Promise<DigestResult> {
  const now = opts.now ?? new Date();
  const { digest: channel } = await getChannelConfig();
  if (!channel) return { posted: false, reason: "No digest channel is set on the Admin page." };
  if (!env.botToken) return { posted: false, reason: "The bot isn't set up (DISCORD_BOT_TOKEN)." };
  const week = weekKey(now);
  const last = (await prisma.setting.findUnique({ where: { key: KEY } }))?.value as { week?: string } | undefined;
  if (!opts.force && last?.week === week) return { posted: false, reason: `This week's digest (${week}) already went out.` };
  const msg = await sendMessage(channel, digestMessage(await buildDigest(now)));
  const value = { week, channelId: channel, messageId: msg.id, postedAt: now.toISOString() };
  await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
  return { posted: true, week };
}

export async function lastDigest(): Promise<{ week: string; postedAt: string } | null> {
  const v = (await prisma.setting.findUnique({ where: { key: KEY } }))?.value as { week?: string; postedAt?: string } | undefined;
  return v?.week && v.postedAt ? { week: v.week, postedAt: v.postedAt } : null;
}
