import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Placeholder } from "@/components/placeholder";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Tactics" };

export default async function Page() {
  await requireUser("STAFF", "/staff/tactics");
  return (
    <Container>
      <PageHeader eyebrow="Staff" title="Tactics" description="The board: formations and who plays where." />
      <Placeholder title="Tactics">Staff tactics board.</Placeholder>
    </Container>
  );
}
