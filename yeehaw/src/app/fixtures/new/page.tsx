import { ActionForm, SubmitButton, type ActionState } from "@/components/action-form";
import { Container } from "@/components/container";
import { EventFields, SeriesFields } from "@/components/event-fields";
import { PageHeader } from "@/components/page-header";
import { TabLinks } from "@/components/tab-links";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { todayIn } from "@/lib/recurrence";
import { loadTactics } from "@/lib/tactics";
import { createSeriesAction } from "../series/actions";
import { saveEventAction } from "../actions";

export const metadata = { title: "Schedule an event" };
export const dynamic = "force-dynamic";

// One-off events and recurring series share this page; ?repeat=1 switches.
export default async function NewEvent({ searchParams }: { searchParams: Promise<{ repeat?: string; type?: string }> }) {
  await requireUser("STAFF", "/fixtures/new");
  const sp = await searchParams;
  const repeat = sp.repeat === "1";
  const suggested = (await loadTactics()).active;
  return (
    <Container size="narrow">
      <PageHeader eyebrow="Matchday" title="Schedule an event" description="A match, scrim, tournament, community night or training session. Times are club time." />
      <TabLinks
        label="Kind of event"
        items={[
          { href: "/fixtures/new", label: "One-off", active: !repeat },
          { href: "/fixtures/new?repeat=1", label: "Repeats weekly", active: repeat },
        ]}
      />
      <Card>
        <CardContent>
          {repeat ? (
            <ActionForm action={createSeriesAction as (p: ActionState, d: FormData) => Promise<ActionState>}>
              <SeriesFields suggestedFormation={suggested} today={todayIn(env.timezone)} />
              <p className="text-xs text-muted-foreground">The next four weeks are created now and kept four weeks ahead each hour. Edit the series later to change upcoming nights.</p>
              <div>
                <SubmitButton pendingText="Creating…">Create series</SubmitButton>
              </div>
            </ActionForm>
          ) : (
            <ActionForm action={saveEventAction}>
              <EventFields creating suggestedFormation={suggested} defaults={sp.type ? { type: sp.type } : {}} />
              <div>
                <SubmitButton pendingText="Saving…">Schedule event</SubmitButton>
              </div>
            </ActionForm>
          )}
        </CardContent>
      </Card>
    </Container>
  );
}
