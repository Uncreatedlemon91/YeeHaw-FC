"use client";

import { Check, CircleHelp, Loader2, X } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { rsvp } from "@/app/ops/actions";

import type { RsvpChoice } from "@/lib/rsvp";

type Status = RsvpChoice | null | undefined;

function Choice({ value, active, children, activeVariant = "default" }: { value: RsvpChoice; active: boolean; children: React.ReactNode; activeVariant?: "default" | "destructive" }) {
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
      {mine ? <Loader2 className="animate-spin" aria-hidden /> : active ? <Check aria-hidden /> : value === "ABSENT" ? <X aria-hidden /> : value === "TENTATIVE" ? <CircleHelp aria-hidden /> : null}
      {children}
    </Button>
  );
}

function Clear() {
  const { pending, data } = useFormStatus();
  return (
    <Button name="status" value="CLEAR" variant="link" size="sm" className="col-span-full" disabled={pending}>
      {pending && data?.get("status") === "CLEAR" && <Loader2 className="animate-spin" aria-hidden />} Clear my RSVP
    </Button>
  );
}

/** Yes / Not sure / No toggles posting to the `rsvp` server action (the same three as on Discord). */
export function RsvpForm({ eventId, status, className }: { eventId: string; status: Status; className?: string }) {
  return (
    <form action={rsvp} className={className ?? "grid grid-cols-3 gap-2"}>
      <input type="hidden" name="eventId" value={eventId} />
      <Choice value="ATTENDING" active={status === "ATTENDING"}>
        Yes
      </Choice>
      <Choice value="TENTATIVE" active={status === "TENTATIVE"}>
        Not sure
      </Choice>
      <Choice value="ABSENT" active={status === "ABSENT"} activeVariant="destructive">
        No
      </Choice>
      {status && <Clear />}
    </form>
  );
}
