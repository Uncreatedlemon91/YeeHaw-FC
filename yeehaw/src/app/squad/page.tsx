import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Placeholder } from "@/components/placeholder";

export const metadata = { title: "Squad" };

export default async function Page() {
  return (
    <Container>
      <PageHeader eyebrow="Team" title="Squad" description="The first-choice XI, the bench and the rest of the squad." />
      <Placeholder title="Squad">The pitch with the published lineup, shirt numbers and armbands; the bench; everyone else grouped by squad status.</Placeholder>
    </Container>
  );
}
