import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/confirm-button";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { manualFor } from "@/lib/qualifications";
import { deleteQualification, updateQualification } from "../../../actions";
import { QualificationForm } from "../../../qualification-form";

export const metadata = { title: "Edit qualification" };

export default async function EditQualification({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const me = await requireUser("INSTRUCTOR", `/vault/qualifications/${slug}/edit`);
  const qual = await prisma.qualification.findUnique({ where: { slug } });
  if (!qual) notFound();
  const manual = await manualFor(qual.id);
  return (
    <Container size="narrow">
      <PageHeader
        eyebrow="Qualification"
        title={`Edit: ${qual.title}`}
        actions={
          <>
            {manual && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/library/${manual.slug}/edit`}>Edit manual</Link>
              </Button>
            )}
            {hasPerm(me.perms, "ADMIN") && (
              <form action={deleteQualification}>
                <input type="hidden" name="id" value={qual.id} />
                <ConfirmButton variant="destructive" size="sm" message="Delete this qualification? Everyone holding it loses it. Its Library manual stays.">
                  Delete
                </ConfirmButton>
              </form>
            )}
          </>
        }
      />
      <Card>
        <CardContent className="py-6">
          <QualificationForm action={updateQualification} qualification={qual} />
        </CardContent>
      </Card>
    </Container>
  );
}
