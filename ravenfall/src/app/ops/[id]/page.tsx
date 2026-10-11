import type { AttendanceStatus } from "@prisma/client";
import { Check, ClipboardList, MapPin, Pencil, Timer, X } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { Container } from "@/components/container";
import { Markdown } from "@/components/markdown";
import { PageHeader } from "@/components/page-header";
import { ATTENDANCE_LABEL, AttendanceBadge, EventTypeBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { fmt } from "@/lib/time";
import { rsvp } from "../actions";

export const metadata = { title: "Operation" };

const ORDER: AttendanceStatus[] = ["ATTENDING", "EXCUSED", "ABSENT", "NOSHOW"];

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireUser("OPERATOR", `/ops/${id}`);
  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      attendances: { include: { user: true } },
      createdBy: true,
      debriefBy: true,
    },
  });
  if (!event) notFound();

  const started = event.startTime < new Date();
  const mine = event.attendances.find((a) => a.userId === me.id);
  const canLead = hasPerm(me.perms, "INSTRUCTOR");
  const groups = ORDER.map((s) => ({ status: s, list: event.attendances.filter((a) => a.status === s) })).filter((g) => g.list.length);

  return (
    <Container className="max-w-5xl">
      <PageHeader
        eyebrow={fmt(event.startTime, "EEEE d MMMM yyyy")}
        title={event.title}
        actions={
          canLead && (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href={`/ops/${event.id}/edit`}>
                  <Pencil /> Edit
                </Link>
              </Button>
              {started && (
                <Button asChild size="sm" variant="accent">
                  <Link href={`/ops/${event.id}/debrief`}>
                    <ClipboardList /> {event.debrief ? "Revise AAR" : "File AAR"}
                  </Link>
                </Button>
              )}
            </>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            <EventTypeBadge type={event.type} />
            {event.mandatory && <Badge variant="destructive">Mandatory</Badge>}
            <span className="flex items-center gap-1.5">
              <Timer className="size-4" /> {fmt(event.startTime, "HH:mm")}
              {event.endTime && `–${fmt(event.endTime, "HH:mm")}`} {fmt(event.startTime, "zzz")}
            </span>
            {event.location && (
              <span className="flex items-center gap-1.5">
                <MapPin className="size-4" /> {event.location}
              </span>
            )}
          </div>

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

          <Card>
            <CardHeader>
              <CardTitle>Briefing</CardTitle>
            </CardHeader>
            <CardContent>
              {event.description ? <Markdown>{event.description}</Markdown> : <p className="text-sm text-muted-foreground">No briefing yet.</p>}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{started ? "Your attendance" : "RSVP"}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {started ? (
                mine ? <AttendanceBadge status={mine.status} /> : <p className="text-sm text-muted-foreground">Not recorded.</p>
              ) : (
                <>
                  <form action={rsvp} className="grid grid-cols-2 gap-2">
                    <input type="hidden" name="eventId" value={event.id} />
                    <Button name="status" value="ATTENDING" variant={mine?.status === "ATTENDING" ? "default" : "outline"}>
                      <Check /> Attending
                    </Button>
                    <Button name="status" value="ABSENT" variant={mine?.status === "ABSENT" ? "destructive" : "outline"}>
                      <X /> Can&apos;t make it
                    </Button>
                    {mine && (
                      <Button name="status" value="CLEAR" variant="link" size="sm" className="col-span-2">
                        Clear my RSVP
                      </Button>
                    )}
                  </form>
                  {event.mandatory && mine?.status === "ABSENT" && (
                    <p className="text-xs text-accent">This is mandatory — let your squad leader know why you can&apos;t attend.</p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Personnel</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {groups.length ? (
                groups.map((g) => (
                  <div key={g.status}>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {ATTENDANCE_LABEL[g.status]} ({g.list.length})
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {g.list.map((a) => (
                        <Link key={a.id} href={`/roster/${a.userId}`} className="flex items-center gap-2 text-sm hover:text-accent">
                          <Avatar discordId={a.user.discordId} avatar={a.user.avatar} size={20} />
                          {a.user.rank && <span className="text-xs text-muted-foreground">{a.user.rank}</span>}
                          {a.user.callsign ?? a.user.discordUsername}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No RSVPs yet.</p>
              )}
            </CardContent>
          </Card>
          {event.createdBy && (
            <p className="text-xs text-muted-foreground">
              Scheduled by {event.createdBy.callsign ?? event.createdBy.discordUsername}
            </p>
          )}
        </div>
      </div>
    </Container>
  );
}
