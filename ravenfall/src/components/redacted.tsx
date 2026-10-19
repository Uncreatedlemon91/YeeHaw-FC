import { Lock } from "lucide-react";

const WIDTHS = ["w-11/12", "w-3/4", "w-5/6", "w-2/3", "w-1/2"];

// What a viewer without clearance sees in place of a restricted section.
// The wrapper is one labelled image; the bars are decoration.
export function Redacted({ clearance, lines = 3 }: { clearance: string; lines?: number }) {
  return (
    <div role="img" className="flex flex-col gap-2" aria-label={`Restricted: ${clearance} clearance required`}>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} aria-hidden className={`redacted-bar ${WIDTHS[i % WIDTHS.length]}`} />
      ))}
      <p aria-hidden className="mt-1 flex items-center gap-1.5 text-micro font-semibold uppercase tracking-label text-muted-foreground">
        <Lock className="size-3" /> Restricted · {clearance} clearance
      </p>
    </div>
  );
}

/** A single inline redacted bar, e.g. in place of a value in a row. */
export function RedactedBar({ className, label = "Restricted" }: { className?: string; label?: string }) {
  return <span role="img" aria-label={label} className={`redacted-bar inline-block ${className ?? "w-16"}`} />;
}
