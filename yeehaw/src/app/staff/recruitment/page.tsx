import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Placeholder } from "@/components/placeholder";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Recruitment" };

export default async function Page() {
  await requireUser("STAFF", "/staff/recruitment");
  return (
    <Container>
      <PageHeader eyebrow="Staff" title="Recruitment" description="Prospects, trials and offers." />
      <Placeholder title="Recruitment">The prospect pipeline, ending in a contract offer for the current or next season.</Placeholder>
    </Container>
  );
}
