"use client";

import { useActionState } from "react";
import { type ActionState, FormMessage } from "@/components/action-form";
import { cn } from "@/lib/utils";

type Action = (prev: ActionState, data: FormData) => Promise<ActionState>;

// A request form that keeps its outcome on screen. Filing a request makes it
// pending, and the page's re-render would otherwise swap the form for the
// "already pending" note before the result (and any Discord warning) shows.
export function RequestForm({
  action,
  pending,
  pendingNote,
  children,
  className,
}: {
  action: Action;
  pending: boolean;
  pendingNote: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  if (state?.ok) return <FormMessage state={state} />;
  if (pending) return <p className="text-sm text-muted-foreground">{pendingNote}</p>;
  return (
    <form action={formAction} className={cn("flex flex-col gap-4", className)}>
      {children}
      <FormMessage state={state} />
    </form>
  );
}
