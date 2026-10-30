import { UNIT } from "@/config/unit";
import { callsignOf } from "./award-service";
import { medalUrl, stripesOf } from "./awards";
import { getChannelConfig } from "./channel-config";
import { dm, explain, linkButton, row, sendMessage } from "./discord";
import { env } from "./env";
import { notifyLater } from "./library-notify";
import { prisma } from "./prisma";

// Discord side of awards: an embed in the Awards channel and a DM to the
// member. Runs after the save and never fails it (callers use announceLater).
// Awards given in one go (the daily evaluator's backlog) are batched into a
// summary instead of one post each.

/** Up to this many awards get an embed apiece; more become a grouped summary. */
const SINGLE_EMBEDS = 3;
/** Retry window for awards whose announcement failed, so an old backlog never floods the channel. */
const RETRY_DAYS = 3;
const DM_CAP = 150;
const DM_DELAY_MS = 400;
/** Discord caps embed fields at 25, and field values at 1024 characters. */
const MAX_FIELDS = 25;

const hex = (c: string) => parseInt(c.slice(1), 16);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export const announceLater = (ids: string[]) => ids.length && notifyLater("awards", () => announce(ids));

type Row = Awaited<ReturnType<typeof load>>[number];

function load(ids: string[]) {
  return prisma.memberAward.findMany({
    where: { id: { in: ids }, revokedAt: null },
    include: { user: true, award: true, event: { select: { title: true } } },
    orderBy: [{ award: { precedence: "asc" } }, { awardedAt: "asc" }],
  });
}

function single(r: Row) {
  const medal = medalUrl(r.award);
  return {
    title: r.sequence > 1 && r.award.repeatable ? `${r.award.name} (${r.sequence}${r.award.device === "NUMERAL" ? "" : " times"})` : r.award.name,
    url: `${env.siteUrl}/vault/${r.award.slug}`,
    description: [`<@${r.user.discordId}> (**${callsignOf(r.user)}**) has been awarded the **${r.award.name}**.`, r.citation && `> ${clip(r.citation, 1500)}`]
      .filter(Boolean)
      .join("\n\n"),
    color: hex(stripesOf(r.award.ribbon)[0].color),
    thumbnail: medal ? { url: `${env.siteUrl}${medal}` } : undefined,
    footer: { text: `${UNIT.siteName} · Awards${r.event ? ` · ${clip(r.event.title, 60)}` : ""}` },
  };
}

function summary(rows: Row[]) {
  const byAward = new Map<string, Row[]>();
  for (const r of rows) byAward.set(r.awardId, [...(byAward.get(r.awardId) ?? []), r]);
  const fields = [...byAward.values()].map((rs) => ({
    name: clip(rs[0].award.name, 256),
    value: clip(rs.map((r) => `<@${r.user.discordId}>`).join(", "), 1024),
    inline: false,
  }));
  const shown = fields.slice(0, MAX_FIELDS);
  return {
    title: `${rows.length} awards given`,
    url: `${env.siteUrl}/vault`,
    description: fields.length > shown.length ? `And ${fields.length - shown.length} more kinds of award; see the personnel files.` : undefined,
    color: hex(stripesOf(rows[0].award.ribbon)[0].color),
    fields: shown,
    footer: { text: `${UNIT.siteName} · Awards` },
  };
}

/**
 * Announce awards that haven't been yet: `ids`, plus any recent ones a
 * failed attempt left behind. Each is claimed first, so two runs never post
 * the same award twice; a failed channel post releases the claim for a retry.
 */
export async function announce(ids: string[]) {
  if (!env.botToken) return;
  const since = new Date(Date.now() - RETRY_DAYS * 864e5);
  const retry = await prisma.memberAward.findMany({
    where: { announcedAt: null, revokedAt: null, createdAt: { gte: since } },
    select: { id: true },
  });
  const mine: string[] = [];
  for (const id of new Set([...ids, ...retry.map((r) => r.id)])) {
    const claimed = await prisma.memberAward.updateMany({ where: { id, announcedAt: null, revokedAt: null }, data: { announcedAt: new Date() } });
    if (claimed.count) mine.push(id);
  }
  if (!mine.length) return;
  const rows = await load(mine);

  const { awards: channel } = await getChannelConfig();
  if (channel && rows.length) {
    try {
      if (rows.length <= SINGLE_EMBEDS) await sendMessage(channel, { embeds: rows.map(single), allowed_mentions: { parse: [] } });
      else await sendMessage(channel, { embeds: [summary(rows)], components: [row(linkButton("Awards & decorations", `${env.siteUrl}/vault`))], allowed_mentions: { parse: [] } });
    } catch (e) {
      console.error(`[awards] channel post failed: ${explain(e)}`);
      await prisma.memberAward.updateMany({ where: { id: { in: mine } }, data: { announcedAt: null } });
    }
  }

  // One DM per member, however many awards they got this time.
  const byUser = new Map<string, Row[]>();
  for (const r of rows) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), r]);
  let sent = 0;
  for (const rs of byUser.values()) {
    if (sent++ >= DM_CAP) {
      console.warn(`[awards] ${byUser.size} members to message, stopping at ${DM_CAP}.`);
      break;
    }
    const lines = rs.map((r) => `**${r.award.name}**${r.citation ? `: ${clip(r.citation, 300)}` : ""}`);
    const text = `${rs.length === 1 ? "You have been awarded" : "You have been awarded:"} ${rs.length === 1 ? lines[0] : "\n" + lines.map((l) => `- ${l}`).join("\n")}\n${env.siteUrl}/roster/${rs[0].userId}?tab=awards`;
    await dm(rs[0].user.discordId, text).catch((e) => console.error(`[awards] DM to ${rs[0].user.discordId} failed: ${explain(e)}`));
    await new Promise((r) => setTimeout(r, DM_DELAY_MS));
  }
}

/** A short heads-up for Command on the personnel board when a nomination is filed (if that channel is set). */
export async function announceNomination(nominationId: string) {
  if (!env.botToken) return;
  const { personnel } = await getChannelConfig();
  if (!personnel) return;
  const n = await prisma.awardNomination.findUnique({ where: { id: nominationId }, include: { nominee: true, nominatedBy: true, award: true } });
  if (!n) return;
  await sendMessage(personnel, {
    embeds: [
      {
        title: "Award nomination pending",
        url: `${env.siteUrl}/personnel#awards`,
        description: `**${n.award.name}** for **${callsignOf(n.nominee)}**${n.nominatedBy ? `, nominated by ${callsignOf(n.nominatedBy)}` : ""}.\n\n> ${clip(n.citation, 800)}`,
        color: 0xd4a017,
        footer: { text: `${UNIT.siteName} · S1 Desk, Awards` },
      },
    ],
    components: [row(linkButton("Decide on the S1 Desk", `${env.siteUrl}/personnel#awards`))],
    allowed_mentions: { parse: [] },
  });
}

export const announceNominationLater = (id: string) => notifyLater("nomination", () => announceNomination(id));
