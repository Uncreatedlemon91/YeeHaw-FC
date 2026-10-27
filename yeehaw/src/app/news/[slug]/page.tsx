import { notFound } from "next/navigation";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Placeholder } from "@/components/placeholder";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await prisma.article.findFirst({ where: { slug, published: true } });
  if (!article) notFound();
  return (
    <Container size="narrow">
      <PageHeader eyebrow="News" title={article.title} description={article.summary ?? undefined} />
      <Placeholder title="Article">The article body renders here once the news phase lands.</Placeholder>
    </Container>
  );
}
