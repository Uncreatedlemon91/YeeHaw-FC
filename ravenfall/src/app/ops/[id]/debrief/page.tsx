import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/input";
import { DebriefAttendance } from "@/components/ops-debrief-attendance";
import { rankIndex, rankName } from "@/config/unit";
import { QualBadge } from "@/components/qual-badge";
import { blockers, expiringSoon, heldSlugs, isCurrent } from "@/lib/qual-rules";
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
  const event = await prisma.event.findUnique({
    where: { id },
    include: { attendances: true, course: { include: { prerequisites: { select: { slug: true, title: true } } } } },
  });
  if (!event) notFound();

  // Everyone active, plus anyone who RSVP'd even if they've since gone
  // inactive. RSVPs first so the leader starts from the expected ORBAT.
  const marked = new Map(event.attendances.map((a) => [a.userId, a.status]));
  const people = await prisma.user.findMany({
    where: { OR: [{ status: "ACTIVE" }, { id: { in: [...marked.keys()] } }] },
  });
  // Approved leave covering the start of the op pre-excuses the member.
  const away = await onLeave(people.map((p) => p.id), event.startTime);
  // A course: who can be certified on it, and why not where they can't.
  const course = event.course;
  const courseRows = course
    ? await prisma.userQualification
        .findMany({ where: { userId: { in: people.map((p) => p.id) } }, include: { qualification: { select: { slug: true } } } })
        .then((rows) =>
          people.map((p) => {
            const mine = rows.filter((r) => r.userId === p.id);
            const has = mine.find((r) => r.qualificationId === course.id);
            const why =
              has && isCurrent(has) && !expiringSoon(has)
                ? "Already holds it"
                : blockers(course, { rank: p.rank, held: heldSlugs(mine) }, rankName).join("; ");
            return { id: p.id, name: p.callsign ?? p.discordUsername, why, renew: !!has, rsvp: marked.get(p.id) };
          }),
        )
    : [];
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
            <Field
              label="Public summary (optional)"
              htmlFor="publicSummary"
              help="Two or three sentences for the public home page's Recent operations. Leave blank to keep this op off it. The report above stays internal."
              className="mt-4"
            >
              <Textarea id="publicSummary" name="publicSummary" maxLength={600} className="min-h-20 text-sm" defaultValue={event.publicSummary ?? ""} />
            </Field>
          </CardContent>
        </Card>
        {course && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QualBadge q={course} size={24} /> Course results: {course.title}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Tick who passed. Filing certifies them in {course.title}
                {course.validDays ? ` for ${course.validDays} days` : ""}, but only those marked Attended below.
              </p>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                {courseRows
                  .filter((r) => r.rsvp === "ATTENDING" || r.rsvp === "TENTATIVE" || !r.why)
                  .sort((a, b) => Number(!!a.why) - Number(!!b.why) || Number(b.rsvp === "ATTENDING") - Number(a.rsvp === "ATTENDING"))
                  .map((r) => (
                    <li key={r.id}>
                      <label className={`flex items-start gap-2 text-sm ${r.why ? "text-muted-foreground" : ""}`}>
                        <input type="checkbox" name={`pass:${r.id}`} disabled={!!r.why} className="mt-0.5 size-4 accent-[var(--accent)]" />
                        <span>
                          {r.name}
                          {r.renew && !r.why && <span className="ml-1.5 text-micro uppercase text-accent">recertify</span>}
                          {r.why && <span className="block text-micro">{r.why}</span>}
                        </span>
                      </label>
                    </li>
                  ))}
              </ul>
            </CardContent>
          </Card>
        )}
        <DebriefAttendance
          rows={people.map((p) => ({
            id: p.id,
            name: p.callsign ?? p.discordUsername,
            rank: p.rank,
            rsvp: marked.get(p.id) ?? (away.has(p.id) ? "On leave" : null),
            // "Not sure" is an RSVP, not a mark: the leader decides.
            initial: (marked.get(p.id) !== "TENTATIVE" && marked.get(p.id)) || (away.has(p.id) ? "EXCUSED" : ""),
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
