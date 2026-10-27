import { BENCH_SLOT_KEYS, DEFAULT_FORMATION, FORMATIONS } from "@/config/formations";
import { env } from "./env";
import { checkTacticsSlots, parseItem, slotLabel, type SlotMap } from "./lineup-rules";
import { prisma } from "./prisma";

// The tactics board (port of the tactics functions in proclubs/services.py).
// Each formation keeps its own saved slots, so switching loses nothing; a
// slot holds a person from the site ("p:<id>") or a free-text name ("n:<name>",
// for an EA gamertag with no file). Saving replaces one formation's slots
// outright and makes it the active one.

export type TacticsState = { active: string; byFormation: Record<string, SlotMap>; updatedByName: string | null; updatedAt: Date | null };

export async function loadTactics(): Promise<TacticsState> {
  const [board, rows] = await Promise.all([prisma.tacticsBoard.findUnique({ where: { id: 1 } }), prisma.tacticsSlot.findMany()]);
  const byFormation: Record<string, SlotMap> = {};
  for (const r of rows) {
    const value = r.playerId ? `p:${r.playerId}` : r.playerName ? `n:${r.playerName}` : null;
    if (value && FORMATIONS[r.formation]) (byFormation[r.formation] ??= {})[r.slotKey] = value;
  }
  const active = board && FORMATIONS[board.activeFormation] ? board.activeFormation : DEFAULT_FORMATION;
  return { active, byFormation, updatedByName: board?.updatedByName ?? null, updatedAt: board?.updatedAt ?? null };
}

/** EA gamertags in the club with no linked player: offered on the board as free-text names. */
export async function unlinkedEaNames(): Promise<string[]> {
  if (!env.eaClubId) return [];
  const [members, linked] = await Promise.all([
    prisma.eaSquadMember.findMany({ where: { clubId: env.eaClubId }, select: { playerName: true } }),
    prisma.player.findMany({ where: { gamertag: { not: null } }, select: { gamertag: true } }),
  ]);
  const have = new Set(linked.map((p) => p.gamertag!.toLowerCase()));
  return members.map((m) => m.playerName).filter((n) => !have.has(n.toLowerCase())).sort((a, b) => a.localeCompare(b));
}

export type SaveResult = { ok: true } | { ok: false; errors: string[] };

export async function saveTactics(formation: string, slots: SlotMap, by: string): Promise<SaveResult> {
  const errors = checkTacticsSlots(formation, slots);
  if (errors.length) return { ok: false, errors };
  const refs = Object.entries(slots).map(([slotKey, v]) => ({ slotKey, ref: parseItem(v)! }));
  const ids = refs.flatMap((r) => (r.ref.kind === "player" ? [r.ref.id] : []));
  const known = new Set((await prisma.player.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((p) => p.id));
  if (ids.some((id) => !known.has(id))) return { ok: false, errors: ["Someone on the board no longer has a file here. Reload and try again."] };

  await prisma.$transaction([
    prisma.tacticsSlot.deleteMany({ where: { formation } }),
    prisma.tacticsSlot.createMany({
      data: refs.map(({ slotKey, ref }) => ({
        formation,
        slotKey,
        playerId: ref.kind === "player" ? ref.id : null,
        playerName: ref.kind === "name" ? ref.name : null,
      })),
    }),
    prisma.tacticsBoard.upsert({
      where: { id: 1 },
      create: { id: 1, activeFormation: formation, updatedByName: by },
      update: { activeFormation: formation, updatedByName: by },
    }),
  ]);
  return { ok: true };
}

/**
 * playerId -> the position they hold on the active formation ("CM" for CM1),
 * port of tactics_roles_for. A slot named by gamertag matches the player whose
 * linked gamertag equals it. Bench slots and unplaced players have none.
 */
export function rolesFromSlots(
  formation: string,
  slots: { slotKey: string; playerId: string | null; playerName: string | null }[],
  gamertags: { id: string; gamertag: string | null }[],
): Map<string, string> {
  const byTag = new Map(gamertags.filter((p) => p.gamertag).map((p) => [p.gamertag!.toLowerCase(), p.id]));
  const roles = new Map<string, string>();
  for (const s of slots) {
    if (BENCH_SLOT_KEYS.includes(s.slotKey)) continue;
    const id = s.playerId ?? (s.playerName ? byTag.get(s.playerName.toLowerCase()) : undefined);
    if (id) roles.set(id, slotLabel(formation, s.slotKey));
  }
  return roles;
}

export async function tacticsRoles(): Promise<Map<string, string>> {
  const board = await prisma.tacticsBoard.findUnique({ where: { id: 1 } });
  const formation = board && FORMATIONS[board.activeFormation] ? board.activeFormation : DEFAULT_FORMATION;
  const [slots, players] = await Promise.all([
    prisma.tacticsSlot.findMany({ where: { formation } }),
    prisma.player.findMany({ where: { gamertag: { not: null } }, select: { id: true, gamertag: true } }),
  ]);
  return rolesFromSlots(formation, slots, players);
}
