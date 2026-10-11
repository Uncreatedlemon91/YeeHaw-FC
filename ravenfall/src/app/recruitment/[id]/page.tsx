import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Avatar } from "@/components/avatar";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { AppStatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { APPLICATION_QUESTIONS } from "@/config/unit";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { answersOf } from "@/lib/recruitment";
import { fmt } from "@/lib/time";
import { repost } from "../actions";
import { DecisionPanel } from "./decision-panel";

export const metadata = { title: "Application" };

export default async function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser("RECRUITER", `/recruitment/${id}`);
  const app = await prisma.recruitmentApplication.findUnique({
    where: { id },
    include: { user: true, reviewedBy: true },
  });
  if (!app) notFound();
  const previous = await prisma.recruitmentApplication.findMany({
    where: { userId: app.userId, NOT: { id: app.id } },
    orderBy: { createdAt: "desc" },
  });
  const ans = answersOf(app);

  return (
    <Container className="max-w-4xl">
      <PageHeader
        eyebrow="Application"
        title={
          <span className="flex items-center gap-3">
            <Avatar discordId={app.discordId} avatar={app.user.avatar} size={40} />
            {app.discordUsername}
          </span>
        }
        description={`Submitted ${fmt(app.createdAt)} · Discord ID ${app.discordId}`}
        actions={<AppStatusBadge status={app.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle>Answers</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {APPLICATION_QUESTIONS.map((q) => (
              <div key={q.key}>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{q.label}</div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{String(ans[q.key] ?? "") || "—"}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <DecisionPanel appId={app.id} pending={app.status === "PENDING"} callsign={String(ans.callsign ?? "")} />
          {app.status === "PENDING" && !app.boardMessageId && (
            <ActionForm action={repost}>
              <input type="hidden" name="appId" value={app.id} />
              <SubmitButton variant="outline" size="sm">
                Post to Discord board
              </SubmitButton>
            </ActionForm>
          )}
          {app.status !== "PENDING" && (
            <Card>
              <CardHeader>
                <CardTitle>Decision</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <p>
                  <AppStatusBadge status={app.status} /> by{" "}
                  {app.reviewedBy?.callsign ?? app.reviewedBy?.discordUsername ?? "unknown"} on {fmt(app.updatedAt)}
                </p>
                {app.reviewNote && <p className="whitespace-pre-wrap text-muted-foreground">{app.reviewNote}</p>}
                {app.status === "APPROVED" && (
                  <Link href={`/roster/${app.userId}`} className="text-accent underline">
                    View dossier
                  </Link>
                )}
              </CardContent>
            </Card>
          )}
          {previous.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Previous applications</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                {previous.map((p) => (
                  <Link key={p.id} href={`/recruitment/${p.id}`} className="flex items-center justify-between hover:text-accent">
                    {fmt(p.createdAt, "d MMM yyyy")} <AppStatusBadge status={p.status} />
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </Container>
  );
}
