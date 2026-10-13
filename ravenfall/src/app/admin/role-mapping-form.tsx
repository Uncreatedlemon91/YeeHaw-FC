"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Select } from "@/components/ui/input";
import { saveRoleMapping } from "./actions";

export type PickRole = { id: string; name: string; color: number };
type Target = { key: string; label: string; help?: string };

const dot = (color: number) => (color ? `#${color.toString(16).padStart(6, "0")}` : "#888");

function nameOf(roles: PickRole[], id: string) {
  return roles.find((r) => r.id === id)?.name ?? `deleted role (${id})`;
}

/** Several roles for one target: chips plus an "add" dropdown. */
function MultiRolePicker({ name, roles, initial }: { name: string; roles: PickRole[]; initial: string[] }) {
  const [picked, setPicked] = useState(initial);
  const left = roles.filter((r) => !picked.includes(r.id));
  return (
    <div className="flex flex-col gap-2">
      {picked.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
      {picked.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {picked.map((id) => (
            <span key={id} className="inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-xs">
              <span className="inline-block size-2 rounded-full" style={{ background: dot(roles.find((r) => r.id === id)?.color ?? 0) }} />
              {nameOf(roles, id)}
              <button
                type="button"
                aria-label={`Remove ${nameOf(roles, id)}`}
                onClick={() => setPicked((p) => p.filter((x) => x !== id))}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <Select
        value=""
        onChange={(e) => e.target.value && setPicked((p) => [...p, e.target.value])}
        disabled={!left.length}
        aria-label="Add a role"
      >
        <option value="">{picked.length ? "Add another role…" : "Add a role…"}</option>
        {left.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </Select>
    </div>
  );
}

/** At most one role for one target. */
function SingleRolePicker({ name, roles, initial }: { name: string; roles: PickRole[]; initial: string }) {
  const known = !initial || roles.some((r) => r.id === initial);
  return (
    <Select name={name} defaultValue={initial}>
      <option value="">— not synced —</option>
      {!known && <option value={initial}>deleted role ({initial})</option>}
      {roles.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
        </option>
      ))}
    </Select>
  );
}

function Section({ title, help, children }: { title: string; help: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3 border-t pt-4 first:border-t-0 first:pt-0">
      <legend className="sr-only">{title}</legend>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <p className="text-xs text-muted-foreground">{help}</p>
      </div>
      {children}
    </fieldset>
  );
}

export function RoleMappingForm({
  roles,
  perms,
  initial,
  ranks,
  squads,
  billets,
}: {
  roles: PickRole[];
  perms: Target[];
  initial: {
    perms: Record<string, string[]>;
    candidate: string;
    recruit: string;
    ranks: Record<string, string>;
    squads: Record<string, string>;
    billets: Record<string, string>;
  };
  ranks: Target[];
  squads: Target[];
  billets: Target[];
}) {
  const grid = "grid gap-3 sm:grid-cols-2 lg:grid-cols-3";
  return (
    <ActionForm action={saveRoleMapping} className="gap-6">
      <Section title="Site permissions" help="Members get the highest permission any of their Discord roles grants.">
        <div className="grid gap-4 sm:grid-cols-2">
          {perms.map((p) => (
            <Field key={p.key} label={p.label} help={p.help}>
              <MultiRolePicker name={`perm:${p.key}`} roles={roles} initial={initial.perms[p.key] ?? []} />
            </Field>
          ))}
        </div>
      </Section>

      <Section title="Recruitment" help="Swapped by the bot when an application is submitted and approved.">
        <div className={grid}>
          <Field label="Candidate" help="Given on applying, removed on approval.">
            <SingleRolePicker name="candidate" roles={roles} initial={initial.candidate} />
          </Field>
          <Field label="Recruit" help="Given on approval.">
            <SingleRolePicker name="recruit" roles={roles} initial={initial.recruit} />
          </Field>
        </div>
      </Section>

      {(
        [
          ["Ranks", "Kept in step on promotion, and read when a personnel file is generated.", "rank", ranks],
          ["Squads", "Kept in step when a member's squad changes.", "squad", squads],
          ["Billets", "Kept in step with each member's primary and secondary roles.", "billet", billets],
        ] as const
      ).map(([title, help, prefix, targets]) => (
        <Section key={prefix} title={title} help={help}>
          <div className={grid}>
            {targets.map((t) => (
              <Field key={t.key} label={t.label}>
                <SingleRolePicker
                  name={`${prefix}:${t.key}`}
                  roles={roles}
                  initial={(prefix === "rank" ? initial.ranks : prefix === "squad" ? initial.squads : initial.billets)[t.key] ?? ""}
                />
              </Field>
            ))}
          </div>
        </Section>
      ))}

      <SubmitButton variant="accent" className="self-start" pendingText="Saving…">
        Save role mapping
      </SubmitButton>
    </ActionForm>
  );
}
