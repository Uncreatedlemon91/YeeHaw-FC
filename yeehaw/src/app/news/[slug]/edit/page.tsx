import { notFound } from "next/navigation";
import { ActionForm, SubmitButton, type ActionState } from "@/components/action-form";
import { ArticleFields } from "@/components/article-form";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveArticleAction } from "../../actions";

export const metadata = { title: "Edit article" };
export const dynamic = "force-dynamic";

export default async function EditArticle({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireUser("STAFF", `/news/${slug}/edit`);
  const article = await prisma.article.findUnique({ where: { slug } });
  if (!article) notFound();
  return (
    <Container size="narrow">
      <PageHeader eyebrow="News" title="Edit article" description={article.source === "AI" ? "This is the AI roundup. Edits are yours to make; it is never rewritten." : undefined} />
      <Card>
        <CardContent>
          <ActionForm action={saveArticleAction as (p: ActionState, d: FormData) => Promise<ActionState>}>
            <ArticleFields article={article} errors={{}} />
            <div>
              <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
            </div>
          </ActionForm>
        </CardContent>
      </Card>
    </Container>
  );
}
