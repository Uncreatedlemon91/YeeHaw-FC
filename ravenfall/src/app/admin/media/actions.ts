"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/action-form";
import { assertPerm } from "@/lib/auth";
import { deleteGalleryItem, youtubeId } from "@/lib/gallery";
import { prisma } from "@/lib/prisma";

export async function addVideo(_: ActionState, data: FormData): Promise<ActionState> {
  const me = await assertPerm("RECRUITER");
  const id = youtubeId(String(data.get("url") ?? ""));
  if (!id) return { error: "That isn't a YouTube link we can read. Paste the video's address." };
  const eventId = String(data.get("eventId") ?? "") || null;
  await prisma.galleryItem.create({
    data: { kind: "VIDEO", youtubeId: id, caption: String(data.get("caption") ?? "").trim().slice(0, 200), eventId, uploaderId: me.id },
  });
  revalidatePath("/");
  revalidatePath("/admin/media");
  return { ok: "Video added to the home page." };
}

export async function removeItem(data: FormData) {
  await assertPerm("RECRUITER");
  await deleteGalleryItem(String(data.get("id")));
  revalidatePath("/");
  revalidatePath("/admin/media");
}
