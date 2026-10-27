import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/confirm-button";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { deleteDoc, updateDoc } from "../../actions";
import { DocForm } from "../../doc-form";

export const metadata = { title: "Edit document" };

export default async function EditDoc({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await requireUser("INSTRUCTOR", `/vault/${slug}/edit`);
  const doc = await prisma.qualification.findUnique({ where: { slug } });
  if (!doc) notFound();
  return (
    <Container size="narrow">
      <PageHeader
        eyebrow={`Vault · v${doc.version}`}
        title={`Edit: ${doc.title}`}
        actions={
          hasPerm(me.perms, "ADMIN") && (
            <form action={deleteDoc}>
              <input type="hidden" name="id" value={doc.id} />
              <ConfirmButton variant="destructive" size="sm" message="Delete this document? Everyone holding the qualification loses it.">
                Delete
              </ConfirmButton>
            </form>
          )
        }
      />
      <Card>
        <CardContent className="py-6">
          <DocForm action={updateDoc} doc={doc} />
        </CardContent>
      </Card>
    </Container>
  );
}
