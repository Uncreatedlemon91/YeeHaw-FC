import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { allFolders, getViewer, qualificationOptions } from "@/lib/library";
import { createDoc } from "../actions";
import { DocForm } from "../doc-form";

export const metadata = { title: "New document" };

export default async function NewDoc({ searchParams }: { searchParams: Promise<{ folder?: string }> }) {
  const { folder } = await searchParams;
  await requireUser("INSTRUCTOR", "/library/new");
  const viewer = (await getViewer())!;
  return (
    <Container className="max-w-4xl">
      <PageHeader eyebrow="Library" title="New document" />
      <Card>
        <CardContent className="py-6">
          <DocForm action={createDoc} viewer={viewer} folders={await allFolders()} folderId={folder} qualifications={await qualificationOptions()} />
        </CardContent>
      </Card>
    </Container>
  );
}
