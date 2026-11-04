import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import Link from "next/link";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { QualBadge } from "@/components/qual-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { categoryLabel } from "@/components/vault-category";
import { rankName } from "@/config/unit";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isCurrent } from "@/lib/qual-rules";
import { moveQualification, setQualificationActive } from "@/app/vault/actions";

export const metadata = { title: "Qualifications" };
export const dynamic = "force-dynamic";

export default async function QualificationsBuilder() {
  await requireUser("INSTRUCTOR", "/admin/qualifications");
  const quals = await prisma.qualification.findMany({
    orderBy: [{ position: "asc" }, { title: "asc" }],
    include: { prerequisites: { select: { title: true } }, holders: { select: { expiresAt: true } }, _count: { select: { courses: true } } },
  });
  const now = new Date();
  return (
    <Container>
      <PageHeader
        eyebrow="Training"
        title="Qualifications"
        description="The skills members certify in: each has a badge, what it takes, the assessment checklist and how long it lasts. Retiring one stops new certifications but leaves it on those who hold it."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/vault">View catalog</Link>
            </Button>
            <Button asChild>
              <Link href="/admin/qualifications/new">
                <Plus /> New qualification
              </Link>
            </Button>
          </>
        }
      />
      <Card className="divide-y">
        {quals.map((q, i) => {
          const current = q.holders.filter((h) => isCurrent(h, now)).length;
          const lapsed = q.holders.length - current;
          return (
            <div key={q.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
              <QualBadge q={q} size={40} />
              <div className="min-w-0 flex-1">
                <Link href={`/admin/qualifications/${q.slug}`} className="font-display text-base font-semibold uppercase hover:text-accent">
                  {q.title}
                </Link>
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span>{categoryLabel(q.category)}</span>
                  <span>
                    {current} held{lapsed > 0 && `, ${lapsed} expired`}
                  </span>
                  <span>{q.tasks.length ? `${q.tasks.length} task${q.tasks.length === 1 ? "" : "s"}` : "sign-off"}</span>
                  {q.validDays && <span>recertify every {q.validDays}d</span>}
                  {q.prerequisites.length > 0 && <span>needs {q.prerequisites.map((p) => p.title).join(", ")}</span>}
                  {q.minRank && <span>{rankName(q.minRank)}+</span>}
                  {q.holdersCanCertify && <span>holders certify</span>}
                  {q._count.courses > 0 && <span>{q._count.courses} course event{q._count.courses === 1 ? "" : "s"}</span>}
                  {!q.active && <Badge variant="outline">Retired</Badge>}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <form action={moveQualification}>
                  <input type="hidden" name="id" value={q.id} />
                  <input type="hidden" name="dir" value="up" />
                  <Button type="submit" variant="ghost" size="icon" disabled={i === 0} aria-label={`Move ${q.title} up`}>
                    <ArrowUp />
                  </Button>
                </form>
                <form action={moveQualification}>
                  <input type="hidden" name="id" value={q.id} />
                  <input type="hidden" name="dir" value="down" />
                  <Button type="submit" variant="ghost" size="icon" disabled={i === quals.length - 1} aria-label={`Move ${q.title} down`}>
                    <ArrowDown />
                  </Button>
                </form>
                <form action={setQualificationActive}>
                  <input type="hidden" name="id" value={q.id} />
                  <input type="hidden" name="active" value={String(!q.active)} />
                  <Button type="submit" variant="outline" size="sm">
                    {q.active ? "Retire" : "Restore"}
                  </Button>
                </form>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/admin/qualifications/${q.slug}`}>Edit</Link>
                </Button>
              </div>
            </div>
          );
        })}
        {!quals.length && <p className="p-6 text-sm text-muted-foreground">No qualifications yet.</p>}
      </Card>
    </Container>
  );
}
