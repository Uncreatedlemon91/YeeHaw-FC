"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { FormMessage } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { decide } from "./actions";

// One of the verdict buttons. While the form is in flight both are disabled
// (so Approve and Deny can never both fire) and only the one clicked spins.
function Verdict({ verdict, children, pendingText, variant }: { verdict: "approve" | "deny"; children: string; pendingText: string; variant?: "destructive" }) {
  const { pending, data } = useFormStatus();
  const mine = pending && data?.get("verdict") === verdict;
  return (
    <Button type="submit" name="verdict" value={verdict} size="sm" variant={variant} disabled={pending} aria-busy={mine || undefined}>
      {mine ? (
        <>
          <Loader2 className="animate-spin" aria-hidden /> {pendingText}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

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
          <Verdict verdict="approve" pendingText="Approving…">
            Approve
          </Verdict>
          <Verdict verdict="deny" variant="destructive" pendingText="Denying…">
            Deny
          </Verdict>
        </div>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
