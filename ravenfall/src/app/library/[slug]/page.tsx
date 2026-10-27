import { History, Pencil } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Container } from "@/components/container";
import { Markdown } from "@/components/markdown";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { allFolders, canAuthor, canRead, folderChain, getViewer } from "@/lib/library";
import { hasPerm } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/time";
import { ClearanceBadge } from "../clearance";
import { DocCrumbs } from "../doc-crumbs";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = await prisma.libraryDocument.findUnique({ where: { slug }, select: { title: true, clearance: true } });
  // Only public titles go in the tab for guests; the rest is checked below.
  return { title: doc?.clearance === "PUBLIC" ? doc.title : "Library" };
}

export default async function LibraryDoc({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await getViewer();
  const doc = await prisma.libraryDocument.findUnique({ where: { slug }, include: { updatedBy: true, qualifications: { orderBy: { title: "asc" } } } });
  if (!doc) notFound();
  if (!canRead(viewer, doc.clearance)) {
    if (!viewer) redirect(`/login?callbackUrl=${encodeURIComponent(`/library/${slug}`)}`);
    notFound();
  }
  const chain = folderChain(await allFolders(), doc.folderId);

  return (
    <Container className="max-w-4xl">
      <DocCrumbs chain={chain} />
      <PageHeader
        eyebrow={`Library · revision ${doc.revision}`}
        title={doc.title}
        description={doc.summary}
        actions={
          <>
            <ClearanceBadge clearance={doc.clearance} />
            {canAuthor(viewer) && (
              <>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/library/${doc.slug}/history`}>
                    <History /> History
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/library/${doc.slug}/edit`}>
                    <Pencil /> Edit
                  </Link>
                </Button>
              </>
            )}
          </>
        }
      />
      <Card>
        <CardContent className="py-6">
          {doc.content ? <Markdown>{doc.content}</Markdown> : <p className="text-sm text-muted-foreground">No content yet.</p>}
          <p className="mt-8 border-t pt-3 text-xs text-muted-foreground">
            Revision {doc.revision}, updated {fmtDate(doc.updatedAt)}
            {doc.updatedBy && ` by ${doc.updatedBy.callsign ?? doc.updatedBy.discordUsername}`}
          </p>
        </CardContent>
      </Card>
      {/* The vault is operator-only, so guests don't get its links. */}
      {viewer && hasPerm(viewer.perms, "OPERATOR") && doc.qualifications.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Related qualifications</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            {doc.qualifications.map((q) => (
              <Link key={q.id} href={`/vault/${q.slug}`} className="text-sm hover:text-accent">
                {q.title}
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </Container>
  );
}
