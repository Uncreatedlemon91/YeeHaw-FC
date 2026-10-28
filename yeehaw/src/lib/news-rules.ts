import type { ArticleCategory } from "@prisma/client";
import { slugify } from "./utils";

// News with no database: what the article form accepts, slugs, and the
// Discord announcement embed (port of proclubs/discord_announce.build_embed).

export const CATEGORIES: readonly ArticleCategory[] = ["NEWS", "TRANSFER", "MATCH_HIGHLIGHT"];
export const CATEGORY_LABEL: Record<ArticleCategory, string> = { NEWS: "News", TRANSFER: "Transfer", MATCH_HIGHLIGHT: "Match Highlight" };
const COLOR: Record<ArticleCategory, number> = { NEWS: 0x4c7ce0, TRANSFER: 0x4caf7d, MATCH_HIGHLIGHT: 0xe0a64c };

export const MAX_TITLE = 200;
export const MAX_SUMMARY = 300;
export const MAX_BODY = 60_000;

export type ArticleInput = { title: string; category: ArticleCategory; summary: string | null; body: string; published: boolean };

export function parseArticle(get: (k: string) => string): { ok: true; value: ArticleInput } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const title = get("title").trim();
  const summary = get("summary").trim();
  const body = get("body").trim();
  const category = get("category") as ArticleCategory;
  if (!title) errors.title = "Give the article a title.";
  else if (title.length > MAX_TITLE) errors.title = `Keep the title under ${MAX_TITLE} characters.`;
  if (summary.length > MAX_SUMMARY) errors.summary = `Keep the summary under ${MAX_SUMMARY} characters.`;
  if (!body) errors.body = "The article needs some text.";
  else if (body.length > MAX_BODY) errors.body = `Keep the article under ${MAX_BODY.toLocaleString("en-GB")} characters.`;
  if (!CATEGORIES.includes(category)) errors.category = "Pick a category.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { title, category, summary: summary || null, body, published: get("published") === "on" || get("published") === "1" } };
}

/** The slug for a title, avoiding `taken`: "match-report", "match-report-2"... */
export function uniqueSlug(title: string, taken: ReadonlySet<string>): string {
  const root = slugify(title) || "article";
  if (!taken.has(root)) return root;
  for (let n = 2; ; n++) if (!taken.has(`${root}-${n}`)) return `${root}-${n}`;
}

export function announceEmbed(a: { title: string; slug: string; category: ArticleCategory; summary: string | null; authorName: string | null; publishedAt: Date; coverFile: string | null }, siteUrl: string) {
  return {
    title: a.title,
    url: `${siteUrl}/news/${a.slug}`,
    color: COLOR[a.category] ?? 0x5865f2,
    author: { name: CATEGORY_LABEL[a.category] },
    timestamp: a.publishedAt.toISOString(),
    ...(a.summary ? { description: a.summary } : {}),
    ...(a.authorName ? { footer: { text: `Posted by ${a.authorName}` } } : {}),
    ...(a.coverFile ? { image: { url: `${siteUrl}/api/uploads/articles/${a.coverFile}` } } : {}),
  };
}
