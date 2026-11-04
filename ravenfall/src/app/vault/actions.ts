"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/components/action-form";
import { RANKS } from "@/config/unit";
import { assertPerm } from "@/lib/auth";
import { uniqueSlug } from "@/lib/library";
import { prisma } from "@/lib/prisma";
import { BADGE_SHAPES, isHex, MAX_CODE, MAX_TASKS } from "@/lib/qual-rules";
import { ensureManualsFolder, freeQualificationSlug } from "@/lib/qualifications";
import { slugify } from "@/lib/utils";

// The qualification builder (/admin/qualifications). The manual itself is a
// library document; creating a qualification starts one.

const schema = z.object({
  title: z.string().trim().min(2, "Give it a title.").max(120),
  category: z.enum(["WEAPONS", "LEADERSHIP", "MEDICAL", "PILOT", "GENERAL"]),
  summary: z.string().trim().max(300).default(""),
  badgeShape: z.enum(BADGE_SHAPES),
  badgeColor: z.string().refine((s) => s === "" || isHex(s), "Pick a colour.").transform((s) => s || null),
  badgeCode: z.string().trim().max(MAX_CODE, `Up to ${MAX_CODE} letters.`).regex(/^[A-Za-z0-9]*$/, "Letters and numbers only.").transform((s) => s.toUpperCase()),
  minRank: z.string().refine((s) => s === "" || RANKS.some((r) => r.abbr === s), "Pick a rank.").transform((s) => s || null),
  validDays: z.union([z.literal(""), z.coerce.number().int().min(1, "At least a day.").max(3650, "Ten years at most.")]).transform((v) => (v === "" ? null : v)),
  holdersCanCertify: z.boolean(),
  tasks: z.array(z.string().trim().min(1).max(200, "Keep each task under 200 characters.")).max(MAX_TASKS, `Up to ${MAX_TASKS} tasks.`),
  prerequisites: z.array(z.string()).max(20),
});

function parse(data: FormData) {
  const p = schema.safeParse({
    title: data.get("title"),
    category: data.get("category"),
    summary: String(data.get("summary") ?? ""),
    badgeShape: data.get("badgeShape") ?? "TAB",
    badgeColor: data.get("useCategoryColor") === "on" ? "" : String(data.get("badgeColor") ?? ""),
    badgeCode: String(data.get("badgeCode") ?? ""),
    minRank: String(data.get("minRank") ?? ""),
    validDays: String(data.get("validDays") ?? ""),
    holdersCanCertify: data.get("holdersCanCertify") === "on",
    tasks: data.getAll("task").map(String).map((t) => t.trim()).filter(Boolean),
    prerequisites: [...new Set(data.getAll("prerequisite").map(String))],
  });
  if (p.success) return p;
  const fieldErrors: Record<string, string> = {};
  for (const i of p.error.issues) {
    const k = String(i.path[0] ?? "");
    if (k && !fieldErrors[k]) fieldErrors[k] = i.message;
  }
  return { success: false as const, state: { error: "Fix the highlighted fields.", fieldErrors } satisfies ActionState };
}

/** True if `start` is reachable by following prerequisites from `from` (a cycle if `from` lists it). */
async function leadsTo(from: string[], start: string): Promise<boolean> {
  const all = await prisma.qualification.findMany({ select: { id: true, prerequisites: { select: { id: true } } } });
  const next = new Map(all.map((q) => [q.id, q.prerequisites.map((p) => p.id)]));
  const seen = new Set<string>();
  const stack = [...from];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === start) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(next.get(id) ?? []));
  }
  return false;
}

function refresh(slug?: string) {
  revalidatePath("/vault");
  revalidatePath("/admin/qualifications");
  if (slug) revalidatePath(`/admin/qualifications/${slug}`);
  revalidatePath("/library", "layout");
}

const fields = ({ prerequisites: _p, ...d }: z.infer<typeof schema>) => d;

export async function createQualification(_: ActionState, data: FormData): Promise<ActionState> {
  const me = await assertPerm("INSTRUCTOR");
  const p = parse(data);
  if (!p.success) return p.state;
  const slug = await freeQualificationSlug(slugify(p.data.title));
  const folder = await ensureManualsFolder();
  const docSlug = await uniqueSlug(p.data.title);
  const tasks = p.data.tasks.length ? p.data.tasks.map((t) => `- ${t}`).join("\n") : "";
  const content = `# ${p.data.title}\n\n## Standards\n\n## Assessment\n\n${tasks}\n`;
  const last = await prisma.qualification.aggregate({ _max: { position: true } });
  await prisma.qualification.create({
    data: {
      ...fields(p.data),
      slug,
      position: (last._max.position ?? 0) + 1,
      updatedById: me.id,
      prerequisites: { connect: p.data.prerequisites.map((id) => ({ id })) },
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
  const prev = await prisma.qualification.findUnique({ where: { id }, select: { id: true, slug: true } });
  if (!prev) return { error: "Qualification not found." };
  if (p.data.prerequisites.includes(id) || (await leadsTo(p.data.prerequisites, id))) {
    return { error: "Those prerequisites would loop back to this qualification.", fieldErrors: { prerequisites: "A prerequisite can't (even indirectly) require this one." } };
  }
  await prisma.qualification.update({
    where: { id },
    data: { ...fields(p.data), updatedById: me.id, prerequisites: { set: p.data.prerequisites.map((x) => ({ id: x })) } },
  });
  refresh(prev.slug);
  return { ok: "Saved." };
}

export async function moveQualification(data: FormData) {
  await assertPerm("INSTRUCTOR");
  const id = String(data.get("id"));
  const up = data.get("dir") === "up";
  const all = await prisma.qualification.findMany({ orderBy: [{ position: "asc" }, { title: "asc" }], select: { id: true } });
  const i = all.findIndex((q) => q.id === id);
  const j = up ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j], all[i]];
  await prisma.$transaction(all.map((q, n) => prisma.qualification.update({ where: { id: q.id }, data: { position: n + 1 } })));
  refresh();
}

export async function setQualificationActive(data: FormData) {
  await assertPerm("INSTRUCTOR");
  await prisma.qualification.update({ where: { id: String(data.get("id")) }, data: { active: data.get("active") === "true" } });
  refresh();
}

export async function deleteQualification(data: FormData) {
  await assertPerm("ADMIN");
  await prisma.qualification.delete({ where: { id: String(data.get("id")) } });
  refresh();
  redirect("/admin/qualifications");
}
