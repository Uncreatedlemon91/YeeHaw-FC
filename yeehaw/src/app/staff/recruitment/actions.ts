"use server";

import type { ProspectStage } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { assertPerm } from "@/lib/auth";
import { prefixErrors, readTerms } from "@/lib/form-terms";
import {
  addNote,
  addProspect,
  deleteProspect,
  dismissArrival,
  offerContract,
  sendWelcome,
  setStage,
  startFile,
  tick,
  updateProspect,
} from "@/lib/recruitment";
import { parseProspect } from "@/lib/recruitment-rules";

// Recruitment is staff only; offering a contract is management's (it is the
// same act as an offer from a player's hub). Re-checked on every action.

const str = (d: FormData, k: string) => String(d.get(k) ?? "");
const refresh = (id?: string) => {
  revalidatePath("/staff/recruitment");
  if (id) revalidatePath(`/staff/recruitment/${id}`);
};

export async function addProspectAction(_: ActionState, data: FormData): Promise<ActionState> {
  const user = await assertPerm("STAFF");
  const parsed = parseProspect((k) => str(data, k));
  if (!parsed.ok) return { error: "Check the highlighted fields.", fieldErrors: parsed.errors };
  const r = await addProspect(parsed.value, { id: user.id, name: user.name });
  if (!r.ok) return { error: r.error, fieldErrors: r.fieldErrors };
  refresh();
  redirect(`/staff/recruitment/${r.prospect.id}`);
}

export async function updateProspectAction(id: string, _: ActionState, data: FormData): Promise<ActionState> {
  await assertPerm("STAFF");
  const parsed = parseProspect((k) => str(data, k));
  if (!parsed.ok) return { error: "Check the highlighted fields.", fieldErrors: parsed.errors };
  const r = await updateProspect(id, parsed.value);
  if (!r.ok) return { error: r.error, fieldErrors: r.fieldErrors };
  refresh(id);
  return { ok: "Saved." };
}

export async function stageAction(_: ActionState, data: FormData): Promise<ActionState> {
  await assertPerm("STAFF");
  const id = str(data, "id");
  const r = await setStage(id, str(data, "stage") as ProspectStage);
  if (!r.ok) return { error: r.error };
  refresh(id);
  return { ok: "Moved.", warnings: r.warnings };
}

export async function startFileAction(_: ActionState, data: FormData): Promise<ActionState> {
  const user = await assertPerm("STAFF");
  const r = await startFile(str(data, "discordId"), str(data, "name"), { id: user.id, name: user.name });
  if (!r.ok) return { error: r.error };
  refresh();
  redirect(`/staff/recruitment/${r.prospect.id}`);
}

export async function dismissArrivalAction(_: ActionState, data: FormData): Promise<ActionState> {
  await assertPerm("STAFF");
  const r = await dismissArrival(str(data, "discordId"));
  if (!r.ok) return { error: r.error };
  refresh();
  return { ok: "Dismissed." };
}

export async function noteAction(_: ActionState, data: FormData): Promise<ActionState> {
  const user = await assertPerm("STAFF");
  const id = str(data, "id");
  const r = await addNote(id, { body: str(data, "body"), rating: str(data, "rating"), eventId: str(data, "eventId") }, { id: user.id, name: user.name });
  if (!r.ok) return { error: r.error, fieldErrors: r.fieldErrors };
  refresh(id);
  return { ok: "Note saved.", warnings: r.warnings };
}

export async function offerAction(_: ActionState, data: FormData): Promise<ActionState> {
  const user = await assertPerm("MANAGEMENT");
  const id = str(data, "id");
  const t = readTerms(data);
  if (t.fieldErrors) return { error: "Check the highlighted fields.", fieldErrors: t.fieldErrors };
  const r = await offerContract(id, str(data, "seasonId"), t.terms, { id: user.id, name: user.name });
  if (!r.ok) {
    const own = r.fieldErrors ? Object.values(r.fieldErrors)[0] : undefined;
    return { error: typeof own === "string" ? own : r.error, fieldErrors: own && typeof own === "object" ? prefixErrors("", own) : undefined };
  }
  refresh(id);
  revalidatePath("/players", "layout");
  return { ok: "Offer sent. The file moves to Offered.", warnings: r.warnings };
}

export async function tickAction(_: ActionState, data: FormData): Promise<ActionState> {
  await assertPerm("STAFF");
  const id = str(data, "id");
  const r = await tick(id, str(data, "step"), str(data, "done") === "1");
  if (!r.ok) return { error: r.error };
  refresh(id);
  return undefined;
}

export async function welcomeAction(_: ActionState, data: FormData): Promise<ActionState> {
  await assertPerm("STAFF");
  const id = str(data, "id");
  const r = await sendWelcome(id);
  if (!r.ok) return { error: r.error };
  refresh(id);
  return { ok: "Welcome message sent." };
}

export async function deleteProspectAction(_: ActionState, data: FormData): Promise<ActionState> {
  await assertPerm("STAFF");
  const r = await deleteProspect(str(data, "id"));
  if (!r.ok) return { error: r.error };
  refresh();
  redirect("/staff/recruitment");
}
