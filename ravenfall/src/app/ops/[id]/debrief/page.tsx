import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/input";
import { DebriefAttendance } from "@/components/ops-debrief-attendance";
import { rankIndex } from "@/config/unit";
import { requireUser } from "@/lib/auth";
import { onLeave } from "@/lib/personnel";
import { prisma } from "@/lib/prisma";
import { fmt } from "@/lib/time";
import { saveDebrief } from "../../actions";

export const metadata = { title: "After-action report" };

const TEMPLATE = `## Summary
What was the mission, and was it achieved?

## Timeline
- 

## What went well
- 

## What to improve
- 

## Commendations
- 
`;

export default async function Debrief({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser("INSTRUCTOR", `/ops/${id}/debrief`);
  const event = await prisma.event.findUnique({ where: { id }, include: { attendances: true } });
  if (!event) notFound();

  // Everyone active, plus anyone who RSVP'd even if they've since gone
  // inactive. RSVPs first so the leader starts from the expected ORBAT.
  const marked = new Map(event.attendances.map((a) => [a.userId, a.status]));
  const people = await prisma.user.findMany({
    where: { OR: [{ status: "ACTIVE" }, { id: { in: [...marked.keys()] } }] },
  });
  // Approved leave covering the start of the op pre-excuses the member.
  const away = await onLeave(people.map((p) => p.id), event.startTime);
  people.sort(
    (a, b) =>
      Number(marked.has(b.id)) - Number(marked.has(a.id)) ||
      rankIndex(b.rank) - rankIndex(a.rank) ||
      (a.callsign ?? a.discordUsername).localeCompare(b.callsign ?? b.discordUsername),
  );

  return (
    <Container size="narrow" className="pb-0">
      <PageHeader eyebrow={`AAR · ${fmt(event.startTime, "d MMM yyyy")}`} title={event.title} />
      <ActionForm action={saveDebrief}>
        <input type="hidden" name="eventId" value={event.id} />
        <Card>
          <CardHeader>
            <CardTitle>Debrief</CardTitle>
          </CardHeader>
          <CardContent>
            <Field label="Report (Markdown)" htmlFor="debrief">
              <Textarea id="debrief" name="debrief" className="min-h-72 font-mono text-xs" defaultValue={event.debrief ?? TEMPLATE} />
            </Field>
          </CardContent>
        </Card>
        <DebriefAttendance
          rows={people.map((p) => ({
            id: p.id,
            name: p.callsign ?? p.discordUsername,
            rank: p.rank,
            rsvp: marked.get(p.id) ?? (away.has(p.id) ? "On leave" : null),
            initial: marked.get(p.id) ?? (away.has(p.id) ? "EXCUSED" : ""),
          }))}
        />
        <div className="sticky bottom-0 z-30 -mx-4 flex items-center justify-between gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur">
          <span className="hidden text-xs text-muted-foreground sm:block">Filing replaces any earlier report and attendance marks.</span>
          <SubmitButton pendingText="Filing…" className="w-full sm:w-auto">
            File report
          </SubmitButton>
        </div>
      </ActionForm>
    </Container>
  );
}
