import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Placeholder } from "@/components/placeholder";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Availability" };

export default async function Page() {
  await requireUser("MEMBER", "/availability");
  return (
    <Container>
      <PageHeader eyebrow="Members" title="Availability" description="The nights you can play, and when you are away." />
      <Placeholder title="Availability">Your usual nights and away dates.</Placeholder>
    </Container>
  );
}
