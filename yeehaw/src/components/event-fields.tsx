import type { EventSeries } from "@prisma/client";
import { ChipCheckbox } from "@/components/chip";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { EVENT_TYPE_LABEL, EVENT_TYPES, WEEKDAYS } from "@/config/club";
import { FORMATION_NAMES } from "@/config/formations";
import { ANNOUNCE_CHOICES } from "@/lib/event-rules";

// The fields of the event and series forms (parsed by parseEvent / parseSeries
// in lib/event-rules.ts). Plain server markup: the surrounding ActionForm owns
// the state. `errors` is ActionState.fieldErrors.

type Errors = Record<string, string | undefined>;

function Shared({
  defaults,
  errors,
}: {
  defaults: { title?: string; type?: string };
  errors: Errors;
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Title" htmlFor="title" error={errors.title}>
          <Input id="title" name="title" defaultValue={defaults.title ?? ""} maxLength={100} required placeholder="e.g. Friday scrim" />
        </Field>
        <Field label="Type" htmlFor="type" error={errors.type}>
          <Select id="type" name="type" defaultValue={defaults.type ?? "MATCH"}>
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {EVENT_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </>
  );
}

function Details({
  defaults,
  errors,
  suggestedFormation,
}: {
  defaults: { opponent?: string | null; description?: string; durationMinutes?: number; formation?: string | null };
  errors: Errors;
  suggestedFormation?: string;
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Opponent (optional)" htmlFor="opponent" error={errors.opponent}>
          <Input id="opponent" name="opponent" defaultValue={defaults.opponent ?? ""} maxLength={60} />
        </Field>
        <Field label="Length (minutes)" htmlFor="duration" error={errors.duration} help="Matches played in this window are linked to it for the report.">
          <Input id="duration" name="duration" type="number" min={15} max={720} step={5} inputMode="numeric" defaultValue={defaults.durationMinutes ?? 120} />
        </Field>
        <Field label="Formation" htmlFor="formation" error={errors.formation} help="With a formation, signing up means taking a position.">
          <Select id="formation" name="formation" defaultValue={defaults.formation ?? suggestedFormation ?? ""}>
            <option value="">None: going / maybe / out</option>
            {FORMATION_NAMES.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Description (optional)" htmlFor="description" error={errors.description}>
        <Textarea id="description" name="description" rows={3} maxLength={1500} defaultValue={defaults.description ?? ""} placeholder="Server, kick-off details, what to bring." />
      </Field>
    </>
  );
}

export type EventDefaults = { id?: string; title?: string; type?: string; opponent?: string | null; description?: string; startsAt?: string; durationMinutes?: number; formation?: string | null };

/** A one-off event. `startsAt` is the datetime-local value in club time. */
export function EventFields({ defaults = {}, errors = {}, suggestedFormation, creating }: { defaults?: EventDefaults; errors?: Errors; suggestedFormation?: string; creating?: boolean }) {
  return (
    <>
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}
      <Shared defaults={defaults} errors={errors} />
      <Field label="Starts (club time)" htmlFor="startsAt" error={errors.startsAt} className="max-w-xs">
        <Input id="startsAt" name="startsAt" type="datetime-local" defaultValue={defaults.startsAt ?? ""} required />
      </Field>
      <Details defaults={defaults} errors={errors} suggestedFormation={suggestedFormation} />
      {creating && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="announce" defaultChecked className="size-4 accent-[var(--primary)]" /> Announce in Discord with sign-up buttons
        </label>
      )}
    </>
  );
}

export function SeriesFields({ series, errors = {}, suggestedFormation, today }: { series?: EventSeries; errors?: Errors; suggestedFormation?: string; today: string }) {
  const days = new Set(series?.weekdays ?? []);
  return (
    <>
      <Shared defaults={{ title: series?.title, type: series?.type ?? "TRAINING" }} errors={errors} />
      <fieldset className="flex flex-col gap-1.5">
        <legend className="field-label mb-1.5">Repeats on</legend>
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map((d, i) => (
            <ChipCheckbox key={d} name="day" value={i} defaultChecked={days.has(i)} chipClassName="min-w-12 text-center">
              {d}
            </ChipCheckbox>
          ))}
        </div>
        {errors.day && (
          <p role="alert" className="text-xs text-destructive-fg">
            {errors.day}
          </p>
        )}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Time (club time)" htmlFor="timeOfDay" error={errors.timeOfDay}>
          <Input id="timeOfDay" name="timeOfDay" type="time" defaultValue={series?.timeOfDay ?? "20:00"} required />
        </Field>
        <Field label="First date" htmlFor="startsOn" error={errors.startsOn}>
          <Input id="startsOn" name="startsOn" type="date" defaultValue={series?.startsOn.toISOString().slice(0, 10) ?? today} required />
        </Field>
        <Field label="Last date (optional)" htmlFor="endsOn" error={errors.endsOn} help="Leave empty to run until paused.">
          <Input id="endsOn" name="endsOn" type="date" defaultValue={series?.endsOn?.toISOString().slice(0, 10) ?? ""} />
        </Field>
      </div>
      <Details defaults={{ opponent: series?.opponent, description: series?.description, durationMinutes: series?.durationMinutes ?? 90, formation: series?.formation }} errors={errors} suggestedFormation={suggestedFormation} />
      <Field label="Announce in Discord" htmlFor="announceDaysBefore" error={errors.announceDaysBefore} help="Each night's announcement, with sign-up buttons, is posted this long before. Otherwise announce each by hand.">
        <Select id="announceDaysBefore" name="announceDaysBefore" defaultValue={series?.announceDaysBefore?.toString() ?? ""} className="max-w-xs">
          <option value="">Don&apos;t: I&apos;ll announce by hand</option>
          {ANNOUNCE_CHOICES.map((n) => (
            <option key={n} value={n}>
              {n} day{n === 1 ? "" : "s"} before
            </option>
          ))}
        </Select>
      </Field>
    </>
  );
}
