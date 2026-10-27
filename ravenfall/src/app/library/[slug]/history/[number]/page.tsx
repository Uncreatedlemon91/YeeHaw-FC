import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/container";
import { ConfirmButton } from "@/components/confirm-button";
import { Markdown } from "@/components/markdown";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { fmt } from "@/lib/time";
import { restoreRevision } from "../../../actions";
import { DocCrumbs } from "../../../doc-crumbs";
import { historyDoc } from "../../../guard";

export const metadata = { title: "Revision" };

export default async function Revision({ params }: { params: Promise<{ slug: string; number: string }> }) {
  const { slug, number } = await params;
  const { doc, chain } = await historyDoc(slug, `/library/${slug}/history/${number}`);
  const n = Number(number);
  if (!Number.isInteger(n)) notFound();
  const rev = await prisma.libraryRevision.findUnique({
    where: { documentId_number: { documentId: doc.id, number: n } },
    include: { author: true },
  });
  if (!rev) notFound();

  return (
    <Container className="max-w-4xl">
      <DocCrumbs chain={chain} last={<Link href={`/library/${doc.slug}/history`} className="hover:text-accent">History</Link>} />
      <PageHeader
        eyebrow={`Revision ${rev.number}${rev.number === doc.revision ? " · current" : ""}`}
        title={rev.title}
        description={rev.summary}
        actions={
          <>
            {rev.number > 1 && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/library/${doc.slug}/diff?from=${rev.number - 1}&to=${rev.number}`}>Changes</Link>
              </Button>
            )}
            {rev.number !== doc.revision && (
              <form action={restoreRevision}>
                <input type="hidden" name="id" value={doc.id} />
                <input type="hidden" name="number" value={rev.number} />
                <ConfirmButton size="sm" message={`Restore revision ${rev.number}? It becomes a new revision.`}>
                  Restore
                </ConfirmButton>
              </form>
            )}
          </>
        }
      />
      <Card>
        <CardContent className="py-6">
          {rev.content ? <Markdown>{rev.content}</Markdown> : <p className="text-sm text-muted-foreground">No content.</p>}
          <p className="mt-8 border-t pt-3 text-xs text-muted-foreground">
            Saved {fmt(rev.createdAt)} by {rev.author ? (rev.author.callsign ?? rev.author.discordUsername) : "unknown"}
            {rev.note && ` · ${rev.note}`}
          </p>
        </CardContent>
      </Card>
    </Container>
  );
}
