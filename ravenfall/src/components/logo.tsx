import { cn } from "@/lib/utils";

// A stylised raven-wing chevron. Inline so it needs no asset pipeline.
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7", className)}>
      <path d="M16 2 30 9v8c0 7-6 12-14 13C8 29 2 24 2 17V9z" fill="currentColor" opacity=".18" />
      <path d="M16 2 30 9v8c0 7-6 12-14 13C8 29 2 24 2 17V9z" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 13l8 5 8-5M8 18l8 5 8-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
