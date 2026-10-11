import { BookOpen, Plus } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/time";
import { CATEGORIES } from "./doc-form";

export const metadata = { title: "Vault" };

export default async function Vault() {
  const me = await requireUser("OPERATOR", "/vault");
  const [docs, mine] = await Promise.all([
    prisma.qualification.findMany({
      orderBy: { title: "asc" },
      include: { _count: { select: { holders: true } } },
    }),
    prisma.userQualification.findMany({ where: { userId: me.id }, select: { qualificationId: true } }),
  ]);
  const held = new Set(mine.map((m) => m.qualificationId));

  return (
    <Container>
      <PageHeader
        eyebrow="Doctrine"
        title="Qualification vault"
        description="SOPs and the qualification standards members are certified against."
        actions={
          hasPerm(me.perms, "INSTRUCTOR") && (
            <Button asChild>
              <Link href="/vault/new">
                <Plus /> New document
              </Link>
            </Button>
          )
        }
      />
      {!docs.length && <Card className="py-16 text-center text-sm text-muted-foreground">The vault is empty.</Card>}
      <div className="flex flex-col gap-8">
        {CATEGORIES.map((cat) => {
          const list = docs.filter((d) => d.category === cat);
          if (!list.length) return null;
          return (
            <section key={cat}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.25em] text-accent">{cat}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((d) => (
                  <Link key={d.id} href={`/vault/${d.slug}`} className="group flex flex-col gap-2 rounded-lg border bg-card p-4 hover:border-accent/50">
                    <div className="flex items-start justify-between gap-2">
                      <BookOpen className="size-5 text-muted-foreground group-hover:text-accent" />
                      {held.has(d.id) && <Badge variant="success">Qualified</Badge>}
                    </div>
                    <div className="font-display text-lg font-semibold uppercase">{d.title}</div>
                    {d.summary && <p className="text-sm text-muted-foreground">{d.summary}</p>}
                    <div className="mt-auto text-xs text-muted-foreground">
                      v{d.version} · {fmtDate(d.updatedAt)} · {d._count.holders} qualified
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </Container>
  );
}
