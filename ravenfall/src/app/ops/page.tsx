import type { Attendance, Event } from "@prisma/client";
import { CalendarDays, ChevronLeft, ChevronRight, List, Plus } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { AttendanceBadge, EventTypeBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

  const tab = (v: string, label: string, Icon: typeof List) => (
    <Link
      href={`/ops?view=${v}`}
      className={cn(
        "flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-wider",
        view === v ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="size-3.5" /> {label}
    </Link>
  );

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
      <div className="mb-4 flex gap-1">
        {tab("upcoming", "Upcoming", List)}
        {tab("calendar", "Calendar", CalendarDays)}
        {tab("past", "Past & AARs", List)}
      </div>

      {view === "calendar" ? (
        <MonthGrid month={month} events={events} />
      ) : events.length ? (
        <div className="flex flex-col gap-2">
          {events.map((e) => (
            <EventRow key={e.id} e={e} past={view === "past"} />
          ))}
        </div>
      ) : (
        <Card className="py-16 text-center text-sm text-muted-foreground">
          {view === "past" ? "No past events." : "Nothing scheduled yet."}
        </Card>
      )}
    </Container>
  );
}

function EventRow({ e, past }: { e: Row; past: boolean }) {
  const mine = e.attendances[0];
  return (
    <Link href={`/ops/${e.id}`} className="group flex items-stretch overflow-hidden rounded-lg border bg-card hover:border-accent/50">
      <div className="flex w-20 shrink-0 flex-col items-center justify-center border-r bg-background/40 py-3">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-accent">{fmt(e.startTime, "MMM")}</span>
        <span className="font-display text-3xl font-bold leading-none">{fmt(e.startTime, "d")}</span>
        <span className="text-[11px] uppercase text-muted-foreground">{fmt(e.startTime, "EEE")}</span>
      </div>
      <div className="flex flex-1 flex-col justify-center gap-1 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <EventTypeBadge type={e.type} />
          {e.mandatory && <Badge variant="destructive">Mandatory</Badge>}
          {past && (e.debrief ? <Badge variant="success">AAR filed</Badge> : <Badge variant="outline">No AAR</Badge>)}
        </div>
        <div className="font-display text-lg font-semibold uppercase tracking-wide group-hover:text-accent">{e.title}</div>
        <div className="text-xs text-muted-foreground">
          {fmt(e.startTime, "HH:mm zzz")}
          {e.location && ` · ${e.location}`} · {e._count.attendances} attending
        </div>
      </div>
      <div className="hidden items-center pr-4 sm:flex">{mine && <AttendanceBadge status={mine.status} />}</div>
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

  const byDay = new Map<string, Row[]>();
  for (const e of events) {
    const k = dayKey(e.startTime);
    byDay.set(k, [...(byDay.get(k) ?? []), e]);
  }
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <Button asChild variant="ghost" size="icon">
          <Link href={`/ops?view=calendar&month=${prev}`} aria-label="Previous month">
            <ChevronLeft />
          </Link>
        </Button>
        <h2 className="text-lg font-semibold uppercase">
          {first.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}
        </h2>
        <Button asChild variant="ghost" size="icon">
          <Link href={`/ops?view=calendar&month=${next}`} aria-label="Next month">
            <ChevronRight />
          </Link>
        </Button>
      </div>
      <div className="grid grid-cols-7 border-b bg-background/40 text-center text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
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
          return (
            <div key={i} className={cn("min-h-20 border-b border-r p-1.5 sm:min-h-28", !d && "bg-background/30", (i + 1) % 7 === 0 && "border-r-0")}>
              {d && (
                <>
                  <div className={cn("mb-1 text-xs", key === today ? "font-bold text-accent" : "text-muted-foreground")}>{d}</div>
                  <div className="flex flex-col gap-1">
                    {list.map((e) => (
                      <Link
                        key={e.id}
                        href={`/ops/${e.id}`}
                        title={`${e.title} — ${fmt(e.startTime, "HH:mm")}`}
                        className={cn(
                          "truncate rounded-sm border-l-2 bg-secondary px-1 py-0.5 text-[11px] hover:bg-secondary/60",
                          e.type === "OP" ? "border-destructive" : e.type === "TRAINING" ? "border-primary" : "border-accent",
                        )}
                      >
                        <span className="hidden text-muted-foreground sm:inline">{fmt(e.startTime, "HH:mm")} </span>
                        {e.title}
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
