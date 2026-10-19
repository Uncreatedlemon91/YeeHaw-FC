import type { AttendanceStatus } from "@prisma/client";
import { Check, ClipboardList, MapPin, Pencil, ShieldAlert, Timer, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { RankInsignia } from "@/components/insignia";
import { Container } from "@/components/container";
import { Countdown } from "@/components/countdown";
import { Markdown } from "@/components/markdown";
import { OpsBriefing } from "@/components/ops-briefing";
import { RsvpForm } from "@/components/ops-rsvp";
import { dtg, opNumber } from "@/components/ops-util";
import { ATTENDANCE_LABEL, AttendanceBadge, EventTypeBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { rankIndex, SQUADS } from "@/config/unit";
import { requireUser } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { fmt } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata = { title: "Operation" };

const ORDER: AttendanceStatus[] = ["ATTENDING", "EXCUSED", "ABSENT", "NOSHOW"];

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireUser("OPERATOR", `/ops/${id}`);
  const [event, strength] = await Promise.all([
    prisma.event.findUnique({
      where: { id },
      include: {
        attendances: { include: { user: true } },
        createdBy: true,
        debriefBy: true,
      },
    }),
    prisma.user.count({ where: { status: "ACTIVE" } }),
  ]);
  if (!event) notFound();

  const started = event.startTime < new Date();
  const mine = event.attendances.find((a) => a.userId === me.id);
  const canLead = hasPerm(me.perms, "INSTRUCTOR");
  const count = (s: AttendanceStatus) => event.attendances.filter((a) => a.status === s).length;
  const attending = count("ATTENDING");
  const fill = strength ? Math.min(100, Math.round((attending / strength) * 100)) : 0;

  // Personnel grouped by squad (ORBAT order), attending first, then rank.
  const squadNames = [...SQUADS.map((s) => s.name), "Unassigned"];
  const bySquad = squadNames
    .map((name) => ({
      name,
      list: event.attendances
        .filter((a) => (a.user.squad && SQUADS.some((s) => s.name === a.user.squad) ? a.user.squad : "Unassigned") === name)
        .sort(
          (a, b) =>
            ORDER.indexOf(a.status) - ORDER.indexOf(b.status) ||
            rankIndex(b.user.rank) - rankIndex(a.user.rank) ||
            (a.user.callsign ?? a.user.discordUsername).localeCompare(b.user.callsign ?? b.user.discordUsername),
        ),
    }))
    .filter((g) => g.list.length);

  return (
    <Container>
      {/* OPORD header strip */}
      <div className="jacket mb-6 overflow-hidden rounded-lg border">
        <div className="bg-stamp/15 px-4 py-1 text-center text-micro font-bold uppercase tracking-label text-stamp">
          Unclassified // For unit use only{event.mandatory && " // Mandatory attendance"}
        </div>
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
          <div className="min-w-0">
            <div className="typed mb-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
              <span>
                {event.type === "OP" ? "OPORD" : event.type === "TRAINING" ? "TRNORD" : "BRIEF"} <span className="text-foreground">{opNumber(event.id, event.startTime)}</span>
              </span>
              <span>
                DTG <span className="text-foreground">{dtg(event.startTime)}</span>
              </span>
              <span>{fmt(event.startTime, "EEEE d MMMM yyyy")}</span>
            </div>
            <h1 className="text-2xl font-bold uppercase sm:text-3xl">{event.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <EventTypeBadge type={event.type} />
              {event.mandatory && <Badge variant="destructive">Mandatory</Badge>}
            </div>
          </div>
          {canLead && (
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/ops/${event.id}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
              {started && (
                <Button asChild size="sm">
                  <Link href={`/ops/${event.id}/debrief`}>
                    <ClipboardList /> {event.debrief ? "Revise AAR" : "File AAR"}
                  </Link>
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Sidebar first in the DOM-order sense on mobile: RSVP before the briefing. */}
        <aside className="order-first flex flex-col gap-4 lg:order-last lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>{started ? "Your attendance" : "RSVP"}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {!started && (
                <div className="flex items-baseline justify-between gap-2">
                  <span className="field-label">Time to start</span>
                  <Countdown to={event.startTime} className="typed text-lg font-bold text-accent" />
                </div>
              )}
              {started ? (
                mine ? <AttendanceBadge status={mine.status} /> : <p className="text-sm text-muted-foreground">Not recorded.</p>
              ) : (
                <>
                  <RsvpForm eventId={event.id} status={mine?.status === "ATTENDING" || mine?.status === "ABSENT" ? mine.status : null} />
                  {event.mandatory && mine?.status === "ABSENT" && (
                    <p className="flex items-start gap-1.5 text-xs text-warning">
                      <ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> This is mandatory — let your squad leader know why you can&apos;t attend.
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-4">
              <dl className="flex flex-col gap-3 text-sm">
                <div>
                  <dt className="field-label">Time</dt>
                  <dd className="typed mt-0.5 flex items-center gap-1.5">
                    <Timer className="size-4 text-muted-foreground" aria-hidden /> {fmt(event.startTime, "HH:mm")}
                    {event.endTime && `–${fmt(event.endTime, "HH:mm")}`} {fmt(event.startTime, "zzz")}
                  </dd>
                </div>
                <div>
                  <dt className="field-label">Location</dt>
                  <dd className="mt-0.5 flex items-center gap-1.5">
                    <MapPin className="size-4 text-muted-foreground" aria-hidden /> {event.location ?? "TBC"}
                  </dd>
                </div>
              </dl>
              <div>
                <div className="mb-1.5 flex items-baseline justify-between text-xs">
                  <span className="field-label flex items-center gap-1">
                    <Users className="size-3" aria-hidden /> Slots filled
                  </span>
                  <span className="typed">
                    {attending} / {strength}
                  </span>
                </div>
                <div role="progressbar" aria-valuemin={0} aria-valuemax={strength} aria-valuenow={attending} aria-label="Attending versus active strength" className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${fill}%` }} />
                </div>
                <p className="mt-1 text-micro text-muted-foreground">{fill}% of active strength confirmed</p>
              </div>
            </CardContent>
          </Card>
          {event.createdBy && (
            <p className="text-xs text-muted-foreground">Issued by {event.createdBy.callsign ?? event.createdBy.discordUsername}</p>
          )}
        </aside>

        <div className="flex min-w-0 flex-col gap-6">
          {started && (
            <Card className="overflow-hidden">
              <div className="grid grid-cols-2 divide-x divide-y sm:grid-cols-4 sm:divide-y-0" aria-label="After-action scoreboard" role="group">
                {(
                  [
                    ["ATTENDING", "Attended", "text-success-fg"],
                    ["EXCUSED", "Excused", "text-accent"],
                    ["ABSENT", "Absent", "text-muted-foreground"],
                    ["NOSHOW", "No-show", "text-destructive-fg"],
                  ] as const
                ).map(([s, label, color]) => (
                  <div key={s} className="flex flex-col items-center py-4">
                    <span className={cn("font-display text-4xl font-bold leading-none", color)}>{count(s)}</span>
                    <span className="field-label mt-1.5">{label}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {event.debrief && (
            <Card className="border-accent/40">
              <CardHeader>
                <CardTitle className="text-accent">After-action report</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Filed by {event.debriefBy?.callsign ?? event.debriefBy?.discordUsername ?? "unknown"}
                  {event.debriefAt && ` · ${fmt(event.debriefAt)}`}
                </p>
              </CardHeader>
              <CardContent>
                <Markdown>{event.debrief}</Markdown>
              </CardContent>
            </Card>
          )}

          <section className="jacket rounded-lg border p-5" aria-labelledby="briefing-h">
            <h2 id="briefing-h" className="field-label mb-3">
              Briefing
            </h2>
            {event.description ? <OpsBriefing>{event.description}</OpsBriefing> : <p className="text-sm text-muted-foreground">No briefing yet.</p>}
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Personnel</CardTitle>
            </CardHeader>
            <CardContent>
              {bySquad.length ? (
                <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
                  {bySquad.map((g) => (
                    <div key={g.name} className="min-w-0">
                      <div className="mb-2 flex items-center justify-between border-b pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <span>{g.name}</span>
                        <span className="typed">{g.list.length}</span>
                      </div>
                      <ul className="flex flex-col gap-1.5">
                        {g.list.map((a) => (
                          <li key={a.id}>
                            <Link href={`/roster/${a.userId}`} className="flex min-w-0 items-center gap-2 text-sm hover:text-accent">
                              <RankInsignia rank={a.user.rank} size={20} />
                              <Avatar discordId={a.user.discordId} avatar={a.user.avatar} name={a.user.callsign ?? a.user.discordUsername} size={20} />
                              <span className="min-w-0 flex-1 truncate">{a.user.callsign ?? a.user.discordUsername}</span>
                              <span
                                className={cn(
                                  "flex shrink-0 items-center gap-1 text-micro uppercase",
                                  a.status === "ATTENDING" ? "text-success-fg" : a.status === "NOSHOW" ? "text-destructive-fg" : "text-muted-foreground",
                                )}
                              >
                                {a.status === "ATTENDING" && <Check className="size-3" aria-hidden />}
                                {ATTENDANCE_LABEL[a.status]}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No RSVPs yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Container>
  );
}
