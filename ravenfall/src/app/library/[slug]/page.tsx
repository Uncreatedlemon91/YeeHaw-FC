import { History, Pencil } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Container } from "@/components/container";
import { Markdown } from "@/components/markdown";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { allFolders, canAuthor, canRead, folderChain, getViewer } from "@/lib/library";
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
  const doc = await prisma.libraryDocument.findUnique({ where: { slug }, include: { updatedBy: true } });
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
    </Container>
  );
}
