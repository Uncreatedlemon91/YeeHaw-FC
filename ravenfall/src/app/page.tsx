import type { EventType } from "@prisma/client";
import { CalendarDays, ChevronRight, Crosshair, FileText, Radio, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/container";
import { Countdown } from "@/components/countdown";
import { Logo } from "@/components/logo";
import { PIPELINE } from "@/components/public-pipeline";
import { VideoFacade } from "@/components/public-video";
import { Button } from "@/components/ui/button";
import { DOCTRINE, SQUADS, UNIT } from "@/config/unit";
import { invitedLabel } from "@/lib/event-invites";
import { publicMedia, type PublicMedia } from "@/lib/gallery";
import { prisma } from "@/lib/prisma";
import { fmt } from "@/lib/time";

export const revalidate = 300;

const ICONS = [Radio, Crosshair, ShieldCheck];

async function stats() {
  try {
    const [members, ops, quals, nextOp, filledRows, upcoming, recent] = await Promise.all([
      prisma.user.count({ where: { status: "ACTIVE" } }),
      prisma.event.count({ where: { type: "OP", startTime: { lt: new Date() } } }),
      prisma.userQualification.count(),
      prisma.event.findFirst({ where: { startTime: { gte: new Date() } }, orderBy: { startTime: "asc" } }),
      prisma.user.groupBy({ by: ["squad"], where: { status: "ACTIVE", squad: { not: null } }, _count: true }),
      // What's on the calendar: titles and times only (the pages are for members).
      prisma.event.findMany({
        where: { startTime: { gte: new Date() } },
        orderBy: { startTime: "asc" },
        take: 4,
        select: { id: true, title: true, type: true, startTime: true, invitedSquads: true, openToRecruits: true },
      }),
      // Ops whose AAR carries a public summary.
      prisma.event.findMany({
        where: { publicSummary: { not: null }, startTime: { lt: new Date() } },
        orderBy: { startTime: "desc" },
        take: 3,
        select: {
          id: true,
          title: true,
          type: true,
          startTime: true,
          publicSummary: true,
          _count: { select: { attendances: { where: { status: "ATTENDING" } } } },
          gallery: { where: { kind: "IMAGE" }, orderBy: { createdAt: "desc" }, take: 1, select: { id: true, caption: true } },
        },
      }),
    ]);
    const filled: Record<string, number> = {};
    for (const r of filledRows) if (r.squad) filled[r.squad] = r._count;
    const open = SQUADS.reduce((n, sq) => {
      const cap = Object.values(sq.billets).reduce((a, b) => a + b, 0);
      return n + Math.max(0, cap - (filled[sq.name] ?? 0));
    }, 0);
    return { members, ops, quals, nextOp, filled, open, upcoming, recent };
  } catch {
    // The landing page should render even if the database is down.
    return { members: 0, ops: 0, quals: 0, nextOp: null, filled: {} as Record<string, number>, open: 0, upcoming: [], recent: [] };
  }
}

async function media(): Promise<PublicMedia> {
  try {
    return await publicMedia();
  } catch {
    return { images: [], videos: [] };
  }
}

const TYPE_LABEL: Record<EventType, string> = { OP: "Operation", TRAINING: "Training", BRIEFING: "Briefing" };

async function publicDocs() {
  try {
    return await prisma.libraryDocument.findMany({
      where: { clearance: "PUBLIC" },
      orderBy: { title: "asc" },
      take: 12,
      select: { slug: true, title: true, summary: true },
    });
  } catch {
    return [];
  }
}

export default async function Home() {
  const [s, docs, m] = await Promise.all([stats(), publicDocs(), media()]);

  return (
    <>
      <section className="tac-grid relative overflow-hidden border-b">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-background/40 to-background" />
        <div className="pointer-events-none absolute -right-24 -top-24 size-[28rem] rounded-full bg-primary/10 blur-3xl" />
        <Container className="relative py-20 sm:py-28">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-label text-accent">
            <Logo className="size-5" /> {UNIT.siteName}
          </div>
          <h1 className="mt-4 max-w-3xl text-5xl font-bold uppercase leading-[0.95] sm:text-7xl">
            <span className="text-accent">{UNIT.name}</span> is recruiting.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">{UNIT.description}</p>
          <p className="mt-2 text-sm italic text-muted-foreground">“{UNIT.motto}”</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" variant="accent">
              <Link href="/apply">
                Enlist Now <ChevronRight />
              </Link>
            </Button>
            {UNIT.discordInvite && (
              <Button asChild size="lg" variant="outline">
                <a href={UNIT.discordInvite}>Join our Discord</a>
              </Button>
            )}
          </div>
          {s.nextOp && (
            <div className="mt-10 inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-card/70 px-4 py-2 text-sm">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full motion-reduce:animate-none bg-accent opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-accent" />
              </span>
              <span className="text-muted-foreground">Next deployment:</span>
              <span className="font-semibold">{s.nextOp.title}</span>
              <Countdown to={s.nextOp.startTime} className="text-accent" />
            </div>
          )}
        </Container>
      </section>

      {s.members > 0 && (
      <section className="border-b bg-card/40">
        <Container className="grid grid-cols-2 gap-y-6 py-6 text-center sm:grid-cols-4 sm:divide-x">
          {[
            ["Active operators", s.members],
            ["Operations run", s.ops],
            ["Open slots", s.open],
            ["Qualifications earned", s.quals],
          ].map(([label, n]) => (
            <div key={label as string}>
              <div className="font-display text-3xl font-bold text-accent sm:text-4xl">{n}</div>
              <div className="mt-1 text-micro uppercase tracking-widest text-muted-foreground">{label}</div>
            </div>
          ))}
        </Container>
      </section>
      )}

      {(s.upcoming.length > 0 || s.recent.length > 0) && (
        <Container className="grid gap-12 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
          {s.upcoming.length > 0 && (
            <section aria-labelledby="calendar-h">
              <SectionTitle eyebrow="On the calendar" title="Coming up" id="calendar-h" />
              <ul className="flex flex-col gap-2">
                {s.upcoming.map((e) => (
                  <li key={e.id} className="flex items-center gap-4 rounded-lg border bg-card p-3">
                    <div className="flex w-12 shrink-0 flex-col items-center rounded-md border bg-background/60 py-1 leading-none">
                      <span className="text-micro font-semibold uppercase text-accent">{fmt(e.startTime, "MMM")}</span>
                      <span className="font-display text-2xl font-bold">{fmt(e.startTime, "d")}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{e.title}</div>
                      <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span>{TYPE_LABEL[e.type]}</span>
                        <span>· {fmt(e.startTime, "EEE HH:mm zzz")}</span>
                        <span>· {invitedLabel(e)}</span>
                      </div>
                    </div>
                    {e.openToRecruits && (
                      <Link href="/apply" className="shrink-0 rounded-full border border-accent/50 bg-accent/10 px-2.5 py-1 text-micro font-semibold uppercase tracking-wider text-accent hover:bg-accent/20">
                        Recruits welcome
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarDays className="size-3.5" aria-hidden /> Recruit nights are open to applicants: apply, then sign up from your application page.
              </p>
            </section>
          )}
          {s.recent.length > 0 && (
            <section aria-labelledby="recent-h">
              <SectionTitle eyebrow="After action" title="Recent operations" id="recent-h" />
              <ul className="flex flex-col gap-4">
                {s.recent.map((e) => (
                  <li key={e.id} className="jacket flex flex-col overflow-hidden rounded-lg border sm:flex-row">
                    {e.gallery[0] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/gallery/${e.gallery[0].id}`}
                        alt={e.gallery[0].caption || e.title}
                        loading="lazy"
                        className="aspect-video w-full object-cover sm:aspect-auto sm:w-48"
                      />
                    )}
                    <div className="flex min-w-0 flex-col gap-1.5 p-4">
                      <div className="typed flex flex-wrap gap-x-3 text-micro uppercase text-muted-foreground">
                        <span>{TYPE_LABEL[e.type]}</span>
                        <span>{fmt(e.startTime, "d MMM yyyy")}</span>
                        <span className="flex items-center gap-1">
                          <Users className="size-3" aria-hidden /> {e._count.attendances} deployed
                        </span>
                      </div>
                      <h3 className="text-lg font-bold uppercase">{e.title}</h3>
                      <p className="text-sm text-muted-foreground">{e.publicSummary}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </Container>
      )}

      <Container className="py-16">
        <SectionTitle eyebrow="Doctrine" title="How we fight" />
        <div className="grid gap-4 md:grid-cols-3">
          {DOCTRINE.map((d, i) => {
            const Icon = ICONS[i % ICONS.length];
            return (
              <div key={d.title} className="rounded-lg border bg-card p-6">
                <Icon className="size-6 text-accent" />
                <h3 className="mt-4 text-lg font-semibold uppercase">{d.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{d.body}</p>
              </div>
            );
          })}
        </div>
      </Container>

      <section className="tac-grid border-y">
        <Container className="py-16">
          <SectionTitle eyebrow="Order of battle" title="Squads & branches" />
          <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {SQUADS.map((sq) => {
              const cap = Object.values(sq.billets).reduce((a, b) => a + b, 0);
              const filled = Math.min(s.filled[sq.name] ?? 0, cap);
              return (
                <div key={sq.name} className="bg-card p-6">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="text-xs font-semibold uppercase tracking-label text-accent">{sq.name}</div>
                    <div className="text-micro uppercase tracking-wider text-muted-foreground">
                      {s.members > 0 ? `${filled}/${cap} slots` : `${cap} slots`}
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{sq.blurb}</p>
                </div>
              );
            })}
          </div>
        </Container>
      </section>

      {docs.length > 0 && (
        <Container className="py-16">
          <SectionTitle eyebrow="Library" title="Open documents" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {docs.map((d) => (
              <Link key={d.slug} href={`/library/${d.slug}`} className="group flex flex-col gap-2 rounded-lg border bg-card p-4 hover:border-accent/50">
                <FileText className="size-5 text-muted-foreground group-hover:text-accent" />
                <div className="font-display text-lg font-semibold uppercase">{d.title}</div>
                {d.summary && <p className="text-sm text-muted-foreground">{d.summary}</p>}
              </Link>
            ))}
          </div>
        </Container>
      )}

      {(m.images.length > 0 || m.videos.length > 0) && (
        <Container className="py-16">
          <SectionTitle eyebrow="Media" title="From the field" />
          {m.videos.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              {m.videos.map((v, i) => (
                <VideoFacade key={v.id} id={v.id} title={v.caption || `Unit footage ${i + 1} of ${m.videos.length}`} />
              ))}
            </div>
          )}
          {m.images.length > 0 && (
            <ul className={`grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 ${m.videos.length ? "mt-4" : ""}`}>
              {m.images.map((img) => (
                <li key={img.id}>
                  <a href={img.src} className="group relative block overflow-hidden rounded-lg border" target="_blank" rel="noopener">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.src} alt={img.caption || img.event || "Unit screenshot"} loading="lazy" className="aspect-video w-full object-cover transition-transform group-hover:scale-105" />
                    {(img.caption || img.event) && (
                      <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-4 text-left text-micro font-semibold text-white">
                        {img.caption || img.event}
                      </span>
                    )}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Container>
      )}

      <Container className="py-16">
        <SectionTitle eyebrow="Recruitment" title="From applicant to operator" />
        <ol className="grid gap-4 md:grid-cols-4">
          {PIPELINE.map((p) => (
            <li key={p.step} className="relative rounded-lg border bg-card p-6">
              <div className="font-display text-4xl font-bold text-primary/60">{p.step}</div>
              <h3 className="mt-2 text-lg font-semibold uppercase">{p.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{p.body}</p>
            </li>
          ))}
        </ol>
        <div className="jacket relative mt-10 flex flex-col items-center gap-4 overflow-hidden rounded-lg border p-8 text-center sm:p-12">
          <div aria-hidden className="absolute right-4 top-4 hidden sm:block">
            <span className="stamp stamp-amber">Now enlisting</span>
          </div>
          <p className="text-micro font-semibold uppercase tracking-label text-muted-foreground">File no. 001 · New recruit</p>
          <h2 className="text-3xl font-bold uppercase sm:text-4xl">Ready to deploy?</h2>
          <p className="max-w-lg text-sm text-muted-foreground">
            All you need is a Discord account and a working microphone. We train you on the rest.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" variant="accent">
              <Link href="/apply">
                Start your application <ChevronRight />
              </Link>
            </Button>
            {UNIT.discordInvite && (
              <Button asChild size="lg" variant="outline">
                <a href={UNIT.discordInvite}>Join our Discord</a>
              </Button>
            )}
          </div>
        </div>
      </Container>
    </>
  );
}

function SectionTitle({ eyebrow, title, id }: { eyebrow: string; title: string; id?: string }) {
  return (
    <div className="mb-8">
      <p className="text-xs font-semibold uppercase tracking-label text-accent">{eyebrow}</p>
      <h2 id={id} className="mt-1 text-3xl font-bold uppercase">{title}</h2>
    </div>
  );
}
