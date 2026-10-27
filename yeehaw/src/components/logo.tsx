import { cn } from "@/lib/utils";

// A roundel: a ball and the club's initials, in the club's colours rather
// than any real club's badge, so it needs no artwork and scales from the nav
// to the sign-in page. Inline so it needs no asset pipeline.
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7", className)}>
      <circle cx="16" cy="16" r="14" fill="currentColor" opacity=".16" />
      <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 20c4-2 8-2 11 0s7 2 11 0" fill="none" stroke="currentColor" strokeWidth="1.4" opacity=".7" />
      <text x="16" y="15.5" textAnchor="middle" fontSize="8.5" fontWeight="800" fill="currentColor" fontFamily="Inter, Arial, sans-serif">
        YFC
      </text>
    </svg>
  );
}
