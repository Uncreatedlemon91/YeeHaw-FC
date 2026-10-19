"use client";

import { Check, Loader2, X } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { rsvp } from "@/app/ops/actions";

type Status = "ATTENDING" | "ABSENT" | null | undefined;

function Choice({ value, active, children, activeVariant = "default" }: { value: "ATTENDING" | "ABSENT"; active: boolean; children: React.ReactNode; activeVariant?: "default" | "destructive" }) {
  const { pending, data } = useFormStatus();
  const mine = pending && data?.get("status") === value;
  return (
    <Button
      name="status"
      value={value}
      aria-pressed={active}
      disabled={pending}
      aria-busy={mine || undefined}
      variant={active ? activeVariant : "outline"}
    >
      {mine ? <Loader2 className="animate-spin" aria-hidden /> : active ? <Check aria-hidden /> : value === "ABSENT" ? <X aria-hidden /> : null}
      {children}
    </Button>
  );
}

function Clear() {
  const { pending, data } = useFormStatus();
  return (
    <Button name="status" value="CLEAR" variant="link" size="sm" className="col-span-2" disabled={pending}>
      {pending && data?.get("status") === "CLEAR" && <Loader2 className="animate-spin" aria-hidden />} Clear my RSVP
    </Button>
  );
}

/** Two toggle buttons posting to the existing `rsvp` server action. */
export function RsvpForm({ eventId, status, className }: { eventId: string; status: Status; className?: string }) {
  return (
    <form action={rsvp} className={className ?? "grid grid-cols-2 gap-2"}>
      <input type="hidden" name="eventId" value={eventId} />
      <Choice value="ATTENDING" active={status === "ATTENDING"}>
        {status === "ATTENDING" ? "Attending" : "Attend"}
      </Choice>
      <Choice value="ABSENT" active={status === "ABSENT"} activeVariant="destructive">
        Can&apos;t make it
      </Choice>
      {status && <Clear />}
    </form>
  );
}
