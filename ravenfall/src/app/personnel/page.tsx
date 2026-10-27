import { CalendarOff, Medal } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Container } from "@/components/container";
import { RankInsignia } from "@/components/insignia";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { rankIndex } from "@/config/unit";
import { requireUser } from "@/lib/auth";
import { career } from "@/lib/career";
import { hasPerm } from "@/lib/permissions";
import { canDecide, isLeader, leads } from "@/lib/personnel";
import { prisma } from "@/lib/prisma";
import { readingProgress } from "@/lib/required-reading";
import { fmtDate } from "@/lib/time";
import { RequestCard } from "./request-card";

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

  const [open, mine, active, leave] = await Promise.all([
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
    leader
      ? prisma.user.findMany({
          where: { status: "ACTIVE", rank: { not: null } },
          include: {
            qualifications: { include: { qualification: { select: { slug: true } } } },
            serviceRecords: { where: { type: "PROMOTION" }, orderBy: { createdAt: "desc" }, take: 1 },
          },
        })
      : [],
    leader
      ? prisma.personnelRequest.findMany({
          where: { type: "LOA", status: "APPROVED", endDate: { gte: now } },
          include: { user: true },
          orderBy: { startDate: "asc" },
        })
      : [],
  ]);

  const queue = open.filter((r) => canDecide(me, viewer, r, r.user));
  const pending = queue.filter((r) => r.status === "PENDING").length;

  // The promotion board: everyone in scope who meets the next rank's criteria.
  const attended = leader
    ? await prisma.attendance.groupBy({
        by: ["userId"],
        where: { status: "ATTENDING", event: { startTime: { lt: now } }, userId: { in: active.map((u) => u.id) } },
        _count: true,
      })
    : [];
  const ops = new Map(attended.map((a) => [a.userId, a._count]));
  const reading = leader ? await readingProgress(active.filter(covers)) : new Map();
  const board = active
    .filter(covers)
    .map((u) => ({
      u,
      path: career({
        rank: u.rank,
        since: u.rankSince ?? u.serviceRecords[0]?.createdAt ?? u.enlistedAt,
        enlistedAt: u.enlistedAt,
        opsAttended: ops.get(u.id) ?? 0,
        quals: u.qualifications.map((q) => q.qualification.slug),
        reading: reading.get(u.id),
        now,
      }),
    }))
    .filter((b) => b.path.eligible && b.u.id !== me.id)
    .sort((a, b) => rankIndex(b.u.rank) - rankIndex(a.u.rank));
  const away = leave.filter((l) => covers(l.user));

  return (
    <Container>
      <PageHeader
        eyebrow="S1 · Personnel"
        title="S1 Desk"
        description={
          leader
            ? "Billet, callsign and leave requests waiting on you, plus who's ready for promotion and who's away."
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
                  In-tray {pending > 0 && <span className="ml-2 rounded-sm bg-accent px-1.5 text-xs text-accent-foreground">{pending}</span>}
                </CardTitle>
                <CardDescription>
                  {command
                    ? "Everything pending across the unit."
                    : "Billet changes within your squad and its leave requests. Transfers and callsigns go to Command."}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {queue.map((r) => (
                  <RequestCard key={r.id} r={r} decidable showNotes showMember />
                ))}
                {!queue.length && <p className="text-sm text-muted-foreground">Nothing waiting. In-tray clear.</p>}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>My requests</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {mine.map((r) => (
                <RequestCard key={r.id} r={r} own showNotes />
              ))}
              {!mine.length && (
                <p className="text-sm text-muted-foreground">
                  None filed. Request a billet, leave or a new callsign from{" "}
                  <Link href={`/roster/${me.id}?tab=billet`} className="text-accent hover:underline">
                    your file
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
                <CardDescription>Meets every criterion for the next rank. Sergeant and up also need leadership approval.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {board.map(({ u, path }) => (
                  <Link key={u.id} href={`/roster/${u.id}?tab=career`} className="flex items-center gap-3 text-sm hover:text-accent">
                    <RankInsignia rank={u.rank} size={24} />
                    <span className="flex-1">
                      <span className="font-semibold">{u.callsign ?? u.discordUsername}</span>
                      <span className="block text-xs text-muted-foreground">
                        {u.rank} → {path.next?.abbr} · {path.daysInGrade} days in grade
                        {path.needsApproval && " · needs approval"}
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
                      <Avatar discordId={l.user.discordId} avatar={l.user.avatar} size={24} />
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
