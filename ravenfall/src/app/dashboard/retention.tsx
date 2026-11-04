import { Flame, GraduationCap, Trophy } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { RankInsignia } from "@/components/insignia";
import { RsvpForm } from "@/components/ops-rsvp";
import { QualBadge } from "@/components/qual-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { nextRank, type RibbonCell, serviceStats, squadLeaderboard, topThisMonth } from "@/lib/member-stats";
import { rsvpOf } from "@/lib/rsvp";
import { fmt } from "@/lib/time";
import { coursesFor } from "@/lib/training";
import { cn } from "@/lib/utils";

// The dashboard's reasons to come back: your streak and record, how close
// the next rank is, training you need, and how your squad is doing.

const CELL: Record<RibbonCell["mark"], string> = {
  attended: "bg-success-fg border-success-fg",
  excused: "bg-accent/40 border-accent",
  missed: "bg-transparent border-destructive-fg",
};
const MARK_LABEL: Record<RibbonCell["mark"], string> = { attended: "attended", excused: "excused", missed: "missed" };

function eta(days: number | null): string {
  if (days === null) return "";
  if (days <= 0) return "Criteria met";
  if (days < 14) return `About ${days} day${days === 1 ? "" : "s"} at your pace`;
  if (days < 70) return `About ${Math.round(days / 7)} weeks at your pace`;
  return `About ${Math.round(days / 30)} months at your pace`;
}

export async function ServiceCard({ userId }: { userId: string }) {
  const [s, next] = await Promise.all([serviceStats(userId), nextRank(userId)]);
  const tiles = [
    { label: "Streak", value: s.streak, sub: s.best > s.streak ? `best ${s.best}` : s.streak ? "your best" : "attend to start one", icon: <Flame className={cn("size-4", s.streak >= 3 ? "text-warning" : "text-muted-foreground")} aria-hidden /> },
    { label: "This month", value: s.opsThisMonth, sub: `event${s.opsThisMonth === 1 ? "" : "s"} attended` },
    { label: "Turnout", value: s.rate === null ? "—" : `${s.rate}%`, sub: "last 90 days" },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your service</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-3 gap-2">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-md border bg-background/40 p-3">
              <div className="field-label flex items-center gap-1">
                {t.icon}
                {t.label}
              </div>
              <div className="mt-1 font-display text-3xl font-bold leading-none">{t.value}</div>
              <div className="mt-1 text-micro text-muted-foreground">{t.sub}</div>
            </div>
          ))}
        </div>

        {s.ribbon.length > 0 && (
          <div>
            <div className="field-label mb-1.5">Service ribbon · last {s.ribbon.length}</div>
            <ol className="flex gap-1" aria-label="Recent events, oldest first">
              {s.ribbon.map((c) => (
                <li key={c.id} className="flex-1">
                  <Link
                    href={`/ops/${c.id}`}
                    title={`${c.title}, ${fmt(c.startTime, "d MMM")}: ${MARK_LABEL[c.mark]}`}
                    aria-label={`${c.title}, ${fmt(c.startTime, "d MMM")}: ${MARK_LABEL[c.mark]}`}
                    className={cn("block h-5 rounded-sm border-2 hover:opacity-80", CELL[c.mark])}
                  />
                </li>
              ))}
            </ol>
            <p className="mt-1.5 flex gap-3 text-micro text-muted-foreground">
              <span className="flex items-center gap-1"><span className={cn("size-2.5 rounded-sm border-2", CELL.attended)} />attended</span>
              <span className="flex items-center gap-1"><span className={cn("size-2.5 rounded-sm border-2", CELL.excused)} />excused</span>
              <span className="flex items-center gap-1"><span className={cn("size-2.5 rounded-sm border-2", CELL.missed)} />missed</span>
            </p>
          </div>
        )}

        {next && (
          <div className="border-t pt-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <RankInsignia rank={next.abbr} size={24} />
                <div>
                  <div className="field-label">Next rank</div>
                  <div className="font-semibold">{next.name}</div>
                </div>
              </div>
              <span className="text-right text-xs text-muted-foreground">
                {next.eligible ? (next.needsApproval ? "Ready: waiting on leadership" : "Ready: promotion on its way") : eta(next.etaDays)}
              </span>
            </div>
            <ul className="mt-3 flex flex-col gap-2">
              {next.checks
                .filter((c) => c.detail !== "approval")
                .map((c) => (
                  <li key={c.label} className="text-xs">
                    <div className="flex justify-between gap-2">
                      <span className={c.ok ? "text-muted-foreground" : ""}>{c.label}</span>
                      <span className="typed">{c.detail === "qualification" ? (c.ok ? "held" : "needed") : `${Math.min(c.have, c.need)}/${c.need}`}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div className={cn("h-full rounded-full", c.ok ? "bg-success-fg" : "bg-primary")} style={{ width: `${Math.min(100, Math.round((c.have / Math.max(1, c.need)) * 100))}%` }} />
                    </div>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const WHY = { billet: "Your billet needs it", promotion: "Your next rank needs it", recertify: "Time to recertify" } as const;

export async function TrainingForYou({ userId }: { userId: string }) {
  const courses = (await coursesFor(userId)).slice(0, 3);
  if (!courses.length) return null;
  return (
    <Card className="border-accent/40">
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="size-4 text-accent" aria-hidden /> Training for you
          </CardTitle>
          <CardDescription>Courses for qualifications you need. Pass one and it&apos;s on your file.</CardDescription>
        </div>
        <Link href="/ops?view=training" className="text-xs uppercase tracking-wider text-muted-foreground hover:text-accent">
          All training
        </Link>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {courses.map(({ event: e, why }) => (
          <div key={e.id} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              {e.course && <QualBadge q={e.course} size={32} />}
              <div className="min-w-0">
                <Link href={`/ops/${e.id}`} className="block truncate font-semibold hover:text-accent">
                  {e.title}
                </Link>
                <div className="text-xs text-muted-foreground">
                  {fmt(e.startTime, "EEE d MMM, HH:mm")} · {why ? WHY[why] : "You're invited"}
                </div>
              </div>
            </div>
            <RsvpForm eventId={e.id} status={rsvpOf(e.attendances[0]?.status)} className="grid shrink-0 grid-cols-3 gap-1.5" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export async function SquadBoard({ mySquad }: { mySquad: string | null }) {
  const [board, top] = await Promise.all([squadLeaderboard(), topThisMonth()]);
  if (!board.length && !top.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="size-4 text-accent" aria-hidden /> Leaderboard
        </CardTitle>
        <CardDescription>Squad turnout over the last 30 days: attendance against everyone invited.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <ol className="flex flex-col gap-2.5">
          {board.map((b, i) => (
            <li key={b.squad} className={cn("text-sm", b.squad === mySquad && "font-semibold")}>
              <div className="flex items-baseline justify-between gap-2">
                <span>
                  <span className="typed mr-2 text-muted-foreground">{i + 1}.</span>
                  {b.squad} <span className="text-xs font-normal text-muted-foreground">{b.callsign}</span>
                  {b.squad === mySquad && <span className="ml-1.5 text-micro uppercase text-accent">yours</span>}
                </span>
                <span className="typed text-xs">{b.rate === null ? "no events" : `${b.rate}%`}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                <div className={cn("h-full rounded-full", b.squad === mySquad ? "bg-accent" : "bg-primary")} style={{ width: `${b.rate ?? 0}%` }} />
              </div>
            </li>
          ))}
        </ol>
        {top.length > 0 && (
          <div>
            <div className="field-label mb-2">Most present this month</div>
            <ol className="flex flex-col gap-2">
              {top.map((t, i) => (
                <li key={t.user.id}>
                  <Link href={`/roster/${t.user.id}`} className="flex items-center gap-2 text-sm hover:text-accent">
                    <span className="typed w-4 text-muted-foreground">{i + 1}</span>
                    <RankInsignia rank={t.user.rank} size={18} />
                    <Avatar discordId={t.user.discordId} avatar={t.user.avatar} name={t.user.callsign ?? t.user.discordUsername} size={20} />
                    <span className="min-w-0 flex-1 truncate">{t.user.callsign ?? t.user.discordUsername}</span>
                    <span className="typed text-xs text-muted-foreground">{t.count}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
