import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Placeholder } from "@/components/placeholder";

export const metadata = { title: "Fixtures" };

export default async function Page() {
  return (
    <Container>
      <PageHeader eyebrow="Matchday" title="Fixtures" description="What is coming up and how it went." />
      <Placeholder title="Fixtures">Scheduled matches, scrims and training, with RSVP, formation sign-ups and post-match reports.</Placeholder>
    </Container>
  );
}
