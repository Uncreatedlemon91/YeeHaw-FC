import { notFound } from "next/navigation";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Placeholder } from "@/components/placeholder";
import { prisma } from "@/lib/prisma";
import { fmt } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function FixturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) notFound();
  return (
    <Container>
      <PageHeader eyebrow="Fixture" title={event.title} description={fmt(event.startsAt)} />
      <Placeholder title="Fixture">Sign-ups, team sheet and match report land here.</Placeholder>
    </Container>
  );
}
