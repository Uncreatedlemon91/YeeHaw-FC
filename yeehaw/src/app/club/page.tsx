import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Placeholder } from "@/components/placeholder";

export const metadata = { title: "Club" };

export default async function Page() {
  return (
    <Container>
      <PageHeader eyebrow="Club" title="Club" description="Who we are and how we are doing." />
      <Placeholder title="Club">The club profile, with the stats and league table pages beneath it.</Placeholder>
    </Container>
  );
}
