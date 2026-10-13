import { env } from "./env";

// Thin Discord REST client. Everything the bot does — roles, nicknames,
// embeds — goes through here. The gateway process (scripts/gateway.mjs)
// only keeps the bot online and reports member changes back to the site.

const API = "https://discord.com/api/v10";

export class DiscordError extends Error {
  constructor(public status: number, public body: string, route: string) {
    super(`Discord ${status} on ${route}: ${body.slice(0, 300)}`);
  }
}

type Init = { method?: string; body?: unknown; reason?: string; token?: string; auth?: "bot" | "bearer" | "none" };

export async function discord<T = unknown>(route: string, init: Init = {}): Promise<T> {
  const headers: Record<string, string> = { "User-Agent": "RavenfallHQ (https://ravenfallpmc.com, 1.0)" };
  const auth = init.auth ?? "bot";
  if (auth === "bot") {
    if (!env.botToken) throw new DiscordError(0, "DISCORD_BOT_TOKEN is not set", route);
    headers.Authorization = `Bot ${env.botToken}`;
  } else if (auth === "bearer") {
    headers.Authorization = `Bearer ${init.token}`;
  }
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.reason) headers["X-Audit-Log-Reason"] = encodeURIComponent(init.reason);

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API + route, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
    // One polite retry on a rate limit; anything longer is surfaced.
    if (res.status === 429 && attempt === 0) {
      const data = (await res.json().catch(() => ({}))) as { retry_after?: number };
      const wait = Math.min((data.retry_after ?? 1) * 1000, 5000);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) throw new DiscordError(res.status, await res.text(), route);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
}

export type GuildMember = {
  user?: { id: string; username: string; global_name?: string | null; avatar?: string | null; bot?: boolean };
  nick?: string | null;
  roles: string[];
  joined_at?: string;
};

export type Role = { id: string; name: string; position: number; color: number; managed: boolean };

// --- Members and roles --------------------------------------------------- //

export async function getMember(userId: string): Promise<GuildMember | null> {
  try {
    return await discord<GuildMember>(`/guilds/${env.guildId}/members/${userId}`);
  } catch (e) {
    if (e instanceof DiscordError && e.status === 404) return null;
    throw e;
  }
}

/** The signed-in user's own membership, using their OAuth token. */
export async function getOwnMember(accessToken: string): Promise<GuildMember | null> {
  try {
    return await discord<GuildMember>(`/users/@me/guilds/${env.guildId}/member`, {
      auth: "bearer",
      token: accessToken,
    });
  } catch (e) {
    if (e instanceof DiscordError && (e.status === 404 || e.status === 403)) return null;
    throw e;
  }
}

/**
 * Every member of the server, 1000 per page. Needs the Server Members
 * privileged intent switched on for the bot in the Developer Portal;
 * Discord answers 403 without it.
 */
export async function listMembers(): Promise<GuildMember[]> {
  const all: GuildMember[] = [];
  let after = "0";
  for (;;) {
    const page = await discord<GuildMember[]>(`/guilds/${env.guildId}/members?limit=1000&after=${after}`);
    all.push(...page);
    if (page.length < 1000) return all;
    after = page[page.length - 1].user!.id;
  }
}

export function listRoles(): Promise<Role[]> {
  return discord<Role[]>(`/guilds/${env.guildId}/roles`);
}

export function setNickname(userId: string, nick: string, reason?: string) {
  return discord(`/guilds/${env.guildId}/members/${userId}`, { method: "PATCH", body: { nick }, reason });
}

export function addRole(userId: string, roleId: string, reason?: string) {
  return discord(`/guilds/${env.guildId}/members/${userId}/roles/${roleId}`, { method: "PUT", reason });
}

export function removeRole(userId: string, roleId: string, reason?: string) {
  return discord(`/guilds/${env.guildId}/members/${userId}/roles/${roleId}`, { method: "DELETE", reason });
}

// --- Messages ------------------------------------------------------------ //

export type Message = { id: string; channel_id: string };

export function sendMessage(channelId: string, payload: object) {
  return discord<Message>(`/channels/${channelId}/messages`, { method: "POST", body: payload });
}

export function editMessage(channelId: string, messageId: string, payload: object) {
  return discord<Message>(`/channels/${channelId}/messages/${messageId}`, { method: "PATCH", body: payload });
}

export async function dm(discordId: string, content: string) {
  const channel = await discord<{ id: string }>("/users/@me/channels", {
    method: "POST",
    body: { recipient_id: discordId },
  });
  await sendMessage(channel.id, { content, allowed_mentions: { parse: [] } });
}

/** Edit the message an interaction came from, via its 15-minute token. */
export function editOriginal(interactionToken: string, payload: object) {
  return discord(`/webhooks/${env.clientId}/${interactionToken}/messages/@original`, {
    method: "PATCH",
    body: payload,
    auth: "none",
  });
}

export function followup(interactionToken: string, payload: object) {
  return discord(`/webhooks/${env.clientId}/${interactionToken}`, {
    method: "POST",
    body: payload,
    auth: "none",
  });
}

/** Turn a Discord failure into a sentence a recruiter can act on. */
export function explain(e: unknown): string {
  if (e instanceof DiscordError) {
    if (e.status === 0) return e.body;
    if (e.status === 403)
      return "Discord refused (403): the bot needs Manage Roles / Manage Nicknames, and its own role must sit above the roles it changes. It can never rename the server owner.";
    if (e.status === 404) return "Discord couldn't find that member, role or channel (404). Have they left the server?";
    return `Discord returned ${e.status}.`;
  }
  return e instanceof Error ? e.message : String(e);
}

// Component helpers (Discord's raw JSON shapes).
export const ButtonStyle = { Primary: 1, Secondary: 2, Success: 3, Danger: 4, Link: 5 } as const;

export function linkButton(label: string, url: string) {
  return { type: 2, style: ButtonStyle.Link, label, url };
}

export function row(...components: object[]) {
  return { type: 1, components };
}
