import { Plus } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { TabLinks } from "@/components/tab-links";
import { Button } from "@/components/ui/button";
import { VaultBrowser } from "@/components/vault-browser";
import { CATEGORIES, CategoryIcon, categoryLabel } from "@/components/vault-category";
import { requireUser } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/time";

export const metadata = { title: "Vault" };

export default async function Vault({ searchParams }: { searchParams: Promise<{ cat?: string }> }) {
  const me = await requireUser("OPERATOR", "/vault");
  const { cat: rawCat } = await searchParams;
  const cat = CATEGORIES.find((c) => c === rawCat);
  const [docs, mine] = await Promise.all([
    prisma.qualification.findMany({
      orderBy: { title: "asc" },
      include: { _count: { select: { holders: true } } },
    }),
    prisma.userQualification.findMany({ where: { userId: me.id }, select: { qualificationId: true } }),
  ]);
  const held = new Set(mine.map((m) => m.qualificationId));
  const canCreate = hasPerm(me.perms, "INSTRUCTOR");
  const counts = (c: string) => docs.filter((d) => d.category === c).length;

  const tabs = [
    { href: "/vault", label: "All", active: !cat, count: docs.length },
    ...CATEGORIES.filter((c) => counts(c) > 0 || c === cat).map((c) => ({
      href: `/vault?cat=${c}`,
      label: categoryLabel(c),
      active: c === cat,
      count: counts(c),
      icon: <CategoryIcon category={c} className="size-3.5" />,
    })),
  ];

  return (
    <Container>
      <PageHeader
        eyebrow="Doctrine"
        title="Qualification vault"
        description="SOPs and the qualification standards members are certified against."
        actions={
          canCreate && (
            <Button asChild>
              <Link href="/vault/new">
                <Plus /> New document
              </Link>
            </Button>
          )
        }
      />
      {docs.length > 0 && <TabLinks items={tabs} label="Document category" />}
      <VaultBrowser
        key={cat ?? "all"}
        canCreate={canCreate}
        filtered={!!cat}
        docs={docs
          .filter((d) => !cat || d.category === cat)
          .map((d) => ({
            id: d.id,
            slug: d.slug,
            title: d.title,
            summary: d.summary,
            category: d.category,
            version: d.version,
            updated: fmtDate(d.updatedAt),
            holders: d._count.holders,
            held: held.has(d.id),
          }))}
      />
    </Container>
  );
}
