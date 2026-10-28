import Link from "next/link";
import { ActionForm, SubmitButton, type ActionState } from "@/components/action-form";
import { Avatar } from "@/components/avatar";
import { ConfirmButton } from "@/components/confirm-button";
import { AttendanceBadge, SignupBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { ATTENDANCE_LABEL, POSITION_LABEL, POSITIONS, SIGNUP_LABEL } from "@/config/club";
import type { EventPage, SignupRow } from "@/lib/event-page";
import { slotLabel } from "@/lib/lineup-rules";
import { MAX_BRIEF, MAX_OBJECTIVE, MAX_PLAN, MAX_REVIEW } from "@/lib/training-rules";
import { fmt } from "@/lib/time";
import { cn } from "@/lib/utils";
import { announceAction, attendanceAction, deleteEventAction, preferencesAction, respondAction, savePlanAction, saveReviewAction, signupsOpenAction } from "../actions";

type Act = (p: ActionState, d: FormData) => Promise<ActionState>;
const asAct = (a: unknown) => a as Act;

// --- Your answer ------------------------------------------------------------ //

/** Going / maybe / can't make it, and where you'd like to play. */
export function AnswerCard({ page, signedIn, member }: { page: EventPage; signedIn: boolean; member: boolean }) {
  const { event, me } = page;
  const closed = !event.signupsOpen || page.over;
  return (
    <Card id="your-answer">
      <CardHeader>
        <CardTitle>Your answer</CardTitle>
        <CardDescription>
          {page.over ? "This event is over." : !event.signupsOpen ? "Sign-ups are closed." : event.formation ? "Take a position on the pitch, or just say whether you can make it." : "Can you make it?"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!signedIn ? (
          <p className="text-sm text-muted-foreground">
            <Link href={`/login?callbackUrl=/fixtures/${event.id}`} className="text-accent underline underline-offset-2">
              Sign in with Discord
            </Link>{" "}
            to answer.
          </p>
        ) : !member ? (
          <p className="text-sm text-muted-foreground">Only club members can sign up.</p>
        ) : (
          <>
            <ActionForm action={asAct(respondAction)} className="gap-3">
              <input type="hidden" name="id" value={event.id} />
              <div className="flex flex-wrap gap-2">
                {(["GOING", "MAYBE", "OUT"] as const).map((s) => (
                  <SubmitButton key={s} name="status" value={s} variant={me?.status === s ? "default" : "outline"} disabled={closed} pendingText="Saving…" aria-pressed={me?.status === s}>
                    {SIGNUP_LABEL[s]}
                  </SubmitButton>
                ))}
              </div>
              {me && <p className="text-sm text-muted-foreground">You&apos;re down as {SIGNUP_LABEL[me.status].toLowerCase()}{me.slotKey ? ` at ${slotLabel(event.formation ?? "", me.slotKey)}` : ""}.</p>}
            </ActionForm>
            {me && me.status !== "OUT" && !closed && (
              <ActionForm action={asAct(preferencesAction)} className="gap-3 border-t pt-4">
                <input type="hidden" name="id" value={event.id} />
                <p className="field-label">Where would you like to play? (best first)</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(["pref1", "pref2", "pref3"] as const).map((name, i) => (
                    <Select key={name} name={name} aria-label={`Choice ${i + 1}`} defaultValue={me.prefs[i] ?? ""}>
                      <option value="">{i === 0 ? "First choice" : i === 1 ? "Second choice" : "Third choice"}</option>
                      {POSITIONS.map((p) => (
                        <option key={p} value={p}>
                          {POSITION_LABEL[p]}
                        </option>
                      ))}
                    </Select>
                  ))}
                </div>
                <SubmitButton variant="secondary" size="sm" className="self-start" pendingText="Saving…">
                  Save positions
                </SubmitButton>
              </ActionForm>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// --- Who has answered ---------------------------------------------------------- //

function Person({ s, role }: { s: SignupRow; role?: string }) {
  return (
    <li className="flex items-center gap-2 py-1.5 text-sm">
      <Avatar discordId={s.discordId} avatar={s.avatar} name={s.name} size={24} className="rounded-full" />
      <Link href={`/players/${s.slug}`} className="min-w-0 truncate hover:underline">
        {s.name}
      </Link>
      {role && <span className="text-xs text-muted-foreground">{role}</span>}
    </li>
  );
}

/** Plain roster: going / maybe / can't make it, with each player's position on the tactics board. */
export function RosterColumns({ page }: { page: EventPage }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {(["GOING", "MAYBE", "OUT"] as const).map((status) => {
        const rows = page.signups.filter((s) => s.status === status);
        return (
          <Card key={status}>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>{SIGNUP_LABEL[status]}</CardTitle>
              <span className="tnum font-display text-lg font-bold">{rows.length}</span>
            </CardHeader>
            <CardContent className="py-2">
              {rows.length ? (
                <ul className="divide-y">
                  {rows.map((s) => (
                    <Person key={s.id} s={s} role={page.roles.get(s.playerId)} />
                  ))}
                </ul>
              ) : (
                <p className="py-2 text-sm text-muted-foreground">Nobody yet.</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/** Answered but without a position: still useful to staff (a maybe can cover a gap). */
export function NoPosition({ page }: { page: EventPage }) {
  const rows = page.signups.filter((s) => !s.slotKey);
  if (!rows.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>No position yet</CardTitle>
      </CardHeader>
      <CardContent className="py-2">
        <ul className="divide-y">
          {rows.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2">
              <Person s={s} />
              <span className="flex items-center gap-2">
                {s.prefs.length > 0 && <span className="hidden text-xs text-muted-foreground sm:inline">Wants {s.prefs.map((p) => POSITION_LABEL[p]).join(", ")}</span>}
                <SignupBadge status={s.status} />
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// --- Training plan -------------------------------------------------------------- //

export function PlanCard({ page, signedIn }: { page: EventPage; signedIn: boolean }) {
  const { event, briefs, slots } = page;
  const keys = Object.keys(slots);
  const mine = page.myPosition;
  return (
    <Card id="session-plan">
      <CardHeader>
        <CardTitle>Session plan</CardTitle>
        <CardDescription>What the session works on and what each position does in it.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {event.sessionObjective || event.sessionPlan || Object.keys(briefs).length ? (
          <>
            {event.sessionObjective && (
              <p>
                <span className="field-label mr-2">Objective</span>
                {event.sessionObjective}
              </p>
            )}
            {event.sessionPlan && <p className="whitespace-pre-wrap">{event.sessionPlan}</p>}
            {signedIn && mine && briefs[mine] && (
              <p className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2">
                <span className="field-label mr-2">Your job at {slotLabel(event.formation ?? "", mine)}</span>
                {briefs[mine]}
              </p>
            )}
            {Object.keys(briefs).length > 0 && (
              <ul className="divide-y rounded-md border">
                {keys
                  .filter((k) => briefs[k])
                  .map((k) => (
                    <li key={k} className={cn("flex gap-3 px-3 py-2", k === mine && "bg-accent/10")}>
                      <span className="w-14 shrink-0 font-mono text-xs font-bold text-accent">{slots[k]}</span>
                      <span>{briefs[k]}</span>
                    </li>
                  ))}
              </ul>
            )}
          </>
        ) : (
          <p className="text-muted-foreground">No plan written yet.</p>
        )}
        {event.sessionReview && (
          <div className="border-t pt-3">
            <p className="field-label mb-1">Review{event.sessionReviewedBy ? ` by ${event.sessionReviewedBy}` : ""}</p>
            <p className="whitespace-pre-wrap">{event.sessionReview}</p>
          </div>
        )}
        {page.isStaff && (
          <details className="border-t pt-3">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-accent">Edit the plan</summary>
            <div className="mt-3 flex flex-col gap-5">
              <ActionForm action={asAct(savePlanAction)}>
                <input type="hidden" name="id" value={event.id} />
                <Field label="Objective" htmlFor="objective" help="One line, e.g. press when their centre-back turns back.">
                  <Input id="objective" name="objective" maxLength={MAX_OBJECTIVE} defaultValue={event.sessionObjective ?? ""} />
                </Field>
                <Field label="The plan" htmlFor="plan">
                  <Textarea id="plan" name="plan" rows={5} maxLength={MAX_PLAN} defaultValue={event.sessionPlan ?? ""} />
                </Field>
                {keys.length > 0 ? (
                  <fieldset className="flex flex-col gap-2">
                    <legend className="field-label mb-1">What each position does</legend>
                    {keys
                      .filter((k) => !k.startsWith("SUB"))
                      .map((k) => (
                        <label key={k} className="flex items-center gap-3 text-sm">
                          <span className="w-14 shrink-0 font-mono text-xs font-bold text-accent">{slots[k]}{slots[k] !== k ? ` (${k})` : ""}</span>
                          <Input name={`brief__${k}`} maxLength={MAX_BRIEF} defaultValue={briefs[k] ?? ""} aria-label={`Brief for ${slots[k]}`} />
                        </label>
                      ))}
                  </fieldset>
                ) : (
                  <p className="text-xs text-muted-foreground">Give the session a formation (edit the event) to write a brief for each position.</p>
                )}
                <div>
                  <SubmitButton pendingText="Saving…">Save plan</SubmitButton>
                </div>
              </ActionForm>
              {page.started && (
                <ActionForm action={asAct(saveReviewAction)} className="border-t pt-4">
                  <input type="hidden" name="id" value={event.id} />
                  <Field label="Review: what worked" htmlFor="review">
                    <Textarea id="review" name="review" rows={4} maxLength={MAX_REVIEW} defaultValue={event.sessionReview ?? ""} />
                  </Field>
                  <div>
                    <SubmitButton variant="secondary" pendingText="Saving…">
                      Save review
                    </SubmitButton>
                  </div>
                </ActionForm>
              )}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

// --- Staff: attendance and who hasn't answered ----------------------------------- //

export function AttendanceCard({ page }: { page: EventPage }) {
  const rows = page.signups.filter((s) => s.status !== "OUT" || s.attendance);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Attendance</CardTitle>
        <CardDescription>Mark what actually happened. Only marked events count towards a player&apos;s reliability, and excused absences aren&apos;t held against them.</CardDescription>
      </CardHeader>
      <CardContent>
        {!page.started ? (
          <p className="text-sm text-muted-foreground">Available once the event has started.</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody signed up.</p>
        ) : (
          <ActionForm action={asAct(attendanceAction)}>
            <input type="hidden" name="id" value={page.event.id} />
            <ul className="divide-y">
              {rows.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="flex min-w-0 items-center gap-2 text-sm">
                    <Avatar discordId={s.discordId} avatar={s.avatar} name={s.name} size={24} className="rounded-full" />
                    <span className="truncate">{s.name}</span>
                    <SignupBadge status={s.status} />
                  </span>
                  <Select name={`att__${s.id}`} defaultValue={s.attendance ?? ""} aria-label={`Attendance for ${s.name}`} className="w-36">
                    <option value="">Not marked</option>
                    {(["PRESENT", "ABSENT", "EXCUSED"] as const).map((a) => (
                      <option key={a} value={a}>
                        {ATTENDANCE_LABEL[a]}
                      </option>
                    ))}
                  </Select>
                </li>
              ))}
            </ul>
            <div>
              <SubmitButton pendingText="Saving…">Save attendance</SubmitButton>
            </div>
          </ActionForm>
        )}
      </CardContent>
    </Card>
  );
}

const NIGHT: Record<string, [string, "success" | "outline" | "destructive" | "accent"]> = {
  free: ["Usually free", "success"],
  busy: ["Not usually", "outline"],
  away: ["Away", "destructive"],
  unknown: ["No nights set", "accent"],
};

/** Contracted players who haven't answered, with whether this is one of their usual nights. */
export function UnansweredCard({ page }: { page: EventPage }) {
  if (!page.unanswered.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Not answered ({page.unanswered.length})</CardTitle>
        <CardDescription>Under contract, no answer yet. Reminders go out 24 hours before.</CardDescription>
      </CardHeader>
      <CardContent className="py-2">
        <ul className="divide-y">
          {page.unanswered.map((e) => {
            const [label, variant] = NIGHT[page.nights.get(e.playerId) ?? "unknown"];
            return (
              <li key={e.playerId} className="flex items-center justify-between gap-2 py-2 text-sm">
                <Link href={`/players/${e.slug}`} className="min-w-0 truncate hover:underline">
                  {e.name}
                </Link>
                <Badge variant={variant}>{label}</Badge>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

// --- Staff controls -------------------------------------------------------------------- //

export function StaffBar({ page, discordUrl }: { page: EventPage; discordUrl: string | null }) {
  const { event } = page;
  const posted = !!event.discordMessageId;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Staff</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <div className="flex flex-wrap items-start gap-2">
          <Button asChild size="sm" variant="secondary">
            <Link href={`/fixtures/${event.id}/edit`}>Edit</Link>
          </Button>
          <ActionForm action={asAct(announceAction)} className="gap-0">
            <input type="hidden" name="id" value={event.id} />
            <SubmitButton size="sm" variant="outline" pendingText="Posting…">
              {posted ? "Update Discord post" : "Announce in Discord"}
            </SubmitButton>
          </ActionForm>
          <ActionForm action={asAct(signupsOpenAction)} className="gap-0">
            <input type="hidden" name="id" value={event.id} />
            <input type="hidden" name="open" value={event.signupsOpen ? "0" : "1"} />
            <SubmitButton size="sm" variant="outline" pendingText="Saving…">
              {event.signupsOpen ? "Close sign-ups" : "Reopen sign-ups"}
            </SubmitButton>
          </ActionForm>
          <ActionForm action={asAct(deleteEventAction)} className="gap-0">
            <input type="hidden" name="id" value={event.id} />
            <ConfirmButton size="sm" variant="outline" message="Delete this event and its sign-ups?">
              Delete
            </ConfirmButton>
          </ActionForm>
        </div>
        {discordUrl && (
          <a href={discordUrl} className="text-accent underline underline-offset-2" target="_blank" rel="noreferrer">
            Open the Discord post
          </a>
        )}
      </CardContent>
    </Card>
  );
}
