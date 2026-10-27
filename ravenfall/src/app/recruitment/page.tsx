import type { ApplicationStatus } from "@prisma/client";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { AppAge } from "@/components/recruit-age";
import { AppStatusBadge } from "@/components/status-badge";
import { TabLinks } from "@/components/tab-links";
import { Card } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { answersOf } from "@/lib/recruitment";
import { fmt } from "@/lib/time";

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
      <TabLinks
        label="Application status"
        items={TABS.map((t) => ({ href: `/recruitment?status=${t}`, label: t, count: count(t), active: t === status }))}
      />
      <ul className="flex flex-col gap-2 sm:hidden" aria-label={`${status.toLowerCase()} applications`}>
        {apps.map((a) => {
          const ans = answersOf(a);
          return (
            <li key={a.id} className="relative rounded-lg border bg-card p-3 transition-colors hover:bg-secondary/40">
              <div className="flex items-center justify-between gap-2">
                <Link
                  href={`/recruitment/${a.id}`}
                  className="flex min-w-0 items-center gap-2 font-semibold after:absolute after:inset-0 hover:text-accent"
                >
                  <Avatar discordId={a.discordId} avatar={a.user.avatar} name={a.discordUsername} size={24} />
                  <span className="truncate">{a.discordUsername}</span>
                </Link>
                <AppStatusBadge status={a.status} />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="truncate">
                  {String(ans.callsign ?? "—")} · {String(ans.timezone ?? "—")}
                </span>
                <span title={fmt(a.createdAt)} className="shrink-0">
                  <AppAge date={a.createdAt} pending={a.status === "PENDING"} />
                </span>
              </div>
            </li>
          );
        })}
        {!apps.length && (
          <li className="rounded-lg border bg-card py-10 text-center text-sm text-muted-foreground">
            No {status.toLowerCase()} applications.
          </li>
        )}
      </ul>
      <Card className="hidden sm:block">
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
                <TR key={a.id} className="relative">
                  <TD>
                    <Link href={`/recruitment/${a.id}`} className="flex items-center gap-2 font-semibold after:absolute after:inset-0 hover:text-accent">
                      <Avatar discordId={a.discordId} avatar={a.user.avatar} name={a.discordUsername} size={24} />
                      {a.discordUsername}
                    </Link>
                  </TD>
                  <TD>{String(ans.callsign ?? "—")}</TD>
                  <TD className="hidden md:table-cell">{String(ans.timezone ?? "—")}</TD>
                  <TD className="whitespace-nowrap" title={fmt(a.createdAt)}>
                    <AppAge date={a.createdAt} pending={a.status === "PENDING"} />
                  </TD>
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
