import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { createEvent } from "../actions";
import { EventForm } from "../event-form";

export const metadata = { title: "Schedule event" };

export default async function NewEvent() {
  await requireUser("INSTRUCTOR", "/ops/new");
  return (
    <Container className="max-w-3xl">
      <PageHeader eyebrow="Operations" title="Schedule event" />
      <Card>
        <CardContent className="py-6">
          <EventForm action={createEvent} showAnnounce={!!env.opsChannelId} />
        </CardContent>
      </Card>
    </Container>
  );
}
