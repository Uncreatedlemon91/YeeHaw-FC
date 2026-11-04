"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/action-form";
import { assertPerm } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { RecruitStage } from "@prisma/client";
import { approveApplication, denyApplication, postToBoard, setStage } from "@/lib/recruitment";
import { APPLICANT_STAGES } from "@/lib/recruit-pipeline";
import { fromInput } from "@/lib/time";

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

/** The pipeline panel: move a pending application to a stage (an interview needs a time). */
export async function moveStage(_: ActionState, data: FormData): Promise<ActionState> {
  const { user } = await reviewer();
  const appId = String(data.get("appId"));
  const stage = String(data.get("stage")) as RecruitStage;
  if (!APPLICANT_STAGES.includes(stage)) return { error: "Unknown stage." };
  const result = await setStage({ appId, stage, interviewAt: fromInput(String(data.get("interviewAt") ?? "")), recruiterId: user.id });
  revalidatePath("/recruitment");
  revalidatePath(`/recruitment/${appId}`);
  if (!result.ok) return { error: result.error };
  return { ok: "Stage updated.", warnings: result.warnings };
}

/** Take an application on (or hand it back with release). */
export async function claim(_: ActionState, data: FormData): Promise<ActionState> {
  const { user } = await reviewer();
  const appId = String(data.get("appId"));
  const release = data.get("release") === "1";
  await prisma.recruitmentApplication.update({ where: { id: appId }, data: { recruiterId: release ? null : user.id } });
  revalidatePath("/recruitment");
  revalidatePath(`/recruitment/${appId}`);
  return { ok: release ? "Released." : "It's yours." };
}

export async function saveNotes(_: ActionState, data: FormData): Promise<ActionState> {
  await reviewer();
  const appId = String(data.get("appId"));
  const notes = String(data.get("notes") ?? "").trim();
  if (notes.length > 5000) return { error: "Keep notes under 5,000 characters." };
  await prisma.recruitmentApplication.update({ where: { id: appId }, data: { notes: notes || null } });
  revalidatePath(`/recruitment/${appId}`);
  return { ok: "Notes saved." };
}
