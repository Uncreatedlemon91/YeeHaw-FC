import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Select, Textarea } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
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
    <Container className="max-w-4xl">
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
        <Card>
          <CardHeader>
            <CardTitle>Attendance</CardTitle>
            <p className="text-sm text-muted-foreground">
              Pre-filled from RSVPs. Set what actually happened; leave a member blank to keep them off the record.
            </p>
          </CardHeader>
          <Table>
            <THead>
              <TR>
                <TH>Member</TH>
                <TH>RSVP</TH>
                <TH className="w-44">Final</TH>
              </TR>
            </THead>
            <TBody>
              {people.map((p) => (
                <TR key={p.id}>
                  <TD>
                    {p.rank && <span className="mr-2 text-xs text-muted-foreground">{p.rank}</span>}
                    <span className="font-semibold">{p.callsign ?? p.discordUsername}</span>
                  </TD>
                  <TD className="text-xs text-muted-foreground">{marked.get(p.id) ?? (away.has(p.id) ? "On leave" : "—")}</TD>
                  <TD>
                    <Select name={`att:${p.id}`} defaultValue={marked.get(p.id) ?? (away.has(p.id) ? "EXCUSED" : "")} className="h-8">
                      <option value="">—</option>
                      <option value="ATTENDING">Attended</option>
                      <option value="EXCUSED">Excused</option>
                      <option value="ABSENT">Absent</option>
                      <option value="NOSHOW">No-show</option>
                    </Select>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
        <SubmitButton variant="accent" className="self-start">
          File report
        </SubmitButton>
      </ActionForm>
    </Container>
  );
}
