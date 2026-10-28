"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/action-form";
import { assertPerm } from "@/lib/auth";
import { addAway, deleteAway, setPattern } from "@/lib/availability";

// A player's own availability. Nothing here takes a player id: every action
// writes to the signed-in person's own record and nobody else's.

const str = (d: FormData, k: string) => String(d.get(k) ?? "");
const refresh = () => {
  revalidatePath("/availability");
  revalidatePath("/players", "layout");
  revalidatePath("/fixtures", "layout");
};

export async function savePatternAction(_: ActionState, data: FormData): Promise<ActionState> {
  const user = await assertPerm("MEMBER");
  const r = await setPattern(user.id, data.getAll("day").map(Number), str(data, "note"));
  if (!r.ok) return { error: r.error, fieldErrors: r.field ? { [r.field]: r.error } : undefined };
  refresh();
  return { ok: "Saved." };
}

export async function addAwayAction(_: ActionState, data: FormData): Promise<ActionState> {
  const user = await assertPerm("MEMBER");
  const r = await addAway(user.id, str(data, "startsOn"), str(data, "endsOn"), str(data, "note"));
  if (!r.ok) return { error: r.error, fieldErrors: r.field ? { [r.field]: r.error } : undefined };
  refresh();
  return { ok: "Away dates added." };
}

export async function removeAwayAction(_: ActionState, data: FormData): Promise<ActionState> {
  const user = await assertPerm("MEMBER");
  const r = await deleteAway(user.id, str(data, "id"));
  if (!r.ok) return { error: r.error };
  refresh();
  return { ok: "Removed." };
}
