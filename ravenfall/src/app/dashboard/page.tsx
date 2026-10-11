import { ChevronRight, ClipboardList, Inbox } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { AttendanceBadge, EventTypeBadge, MemberStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { rankName } from "@/config/unit";
import { requireUser } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { fmt, fmtDate } from "@/lib/time";

export const metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const me = await requireUser(undefined, "/dashboard");
  // Candidates and guests have nothing here yet; their page is /apply.
  if (!hasPerm(me.perms, "OPERATOR")) redirect("/apply");

  const now = new Date();
  const [profile, upcoming, pending, needAar, feed] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: me.id },
      include: { _count: { select: { qualifications: true } } },
    }),
    prisma.event.findMany({
      where: { startTime: { gte: now } },
      orderBy: { startTime: "asc" },
      take: 5,
      include: { attendances: { where: { userId: me.id } } },
    }),
    hasPerm(me.perms, "RECRUITER") ? prisma.recruitmentApplication.count({ where: { status: "PENDING" } }) : 0,
    hasPerm(me.perms, "INSTRUCTOR")
      ? prisma.event.findMany({
          where: { startTime: { lt: now, gte: new Date(now.getTime() - 30 * 864e5) }, debrief: null },
          orderBy: { startTime: "desc" },
        })
      : [],
    prisma.serviceRecord.findMany({
      where: { type: { in: ["ENLISTMENT", "PROMOTION", "AWARD", "QUALIFICATION"] } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { user: true },
    }),
  ]);

  return (
    <Container>
      <PageHeader eyebrow="Dashboard" title={`Welcome back, ${profile.callsign ?? me.name}`} />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-6">
          {(pending > 0 || needAar.length > 0) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {pending > 0 && (
                <Link href="/recruitment" className="flex items-center gap-3 rounded-lg border border-accent/40 bg-accent/10 p-4 hover:bg-accent/15">
                  <Inbox className="size-6 text-accent" />
                  <div>
                    <div className="font-semibold">{pending} pending application{pending === 1 ? "" : "s"}</div>
                    <div className="text-xs text-muted-foreground">Waiting on a recruiter</div>
                  </div>
                </Link>
              )}
              {needAar.length > 0 && (
                <Link href={`/ops/${needAar[0].id}/debrief`} className="flex items-center gap-3 rounded-lg border border-accent/40 bg-accent/10 p-4 hover:bg-accent/15">
                  <ClipboardList className="size-6 text-accent" />
                  <div>
                    <div className="font-semibold">{needAar.length} event{needAar.length === 1 ? "" : "s"} without an AAR</div>
                    <div className="text-xs text-muted-foreground">Latest: {needAar[0].title}</div>
                  </div>
                </Link>
              )}
            </div>
          )}

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Upcoming</CardTitle>
              <Link href="/ops" className="flex items-center text-xs uppercase tracking-wider text-muted-foreground hover:text-accent">
                Calendar <ChevronRight className="size-3.5" />
              </Link>
            </CardHeader>
            <CardContent className="flex flex-col divide-y py-0">
              {upcoming.map((e) => (
                <Link key={e.id} href={`/ops/${e.id}`} className="flex items-center justify-between gap-3 py-3 hover:text-accent">
                  <div>
                    <div className="flex items-center gap-2">
                      <EventTypeBadge type={e.type} />
                      {e.mandatory && <Badge variant="destructive">Mandatory</Badge>}
                    </div>
                    <div className="mt-1 font-semibold">{e.title}</div>
                    <div className="text-xs text-muted-foreground">{fmt(e.startTime)}</div>
                  </div>
                  {e.attendances[0] ? <AttendanceBadge status={e.attendances[0].status} /> : <Badge variant="accent">RSVP</Badge>}
                </Link>
              ))}
              {!upcoming.length && <p className="py-6 text-sm text-muted-foreground">Nothing scheduled.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Unit activity</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {feed.map((r) => (
                <Link key={r.id} href={`/roster/${r.userId}`} className="flex items-center gap-3 text-sm hover:text-accent">
                  <Avatar discordId={r.user.discordId} avatar={r.user.avatar} size={24} />
                  <span>
                    <span className="font-semibold">{r.user.callsign ?? r.user.discordUsername}</span>{" "}
                    <span className="text-muted-foreground">— {r.title}</span>
                  </span>
                  <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground">{fmtDate(r.createdAt)}</span>
                </Link>
              ))}
              {!feed.length && <p className="text-sm text-muted-foreground">No activity yet.</p>}
            </CardContent>
          </Card>
        </div>

        <Card className="self-start">
          <CardContent className="flex flex-col items-center gap-3 py-6 text-center">
            <Avatar discordId={profile.discordId} avatar={profile.avatar} size={72} className="rounded-md" />
            <div>
              <div className="text-xs uppercase tracking-widest text-accent">{profile.rank ? rankName(profile.rank) : "Unranked"}</div>
              <div className="font-display text-2xl font-bold uppercase">{profile.callsign ?? profile.discordUsername}</div>
            </div>
            <MemberStatusBadge status={profile.status} />
            <dl className="grid w-full grid-cols-2 gap-2 border-t pt-4 text-sm">
              <dt className="text-left text-muted-foreground">Squad</dt>
              <dd className="text-right">{profile.squad ?? "—"}</dd>
              <dt className="text-left text-muted-foreground">Role</dt>
              <dd className="text-right">{profile.unitRole ?? "—"}</dd>
              <dt className="text-left text-muted-foreground">Qualifications</dt>
              <dd className="text-right">{profile._count.qualifications}</dd>
            </dl>
            <Link href={`/roster/${profile.id}`} className="text-sm text-accent underline-offset-4 hover:underline">
              View my dossier
            </Link>
          </CardContent>
        </Card>
      </div>
    </Container>
  );
}
