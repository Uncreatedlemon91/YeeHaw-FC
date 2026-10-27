"use client";

import { useActionState, useRef } from "react";
import { type ActionState, FormMessage, SubmitButton } from "@/components/action-form";
import { CharCounter } from "@/components/public-counter";
import { Field, Input, Textarea } from "@/components/ui/input";

export type ApplyQuestion = {
  key: string;
  label: string;
  type: "text" | "number" | "textarea";
  required: boolean;
  max?: number;
  help?: string;
};
export type ApplyGroup = { legend: string; blurb?: string; keys: string[] };

type Action = (prev: ActionState, data: FormData) => Promise<ActionState>;

export function ApplyForm({ action, questions, groups }: { action: Action; questions: ApplyQuestion[]; groups: ApplyGroup[] }) {
  const [state, formAction] = useActionState(action, undefined);
  // React clears uncontrolled fields after an action, so keep what was typed
  // and remount the fields with it when the server sends errors back.
  const typed = useRef<Record<string, string>>({});
  const version = useRef({ state: state as ActionState, n: 0 });
  if (version.current.state !== state) version.current = { state, n: version.current.n + 1 };
  const errors = state?.fieldErrors;
  const nErrors = errors ? Object.keys(errors).length : 0;
  const byKey = new Map(questions.map((q) => [q.key, q]));

  return (
    <form
      action={(fd) => {
        typed.current = Object.fromEntries([...fd.entries()].map(([k, v]) => [k, String(v)]));
        formAction(fd);
      }}
      className="flex flex-col gap-8"
    >
      <p className="text-xs text-muted-foreground">
        Fields marked <span className="text-destructive-fg">*</span> are required.
      </p>
      <div key={version.current.n} className="flex flex-col gap-8">
        {groups.map((g, gi) => (
          <fieldset key={g.legend} className="flex flex-col gap-5 border-0 p-0">
            <legend className="mb-4 flex w-full items-baseline gap-3 border-b pb-2">
              <span className="font-display text-sm font-bold text-primary/70">{String(gi + 1).padStart(2, "0")}</span>
              <span className="text-sm font-bold uppercase tracking-wider">{g.legend}</span>
            </legend>
            {g.keys.map((k) => {
              const q = byKey.get(k);
              if (!q) return null;
              const describedBy = [q.help && `${q.key}-help`, q.type === "textarea" && q.max && `${q.key}-count`].filter(Boolean).join(" ") || undefined;
              const common = {
                id: q.key,
                name: q.key,
                required: q.required,
                defaultValue: typed.current[q.key],
                "aria-describedby": describedBy,
              };
              return (
                <div key={q.key} className="flex flex-col gap-1.5">
                  <Field label={q.label + (q.required ? " *" : " (optional)")} htmlFor={q.key} error={errors?.[q.key]}>
                    {q.type === "textarea" ? (
                      <Textarea {...common} maxLength={q.max} />
                    ) : q.type === "number" ? (
                      <Input {...common} type="number" min={13} max={99} className="w-28" />
                    ) : (
                      <Input {...common} maxLength={q.max} />
                    )}
                  </Field>
                  {(q.help || (q.type === "textarea" && q.max)) && (
                    <div className="flex items-start gap-3">
                      {q.help && (
                        <p id={`${q.key}-help`} className="text-xs text-muted-foreground">
                          {q.help}
                        </p>
                      )}
                      {q.type === "textarea" && q.max && (
                        <span id={`${q.key}-count`} className="ml-auto flex">
                          <CharCounter target={q.key} max={q.max} />
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </fieldset>
        ))}
      </div>
      {nErrors > 0 ? (
        <p role="alert" className="rounded border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive-fg">
          {nErrors === 1 ? "One answer needs attention" : `${nErrors} answers need attention`} — see the highlighted fields above.
        </p>
      ) : (
        <FormMessage state={state} />
      )}
      <SubmitButton variant="accent" size="lg" pendingText="Submitting…" className="self-start">
        Submit application
      </SubmitButton>
    </form>
  );
}
