"use client";

import { cn } from "@/lib/utils";

// A GET form that re-submits whenever a <select> changes (text search still
// submits on Enter, and the Filter button keeps working without JS).
export function RosterFilterForm({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <form
      role="search"
      aria-label="Filter the roster"
      className={cn(className)}
      onChange={(e) => {
        if ((e.target as HTMLElement).tagName === "SELECT") e.currentTarget.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}
