"use client";

import { useActionState, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { revokeAward } from "@/app/personnel/award-actions";

/** Command's "Revoke" on one award: asks for the reason, which goes on the service record. */
export function RevokeAward({ memberAwardId, name }: { memberAwardId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(revokeAward, undefined);
  if (state?.ok) return <FormMessage state={state} />;
  if (!open)
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Revoke
      </Button>
    );
  return (
    <form action={action} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input type="hidden" name="memberAwardId" value={memberAwardId} />
      <Input name="reason" required minLength={3} maxLength={500} placeholder={`Why revoke the ${name}?`} aria-label={`Reason for revoking the ${name}`} className="sm:w-64" autoFocus />
      <div className="flex gap-2">
        <SubmitButton size="sm" variant="destructive" pendingText="Revoking…">
          Revoke
        </SubmitButton>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
