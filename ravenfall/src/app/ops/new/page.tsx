import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getChannelConfig } from "@/lib/channel-config";
import { createEvent } from "../actions";
import { EventForm } from "../event-form";

export const metadata = { title: "Schedule event" };

export default async function NewEvent() {
  await requireUser("INSTRUCTOR", "/ops/new");
  const [{ ops }, courses] = await Promise.all([
    getChannelConfig(),
    prisma.qualification.findMany({ where: { active: true }, orderBy: [{ position: "asc" }, { title: "asc" }], select: { id: true, title: true } }),
  ]);
  return (
    <Container size="narrow">
      <PageHeader eyebrow="Operations" title="Schedule event" />
      <Card>
        <CardContent className="py-6">
          <EventForm action={createEvent} showAnnounce={!!ops} courses={courses} />
        </CardContent>
      </Card>
    </Container>
  );
}
