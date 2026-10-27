import Link from "next/link";
import { Container } from "@/components/container";
import { ConfirmButton } from "@/components/confirm-button";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/input";
import { prisma } from "@/lib/prisma";
import { fmt } from "@/lib/time";
import { restoreRevision } from "../../actions";
import { DocCrumbs } from "../../doc-crumbs";
import { historyDoc } from "../../guard";

export const metadata = { title: "Revision history" };

export default async function History({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { doc, chain } = await historyDoc(slug, `/library/${slug}/history`);
  const revisions = await prisma.libraryRevision.findMany({
    where: { documentId: doc.id },
    orderBy: { number: "desc" },
    include: { author: true },
  });
  const label = (n: number) => `Revision ${n}${n === doc.revision ? " (current)" : ""}`;

  return (
    <Container className="max-w-4xl">
      <DocCrumbs chain={chain} last={<Link href={`/library/${doc.slug}`} className="hover:text-accent">{doc.title}</Link>} />
      <PageHeader eyebrow="Library" title="Revision history" description={doc.title} />

      {revisions.length > 1 && (
        <Card className="mb-6">
          <CardContent className="py-4">
            <form action={`/library/${doc.slug}/diff`} className="flex flex-wrap items-end gap-3">
              <Field label="Compare" htmlFor="from">
                <Select id="from" name="from" defaultValue={revisions[1].number}>
                  {revisions.map((r) => (
                    <option key={r.number} value={r.number}>
                      {label(r.number)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="With" htmlFor="to">
                <Select id="to" name="to" defaultValue={revisions[0].number}>
                  {revisions.map((r) => (
                    <option key={r.number} value={r.number}>
                      {label(r.number)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button type="submit" variant="outline">
                Show changes
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-2">
        {revisions.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-display text-lg font-semibold uppercase">Revision {r.number}</span>
                {r.number === doc.revision && <Badge variant="success">Current</Badge>}
                {r.major && <Badge variant="accent">Major</Badge>}
              </div>
              <div className="text-sm text-muted-foreground">
                {r.title} · {fmt(r.createdAt)} · {r.author ? (r.author.callsign ?? r.author.discordUsername) : "unknown"}
              </div>
              {r.note && <p className="mt-1 text-sm italic">{r.note}</p>}
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/library/${doc.slug}/history/${r.number}`}>View</Link>
              </Button>
              {r.number > 1 && (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/library/${doc.slug}/diff?from=${r.number - 1}&to=${r.number}`}>Changes</Link>
                </Button>
              )}
              {r.number !== doc.revision && (
                <form action={restoreRevision}>
                  <input type="hidden" name="id" value={doc.id} />
                  <input type="hidden" name="number" value={r.number} />
                  <ConfirmButton size="sm" variant="secondary" message={`Restore revision ${r.number}? It becomes a new revision.`}>
                    Restore
                  </ConfirmButton>
                </form>
              )}
            </div>
          </div>
        ))}
      </div>
    </Container>
  );
}
