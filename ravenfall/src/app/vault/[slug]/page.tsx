import { ArrowLeft, Pencil } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { Container } from "@/components/container";
import { Markdown } from "@/components/markdown";
import { Ribbon } from "@/components/ribbon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { describeRule, DEVICE_LABEL, KIND_LABEL, medalUrl, ruleOf, stripesOf } from "@/lib/awards";
import { getSessionUser } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { manualFor } from "@/lib/qualifications";
import { fmtDate } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const award = await prisma.award.findUnique({ where: { slug }, select: { name: true } });
  return { title: award?.name ?? "Awards" };
}

export default async function AwardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const award = await prisma.award.findUnique({ where: { slug } });
  if (!award) {
    // Old qualification manual URLs: on to the matching library document,
    // which does its own clearance check.
    const qual = await prisma.qualification.findUnique({ where: { slug }, select: { id: true } });
    const manual = qual && (await manualFor(qual.id));
    if (manual) redirect(`/library/${manual.slug}`);
    notFound();
  }

  const me = await getSessionUser();
  const isAdmin = hasPerm(me?.perms, "ADMIN");
  // The Hall of Honour is for the unit, not the public.
  const holders = hasPerm(me?.perms, "OPERATOR")
    ? await prisma.memberAward.findMany({
        where: { awardId: award.id, revokedAt: null },
        include: { user: true },
        orderBy: [{ awardedAt: "asc" }, { sequence: "asc" }],
      })
    : null;
  const byUser = new Map<string, { user: NonNullable<typeof holders>[number]["user"]; count: number; first: Date }>();
  for (const h of holders ?? []) {
    const cur = byUser.get(h.userId);
    if (cur) cur.count += 1;
    else byUser.set(h.userId, { user: h.user, count: 1, first: h.awardedAt });
  }
  const rule = ruleOf(award.autoRule);
  const medal = medalUrl(award);

  return (
    <Container>
      <Link href="/vault" className="mb-3 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" aria-hidden /> Awards
      </Link>
      <header className="jacket mb-6 overflow-hidden rounded-lg border">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
          <div className="w-full max-w-56 shrink-0">
            <Ribbon stripes={stripesOf(award.ribbon)} device={award.device} count={award.repeatable ? 3 : 1} label={`${award.name} ribbon`} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-micro font-semibold uppercase tracking-label text-muted-foreground">
              <span className="text-accent">{KIND_LABEL[award.kind]}</span>
              {award.repeatable && <span>Repeatable{award.device !== "NONE" && ` · ${DEVICE_LABEL[award.device].toLowerCase()}`}</span>}
              {!award.active && <Badge variant="outline">Retired</Badge>}
            </p>
            <h1 className="text-2xl font-bold uppercase sm:text-3xl">{award.name}</h1>
            {award.description && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{award.description}</p>}
          </div>
          {medal && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={medal} alt={`${award.name} medal`} className="size-28 shrink-0 object-contain" />
          )}
          {isAdmin && (
            <Button asChild variant="outline" size="sm" className="self-start sm:self-center">
              <Link href={`/admin/awards/${award.slug}`}>
                <Pencil /> Edit
              </Link>
            </Button>
          )}
        </div>
      </header>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Criteria</CardTitle>
          </CardHeader>
          <CardContent className="py-6 sm:px-8">
            <p className="mb-4 text-sm font-semibold text-accent">{rule ? describeRule(rule) : "Awarded by nomination, decided by Command."}</p>
            {award.criteria ? <Markdown>{award.criteria}</Markdown> : <p className="text-sm text-muted-foreground">No further criteria written yet.</p>}
          </CardContent>
        </Card>
        {holders && (
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <Card>
              <CardHeader>
                <CardTitle>Hall of Honour ({byUser.size})</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1.5">
                {[...byUser.entries()].map(([id, h]) => (
                  <Link key={id} href={`/roster/${id}`} className="flex items-center gap-2 text-sm hover:text-accent" title={`First awarded ${fmtDate(h.first)}`}>
                    <Avatar discordId={h.user.discordId} avatar={h.user.avatar} name={h.user.callsign ?? h.user.discordUsername} size={20} />
                    {h.user.rank && <span className="text-xs text-muted-foreground">{h.user.rank}</span>}
                    {h.user.callsign ?? h.user.discordUsername}
                    {h.count > 1 && <span className="ml-auto text-xs text-muted-foreground">×{h.count}</span>}
                  </Link>
                ))}
                {!byUser.size && <p className="text-sm text-muted-foreground">Nobody yet.</p>}
              </CardContent>
            </Card>
          </aside>
        )}
      </div>
    </Container>
  );
}
