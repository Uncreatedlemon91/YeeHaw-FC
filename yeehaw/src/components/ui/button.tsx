import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

// `default` (club red) is THE primary action everywhere: Schedule, Offer,
// Save. `accent` (red as text-colour fill) is for the public sign-in CTA.
// Sizes keep a 40px tap target below `sm` and shrink on desktop.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/85",
        accent: "bg-accent text-accent-foreground hover:bg-accent/85",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/85",
        outline: "border border-input bg-transparent hover:bg-secondary",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/70",
        ghost: "hover:bg-secondary",
        link: "text-accent underline-offset-4 hover:underline normal-case tracking-normal",
      },
      size: {
        default: "h-9 min-h-10 px-4 py-2 sm:min-h-0",
        sm: "h-8 min-h-10 px-3 text-xs sm:min-h-0",
        lg: "h-11 px-6",
        icon: "size-9 min-h-10 min-w-10 sm:min-h-0 sm:min-w-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { buttonVariants };
