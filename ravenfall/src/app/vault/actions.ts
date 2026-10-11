"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/components/action-form";
import { assertPerm } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";

const schema = z.object({
  title: z.string().trim().min(2, "Give it a title.").max(120),
  category: z.enum(["WEAPONS", "LEADERSHIP", "MEDICAL", "PILOT", "GENERAL"]),
  summary: z.string().trim().max(300).default(""),
  content: z.string().max(100000).default(""),
});

function parse(data: FormData) {
  return schema.safeParse({
    title: data.get("title"),
    category: data.get("category"),
    summary: String(data.get("summary") ?? ""),
    content: String(data.get("content") ?? ""),
  });
}

export async function createDoc(_: ActionState, data: FormData): Promise<ActionState> {
  const me = await assertPerm("INSTRUCTOR");
  const p = parse(data);
  if (!p.success) return { error: p.error.issues[0]?.message };
  let slug = slugify(p.data.title) || "document";
  if (await prisma.qualification.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36)}`;
  await prisma.qualification.create({ data: { ...p.data, slug, updatedById: me.id } });
  revalidatePath("/vault");
  redirect(`/vault/${slug}`);
}

export async function updateDoc(_: ActionState, data: FormData): Promise<ActionState> {
  const me = await assertPerm("INSTRUCTOR");
  const id = String(data.get("id"));
  const p = parse(data);
  if (!p.success) return { error: p.error.issues[0]?.message };
  const prev = await prisma.qualification.findUnique({ where: { id } });
  if (!prev) return { error: "Document not found." };
  // A new version only when the standard itself changes, not a retitle.
  const bump = prev.content !== p.data.content;
  const doc = await prisma.qualification.update({
    where: { id },
    data: { ...p.data, updatedById: me.id, version: bump ? { increment: 1 } : undefined },
  });
  revalidatePath("/vault");
  revalidatePath(`/vault/${doc.slug}`);
  redirect(`/vault/${doc.slug}`);
}

export async function deleteDoc(data: FormData) {
  await assertPerm("ADMIN");
  await prisma.qualification.delete({ where: { id: String(data.get("id")) } });
  revalidatePath("/vault");
  redirect("/vault");
}
