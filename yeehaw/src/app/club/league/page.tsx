import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Placeholder } from "@/components/placeholder";

export const metadata = { title: "League table" };

export default async function Page() {
  return (
    <Container>
      <PageHeader eyebrow="Club" title="League table" description="Every club we have played, ranked." />
      <Placeholder title="League table">The auto-built table of tracked opponents.</Placeholder>
    </Container>
  );
}
