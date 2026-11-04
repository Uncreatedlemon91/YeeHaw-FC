import type { Event } from "@prisma/client";
import { ActionForm, type ActionState, SubmitButton } from "@/components/action-form";
import { BriefingField } from "@/components/ops-briefing-field";
import { Field, Input, Select } from "@/components/ui/input";
import { SQUADS } from "@/config/unit";
import { env } from "@/lib/env";
import { toInput } from "@/lib/time";

export function EventForm({
  action,
  event,
  showAnnounce,
  courses = [],
}: {
  action: (prev: ActionState, data: FormData) => Promise<ActionState>;
  event?: Event;
  showAnnounce?: boolean;
  /** Active qualifications, for "this event is a course". */
  courses?: { id: string; title: string }[];
}) {
  return (
    <ActionForm action={action}>
      {event && <input type="hidden" name="id" value={event.id} />}
      <Field label="Title" htmlFor="title">
        <Input id="title" name="title" required maxLength={120} defaultValue={event?.title} placeholder="Operation Iron Vigil" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type" htmlFor="type">
          <Select id="type" name="type" defaultValue={event?.type ?? "OP"}>
            <option value="OP">Operation</option>
            <option value="TRAINING">Training</option>
            <option value="BRIEFING">Briefing</option>
          </Select>
        </Field>
        <Field label="Course (optional)" htmlFor="courseId" help="A training that certifies: its AAR can mark who passed.">
          <Select id="courseId" name="courseId" defaultValue={event?.courseId ?? ""}>
            <option value="">Not a course</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Location / server (optional)" htmlFor="location">
          <Input id="location" name="location" maxLength={120} defaultValue={event?.location ?? ""} />
        </Field>
        <Field label={`Start (${env.timezone})`} htmlFor="startTime">
          <Input id="startTime" name="startTime" type="datetime-local" required defaultValue={toInput(event?.startTime)} />
        </Field>
        <Field label="End (optional)" htmlFor="endTime">
          <Input id="endTime" name="endTime" type="datetime-local" defaultValue={toInput(event?.endTime)} />
        </Field>
      </div>
      <BriefingField defaultValue={event?.description} />
      <fieldset className="flex flex-col gap-3 rounded-md border p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-label text-muted-foreground">Invite</legend>
        <p className="text-xs text-muted-foreground">
          Tick the squads this is for: only they can sign up, and the Discord post pings their roles. Leave them all unticked to invite the whole unit.
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {SQUADS.map((s) => (
            <label key={s.name} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="invitedSquads"
                value={s.name}
                defaultChecked={event?.invitedSquads.includes(s.name)}
                className="size-4 accent-[var(--accent)]"
              />
              {s.name} <span className="text-xs text-muted-foreground">{s.callsign}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-3 rounded-md border p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-label text-muted-foreground">Options</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="mandatory" defaultChecked={event?.mandatory} className="size-4 accent-[var(--accent)]" />
          Mandatory attendance
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="openToRecruits" defaultChecked={event?.openToRecruits} className="mt-0.5 size-4 accent-[var(--accent)]" />
          <span>
            Open to recruits
            <span className="block text-xs text-muted-foreground">
              Recruits and applicants under review can see it and sign up too: recruit nights, basic training. The Discord post pings the Recruit and Candidate roles.
            </span>
          </span>
        </label>
        {showAnnounce && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="announce" defaultChecked className="size-4 accent-[var(--accent)]" />
            Announce on Discord
          </label>
        )}
      </fieldset>
      <SubmitButton className="self-start" pendingText="Saving…">{event ? "Save changes" : "Schedule"}</SubmitButton>
    </ActionForm>
  );
}
