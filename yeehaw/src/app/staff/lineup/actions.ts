"use server";

import { revalidatePath } from "next/cache";
import type { SaveOutcome } from "@/components/board-editor";
import { assertPerm } from "@/lib/auth";
import { readSlotMap } from "@/lib/board-input";
import { saveLineup } from "@/lib/lineups";

// The lineup editor's one write. Staff only; the rules (contracted players,
// one per slot, real slot keys, someone on the pitch to publish) are re-checked here.
export async function saveLineupAction(input: { formation: string; slots: unknown; intent: string }): Promise<SaveOutcome> {
  const user = await assertPerm("STAFF");
  const slots = readSlotMap(input.slots);
  if (!slots || typeof input.formation !== "string") return { ok: false, errors: ["That request wasn't understood. Reload the page."] };
  const r = await saveLineup({ formation: input.formation, slots, publish: input.intent === "publish", actorId: user.id });
  if (!r.ok) return r;
  revalidatePath("/squad");
  revalidatePath("/");
  return { ok: true, message: r.message };
}
