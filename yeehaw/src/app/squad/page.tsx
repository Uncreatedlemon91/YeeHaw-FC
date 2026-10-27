import { ArrowRight, Pencil } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/container";
import { Bench, Pitch } from "@/components/pitch";
import { SquadCard } from "@/components/squad-card";
import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SQUAD_STATUSES, SQUAD_STATUS_LONG } from "@/config/club";
import { getSessionUser } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";
import { liveSquad, loadPublishedLineup } from "@/lib/squad";
import { fmtDate } from "@/lib/time";

export const metadata = { title: "Squad" };
export const dynamic = "force-dynamic";

// The club's shop window: the published first-choice XI on a pitch, the bench,
// then everyone else under contract by squad status. Public.
export default async function Page() {
  const [user, squad] = await Promise.all([getSessionUser(), liveSquad()]);
  const lineup = await loadPublishedLineup(squad);
  const isStaff = hasPerm(user?.perms, "STAFF");
  const placed = lineup ? new Set([...lineup.starters, ...lineup.bench]) : new Set<string>();
  const rest = squad.filter((e) => !placed.has(e.playerId));
  const captain = squad.find((e) => e.captaincy === "CAPTAIN");
  const vice = squad.find((e) => e.captaincy === "VICE");

  return (
    <>
      <section className="pitch-glow border-b">
        <Container className="pb-10 pt-8">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-label text-accent">The team</p>
              <h1 className="text-3xl font-extrabold uppercase sm:text-5xl">First-choice XI</h1>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                {lineup
                  ? `${lineup.formation}${lineup.publishedAt ? ` · named ${fmtDate(lineup.publishedAt)}` : ""}. Tap a player for their file.`
                  : "The coaches haven't named a lineup yet."}
              </p>
            </div>
            {isStaff && (
              <Button asChild variant="outline" size="sm">
                <Link href="/staff/lineup">
                  <Pencil aria-hidden /> Edit lineup
                </Link>
              </Button>
            )}
          </div>

          {lineup ? (
            <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,30rem)_1fr]">
              <Pitch formation={lineup.formation} slots={lineup.slots} />
              <div className="flex flex-col gap-6">
                {(captain || vice) && (
                  <div>
                    <h2 className="field-label mb-2">Armbands</h2>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {[
                        { e: captain, label: "Captain" },
                        { e: vice, label: "Vice-captain" },
                      ].map(({ e, label }) =>
                        e ? (
                          <Link key={label} href={`/players/${e.slug}`} className="flex items-center gap-3 rounded-lg border bg-card p-3 hover:bg-muted">
                            <Avatar discordId={e.discordId} avatar={e.avatar} name={e.name} size={40} className="rounded-full" />
                            <span className="min-w-0">
                              <span className="block truncate font-semibold">{e.name}</span>
                              <Badge variant="warning">{label}</Badge>
                            </span>
                          </Link>
                        ) : null,
                      )}
                    </div>
                  </div>
                )}
                <div>
                  <h2 className="field-label mb-2">Substitutes</h2>
                  <div className="rounded-lg border bg-card p-3">
                    <Bench formation={lineup.formation} slots={lineup.slots} hideEmpty />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              No lineup published yet.{isStaff ? " Build one on the lineup board." : " Check back soon."}
            </div>
          )}
        </Container>
      </section>

      <Container>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-xl font-bold uppercase">{lineup ? "The rest of the squad" : "The squad"}</h2>
          <Link href="/players" className="inline-flex items-center gap-1 text-sm text-accent underline-offset-2 hover:underline">
            Every player, staff and alumni <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
        {squad.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody is under contract right now.</p>
        ) : rest.length === 0 ? (
          <p className="text-sm text-muted-foreground">Everyone under contract is in the XI or on the bench.</p>
        ) : (
          <div className="flex flex-col gap-8">
            {SQUAD_STATUSES.map((s) => {
              const list = rest.filter((e) => e.squadStatus === s);
              if (!list.length) return null;
              return (
                <section key={s}>
                  <h3 className="field-label mb-3">
                    {SQUAD_STATUS_LONG[s]}s <span className="text-muted-foreground/70">· {list.length}</span>
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {list.map((e) => (
                      <SquadCard key={e.playerId} entry={e} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </Container>
    </>
  );
}
