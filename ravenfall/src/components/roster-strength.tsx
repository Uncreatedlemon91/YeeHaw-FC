import { cn } from "@/lib/utils";

export type SlotState = "filled" | "loa" | "inactive" | "vacant";
export type Readiness = "GREEN" | "AMBER" | "RED";

export const SLOT_LABEL: Record<SlotState, string> = {
  filled: "Filled",
  loa: "On leave",
  inactive: "Inactive",
  vacant: "Vacant",
};

// Segment look. Each state differs by fill pattern as well as colour:
// solid / hatched / outline-with-dot / empty dashed.
const SEG: Record<SlotState, string> = {
  filled: "bg-success",
  loa: "bg-accent",
  inactive: "bg-foreground/35",
  vacant: "border border-dashed border-foreground/30 bg-transparent",
};

/**
 * Readiness of an element, from its billets:
 *   available = slots held by an ACTIVE member who is not on leave
 *   GREEN  available >= 75% of establishment and at least one member
 *   AMBER  available >= 40%
 *   RED    anything lower (including an empty element)
 */
export function readiness(available: number, cap: number): Readiness {
  if (!cap || !available) return "RED";
  const r = available / cap;
  return r >= 0.75 ? "GREEN" : r >= 0.4 ? "AMBER" : "RED";
}

const STAMP: Record<Readiness, string> = { GREEN: "stamp stamp-ok", AMBER: "stamp stamp-amber", RED: "stamp" };
const WORD: Record<Readiness, string> = { GREEN: "Ready", AMBER: "Degraded", RED: "Understrength" };

export function ReadinessStamp({ level, className }: { level: Readiness; className?: string }) {
  return (
    <span className={cn(STAMP[level], "!px-1.5 !py-0 !text-micro", className)} title={`Readiness ${level}: ${WORD[level]}`}>
      {level} · {WORD[level]}
    </span>
  );
}

/** One segment per slot. `over` extra holders beyond the cap add a "+" marker. */
export function StrengthBar({
  states,
  over = 0,
  label,
  className,
}: {
  states: SlotState[];
  over?: number;
  label: string;
  className?: string;
}) {
  const counts = states.reduce<Record<SlotState, number>>((c, s) => ({ ...c, [s]: c[s] + 1 }), { filled: 0, loa: 0, inactive: 0, vacant: 0 });
  const summary = `${label}: ${(Object.keys(counts) as SlotState[])
    .filter((k) => counts[k])
    .map((k) => `${counts[k]} ${SLOT_LABEL[k].toLowerCase()}`)
    .join(", ")}${over ? `, ${over} over strength` : ""}`;
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <div role="img" aria-label={summary} title={summary} className="flex h-2.5 min-w-0 flex-1 gap-px">
        {states.map((s, i) => (
          <span key={i} className={cn("min-w-[3px] flex-1 rounded-[1px]", SEG[s], s === "loa" && "opacity-90")} />
        ))}
      </div>
      {over > 0 && (
        <span className="typed shrink-0 text-micro font-bold text-destructive-fg" title={`${over} over strength`}>
          +{over}
        </span>
      )}
    </div>
  );
}

export function StrengthLegend({ className }: { className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-micro uppercase tracking-wider text-muted-foreground", className)} aria-label="Legend">
      {(Object.keys(SEG) as SlotState[]).map((s) => (
        <li key={s} className="flex items-center gap-1.5">
          <span className={cn("inline-block h-2.5 w-4 rounded-[1px]", SEG[s])} aria-hidden /> {SLOT_LABEL[s]}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span className="typed font-bold text-destructive-fg" aria-hidden>
          +
        </span>{" "}
        Over strength
      </li>
    </ul>
  );
}
