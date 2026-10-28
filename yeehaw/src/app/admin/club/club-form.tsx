"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/action-form";
import { Field, Input, Textarea } from "@/components/ui/input";
import { PROFILE_FIELDS, type ClubProfile } from "@/lib/club-profile";
import { saveClubProfile } from "./actions";

export function ClubForm({ initial }: { initial: ClubProfile }) {
  const [state, action] = useActionState(saveClubProfile, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      {PROFILE_FIELDS.map((f) => (
        <Field key={f.key} label={f.label} htmlFor={`cp-${f.key}`} error={state?.fieldErrors?.[f.key]}>
          {f.multiline ? (
            <Textarea id={`cp-${f.key}`} name={f.key} rows={3} maxLength={f.limit} defaultValue={initial[f.key]} />
          ) : (
            <Input id={`cp-${f.key}`} name={f.key} maxLength={f.limit} defaultValue={initial[f.key]} placeholder={f.placeholder} />
          )}
        </Field>
      ))}
      <p className="text-xs text-muted-foreground">
        Leave a field blank to leave it off the page. The record, recent results, squad size and staff are filled in automatically.
      </p>
      <FormMessage state={state} />
      <div>
        <SubmitButton pendingText="Saving…">Save</SubmitButton>
      </div>
    </form>
  );
}
