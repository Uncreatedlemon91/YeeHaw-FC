import { ChevronRight, Crosshair, FileText, Radio, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/container";
import { Countdown } from "@/components/countdown";
import { Logo } from "@/components/logo";
import { PIPELINE } from "@/components/public-pipeline";
import { VideoFacade } from "@/components/public-video";
import { Button } from "@/components/ui/button";
import { DOCTRINE, SQUADS, UNIT } from "@/config/unit";
import { prisma } from "@/lib/prisma";

export const revalidate = 300;

const ICONS = [Radio, Crosshair, ShieldCheck];

async function stats() {
  try {
    const [members, ops, quals, nextOp, filledRows] = await Promise.all([
      prisma.user.count({ where: { status: "ACTIVE" } }),
      prisma.event.count({ where: { type: "OP", startTime: { lt: new Date() } } }),
      prisma.userQualification.count(),
      prisma.event.findFirst({ where: { startTime: { gte: new Date() } }, orderBy: { startTime: "asc" } }),
      prisma.user.groupBy({ by: ["squad"], where: { status: "ACTIVE", squad: { not: null } }, _count: true }),
    ]);
    const filled: Record<string, number> = {};
    for (const r of filledRows) if (r.squad) filled[r.squad] = r._count;
    return { members, ops, quals, nextOp, filled };
  } catch {
    // The landing page should render even if the database is down.
    return { members: 0, ops: 0, quals: 0, nextOp: null, filled: {} as Record<string, number> };
  }
}

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
  const [s, docs] = await Promise.all([stats(), publicDocs()]);

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
        <Container className="grid grid-cols-3 divide-x py-6 text-center">
          {[
            ["Active operators", s.members],
            ["Operations run", s.ops],
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

      {UNIT.media.length > 0 && (
        <Container className="py-16">
          <SectionTitle eyebrow="Media" title="From the field" />
          <div className="grid gap-4 md:grid-cols-2">
            {UNIT.media.map((id, i) => (
              <VideoFacade key={id} id={id} title={`Unit footage ${i + 1} of ${UNIT.media.length}`} />
            ))}
          </div>
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
          <Button asChild size="lg" variant="accent">
            <Link href="/apply">
              Start your application <ChevronRight />
            </Link>
          </Button>
        </div>
      </Container>
    </>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-8">
      <p className="text-xs font-semibold uppercase tracking-label text-accent">{eyebrow}</p>
      <h2 className="mt-1 text-3xl font-bold uppercase">{title}</h2>
    </div>
  );
}
