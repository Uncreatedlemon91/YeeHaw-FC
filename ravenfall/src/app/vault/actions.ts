"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/components/action-form";
import { assertPerm } from "@/lib/auth";
import { uniqueSlug } from "@/lib/library";
import { prisma } from "@/lib/prisma";
import { ensureManualsFolder, freeQualificationSlug } from "@/lib/qualifications";
import { slugify } from "@/lib/utils";

// Qualification records only (title, category, summary). The manual itself is
// a library document; creating a qualification starts one.

const schema = z.object({
  title: z.string().trim().min(2, "Give it a title.").max(120),
  category: z.enum(["WEAPONS", "LEADERSHIP", "MEDICAL", "PILOT", "GENERAL"]),
  summary: z.string().trim().max(300).default(""),
});

function parse(data: FormData) {
  const p = schema.safeParse({ title: data.get("title"), category: data.get("category"), summary: String(data.get("summary") ?? "") });
  if (p.success) return p;
  const fieldErrors: Record<string, string> = {};
  for (const i of p.error.issues) {
    const k = String(i.path[0] ?? "");
    if (k && !fieldErrors[k]) fieldErrors[k] = i.message;
  }
  return { success: false as const, state: { error: "Fix the highlighted fields.", fieldErrors } satisfies ActionState };
}

function refresh() {
  revalidatePath("/vault");
  revalidatePath("/library", "layout");
}

export async function createQualification(_: ActionState, data: FormData): Promise<ActionState> {
  const me = await assertPerm("INSTRUCTOR");
  const p = parse(data);
  if (!p.success) return p.state;
  const slug = await freeQualificationSlug(slugify(p.data.title));
  const folder = await ensureManualsFolder();
  const docSlug = await uniqueSlug(p.data.title);
  const content = `# ${p.data.title}\n\n## Standards\n\n## Assessment\n`;
  await prisma.qualification.create({
    data: {
      ...p.data,
      slug,
      updatedById: me.id,
      libraryDocs: {
        create: {
          slug: docSlug,
          title: p.data.title,
          summary: p.data.summary,
          content,
          clearance: "UNIT",
          folderId: folder.id,
          createdById: me.id,
          updatedById: me.id,
          revisions: { create: { number: 1, title: p.data.title, summary: p.data.summary, content, note: "Created", authorId: me.id } },
        },
      },
    },
  });
  refresh();
  redirect(`/library/${docSlug}/edit`);
}

export async function updateQualification(_: ActionState, data: FormData): Promise<ActionState> {
  const me = await assertPerm("INSTRUCTOR");
  const id = String(data.get("id"));
  const p = parse(data);
  if (!p.success) return p.state;
  const prev = await prisma.qualification.findUnique({ where: { id }, select: { id: true } });
  if (!prev) return { error: "Qualification not found." };
  await prisma.qualification.update({ where: { id }, data: { ...p.data, updatedById: me.id } });
  refresh();
  return { ok: "Saved." };
}

export async function deleteQualification(data: FormData) {
  await assertPerm("ADMIN");
  await prisma.qualification.delete({ where: { id: String(data.get("id")) } });
  refresh();
  redirect("/vault");
}
