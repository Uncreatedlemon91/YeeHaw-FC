import { Container } from "@/components/container";
import { FormStrip } from "@/components/charts";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { env } from "@/lib/env";
import { loadLeague } from "@/lib/club-stats";

export const metadata = { title: "League table" };
export const dynamic = "force-dynamic";

// The auto-built league table (port of league.html): every club we have faced
// that sits in our tier, ranked by skill rating. EA exposes no league of its
// own, so the roster grows from real opponents, capped at EA_LEAGUE_MAX_TEAMS.
export default async function Page() {
  const league = await loadLeague();
  const max = env.eaLeagueMaxTeams;
  return (
    <Container>
      <PageHeader eyebrow="Club" title="League table" description="Every club we've faced in our tier, ranked by skill rating." />
      {!league ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">The table fills in once the club&apos;s EA connection is switched on.</CardContent>
        </Card>
      ) : (
        <>
          <details className="mb-5 max-w-3xl rounded-md border bg-card p-4 text-sm text-muted-foreground">
            <summary className="cursor-pointer font-semibold text-foreground">How is this ranked?</summary>
            <div className="mt-3 flex flex-col gap-3">
              <p>
                {league.ourDivision ? "Every club we've faced that EA's leaderboard currently groups in the same tier as us, built automatically from real matches" : "Every club we've faced"}: not a
                curated list, and not EA&apos;s own league table (it doesn&apos;t expose one). Up to {max} teams; once full, the lowest-rated drops off to make room for a newly-played opponent.
              </p>
              <p>
                Clubs are ranked by <strong className="text-foreground">skill rating</strong> rather than points: points only ever go up, so they reward playing a lot as much as playing well, and clubs here have
                very different match counts.
              </p>
              <p>The tier comes from EA&apos;s all-time leaderboard, which lags well behind live play, so it isn&apos;t the division any of these clubs is in right now. It only keeps the table to comparable opponents; every number in the table itself is current.</p>
            </div>
          </details>
          {league.table.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">No league data yet. This fills in as matches are polled and recorded; check back after the next poll, or once we&apos;ve played someone new.</CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <THead>
                    <TR>
                      <TH className="w-12">#</TH>
                      <TH>Club</TH>
                      <TH className="text-right" title="Matches played">P</TH>
                      <TH className="text-right" title="Skill rating: EA's club strength rating">SR</TH>
                      <TH className="hidden text-right sm:table-cell">Squad</TH>
                      <TH>Last 5</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {league.table.map((r, i) => (
                      <TR key={r.clubId} className={r.isUs ? "bg-accent/10" : undefined}>
                        <TD className="tnum">{i + 1}</TD>
                        <TD className="font-medium">
                          {r.label} {r.isUs && <Badge variant="accent">Us</Badge>}
                        </TD>
                        <TD className="tnum text-right">{r.hasData ? r.played : "-"}</TD>
                        <TD className="tnum text-right font-semibold">{r.skillRating ?? "-"}</TD>
                        <TD className="tnum hidden text-right sm:table-cell">{r.teamSize ?? "-"}</TD>
                        <TD>
                          <FormStrip form={r.form} label={`${r.label}: last ${r.form.length} results, oldest to newest`} />
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </CardContent>
            </Card>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            <strong>P</strong> matches played · <strong>SR</strong> skill rating · {league.rosterSize} of {max} table slots filled.
          </p>
          {league.excluded.length > 0 && (
            <div className="mt-5 max-w-3xl text-xs text-muted-foreground">
              <p className="mb-1 font-semibold">
                {league.excluded.length} more tracked club{league.excluded.length === 1 ? "" : "s"} not shown (in a different tier, or not polled yet):
              </p>
              <ul className="list-disc pl-5">
                {league.excluded.map((e) => (
                  <li key={e.label}>
                    {e.label}, {e.polled ? "different tier" : "not polled yet"}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Container>
  );
}
