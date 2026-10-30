import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { createQualification } from "../../actions";
import { QualificationForm } from "../../qualification-form";

export const metadata = { title: "New qualification" };

export default async function NewQualification() {
  await requireUser("INSTRUCTOR", "/vault/qualifications/new");
  return (
    <Container size="narrow">
      <PageHeader eyebrow="Awards" title="New qualification" description="Creates the qualification and a Library document for its manual, in the Qualification manuals folder." />
      <Card>
        <CardContent className="py-6">
          <QualificationForm action={createQualification} />
        </CardContent>
      </Card>
    </Container>
  );
}
