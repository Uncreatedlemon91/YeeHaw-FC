"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { assertPerm } from "@/lib/auth";
import { createArticle, deleteArticle, parseArticle, updateArticle } from "@/lib/news";
import { MAX_IMAGE_BYTES } from "@/lib/news-images";
import { prisma } from "@/lib/prisma";

// News: staff write, edit and delete; everyone reads (the pages). Each
// action re-checks who is asking.

const str = (d: FormData, k: string) => String(d.get(k) ?? "");
const refresh = (slug?: string) => {
  revalidatePath("/news", "layout");
  if (slug) revalidatePath(`/news/${slug}`);
  revalidatePath("/");
};

/** The uploaded cover, if any (an empty file input arrives as a zero-byte File). */
async function coverOf(d: FormData): Promise<{ bytes: Uint8Array | null } | { error: string }> {
  const f = d.get("cover");
  if (!(f instanceof File) || f.size === 0) return { bytes: null };
  if (f.size > MAX_IMAGE_BYTES) return { error: `Keep the cover image under ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB.` };
  return { bytes: new Uint8Array(await f.arrayBuffer()) };
}

/** Create (no id) or edit an article. */
export async function saveArticleAction(_: ActionState, data: FormData): Promise<ActionState> {
  const user = await assertPerm("STAFF");
  const parsed = parseArticle((k) => str(data, k));
  if (!parsed.ok) return { error: "Check the highlighted fields.", fieldErrors: parsed.errors };
  const cover = await coverOf(data);
  if ("error" in cover) return { error: cover.error, fieldErrors: { cover: cover.error } };
  const id = str(data, "id");

  if (id) {
    const r = await updateArticle(id, parsed.value, { cover: cover.bytes, removeCover: str(data, "removeCover") === "1" });
    if (!r.ok) return { error: r.error, fieldErrors: r.fieldErrors };
    refresh(r.article.slug);
    if (r.warnings.length) return { ok: "Saved.", warnings: r.warnings };
    redirect(`/news/${r.article.slug}`);
  }
  const r = await createArticle(parsed.value, { id: user.id, name: user.name }, cover.bytes);
  if (!r.ok) return { error: r.error, fieldErrors: r.fieldErrors };
  refresh(r.article.slug);
  if (r.warnings.length) return { ok: parsed.value.published ? "Published." : "Saved as a draft.", warnings: [...r.warnings, `Open it: /news/${r.article.slug}`] };
  redirect(`/news/${r.article.slug}`);
}

export async function deleteArticleAction(_: ActionState, data: FormData): Promise<ActionState> {
  await assertPerm("STAFF");
  const r = await deleteArticle(str(data, "id"));
  if (!r.ok) return { error: r.error };
  refresh();
  redirect("/news");
}

/** Take a live article down (or put it back) without editing it. */
export async function togglePublishedAction(_: ActionState, data: FormData): Promise<ActionState> {
  await assertPerm("STAFF");
  const id = str(data, "id");
  const a = await prisma.article.findUnique({ where: { id } });
  if (!a) return { error: "That article no longer exists." };
  const r = await updateArticle(id, { title: a.title, category: a.category, summary: a.summary, body: a.body, published: !a.published });
  if (!r.ok) return { error: r.error };
  refresh(a.slug);
  return { ok: a.published ? "Unpublished: only staff can see it now." : "Published.", warnings: r.warnings };
}
