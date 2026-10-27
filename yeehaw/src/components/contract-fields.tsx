import type { Captaincy, Position, SquadStatus } from "@prisma/client";
import { POSITIONS, POSITION_LABEL, SHIRT_MAX, SHIRT_MIN, SQUAD_STATUSES, SQUAD_STATUS_LONG } from "@/config/club";
import { Field, Input, Select } from "@/components/ui/input";

export type TermsDefaults = {
  shirtNumber?: number | null;
  squadStatus?: SquadStatus;
  position?: Position | null;
  secondaryPosition?: Position | null;
  captaincy?: Captaincy;
  /** "Goals 10, Assists 5" */
  objectives?: string;
};

/**
 * The contract terms as form fields (parsed by parseTerms in contract-rules).
 * `prefix` namespaces the names when several contracts share one form (the
 * re-signing window); `errors` is keyed by prefixed field name.
 */
export function TermsFields({
  prefix = "",
  defaults = {},
  errors = {},
}: {
  prefix?: string;
  defaults?: TermsDefaults;
  errors?: Record<string, string | undefined>;
}) {
  const n = (f: string) => prefix + f;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Shirt number" htmlFor={n("shirtNumber")} error={errors[n("shirtNumber")]}>
        <Input id={n("shirtNumber")} name={n("shirtNumber")} type="number" inputMode="numeric" min={SHIRT_MIN} max={SHIRT_MAX} defaultValue={defaults.shirtNumber ?? ""} />
      </Field>
      <Field label="Squad status" htmlFor={n("squadStatus")} error={errors[n("squadStatus")]}>
        <Select id={n("squadStatus")} name={n("squadStatus")} defaultValue={defaults.squadStatus ?? "ROTATION"}>
          {SQUAD_STATUSES.map((s) => (
            <option key={s} value={s}>{SQUAD_STATUS_LONG[s]}</option>
          ))}
        </Select>
      </Field>
      <Field label="Armband" htmlFor={n("captaincy")} error={errors[n("captaincy")]}>
        <Select id={n("captaincy")} name={n("captaincy")} defaultValue={defaults.captaincy ?? "NONE"}>
          <option value="NONE">None</option>
          <option value="CAPTAIN">Captain</option>
          <option value="VICE">Vice-captain</option>
        </Select>
      </Field>
      <Field label="Primary position" htmlFor={n("position")} error={errors[n("position")]}>
        <Select id={n("position")} name={n("position")} defaultValue={defaults.position ?? ""}>
          <option value="">Choose…</option>
          {POSITIONS.map((p) => (
            <option key={p} value={p}>{POSITION_LABEL[p]}</option>
          ))}
        </Select>
      </Field>
      <Field label="Secondary position" htmlFor={n("secondaryPosition")} error={errors[n("secondaryPosition")]}>
        <Select id={n("secondaryPosition")} name={n("secondaryPosition")} defaultValue={defaults.secondaryPosition ?? ""}>
          <option value="">None</option>
          {POSITIONS.map((p) => (
            <option key={p} value={p}>{POSITION_LABEL[p]}</option>
          ))}
        </Select>
      </Field>
      <Field
        label="Objectives"
        htmlFor={n("objectives")}
        help="e.g. Goals 10, Assists 5, Average rating 7.2, Attendance 80"
        error={errors[n("objectives")]}
      >
        <Input id={n("objectives")} name={n("objectives")} defaultValue={defaults.objectives ?? ""} />
      </Field>
    </div>
  );
}
