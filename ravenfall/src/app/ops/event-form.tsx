import type { Event } from "@prisma/client";
import { ActionForm, type ActionState, SubmitButton } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { env } from "@/lib/env";
import { toInput } from "@/lib/time";

export function EventForm({
  action,
  event,
  showAnnounce,
}: {
  action: (prev: ActionState, data: FormData) => Promise<ActionState>;
  event?: Event;
  showAnnounce?: boolean;
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
      <Field label="Briefing (Markdown)" htmlFor="description" help="Situation, mission, execution, kit — whatever members need beforehand.">
        <Textarea id="description" name="description" className="min-h-48 font-mono text-xs" defaultValue={event?.description} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="mandatory" defaultChecked={event?.mandatory} className="size-4 accent-[var(--accent)]" />
        Mandatory attendance
      </label>
      {showAnnounce && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="announce" defaultChecked className="size-4 accent-[var(--accent)]" />
          Announce on Discord
        </label>
      )}
      <SubmitButton className="self-start">{event ? "Save changes" : "Schedule"}</SubmitButton>
    </ActionForm>
  );
}
