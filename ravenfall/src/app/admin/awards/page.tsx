import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Ribbon } from "@/components/ribbon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { describeRule, KIND_LABEL, ruleOf, stripesOf } from "@/lib/awards";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { moveAward, setAwardActive } from "./actions";

export const metadata = { title: "Awards editor" };
export const dynamic = "force-dynamic";

export default async function AwardsAdmin() {
  await requireUser("ADMIN", "/admin/awards");
  const awards = await prisma.award.findMany({
    orderBy: [{ precedence: "asc" }, { name: "asc" }],
    include: { _count: { select: { holders: { where: { revokedAt: null } } } } },
  });
  return (
    <Container>
      <PageHeader
        eyebrow="Command"
        title="Awards editor"
        description="The catalog, in rack order: the first award sits top-left. Retiring one hides it from the catalog but leaves it on the racks of those who hold it."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/vault">View catalog</Link>
            </Button>
            <Button asChild>
              <Link href="/admin/awards/new">
                <Plus /> New award
              </Link>
            </Button>
          </>
        }
      />
      <Card className="divide-y">
        {awards.map((a, i) => {
          const rule = ruleOf(a.autoRule);
          return (
            <div key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
              <div className="w-24 shrink-0">
                <Ribbon stripes={stripesOf(a.ribbon)} device={a.device} count={a.repeatable ? 3 : 1} />
              </div>
              <div className="min-w-0 flex-1">
                <Link href={`/admin/awards/${a.slug}`} className="font-display text-base font-semibold uppercase hover:text-accent">
                  {a.name}
                </Link>
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span>{KIND_LABEL[a.kind]}</span>
                  <span>precedence {a.precedence}</span>
                  <span>{a._count.holders} held</span>
                  <span>{rule ? describeRule(rule) : "By nomination"}</span>
                  {!a.active && <Badge variant="outline">Retired</Badge>}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <form action={moveAward}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="dir" value="up" />
                  <Button type="submit" variant="ghost" size="icon" disabled={i === 0} aria-label={`Move ${a.name} up`}>
                    <ArrowUp />
                  </Button>
                </form>
                <form action={moveAward}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="dir" value="down" />
                  <Button type="submit" variant="ghost" size="icon" disabled={i === awards.length - 1} aria-label={`Move ${a.name} down`}>
                    <ArrowDown />
                  </Button>
                </form>
                <form action={setAwardActive}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="active" value={String(!a.active)} />
                  <Button type="submit" variant="outline" size="sm">
                    {a.active ? "Retire" : "Restore"}
                  </Button>
                </form>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/admin/awards/${a.slug}`}>Edit</Link>
                </Button>
              </div>
            </div>
          );
        })}
        {!awards.length && <p className="p-6 text-sm text-muted-foreground">No awards yet.</p>}
      </Card>
    </Container>
  );
}
