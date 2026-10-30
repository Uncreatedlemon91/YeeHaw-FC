import Link from "next/link";
import { Ribbon, ribbonLabel } from "@/components/ribbon";
import { CategoryIcon, categoryLabel, RIBBON } from "@/components/vault-category";
import { rackRows, type Stripe } from "@/lib/awards";
import type { AwardDevice } from "@prisma/client";
import { cn } from "@/lib/utils";

export type RackItem = {
  id: string;
  slug: string;
  name: string;
  stripes: Stripe[];
  device: AwardDevice;
  count: number;
  /** Already formatted. */
  latest: string;
  citation: string;
};

/** A member's ribbon rack: rows of three, senior top-left, the short row centred on top. */
export function Rack({ items, className }: { items: RackItem[]; className?: string }) {
  if (!items.length) return <span className="text-xs text-muted-foreground">No ribbons awarded.</span>;
  return (
    <div className={cn("inline-flex flex-col gap-0.5 rounded-sm border border-foreground/10 bg-black/25 p-1.5", className)} role="list" aria-label="Ribbon rack">
      {rackRows(items).map((row, r) => (
        <div key={r} role="presentation" className="flex justify-center gap-0.5">
          {row.map((it) => {
            const when = it.count > 1 ? `latest ${it.latest}` : it.latest;
            return (
              <Link
                key={it.id}
                role="listitem"
                href={`/vault/${it.slug}`}
                title={[ribbonLabel(it.name, it.count), when, it.citation].filter(Boolean).join(" · ")}
                aria-label={[ribbonLabel(it.name, it.count), `awarded ${when}`, it.citation].filter(Boolean).join(", ")}
                className="block w-20 shrink-0 rounded-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-24"
              >
                <Ribbon stripes={it.stripes} device={it.device} count={it.count} />
              </Link>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export type SkillBadge = { id: string; title: string; category: string; href: string | null };

/** Qualifications as compact skill badges (not ribbons): category icon and colour, linked to the manual. */
export function SkillBadges({ skills }: { skills: SkillBadge[] }) {
  if (!skills.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Qualifications">
      {skills.map((s) => {
        const body = (
          <>
            <span aria-hidden className={cn("h-3 w-1 rounded-full", RIBBON[s.category])} />
            <CategoryIcon category={s.category} className="size-3" />
            {s.title}
          </>
        );
        const cls = "inline-flex items-center gap-1.5 rounded-full border border-foreground/15 bg-card px-2 py-0.5 text-micro font-semibold uppercase tracking-wider";
        return (
          <li key={s.id}>
            {s.href ? (
              <Link href={s.href} title={`${s.title} (${categoryLabel(s.category)}): open the manual`} className={cn(cls, "hover:border-accent/60 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}>
                {body}
              </Link>
            ) : (
              <span title={`${s.title} (${categoryLabel(s.category)})`} className={cls}>
                {body}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
