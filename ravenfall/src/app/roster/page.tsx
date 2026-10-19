import { Container } from "@/components/container";
import { TabLinks } from "@/components/tab-links";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
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
      <TabLinks
        label="Roster view"
        variant="folder"
        items={VIEWS.map((v) => ({ href: v.href, label: v.label, active: v.id === view }))}
      />
      {view === "list" ? <ListView sp={sp} /> : <OrbatView me={me} />}
    </Container>
  );
}
