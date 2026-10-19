import { CalendarClock, ChevronRight, ClipboardList, FileStack, Inbox, MapPin } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { Container } from "@/components/container";
import { Countdown } from "@/components/countdown";
import { RankInsignia } from "@/components/insignia";
import { RsvpForm } from "@/components/ops-rsvp";
import { relDay } from "@/components/ops-util";
import { PageHeader } from "@/components/page-header";
import { AttendanceBadge, EventTypeBadge, MemberStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { rankName } from "@/config/unit";
import { requireUser } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";
import { canDecide, isLeader } from "@/lib/personnel";
import { prisma } from "@/lib/prisma";
import { fmt, fmtDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import { RECORD_STYLE } from "../roster/[id]/record-style";

export const metadata = { title: "Dashboard" };

const ALERT_COLS: Record<number, string> = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3" };

type Rec = { id: string; userId: string; type: keyof typeof RECORD_STYLE; title: string; createdAt: Date; user: { discordId: string; avatar: string | null; callsign: string | null; discordUsername: string } };
type FeedItem = { key: string; recs: Rec[] };

/** Runs of 3+ same-type entries collapse into one row ("5 members enlisted"). */
function collapse(feed: Rec[]): FeedItem[] {
  const out: FeedItem[] = [];
  for (const r of feed) {
    const last = out[out.length - 1];
    if (last && last.recs[0].type === r.type) last.recs.push(r);
    else out.push({ key: r.id, recs: [r] });
  }
  return out.flatMap((g) => (g.recs.length >= 3 ? [g] : g.recs.map((r) => ({ key: r.id, recs: [r] }))));
}

const COLLAPSED: Partial<Record<keyof typeof RECORD_STYLE, string>> = {
  ENLISTMENT: "enlisted",
  PROMOTION: "promoted",
  AWARD: "decorated",
  QUALIFICATION: "qualified",
};

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
      take: 30,
      include: { user: true },
    }),
  ]);

  // Requests waiting on this member as leadership (S1 Desk).
  const s1 =
    hasPerm(me.perms, "ADMIN") || isLeader(profile)
      ? (await prisma.personnelRequest.findMany({ where: { status: "PENDING" }, include: { user: true } })).filter((r) =>
          canDecide(me, profile, r, r.user),
        ).length
      : 0;

  const [next, ...later] = upcoming;
  const items = collapse(feed as Rec[]).slice(0, 8);

  return (
    <Container>
      <PageHeader eyebrow="Dashboard" title={`Welcome back, ${profile.callsign ?? me.name}`} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          {(pending > 0 || needAar.length > 0 || s1 > 0) && (
            <div className={cn("grid gap-3", ALERT_COLS[[pending > 0, s1 > 0, needAar.length > 0].filter(Boolean).length])}>
              {pending > 0 && (
                <Link href="/recruitment" className="flex items-center gap-3 rounded-lg border border-accent/40 bg-accent/10 p-4 hover:bg-accent/15">
                  <Inbox className="size-6 text-accent" />
                  <div>
                    <div className="font-semibold">{pending} pending application{pending === 1 ? "" : "s"}</div>
                    <div className="text-xs text-muted-foreground">Waiting on a recruiter</div>
                  </div>
                </Link>
              )}
              {s1 > 0 && (
                <Link href="/personnel" className="flex items-center gap-3 rounded-lg border border-accent/40 bg-accent/10 p-4 hover:bg-accent/15">
                  <FileStack className="size-6 text-accent" />
                  <div>
                    <div className="font-semibold">{s1} personnel request{s1 === 1 ? "" : "s"}</div>
                    <div className="text-xs text-muted-foreground">Waiting on you at the S1 Desk</div>
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

          {next && (
            <section className="jacket rounded-lg border p-5" aria-label="Next operation">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="field-label flex items-center gap-1.5">
                  <CalendarClock className="size-3.5" aria-hidden /> Next op
                </span>
                <Countdown to={next.startTime} className="typed text-lg font-bold text-accent" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <EventTypeBadge type={next.type} />
                {next.mandatory && <Badge variant="destructive">Mandatory</Badge>}
                {next.attendances[0] && <AttendanceBadge status={next.attendances[0].status} />}
              </div>
              <Link href={`/ops/${next.id}`} className="mt-2 block font-display text-2xl font-bold uppercase leading-tight hover:text-accent">
                {next.title}
              </Link>
              <p className="typed mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  {relDay(next.startTime)} · {fmt(next.startTime, "EEE d MMM, HH:mm zzz")}
                </span>
                {next.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3" aria-hidden /> {next.location}
                  </span>
                )}
              </p>
              <div className="mt-4 flex flex-wrap items-start gap-x-4 gap-y-2">
                <RsvpForm
                  eventId={next.id}
                  status={next.attendances[0]?.status === "ATTENDING" || next.attendances[0]?.status === "ABSENT" ? next.attendances[0].status : null}
                  className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:min-w-72 sm:flex-1 sm:max-w-sm"
                />
                <Link href={`/ops/${next.id}`} className="py-2 text-sm text-accent underline-offset-4 hover:underline">
                  Open briefing
                </Link>
              </div>
            </section>
          )}

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Upcoming</CardTitle>
              <Link href="/ops" className="flex items-center text-xs uppercase tracking-wider text-muted-foreground hover:text-accent">
                Calendar <ChevronRight className="size-3.5" />
              </Link>
            </CardHeader>
            <CardContent className="flex flex-col divide-y py-0">
              {later.map((e) => (
                <Link key={e.id} href={`/ops/${e.id}`} className="flex items-center justify-between gap-3 py-3 hover:text-accent">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <EventTypeBadge type={e.type} />
                      {e.mandatory && <Badge variant="destructive">Mandatory</Badge>}
                    </div>
                    <div className="mt-1 truncate font-semibold">{e.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {relDay(e.startTime)} · {fmt(e.startTime)}
                    </div>
                  </div>
                  {e.attendances[0] ? <AttendanceBadge status={e.attendances[0].status} /> : <Badge variant="accent">RSVP</Badge>}
                </Link>
              ))}
              {!later.length && <p className="py-6 text-sm text-muted-foreground">{next ? "Nothing else scheduled." : "Nothing scheduled."}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Unit activity</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {items.map((g) => {
                const r = g.recs[0];
                const st = RECORD_STYLE[r.type];
                const Icon = st.icon;
                if (g.recs.length > 1) {
                  const last = g.recs[g.recs.length - 1];
                  return (
                    <Link key={g.key} href="/roster" className="flex items-center gap-3 text-sm hover:text-accent">
                      <Icon className={cn("size-4 shrink-0", st.color)} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="font-semibold">{g.recs.length} members</span>{" "}
                        <span className="text-muted-foreground">{COLLAPSED[r.type] ?? st.label.toLowerCase()}</span>
                      </span>
                      <span className="whitespace-nowrap text-xs text-muted-foreground">
                        {fmtDate(last.createdAt) === fmtDate(r.createdAt) ? fmtDate(r.createdAt) : `${fmtDate(last.createdAt)} – ${fmtDate(r.createdAt)}`}
                      </span>
                    </Link>
                  );
                }
                return (
                  <Link key={g.key} href={`/roster/${r.userId}`} className="flex items-center gap-3 text-sm hover:text-accent">
                    <Icon className={cn("size-4 shrink-0", st.color)} aria-label={st.label} />
                    <Avatar discordId={r.user.discordId} avatar={r.user.avatar} name={r.user.callsign ?? r.user.discordUsername} size={24} />
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold">{r.user.callsign ?? r.user.discordUsername}</span>{" "}
                      <span className="text-muted-foreground">— {r.title}</span>
                    </span>
                    <span className="whitespace-nowrap text-xs text-muted-foreground">{fmtDate(r.createdAt)}</span>
                  </Link>
                );
              })}
              {!items.length && <p className="text-sm text-muted-foreground">No activity yet.</p>}
            </CardContent>
          </Card>
        </div>

        <aside className="jacket order-first rounded-lg border p-5 lg:sticky lg:top-20 lg:order-last lg:self-start">
          <div className="flex items-center gap-4 lg:flex-col lg:text-center">
            <Avatar discordId={profile.discordId} avatar={profile.avatar} name={profile.callsign ?? profile.discordUsername} size={72} className="rounded-md" />
            <div className="min-w-0 flex-1 lg:flex-none">
              <div className="flex items-center gap-2 lg:justify-center">
                <RankInsignia rank={profile.rank} size={32} />
                <div className="text-xs uppercase tracking-widest text-accent">{profile.rank ? rankName(profile.rank) : "Unranked"}</div>
              </div>
              <div className="truncate font-display text-2xl font-bold uppercase">{profile.callsign ?? profile.discordUsername}</div>
              <div className="mt-1 lg:flex lg:justify-center">
                <MemberStatusBadge status={profile.status} />
              </div>
            </div>
          </div>
          <dl className="typed mt-4 grid w-full grid-cols-2 gap-2 border-t border-border pt-4 text-sm">
            <dt className="text-left text-muted-foreground">Squad</dt>
            <dd className="text-right">{profile.squad ?? "—"}</dd>
            <dt className="text-left text-muted-foreground">Role</dt>
            <dd className="text-right">{profile.unitRole ?? "—"}</dd>
            <dt className="text-left text-muted-foreground">Qualifications</dt>
            <dd className="text-right">{profile._count.qualifications}</dd>
          </dl>
          <Link href={`/roster/${profile.id}`} className="mt-4 block text-center text-sm text-accent underline-offset-4 hover:underline">
            Open my personnel file
          </Link>
        </aside>
      </div>
    </Container>
  );
}
