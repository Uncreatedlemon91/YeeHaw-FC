import { cn } from "@/lib/utils";

type Tone = "success" | "info";

// Selected look per tone; the unselected look is shared.
const ON: Record<Tone, string> = {
  success: "peer-checked:border-success/50 peer-checked:bg-success/15 peer-checked:text-success-fg",
  info: "peer-checked:border-info/60 peer-checked:bg-info/10 peer-checked:text-info",
};
const BASE =
  "block cursor-pointer select-none rounded-sm border text-muted-foreground transition-colors hover:text-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "children"> & {
  tone?: Tone;
  /** Classes for the visible chip (sizing, font). */
  chipClassName?: string;
  children: React.ReactNode;
};

function Chip({ type, tone = "success", chipClassName, className, children, ...input }: Props & { type: "radio" | "checkbox" }) {
  return (
    <label className={cn("relative", className)}>
      <input type={type} className="peer sr-only" {...input} />
      <span className={cn(BASE, ON[tone], "px-2 py-1 text-xs", chipClassName)}>{children}</span>
    </label>
  );
}

/** Pill-style radio. `name`/`value`/`defaultChecked` go straight to the input. */
export function ChipRadio(props: Props) {
  return <Chip type="radio" {...props} />;
}

/** Pill-style checkbox. */
export function ChipCheckbox(props: Props) {
  return <Chip type="checkbox" {...props} />;
}
