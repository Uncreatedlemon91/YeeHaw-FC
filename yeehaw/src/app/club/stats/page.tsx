import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Placeholder } from "@/components/placeholder";

export const metadata = { title: "Stats" };

export default async function Page() {
  return (
    <Container>
      <PageHeader eyebrow="Club" title="Stats" description="Season totals and per-player lines from EA." />
      <Placeholder title="Stats">Club record, player table and trends, polled hourly from EA.</Placeholder>
    </Container>
  );
}
