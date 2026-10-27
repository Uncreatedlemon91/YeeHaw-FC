import { ArrowLeft, Check, Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { Container } from "@/components/container";
import { extractHeadings, Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryIcon, CategoryRibbon, categoryLabel } from "@/components/vault-category";
import { VaultToc } from "@/components/vault-toc";
import { requireUser } from "@/lib/auth";
import { getViewer, readableClearances } from "@/lib/library";
import { hasPerm } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/time";

export const metadata = { title: "Document" };

export default async function Doc({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await requireUser("OPERATOR", `/vault/${slug}`);
  const doc = await prisma.qualification.findUnique({
    where: { slug },
    include: { updatedBy: true, holders: { include: { user: true }, orderBy: { awardedAt: "asc" } } },
  });
  if (!doc) notFound();
  // Only library documents the viewer is cleared to read.
  const related = await prisma.libraryDocument.findMany({
    where: { qualifications: { some: { id: doc.id } }, clearance: { in: readableClearances(await getViewer()) } },
    select: { id: true, slug: true, title: true },
    orderBy: { title: "asc" },
  });
  const mine = doc.holders.find((h) => h.userId === me.id);
  const headings = extractHeadings(doc.content);
  const showToc = headings.length >= 3;

  return (
    <Container>
      <Link href="/vault" className="mb-3 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden /> Vault
      </Link>
      <header className="jacket mb-6 overflow-hidden rounded-lg border">
        <CategoryRibbon category={doc.category} />
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-micro font-semibold uppercase tracking-label text-muted-foreground">
              <span className="flex items-center gap-1.5 text-accent">
                <CategoryIcon category={doc.category} className="size-4" /> {categoryLabel(doc.category)}
              </span>
              <span>Version {doc.version}</span>
              <span>
                Edited {fmtDate(doc.updatedAt)}
                {doc.updatedBy && ` by ${doc.updatedBy.callsign ?? doc.updatedBy.discordUsername}`}
              </span>
            </p>
            <h1 className="text-2xl font-bold uppercase sm:text-3xl">{doc.title}</h1>
            {doc.summary && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{doc.summary}</p>}
            {mine && (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-sm border border-success/40 bg-success/15 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-success-fg">
                <Check className="size-3.5" aria-hidden /> You qualified {fmtDate(mine.awardedAt)}
              </p>
            )}
          </div>
          {hasPerm(me.perms, "INSTRUCTOR") && (
            <Button asChild variant="outline" size="sm" className="self-start sm:self-end">
              <Link href={`/vault/${doc.slug}/edit`}>
                <Pencil /> Edit
              </Link>
            </Button>
          )}
        </div>
      </header>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <Card className="min-w-0">
          <CardContent className="py-6 sm:px-8">
            {doc.content ? <Markdown>{doc.content}</Markdown> : <p className="text-sm text-muted-foreground">No content yet.</p>}
          </CardContent>
        </Card>
        <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          {showToc && (
            <div className="hidden lg:block">
              <VaultToc headings={headings} />
            </div>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Qualified ({doc.holders.length})</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5">
              {doc.holders.map((h) => (
                <Link key={h.id} href={`/roster/${h.userId}`} className="flex items-center gap-2 text-sm hover:text-accent">
                  <Avatar discordId={h.user.discordId} avatar={h.user.avatar} name={h.user.callsign ?? h.user.discordUsername} size={20} />
                  {h.user.rank && <span className="text-xs text-muted-foreground">{h.user.rank}</span>}
                  {h.user.callsign ?? h.user.discordUsername}
                </Link>
              ))}
              {!doc.holders.length && <p className="text-sm text-muted-foreground">Nobody yet.</p>}
            </CardContent>
          </Card>
          {related.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Related documents</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1.5">
                {related.map((d) => (
                  <Link key={d.id} href={`/library/${d.slug}`} className="text-sm hover:text-accent">
                    {d.title}
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </Container>
  );
}
