import { Check, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { AboutCta } from "@/components/about-cta";
import { RankInsignia } from "@/components/insignia";
import { Badge } from "@/components/ui/badge";
import { RANKS, UNIT, type RankDef } from "@/config/unit";
import { qualTitles } from "@/lib/about";

export const metadata: Metadata = {
  title: "Ranks",
  description: `The ${UNIT.name} rank structure, from Recruit to Commander, and what it takes to earn each rank.`,
};

const TIERS: { key: RankDef["tier"]; label: string; blurb: string }[] = [
  { key: "enlisted", label: "Enlisted", blurb: "Where everyone starts. Turn up, train and learn the drills." },
  { key: "nco", label: "Non-commissioned officers", blurb: "From Sergeant up, leadership has to sign off on each step." },
  { key: "officer", label: "Officers", blurb: "The same steps carry on, and the time between them keeps growing." },
];

export default async function RanksPage() {
  const slugs = [...new Set(RANKS.flatMap((r) => r.requires?.quals ?? []))];
  const titles = await qualTitles(slugs);
  const total = RANKS.length;

  return (
    <>
      <p className="max-w-2xl text-muted-foreground">
        {total} ranks, from {RANKS[0].name} to {RANKS[total - 1].name}. Rank is earned through attendance, qualification and leadership.
      </p>

      <section className="jacket mt-6 rounded-lg border p-5 sm:p-6">
        <p className="field-label">How promotion works</p>
        <ul className="mt-3 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
          <li>
            <span className="font-semibold text-foreground">Criteria make you eligible.</span> Each rank lists the operations you have attended, your time in the
            PMC, your time at the rank below and any qualifications.
          </li>
          <li>
            <span className="font-semibold text-foreground">Command promotes by hand.</span> Meeting every criterion does not promote you automatically. Command
            makes the call from your personnel file.
          </li>
          <li>
            <span className="font-semibold text-foreground">Leadership signs off from Sergeant up.</span> Ranks marked as needing approval also need leadership to
            agree.
          </li>
        </ul>
      </section>

      {TIERS.map((tier) => {
        const ranks = RANKS.filter((r) => r.tier === tier.key);
        return (
          <section key={tier.key} className="mt-12" aria-labelledby={`tier-${tier.key}`}>
            <p className="text-xs font-semibold uppercase tracking-label text-accent">
              {ranks[0].grade} to {ranks[ranks.length - 1].grade}
            </p>
            <h2 id={`tier-${tier.key}`} className="mt-1 text-3xl font-bold uppercase">
              {tier.label}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{tier.blurb}</p>
            <ol className="mt-6 border-l-2 border-border">
              {ranks.map((r) => (
                <RankStep key={r.abbr} rank={r} prev={RANKS[RANKS.indexOf(r) - 1]} titles={titles} />
              ))}
            </ol>
          </section>
        );
      })}

      <AboutCta title="Start at the bottom" body="Every operator began as a Recruit. Apply, get approved, and the ladder is yours to climb." />
    </>
  );
}

function RankStep({ rank: r, prev, titles }: { rank: RankDef; prev?: RankDef; titles: Record<string, string> }) {
  const q = r.requires;
  const start = !q;
  return (
    <li className="relative pb-6 pl-5 last:pb-0 sm:pl-8">
      <span aria-hidden className={`absolute -left-[7px] top-8 size-3 rounded-full border-2 border-background ${start ? "bg-success" : "bg-accent"}`} />
      <div className="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:flex-row sm:items-start sm:p-5">
        <div className="flex items-center gap-4 sm:w-56 sm:shrink-0">
          <div className="flex size-20 shrink-0 items-center justify-center rounded-md border bg-background/60">
            <RankInsignia rank={r.abbr} size={64} />
          </div>
          <div className="min-w-0">
            <h3 className="text-xl font-bold uppercase leading-tight">{r.name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge variant="accent">{r.abbr}</Badge>
              <Badge variant="outline">{r.grade}</Badge>
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          {start ? (
            <>
              <Badge variant="success">Where you start</Badge>
              <p className="mt-2 text-sm text-muted-foreground">Approved applicants join as {r.name}. There is nothing to meet yet; you just have to show up.</p>
            </>
          ) : (
            <>
              <p className="field-label">To reach {r.abbr}</p>
              <ul className="mt-2 grid gap-1.5 text-sm sm:grid-cols-2">
                {q.ops != null && <Req>{q.ops} {q.ops === 1 ? "operation" : "operations"} attended</Req>}
                {q.service != null && <Req>{q.service} days in the PMC</Req>}
                {q.days != null && (
                  <Req>
                    {q.days} days as {prev?.name ?? "the previous rank"}
                  </Req>
                )}
                {q.quals?.map((s) => (
                  <Req key={s}>Qualification: {titles[s]}</Req>
                ))}
                {q.approval && (
                  <li className="flex items-start gap-2 text-warning">
                    <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                    Leadership approval
                  </li>
                )}
              </ul>
              {r.typical && (
                <p className="mt-3 text-xs text-muted-foreground">
                  <span className="uppercase tracking-wider">Typical:</span> usually about {r.typical} in the PMC by this rank
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function Req({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-foreground/90">
      <Check className="mt-0.5 size-4 shrink-0 text-success-fg" aria-hidden />
      <span>{children}</span>
    </li>
  );
}
