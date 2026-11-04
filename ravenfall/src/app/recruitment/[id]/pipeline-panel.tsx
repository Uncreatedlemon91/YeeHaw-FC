import type { RecruitStage } from "@prisma/client";
import { Check } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { env } from "@/lib/env";
import { APPLICANT_STAGES, isCold, NEXT_ACTION, STAGE_LABEL } from "@/lib/recruit-pipeline";
import { fmt, toInput } from "@/lib/time";
import { cn } from "@/lib/utils";
import { claim, moveStage, saveNotes } from "../actions";

type App = {
  id: string;
  stage: RecruitStage;
  stageAt: Date;
  interviewAt: Date | null;
  notes: string | null;
  recruiterId: string | null;
  recruiter: { callsign: string | null; discordUsername: string } | null;
};

/** A pending application's progress: stage, interview, who has it, notes. */
export function PipelinePanel({ app, meId }: { app: App; meId: string }) {
  const at = APPLICANT_STAGES.indexOf(app.stage);
  const cold = isCold(app.stage, app.stageAt, new Date(), app.interviewAt);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Pipeline {cold && <Badge variant="warning">Going cold</Badge>}
        </CardTitle>
        <CardDescription>
          {STAGE_LABEL[app.stage]} since {fmt(app.stageAt, "d MMM HH:mm")}. Next: {NEXT_ACTION[app.stage].toLowerCase()}.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <ol className="flex flex-col gap-1.5 text-sm" aria-label="Stages">
          {APPLICANT_STAGES.map((s, i) => (
            <li key={s} aria-current={i === at ? "step" : undefined} className={cn("flex items-center gap-2", i > at && "text-muted-foreground")}>
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border text-micro",
                  i < at ? "border-success-fg bg-success/20 text-success-fg" : i === at ? "border-accent text-accent" : "border-border",
                )}
              >
                {i < at ? <Check className="size-3" aria-hidden /> : i + 1}
              </span>
              {STAGE_LABEL[s]}
              {s === "INTERVIEW_SET" && app.interviewAt && <span className="text-xs text-muted-foreground">· {fmt(app.interviewAt, "EEE d MMM HH:mm zzz")}</span>}
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap gap-2">
          {app.stage === "APPLIED" && (
            <ActionForm action={moveStage}>
              <input type="hidden" name="appId" value={app.id} />
              <input type="hidden" name="stage" value="CONTACTED" />
              <SubmitButton size="sm" variant="outline" pendingText="Saving…">
                Mark contacted
              </SubmitButton>
            </ActionForm>
          )}
          {(app.stage === "INTERVIEW_SET" || app.stage === "CONTACTED") && (
            <ActionForm action={moveStage}>
              <input type="hidden" name="appId" value={app.id} />
              <input type="hidden" name="stage" value="INTERVIEWED" />
              <SubmitButton size="sm" variant="outline" pendingText="Saving…">
                Mark interviewed
              </SubmitButton>
            </ActionForm>
          )}
        </div>

        {app.stage !== "INTERVIEWED" && (
          <ActionForm action={moveStage} className="gap-2">
            <input type="hidden" name="appId" value={app.id} />
            <input type="hidden" name="stage" value="INTERVIEW_SET" />
            <Field label={`${app.interviewAt ? "Move the interview" : "Set an interview"} (${env.timezone})`} htmlFor="interviewAt">
              <Input id="interviewAt" name="interviewAt" type="datetime-local" required defaultValue={toInput(app.interviewAt)} />
            </Field>
            <SubmitButton size="sm" className="self-start" pendingText="Saving…">
              {app.interviewAt ? "Reschedule" : "Set interview"}
            </SubmitButton>
            <p className="text-micro text-muted-foreground">The applicant gets the time by Discord DM.</p>
          </ActionForm>
        )}
        {app.stage === "INTERVIEWED" && <p className="text-sm text-muted-foreground">Interview done: approve or deny below.</p>}

        <ActionForm action={claim} className="gap-2">
          <input type="hidden" name="appId" value={app.id} />
          <p className="text-sm">
            <span className="field-label mr-2">Recruiter</span>
            {app.recruiter ? (app.recruiter.callsign ?? app.recruiter.discordUsername) : <span className="text-muted-foreground">Nobody yet</span>}
          </p>
          {app.recruiterId === meId ? (
            <SubmitButton name="release" value="1" size="sm" variant="ghost" className="self-start" pendingText="Saving…">
              Hand it back
            </SubmitButton>
          ) : (
            <SubmitButton size="sm" variant="outline" className="self-start" pendingText="Saving…">
              {app.recruiterId ? "Take it over" : "Take it on"}
            </SubmitButton>
          )}
        </ActionForm>

        <ActionForm action={saveNotes} className="gap-2">
          <input type="hidden" name="appId" value={app.id} />
          <Field label="Recruiter notes (never shown to the applicant)" htmlFor="notes">
            <Textarea id="notes" name="notes" maxLength={5000} defaultValue={app.notes ?? ""} className="min-h-24 text-sm" />
          </Field>
          <SubmitButton size="sm" variant="outline" className="self-start" pendingText="Saving…">
            Save notes
          </SubmitButton>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
