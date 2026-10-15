import { env } from "./env";
import { prisma } from "./prisma";

// Which Discord channels the bot posts to. Command picks them on the Admin
// page; until that's saved once, the *_CHANNEL_ID values in .env are used,
// so an existing deployment keeps working unchanged.

export type ChannelConfig = {
  /** New applications, with Approve / Deny. */
  board: string;
  /** Where "Post to welcome channel" puts the Enlist Now message. */
  welcome: string;
  /** New operations are announced here (optional). */
  ops: string;
  /** Billet, callsign and leave requests, with Approve / Deny (optional). */
  personnel: string;
};

export const CHANNEL_KEYS = ["board", "welcome", "ops", "personnel"] as const;

const KEY = "channels";
const TTL_MS = 30_000;
let cache: { at: number; value: ChannelConfig; fromDb: boolean } | null = null;

export function channelConfigFromEnv(): ChannelConfig {
  return {
    board: env.boardChannelId,
    welcome: env.welcomeChannelId,
    ops: env.opsChannelId,
    personnel: env.personnelChannelId,
  };
}

const id = (v: unknown) => (typeof v === "string" && /^\d+$/.test(v) ? v : "");

export function cleanChannelConfig(raw: unknown): ChannelConfig {
  const r = (raw ?? {}) as Partial<Record<keyof ChannelConfig, unknown>>;
  return { board: id(r.board), welcome: id(r.welcome), ops: id(r.ops), personnel: id(r.personnel) };
}

async function load() {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  cache = { at: Date.now(), value: row ? cleanChannelConfig(row.value) : channelConfigFromEnv(), fromDb: !!row };
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
