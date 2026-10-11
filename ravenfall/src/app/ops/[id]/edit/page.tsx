import { notFound } from "next/navigation";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { ConfirmButton } from "@/components/confirm-button";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { deleteEvent, updateEvent } from "../../actions";
import { EventForm } from "../../event-form";

export const metadata = { title: "Edit event" };

export default async function EditEvent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireUser("INSTRUCTOR", `/ops/${id}/edit`);
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) notFound();
  return (
    <Container className="max-w-3xl">
      <PageHeader
        eyebrow="Operations"
        title={`Edit: ${event.title}`}
        actions={
          hasPerm(me.perms, "ADMIN") && (
            <form action={deleteEvent}>
              <input type="hidden" name="id" value={event.id} />
              <ConfirmButton variant="destructive" size="sm" message="Delete this event and all its attendance records?">
                Delete event
              </ConfirmButton>
            </form>
          )
        }
      />
      <Card>
        <CardContent className="py-6">
          <EventForm action={updateEvent} event={event} />
        </CardContent>
      </Card>
    </Container>
  );
}
