import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Container } from "@/components/container";
import { EventFields } from "@/components/event-fields";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toInput } from "@/lib/time";
import { saveEventAction } from "../../actions";

export const metadata = { title: "Edit event" };
export const dynamic = "force-dynamic";

export default async function EditEvent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser("STAFF", `/fixtures/${id}/edit`);
  const e = await prisma.event.findUnique({ where: { id } });
  if (!e) notFound();
  const minutes = e.endsAt ? Math.round((e.endsAt.getTime() - e.startsAt.getTime()) / 60_000) : 120;
  return (
    <Container size="narrow">
      <PageHeader eyebrow="Matchday" title="Edit event" description={e.seriesId ? "Part of a recurring series: editing the series later will rewrite this night's details." : undefined} />
      <Card>
        <CardContent>
          <ActionForm action={saveEventAction}>
            <EventFields defaults={{ id: e.id, title: e.title, type: e.type, opponent: e.opponent, description: e.description, startsAt: toInput(e.startsAt), durationMinutes: minutes, formation: e.formation }} />
            <p className="text-xs text-muted-foreground">Changing the formation clears everyone&apos;s claimed position and the team sheet; they stay signed up. The Discord post is updated.</p>
            <div>
              <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
            </div>
          </ActionForm>
        </CardContent>
      </Card>
    </Container>
  );
}
