"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ActionState = { error?: string; ok?: string; warnings?: string[] } | undefined;
type Action = (prev: ActionState, data: FormData) => Promise<ActionState>;

// A form bound to a server action that shows its error / success message
// inline. Actions that succeed usually redirect, so `ok` is for the ones
// that stay on the page.
export function ActionForm({
  action,
  children,
  className,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className={cn("flex flex-col gap-4", className)}>
      {children}
      <FormMessage state={state} />
    </form>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <div className="flex flex-col gap-2 text-sm" role="status">
      {state.error && <p className="rounded border border-destructive/50 bg-destructive/10 px-3 py-2 text-red-300">{state.error}</p>}
      {state.ok && <p className="rounded border border-success/40 bg-success/10 px-3 py-2 text-green-300">{state.ok}</p>}
      {state.warnings?.map((w) => (
        <p key={w} className="rounded border border-accent/40 bg-accent/10 px-3 py-2 text-accent">
          {w}
        </p>
      ))}
    </div>
  );
}

export function SubmitButton({ children, pendingText, ...props }: ButtonProps & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending ? (pendingText ?? "Working…") : children}
    </Button>
  );
}
