import Link from "next/link";
import { notFound } from "next/navigation";
import { History } from "lucide-react";
import { ConfirmButton } from "@/components/confirm-button";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { allFolders, canDelete, canRead, getViewer, qualificationOptions } from "@/lib/library";
import { prisma } from "@/lib/prisma";
import { deleteDoc, updateDoc } from "../../actions";
import { DocForm } from "../../doc-form";

export const metadata = { title: "Edit document" };

export default async function EditDoc({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireUser("INSTRUCTOR", `/library/${slug}/edit`);
  const viewer = (await getViewer())!;
  const doc = await prisma.libraryDocument.findUnique({ where: { slug }, include: { qualifications: { select: { id: true } } } });
  if (!doc || !canRead(viewer, doc.clearance)) notFound();
  return (
    <Container className="max-w-4xl">
      <PageHeader
        eyebrow={`Library · revision ${doc.revision}`}
        title={`Edit: ${doc.title}`}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={`/library/${doc.slug}/history`}>
                <History /> History
              </Link>
            </Button>
            {canDelete(viewer) && (
              <form action={deleteDoc}>
                <input type="hidden" name="id" value={doc.id} />
                <ConfirmButton variant="destructive" size="sm" message="Delete this document and its whole revision history?">
                  Delete
                </ConfirmButton>
              </form>
            )}
          </>
        }
      />
      <Card>
        <CardContent className="py-6">
          <DocForm action={updateDoc} viewer={viewer} folders={await allFolders()} doc={doc} qualifications={await qualificationOptions()} linked={doc.qualifications.map((q) => q.id)} />
        </CardContent>
      </Card>
    </Container>
  );
}
