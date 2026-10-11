import type { ApplicationStatus } from "@prisma/client";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { AppStatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { answersOf } from "@/lib/recruitment";
import { fmt } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata = { title: "Recruitment" };

const TABS: ApplicationStatus[] = ["PENDING", "APPROVED", "DENIED"];

export default async function Recruitment({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireUser("RECRUITER", "/recruitment");
  const { status: s } = await searchParams;
  const status = TABS.includes(s as ApplicationStatus) ? (s as ApplicationStatus) : "PENDING";

  const [apps, counts] = await Promise.all([
    prisma.recruitmentApplication.findMany({
      where: { status },
      orderBy: { createdAt: status === "PENDING" ? "asc" : "desc" },
      include: { user: true, reviewedBy: true },
      take: 200,
    }),
    prisma.recruitmentApplication.groupBy({ by: ["status"], _count: true }),
  ]);
  const count = (st: ApplicationStatus) => counts.find((c) => c.status === st)?._count ?? 0;

  return (
    <Container>
      <PageHeader
        eyebrow="Personnel"
        title="Recruitment"
        description="Applications from /apply. Decisions here and on the Discord board stay in sync."
      />
      <div className="mb-4 flex gap-1">
        {TABS.map((t) => (
          <Link
            key={t}
            href={`/recruitment?status=${t}`}
            className={cn(
              "rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-wider",
              t === status ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t} <span className="ml-1 text-muted-foreground">{count(t)}</span>
          </Link>
        ))}
      </div>
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Applicant</TH>
              <TH>Callsign</TH>
              <TH className="hidden md:table-cell">Timezone</TH>
              <TH>Submitted</TH>
              <TH>Status</TH>
              {status !== "PENDING" && <TH className="hidden md:table-cell">Reviewed by</TH>}
            </TR>
          </THead>
          <TBody>
            {apps.map((a) => {
              const ans = answersOf(a);
              return (
                <TR key={a.id}>
                  <TD>
                    <Link href={`/recruitment/${a.id}`} className="flex items-center gap-2 font-semibold hover:text-accent">
                      <Avatar discordId={a.discordId} avatar={a.user.avatar} size={24} />
                      {a.discordUsername}
                    </Link>
                  </TD>
                  <TD>{String(ans.callsign ?? "—")}</TD>
                  <TD className="hidden md:table-cell">{String(ans.timezone ?? "—")}</TD>
                  <TD className="whitespace-nowrap text-muted-foreground">{fmt(a.createdAt, "d MMM, HH:mm")}</TD>
                  <TD>
                    <AppStatusBadge status={a.status} />
                  </TD>
                  {status !== "PENDING" && (
                    <TD className="hidden md:table-cell">{a.reviewedBy?.callsign ?? a.reviewedBy?.discordUsername ?? "—"}</TD>
                  )}
                </TR>
              );
            })}
            {!apps.length && (
              <TR>
                <TD colSpan={6} className="py-10 text-center text-muted-foreground">
                  No {status.toLowerCase()} applications.
                </TD>
              </TR>
            )}
          </TBody>
        </Table>
      </Card>
    </Container>
  );
}
