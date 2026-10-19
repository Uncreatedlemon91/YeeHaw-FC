"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// `fieldErrors` maps input name -> message; pass `fieldErrors?.[name]` to
// <Field error=…>. Actions that don't set it behave exactly as before.
export type ActionState = { error?: string; ok?: string; warnings?: string[]; fieldErrors?: Record<string, string> } | undefined;
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
      {state.error && (
        <p role="alert" className="rounded border border-destructive/50 bg-destructive/10 px-3 py-2 text-destructive-fg">
          {state.error}
        </p>
      )}
      {state.ok && <p className="rounded border border-success/40 bg-success/10 px-3 py-2 text-success-fg">{state.ok}</p>}
      {state.warnings?.map((w) => (
        <p key={w} className="rounded border border-accent/40 bg-accent/10 px-3 py-2 text-accent">
          {w}
        </p>
      ))}
    </div>
  );
}

// Inside a <form>: disables itself and shows a spinner (+ pendingText) while
// the form's action runs.
export function SubmitButton({ children, pendingText, ...props }: ButtonProps & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" {...props} disabled={pending || props.disabled} aria-busy={pending || undefined}>
      {pending ? (
        <>
          <Loader2 className="animate-spin" aria-hidden /> {pendingText ?? "Working…"}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
