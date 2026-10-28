import type { Article, ArticleCategory } from "@prisma/client";
import { getChannelConfig } from "./channel-config";
import { explain, sendMessage } from "./discord";
import { env } from "./env";
import { sanitizeHtml } from "./html-sanitize";
import { announceEmbed, parseArticle, uniqueSlug, type ArticleInput } from "./news-rules";
import { removeCover, storeCover } from "./news-images";
import { prisma } from "./prisma";

export { parseArticle };

// Articles against the database: staff write them (Markdown), the AI roundup
// is published through the same createArticle, and publishing announces the
// article in the news channel. Port of services.create_article /
// update_article and app.py's news routes. A Discord problem never undoes a
// publish: the article is already live, the problem comes back as a warning.

export type Actor = { id: string | null; name: string };
type R<T = object> = ({ ok: true; warnings: string[] } & T) | { ok: false; error: string; fieldErrors?: Record<string, string> };
const fail = (error: string, fieldErrors?: Record<string, string>) => ({ ok: false as const, error, fieldErrors });

export async function freeSlug(title: string): Promise<string> {
  const root = await prisma.article.findMany({ where: { slug: { startsWith: uniqueSlug(title, new Set()) } }, select: { slug: true } });
  // "new" is the new-article page's address.
  return uniqueSlug(title, new Set([...root.map((r) => r.slug), "new"]));
}

/** Post the announcement for a live article, once: remembers the message so it isn't posted again. */
export async function announceArticle(article: Pick<Article, "id" | "title" | "slug" | "category" | "summary" | "authorName" | "publishedAt" | "coverImage" | "discordMessageId">): Promise<string | null> {
  if (article.discordMessageId) return null;
  const channel = (await getChannelConfig()).news;
  if (!channel) return "The article is live, but no news channel is set on the Admin page, so it wasn't announced in Discord.";
  try {
    const msg = await sendMessage(channel, {
      embeds: [announceEmbed({ ...article, publishedAt: article.publishedAt ?? new Date(), coverFile: article.coverImage }, env.siteUrl)],
      allowed_mentions: { parse: [] },
    });
    await prisma.article.update({ where: { id: article.id }, data: { discordChannelId: channel, discordMessageId: msg.id } });
    return null;
  } catch (e) {
    return `The article is live, but the Discord announcement failed: ${explain(e)}`;
  }
}

/** Create an article. `body` is Markdown for staff and HTML for the AI roundup (sanitised here). */
export async function createArticle(
  input: ArticleInput & { format?: "MARKDOWN" | "HTML"; source?: "STAFF" | "AI" },
  author: Actor,
  cover?: Uint8Array | null,
  opts: { announce?: boolean } = {},
): Promise<R<{ article: Article }>> {
  const format = input.format ?? "MARKDOWN";
  let files: { file: string; thumb: string } | null = null;
  if (cover?.length) {
    try {
      files = await storeCover(cover);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "That image couldn't be saved.", { cover: e instanceof Error ? e.message : "" });
    }
  }
  const article = await prisma.article.create({
    data: {
      title: input.title,
      slug: await freeSlug(input.title),
      category: input.category,
      summary: input.summary,
      body: format === "HTML" ? sanitizeHtml(input.body) : input.body,
      format,
      source: input.source ?? "STAFF",
      coverImage: files?.file ?? null,
      coverThumb: files?.thumb ?? null,
      authorId: author.id,
      authorName: author.name,
      published: input.published,
      publishedAt: input.published ? new Date() : null,
    },
  });
  const warnings: string[] = [];
  if (input.published && opts.announce !== false) {
    const w = await announceArticle(article);
    if (w) warnings.push(w);
  }
  return { ok: true, warnings, article };
}

export async function updateArticle(id: string, input: ArticleInput, change: { cover?: Uint8Array | null; removeCover?: boolean } = {}): Promise<R<{ article: Article }>> {
  const had = await prisma.article.findUnique({ where: { id } });
  if (!had) return fail("That article no longer exists.");
  let files: { file: string; thumb: string } | null = null;
  if (change.cover?.length) {
    try {
      files = await storeCover(change.cover);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "That image couldn't be saved.", { cover: e instanceof Error ? e.message : "" });
    }
  }
  const dropCover = !!files || change.removeCover;
  const article = await prisma.article.update({
    where: { id },
    data: {
      title: input.title,
      category: input.category,
      summary: input.summary,
      body: had.format === "HTML" ? sanitizeHtml(input.body) : input.body,
      published: input.published,
      // The first time it goes live is the publication date; unpublishing keeps it.
      publishedAt: input.published && !had.publishedAt ? new Date() : had.publishedAt,
      ...(dropCover ? { coverImage: files?.file ?? null, coverThumb: files?.thumb ?? null } : {}),
    },
  });
  if (dropCover) await removeCover(had.coverImage, had.coverThumb);
  const warnings: string[] = [];
  // Going live announces it; an edit to something already announced doesn't.
  if (article.published && !article.discordMessageId) {
    const w = await announceArticle(article);
    if (w) warnings.push(w);
  }
  return { ok: true, warnings, article };
}

export async function deleteArticle(id: string): Promise<R> {
  const a = await prisma.article.findUnique({ where: { id } });
  if (!a) return fail("That article no longer exists.");
  await prisma.article.delete({ where: { id } });
  await removeCover(a.coverImage, a.coverThumb);
  return { ok: true, warnings: [] };
}

export type ArticleCard = Pick<Article, "id" | "slug" | "title" | "summary" | "category" | "coverThumb" | "publishedAt" | "published" | "authorName" | "source">;
const cardSelect = { id: true, slug: true, title: true, summary: true, category: true, coverThumb: true, publishedAt: true, published: true, authorName: true, source: true } as const;

/** The news list: live articles, newest first; staff also see drafts. */
export async function listArticles(opts: { includeDrafts: boolean; category?: ArticleCategory; skip?: number; take?: number }): Promise<{ items: ArticleCard[]; total: number }> {
  const where = { ...(opts.includeDrafts ? {} : { published: true }), ...(opts.category ? { category: opts.category } : {}) };
  const [items, total] = await Promise.all([
    prisma.article.findMany({ where, orderBy: [{ publishedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }], skip: opts.skip ?? 0, take: opts.take ?? 12, select: cardSelect }),
    prisma.article.count({ where }),
  ]);
  return { items, total };
}

export const coverUrl = (file: string | null | undefined) => (file ? `/api/uploads/articles/${file}` : null);
