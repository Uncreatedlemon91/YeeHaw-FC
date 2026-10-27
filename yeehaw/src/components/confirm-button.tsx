"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";

/**
 * A submit button that asks first, inline: click once -> "Confirm?" + Cancel
 * appear in its place; click Confirm to submit. Escape or moving focus away
 * cancels. Must sit inside a <form>. `message` is read out as the confirm
 * button's label and shown as its tooltip.
 */
export function ConfirmButton({ message, children, size, variant, ...props }: ButtonProps & { message?: string }) {
  const [asking, setAsking] = useState(false);
  const { pending } = useFormStatus();
  const wasPending = useRef(false);

  // The row often stays mounted after the action; reset once it finishes.
  useEffect(() => {
    if (wasPending.current && !pending) setAsking(false);
    wasPending.current = pending;
  }, [pending]);

  if (!asking && !pending) {
    return (
      <Button type="button" size={size} variant={variant} {...props} onClick={() => setAsking(true)}>
        {children}
      </Button>
    );
  }

  return (
    <span
      role="group"
      aria-label="Confirm action"
      className="inline-flex items-center gap-1"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !pending) setAsking(false);
      }}
      onBlur={(e) => {
        if (!pending && !e.currentTarget.contains(e.relatedTarget)) setAsking(false);
      }}
    >
      <Button
        autoFocus
        type="submit"
        variant="destructive"
        size={size === "icon" ? "sm" : size}
        disabled={pending}
        aria-busy={pending || undefined}
        aria-label={message}
        title={message}
        name={props.name}
        value={props.value}
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {pending ? "Working…" : "Confirm?"}
      </Button>
      <Button type="button" variant="ghost" size={size === "icon" ? "sm" : size} disabled={pending} onClick={() => setAsking(false)}>
        Cancel
      </Button>
    </span>
  );
}
