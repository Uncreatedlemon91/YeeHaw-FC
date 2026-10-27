import { Prisma, type ClubRole, type Player } from "@prisma/client";
import { prisma } from "./prisma";
import { slugify } from "./utils";

// A Player row is the club's file on one person, keyed by Discord ID. It is
// opened the first time somebody signs in, is put under contract, or is
// acted on by the bot (proclubs/services.py ensure_player).

export type DiscordPerson = {
  discordId: string;
  username: string;
  displayName: string;
  avatar?: string | null;
};

/** A slug no other player has: "viper", then "viper-2", "viper-3"... */
export async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || "player";
  for (let n = 1; ; n++) {
    const slug = n === 1 ? root : `${root}-${n}`;
    if (!(await prisma.player.findUnique({ where: { slug }, select: { id: true } }))) return slug;
  }
}

/**
 * Find or open the player for a Discord account, refreshing the name and
 * avatar Discord reports. Safe to call concurrently: a lost race on the
 * unique Discord ID falls back to the winner's row.
 */
export type PlayerExtras = { clubRole?: ClubRole | null; clubRoleSince?: Date | null; lastLoginAt?: Date };

export async function ensurePlayer(p: DiscordPerson, extra: PlayerExtras = {}): Promise<Player> {
  const update = {
    discordUsername: p.username,
    displayName: p.displayName,
    avatar: p.avatar ?? null,
    ...extra,
  };
  const existing = await prisma.player.findUnique({ where: { discordId: p.discordId } });
  if (existing) return prisma.player.update({ where: { id: existing.id }, data: update });
  try {
    return await prisma.player.create({
      data: {
        discordId: p.discordId,
        discordUsername: p.username,
        displayName: p.displayName,
        avatar: p.avatar ?? null,
        slug: await uniqueSlug(p.displayName),
        ...extra,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return prisma.player.update({ where: { discordId: p.discordId }, data: update });
    }
    throw e;
  }
}
