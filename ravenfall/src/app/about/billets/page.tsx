import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { AboutCta } from "@/components/about-cta";
import { SquadEmblem } from "@/components/squad-emblem";
import { Badge } from "@/components/ui/badge";
import { ROLES, SQUADS, UNIT, type RoleDef } from "@/config/unit";
import { qualTitles, squadCap, squadStrength } from "@/lib/about";

export const metadata: Metadata = {
  title: "Billets",
  description: `The ${UNIT.name} order of battle: squads, billets and the roles and training behind them.`,
};

const roleId = (r: RoleDef) => `role-${r.code.toLowerCase()}`;

export default async function BilletsPage() {
  const slugs = [...new Set(ROLES.flatMap((r) => r.requires))];
  const [titles, strength] = await Promise.all([qualTitles(slugs), squadStrength()]);
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
          Each role lists the qualifications you need before you can request it. Training is in the unit&apos;s vault.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {ROLES.map((r) => {
            const used = SQUADS.filter((s) => s.billets[r.name]);
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
              </article>
            );
          })}
        </div>
      </section>

      <AboutCta title="Find your place" body="Tell us which role you want when you apply. We train you on the rest." />
    </>
  );
}
