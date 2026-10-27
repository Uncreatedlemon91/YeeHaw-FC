import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

// One semantic mapping for the whole app (see status-badge.tsx):
// success = good/done, accent = pending/attention, destructive = bad,
// info = informational, warning = caution, outline = neutral/inactive.
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-micro font-semibold uppercase tracking-wider [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-primary/40 bg-primary/15 text-primary-foreground",
        accent: "border-accent/40 bg-accent/15 text-accent",
        destructive: "border-destructive/50 bg-destructive/15 text-destructive-fg",
        success: "border-success/40 bg-success/15 text-success-fg",
        info: "border-info/40 bg-info/10 text-info",
        warning: "border-warning/40 bg-warning/10 text-warning",
        outline: "border-border text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
