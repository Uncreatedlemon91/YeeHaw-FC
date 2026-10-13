"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { decide } from "./actions";

// Client-side so the outcome survives the re-render: once the decision
// lands the request stops being PENDING, and a plain server-rendered form
// would unmount before its result (and any Discord warnings) could show.
export function DecideForm({ requestId, pending }: { requestId: string; pending: boolean }) {
  const [state, action] = useActionState(decide, undefined);
  if (state?.ok) return <div className="mt-3 border-t pt-3"><FormMessage state={state} /></div>;
  if (!pending) return null;
  return (
    <form action={action} className="mt-3 flex flex-col gap-2 border-t pt-3">
      <input type="hidden" name="requestId" value={requestId} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input name="note" maxLength={500} placeholder="Note to the member (optional)" className="sm:flex-1" />
        <div className="flex gap-2">
          <SubmitButton name="verdict" value="approve" size="sm">
            Approve
          </SubmitButton>
          <SubmitButton name="verdict" value="deny" size="sm" variant="destructive">
            Deny
          </SubmitButton>
        </div>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
