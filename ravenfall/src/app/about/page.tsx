import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AboutCta } from "@/components/about-cta";
import { ABOUT_PAGES } from "@/config/about";
import { DOCTRINE, RANKS, ROLES, SQUADS, UNIT } from "@/config/unit";

export const metadata: Metadata = { title: "About", description: UNIT.description };

export default function AboutIndex() {
  const stats = [
    [RANKS.length, "Ranks"],
    [SQUADS.length, "Squads"],
    [ROLES.length, "Roles"],
  ] as const;
  return (
    <>
      <p className="max-w-2xl text-muted-foreground">{UNIT.description}</p>
      <div className="mt-6 grid grid-cols-3 divide-x rounded-lg border bg-card/40 py-5 text-center">
        {stats.map(([n, label]) => (
          <div key={label}>
            <div className="font-display text-3xl font-bold text-accent sm:text-4xl">{n}</div>
            <div className="mt-1 text-micro uppercase tracking-widest text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {ABOUT_PAGES.map((p, i) => (
          <Link
            key={p.href}
            href={p.href}
            className="group rounded-lg border bg-card p-6 transition-colors hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="font-display text-4xl font-bold text-primary/60">{String(i + 1).padStart(2, "0")}</div>
            <h2 className="mt-2 flex items-center gap-1 text-xl font-semibold uppercase">
              {p.label}
              <ChevronRight className="size-5 text-accent transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">{p.blurb}</p>
          </Link>
        ))}
      </div>

      <h2 className="mb-4 mt-12 text-xs font-semibold uppercase tracking-label text-accent">How we fight</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {DOCTRINE.map((d) => (
          <div key={d.title} className="rounded-lg border bg-card p-6">
            <h3 className="text-lg font-semibold uppercase">{d.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{d.body}</p>
          </div>
        ))}
      </div>

      <AboutCta title="Ready to deploy?" body="All you need is a Discord account and a working microphone. We train you on the rest." />
    </>
  );
}
