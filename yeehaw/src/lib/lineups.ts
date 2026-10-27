import type { Lineup, LineupSlot } from "@prisma/client";
import { DEFAULT_FORMATION } from "@/config/formations";
import { validateLineup, type SlotMap } from "./lineup-rules";
import { liveSquad } from "./squad";
import { prisma } from "./prisma";

// The lineup editor's persistence. One working DRAFT row that Save updates;
// Publish writes the same content as a new PUBLISHED row (history is kept, the
// site shows the newest). Only players under contract can be picked.

type WithSlots = Lineup & { slots: LineupSlot[] };
const toMap = (l: WithSlots): SlotMap => Object.fromEntries(l.slots.map((s) => [s.slotKey, s.playerId]));

/** What the editor starts from: the draft if it is newer than the last publish, else the last publish. */
export async function loadEditorState(): Promise<{ formation: string; slots: SlotMap; publishedAt: Date | null; draftSavedAt: Date | null }> {
  const [draft, published] = await Promise.all([
    prisma.lineup.findFirst({ where: { status: "DRAFT" }, orderBy: { updatedAt: "desc" }, include: { slots: true } }),
    prisma.lineup.findFirst({ where: { status: "PUBLISHED" }, orderBy: { publishedAt: "desc" }, include: { slots: true } }),
  ]);
  const base = draft && (!published?.publishedAt || draft.updatedAt >= published.publishedAt) ? draft : (published ?? draft);
  return {
    formation: base?.formation ?? DEFAULT_FORMATION,
    slots: base ? toMap(base) : {},
    publishedAt: published?.publishedAt ?? null,
    draftSavedAt: draft?.updatedAt ?? null,
  };
}

export type SaveResult = { ok: true; message: string } | { ok: false; errors: string[] };

/** Validate against the live squad, then save the draft and (publish) a published copy. */
export async function saveLineup(input: { formation: string; slots: SlotMap; publish: boolean; actorId: string }): Promise<SaveResult> {
  const squad = await liveSquad();
  const names = new Map(squad.map((e) => [e.playerId, e.name]));
  const errors = validateLineup(input.formation, input.slots, new Set(names.keys()), {
    publish: input.publish,
    nameOf: (id) => names.get(id) ?? "Someone who isn't in the squad",
  });
  if (errors.length) return { ok: false, errors };

  const seasonId = await currentSeasonId();
  const rows = Object.entries(input.slots).map(([slotKey, playerId]) => ({ slotKey, playerId }));
  await prisma.$transaction(async (tx) => {
    const existing = await tx.lineup.findFirst({ where: { status: "DRAFT" }, orderBy: { updatedAt: "desc" } });
    const draft = existing
      ? await tx.lineup.update({ where: { id: existing.id }, data: { formation: input.formation, seasonId } })
      : await tx.lineup.create({ data: { formation: input.formation, seasonId, status: "DRAFT" } });
    await tx.lineupSlot.deleteMany({ where: { lineupId: draft.id } });
    if (rows.length) await tx.lineupSlot.createMany({ data: rows.map((r) => ({ ...r, lineupId: draft.id })) });
    if (input.publish) {
      const pub = await tx.lineup.create({
        data: { formation: input.formation, seasonId, status: "PUBLISHED", publishedAt: new Date(), publishedById: input.actorId },
      });
      await tx.lineupSlot.createMany({ data: rows.map((r) => ({ ...r, lineupId: pub.id })) });
    }
  });
  return { ok: true, message: input.publish ? "Published. It's on the Squad page and the home page now." : "Draft saved." };
}

async function currentSeasonId(): Promise<string | null> {
  const s =
    (await prisma.season.findFirst({ where: { state: "ACTIVE" }, orderBy: { startsAt: "desc" }, select: { id: true } })) ??
    (await prisma.season.findFirst({ where: { state: "WINDOW" }, orderBy: { startsAt: "desc" }, select: { id: true } }));
  return s?.id ?? null;
}
