import { Lock } from "lucide-react";

// What a viewer without clearance sees in place of a restricted section.
export function Redacted({ clearance, lines = 3 }: { clearance: string; lines?: number }) {
  const widths = ["w-11/12", "w-3/4", "w-5/6", "w-2/3", "w-1/2"];
  return (
    <div className="flex flex-col gap-2" aria-label={`Restricted: ${clearance} clearance required`}>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className={`redacted-bar ${widths[i % widths.length]}`} />
      ))}
      <p className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        <Lock className="size-3" /> Restricted · {clearance} clearance
      </p>
    </div>
  );
}
