import type { User } from "@prisma/client";
import { CalendarOff, ChevronDown, Plus } from "lucide-react";
import Link from "next/link";
import { RankInsignia } from "@/components/insignia";
import { InterestButton } from "@/components/interest-button";
import { ReadinessStamp, readiness, StrengthBar, StrengthLegend, type SlotState } from "@/components/roster-strength";
import { SquadEmblem } from "@/components/squad-emblem";
import { rankIndex, roleDef, SQUADS, UNIT } from "@/config/unit";
import { type InterestPayload, missingQuals, onLeave } from "@/lib/personnel";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

// The roster by element (the order of battle): every squad's billets as
// slots, filled or vacant, then everyone without a slot.
export async function OrbatView({ me }: { me: { id: string } }) {
  const [members, mine, interests] = await Promise.all([
    prisma.user.findMany({ where: { status: { in: ["ACTIVE", "INACTIVE"] } } }),
    prisma.user.findUnique({ where: { id: me.id }, include: { qualifications: { include: { qualification: true } } } }),
    prisma.personnelRequest.findMany({ where: { userId: me.id, type: "INTEREST", status: "PENDING" }, select: { payload: true } }),
  ]);
  const filed = interests.map((r) => r.payload as InterestPayload);
  const away = await onLeave(members.map((m) => m.id));
  const held = mine?.qualifications.map((q) => q.qualification.slug) ?? [];
  const canRequest = mine?.status === "ACTIVE";
  const byRank = (a: User, b: User) => rankIndex(b.rank) - rankIndex(a.rank);

  const stateOf = (u: User): SlotState => (u.status === "INACTIVE" ? "inactive" : away.has(u.id) ? "loa" : "filled");
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
    // One state per slot, billet by billet: seated holders first, then vacancies.
    const slots: SlotState[] = billets.flatMap((b) => [
      ...b.holders.slice(0, b.cap).map(stateOf),
      ...Array.from({ length: Math.max(0, b.cap - b.holders.length) }, () => "vacant" as const),
    ]);
    const over = billets.reduce((n, b) => n + Math.max(0, b.holders.length - b.cap), 0);
    const available = slots.filter((x) => x === "filled").length;
    return { ...s, billets, filled, cap, slots, over, available, ready: readiness(available, cap) };
  });
  const pool = members.filter((m) => !placed.has(m.id)).sort(byRank);
  const strength = squads.reduce((n, s) => n + s.filled, 0);
  const establishment = squads.reduce((n, s) => n + s.cap, 0);
  const allSlots = squads.flatMap((s) => s.slots);
  const unitOver = squads.reduce((n, s) => n + s.over, 0);
  const unitAvailable = squads.reduce((n, s) => n + s.available, 0);
  const unitCount = (k: SlotState) => allSlots.filter((x) => x === k).length;

  return (
    <>
      <section aria-label="Unit strength" className="jacket mb-5 rounded-lg border p-4">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="flex items-baseline gap-3">
            <div className="font-display text-4xl font-bold leading-none">
              {strength}
              <span className="text-muted-foreground">/{establishment}</span>
            </div>
            <div>
              <div className="field-label">{UNIT.name} strength</div>
              <div className="text-xs text-muted-foreground">
                {Math.round((strength / Math.max(1, establishment)) * 100)}% of billets filled · {unitAvailable} available now
              </div>
            </div>
          </div>
          <ReadinessStamp level={readiness(unitAvailable, establishment)} />
        </div>
        <StrengthBar states={allSlots} over={unitOver} label="Unit strength" className="mt-3" />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <StrengthLegend />
          <p className="typed text-micro uppercase text-muted-foreground">
            {unitCount("loa")} on leave · {unitCount("inactive")} inactive · {unitCount("vacant")} vacant
          </p>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Vacant slots you&apos;re qualified for link straight to a billet request. For the rest, put your name in with{" "}
          <span className="uppercase tracking-wider text-accent">Interested</span> and S1 will approve or deny.
        </p>
      </section>

      <div className="grid items-start gap-5 md:grid-cols-2 xl:grid-cols-3">
        {squads.map((s) => (
          <section key={s.name} className={cn("jacket min-w-0 rounded-lg border", s.name === "Command" && "md:col-span-2 xl:col-span-3")}>
            <header className="flex items-start gap-3 px-4 pb-3 pt-3">
              <SquadEmblem name={s.name} size={40} />
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold uppercase tracking-wider">{s.name}</h2>
                <p className="typed text-micro uppercase text-accent">“{s.callsign}”</p>
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
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-foreground/10 px-4 pb-3">
              <StrengthBar states={s.slots} over={s.over} label={`${s.name} strength`} className="min-w-[10rem] flex-1" />
              <ReadinessStamp level={s.ready} />
            </div>
            <div className={cn("grid gap-3 p-4", s.name === "Command" && "sm:grid-cols-2")}>
              {s.billets.map((b) => {
                const role = roleDef(b.role);
                const qualified = canRequest && !missingQuals(b.role, held).length;
                const ownSeat = mine?.squad === s.name && mine?.unitRole === b.role;
                const vacant = Math.max(0, b.cap - b.holders.length);
                return (
                  <div key={b.role} className="min-w-0">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider">{b.role}</span>
                      <span className="typed text-micro text-muted-foreground">
                        {role?.code} · {b.holders.length}/{b.cap}
                        {b.holders.length > b.cap && <span className="ml-1 font-bold text-destructive-fg">+{b.holders.length - b.cap}</span>}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-1.5 min-[420px]:grid-cols-2">
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
                          {i >= b.cap && <span className="typed shrink-0 text-micro font-bold text-destructive-fg">+</span>}
                          {h.status === "INACTIVE" && <span className="typed shrink-0 text-micro uppercase text-muted-foreground">Inactive</span>}
                          {away.has(h.id) && (
                            <span className="ml-auto flex shrink-0 items-center gap-1 text-micro uppercase tracking-wider text-accent">
                              <CalendarOff className="size-3" aria-hidden /> LOA
                            </span>
                          )}
                        </Link>
                      ))}
                    </div>
                    {vacant > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                        <details className="group min-w-0">
                          <summary className="flex min-h-6 cursor-pointer list-none items-center gap-1 rounded-sm text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                            <ChevronDown className="size-3 transition-transform group-open:rotate-180" aria-hidden />
                            {vacant} vacant
                          </summary>
                          <div className="mt-1 grid grid-cols-1 gap-1.5 min-[420px]:grid-cols-2">
                            {Array.from({ length: vacant }, (_, i) => (
                              <div key={i} className="rounded-sm border border-dashed px-2 py-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                                Open slot
                              </div>
                            ))}
                          </div>
                        </details>
                        {canRequest && !qualified && !ownSeat && (
                          <InterestButton
                            role={b.role}
                            squads={[s.name]}
                            filed={filed.filter((f) => f.role === b.role).map((f) => f.squad)}
                          />
                        )}
                        {qualified && (
                          <Link
                            href={`/roster/${me.id}?tab=billet&squad=${encodeURIComponent(s.name)}&role=${encodeURIComponent(b.role)}`}
                            className="flex items-center gap-1 rounded-sm border border-dashed border-success/50 px-2 py-0.5 text-xs uppercase tracking-wider text-success-fg hover:bg-success/10"
                          >
                            <Plus className="size-3" aria-hidden /> Request
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {pool.length > 0 && (
          <section className="min-w-0 rounded-lg border p-4">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-label">Replacement pool</h2>
            <p className="mb-3 text-xs text-muted-foreground">Members with no billet, or a role their element has no slot for.</p>
            <div className="flex flex-wrap gap-1.5">
              {pool.map((m) => (
                <Link key={m.id} href={`/roster/${m.id}`} className="flex min-w-0 items-center gap-1.5 rounded-sm border bg-background/50 px-2 py-1 text-xs hover:border-accent">
                  <RankInsignia rank={m.rank} size={16} />
                  <span className="truncate font-semibold">{m.callsign ?? m.discordUsername}</span>
                  {m.squad && <span className="truncate text-muted-foreground">{[m.squad, m.unitRole].filter(Boolean).join(" · ")}</span>}
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
