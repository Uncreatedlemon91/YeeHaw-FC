"use client";

import type { Qualification } from "@prisma/client";
import { useActionState } from "react";
import { FormMessage, SubmitButton, type ActionState } from "@/components/action-form";
import { Field, Input, Select } from "@/components/ui/input";
import { CATEGORIES, categoryLabel } from "@/components/vault-category";

export function QualificationForm({
  action,
  qualification,
}: {
  action: (prev: ActionState, data: FormData) => Promise<ActionState>;
  qualification?: Qualification;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const fe = state?.fieldErrors;
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {qualification && <input type="hidden" name="id" value={qualification.id} />}
      <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
        <Field label="Title" htmlFor="title" error={fe?.title}>
          <Input id="title" name="title" required maxLength={120} defaultValue={qualification?.title} placeholder="Combat Lifesaver" />
        </Field>
        <Field label="Category" htmlFor="category" error={fe?.category}>
          <Select id="category" name="category" defaultValue={qualification?.category ?? "GENERAL"}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Summary" htmlFor="summary" help="One line shown beside the qualification." error={fe?.summary}>
        <Input id="summary" name="summary" maxLength={300} defaultValue={qualification?.summary} />
      </Field>
      <FormMessage state={state} />
      <div>
        <SubmitButton pendingText="Saving…">{qualification ? "Save" : "Create and write the manual"}</SubmitButton>
      </div>
    </form>
  );
}
