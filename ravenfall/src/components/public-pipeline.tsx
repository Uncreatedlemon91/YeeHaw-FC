import { cn } from "@/lib/utils";

export const PIPELINE = [
  { step: "01", title: "Apply", body: "Sign in with Discord and fill out a short questionnaire. No separate account." },
  { step: "02", title: "Review", body: "Recruiters are alerted on Discord and review your application, usually within 48 hours." },
  { step: "03", title: "Enlist", body: "Once approved you get your callsign, roles and a service record. You're a Recruit." },
  { step: "04", title: "Deploy", body: "RSVP to your first op, complete basic training and start earning qualifications." },
];

/** Compact four-step strip for the signed-out apply page. */
export function PipelineStepper({ className }: { className?: string }) {
  return (
    <ol className={cn("grid grid-cols-2 gap-2 text-left sm:grid-cols-4", className)}>
      {PIPELINE.map((p) => (
        <li key={p.step} className="rounded-md border bg-card/60 p-3">
          <div className="font-display text-xl font-bold text-primary/70">{p.step}</div>
          <div className="text-xs font-semibold uppercase tracking-wider">{p.title}</div>
          <p className="mt-1 text-micro text-muted-foreground">{p.body}</p>
        </li>
      ))}
    </ol>
  );
}

/** Progress for a submitted application: Submitted -> Review -> Decision. */
export function ApplicationProgress({ current, outcome }: { current: 0 | 1 | 2; outcome?: "approved" | "denied" }) {
  const steps = ["Submitted", "Review", outcome === "approved" ? "Approved" : outcome === "denied" ? "Not accepted" : "Decision"];
  return (
    <ol className="flex w-full items-center gap-2" aria-label="Application progress">
      {steps.map((s, i) => {
        const done = i < current || (i === current && current === 2);
        const active = i === current;
        return (
          <li key={s} aria-current={active ? "step" : undefined} className="flex flex-1 flex-col gap-1.5">
            <span
              className={cn(
                "h-1 rounded-full",
                done ? (outcome === "denied" && i === 2 ? "bg-destructive-fg" : "bg-success-fg") : active ? "bg-accent" : "bg-border",
              )}
            />
            <span
              className={cn(
                "text-micro font-semibold uppercase tracking-wider",
                active ? "text-foreground" : done ? "text-muted-foreground" : "text-muted-foreground/60",
              )}
            >
              {s}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
