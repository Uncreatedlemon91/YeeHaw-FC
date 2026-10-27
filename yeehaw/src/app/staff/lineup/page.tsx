import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Placeholder } from "@/components/placeholder";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Lineup" };

export default async function Page() {
  await requireUser("STAFF", "/staff/lineup");
  return (
    <Container>
      <PageHeader eyebrow="Staff" title="Lineup" description="Build and publish the first-choice XI." />
      <Placeholder title="Lineup">The lineup board (same component as tactics), from contracted players only.</Placeholder>
    </Container>
  );
}
