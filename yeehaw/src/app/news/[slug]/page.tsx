import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton, type ActionState } from "@/components/action-form";
import { ArticleBody } from "@/components/article-body";
import { ConfirmButton } from "@/components/confirm-button";
import { Container } from "@/components/container";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth";
import { coverUrl } from "@/lib/news";
import { CATEGORY_LABEL } from "@/lib/news-rules";
import { hasPerm } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/time";
import { deleteArticleAction, togglePublishedAction } from "../actions";

export const dynamic = "force-dynamic";

const asAct = (a: unknown) => a as (p: ActionState, d: FormData) => Promise<ActionState>;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const a = await prisma.article.findFirst({ where: { slug, published: true }, select: { title: true, summary: true } }).catch(() => null);
  return { title: a?.title ?? "News", description: a?.summary ?? undefined };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getSessionUser();
  const staff = hasPerm(user?.perms, "STAFF");
  const article = await prisma.article.findUnique({ where: { slug } });
  // A draft is invisible to everyone but staff (404, not 403, so it isn't confirmed).
  if (!article || (!article.published && !staff)) notFound();

  return (
    <Container size="narrow">
      <p className="mb-2 text-xs">
        <Link href="/news" className="text-accent underline underline-offset-2">
          News
        </Link>
      </p>
      <article>
        <header className="mb-6 border-b pb-5">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{CATEGORY_LABEL[article.category]}</Badge>
            {!article.published && <Badge variant="accent">Draft</Badge>}
            {article.publishedAt && <span>{fmtDate(article.publishedAt)}</span>}
            <span>by {article.authorName}</span>
          </div>
          <h1 className="text-2xl font-bold sm:text-3xl">{article.title}</h1>
          {article.summary && <p className="mt-2 text-muted-foreground">{article.summary}</p>}
        </header>
        {coverUrl(article.coverImage) && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl(article.coverImage)!} alt="" className="mb-6 max-h-[28rem] w-full rounded-lg border object-cover" style={{ objectPosition: `${article.coverFocalX}% ${article.coverFocalY}%` }} />
        )}
        <ArticleBody article={article} />
      </article>
      {staff && (
        <div className="mt-8 flex flex-wrap items-start gap-2 border-t pt-4">
          <Button asChild size="sm" variant="secondary">
            <Link href={`/news/${article.slug}/edit`}>Edit</Link>
          </Button>
          <ActionForm action={asAct(togglePublishedAction)} className="gap-0">
            <input type="hidden" name="id" value={article.id} />
            <SubmitButton size="sm" variant="outline" pendingText="Saving…">
              {article.published ? "Unpublish" : "Publish"}
            </SubmitButton>
          </ActionForm>
          <ActionForm action={asAct(deleteArticleAction)} className="gap-0">
            <input type="hidden" name="id" value={article.id} />
            <ConfirmButton size="sm" variant="outline" message="Delete this article?">
              Delete
            </ConfirmButton>
          </ActionForm>
        </div>
      )}
    </Container>
  );
}
