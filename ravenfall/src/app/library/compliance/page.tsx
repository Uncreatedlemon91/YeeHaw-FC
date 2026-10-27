import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getViewer } from "@/lib/library";
import { canSeeCompliance, complianceFor } from "@/lib/required-reading";
import { fmtDate } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata = { title: "Required reading compliance" };
export const dynamic = "force-dynamic";

export default async function Compliance({ searchParams }: { searchParams: Promise<{ doc?: string }> }) {
  const { doc: only } = await searchParams;
  await requireUser("OPERATOR", "/library/compliance");
  const viewer = await getViewer();
  if (!viewer || !canSeeCompliance(viewer)) notFound();

  const all = await complianceFor(viewer);
  const shown = only ? all.filter((c) => c.doc.slug === only) : all;
  const outstanding = all.reduce((n, c) => n + c.rows.filter((r) => !r.acknowledgedAt).length, 0);

  return (
    <Container className="max-w-4xl">
      <PageHeader
        eyebrow="Library"
        title="Required reading"
        description={`Who hasn't acknowledged what. ${outstanding} outstanding across ${all.length} required document${all.length === 1 ? "" : "s"}.`}
      />
      {all.length > 0 && (
        <nav aria-label="Filter by document" className="mb-6 flex flex-wrap gap-2 text-sm">
          {[{ slug: "", title: "All documents" }, ...all.map((c) => c.doc)].map((d) => (
            <Link
              key={d.slug}
              href={d.slug ? `/library/compliance?doc=${d.slug}` : "/library/compliance"}
              className={cn("rounded-md border px-3 py-1 hover:border-accent/60", (only ?? "") === d.slug && "border-accent bg-accent/10 text-accent")}
            >
              {d.title}
            </Link>
          ))}
        </nav>
      )}
      {!shown.length && <Card className="py-16 text-center text-sm text-muted-foreground">{all.length ? "No such document." : "No required reading is set."}</Card>}
      <div className="flex flex-col gap-6">
        {shown.map(({ doc, rows }) => {
          const todo = rows.filter((r) => !r.acknowledgedAt);
          const done = rows.filter((r) => r.acknowledgedAt);
          return (
            <Card key={doc.id}>
              <CardHeader className="flex-row items-center justify-between gap-3">
                <CardTitle>
                  <Link href={`/library/${doc.slug}`} className="hover:text-accent">
                    {doc.title}
                  </Link>
                </CardTitle>
                <span className="typed text-xs text-muted-foreground">
                  {done.length}/{rows.length} acknowledged
                </span>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nobody in your scope.</p>
                ) : todo.length === 0 ? (
                  <p className="flex items-center gap-2 text-sm text-green-400">
                    <CheckCircle2 className="size-4" /> Everyone has acknowledged it.
                  </p>
                ) : (
                  <ul className="grid gap-x-6 sm:grid-cols-2">
                    {todo.map(({ member: m }) => (
                      <li key={m.id} className="flex items-center justify-between gap-3 border-b border-foreground/10 py-1.5 text-sm">
                        <Link href={`/roster/${m.id}?tab=career`} className="hover:text-accent">
                          {m.rank && <span className="mr-1.5 text-muted-foreground">{m.rank}</span>}
                          {m.callsign ?? m.discordUsername}
                        </Link>
                        <span className="text-xs text-muted-foreground">{m.squad ?? "Unassigned"}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {done.length > 0 && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-muted-foreground">Acknowledged ({done.length})</summary>
                    <ul className="mt-2 grid gap-x-6 sm:grid-cols-2">
                      {done.map(({ member: m, acknowledgedAt }) => (
                        <li key={m.id} className="flex items-center justify-between gap-3 py-1 text-muted-foreground">
                          <Link href={`/roster/${m.id}?tab=career`} className="hover:text-accent">
                            {m.callsign ?? m.discordUsername}
                          </Link>
                          <span className="text-xs">{fmtDate(acknowledgedAt!)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </Container>
  );
}
