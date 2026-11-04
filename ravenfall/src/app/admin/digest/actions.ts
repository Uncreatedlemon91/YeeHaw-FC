"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/action-form";
import { assertPerm } from "@/lib/auth";
import { postDigest } from "@/lib/digest";
import { explain } from "@/lib/discord";

/** Post now. Posting again in the same week is allowed from here (it's deliberate). */
export async function postDigestNow(_: ActionState): Promise<ActionState> {
  await assertPerm("ADMIN");
  try {
    const r = await postDigest({ force: true });
    revalidatePath("/admin/digest");
    return r.posted ? { ok: `Posted the ${r.week} digest.` } : { error: r.reason };
  } catch (e) {
    return { error: `Discord said no: ${explain(e)}` };
  }
}
