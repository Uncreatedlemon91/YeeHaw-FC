import { ActionForm, SubmitButton, type ActionState } from "@/components/action-form";
import { ArticleFields } from "@/components/article-form";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { saveArticleAction } from "../actions";

export const metadata = { title: "Write an article" };
export const dynamic = "force-dynamic";

export default async function NewArticle() {
  await requireUser("STAFF", "/news/new");
  return (
    <Container size="narrow">
      <PageHeader eyebrow="News" title="Write an article" description="Staff only. Publishing announces it in the news channel on Discord." />
      <Card>
        <CardContent>
          <ActionForm action={saveArticleAction as (p: ActionState, d: FormData) => Promise<ActionState>}>
            <ArticleFields errors={{}} />
            <div>
              <SubmitButton pendingText="Saving…">Save article</SubmitButton>
            </div>
          </ActionForm>
        </CardContent>
      </Card>
    </Container>
  );
}
