"use client";

import { Hand } from "lucide-react";
import { useActionState, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/action-form";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/input";
import { expressInterest } from "@/app/personnel/actions";
import { cn } from "@/lib/utils";

/**
 * "Interested" on a vacant billet: opens a short form that files a billet
 * interest with S1. `squads` are the elements with an open slot for `role`;
 * with more than one the member picks. Squads already in `filed` show as
 * pending instead. Renders a button plus a full-width form, so in a
 * wrapping flex row the form drops onto its own line.
 */
export function InterestButton({
  role,
  squads,
  filed = [],
  className,
  size = "xs",
}: {
  role: string;
  squads: string[];
  filed?: string[];
  className?: string;
  size?: "xs" | "sm";
}) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(expressInterest, undefined);
  const free = squads.filter((s) => !filed.includes(s));
  const id = `interest-${role}-${squads.join("-")}`.replace(/[^a-z0-9-]/gi, "").toLowerCase();

  if (state?.ok) return <div className="basis-full"><FormMessage state={state} /></div>;
  if (!free.length)
    return (
      <span className={cn("flex items-center gap-1 text-xs uppercase tracking-wider text-accent", className)}>
        <Hand className="size-3" aria-hidden /> Interest filed
      </span>
    );

  const trigger =
    size === "xs" ? (
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex items-center gap-1 rounded-sm border border-dashed border-accent/50 px-2 py-0.5 text-xs uppercase tracking-wider text-accent hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <Hand className="size-3" aria-hidden /> Interested
      </button>
    ) : (
      <Button type="button" variant="outline" size="sm" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className={className}>
        <Hand aria-hidden /> Express interest
      </Button>
    );

  return (
    <>
      {trigger}
      {open && (
        <form id={id} action={action} className="flex basis-full flex-col gap-3 rounded-md border bg-background/60 p-3">
          <input type="hidden" name="role" value={role} />
          {free.length === 1 ? (
            <input type="hidden" name="squad" value={free[0]} />
          ) : (
            <Field label="Squad" htmlFor={`${id}-squad`}>
              <Select id={`${id}-squad`} name="squad" required defaultValue={free[0]}>
                {free.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field
            label={`Why ${role}${free.length === 1 ? ` in ${free[0]}` : ""}? (optional)`}
            htmlFor={`${id}-reason`}
            help="Goes to S1. Not qualified yet? Say so: approval selects you for the training."
          >
            <Textarea id={`${id}-reason`} name="reason" maxLength={500} className="min-h-16" />
          </Field>
          <div className="flex gap-2">
            <SubmitButton size="sm" pendingText="Filing…">
              Send to S1
            </SubmitButton>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
          <FormMessage state={state} />
        </form>
      )}
    </>
  );
}
