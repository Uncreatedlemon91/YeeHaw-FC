import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Placeholder } from "@/components/placeholder";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Training" };

export default async function Page() {
  await requireUser("MEMBER", "/training");
  return (
    <Container>
      <PageHeader eyebrow="Members" title="Training" description="Sessions, plans and what to work on next." />
      <Placeholder title="Training">Training and theory sessions, role briefs and your suggestions.</Placeholder>
    </Container>
  );
}
