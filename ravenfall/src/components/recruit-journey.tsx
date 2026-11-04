import { Check, ChevronRight } from "lucide-react";
import Link from "next/link";
import { RsvpForm } from "@/components/ops-rsvp";
import { EventTypeBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";
import { recruitEvents, recruitProgress, STAGE_LABEL } from "@/lib/recruit-pipeline";
import { rsvpOf } from "@/lib/rsvp";
import { fmt } from "@/lib/time";
import { cn } from "@/lib/utils";

// The applicant's and Recruit's own view of the pipeline: where they are,
// what's next, and the recruit nights they can sign up for right here.

type Step = { label: string; done: boolean; detail?: React.ReactNode };

function Steps({ steps }: { steps: Step[] }) {
  const current = steps.findIndex((s) => !s.done);
  return (
    <ol className="flex flex-col gap-2.5">
      {steps.map((s, i) => (
        <li key={s.label} aria-current={i === current ? "step" : undefined} className="flex gap-3">
          <span
            className={cn(
              "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
              s.done ? "border-success-fg bg-success/20 text-success-fg" : i === current ? "border-accent text-accent" : "border-border text-muted-foreground",
            )}
          >
            {s.done ? <Check className="size-3.5" aria-hidden /> : i + 1}
          </span>
          <div className="min-w-0">
            <div className={cn("text-sm font-semibold", !s.done && i !== current && "text-muted-foreground")}>{s.label}</div>
            {s.detail && <div className="text-xs text-muted-foreground">{s.detail}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Upcoming recruit nights with an RSVP each. */
async function RecruitNights({ userId }: { userId: string }) {
  const events = await recruitEvents(4);
  if (!events.length) {
    return <p className="text-sm text-muted-foreground">No recruit nights on the calendar yet. Keep an eye on Discord: they&apos;re announced there.</p>;
  }
  const mine = await prisma.attendance.findMany({ where: { userId, eventId: { in: events.map((e) => e.id) } } });
  const statusOf = new Map(mine.map((a) => [a.eventId, a.status]));
  return (
    <ul className="flex flex-col gap-3">
      {events.map((e) => (
        <li key={e.id} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <Link href={`/ops/${e.id}`} className="flex items-center gap-2 font-semibold hover:text-accent">
              {e.title} <ChevronRight className="size-3.5" aria-hidden />
            </Link>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <EventTypeBadge type={e.type} /> {fmt(e.startTime, "EEE d MMM, HH:mm zzz")}
            </div>
          </div>
          <RsvpForm eventId={e.id} status={rsvpOf(statusOf.get(e.id))} className="grid shrink-0 grid-cols-3 gap-1.5" />
        </li>
      ))}
    </ul>
  );
}

/** For an applicant whose application is under review. */
export async function ApplicantJourney({ userId, app }: { userId: string; app: { stage: string; interviewAt: Date | null; createdAt: Date } }) {
  const order = ["APPLIED", "CONTACTED", "INTERVIEW_SET", "INTERVIEWED"];
  const at = order.indexOf(app.stage);
  const steps: Step[] = [
    { label: "Application received", done: true, detail: fmt(app.createdAt, "d MMM yyyy") },
    { label: "A recruiter gets in touch", done: at >= 1, detail: at < 1 ? "Usually within 48 hours, by Discord DM. Keep your DMs open." : undefined },
    {
      label: "Interview",
      done: at >= 3,
      detail: app.interviewAt && at === 2 ? `Set for ${fmt(app.interviewAt, "EEEE d MMM, HH:mm zzz")}, in voice on our Discord.` : "A short chat in voice: who you are and what you're after.",
    },
    { label: "Decision", done: false, detail: "You'll get a DM, your callsign and your roles." },
  ];
  return (
    <div className="flex w-full flex-col gap-6 text-left">
      <Card>
        <CardHeader>
          <CardTitle>Where you are</CardTitle>
        </CardHeader>
        <CardContent>
          <Steps steps={steps} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Recruit nights</CardTitle>
          <CardDescription>Open to applicants: come and meet the unit before your decision. Sign up here.</CardDescription>
        </CardHeader>
        <CardContent>
          <RecruitNights userId={userId} />
        </CardContent>
      </Card>
    </div>
  );
}

/** For a Recruit: enlisted, now training and a first op. Nothing once they're done. */
export async function RecruitChecklist({ userId, unitAccess }: { userId: string; unitAccess: boolean }) {
  const [p] = await recruitProgress({ userIds: [userId] });
  if (!p || (p.trainedAt && p.firstOpAt)) return null;
  const steps: Step[] = [
    { label: STAGE_LABEL.ENLISTED, done: true, detail: p.enlistedAt ? fmt(p.enlistedAt, "d MMM yyyy") : undefined },
    {
      label: "Sign up for a recruit night or training",
      done: !!p.booked || !!p.trainedAt,
      detail: p.booked ? `${p.booked.title}, ${fmt(p.booked.startTime, "EEE d MMM HH:mm")}` : undefined,
    },
    { label: "Pass basic training", done: !!p.trainedAt, detail: p.trainedAt ? fmt(p.trainedAt, "d MMM yyyy") : "Instructors sign it off after the course." },
    {
      label: "Your first op",
      done: !!p.firstOpAt,
      detail: p.firstOpAt ? fmt(p.firstOpAt, "d MMM yyyy") : unitAccess ? (
        <Link href="/ops" className="text-accent underline-offset-4 hover:underline">
          RSVP on the operations calendar
        </Link>
      ) : (
        "Once you're trained, ops open up to you."
      ),
    },
  ];
  return (
    <Card className="border-accent/40">
      <CardHeader>
        <CardTitle>Your next steps</CardTitle>
        <CardDescription>From Recruit to operator. This goes away once you&apos;ve trained and deployed.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Steps steps={steps} />
        {!p.trainedAt && (
          <div>
            <div className="field-label mb-2">Recruit nights & training</div>
            <RecruitNights userId={userId} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
