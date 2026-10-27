"use server";

import { revalidatePath } from "next/cache";
import type { SaveOutcome } from "@/components/board-editor";
import { assertPerm } from "@/lib/auth";
import { readSlotMap } from "@/lib/board-input";
import { saveTactics } from "@/lib/tactics";

// Whole-board save for one formation (replaces its slots, makes it active).
export async function saveTacticsAction(input: { formation: string; slots: unknown; intent: string }): Promise<SaveOutcome> {
  const user = await assertPerm("STAFF");
  const slots = readSlotMap(input.slots);
  if (!slots || typeof input.formation !== "string") return { ok: false, errors: ["That request wasn't understood. Reload the page."] };
  const r = await saveTactics(input.formation, slots, user.name);
  if (!r.ok) return r;
  revalidatePath("/staff/tactics");
  return { ok: true, message: `Saved the ${input.formation} lineup.` };
}
