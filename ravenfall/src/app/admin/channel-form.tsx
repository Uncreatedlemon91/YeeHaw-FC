"use client";

import { ActionForm, SubmitButton } from "@/components/action-form";
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
    <ActionForm action={saveChannels}>
      <div className="grid gap-4 sm:grid-cols-2">
        {targets.map((t) => {
          const value = initial[t.key] ?? "";
          return (
            <Field key={t.key} label={t.label} help={t.help}>
              <Select name={t.key} defaultValue={value}>
                <option value="">— not posted —</option>
                {value && !known.has(value) && <option value={value}>deleted or hidden channel ({value})</option>}
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
            </Field>
          );
        })}
      </div>
      <SubmitButton variant="accent" className="self-start" pendingText="Saving…">
        Save channels
      </SubmitButton>
    </ActionForm>
  );
}
