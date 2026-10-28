import type { Article } from "@prisma/client";
import { Markdown } from "@/components/markdown";
import { sanitizeHtml } from "@/lib/html-sanitize";

// An article's text. Markdown is escaped by react-markdown (no raw HTML). HTML
// (the AI roundup, articles from the old site) is sanitised again here even
// though it was when stored: what reaches the page is never trusted on the
// strength of an earlier check.
export function ArticleBody({ article }: { article: Pick<Article, "format" | "body"> }) {
  if (article.format === "MARKDOWN") return <Markdown>{article.body}</Markdown>;
  return <div className="prose-yfc max-w-none text-[0.9375rem] [&_img]:h-auto [&_img]:max-w-full" dangerouslySetInnerHTML={{ __html: sanitizeHtml(article.body) }} />;
}
