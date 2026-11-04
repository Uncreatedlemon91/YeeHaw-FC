import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { QualForm } from "../qual-form";

export const metadata = { title: "New qualification" };

export default async function NewQualification() {
  await requireUser("INSTRUCTOR", "/admin/qualifications/new");
  const options = await prisma.qualification.findMany({ orderBy: [{ position: "asc" }, { title: "asc" }], select: { id: true, title: true, category: true } });
  return (
    <Container size="narrow">
      <PageHeader eyebrow="Qualifications" title="New qualification" description="Creates the qualification and a Library document for its manual, in the Qualification manuals folder." />
      <Card>
        <CardContent className="py-6">
          <QualForm prereqIds={[]} options={options} />
        </CardContent>
      </Card>
    </Container>
  );
}
