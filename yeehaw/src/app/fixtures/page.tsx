import type { Event, SignupStatus } from "@prisma/client";
import { CalendarDays, ChevronLeft, ChevronRight, Repeat } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { SignupBadge } from "@/components/status-badge";
import { TabLinks } from "@/components/tab-links";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EVENT_TYPE_LABEL } from "@/config/club";
import { getSessionUser } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { addDays, weekdayOf } from "@/lib/recurrence";
import { dayKey, fmt, monthKey, monthRange } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata = { title: "Fixtures" };
export const dynamic = "force-dynamic";

type Counts = Record<SignupStatus, number>;

/** The result worth showing: a score, else the free-text result. */
const resultOf = (e: Pick<Event, "usScore" | "oppScore" | "result">) =>
  e.usScore != null && e.oppScore != null ? `${e.usScore}–${e.oppScore}` : e.result;

function Row({ e, counts, mine, past }: { e: Event; counts: Counts; mine?: SignupStatus; past?: boolean }) {
  const result = resultOf(e);
  return (
    <li>
      <Link href={`/fixtures/${e.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="tnum w-36 shrink-0 text-sm text-muted-foreground">{fmt(e.startsAt, "EEE d MMM, HH:mm")}</span>
        <span className="min-w-0 flex-1">
          <span className="font-semibold">{e.title}</span>
          {e.opponent && <span className="text-muted-foreground"> vs {e.opponent}</span>}
          {e.seriesId && <Repeat aria-label="Recurring" className="ml-2 inline size-3 text-muted-foreground" />}
        </span>
        <Badge variant="outline">{EVENT_TYPE_LABEL[e.type]}</Badge>
        {past ? (
          result && <span className="tnum font-display font-bold">{result}</span>
        ) : (
          <span className="tnum text-xs text-muted-foreground" title="Going / maybe / can't make it">
            {counts.GOING} going · {counts.MAYBE} maybe
          </span>
        )}
        {mine && !past && <SignupBadge status={mine} />}
        {!e.signupsOpen && !past && <Badge variant="outline">Closed</Badge>}
      </Link>
    </li>
  );
}

export default async function FixturesPage({ searchParams }: { searchParams: Promise<{ view?: string; month?: string }> }) {
  const sp = await searchParams;
  const user = await getSessionUser();
  const isStaff = hasPerm(user?.perms, "STAFF");
  const calendar = sp.view === "calendar";
  const now = new Date();
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month ?? "") ? sp.month! : monthKey(now);

  const events = calendar
    ? await prisma.event.findMany({ where: { startsAt: { gte: monthRange(month).start, lt: monthRange(month).end } }, orderBy: { startsAt: "asc" } })
    : await prisma.event.findMany({ where: { startsAt: { gte: new Date(now.getTime() - 60 * 86_400_000) } }, orderBy: { startsAt: "asc" } });

  const ids = events.map((e) => e.id);
  const [grouped, mineRows] = await Promise.all([
    prisma.eventSignup.groupBy({ by: ["eventId", "status"], where: { eventId: { in: ids } }, _count: { _all: true } }),
    user && hasPerm(user.perms, "MEMBER") ? prisma.eventSignup.findMany({ where: { playerId: user.id, eventId: { in: ids } }, select: { eventId: true, status: true } }) : [],
  ]);
  const counts = new Map<string, Counts>();
  for (const g of grouped) {
    const c = counts.get(g.eventId) ?? { GOING: 0, MAYBE: 0, OUT: 0 };
    c[g.status] = g._count._all;
    counts.set(g.eventId, c);
  }
  const mine = new Map(mineRows.map((m) => [m.eventId, m.status]));
  const countsOf = (id: string) => counts.get(id) ?? { GOING: 0, MAYBE: 0, OUT: 0 };

  const upcoming = events.filter((e) => e.startsAt >= now);
  const past = events.filter((e) => e.startsAt < now).reverse();

  return (
    <Container>
      <PageHeader
        eyebrow="Matchday"
        title="Fixtures"
        description="What is coming up and how it went."
        actions={
          isStaff && (
            <>
              <Button asChild>
                <Link href="/fixtures/new">Schedule event</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/fixtures/series">Recurring</Link>
              </Button>
            </>
          )
        }
      />
      <TabLinks
        label="Fixtures view"
        items={[
          { href: "/fixtures", label: "List", active: !calendar },
          { href: "/fixtures?view=calendar", label: "Calendar", active: calendar, icon: <CalendarDays className="size-3.5" aria-hidden /> },
        ]}
      />
      {calendar ? (
        <CalendarView month={month} events={events} />
      ) : (
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Upcoming</CardTitle>
            </CardHeader>
            {upcoming.length ? (
              <ul className="divide-y">
                {upcoming.map((e) => (
                  <Row key={e.id} e={e} counts={countsOf(e.id)} mine={mine.get(e.id)} />
                ))}
              </ul>
            ) : (
              <CardContent className="text-sm text-muted-foreground">Nothing scheduled. Check back soon.</CardContent>
            )}
          </Card>
          {past.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent</CardTitle>
              </CardHeader>
              <ul className="divide-y">
                {past.slice(0, 25).map((e) => (
                  <Row key={e.id} e={e} counts={countsOf(e.id)} past />
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </Container>
  );
}

// --- The calendar ------------------------------------------------------------ //

const shift = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number);
  const t = y * 12 + (m - 1) + by;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};

function CalendarView({ month, events }: { month: string; events: Event[] }) {
  const first = `${month}-01`;
  const next = `${shift(month, 1)}-01`;
  // Pad back to the Monday before the 1st and forward to the Sunday after the last.
  const days: string[] = [];
  for (let d = addDays(first, -weekdayOf(first)); d < next || days.length % 7; d = addDays(d, 1)) days.push(d);
  const byDay = new Map<string, Event[]>();
  for (const e of events) byDay.set(dayKey(e.startsAt), [...(byDay.get(dayKey(e.startsAt)) ?? []), e]);
  const today = dayKey(new Date());
  const title = fmt(new Date(`${first}T12:00:00Z`), "MMMM yyyy");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/fixtures?view=calendar&month=${shift(month, -1)}`} aria-label="Previous month">
            <ChevronLeft aria-hidden /> {shift(month, -1)}
          </Link>
        </Button>
        <h2 className="font-display text-lg font-bold uppercase">{title}</h2>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/fixtures?view=calendar&month=${shift(month, 1)}`} aria-label="Next month">
            {shift(month, 1)} <ChevronRight aria-hidden />
          </Link>
        </Button>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[40rem] grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="bg-card px-2 py-1 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {d}
            </div>
          ))}
          {days.map((d) => {
            const inMonth = d.startsWith(month);
            return (
              <div key={d} className={cn("min-h-24 bg-card p-1.5", !inMonth && "bg-card/50 text-muted-foreground/60")}>
                <span className={cn("tnum text-xs", d === today && "rounded-sm bg-primary px-1 font-bold text-primary-foreground")}>{Number(d.slice(8))}</span>
                <ul className="mt-1 flex flex-col gap-1">
                  {(byDay.get(d) ?? []).map((e) => (
                    <li key={e.id}>
                      <Link href={`/fixtures/${e.id}`} className="block truncate rounded-sm border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-xs hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={`${fmt(e.startsAt, "HH:mm")} ${e.title}`}>
                        <span className="tnum text-muted-foreground">{fmt(e.startsAt, "HH:mm")}</span> {e.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
