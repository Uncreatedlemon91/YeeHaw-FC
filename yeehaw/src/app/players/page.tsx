import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { SquadStatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CLUB_ROLE_LABEL, POSITION_LABEL, SQUAD_STATUSES, SQUAD_STATUS_LONG } from "@/config/club";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Players" };
export const dynamic = "force-dynamic";

// Everyone with a file: staff by title, the squad under contract by status,
// then alumni. A name links to the player's hub.
export default async function PlayersPage() {
  const [contracts, staff, alumni] = await Promise.all([
    prisma.contract.findMany({
      where: { state: "ACTIVE", season: { state: { in: ["WINDOW", "ACTIVE"] } } },
      include: { player: true, season: { select: { startsAt: true } } },
    }),
    prisma.player.findMany({ where: { clubRole: { not: null } }, orderBy: { displayName: "asc" } }),
    prisma.player.findMany({
      where: {
        contracts: { some: { state: { in: ["ENDED", "RELEASED"] } }, none: { state: "ACTIVE", season: { state: { in: ["WINDOW", "ACTIVE"] } } } },
      },
      orderBy: { displayName: "asc" },
    }),
  ]);

  // Newest season's contract per player (a window can overlap two seasons).
  const live = new Map<string, (typeof contracts)[number]>();
  for (const c of contracts) {
    const have = live.get(c.playerId);
    if (!have || c.season.startsAt > have.season.startsAt) live.set(c.playerId, c);
  }

  // Appearances, goals and assists from the matches recorded for our club.
  const tags = [...live.values()].map((c) => c.player.gamertag?.toLowerCase()).filter((t): t is string => !!t);
  const lines = tags.length
    ? await prisma.eaMatchPlayer.groupBy({
        by: ["playerName"],
        where: { ...(env.eaClubId ? { match: { clubId: env.eaClubId } } : {}) },
        _count: { _all: true },
        _sum: { goals: true, assists: true },
      })
    : [];
  const stat = new Map(lines.map((l) => [l.playerName.toLowerCase(), { apps: l._count._all, goals: l._sum.goals ?? 0, assists: l._sum.assists ?? 0 }]));

  const byNumber = (a: (typeof contracts)[number], b: (typeof contracts)[number]) =>
    (a.shirtNumber ?? 1000) - (b.shirtNumber ?? 1000) || a.player.displayName.localeCompare(b.player.displayName);

  return (
    <Container>
      <PageHeader eyebrow="Club" title="Players" description="Everyone under contract, the staff, and the alumni. Open a name for their file." />
      <div className="flex flex-col gap-6">
        {staff.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Staff</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {staff.map((p) => (
                  <li key={p.id}>
                    <PlayerLink p={p} sub={p.clubRole ? CLUB_ROLE_LABEL[p.clubRole] : ""} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {SQUAD_STATUSES.map((status) => {
          const rows = [...live.values()].filter((c) => c.squadStatus === status).sort(byNumber);
          if (!rows.length) return null;
          return (
            <Card key={status}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {SQUAD_STATUS_LONG[status]}s <SquadStatusBadge status={status} />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {rows.map((c) => {
                    const s = c.player.gamertag ? stat.get(c.player.gamertag.toLowerCase()) : undefined;
                    return (
                      <li key={c.id}>
                        <PlayerLink
                          p={c.player}
                          number={c.shirtNumber}
                          sub={[c.position && POSITION_LABEL[c.position], c.captaincy === "CAPTAIN" ? "Captain" : c.captaincy === "VICE" ? "Vice-captain" : ""].filter(Boolean).join(" · ")}
                          stats={s ? `${s.apps} apps · ${s.goals} G · ${s.assists} A` : undefined}
                        />
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          );
        })}

        {live.size === 0 && <p className="text-sm text-muted-foreground">Nobody is under contract right now.</p>}

        {alumni.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Alumni</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {alumni.map((p) => (
                  <li key={p.id}>
                    <PlayerLink p={p} sub="Alumnus" />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </Container>
  );
}

function PlayerLink({
  p,
  number,
  sub,
  stats,
}: {
  p: { slug: string; discordId: string; avatar: string | null; displayName: string; gamertag: string | null };
  number?: number | null;
  sub?: string;
  stats?: string;
}) {
  return (
    <Link href={`/players/${p.slug}`} className="flex items-center gap-3 rounded-md border bg-background/40 p-2 hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Avatar discordId={p.discordId} avatar={p.avatar} name={p.gamertag ?? p.displayName} size={40} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">
          {number != null && <span className="tnum mr-1.5 text-accent">#{number}</span>}
          {p.displayName}
        </span>
        {sub && <span className="block truncate text-xs text-muted-foreground">{sub}</span>}
        {stats && <span className="tnum block truncate text-xs text-muted-foreground">{stats}</span>}
      </span>
    </Link>
  );
}
