import Link from "next/link";
import { FormStrip } from "@/components/charts";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CLUB_ROLE_LABEL } from "@/config/club";
import { getProfile } from "@/lib/club-profile";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { liveSquad } from "@/lib/squad";
import { recentForm, recordOf } from "@/lib/stats-rules";
import { fmt } from "@/lib/time";

export const metadata = { title: "Club" };
export const dynamic = "force-dynamic";

// The club in one page, for people outside the Discord as much as in it: what
// the club says about itself (the profile management edit on /admin/club) and
// what the site already knows. Port of the old public welcome page; every
// query may fail without taking the page down.
async function load() {
  const [profile, squad, staff, nextEvent, matches] = await Promise.all([
    getProfile(),
    liveSquad().catch(() => []),
    prisma.player.findMany({ where: { clubRole: { not: null } }, select: { displayName: true, slug: true, clubRole: true } }).catch(() => []),
    prisma.event.findFirst({ where: { startsAt: { gte: new Date() } }, orderBy: { startsAt: "asc" }, select: { id: true, title: true, startsAt: true } }).catch(() => null),
    env.eaClubId
      ? prisma.eaMatch.findMany({ where: { clubId: env.eaClubId, platform: env.eaPlatform }, orderBy: { playedAt: "asc" }, select: { matchId: true, playedAt: true, matchType: true, usScore: true, oppScore: true, oppName: true, outcome: true, forfeit: true, eventId: true } }).catch(() => [])
      : [],
  ]);
  const order = ["PRESIDENT", "HEAD_COACH", "COACH"];
  staff.sort((a, b) => order.indexOf(a.clubRole!) - order.indexOf(b.clubRole!) || a.displayName.localeCompare(b.displayName));
  return { profile, squad, staff, nextEvent, matches };
}

export default async function Page() {
  const { profile, squad, staff, nextEvent, matches } = await load();
  const rec = recordOf(matches);
  const facts = [
    ["When we play", profile.matchNights],
    ["Region", profile.region],
    ["Platform", profile.platform],
    ["How we play", profile.playStyle],
  ].filter(([, v]) => v);

  return (
    <Container>
      <PageHeader eyebrow="Club" title={env.eaClubName} description={profile.headline || undefined} actions={
        <>
          <Button asChild variant="outline" size="sm"><Link href="/club/stats">Stats</Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/club/league">League table</Link></Button>
        </>
      } />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-6">
          {profile.about && (
            <Card>
              <CardHeader><CardTitle>About the club</CardTitle></CardHeader>
              <CardContent className="whitespace-pre-line text-sm leading-relaxed">{profile.about}</CardContent>
            </Card>
          )}
          {facts.length > 0 && (
            <Card>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {facts.map(([k, v]) => (
                  <div key={k}>
                    <p className="field-label">{k}</p>
                    <p className="text-sm">{v}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {profile.recruiting && (
            <Card>
              <CardHeader><CardTitle>Join us</CardTitle></CardHeader>
              <CardContent className="whitespace-pre-line text-sm">{profile.recruiting}</CardContent>
            </Card>
          )}
        </div>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader><CardTitle>At a glance</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Squad</span>
                <Link href="/squad" className="font-semibold hover:underline">{squad.length} players</Link>
              </div>
              {rec.played > 0 && (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Record</span>
                    <span className="font-semibold">{rec.won}W {rec.drawn}D {rec.lost}L</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Recent</span>
                    <FormStrip form={recentForm(matches, 5)} />
                  </div>
                </>
              )}
              {nextEvent && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Next</span>
                  <Link href={`/fixtures/${nextEvent.id}`} className="text-right font-semibold hover:underline">
                    {nextEvent.title}<br /><span className="text-xs font-normal text-muted-foreground">{fmt(nextEvent.startsAt)}</span>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
          {staff.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Staff</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                {staff.map((p) => (
                  <div key={p.slug} className="flex items-center justify-between gap-3">
                    <Link href={`/players/${p.slug}`} className="font-semibold hover:underline">{p.displayName}</Link>
                    <span className="text-xs text-muted-foreground">{CLUB_ROLE_LABEL[p.clubRole!]}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </Container>
  );
}
