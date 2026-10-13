import type { User } from "@prisma/client";
import { CalendarOff, Plus } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/container";
import { RankInsignia } from "@/components/insignia";
import { PageHeader } from "@/components/page-header";
import { rankIndex, roleDef, SQUADS, UNIT } from "@/config/unit";
import { requireUser } from "@/lib/auth";
import { missingQuals, onLeave } from "@/lib/personnel";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

export const metadata = { title: "ORBAT" };
export const dynamic = "force-dynamic";

// Order of battle: every squad's billets as slots, filled or vacant.
export default async function Orbat() {
  const me = await requireUser("OPERATOR", "/orbat");
  const [members, mine] = await Promise.all([
    prisma.user.findMany({ where: { status: { in: ["ACTIVE", "INACTIVE"] } } }),
    prisma.user.findUnique({ where: { id: me.id }, include: { qualifications: { include: { qualification: true } } } }),
  ]);
  const away = await onLeave(members.map((m) => m.id));
  const held = mine?.qualifications.map((q) => q.qualification.slug) ?? [];
  const canRequest = mine?.status === "ACTIVE";
  const byRank = (a: User, b: User) => rankIndex(b.rank) - rankIndex(a.rank);

  const placed = new Set<string>();
  const squads = SQUADS.map((s) => {
    const inSquad = members.filter((m) => m.squad === s.name);
    const billets = Object.entries(s.billets).map(([role, cap]) => {
      const holders = inSquad.filter((m) => m.unitRole === role).sort(byRank);
      holders.forEach((h) => placed.add(h.id));
      return { role, cap, holders };
    });
    const filled = billets.reduce((n, b) => n + Math.min(b.holders.length, b.cap), 0);
    const cap = billets.reduce((n, b) => n + b.cap, 0);
    return { ...s, billets, filled, cap };
  });
  const pool = members.filter((m) => !placed.has(m.id)).sort(byRank);
  const strength = squads.reduce((n, s) => n + s.filled, 0);
  const establishment = squads.reduce((n, s) => n + s.cap, 0);

  return (
    <Container>
      <PageHeader
        eyebrow="S3 · Order of battle"
        title="ORBAT"
        description={`${UNIT.name} at ${strength} of ${establishment} billets filled. Vacant slots you're qualified for link straight to a billet request.`}
      />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {squads.map((s) => (
          <section key={s.name} className={cn("jacket rounded-lg border", s.name === "Command" && "md:col-span-2 xl:col-span-3")}>
            <header className="flex items-start justify-between gap-3 border-b border-foreground/10 px-4 py-3">
              <div>
                <h2 className="text-lg font-bold uppercase tracking-wider">{s.name}</h2>
                <p className="typed text-[11px] uppercase text-accent">“{s.callsign}”</p>
                <p className="mt-1 text-xs text-muted-foreground">{s.blurb}</p>
              </div>
              <div className="text-right">
                <div className="font-display text-2xl font-bold">
                  {s.filled}
                  <span className="text-muted-foreground">/{s.cap}</span>
                </div>
                <div className="field-label">Strength</div>
              </div>
            </header>
            <div className={cn("grid gap-3 p-4", s.name === "Command" && "sm:grid-cols-2")}>
              {s.billets.map((b) => {
                const role = roleDef(b.role);
                const qualified = canRequest && !missingQuals(b.role, held).length;
                return (
                  <div key={b.role}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider">{b.role}</span>
                      <span className="typed text-[10px] text-muted-foreground">
                        {role?.code} · {b.holders.length}/{b.cap}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {b.holders.map((h, i) => (
                        <Link
                          key={h.id}
                          href={`/roster/${h.id}`}
                          className={cn(
                            "flex min-w-0 items-center gap-1.5 rounded-sm border bg-background/50 px-2 py-1.5 text-xs hover:border-accent",
                            i >= b.cap && "border-destructive/60",
                            h.id === me.id && "border-accent/60",
                            h.status === "INACTIVE" && "opacity-60",
                          )}
                          title={i >= b.cap ? "Over strength" : undefined}
                        >
                          <RankInsignia rank={h.rank} size={16} />
                          <span className="truncate font-semibold">{h.callsign ?? h.discordUsername}</span>
                          {away.has(h.id) && <CalendarOff className="ml-auto size-3 shrink-0 text-accent" aria-label="On leave" />}
                        </Link>
                      ))}
                      {Array.from({ length: Math.max(0, b.cap - b.holders.length) }, (_, i) =>
                        qualified ? (
                          <Link
                            key={`v${i}`}
                            href={`/roster/${me.id}?tab=billet&squad=${encodeURIComponent(s.name)}&role=${encodeURIComponent(b.role)}`}
                            className="flex items-center gap-1.5 rounded-sm border border-dashed border-success/50 px-2 py-1.5 text-xs uppercase tracking-wider text-green-300/80 hover:bg-success/10"
                          >
                            <Plus className="size-3" /> Vacant · request
                          </Link>
                        ) : (
                          <div key={`v${i}`} className="rounded-sm border border-dashed px-2 py-1.5 text-xs uppercase tracking-wider text-muted-foreground/60">
                            Vacant
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {pool.length > 0 && (
        <section className="mt-6 rounded-lg border p-4">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-[0.2em]">Replacement pool</h2>
          <p className="mb-3 text-xs text-muted-foreground">Members with no billet, or a role their element has no slot for.</p>
          <div className="flex flex-wrap gap-1.5">
            {pool.map((m) => (
              <Link key={m.id} href={`/roster/${m.id}`} className="flex items-center gap-1.5 rounded-sm border bg-background/50 px-2 py-1 text-xs hover:border-accent">
                <RankInsignia rank={m.rank} size={16} />
                <span className="font-semibold">{m.callsign ?? m.discordUsername}</span>
                {m.squad && <span className="text-muted-foreground">{[m.squad, m.unitRole].filter(Boolean).join(" · ")}</span>}
              </Link>
            ))}
          </div>
        </section>
      )}
    </Container>
  );
}
