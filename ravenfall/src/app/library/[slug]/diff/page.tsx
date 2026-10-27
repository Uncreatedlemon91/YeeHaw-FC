import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { diffLines } from "@/lib/diff";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { DocCrumbs } from "../../doc-crumbs";
import { historyDoc } from "../../guard";

export const metadata = { title: "Compare revisions" };

const STYLE = {
  same: "text-muted-foreground",
  add: "bg-success/15 text-green-300",
  del: "bg-destructive/15 text-red-300",
} as const;
const MARK = { same: " ", add: "+", del: "-" } as const;

export default async function Diff({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const { doc, chain } = await historyDoc(slug, `/library/${slug}/history`);
  const from = Number(sp.from);
  const to = Number(sp.to);
  if (!Number.isInteger(from) || !Number.isInteger(to)) notFound();
  const revs = await prisma.libraryRevision.findMany({ where: { documentId: doc.id, number: { in: [from, to] } } });
  const a = revs.find((r) => r.number === from);
  const b = revs.find((r) => r.number === to);
  if (!a || !b) notFound();

  // The title and summary are part of a revision too.
  const head = (r: typeof a) => `${r.title}\n${r.summary}\n---\n`;
  const lines = diffLines(head(a) + a.content, head(b) + b.content);
  const changed = lines.some((l) => l.kind !== "same");

  return (
    <Container className="max-w-5xl">
      <DocCrumbs chain={chain} last={<Link href={`/library/${doc.slug}/history`} className="hover:text-accent">History</Link>} />
      <PageHeader
        eyebrow="Library"
        title="Compare revisions"
        description={`${doc.title}: revision ${from} → revision ${to}`}
      />
      {!changed ? (
        <Card className="py-12 text-center text-sm text-muted-foreground">These revisions are identical.</Card>
      ) : (
        <Card className="overflow-x-auto">
          <pre className="min-w-full py-2 font-mono text-xs leading-relaxed">
            {lines.map((l, i) => (
              <div key={i} className={cn("flex whitespace-pre-wrap px-3", STYLE[l.kind])}>
                <span className="mr-3 select-none">{MARK[l.kind]}</span>
                <span className="min-w-0 break-words">{l.text || " "}</span>
              </div>
            ))}
          </pre>
        </Card>
      )}
    </Container>
  );
}
