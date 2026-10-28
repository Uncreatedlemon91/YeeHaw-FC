import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import DiscordProvider from "next-auth/providers/discord";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getMember, getOwnMember, type GuildMember } from "./discord";
import { env } from "./env";
import { displayNameOf, importMember } from "./member-sync";
import { hasPerm, permsFromRoles, type Perm } from "./permissions";
import { ensurePlayer } from "./players";
import { getRoleConfig } from "./role-config";

// Discord roles are re-read this often, so a promotion or removal on Discord
// reaches the site without the person having to sign out and back in.
const ROLE_REFRESH_MS = 5 * 60 * 1000;

// The re-read is remembered here, per member, not just in the token: a page
// render can't write the session cookie, so a refreshed `rolesAt` is never
// saved and every request after the first five minutes would ask Discord
// again (several times per render), run into its rate limit and stall the
// page. Concurrent requests share one lookup. A failed one is kept for 30
// seconds (the token's last known roles stand meanwhile), so an outage or a
// rate limit isn't answered with more requests.
const memberCache = new Map<string, { at: number; member: Promise<GuildMember | null> }>();

function cachedMember(discordId: string): Promise<GuildMember | null> {
  const hit = memberCache.get(discordId);
  if (hit && Date.now() - hit.at < ROLE_REFRESH_MS) return hit.member;
  const member = getMember(discordId);
  memberCache.set(discordId, { at: Date.now(), member });
  member.catch(() => memberCache.set(discordId, { at: Date.now() - ROLE_REFRESH_MS + 30_000, member }));
  return member;
}

type DiscordProfile = { id: string; username: string; global_name?: string | null; avatar?: string | null };

function nameOf(p: DiscordProfile, member: GuildMember | null) {
  return member ? displayNameOf({ ...member, user: { ...member.user, ...p } }) : p.global_name || p.username;
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID ?? "",
      clientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
      // Discord now returns `iss` on the OAuth callback (RFC 9207), and
      // openid-client refuses it unless the provider declares an issuer --
      // next-auth's built-in Discord provider doesn't.
      issuer: "https://discord.com",
      authorization: { params: { scope: "identify guilds guilds.members.read" } },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        const p = profile as unknown as DiscordProfile;
        const member = account.access_token ? await getOwnMember(account.access_token).catch(() => null) : null;
        const cfg = await getRoleConfig();
        const perms = permsFromRoles(member?.roles ?? [], p.id, cfg, { inGuild: !!member });
        const name = nameOf(p, member);
        const player = await ensurePlayer(
          { discordId: p.id, username: p.username, displayName: name, avatar: p.avatar },
          { lastLoginAt: new Date() },
        );
        // Best-effort: pick up their club title from their Discord roles.
        if (member) await importMember(member, cfg).catch(() => {});
        token.userId = player.id;
        token.slug = player.slug;
        token.discordId = p.id;
        token.name = name;
        token.picture = p.avatar ? `https://cdn.discordapp.com/avatars/${p.id}/${p.avatar}.png?size=128` : null;
        token.perms = perms;
        token.inGuild = !!member;
        token.rolesAt = Date.now();
        return token;
      }

      if (token.discordId && env.botToken && Date.now() - (token.rolesAt ?? 0) > ROLE_REFRESH_MS) {
        try {
          const member = await cachedMember(token.discordId);
          token.perms = permsFromRoles(member?.roles ?? [], token.discordId, await getRoleConfig(), { inGuild: !!member });
          token.inGuild = !!member;
        } catch {
          // Discord unreachable: keep the last known roles rather than
          // locking everyone out.
        }
        token.rolesAt = Date.now();
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        id: token.userId!,
        slug: token.slug ?? "",
        discordId: token.discordId!,
        name: token.name ?? "Unknown",
        image: token.picture ?? null,
        perms: token.perms ?? [],
        inGuild: token.inGuild ?? false,
      };
      return session;
    },
  },
};

export type SessionUser = {
  /** The Player row's id. */
  id: string;
  /** The player's hub: /players/[slug]. */
  slug: string;
  discordId: string;
  name: string;
  image: string | null;
  perms: Perm[];
  inGuild: boolean;
};

/** The signed-in user, read once per request however many components ask. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await getServerSession(authOptions);
  return (session?.user as SessionUser | undefined) ?? null;
});

/** For pages: send guests to sign in, and the unauthorised to /denied. */
export async function requireUser(perm: Perm = "MEMBER", callbackUrl = "/"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  if (!hasPerm(user.perms, perm)) redirect("/denied");
  return user;
}

/** For server actions and route handlers: throw rather than redirect. */
export async function assertPerm(perm: Perm): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user || !hasPerm(user.perms, perm)) throw new Error("You don't have permission to do that.");
  return user;
}
