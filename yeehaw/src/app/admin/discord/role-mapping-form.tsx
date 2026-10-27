"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { AdminForm } from "@/components/admin-form";
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
        autoComplete="off"
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

/**
 * At most one role for one target. Controlled, and with browser autofill
 * off: React resets uncontrolled fields after a form action, and the browser
 * then restored that blank state on refresh, hiding the saved choice.
 */
function SingleRolePicker({ name, roles, initial }: { name: string; roles: PickRole[]; initial: string }) {
  const [value, setValue] = useState(initial);
  const known = !initial || roles.some((r) => r.id === initial);
  return (
    <Select name={name} value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off">
      <option value="">— not mapped —</option>
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
    <fieldset className="flex flex-col gap-3 rounded-lg border bg-background/30 p-4">
      <legend className="sr-only">{title}</legend>
      <div>
        <div className="text-xs font-semibold uppercase tracking-label text-accent">{title}</div>
        <p className="mt-0.5 text-xs text-muted-foreground">{help}</p>
      </div>
      {children}
    </fieldset>
  );
}

export type RoleMappingInitial = {
  perms: Record<string, string[]>;
  clubRoles: Record<string, string>;
  squad: string;
  status: Record<string, string>;
  trialist: string;
};

export function RoleMappingForm({
  roles,
  perms,
  clubRoles,
  statuses,
  initial,
}: {
  roles: PickRole[];
  perms: Target[];
  clubRoles: Target[];
  statuses: Target[];
  initial: RoleMappingInitial;
}) {
  const grid = "grid gap-3 sm:grid-cols-2 lg:grid-cols-3";
  return (
    <AdminForm action={saveRoleMapping} saveLabel="Save role mapping">
      <Section title="Site permissions" help="People get the highest permission any of their Discord roles grants. Without a Member role mapped, anyone in the server is a member.">
        <div className="grid gap-4 sm:grid-cols-2">
          {perms.map((p) => (
            <Field key={p.key} label={p.label} help={p.help}>
              <MultiRolePicker name={`perm:${p.key}`} roles={roles} initial={initial.perms[p.key] ?? []} />
            </Field>
          ))}
        </div>
      </Section>

      <Section title="Club titles" help="Read from Discord to show on a player's hub. President and Head Coach also count as Management, Coach as Staff.">
        <div className={grid}>
          {clubRoles.map((t) => (
            <Field key={t.key} label={t.label}>
              <SingleRolePicker name={`club:${t.key}`} roles={roles} initial={initial.clubRoles[t.key] ?? ""} />
            </Field>
          ))}
        </div>
      </Section>

      <Section title="Roles the site gives" help="Granted when a player accepts a contract and removed when it ends or they are released. The bot's role must sit above these in the server's role list.">
        <div className={grid}>
          <Field label="Squad" help="Anyone under contract.">
            <SingleRolePicker name="squad" roles={roles} initial={initial.squad} />
          </Field>
          {statuses.map((t) => (
            <Field key={t.key} label={t.label} help="Given for this squad status; the other two are removed.">
              <SingleRolePicker name={`status:${t.key}`} roles={roles} initial={initial.status[t.key] ?? ""} />
            </Field>
          ))}
          <Field label="Trialist" help="On trial or with an offer out, not yet signed.">
            <SingleRolePicker name="trialist" roles={roles} initial={initial.trialist} />
          </Field>
        </div>
      </Section>
    </AdminForm>
  );
}
