import { cn } from "@/lib/utils";

// narrow: forms, documents and single-column detail pages. wide: tables,
// grids and dashboards (the default). Centred status cards (login, denied,
// not-found) still pass their own max-w-* via className.
const SIZE = { narrow: "max-w-3xl", wide: "max-w-6xl" } as const;

export function Container({
  size = "wide",
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { size?: keyof typeof SIZE }) {
  return <div className={cn("mx-auto w-full px-4 py-8", SIZE[size], className)} {...props} />;
}
