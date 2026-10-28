import { Field, Input, Select } from "@/components/ui/input";
import { POSITION_LABEL, POSITIONS } from "@/config/club";

// The prospect's details as form fields (parsed by parseProspect in
// lib/recruitment-rules.ts). `errors` is ActionState.fieldErrors.

export function ProspectFields({ defaults = {}, errors = {} }: { defaults?: { name?: string; discordId?: string | null; gamertag?: string | null; position?: string | null; secondaryPosition?: string | null; source?: string | null }; errors?: Record<string, string | undefined> }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Field label="Name" htmlFor="name" error={errors.name}>
        <Input id="name" name="name" maxLength={60} required defaultValue={defaults.name ?? ""} />
      </Field>
      <Field label="Discord ID" htmlFor="discordId" error={errors.discordId} help="Developer Mode, Copy User ID. Needed to offer a contract.">
        <Input id="discordId" name="discordId" inputMode="numeric" defaultValue={defaults.discordId ?? ""} />
      </Field>
      <Field label="Gamertag" htmlFor="gamertag" error={errors.gamertag}>
        <Input id="gamertag" name="gamertag" maxLength={64} defaultValue={defaults.gamertag ?? ""} autoComplete="off" />
      </Field>
      <Field label="Primary position" htmlFor="position" error={errors.position}>
        <Select id="position" name="position" defaultValue={defaults.position ?? ""}>
          <option value="">Not sure</option>
          {POSITIONS.map((p) => (
            <option key={p} value={p}>
              {POSITION_LABEL[p]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Secondary position" htmlFor="secondaryPosition" error={errors.secondaryPosition}>
        <Select id="secondaryPosition" name="secondaryPosition" defaultValue={defaults.secondaryPosition ?? ""}>
          <option value="">None</option>
          {POSITIONS.map((p) => (
            <option key={p} value={p}>
              {POSITION_LABEL[p]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Where from" htmlFor="source" error={errors.source}>
        <Input id="source" name="source" maxLength={120} defaultValue={defaults.source ?? ""} placeholder="e.g. Reddit, a friend of Viper" />
      </Field>
    </div>
  );
}
