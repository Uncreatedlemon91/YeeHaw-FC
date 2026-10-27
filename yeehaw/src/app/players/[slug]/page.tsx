import { notFound } from "next/navigation";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Placeholder } from "@/components/placeholder";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// The player hub: header, Overview, Contracts, Service record and
// Attendance tabs, with clearance-aware redaction. Built in a later phase;
// for now it proves the Player lookup by slug.
export default async function PlayerHub({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const player = await prisma.player.findUnique({ where: { slug } });
  if (!player) notFound();
  return (
    <Container>
      <PageHeader eyebrow="Player" title={player.displayName} description={player.gamertag ?? undefined} />
      <Placeholder title="Player hub">Stats, contracts, service record and availability land here.</Placeholder>
    </Container>
  );
}
