import type { Attendance, Event } from "@prisma/client";
import { CalendarDays, CalendarX, Check, ChevronLeft, ChevronRight, ClipboardList, List, MapPin, Plus, Users } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { AttendanceBadge, EventTypeBadge } from "@/components/status-badge";
import { TabLinks } from "@/components/tab-links";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { relDay } from "@/components/ops-util";
import { requireUser } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { dayKey, fmt, monthKey, monthRange } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata = { title: "Operations" };

type Row = Event & { attendances: Attendance[]; _count: { attendances: number } };

export default async function Ops({ searchParams }: { searchParams: Promise<{ view?: string; month?: string }> }) {
  const me = await requireUser("OPERATOR", "/ops");
  const sp = await searchParams;
  const view = sp.view === "calendar" ? "calendar" : sp.view === "past" ? "past" : "upcoming";
  const now = new Date();

  const include = {
    attendances: { where: { userId: me.id } },
    _count: { select: { attendances: { where: { status: "ATTENDING" as const } } } },
  };

  let events: Row[];
  let month = "";
  if (view === "calendar") {
    month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : monthKey(now);
    const { start, end } = monthRange(month);
    events = await prisma.event.findMany({ where: { startTime: { gte: start, lt: end } }, orderBy: { startTime: "asc" }, include });
  } else if (view === "past") {
    events = await prisma.event.findMany({ where: { startTime: { lt: now } }, orderBy: { startTime: "desc" }, take: 50, include });
  } else {
    events = await prisma.event.findMany({ where: { startTime: { gte: now } }, orderBy: { startTime: "asc" }, take: 50, include });
  }

  return (
    <Container>
      <PageHeader
        eyebrow="Operations"
        title="Operations calendar"
        description="Ops, trainings and briefings. RSVP so leaders can plan the ORBAT."
        actions={
          hasPerm(me.perms, "INSTRUCTOR") && (
            <Button asChild>
              <Link href="/ops/new">
                <Plus /> Schedule
              </Link>
            </Button>
          )
        }
      />
      <TabLinks
        label="Operations view"
        items={[
          { href: "/ops?view=upcoming", label: "Upcoming", icon: <List className="size-3.5" />, active: view === "upcoming" },
          { href: "/ops?view=calendar", label: "Calendar", icon: <CalendarDays className="size-3.5" />, active: view === "calendar" },
          { href: "/ops?view=past", label: "Past & AARs", icon: <List className="size-3.5" />, active: view === "past" },
        ]}
      />

      {view === "calendar" ? (
        <MonthGrid month={month} events={events} />
      ) : events.length ? (
        <div className="flex flex-col gap-2">
          {events.map((e) => (
            <EventRow key={e.id} e={e} past={view === "past"} />
          ))}
        </div>
      ) : (
        <Card className="flex flex-col items-center gap-3 px-4 py-14 text-center">
          <CalendarX className="size-8 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">{view === "past" ? "No past events on record." : "Nothing scheduled yet."}</p>
          {view === "past" ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/ops?view=upcoming">See upcoming</Link>
            </Button>
          ) : hasPerm(me.perms, "INSTRUCTOR") ? (
            <Button asChild size="sm">
              <Link href="/ops/new">
                <Plus /> Schedule an event
              </Link>
            </Button>
          ) : (
            <Button asChild variant="outline" size="sm">
              <Link href="/ops?view=past">
                <ClipboardList /> Past &amp; AARs
              </Link>
            </Button>
          )}
        </Card>
      )}
    </Container>
  );
}

const TYPE_LETTER = { OP: "O", TRAINING: "T", BRIEFING: "B" } as const;
const TYPE_NAME = { OP: "Operation", TRAINING: "Training", BRIEFING: "Briefing" } as const;
const TYPE_COLOR = { OP: "border-destructive", TRAINING: "border-primary", BRIEFING: "border-accent" } as const;
const DOT_COLOR = { OP: "bg-destructive", TRAINING: "bg-primary", BRIEFING: "bg-accent" } as const;
// Shape differs per type so the dots never rely on colour alone.
const DOT_SHAPE = { OP: "rounded-full", TRAINING: "rounded-[1px]", BRIEFING: "rotate-45 rounded-[1px] scale-90" } as const;

function EventRow({ e, past }: { e: Row; past: boolean }) {
  const mine = e.attendances[0];
  return (
    <Link href={`/ops/${e.id}`} className="group flex items-stretch overflow-hidden rounded-lg border bg-card hover:border-accent/50">
      <div className="flex w-20 shrink-0 flex-col items-center justify-center border-r bg-background/40 py-3">
        <span className="text-micro font-semibold uppercase tracking-widest text-accent">{fmt(e.startTime, "MMM")}</span>
        <span className="font-display text-3xl font-bold leading-none">{fmt(e.startTime, "d")}</span>
        <span className="text-micro uppercase text-muted-foreground">{fmt(e.startTime, "EEE")}</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <EventTypeBadge type={e.type} />
          {e.mandatory && <Badge variant="destructive">Mandatory</Badge>}
          {past && (e.debrief ? <Badge variant="success">AAR filed</Badge> : <Badge variant="outline">No AAR</Badge>)}
          {mine && <AttendanceBadge status={mine.status} />}
        </div>
        <div className="font-display text-lg font-semibold uppercase tracking-wide group-hover:text-accent">{e.title}</div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{relDay(e.startTime)}</span>
          <span>{fmt(e.startTime, "HH:mm zzz")}</span>
          {e.location && (
            <span className="flex items-center gap-1">
              <MapPin className="size-3" aria-hidden /> {e.location}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Users className="size-3" aria-hidden /> {e._count.attendances} attending
          </span>
        </div>
      </div>
    </Link>
  );
}

function MonthGrid({ month, events }: { month: string; events: Row[] }) {
  const [y, m] = month.split("-").map(Number);
  // Calendar arithmetic on plain dates; the timezone only matters for which
  // day an event falls on, which dayKey() handles.
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // Monday-first
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const today = dayKey(new Date());
  const isRsvpd = (e: Row) => e.attendances[0]?.status === "ATTENDING";

  const byDay = new Map<string, Row[]>();
  for (const e of events) {
    const k = dayKey(e.startTime);
    byDay.set(k, [...(byDay.get(k) ?? []), e]);
  }
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const agenda = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-3 sm:px-4">
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="icon">
              <Link href={`/ops?view=calendar&month=${prev}`} aria-label="Previous month">
                <ChevronLeft />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="icon">
              <Link href={`/ops?view=calendar&month=${next}`} aria-label="Next month">
                <ChevronRight />
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/ops?view=calendar">Today</Link>
            </Button>
          </div>
          <h2 className="text-base font-semibold uppercase sm:text-lg">
            {first.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}
          </h2>
        </div>
        <div className="grid grid-cols-7 border-b bg-background/40 text-center text-micro font-semibold uppercase tracking-widest text-muted-foreground">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            const key = d ? `${month}-${String(d).padStart(2, "0")}` : "";
            const list = d ? (byDay.get(key) ?? []) : [];
            const isToday = key === today;
            return (
              <div key={i} className={cn("min-h-16 min-w-0 border-b border-r p-1 sm:min-h-28 sm:p-1.5", !d && "bg-background/30", (i + 1) % 7 === 0 && "border-r-0")}>
                {d && (
                  <>
                    <div
                      className={cn(
                        "mb-1 flex size-6 items-center justify-center rounded-full text-xs",
                        isToday ? "bg-accent font-bold text-accent-foreground" : "text-muted-foreground",
                      )}
                      aria-label={isToday ? `${d}, today` : undefined}
                    >
                      {d}
                    </div>
                    {/* Below sm: a dot per event (shape + colour); the agenda has the detail. */}
                    <div className="flex flex-wrap gap-1 sm:hidden" aria-hidden>
                      {list.map((e) => (
                        <span key={e.id} className={cn("size-2 ring-offset-1", DOT_COLOR[e.type], DOT_SHAPE[e.type], isRsvpd(e) && "ring-2 ring-success")} />
                      ))}
                    </div>
                    <div className="hidden flex-col gap-1 sm:flex">
                      {list.slice(0, 2).map((e) => (
                        <Link
                          key={e.id}
                          href={`/ops/${e.id}`}
                          title={`${e.title} — ${fmt(e.startTime, "HH:mm")}`}
                          aria-label={`${TYPE_NAME[e.type]}: ${e.title}, ${fmt(e.startTime, "HH:mm")}${isRsvpd(e) ? ", you are attending" : ""}`}
                          className={cn("flex items-center gap-1 truncate rounded-sm border-l-2 bg-secondary px-1 py-0.5 text-micro hover:bg-secondary/60", TYPE_COLOR[e.type])}
                        >
                          <span className="font-bold text-muted-foreground" aria-hidden>
                            {TYPE_LETTER[e.type]}
                          </span>
                          <span className="truncate">{e.title}</span>
                          {isRsvpd(e) && <Check className="ml-auto size-3 shrink-0 text-success-fg" aria-hidden />}
                        </Link>
                      ))}
                      {list.length > 2 && (
                        <a href={`#day-${key}`} className="px-1 text-micro text-muted-foreground hover:text-accent">
                          +{list.length - 2} more
                        </a>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2 text-micro text-muted-foreground">
          {(["OP", "TRAINING", "BRIEFING"] as const).map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <span className={cn("size-2", DOT_COLOR[t], DOT_SHAPE[t])} aria-hidden /> {TYPE_NAME[t]}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full ring-2 ring-success" aria-hidden /> You&apos;re attending
          </span>
        </div>
      </Card>

      <section aria-label="Month agenda">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-label text-muted-foreground">Month agenda</h3>
        {agenda.length ? (
          <div className="flex flex-col gap-3">
            {agenda.map(([key, list]) => (
              <div key={key} id={`day-${key}`} className="scroll-mt-20">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wider">
                  {fmt(list[0].startTime, "EEE d MMM")} <span className="font-normal text-muted-foreground">· {relDay(list[0].startTime)}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {list.map((e) => (
                    <Link
                      key={e.id}
                      href={`/ops/${e.id}`}
                      className={cn("flex min-w-0 items-center gap-3 rounded-md border border-l-4 bg-card px-3 py-2 hover:border-accent/50", TYPE_COLOR[e.type])}
                    >
                      <span className="typed w-11 shrink-0 text-xs text-muted-foreground">{fmt(e.startTime, "HH:mm")}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{e.title}</span>
                        <span className="text-micro uppercase tracking-wider text-muted-foreground">{TYPE_NAME[e.type]}</span>
                      </span>
                      {isRsvpd(e) && (
                        <span className="flex shrink-0 items-center gap-1 text-xs text-success-fg">
                          <Check className="size-3.5" aria-hidden /> Attending
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing scheduled this month.</p>
        )}
      </section>
    </div>
  );
}
