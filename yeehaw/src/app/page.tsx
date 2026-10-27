import { CalendarDays, Newspaper, Shirt, Trophy } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/container";
import { Countdown } from "@/components/countdown";
import { Logo } from "@/components/logo";
import { Pitch } from "@/components/pitch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CLUB } from "@/config/club";
import { getSessionUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { loadPublishedLineup } from "@/lib/squad";
import { fmt } from "@/lib/time";

export const revalidate = 300;

// The home page's data: the published first-choice XI, the next fixture, the
// latest article and recent results. The page must render even when the
// database is down, so every query is allowed to fail.
async function load() {
  try {
    const [nextEvent, article, results, lineup] = await Promise.all([
      prisma.event.findFirst({ where: { startsAt: { gte: new Date() } }, orderBy: { startsAt: "asc" } }),
      prisma.article.findFirst({
        where: { published: true },
        orderBy: { publishedAt: "desc" },
        select: { slug: true, title: true, summary: true },
      }),
      env.eaClubId
        ? prisma.eaMatch.findMany({
            where: { clubId: env.eaClubId, forfeit: false },
            orderBy: { playedAt: "desc" },
            take: 5,
            select: { id: true, outcome: true, usScore: true, oppScore: true, oppName: true },
          })
        : [],
      loadPublishedLineup(),
    ]);
    return { nextEvent, article, results, lineup };
  } catch {
    return { nextEvent: null, article: null, results: [], lineup: null };
  }
}

const OUTCOME_CLASS: Record<string, string> = {
  W: "border-success/50 bg-success/15 text-success-fg",
  D: "border-border bg-muted text-muted-foreground",
  L: "border-destructive/50 bg-destructive/15 text-destructive-fg",
};

export default async function Home() {
  const [user, { nextEvent, article, results, lineup }] = await Promise.all([getSessionUser(), load()]);

  return (
    <>
      <section className="pitch-glow relative overflow-hidden border-b">
        <Container className="relative py-16 sm:py-24">
          <div className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-label text-accent">
            <Logo className="size-5" /> {CLUB.tagline}
          </div>
          <h1 className="mt-4 max-w-3xl text-5xl font-extrabold leading-[0.95] sm:text-7xl">{CLUB.name}</h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">{CLUB.motto}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/squad">Meet the squad</Link>
            </Button>
            {CLUB.discordInvite && (
              <Button asChild size="lg" variant="outline">
                <a href={CLUB.discordInvite}>Join the Discord</a>
              </Button>
            )}
            {!user && (
              <Button asChild size="lg" variant="ghost">
                <Link href="/login">Sign in</Link>
              </Button>
            )}
          </div>
        </Container>
      </section>

      <Container>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card className="overflow-hidden">
              <CardHeader className="flex-row items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Shirt aria-hidden className="size-4 text-accent" /> First-choice XI
                  {lineup && <span className="font-mono text-xs font-normal normal-case tracking-normal text-muted-foreground">{lineup.formation}</span>}
                </CardTitle>
                <Link href="/squad" className="text-xs font-semibold uppercase tracking-wider text-accent hover:underline">
                  Full squad
                </Link>
              </CardHeader>
              <CardContent className="pitch-glow">
                {lineup ? (
                  <Pitch formation={lineup.formation} slots={lineup.slots} className="max-w-[30rem]" />
                ) : (
                  <p className="py-10 text-center text-sm text-muted-foreground">The lineup hasn&apos;t been named yet.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarDays aria-hidden className="size-4 text-accent" /> Next fixture
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {nextEvent ? (
                  <Link href={`/fixtures/${nextEvent.id}`} className="block hover:underline">
                    <span className="font-semibold">{nextEvent.title}</span>
                    <span className="mt-1 block text-muted-foreground">
                      {fmt(nextEvent.startsAt)} · <Countdown to={nextEvent.startsAt} />
                    </span>
                  </Link>
                ) : (
                  <span className="text-muted-foreground">Nothing scheduled.</span>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Trophy aria-hidden className="size-4 text-accent" /> Recent results
                </CardTitle>
              </CardHeader>
              <CardContent>
                {results.length ? (
                  <ul className="flex flex-col gap-2 text-sm">
                    {results.map((r) => (
                      <li key={r.id} className="flex items-center gap-2">
                        <span className={`tnum inline-flex w-6 justify-center rounded-sm border text-micro font-bold ${OUTCOME_CLASS[r.outcome] ?? OUTCOME_CLASS.D}`}>
                          {r.outcome}
                        </span>
                        <span className="tnum font-semibold">
                          {r.usScore ?? "-"}–{r.oppScore ?? "-"}
                        </span>
                        <span className="truncate text-muted-foreground">{r.oppName ?? "Opponent"}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-sm text-muted-foreground">No results tracked yet.</span>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Newspaper aria-hidden className="size-4 text-accent" /> Latest news
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {article ? (
                  <Link href={`/news/${article.slug}`} className="block hover:underline">
                    <span className="font-semibold">{article.title}</span>
                    {article.summary && <span className="mt-1 block text-muted-foreground">{article.summary}</span>}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">No articles yet.</span>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
        <p className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
          <Shirt aria-hidden className="size-3.5" /> Earn the shirt. Contracts, numbers and the lineup are run season by season.
        </p>
      </Container>
    </>
  );
}
