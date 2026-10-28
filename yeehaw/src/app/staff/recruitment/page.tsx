import Link from "next/link";
import { ActionForm, SubmitButton, type ActionState } from "@/components/action-form";
import { Avatar } from "@/components/avatar";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { StageBadge } from "@/components/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProspectFields } from "@/components/prospect-fields";
import { PROSPECT_STAGE_LABEL } from "@/config/club";
import { requireUser } from "@/lib/auth";
import { loadArrivals, loadBoard, positionsText, settlingIn } from "@/lib/recruitment";
import { STAGES } from "@/lib/recruitment-rules";
import { fmtDate } from "@/lib/time";
import { addProspectAction, dismissArrivalAction, startFileAction } from "./actions";

export const metadata = { title: "Recruitment" };
export const dynamic = "force-dynamic";

const asAct = (a: unknown) => a as (p: ActionState, d: FormData) => Promise<ActionState>;

export default async function RecruitmentPage() {
  await requireUser("STAFF", "/staff/recruitment");
  const [board, settling, arrivals] = await Promise.all([loadBoard(), settlingIn(), loadArrivals()]);
  // Signed and rejected files are history: shown, but after the live pipeline.
  const columns = STAGES.filter((s) => s !== "SIGNED" && s !== "REJECTED");

  return (
    <Container>
      <PageHeader
        eyebrow="Staff"
        title="Recruitment"
        description="From joining the server to settled in the squad: prospects, trials and a contract offer for the current or next season."
      />

      <div className="flex flex-col gap-6">
        {(board.needNotes.length > 0 || settling.length > 0) && (
          <Card className="border-accent/40">
            <CardHeader>
              <CardTitle>Needs attention</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {board.needNotes.map((p) => (
                <p key={p.id}>
                  <Link href={`/staff/recruitment/${p.id}`} className="font-semibold text-accent underline underline-offset-2">
                    {p.name}
                  </Link>{" "}
                  is on trial and nobody has written a note yet.
                </p>
              ))}
              {settling.map(({ prospect, done, total }) => (
                <p key={prospect.id}>
                  <Link href={`/staff/recruitment/${prospect.id}`} className="font-semibold text-accent underline underline-offset-2">
                    {prospect.name}
                  </Link>{" "}
                  signed {prospect.signedAt ? fmtDate(prospect.signedAt) : ""} and is settling in ({done}/{total} steps).
                </p>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>New in the server</CardTitle>
            <CardDescription>Joined in the last 30 days, with no file, contract or club role.</CardDescription>
          </CardHeader>
          <CardContent className="py-2">
            {arrivals.note && <p className="py-2 text-sm text-warning">{arrivals.note}</p>}
            {arrivals.arrivals.length === 0 ? (
              !arrivals.note && <p className="py-2 text-sm text-muted-foreground">Nobody new to look at.</p>
            ) : (
              <ul className="divide-y">
                {arrivals.arrivals.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                    <Avatar discordId={a.id} avatar={a.avatar} name={a.name} size={28} className="rounded-full" />
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold">{a.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">@{a.username} · joined {fmtDate(a.joinedAt)}</span>
                    </span>
                    <ActionForm action={asAct(startFileAction)} className="gap-0">
                      <input type="hidden" name="discordId" value={a.id} />
                      <input type="hidden" name="name" value={a.name} />
                      <SubmitButton size="sm" pendingText="Starting…">
                        Start a file
                      </SubmitButton>
                    </ActionForm>
                    <ActionForm action={asAct(dismissArrivalAction)} className="gap-0">
                      <input type="hidden" name="discordId" value={a.id} />
                      <SubmitButton size="sm" variant="ghost" pendingText="…">
                        Dismiss
                      </SubmitButton>
                    </ActionForm>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="grid items-start gap-4 lg:grid-cols-3">
          {columns.map((stage) => (
            <section key={stage} aria-labelledby={`col-${stage}`} className="flex flex-col gap-2">
              <h2 id={`col-${stage}`} className="field-label flex items-center justify-between">
                {PROSPECT_STAGE_LABEL[stage]}
                <span className="tnum">{board.byStage[stage].length}</span>
              </h2>
              {board.byStage[stage].length === 0 ? (
                <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">Nobody here.</p>
              ) : (
                board.byStage[stage].map((p) => {
                  const s = board.summary.get(p.id);
                  return (
                    <Link key={p.id} href={`/staff/recruitment/${p.id}`} className="rounded-lg border bg-card px-4 py-3 hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="block font-semibold">{p.name}</span>
                      <span className="block text-xs text-muted-foreground">{positionsText(p) || "No position yet"}{p.gamertag ? ` · ${p.gamertag}` : ""}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {s ? `${s.notes} note${s.notes === 1 ? "" : "s"}${s.avg != null ? ` · avg ${s.avg}/10` : ""}` : "No notes"}
                      </span>
                    </Link>
                  );
                })
              )}
            </section>
          ))}
        </div>

        {(board.byStage.SIGNED.length > 0 || board.byStage.REJECTED.length > 0) && (
          <details className="rounded-lg border bg-card">
            <summary className="cursor-pointer px-5 py-3 text-xs font-semibold uppercase tracking-wider text-accent">
              Signed ({board.byStage.SIGNED.length}) and not for us ({board.byStage.REJECTED.length})
            </summary>
            <ul className="divide-y border-t">
              {[...board.byStage.SIGNED, ...board.byStage.REJECTED].map((p) => (
                <li key={p.id}>
                  <Link href={`/staff/recruitment/${p.id}`} className="flex items-center justify-between gap-3 px-5 py-2 text-sm hover:bg-secondary/50">
                    <span>{p.name}</span>
                    <StageBadge stage={p.stage} />
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Add a prospect</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={asAct(addProspectAction)}>
              <ProspectFields />
              <div>
                <SubmitButton pendingText="Adding…">Add prospect</SubmitButton>
              </div>
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </Container>
  );
}
