import { ArrowRight, Award, CalendarOff, Hourglass, Medal, UserX } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Container } from "@/components/container";
import { RankInsignia } from "@/components/insignia";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { canDecideNomination } from "@/lib/award-service";
import { requireUser } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";
import { canDecide, isLeader, leads } from "@/lib/personnel";
import { prisma } from "@/lib/prisma";
import { promotionStatus } from "@/lib/promotions";
import { rankIndex } from "@/config/unit";
import { fmtDate } from "@/lib/time";
import { NominationCard } from "./nomination-card";
import { RequestCard } from "./request-card";
import { CheckInButton } from "./check-in-button";
import { inactiveMembers, INACTIVE_DAYS } from "@/lib/inactivity";

export const metadata = { title: "S1 Desk" };
export const dynamic = "force-dynamic";

export default async function S1Desk() {
  const me = await requireUser("OPERATOR", "/personnel");
  const viewer = await prisma.user.findUnique({ where: { id: me.id } });
  const command = hasPerm(me.perms, "ADMIN");
  const leader = command || isLeader(viewer);
  const now = new Date();
  // Members whose files this viewer works: Command sees everyone, leaders
  // their own squad (a Command billet leads every squad).
  const covers = (u: { squad: string | null }) => command || leads(viewer, u.squad);

  // Award nominations: Command works the queue, leaders see how their own fared.
  const nominationInclude = { award: true, nominee: true, nominatedBy: true, decidedBy: true, event: { select: { id: true, title: true } } } as const;
  const weekAgo = new Date(now.getTime() - 7 * 864e5);
  const nominations = command
    ? await prisma.awardNomination.findMany({
        where: { OR: [{ status: "PENDING" }, { decidedAt: { gte: weekAgo } }] },
        include: nominationInclude,
        orderBy: { createdAt: "desc" },
        take: 100,
      })
    : leader
      ? await prisma.awardNomination.findMany({
          where: { nominatedById: me.id, OR: [{ status: "PENDING" }, { decidedAt: { gte: weekAgo } }] },
          include: nominationInclude,
          orderBy: { createdAt: "desc" },
          take: 30,
        })
      : [];
  const nominationsPending = nominations.filter((n) => n.status === "PENDING").length;

  const [open, mine, status, leave, departed, dormant] = await Promise.all([
    leader
      ? prisma.personnelRequest.findMany({
          // Pending, plus anything decided this week, so a decision stays on
          // screen with its outcome instead of vanishing.
          where: { OR: [{ status: "PENDING" }, { decidedAt: { gte: new Date(now.getTime() - 7 * 864e5) }, status: { not: "CANCELLED" } }] },
          include: { user: true, reviewedBy: true },
          orderBy: { createdAt: "desc" },
          take: 100,
        })
      : [],
    prisma.personnelRequest.findMany({
      where: { userId: me.id },
      include: { reviewedBy: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    leader ? promotionStatus({}, now) : [],
    leader
      ? prisma.personnelRequest.findMany({
          where: { type: "LOA", status: "APPROVED", endDate: { gte: now } },
          include: { user: true },
          orderBy: { startDate: "asc" },
        })
      : [],
    // Left the Discord server but still on the books (src/lib/member-left.ts).
    leader
      ? prisma.user.findMany({ where: { leftDiscordAt: { not: null }, status: { not: "DISCHARGED" } }, orderBy: { leftDiscordAt: "desc" } })
      : [],
    leader ? inactiveMembers(now) : [],
  ]);

  const queue = open.filter((r) => canDecide(me, viewer, r, r.user));
  const pending = queue.filter((r) => r.status === "PENDING").length;

  // The promotion board: everyone in scope who meets the next rank's criteria.
  const board = status
    .filter((b) => covers(b.u) && b.path.eligible && b.u.id !== me.id)
    .sort((a, b) => rankIndex(b.u.rank) - rankIndex(a.u.rank));
  const away = leave.filter((l) => covers(l.user));
  const left = departed.filter(covers);
  const quiet = dormant.filter(covers);
  const daysAgo = (d: Date) => Math.max(0, Math.floor((now.getTime() - d.getTime()) / 864e5));

  return (
    <Container>
      <PageHeader
        eyebrow="S1 · Personnel"
        title="S1 Desk"
        description={
          leader
            ? "Billet, interest, callsign, leave and promotion requests waiting on you, plus who's ready for promotion and who's away."
            : "Your personnel actions. File new requests from your personnel file."
        }
        actions={
          <Link href={`/roster/${me.id}?tab=requests`} className="text-sm text-accent underline-offset-4 hover:underline">
            Open my file
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-6">
          {leader && (
            <Card>
              <CardHeader>
                <CardTitle>
                  In-tray {pending > 0 && <Badge variant="accent" className="ml-2">{pending}</Badge>}
                </CardTitle>
                <CardDescription>
                  {command
                    ? "Everything pending across the unit."
                    : "Billet changes and interest in vacant billets within your squad, and its leave requests. Transfers, callsigns and promotions go to Command."}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col divide-y divide-foreground/10">
                {queue.map((r) => (
                  <RequestCard key={r.id} r={r} decidable showNotes showMember flush />
                ))}
                {!queue.length && <p className="text-sm text-muted-foreground">Nothing waiting. In-tray clear.</p>}
              </CardContent>
            </Card>
          )}

          {leader && left.length > 0 && (
            <Card id="left-discord" className="scroll-mt-20 border-warning/40">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserX className="size-4 text-warning" /> Left Discord <Badge variant="warning">{left.length}</Badge>
                </CardTitle>
                <CardDescription>
                  No longer on the Discord server but still on the roster. {command ? "Discharge them from their file" : "Command can discharge them"} if
                  they&apos;ve gone for good; they drop off this list if they rejoin.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col divide-y divide-foreground/10">
                {left.map((u) => (
                  <Link key={u.id} href={`/roster/${u.id}`} className="flex min-w-0 items-center gap-3 py-2 text-sm first:pt-0 last:pb-0 hover:text-accent">
                    <RankInsignia rank={u.rank} size={20} />
                    <Avatar discordId={u.discordId} avatar={u.avatar} name={u.callsign ?? u.discordUsername} size={24} />
                    <span className="min-w-0 flex-1 truncate">
                      {u.callsign ?? u.discordUsername}
                      <span className="ml-2 text-xs text-muted-foreground">{[u.squad, u.unitRole].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">left {fmtDate(u.leftDiscordAt!)}</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {leader && quiet.length > 0 && (
            <Card id="inactive" className="scroll-mt-20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Hourglass className="size-4 text-muted-foreground" /> Gone quiet <Badge variant="outline">{quiet.length}</Badge>
                </CardTitle>
                <CardDescription>
                  Active members with no RSVP or attendance in {INACTIVE_DAYS} days, not on leave. A check-in DM asks how they are and points them at leave; one a week each.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col divide-y divide-foreground/10">
                {quiet.map((u) => (
                  <div key={u.id} className="flex min-w-0 items-center gap-3 py-2 text-sm first:pt-0 last:pb-0">
                    <Link href={`/roster/${u.id}`} className="flex min-w-0 flex-1 items-center gap-3 hover:text-accent">
                      <RankInsignia rank={u.rank} size={20} />
                      <Avatar discordId={u.discordId} avatar={u.avatar} name={u.callsign ?? u.discordUsername} size={24} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{u.callsign ?? u.discordUsername}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[
                            u.squad,
                            u.lastEvent ? `last event ${daysAgo(u.lastEvent)}d ago` : "never attended",
                            u.lastLoginAt ? `site ${daysAgo(u.lastLoginAt)}d ago` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    </Link>
                    <CheckInButton userId={u.id} sentLabel={u.coolingDown && u.checkInAt ? `Checked in ${daysAgo(u.checkInAt) || "<1"}d ago` : null} />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {leader && (
            <Card id="awards" className="scroll-mt-20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="size-4 text-accent" /> Awards
                  {nominationsPending > 0 && <Badge variant="accent">{nominationsPending}</Badge>}
                </CardTitle>
                <CardDescription>
                  {command
                    ? "Nominations from squad leadership and Command, and automatic ones from the award rules. You can't decide your own nomination or one about you."
                    : "Your nominations and how Command decided them. Nominate from a member's personnel file."}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col divide-y divide-foreground/10">
                {nominations.map((n) => (
                  <NominationCard
                    key={n.id}
                    n={n}
                    decidable={command}
                    blocked={command && !canDecideNomination(me.perms, me.id, n) ? "Another member of Command has to decide this one." : undefined}
                  />
                ))}
                {!nominations.length && <p className="text-sm text-muted-foreground">{command ? "No nominations waiting." : "No nominations this week."}</p>}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>My requests</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col divide-y divide-foreground/10">
              {mine.map((r) => (
                <RequestCard key={r.id} r={r} own showNotes flush />
              ))}
              {!mine.length && (
                <p className="text-sm text-muted-foreground">
                  None filed. Request a billet, leave or a new callsign from{" "}
                  <Link href={`/roster/${me.id}?tab=billet`} className="text-accent hover:underline">
                    your file
                  </Link>
                  , or volunteer for a vacant billet from the{" "}
                  <Link href="/roster" className="text-accent hover:underline">
                    roster
                  </Link>
                  .
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {leader && (
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Medal className="size-4 text-accent" /> Promotion board
                </CardTitle>
                <CardDescription>Meets every criterion for the next rank. Each gets a promotion request in the in-tray for Command to approve.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {board.map(({ u, path }) => (
                  <Link key={u.id} href={`/roster/${u.id}?tab=career`} className="flex items-center gap-3 text-sm hover:text-accent">
                    <span className="flex shrink-0 items-center gap-0.5" aria-label={`${u.rank} to ${path.next?.abbr}`}>
                      <RankInsignia rank={u.rank} size={26} className="opacity-70" />
                      <ArrowRight className="size-3 text-muted-foreground" aria-hidden />
                      <RankInsignia rank={path.next?.abbr} size={30} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold">{u.callsign ?? u.discordUsername}</span>
                      <span className="block text-xs text-muted-foreground">
                        {u.rank} → {path.next?.abbr} · {path.daysInGrade} days in grade
                      </span>
                    </span>
                  </Link>
                ))}
                {!board.length && <p className="text-sm text-muted-foreground">Nobody eligible right now.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarOff className="size-4 text-accent" /> Leave roster
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {away.map((l) => {
                  const current = l.startDate! <= now;
                  return (
                    <Link key={l.id} href={`/roster/${l.userId}?tab=requests`} className="flex items-center gap-3 text-sm hover:text-accent">
                      <Avatar discordId={l.user.discordId} avatar={l.user.avatar} name={l.user.callsign ?? l.user.discordUsername} size={24} />
                      <span className="flex-1">
                        <span className="font-semibold">{l.user.callsign ?? l.user.discordUsername}</span>
                        <span className="typed block text-xs text-muted-foreground">
                          {fmtDate(l.startDate!)} – {fmtDate(l.endDate!)}
                        </span>
                      </span>
                      <span className={current ? "text-xs uppercase tracking-wider text-accent" : "text-xs uppercase tracking-wider text-muted-foreground"}>
                        {current ? "Away" : "Upcoming"}
                      </span>
                    </Link>
                  );
                })}
                {!away.length && <p className="text-sm text-muted-foreground">Everyone present.</p>}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </Container>
  );
}
