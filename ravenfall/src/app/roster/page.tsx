import Link from "next/link";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { ListView, type ListQuery } from "./list-view";
import { OrbatView } from "./orbat-view";

export const metadata = { title: "Roster" };
export const dynamic = "force-dynamic";

type Q = ListQuery & { view?: string };

const VIEWS = [
  { id: "orbat", label: "By element", href: "/roster" },
  { id: "list", label: "List", href: "/roster?view=list" },
] as const;

// One page for the unit's people: the order of battle (squads, billets and
// vacancies) by default, or a searchable list. /orbat redirects here.
export default async function Roster({ searchParams }: { searchParams: Promise<Q> }) {
  const me = await requireUser("OPERATOR", "/roster");
  const sp = await searchParams;
  // Any filter means the list, so old /roster?squad=… links keep working.
  const filtered = !!(sp.q || sp.rank || sp.squad || sp.role || sp.status);
  const view = sp.view === "list" || (sp.view !== "orbat" && filtered) ? "list" : "orbat";

  return (
    <Container>
      <PageHeader
        eyebrow="Personnel · S3"
        title="Roster"
        description="Every member by element and billet, or as a searchable list."
      />
      <nav aria-label="Roster view" className="mb-5 flex gap-1 border-b px-1">
        {VIEWS.map((v) => (
          <Link
            key={v.id}
            href={v.href}
            aria-current={v.id === view ? "page" : undefined}
            className={cn(
              "-mb-px rounded-t-md border border-b-0 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition-colors",
              v.id === view ? "jacket border-border text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {v.label}
          </Link>
        ))}
      </nav>
      {view === "list" ? <ListView sp={sp} /> : <OrbatView me={me} />}
    </Container>
  );
}
