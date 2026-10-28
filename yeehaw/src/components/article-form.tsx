import type { Article } from "@prisma/client";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { CATEGORIES, CATEGORY_LABEL, MAX_BODY, MAX_SUMMARY, MAX_TITLE } from "@/lib/news-rules";
import { coverUrl } from "@/lib/news";

type Errors = Record<string, string | undefined>;

// The fields of the article form (parsed by parseArticle in lib/news-rules.ts).
// Plain server markup inside an ActionForm. The body is Markdown for staff
// articles; an HTML article (the AI roundup, or carried over from the old
// site) is edited as HTML and sanitised on save.
export function ArticleFields({ article, errors }: { article?: Article; errors: Errors }) {
  const html = article?.format === "HTML";
  return (
    <>
      {article && <input type="hidden" name="id" value={article.id} />}
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
        <Field label="Title" htmlFor="title" error={errors.title}>
          <Input id="title" name="title" defaultValue={article?.title ?? ""} maxLength={MAX_TITLE} required />
        </Field>
        <Field label="Category" htmlFor="category" error={errors.category}>
          <Select id="category" name="category" defaultValue={article?.category ?? "NEWS"}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Summary" htmlFor="summary" help="One line under the title, and in the Discord announcement." error={errors.summary}>
        <Input id="summary" name="summary" defaultValue={article?.summary ?? ""} maxLength={MAX_SUMMARY} />
      </Field>
      <Field label={html ? "Article (HTML)" : "Article (Markdown)"} htmlFor="body" help={html ? "This article is HTML. Only simple formatting tags survive saving." : "Headings with #, **bold**, lists, links and tables work. Raw HTML is shown as text."} error={errors.body}>
        <Textarea id="body" name="body" rows={16} maxLength={MAX_BODY} required defaultValue={article?.body ?? ""} className="font-mono text-xs" />
      </Field>
      <Field label="Cover image" htmlFor="cover" help="PNG, JPEG or WebP, up to 6 MB. Optional." error={errors.cover}>
        <Input id="cover" name="cover" type="file" accept="image/png,image/jpeg,image/webp" className="h-auto py-1.5" />
      </Field>
      {article?.coverThumb && (
        <div className="flex items-center gap-3 text-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={coverUrl(article.coverThumb)!} alt="Current cover" className="h-16 w-28 rounded-md border object-cover" />
          <label className="flex items-center gap-2 text-muted-foreground">
            <input type="checkbox" name="removeCover" value="1" /> Remove the cover
          </label>
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="published" defaultChecked={article ? article.published : true} />
        Published <span className="text-muted-foreground">(announced in Discord the first time it goes live)</span>
      </label>
    </>
  );
}
