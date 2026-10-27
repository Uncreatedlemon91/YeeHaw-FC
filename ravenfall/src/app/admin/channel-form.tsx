"use client";

import { useState } from "react";
import { AdminForm } from "@/components/admin-form";
import { Field, Select } from "@/components/ui/input";
import { saveChannels } from "./actions";

export type ChannelGroup = { category: string; channels: { id: string; name: string }[] };
type Target = { key: string; label: string; help: string };

/** A dropdown per thing the bot posts, listing the server's text channels. */
export function ChannelForm({
  groups,
  targets,
  initial,
}: {
  groups: ChannelGroup[];
  targets: Target[];
  initial: Record<string, string>;
}) {
  const known = new Set(groups.flatMap((g) => g.channels.map((c) => c.id)));
  return (
    <AdminForm action={saveChannels} saveLabel="Save channels">
      <div className="grid gap-4 sm:grid-cols-2">
        {targets.map((t) => (
          <Field key={t.key} label={t.label} help={t.help}>
            <ChannelSelect name={t.key} groups={groups} known={known} initial={initial[t.key] ?? ""} />
          </Field>
        ))}
      </div>
    </AdminForm>
  );
}

/** Controlled for the same reason as the role pickers: see role-mapping-form.tsx. */
function ChannelSelect({ name, groups, known, initial }: { name: string; groups: ChannelGroup[]; known: Set<string>; initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <Select name={name} value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off">
      <option value="">— not posted —</option>
      {initial && !known.has(initial) && <option value={initial}>deleted or hidden channel ({initial})</option>}
      {groups.map((g) => (
        <optgroup key={g.category} label={g.category}>
          {g.channels.map((c) => (
            <option key={c.id} value={c.id}>
              #{c.name}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}
