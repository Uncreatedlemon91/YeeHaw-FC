import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Container } from "@/components/container";
import { SeriesFields } from "@/components/event-fields";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { todayIn } from "@/lib/recurrence";
import { updateSeriesAction } from "../actions";

export const metadata = { title: "Edit series" };
export const dynamic = "force-dynamic";

export default async function EditSeries({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser("STAFF", `/fixtures/series/${id}`);
  const series = await prisma.eventSeries.findUnique({ where: { id } });
  if (!series) notFound();
  return (
    <Container size="narrow">
      <PageHeader
        eyebrow="Matchday"
        title="Edit series"
        description="Saving rewrites the upcoming nights that are still on the schedule from these details. Nights somebody has answered are never deleted: if one no longer fits, it stays as a one-off event."
      />
      <Card>
        <CardContent>
          <ActionForm action={updateSeriesAction.bind(null, id)}>
            <SeriesFields series={series} today={todayIn(env.timezone)} />
            <div>
              <SubmitButton pendingText="Saving…">Save series</SubmitButton>
            </div>
          </ActionForm>
        </CardContent>
      </Card>
    </Container>
  );
}
