import Link from "next/link";
import { DivergingBars, FormStrip, TrendChart } from "@/components/charts";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { TabLinks } from "@/components/tab-links";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { loadStats, type Stats } from "@/lib/club-stats";
import { monthLabel } from "@/lib/service-record";
import { fmtDate } from "@/lib/time";

export const metadata = { title: "Stats" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "players", label: "Players" },
  { key: "matches", label: "Matches" },
  { key: "competition", label: "Competition" },
] as const;

const n = (v: number | null | undefined, digits = 0) => (v === null || v === undefined ? "-" : v.toFixed(digits));

// The club's EA numbers as the hourly poll recorded them: record, skill
// rating over time, players, matches and head-to-head. Public. Port of the
// old stats.html + charts.js, drawn on the server with inline SVG.
export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: raw } = await searchParams;
  const tab = TABS.find((t) => t.key === raw)?.key ?? "overview";
  const stats = await loadStats();

  return (
    <Container>
      <PageHeader eyebrow="Club" title="Stats" description="Season totals and per-player lines from EA, polled hourly." />
      {!stats ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Stats appear once the club&apos;s EA connection is switched on (EA_CLUB_ID in the site&apos;s settings).</CardContent>
        </Card>
      ) : (
        <>
          <TabLinks label="Stats sections" items={TABS.map((t) => ({ href: `/club/stats?tab=${t.key}`, label: t.label, active: t.key === tab }))} />
          {tab === "overview" && <Overview s={stats} />}
          {tab === "players" && <Players s={stats} />}
          {tab === "matches" && <Matches s={stats} />}
          {tab === "competition" && <Competition s={stats} />}
          <p className="mt-6 text-xs text-muted-foreground">
            {stats.trackedSince ? `Tracked since ${fmtDate(stats.trackedSince)}. ` : ""}EA only keeps its most recent matches, so a match we never polled is missing from the match history; the player totals marked &quot;EA&quot; are EA&apos;s own and include those.
          </p>
        </>
      )}
    </Container>
  );
}

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="field-label">{label}</p>
        <p className="tnum mt-1 font-display text-2xl font-bold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function Overview({ s }: { s: Stats }) {
  const l = s.latest;
  const gd = s.record.gf - s.record.ga;
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Skill rating" value={n(l?.skillRating)} sub="EA's club strength number" />
        <Tile label="Played" value={s.eaPlayed ?? s.record.played} sub={s.eaPlayed != null ? "per EA, all matches" : "recorded matches"} />
        <Tile label="Record" value={`${l?.wins ?? s.record.won}-${l?.ties ?? s.record.drawn}-${l?.losses ?? s.record.lost}`} sub="W-D-L per EA" />
        <Tile label="Goals" value={`${l?.goals ?? s.record.gf}:${l?.goalsAgainst ?? s.record.ga}`} sub="for : against per EA" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Skill rating</CardTitle>
            <CardDescription>One reading per poll.</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart
              title="Skill rating over time"
              unit=""
              points={s.skillSeries.map((p) => ({ label: fmtDate(p.at), value: p.value }))}
              summary={s.skillSeries.length ? `Now ${s.skillSeries[s.skillSeries.length - 1].value}.` : "No readings yet."}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Goal difference</CardTitle>
            <CardDescription>Last {s.goalDiff.length} matches, oldest first.</CardDescription>
          </CardHeader>
          <CardContent>
            <DivergingBars
              title="Goal difference per match"
              points={s.goalDiff.map((m) => ({ label: `${m.at ? fmtDate(m.at) : "?"} vs ${m.opp ?? "?"}`, value: m.value }))}
              summary={`Recorded matches: ${gd > 0 ? "+" : ""}${gd} overall.`}
            />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Form</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4 text-sm">
          <FormStrip form={s.form} label="Last five results, oldest to newest" />
          <span className="text-muted-foreground">
            {s.record.played} recorded: {s.record.won}W {s.record.drawn}D {s.record.lost}L, goal difference {gd > 0 ? "+" : ""}
            {gd}
          </span>
        </CardContent>
      </Card>
      {s.potm.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Player of the Month</CardTitle>
            <CardDescription>The squad&apos;s Man of the Match votes decide it.</CardDescription>
          </CardHeader>
          <ul className="divide-y">
            {s.potm.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 text-sm">
                <span className="w-36 text-muted-foreground">{monthLabel(p.month)}</span>
                <span className="font-semibold">
                  {p.winners.map((w, i) => (
                    <span key={w.slug}>
                      {i > 0 && " & "}
                      <Link href={`/players/${w.slug}`} className="hover:underline">
                        {w.name}
                      </Link>
                    </span>
                  ))}
                </span>
                <span className="text-xs text-muted-foreground">
                  {p.votes} vote{p.votes === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Players({ s }: { s: Stats }) {
  if (!s.players.length) return <Card><CardContent className="p-6 text-sm text-muted-foreground">No player lines recorded yet.</CardContent></Card>;
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <THead>
            <TR>
              <TH>Player</TH>
              <TH className="text-right">Apps</TH>
              <TH className="text-right">Goals</TH>
              <TH className="text-right">Assists</TH>
              <TH className="text-right">MOTM</TH>
              <TH className="text-right">Clean sheets</TH>
              <TH className="text-right">Avg rating</TH>
              <TH className="text-right">Form</TH>
            </TR>
          </THead>
          <TBody>
            {s.players.map((p) => {
              // EA's own totals are complete where our match table isn't; prefer them when the poll has them.
              const e = p.ea;
              return (
                <TR key={p.key}>
                  <TD className="font-medium">
                    {p.slug ? (
                      <Link href={`/players/${p.slug}`} className="hover:underline">
                        {p.display}
                      </Link>
                    ) : (
                      p.display
                    )}
                    {p.display !== p.name && <span className="ml-2 text-xs text-muted-foreground">{p.name}</span>}
                  </TD>
                  <TD className="tnum text-right">{e?.gamesPlayed ?? p.apps}</TD>
                  <TD className="tnum text-right">{e?.goals ?? p.goals}</TD>
                  <TD className="tnum text-right">{e?.assists ?? p.assists}</TD>
                  <TD className="tnum text-right">{e?.mom ?? p.mom}</TD>
                  <TD className="tnum text-right">{e?.cleanSheets ?? p.cleanSheets}</TD>
                  <TD className="tnum text-right">{n(e?.ratingAvg ?? p.rating, 1)}</TD>
                  <TD className="tnum text-right">{n(p.form, 1)}</TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function Matches({ s }: { s: Stats }) {
  if (!s.matches.length) return <Card><CardContent className="p-6 text-sm text-muted-foreground">No matches recorded yet.</CardContent></Card>;
  return (
    <Card>
      <ul className="divide-y">
        {s.matches.slice(0, 60).map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
            <Badge variant={m.outcome === "W" ? "success" : m.outcome === "L" ? "destructive" : "outline"}>{m.outcome}</Badge>
            <span className="tnum font-bold">
              {m.usScore ?? "?"}–{m.oppScore ?? "?"}
            </span>
            <span className="min-w-0 truncate text-muted-foreground">vs {m.oppName ?? "Opponent"}</span>
            {m.forfeit && <Badge variant="outline">Forfeit</Badge>}
            <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
              <span>{m.matchType === "playoffMatch" ? "Playoff" : "League"}</span>
              {m.playedAt && <span>{fmtDate(m.playedAt)}</span>}
              {m.eventId && (
                <Link href={`/fixtures/${m.eventId}`} className="text-accent underline underline-offset-2">
                  Report
                </Link>
              )}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Competition({ s }: { s: Stats }) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Head to head</CardTitle>
          <CardDescription>
            Our record against every club we have faced (forfeits left out). See the{" "}
            <Link href="/club/league" className="text-accent underline underline-offset-2">
              league table
            </Link>{" "}
            for where that puts us.
          </CardDescription>
        </CardHeader>
        {s.rivals.length ? (
          <Table>
            <THead>
              <TR>
                <TH>Opponent</TH>
                <TH className="text-right">P</TH>
                <TH className="text-right">W</TH>
                <TH className="text-right">D</TH>
                <TH className="text-right">L</TH>
                <TH className="text-right">GF:GA</TH>
                <TH className="text-right">Last</TH>
              </TR>
            </THead>
            <TBody>
              {s.rivals.map((r) => (
                <TR key={r.name}>
                  <TD className="font-medium">{r.name}</TD>
                  <TD className="tnum text-right">{r.played}</TD>
                  <TD className="tnum text-right">{r.won}</TD>
                  <TD className="tnum text-right">{r.drawn}</TD>
                  <TD className="tnum text-right">{r.lost}</TD>
                  <TD className="tnum text-right">
                    {r.gf}:{r.ga}
                  </TD>
                  <TD className="text-right">{r.lastOutcome && <FormStrip form={[r.lastOutcome]} label="Last meeting" />}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <CardContent className="text-sm text-muted-foreground">No opponents recorded yet.</CardContent>
        )}
      </Card>
    </div>
  );
}
