"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/action-form";
import { assertPerm, getSessionUser } from "@/lib/auth";
import { canAdd, canDelete, type Viewer } from "@/lib/service-record";
import { afterResponse, changeContract, offerContracts, releaseContract, respondToContract, withdrawOffer, type Actor } from "@/lib/contracts";
import { hasPerm } from "@/lib/permissions";
import { prefixErrors, readTerms } from "@/lib/form-terms";
import { parseAbout } from "@/lib/lineup-rules";
import { relinkPlayer } from "@/lib/ea-poll";
import { prisma } from "@/lib/prisma";
import { fromInput } from "@/lib/time";

// The hub's server actions. Each re-checks who is asking: the page hiding a
// button is never the control.

const refresh = () => revalidatePath("/players", "layout");
const str = (d: FormData, k: string) => String(d.get(k) ?? "").trim();
const actorOf = (u: { id: string; name: string }): Actor => ({ id: u.id, name: u.name });

/** The player answers an offer on their hub. Only the player it names can. */
export async function respondOffer(_: ActionState, data: FormData): Promise<ActionState> {
  const user = await getSessionUser();
  if (!user) return { error: "Sign in to answer an offer." };
  const decision = str(data, "decision") === "accept" ? "accept" : "decline";
  const contractId = str(data, "contractId");
  const r = await respondToContract(contractId, user.discordId, decision);
  if (!r.ok) return { error: r.error };
  const warnings = await afterResponse(contractId, decision, { editOffer: true });
  refresh();
  return { ok: decision === "accept" ? "Accepted. You're under contract." : "Offer declined.", warnings };
}

export async function offerFromHub(_: ActionState, data: FormData): Promise<ActionState> {
  const user = await assertPerm("MANAGEMENT");
  const playerId = str(data, "playerId");
  const t = readTerms(data);
  if (t.fieldErrors) return { error: "Check the highlighted fields.", fieldErrors: t.fieldErrors };
  const r = await offerContracts(str(data, "seasonId"), [{ playerId, terms: t.terms }], actorOf(user));
  if (!r.ok) {
    const own = r.fieldErrors?.[playerId];
    return { error: typeof own === "string" ? own : r.error, fieldErrors: typeof own === "object" ? prefixErrors("", own) : undefined };
  }
  refresh();
  return { ok: "Offer sent.", warnings: r.warnings };
}

export async function changeTerms(_: ActionState, data: FormData): Promise<ActionState> {
  const user = await assertPerm("MANAGEMENT");
  const contractId = str(data, "contractId");
  const t = readTerms(data, "", { allowBlank: true });
  if (t.fieldErrors) return { error: "Check the highlighted fields.", fieldErrors: t.fieldErrors };
  const r = await changeContract(contractId, t.terms, actorOf(user));
  if (!r.ok) {
    const own = r.fieldErrors?.[contractId];
    return { error: r.error, fieldErrors: typeof own === "object" ? prefixErrors("", own) : undefined };
  }
  refresh();
  return { ok: r.changes.length ? "Saved. The player has been told." : "Nothing changed.", warnings: r.warnings };
}

export async function releasePlayer(_: ActionState, data: FormData): Promise<ActionState> {
  const user = await assertPerm("MANAGEMENT");
  const r = await releaseContract(str(data, "contractId"), str(data, "note"), actorOf(user));
  if (!r.ok) return { error: r.error };
  refresh();
  return { ok: "Released. Their roles are off and the departure is posted.", warnings: r.warnings };
}

export async function withdrawContractOffer(_: ActionState, data: FormData): Promise<ActionState> {
  const user = await assertPerm("MANAGEMENT");
  const r = await withdrawOffer(str(data, "contractId"), actorOf(user));
  if (!r.ok) return { error: r.error };
  refresh();
  return { ok: "Offer withdrawn.", warnings: r.warnings };
}

export async function linkGamertag(_: ActionState, data: FormData): Promise<ActionState> {
  await assertPerm("MANAGEMENT");
  const playerId = str(data, "playerId");
  const tag = str(data, "gamertag");
  if (tag.length > 64) return { error: "A gamertag is at most 64 characters.", fieldErrors: { gamertag: "Too long." } };
  if (tag) {
    const clash = await prisma.player.findFirst({ where: { gamertag: { equals: tag, mode: "insensitive" }, id: { not: playerId } }, select: { displayName: true } });
    if (clash) return { error: `${clash.displayName} already has that gamertag.`, fieldErrors: { gamertag: "Already linked to someone else." } };
  }
  await prisma.player.update({ where: { id: playerId }, data: { gamertag: tag || null } });
  await relinkPlayer(playerId, tag || null);
  refresh();
  return { ok: tag ? "Gamertag linked." : "Gamertag cleared." };
}

const KINDS = ["COMMENDATION", "WARNING", "NOTE"] as const;

export async function addServiceEntry(_: ActionState, data: FormData): Promise<ActionState> {
  const user = await assertPerm("STAFF");
  const playerId = str(data, "playerId");
  const viewer: Viewer = { isSelf: user.id === playerId, isStaff: true };
  if (!canAdd(viewer)) return { error: "You can't write an entry about yourself." };
  const kind = KINDS.find((k) => k === str(data, "kind"));
  if (!kind) return { error: "Pick commendation, warning or note." };
  const body = str(data, "body");
  if (!body) return { error: "Write something.", fieldErrors: { body: "Write something." } };
  if (body.length > 1000) return { error: "Keep it under 1000 characters.", fieldErrors: { body: "Too long." } };
  const day = str(data, "occurredOn");
  const occurredAt = day ? fromInput(`${day}T12:00`) : null;
  if (day && !occurredAt) return { error: "That date isn't valid.", fieldErrors: { occurredOn: "Not a valid date." } };
  if (!(await prisma.player.findUnique({ where: { id: playerId }, select: { id: true } }))) return { error: "That player no longer exists." };
  await prisma.serviceEntry.create({
    data: { playerId, kind, body, authorId: user.id, authorName: user.name, ...(occurredAt ? { occurredAt } : {}) },
  });
  refresh();
  return { ok: "Added to the service record." };
}

export async function deleteServiceEntry(_: ActionState, data: FormData): Promise<ActionState> {
  const user = await assertPerm("STAFF");
  const e = await prisma.serviceEntry.findUnique({ where: { id: str(data, "entryId") } });
  if (!e) return { error: "That entry is already gone." };
  const viewer = { isSelf: user.id === e.playerId, isStaff: true, isManagement: hasPerm(user.perms, "MANAGEMENT") };
  if (!canDelete(e.kind, e.authorId, user.id, viewer)) return { error: "Only its author or management can delete this entry." };
  await prisma.serviceEntry.delete({ where: { id: e.id } });
  refresh();
  return { ok: "Deleted." };
}

/**
 * A player edits their own bio, preferred foot and build. Takes no player id:
 * it always writes the signed-in person's own file, so nobody can edit
 * someone else's by changing a form field.
 */
export async function updateAbout(_: ActionState, data: FormData): Promise<ActionState> {
  const user = await getSessionUser();
  if (!user) return { error: "Sign in to edit your profile." };
  const r = parseAbout({ preferredFoot: str(data, "preferredFoot"), archetype: str(data, "archetype"), bio: str(data, "bio") });
  if (!r.ok) return { error: r.error, fieldErrors: { [r.field]: r.error } };
  await prisma.player.update({ where: { id: user.id }, data: r.value });
  refresh();
  return { ok: "Saved." };
}
