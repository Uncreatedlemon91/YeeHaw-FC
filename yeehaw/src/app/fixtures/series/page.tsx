import Link from "next/link";
import { ActionForm, SubmitButton, type ActionState } from "@/components/action-form";
import { ConfirmButton } from "@/components/confirm-button";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EVENT_TYPE_LABEL, WEEKDAYS } from "@/config/club";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteSeriesAction, seriesActiveAction } from "./actions";

export const metadata = { title: "Recurring events" };
export const dynamic = "force-dynamic";

export default async function SeriesPage({ searchParams }: { searchParams: Promise<{ made?: string }> }) {
  await requireUser("STAFF", "/fixtures/series");
  const sp = await searchParams;
  const now = new Date();
  const series = await prisma.eventSeries.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    include: { events: { where: { startsAt: { gt: now } }, select: { id: true }, } },
  });
  return (
    <Container size="narrow">
      <PageHeader
        eyebrow="Matchday"
        title="Recurring events"
        description="Nights that repeat. Upcoming occurrences are created four weeks ahead and are ordinary events: sign-ups, reminders and attendance work the same."
        actions={
          <Button asChild>
            <Link href="/fixtures/new?repeat=1">New series</Link>
          </Button>
        }
      />
      {sp.made && <p className="mb-4 rounded border border-success/40 bg-success/10 px-3 py-2 text-sm text-success-fg">Series created: {sp.made} upcoming night{sp.made === "1" ? "" : "s"} scheduled.</p>}
      {series.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">No recurring events yet. A weekly training night is the usual first one.</CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {series.map((s) => (
            <li key={s.id}>
              <Card>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-display text-lg font-bold uppercase">{s.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {EVENT_TYPE_LABEL[s.type]} · {s.weekdays.map((d) => WEEKDAYS[d]).join(", ")} at {s.timeOfDay} · {s.events.length} upcoming
                        {s.announceDaysBefore ? ` · announced ${s.announceDaysBefore}d before` : ""}
                      </p>
                    </div>
                    <Badge variant={s.active ? "success" : "outline"}>{s.active ? "Running" : "Paused"}</Badge>
                  </div>
                  <div className="flex flex-wrap items-start gap-2">
                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/fixtures/series/${s.id}`}>Edit</Link>
                    </Button>
                    <ActionForm action={seriesActiveAction as (p: ActionState, d: FormData) => Promise<ActionState>} className="gap-0">
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="active" value={s.active ? "0" : "1"} />
                      <SubmitButton size="sm" variant="outline">
                        {s.active ? "Pause" : "Resume"}
                      </SubmitButton>
                    </ActionForm>
                    <ActionForm action={deleteSeriesAction as (p: ActionState, d: FormData) => Promise<ActionState>} className="gap-0">
                      <input type="hidden" name="id" value={s.id} />
                      <ConfirmButton size="sm" variant="outline" message="Delete this series and its upcoming unanswered nights?">
                        Delete
                      </ConfirmButton>
                    </ActionForm>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
