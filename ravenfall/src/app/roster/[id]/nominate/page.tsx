import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { canNominate, callsignOf, isNominatable } from "@/lib/award-service";
import { stripesOf } from "@/lib/awards";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/time";
import { NominateForm } from "./nominate-form";

export const metadata = { title: "Nominate for an award" };
export const dynamic = "force-dynamic";

export default async function Nominate({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireUser("OPERATOR", `/roster/${id}/nominate`);
  const [member, viewer] = await Promise.all([prisma.user.findUnique({ where: { id } }), prisma.user.findUnique({ where: { id: me.id } })]);
  if (!member) notFound();
  if (!canNominate(me.perms, viewer, member)) redirect(`/roster/${id}`);

  const now = new Date();
  const [allAwards, held, events, pending] = await Promise.all([
    prisma.award.findMany({ where: { active: true }, orderBy: [{ precedence: "asc" }, { name: "asc" }] }),
    prisma.memberAward.findMany({ where: { userId: id, revokedAt: null }, select: { awardId: true } }),
    prisma.event.findMany({
      where: { startTime: { lt: now, gte: new Date(now.getTime() - 180 * 864e5) } },
      orderBy: { startTime: "desc" },
      take: 40,
      select: { id: true, title: true, startTime: true },
    }),
    prisma.awardNomination.findMany({ where: { nomineeId: id, status: "PENDING" }, select: { awardId: true } }),
  ]);
  const awards = allAwards.filter(isNominatable);
  const holds = new Set(held.map((h) => h.awardId));
  const open = new Set(pending.map((p) => p.awardId));
  const name = callsignOf(member);

  return (
    <Container size="narrow">
      <PageHeader
        eyebrow="S1 · Awards"
        title={`Nominate ${name}`}
        description="Command decides on the S1 Desk. A good citation says what they did, on which op, and who it helped."
        actions={
          <Link href={`/roster/${id}`} className="inline-flex items-center gap-1 text-sm text-accent underline-offset-4 hover:underline">
            <ArrowLeft className="size-4" aria-hidden /> Back to the file
          </Link>
        }
      />
      <NominateForm
        nomineeId={id}
        awards={awards.map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          device: a.device,
          stripes: stripesOf(a.ribbon),
          // Repeatable awards can be given again; others once.
          blocked: open.has(a.id) ? "Already nominated" : !a.repeatable && holds.has(a.id) ? "Already held" : null,
        }))}
        events={events.map((e) => ({ id: e.id, label: `${fmtDate(e.startTime)} · ${e.title}` }))}
      />
    </Container>
  );
}
