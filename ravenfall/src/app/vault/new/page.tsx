import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { createDoc } from "../actions";
import { DocForm } from "../doc-form";

export const metadata = { title: "New document" };

export default async function NewDoc() {
  await requireUser("INSTRUCTOR", "/vault/new");
  return (
    <Container className="max-w-4xl">
      <PageHeader eyebrow="Vault" title="New document" />
      <Card>
        <CardContent className="py-6">
          <DocForm action={createDoc} />
        </CardContent>
      </Card>
    </Container>
  );
}
