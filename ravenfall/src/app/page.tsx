import { ChevronRight, Crosshair, Radio, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/container";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { DOCTRINE, SQUADS, UNIT } from "@/config/unit";
import { prisma } from "@/lib/prisma";
import { fmt } from "@/lib/time";

export const revalidate = 300;

const ICONS = [Radio, Crosshair, ShieldCheck];

const PIPELINE = [
  { step: "01", title: "Apply", body: "Sign in with Discord and fill out a short questionnaire. No separate account." },
  { step: "02", title: "Review", body: "Recruiters are alerted on Discord and review your application, usually within 48 hours." },
  { step: "03", title: "Enlist", body: "Once approved you get your callsign, roles and a service record. You're a Recruit." },
  { step: "04", title: "Deploy", body: "RSVP to your first op, complete basic training and start earning qualifications." },
];

async function stats() {
  try {
    const [members, ops, quals, nextOp] = await Promise.all([
      prisma.user.count({ where: { status: "ACTIVE" } }),
      prisma.event.count({ where: { type: "OP", startTime: { lt: new Date() } } }),
      prisma.userQualification.count(),
      prisma.event.findFirst({ where: { startTime: { gte: new Date() } }, orderBy: { startTime: "asc" } }),
    ]);
    return { members, ops, quals, nextOp };
  } catch {
    // The landing page should render even if the database is down.
    return { members: 0, ops: 0, quals: 0, nextOp: null };
  }
}

export default async function Home() {
  const s = await stats();

  return (
    <>
      <section className="tac-grid relative overflow-hidden border-b">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-background/40 to-background" />
        <div className="pointer-events-none absolute -right-24 -top-24 size-[28rem] rounded-full bg-primary/10 blur-3xl" />
        <Container className="relative py-20 sm:py-28">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-accent">
            <Logo className="size-5" /> {UNIT.org}
          </div>
          <h1 className="mt-4 max-w-3xl text-5xl font-bold uppercase leading-[0.95] sm:text-7xl">
            The <span className="text-accent">{UNIT.name}</span> are recruiting.
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
            <div className="mt-10 inline-flex items-center gap-3 rounded-md border bg-card/70 px-4 py-2 text-sm">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-accent" />
              </span>
              <span className="text-muted-foreground">Next deployment:</span>
              <span className="font-semibold">{fmt(s.nextOp.startTime, "EEE d MMM, HH:mm zzz")}</span>
            </div>
          )}
        </Container>
      </section>

      <section className="border-b bg-card/40">
        <Container className="grid grid-cols-3 divide-x py-6 text-center">
          {[
            ["Active operators", s.members],
            ["Operations run", s.ops],
            ["Qualifications earned", s.quals],
          ].map(([label, n]) => (
            <div key={label as string}>
              <div className="font-display text-3xl font-bold text-accent sm:text-4xl">{n}</div>
              <div className="mt-1 text-[11px] uppercase tracking-widest text-muted-foreground">{label}</div>
            </div>
          ))}
        </Container>
      </section>

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
            {SQUADS.map((sq) => (
              <div key={sq.name} className="bg-card p-6">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">{sq.name}</div>
                <p className="mt-2 text-sm text-muted-foreground">{sq.blurb}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {UNIT.media.length > 0 && (
        <Container className="py-16">
          <SectionTitle eyebrow="Media" title="From the field" />
          <div className="grid gap-4 md:grid-cols-2">
            {UNIT.media.map((id) => (
              <div key={id} className="aspect-video overflow-hidden rounded-lg border">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${id}`}
                  title="Unit footage"
                  className="size-full"
                  allowFullScreen
                  loading="lazy"
                />
              </div>
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
        <div className="mt-10 flex flex-col items-center gap-4 rounded-lg border border-accent/30 bg-accent/5 p-8 text-center">
          <h2 className="text-2xl font-bold uppercase">Ready to deploy?</h2>
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
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">{eyebrow}</p>
      <h2 className="mt-1 text-3xl font-bold uppercase">{title}</h2>
    </div>
  );
}
