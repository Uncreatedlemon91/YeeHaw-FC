"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/action-form";
import { assertPerm } from "@/lib/auth";
import { cleanProfile, PROFILE_FIELDS, saveProfile, type ProfileKey } from "@/lib/club-profile";

export async function saveClubProfile(_: ActionState, data: FormData): Promise<ActionState> {
  await assertPerm("MANAGEMENT");
  const input = Object.fromEntries(PROFILE_FIELDS.map((f) => [f.key, String(data.get(f.key) ?? "")])) as Record<ProfileKey, string>;
  const r = cleanProfile(input);
  if (!r.ok) return { error: "Some fields are too long.", fieldErrors: r.fieldErrors };
  await saveProfile(r.value);
  revalidatePath("/club");
  return { ok: "Saved. The Club page shows it now." };
}
