import type { Captaincy, Position, SquadStatus } from "@prisma/client";
import type { BoardPlayer, BoardSlots } from "./board";
import { prisma } from "./prisma";

// Who is in the squad right now, and the published first-choice XI.
// "Live" = an ACTIVE contract in a WINDOW or ACTIVE season; when a window
// overlaps the running season the newer season's contract wins.

export type LiveEntry = {
  playerId: string;
  slug: string;
  name: string;
  discordId: string;
  avatar: string | null;
  gamertag: string | null;
  contractId: string;
  seasonId: string;
  shirtNumber: number | null;
  squadStatus: SquadStatus;
  position: Position | null;
  secondaryPosition: Position | null;
  captaincy: Captaincy;
};

export async function liveSquad(): Promise<LiveEntry[]> {
  const rows = await prisma.contract.findMany({
    where: { state: "ACTIVE", season: { state: { in: ["WINDOW", "ACTIVE"] } } },
    include: { player: true, season: { select: { startsAt: true } } },
  });
  const newest = new Map<string, (typeof rows)[number]>();
  for (const c of rows) {
    const have = newest.get(c.playerId);
    if (!have || c.season.startsAt > have.season.startsAt) newest.set(c.playerId, c);
  }
  return [...newest.values()]
    .map((c) => ({
      playerId: c.playerId,
      slug: c.player.slug,
      name: c.player.displayName,
      discordId: c.player.discordId,
      avatar: c.player.avatar,
      gamertag: c.player.gamertag,
      contractId: c.id,
      seasonId: c.seasonId,
      shirtNumber: c.shirtNumber,
      squadStatus: c.squadStatus,
      position: c.position,
      secondaryPosition: c.secondaryPosition,
      captaincy: c.captaincy,
    }))
    .sort((a, b) => (a.shirtNumber ?? 1000) - (b.shirtNumber ?? 1000) || a.name.localeCompare(b.name));
}

/** A live player as the board draws them (item key = player id). */
export const toBoardPlayer = (e: LiveEntry, key = e.playerId): BoardPlayer => ({
  key,
  name: e.name,
  discordId: e.discordId,
  avatar: e.avatar,
  slug: e.slug,
  number: e.shirtNumber,
  captaincy: e.captaincy,
  position: e.position,
  status: e.squadStatus,
});

export type PublishedLineup = {
  id: string;
  formation: string;
  publishedAt: Date | null;
  /** Slot key -> player, only for players still under contract. */
  slots: BoardSlots;
  /** Player ids in the XI / on the bench. */
  starters: Set<string>;
  bench: Set<string>;
};

/** The newest PUBLISHED lineup, drawn with today's numbers and armbands. */
export async function loadPublishedLineup(squad?: LiveEntry[]): Promise<PublishedLineup | null> {
  const lineup = await prisma.lineup.findFirst({
    where: { status: "PUBLISHED" },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    include: { slots: true },
  });
  if (!lineup) return null;
  const live = new Map((squad ?? (await liveSquad())).map((e) => [e.playerId, e]));
  const slots: BoardSlots = {};
  const starters = new Set<string>();
  const bench = new Set<string>();
  for (const s of lineup.slots) {
    const e = live.get(s.playerId);
    if (!e) continue; // released since: the slot shows empty
    slots[s.slotKey] = toBoardPlayer(e);
    (s.slotKey.startsWith("SUB") ? bench : starters).add(s.playerId);
  }
  return { id: lineup.id, formation: lineup.formation, publishedAt: lineup.publishedAt, slots, starters, bench };
}
