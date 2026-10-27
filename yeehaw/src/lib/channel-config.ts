import { prisma } from "./prisma";

// Which Discord channels the bot posts to. Management picks them on the
// Admin page. Unlike roles there is no .env fallback: the old site's
// channel variables were per-feature and are mapped here once, on the page.

export type ChannelConfig = {
  /** Event announcements with RSVP buttons, and match-day posts. */
  events: string;
  /** News articles. */
  news: string;
  /** Squad changes, contract offers (when not DMed), departures, the season announcement. */
  roster: string;
  /** Prospect assessments (optional). */
  recruitment: string;
  /** Reminders for management: season ending, offers unanswered (optional). */
  management: string;
  /** Milestones and Player of the Month (optional; falls back to events). */
  recognition: string;
};

export const CHANNEL_KEYS = ["events", "news", "roster", "recruitment", "management", "recognition"] as const;

const KEY = "channels";
const TTL_MS = 30_000;
let cache: { at: number; value: ChannelConfig; fromDb: boolean } | null = null;

const id = (v: unknown) => (typeof v === "string" && /^\d+$/.test(v) ? v : "");

export function cleanChannelConfig(raw: unknown): ChannelConfig {
  const r = (raw ?? {}) as Partial<Record<keyof ChannelConfig, unknown>>;
  return Object.fromEntries(CHANNEL_KEYS.map((k) => [k, id(r[k])])) as ChannelConfig;
}

async function load() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  cache = { at: Date.now(), value: cleanChannelConfig(row?.value), fromDb: !!row };
  return cache;
}

export async function getChannelConfig(): Promise<ChannelConfig> {
  return (await load()).value;
}

export async function channelConfigIsSaved(): Promise<boolean> {
  return (await load()).fromDb;
}

export async function saveChannelConfig(cfg: ChannelConfig) {
  const value = cleanChannelConfig(cfg);
  await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
  cache = { at: Date.now(), value, fromDb: true };
}
