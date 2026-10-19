"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { FormMessage, SubmitButton, type ActionState } from "@/components/action-form";
import { cn } from "@/lib/utils";

const snapshot = (f: HTMLFormElement | null) =>
  f ? JSON.stringify([...new FormData(f).entries()].map(([k, v]) => [k, String(v)])) : "";

/**
 * Server-action form that tracks whether its fields differ from how they
 * loaded, warns before leaving with unsaved edits, and pins a save bar to the
 * bottom of the viewport. Remount it (key) after a save to reset the baseline.
 */
export function AdminForm({
  action,
  saveLabel,
  children,
  className,
}: {
  action: (prev: ActionState, data: FormData) => Promise<ActionState>;
  saveLabel: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  const base = useRef("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    base.current = snapshot(ref.current);
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Child pickers update hidden inputs after their own render, so compare a frame later.
  const check = () => requestAnimationFrame(() => setDirty(snapshot(ref.current) !== base.current));

  return (
    <form ref={ref} action={formAction} onChange={check} onClick={check} className={cn("flex flex-col gap-6", className)}>
      {children}
      <FormMessage state={state} />
      <div
        className={cn(
          "sticky bottom-0 z-10 -mx-5 flex flex-wrap items-center gap-3 border-t px-5 py-3 backdrop-blur",
          dirty ? "bg-accent/10 border-accent/40" : "bg-card/95",
        )}
      >
        <SubmitButton pendingText="Saving…">{saveLabel}</SubmitButton>
        <span role="status" className={cn("text-xs", dirty ? "font-semibold text-accent" : "text-muted-foreground")}>
          {dirty ? "Unsaved changes" : "No changes"}
        </span>
      </div>
    </form>
  );
}
