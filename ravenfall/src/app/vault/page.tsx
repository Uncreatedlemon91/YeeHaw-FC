import { Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Ribbon } from "@/components/ribbon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CategoryIcon, categoryLabel } from "@/components/vault-category";
import { describeRule, KIND_LABEL, medalUrl, ruleOf, stripesOf } from "@/lib/awards";
import { getSessionUser } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Awards" };
// Reads the session (admin links, operator-only qualifications), so never static.
export const dynamic = "force-dynamic";

export default async function Awards() {
  const me = await getSessionUser();
  const isAdmin = hasPerm(me?.perms, "ADMIN");
  const isOperator = hasPerm(me?.perms, "OPERATOR");
  const [awards, quals] = await Promise.all([
    prisma.award.findMany({ where: isAdmin ? {} : { active: true }, orderBy: [{ precedence: "asc" }, { name: "asc" }] }),
    isOperator ? prisma.qualification.findMany({ orderBy: [{ category: "asc" }, { title: "asc" }] }) : [],
  ]);
  const canEditQuals = hasPerm(me?.perms, "INSTRUCTOR");

  return (
    <Container>
      <PageHeader
        eyebrow="Honours"
        title="Awards & decorations"
        description="The ribbons and medals this unit gives, in the order they are worn, and what earns each one."
        actions={
          isAdmin && (
            <Button asChild variant="outline">
              <Link href="/admin/awards">
                <Pencil /> Edit awards
              </Link>
            </Button>
          )
        }
      />
      {awards.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {awards.map((a) => {
            const rule = ruleOf(a.autoRule);
            const medal = medalUrl(a);
            return (
              <li key={a.id}>
                <Link
                  href={`/vault/${a.slug}`}
                  className="group flex h-full flex-col gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-28 shrink-0">
                      <Ribbon stripes={stripesOf(a.ribbon)} device={a.device} count={a.repeatable ? 3 : 1} />
                    </div>
                    {medal && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={medal} alt="" className="ml-auto size-12 object-contain" />
                    )}
                  </div>
                  <div>
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-micro font-semibold uppercase tracking-label text-muted-foreground">
                      {KIND_LABEL[a.kind]}
                      {!a.active && <Badge variant="outline">Retired</Badge>}
                    </div>
                    <div className="font-display text-lg font-semibold uppercase leading-tight group-hover:text-accent">{a.name}</div>
                  </div>
                  {a.description && <p className="text-sm text-muted-foreground">{a.description}</p>}
                  <p className="mt-auto text-xs text-muted-foreground">{rule ? describeRule(rule) : "Awarded by nomination"}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed py-14 text-center text-sm text-muted-foreground">No awards in the catalog yet.</p>
      )}

      {isOperator && (
        <section aria-labelledby="quals" className="mt-12">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3 border-b pb-3">
            <div>
              <h2 id="quals" className="text-xl font-bold uppercase">
                Qualifications
              </h2>
              <p className="text-sm text-muted-foreground">Skills members are certified in. They show as badges on a personnel file, and each links to its manual in the Library.</p>
            </div>
            {canEditQuals && (
              <Button asChild size="sm">
                <Link href="/vault/qualifications/new">
                  <Plus /> New qualification
                </Link>
              </Button>
            )}
          </div>
          {quals.length ? (
            <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {quals.map((q) => (
                <li key={q.id} className="flex items-center justify-between gap-2 border-b border-border/50 py-2">
                  <Link href={`/vault/${q.slug}`} className="flex min-w-0 items-center gap-2 text-sm hover:text-accent">
                    <CategoryIcon category={q.category} className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate font-semibold">{q.title}</span>
                    <span className="hidden text-xs text-muted-foreground sm:inline">{categoryLabel(q.category)}</span>
                  </Link>
                  {canEditQuals && (
                    <Link href={`/vault/qualifications/${q.slug}/edit`} className="text-xs text-muted-foreground hover:text-foreground">
                      Edit
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No qualifications yet.</p>
          )}
        </section>
      )}
    </Container>
  );
}
