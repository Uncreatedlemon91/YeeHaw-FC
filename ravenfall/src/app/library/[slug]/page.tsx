import { BookCheck, CheckCircle2, History, Pencil } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Container } from "@/components/container";
import { Markdown } from "@/components/markdown";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { allFolders, canAuthor, canRead, folderChain, getViewer, viewerLevel } from "@/lib/library";
import { hasPerm } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { isRequiredOf } from "@/lib/required-reading";
import { fmtDate } from "@/lib/time";
import { acknowledgeDoc } from "../actions";
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

  // Required reading: shown to members it's required of, with their acknowledgement.
  const me = viewer
    ? await prisma.user.findUnique({
        where: { id: viewer.id },
        select: { id: true, discordId: true, status: true, rank: true, unitRole: true, secondaryRoles: true, squad: true },
      })
    : null;
  const requiredOfMe = !!me && isRequiredOf(doc, me, viewerLevel(viewer));
  const ack = requiredOfMe
    ? await prisma.libraryAcknowledgement.findUnique({
        where: { userId_documentId_ackVersion: { userId: me!.id, documentId: doc.id, ackVersion: doc.ackVersion } },
      })
    : null;

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
      {requiredOfMe && (
        <Card className="mb-6 border-accent/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            {ack ? (
              <p className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="size-5 text-green-400" />
                Required reading: you acknowledged this on {fmtDate(ack.acknowledgedAt)}.
              </p>
            ) : (
              <>
                <p className="flex items-center gap-2 text-sm">
                  <BookCheck className="size-5 text-accent" />
                  Required reading: read this document, then acknowledge it.
                </p>
                <form action={acknowledgeDoc}>
                  <input type="hidden" name="id" value={doc.id} />
                  <input type="hidden" name="ackVersion" value={doc.ackVersion} />
                  <SubmitButton variant="accent">I have read and understood</SubmitButton>
                </form>
              </>
            )}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardContent className="py-6">
          {doc.content ? <Markdown>{doc.content}</Markdown> : <p className="text-sm text-muted-foreground">No content yet.</p>}
          <p className="mt-8 border-t pt-3 text-xs text-muted-foreground">
            Revision {doc.revision}, updated {fmtDate(doc.updatedAt)}
            {doc.updatedBy && ` by ${doc.updatedBy.callsign ?? doc.updatedBy.discordUsername}`}
          </p>
        </CardContent>
      </Card>
      {viewer && hasPerm(viewer.perms, "OPERATOR") && doc.qualifications.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Related qualifications</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            {doc.qualifications.map((q) => (
              <span key={q.id} className="text-sm">
                {q.title}
              </span>
            ))}
          </CardContent>
        </Card>
      )}
    </Container>
  );
}
