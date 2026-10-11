"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/action-form";
import { assertPerm } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { approveApplication, denyApplication, postToBoard } from "@/lib/recruitment";

async function reviewer() {
  const me = await assertPerm("RECRUITER");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
  return { user, name: me.name };
}

export async function approve(_: ActionState, data: FormData): Promise<ActionState> {
  const { user, name } = await reviewer();
  const appId = String(data.get("appId"));
  const result = await approveApplication({
    appId,
    reviewer: user,
    reviewerName: name,
    callsign: String(data.get("callsign") ?? ""),
    rank: String(data.get("rank") ?? ""),
    note: String(data.get("note") ?? "").trim() || null,
  });
  revalidatePath("/recruitment");
  revalidatePath(`/recruitment/${appId}`);
  if (!result.ok) return { error: result.error };
  return { ok: "Approved. Profile created and enlistment recorded.", warnings: result.warnings };
}

export async function deny(_: ActionState, data: FormData): Promise<ActionState> {
  const { user, name } = await reviewer();
  const appId = String(data.get("appId"));
  const result = await denyApplication({
    appId,
    reviewer: user,
    reviewerName: name,
    note: String(data.get("note") ?? "").trim() || null,
  });
  revalidatePath("/recruitment");
  revalidatePath(`/recruitment/${appId}`);
  if (!result.ok) return { error: result.error };
  return { ok: "Denied.", warnings: result.warnings };
}

export async function repost(_: ActionState, data: FormData): Promise<ActionState> {
  await reviewer();
  const appId = String(data.get("appId"));
  const err = await postToBoard(appId);
  revalidatePath(`/recruitment/${appId}`);
  return err ? { error: err } : { ok: "Posted to the recruitment board." };
}
