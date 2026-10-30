import { Hand, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AboutCta } from "@/components/about-cta";
import { InterestButton } from "@/components/interest-button";
import { SquadEmblem } from "@/components/squad-emblem";
import { Badge } from "@/components/ui/badge";
import { ROLES, SQUADS, UNIT, type RoleDef } from "@/config/unit";
import { qualTitles, squadCap, squadStrength } from "@/lib/about";
import { getSessionUser } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";
import { billetFill, billetKey, type InterestPayload, missingQuals } from "@/lib/personnel";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Billets",
  description: `The ${UNIT.name} order of battle: squads, billets and the roles and training behind them.`,
};

const roleId = (r: RoleDef) => `role-${r.code.toLowerCase()}`;

/**
 * Open slots and, for a signed-in operator, what they've already put their
 * name in for. Public page: a database hiccup just hides the vacancies.
 */
async function vacancies(userId: string | null) {
  try {
    const [fill, me, interests] = await Promise.all([
      billetFill(),
      userId ? prisma.user.findUnique({ where: { id: userId }, include: { qualifications: { include: { qualification: true } } } }) : null,
      userId ? prisma.personnelRequest.findMany({ where: { userId, type: "INTEREST", status: "PENDING" }, select: { payload: true } }) : [],
    ]);
    const open = (role: string) =>
      SQUADS.filter((s) => (s.billets[role] ?? 0) > (fill.get(billetKey(s.name, role)) ?? 0)).map((s) => ({
        name: s.name,
        free: s.billets[role] - (fill.get(billetKey(s.name, role)) ?? 0),
      }));
    return { open, me, filed: interests.map((r) => r.payload as InterestPayload) };
  } catch {
    return null;
  }
}

export default async function BilletsPage() {
  const slugs = [...new Set(ROLES.flatMap((r) => r.requires))];
  const user = await getSessionUser();
  const operator = !!user && hasPerm(user.perms, "OPERATOR");
  const [titles, strength, vac] = await Promise.all([qualTitles(slugs), squadStrength(), vacancies(operator ? user.id : null)]);
  const held = vac?.me?.qualifications.map((q) => q.qualification.slug) ?? [];
  const active = vac?.me?.status === "ACTIVE";
  const slots = SQUADS.reduce((n, s) => n + squadCap(s.billets), 0);

  return (
    <>
      <p className="max-w-2xl text-muted-foreground">
        {SQUADS.length} squads and {slots} slots. A billet is a slot in a squad, and a squad only has the roles it lists. Pick a role, earn the qualifications
        for it, and request it.
      </p>

      <section className="mt-10" aria-labelledby="squads">
        <p className="text-xs font-semibold uppercase tracking-label text-accent">Order of battle</p>
        <h2 id="squads" className="mt-1 text-3xl font-bold uppercase">
          Squads & branches
        </h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {SQUADS.map((sq) => {
            const cap = squadCap(sq.billets);
            return (
              <article key={sq.name} className="rounded-lg border bg-card p-5">
                <div className="flex items-start gap-4">
                  <SquadEmblem name={sq.name} size={56} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <h3 className="text-xl font-bold uppercase">{sq.name}</h3>
                      <span className="text-micro uppercase tracking-wider text-muted-foreground">
                        {strength ? `${strength.filled[sq.name] ?? 0}/${cap} slots filled` : `${cap} slots`}
                      </span>
                    </div>
                    <p className="typed text-micro uppercase text-accent">Callsign · {sq.callsign}</p>
                    <p className="mt-2 text-sm text-muted-foreground">{sq.blurb}</p>
                  </div>
                </div>
                <ul className="mt-4 divide-y border-t text-sm">
                  {Object.entries(sq.billets).map(([role, n]) => {
                    const def = ROLES.find((r) => r.name === role);
                    return (
                      <li key={role} className="flex items-center justify-between gap-3 py-1.5">
                        <span className="flex min-w-0 items-center gap-2">
                          {def ? (
                            <a href={`#${roleId(def)}`} className="rounded text-foreground hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                              {role}
                            </a>
                          ) : (
                            role
                          )}
                          {def?.leads && <Badge variant="warning">Leads</Badge>}
                        </span>
                        <span className="typed text-muted-foreground">×{n}</span>
                      </li>
                    );
                  })}
                </ul>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-14" aria-labelledby="roles">
        <p className="text-xs font-semibold uppercase tracking-label text-accent">Roles (MOS)</p>
        <h2 id="roles" className="mt-1 text-3xl font-bold uppercase">
          Find your role
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Each role lists the qualifications you need before you can request it. Training is in the unit&apos;s vault. See an open slot you want? Express
          interest and S1 will approve or deny, even if you&apos;re not qualified yet.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {ROLES.map((r) => {
            const used = SQUADS.filter((s) => s.billets[r.name]);
            // Squads with an open slot for this role, minus the seat the viewer already holds.
            const open = (vac?.open(r.name) ?? []).filter((s) => !(vac?.me?.squad === s.name && vac?.me?.unitRole === r.name));
            const qualified = !missingQuals(r.name, held).length;
            return (
              <article key={r.code} id={roleId(r)} className="scroll-mt-20 rounded-lg border bg-card p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-xl font-bold uppercase">{r.name}</h3>
                  <Badge variant="accent" className="typed">
                    {r.code}
                  </Badge>
                  {r.leads && (
                    <Badge variant="warning">
                      <ShieldCheck /> Leadership billet
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm font-semibold text-foreground/90">{r.blurb}</p>
                {r.about && <p className="mt-2 text-sm text-muted-foreground">{r.about}</p>}
                <p className="field-label mt-4">Training to get there</p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {r.requires.map((s) => (
                    <li key={s}>
                      <Badge variant="info">{titles[s]}</Badge>
                    </li>
                  ))}
                </ul>
                {used.length > 0 && (
                  <>
                    <p className="field-label mt-4">Where it serves</p>
                    <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
                      {used.map((s) => (
                        <li key={s.name} className="flex items-center gap-1.5">
                          <SquadEmblem name={s.name} size={20} />
                          {s.name} <span className="typed text-muted-foreground">×{s.billets[r.name]}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {vac && used.length > 0 && (
                  <div className="mt-4 border-t pt-4">
                    <p className="field-label flex items-center gap-1.5">
                      <Hand className="size-3 text-accent" aria-hidden /> Open slots
                    </p>
                    {open.length ? (
                      <>
                        <p className="mt-1.5 text-sm text-muted-foreground">
                          {open.map((s) => `${s.name} ×${s.free}`).join(" · ")}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {!user ? (
                            <Link
                              href={`/login?callbackUrl=${encodeURIComponent(`/about/billets#${roleId(r)}`)}`}
                              className="text-sm text-accent underline-offset-4 hover:underline"
                            >
                              Sign in to express interest
                            </Link>
                          ) : !operator ? (
                            <Link href="/apply" className="text-sm text-accent underline-offset-4 hover:underline">
                              Enlist first, then put your name in
                            </Link>
                          ) : !active ? (
                            <p className="text-sm text-muted-foreground">Only active members can volunteer for a billet.</p>
                          ) : (
                            <>
                              <InterestButton
                                role={r.name}
                                squads={open.map((s) => s.name)}
                                filed={vac.filed.filter((f) => f.role === r.name).map((f) => f.squad)}
                                size="sm"
                              />
                              {qualified && (
                                <Link
                                  href={`/roster/${user.id}?tab=billet&squad=${encodeURIComponent(open[0].name)}&role=${encodeURIComponent(r.name)}`}
                                  className="text-sm text-success-fg underline-offset-4 hover:underline"
                                >
                                  You&apos;re qualified: request it directly
                                </Link>
                              )}
                            </>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="mt-1.5 text-sm text-muted-foreground">Every slot is filled right now.</p>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <AboutCta title="Find your place" body="Tell us which role you want when you apply. We train you on the rest." />
    </>
  );
}
