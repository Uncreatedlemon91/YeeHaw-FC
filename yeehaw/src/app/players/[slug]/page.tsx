import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { Container } from "@/components/container";
import { RibbonRack } from "@/components/ribbon-rack";
import { SquadStatusBadge } from "@/components/status-badge";
import { TabLinks } from "@/components/tab-links";
import { Badge } from "@/components/ui/badge";
import { CLUB, CLUB_ROLE_LABEL } from "@/config/club";
import { getSessionUser } from "@/lib/auth";
import { loadPlayerHub } from "@/lib/player-hub";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/time";
import { AttendanceTab, Contracts, ManagePanel, OfferBanner, Overview, positionsText, ServiceRecord, Tile } from "./sections";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const p = await prisma.player.findUnique({ where: { slug: (await params).slug }, select: { displayName: true } });
  return { title: p?.displayName ?? "Player" };
}

// The player hub. Clearance is applied in loadPlayerHub: what the viewer may
// not see arrives as null and is drawn as a redaction bar.
export default async function PlayerHub({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ tab?: string; group?: string }>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const user = await getSessionUser();
  const hub = await loadPlayerHub(slug, user);
  if (!hub) notFound();
  const { player, current, viewer } = hub;

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "contracts", label: "Contracts" },
    { key: "record", label: "Service record" },
    { key: "attendance", label: "Attendance & availability" },
    ...(viewer.isManagement ? [{ key: "manage", label: "Manage" }] : []),
  ];
  const tab = tabs.find((t) => t.key === sp.tab)?.key ?? "overview";
  const base = `/players/${player.slug}?tab=${tab}`;

  const standing =
    hub.standing === "contracted" && current
      ? null
      : hub.standing === "alumnus"
        ? "Alumnus"
        : player.clubRole
          ? CLUB_ROLE_LABEL[player.clubRole as keyof typeof CLUB_ROLE_LABEL]
          : "Not under contract";

  return (
    <Container>
      <p className="field-label mb-2">{CLUB.name} / service record</p>
      <section className="pitch-glow mb-5 flex flex-col gap-5 rounded-lg border p-5 sm:flex-row sm:items-start">
        <Avatar discordId={player.discordId} avatar={player.avatar} name={player.gamertag ?? player.displayName} size={112} className="size-28" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {current?.shirtNumber != null && <span className="tnum font-display text-3xl font-bold text-accent">#{current.shirtNumber}</span>}
            <h1 className="text-2xl font-bold uppercase sm:text-3xl">{player.displayName}</h1>
          </div>
          {player.gamertag && <p className="text-sm text-muted-foreground">{player.gamertag}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {current ? <SquadStatusBadge status={current.squadStatus} /> : <Badge variant="outline">{standing}</Badge>}
            {current && positionsText(current) && <Badge variant="info">{positionsText(current)}</Badge>}
            {current?.captaincy === "CAPTAIN" && <Badge variant="warning">Captain</Badge>}
            {current?.captaincy === "VICE" && <Badge variant="warning">Vice-captain</Badge>}
            {player.clubRole && current && <Badge variant="accent">{CLUB_ROLE_LABEL[player.clubRole as keyof typeof CLUB_ROLE_LABEL]}</Badge>}
          </div>
          <div className="mt-3">
            <RibbonRack ribbons={hub.ribbons} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:w-64">
          <Tile label="Apps" value={hub.totals.apps} />
          <Tile label="Goals" value={hub.totals.goals} />
          <Tile label="Assists" value={hub.totals.assists} />
          <Tile label="Rating" value={hub.totals.rating?.toFixed(1) ?? "—"} />
          <p className="col-span-2 text-xs text-muted-foreground">Joined {fmtDate(player.createdAt)}</p>
        </div>
      </section>

      {hub.pending.filter(() => viewer.isSelf).map((o) => (
        <OfferBanner key={o.id} offer={o} />
      ))}

      <TabLinks
        label="Player file sections"
        variant="folder"
        items={tabs.map((t) => ({ href: `/players/${player.slug}?tab=${t.key}`, label: t.label, active: t.key === tab }))}
      />

      {tab === "overview" && <Overview hub={hub} />}
      {tab === "contracts" && <Contracts hub={hub} />}
      {tab === "record" && <ServiceRecord hub={hub} group={sp.group ?? ""} base={base} />}
      {tab === "attendance" && <AttendanceTab hub={hub} />}
      {tab === "manage" && viewer.isManagement && <ManagePanel hub={hub} />}
    </Container>
  );
}
