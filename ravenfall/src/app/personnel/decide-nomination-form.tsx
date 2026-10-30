"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { FormMessage } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { decideNomination } from "./award-actions";

// Same shape as decide-form.tsx: both buttons lock while one is in flight and
// the outcome stays on screen after the nomination stops being PENDING.
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

export function DecideNominationForm({ nominationId }: { nominationId: string }) {
  const [state, action] = useActionState(decideNomination, undefined);
  if (state?.ok) return <div className="mt-3 border-t pt-3"><FormMessage state={state} /></div>;
  return (
    <form action={action} className="mt-3 flex flex-col gap-2 border-t pt-3">
      <input type="hidden" name="nominationId" value={nominationId} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input name="note" maxLength={500} placeholder="Note to the nominator (optional)" className="sm:flex-1" />
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
