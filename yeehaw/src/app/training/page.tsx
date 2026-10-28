import Link from "next/link";
import { ActionForm, SubmitButton, type ActionState } from "@/components/action-form";
import { Container } from "@/components/container";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { EVENT_TYPE_LABEL, SUGGESTION_STATUS_LABEL } from "@/config/club";
import { getSessionUser, requireUser } from "@/lib/auth";
import { hasPerm } from "@/lib/permissions";
import { fmt } from "@/lib/time";
import { listSuggestions, recentSessions, upcomingSessions } from "@/lib/training";
import { MAX_REPLY, MAX_SUGGESTION, SUGGESTION_STATUSES } from "@/lib/training-rules";
import { replyAction, suggestAction } from "./actions";

export const metadata = { title: "Training" };
export const dynamic = "force-dynamic";

const asAct = (a: unknown) => a as (p: ActionState, d: FormData) => Promise<ActionState>;
const STATUS_VARIANT = { OPEN: "accent", PLANNED: "info", DONE: "success", DECLINED: "outline" } as const;

export default async function TrainingPage() {
  await requireUser("MEMBER", "/training");
  const user = (await getSessionUser())!;
  const isStaff = hasPerm(user.perms, "STAFF");
  const [upcoming, recent, suggestions] = await Promise.all([upcomingSessions(), recentSessions(), listSuggestions(isStaff ? null : user.id)]);

  return (
    <Container>
      <PageHeader
        eyebrow="Members"
        title="Training"
        description="Sessions, the plan for each and what to work on next."
        actions={
          isStaff && (
            <>
              <Button asChild>
                <Link href="/fixtures/new?type=TRAINING">Schedule a session</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/fixtures/new?repeat=1">Repeat weekly</Link>
              </Button>
            </>
          )
        }
      />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Upcoming sessions</CardTitle>
            </CardHeader>
            {upcoming.length ? (
              <ul className="divide-y">
                {upcoming.map((e) => (
                  <li key={e.id}>
                    <Link href={`/fixtures/${e.id}`} className="block px-5 py-3 hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{e.title}</span>
                        <Badge variant="outline">{EVENT_TYPE_LABEL[e.type]}</Badge>
                        <span className="tnum ml-auto text-xs text-muted-foreground">{e._count.signups} going</span>
                      </span>
                      <span className="block text-sm text-muted-foreground">{fmt(e.startsAt, "EEE d MMM, HH:mm")}</span>
                      {e.sessionObjective && <span className="mt-1 block text-sm">{e.sessionObjective}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <CardContent className="text-sm text-muted-foreground">No sessions scheduled.</CardContent>
            )}
          </Card>
          {recent.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent sessions</CardTitle>
              </CardHeader>
              <ul className="divide-y">
                {recent.map((e) => (
                  <li key={e.id}>
                    <Link href={`/fixtures/${e.id}#session-plan`} className="block px-5 py-3 hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="font-semibold">{e.title}</span>
                      <span className="ml-2 text-sm text-muted-foreground">{fmt(e.startsAt, "EEE d MMM")}</span>
                      {e.sessionReview && <span className="mt-1 line-clamp-2 block text-sm text-muted-foreground">{e.sessionReview}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div id="suggestions" className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>What should we work on?</CardTitle>
              <CardDescription>Suggest a topic for training. Only you and the staff see it.</CardDescription>
            </CardHeader>
            <CardContent>
              <ActionForm action={asAct(suggestAction)}>
                <Field label="Your suggestion" htmlFor="body">
                  <Textarea id="body" name="body" rows={3} maxLength={MAX_SUGGESTION} required placeholder="e.g. Defending corners, or how to build out from the back." />
                </Field>
                <div>
                  <SubmitButton pendingText="Sending…">Send suggestion</SubmitButton>
                </div>
              </ActionForm>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{isStaff ? "Suggestions" : "Your suggestions"}</CardTitle>
            </CardHeader>
            {suggestions.length ? (
              <ul className="divide-y">
                {suggestions.map((s) => (
                  <li key={s.id} className="flex flex-col gap-2 px-5 py-3 text-sm">
                    <p className="flex flex-wrap items-center gap-2">
                      <Badge variant={STATUS_VARIANT[s.status]}>{SUGGESTION_STATUS_LABEL[s.status]}</Badge>
                      {isStaff && (
                        <Link href={`/players/${s.player.slug}`} className="font-semibold hover:underline">
                          {s.player.displayName}
                        </Link>
                      )}
                      <span className="text-xs text-muted-foreground">{fmt(s.createdAt, "d MMM")}</span>
                    </p>
                    <p className="whitespace-pre-wrap">{s.body}</p>
                    {s.staffNote && (
                      <p className="rounded-md border bg-background/40 px-3 py-2 text-muted-foreground">
                        {s.handledBy ? `${s.handledBy}: ` : ""}
                        {s.staffNote}
                      </p>
                    )}
                    {isStaff && (
                      <details>
                        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-accent">Reply</summary>
                        <ActionForm action={asAct(replyAction)} className="mt-3 gap-3">
                          <input type="hidden" name="id" value={s.id} />
                          <Select name="status" defaultValue={s.status} aria-label="Status" className="max-w-48">
                            {SUGGESTION_STATUSES.map((st) => (
                              <option key={st} value={st}>
                                {SUGGESTION_STATUS_LABEL[st]}
                              </option>
                            ))}
                          </Select>
                          <Input name="staffNote" maxLength={MAX_REPLY} defaultValue={s.staffNote ?? ""} placeholder="A short reply (optional)" aria-label="Reply" />
                          <SubmitButton size="sm" variant="secondary" className="self-start" pendingText="Saving…">
                            Save
                          </SubmitButton>
                        </ActionForm>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <CardContent className="text-sm text-muted-foreground">{isStaff ? "No suggestions yet." : "You haven't suggested anything yet."}</CardContent>
            )}
          </Card>
        </div>
      </div>
    </Container>
  );
}
