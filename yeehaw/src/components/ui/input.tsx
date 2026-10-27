import * as React from "react";
import { cn } from "@/lib/utils";

const field =
  "w-full rounded-md border border-input bg-background/60 px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 aria-[invalid=true]:border-destructive-fg";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(field, "h-9", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(field, "min-h-24", className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(field, "h-9 py-1", className)} {...props} />;
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-xs font-semibold uppercase tracking-wider text-muted-foreground", className)}
      {...props}
    />
  );
}

export function Field({
  label,
  htmlFor,
  help,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  help?: string;
  /** Per-field message (e.g. ActionState.fieldErrors[name]); marks the control invalid. */
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const errorId = htmlFor ? `${htmlFor}-error` : undefined;
  const helpId = htmlFor && help ? `${htmlFor}-help` : undefined;
  // Wire the single control child to its messages without every caller
  // repeating aria-invalid / aria-describedby. Help stays described when an
  // error is showing; any describedby the caller set is preserved.
  let control = children;
  if (React.isValidElement<Record<string, unknown>>(children) && (error || helpId)) {
    const own = children.props["aria-describedby"] as string | undefined;
    const ids = [own, helpId, error ? errorId : undefined].filter(Boolean);
    const unique = Array.from(new Set(ids.join(" ").split(" ").filter(Boolean))).join(" ") || undefined;
    control = React.cloneElement(children, {
      ...(error ? { "aria-invalid": true } : null),
      "aria-describedby": unique,
    });
  }
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {control}
      {help && (
        <p id={helpId} className="text-xs text-muted-foreground">
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-destructive-fg">
          {error}
        </p>
      )}
    </div>
  );
}
