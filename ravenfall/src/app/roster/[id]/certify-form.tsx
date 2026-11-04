"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Select, Textarea } from "@/components/ui/input";
import { awardQualification } from "../actions";

export type CertifyOption = { id: string; title: string; category: string; tasks: string[]; blockers: string[]; renew: boolean };

/** Pick a qualification, check off its assessment tasks, certify. */
export function CertifyForm({ userId, options }: { userId: string; options: CertifyOption[] }) {
  const [id, setId] = useState(options.find((o) => !o.blockers.length)?.id ?? options[0]?.id ?? "");
  const [ticked, setTicked] = useState<string[]>([]);
  const q = options.find((o) => o.id === id);
  const ready = !!q && !q.blockers.length && ticked.length === q.tasks.length;
  return (
    <ActionForm action={awardQualification} className="mt-2 gap-3 border-t border-foreground/10 pt-4">
      <input type="hidden" name="userId" value={userId} />
      <Field label="Certify in" htmlFor="qualificationId">
        <Select
          id="qualificationId"
          name="qualificationId"
          required
          value={id}
          onChange={(e) => {
            setId(e.target.value);
            setTicked([]);
          }}
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title}
              {o.renew ? " (recertify)" : ""}
              {o.blockers.length ? " (not eligible)" : ""}
            </option>
          ))}
        </Select>
      </Field>
      {q && q.blockers.length > 0 && (
        <ul className="text-xs text-warning">
          {q.blockers.map((b) => (
            <li key={b}>{b}.</li>
          ))}
        </ul>
      )}
      {q && !q.blockers.length && q.tasks.length > 0 && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="field-label mb-1">
            Assessment ({ticked.length}/{q.tasks.length})
          </legend>
          {q.tasks.map((t) => (
            <label key={t} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="passed"
                value={t}
                checked={ticked.includes(t)}
                onChange={(e) => setTicked(e.target.checked ? [...ticked, t] : ticked.filter((x) => x !== t))}
                className="mt-0.5 size-4 accent-[var(--accent)]"
              />
              {t}
            </label>
          ))}
        </fieldset>
      )}
      {q && !q.blockers.length && (
        <Field label="Assessor's note (optional)" htmlFor="certify-note">
          <Textarea id="certify-note" name="note" maxLength={500} className="min-h-16 text-sm" />
        </Field>
      )}
      <SubmitButton size="sm" className="self-start" disabled={!ready} pendingText="Certifying…">
        {q?.renew ? "Recertify" : "Certify"}
      </SubmitButton>
    </ActionForm>
  );
}
