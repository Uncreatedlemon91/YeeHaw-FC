"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/action-form";
import { assertPerm } from "@/lib/auth";
import { addSuggestion, replyToSuggestion } from "@/lib/training";

const str = (d: FormData, k: string) => String(d.get(k) ?? "");

/** A member suggests what training works on next. Always written as the signed-in person. */
export async function suggestAction(_: ActionState, data: FormData): Promise<ActionState> {
  const user = await assertPerm("MEMBER");
  const r = await addSuggestion(user.id, str(data, "body"));
  if (!r.ok) return { error: r.error, fieldErrors: r.fieldErrors };
  revalidatePath("/training");
  return { ok: "Thanks. The coaches will see it." };
}

/** Staff answer a suggestion: planned, worked on, not now, with a short note the player sees. */
export async function replyAction(_: ActionState, data: FormData): Promise<ActionState> {
  const user = await assertPerm("STAFF");
  const r = await replyToSuggestion(str(data, "id"), str(data, "status"), str(data, "staffNote"), { id: user.id, name: user.name });
  if (!r.ok) return { error: r.error, fieldErrors: r.fieldErrors };
  revalidatePath("/training");
  return { ok: "Updated." };
}
